import { BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL } from './constants.js';

export function cellsFor(row, col, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i += 1) {
    cells.push(
      orientation === HORIZONTAL ? { row, col: col + i } : { row: row + i, col }
    );
  }
  return cells;
}

export function inBounds(row, col, size = BOARD_SIZE) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

export class Board {
  constructor(options = {}) {
    const config = typeof options === 'number' ? { size: options } : options || {};
    this.size = config.size ?? config.boardSize ?? BOARD_SIZE;
    if (!Number.isInteger(this.size) || this.size < 2) {
      throw new RangeError('Board size must be an integer of at least 2');
    }
    this.fleet = config.fleet ?? FLEET;
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.oneShotSinks = Boolean(config.oneShotSinks);
    this.ships = [];
    this.shots = new Map(); // key -> 'hit' | 'miss'
  }

  static key(row, col) {
    return `${row},${col}`;
  }

  shipAt(row, col) {
    return this.ships.find((ship) =>
      ship.cells.some((cell) => cell.row === row && cell.col === col)
    );
  }

  canPlace(row, col, size, orientation, ignoreShipId = null) {
    if (orientation !== HORIZONTAL && orientation !== VERTICAL) return false;
    const cells = cellsFor(row, col, size, orientation);
    return cells.every((cell) => {
      if (!inBounds(cell.row, cell.col, this.size)) return false;
      const occupant = this.shipAt(cell.row, cell.col);
      return !occupant || occupant.id === ignoreShipId;
    });
  }

  place(shipDef, row, col, orientation) {
    if (!this.canPlace(row, col, shipDef.size, orientation, shipDef.id)) {
      return false;
    }
    this.remove(shipDef.id);
    this.ships.push({
      id: shipDef.id,
      name: shipDef.name,
      size: shipDef.size,
      ...(shipDef.assetId ? { assetId: shipDef.assetId } : {}),
      row,
      col,
      orientation,
      cells: cellsFor(row, col, shipDef.size, orientation),
      hits: [],
    });
    return true;
  }

  remove(shipId) {
    this.ships = this.ships.filter((ship) => ship.id !== shipId);
  }

  clear() {
    this.ships = [];
    this.shots.clear();
  }

  placeRandomly(fleet = this.fleet, rng = this.rng) {
    this.ships = [];
    const random = typeof rng === 'function' ? rng : this.rng;

    const shuffled = (values) => {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const roll = Math.max(0, Math.min(0.9999999999999999, Number(random()) || 0));
        const swapIndex = Math.floor(roll * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return result;
    };

    const placeNext = (index) => {
      if (index === fleet.length) return true;
      const shipDef = fleet[index];
      const candidates = [];
      [HORIZONTAL, VERTICAL].forEach((orientation) => {
        for (let row = 0; row < this.size; row += 1) {
          for (let col = 0; col < this.size; col += 1) {
            if (this.canPlace(row, col, shipDef.size, orientation)) {
              candidates.push({ row, col, orientation });
            }
          }
        }
      });

      for (const candidate of shuffled(candidates)) {
        this.place(shipDef, candidate.row, candidate.col, candidate.orientation);
        if (placeNext(index + 1)) return true;
        this.remove(shipDef.id);
      }
      return false;
    };

    const placed = placeNext(0);
    if (!placed) this.ships = [];
    return placed;
  }

  isComplete(fleet = this.fleet) {
    return (
      this.ships.length === fleet.length &&
      fleet.every((definition) => this.ships.some((ship) => ship.id === definition.id))
    );
  }

  alreadyShot(row, col) {
    return this.shots.has(Board.key(row, col));
  }

  /**
   * @returns {{result: 'hit'|'miss', ship: object|null, sunk: boolean}}
   */
  receiveShot(row, col, options = {}) {
    const key = Board.key(row, col);
    const repeated = this.shots.has(key);
    const ship = this.shipAt(row, col);
    if (!ship) {
      this.shots.set(key, 'miss');
      return { result: 'miss', ship: null, sunk: false, repeated, affectedCells: [{ row, col }] };
    }

    const wasSunk = this.isShipSunk(ship);
    this.shots.set(key, 'hit');
    if (!ship.hits.includes(key)) ship.hits.push(key);
    const oneShotSinks = options.oneShotSinks ?? this.oneShotSinks;
    const affectedCells = oneShotSinks
      ? ship.cells.map((cell) => ({ ...cell }))
      : [{ row, col }];

    if (oneShotSinks && !wasSunk) {
      ship.cells.forEach((cell) => {
        const cellKey = Board.key(cell.row, cell.col);
        this.shots.set(cellKey, 'hit');
        if (!ship.hits.includes(cellKey)) ship.hits.push(cellKey);
      });
    }
    const sunk = ship.hits.length === ship.size;
    return { result: 'hit', ship, sunk, repeated, affectedCells };
  }

  /**
   * Record a miss even when a ship occupies the coordinate. Defensive powers
   * use this before damage is applied, so no hit state ever needs rolling back.
   */
  receiveMiss(row, col, details = {}) {
    const key = Board.key(row, col);
    const repeated = this.shots.has(key);
    this.shots.set(key, 'miss');
    return {
      result: 'miss',
      ship: null,
      sunk: false,
      repeated,
      affectedCells: [{ row, col }],
      blocked: Boolean(details.blocked),
      blockedBy: details.blockedBy ?? null,
    };
  }

  isShipSunk(ship) {
    return ship.hits.length === ship.size;
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => this.isShipSunk(ship));
  }

  remainingShips() {
    return this.ships.filter((ship) => !this.isShipSunk(ship));
  }

  /** Restore up to `amount` damaged segments and make those cells targetable. */
  repair(shipId, amount = 1) {
    const ship = this.ships.find((entry) => entry.id === shipId);
    if (!ship || !Number.isInteger(amount) || amount < 1 || ship.hits.length === 0) return [];
    const restored = ship.hits.splice(Math.max(0, ship.hits.length - amount), amount);
    restored.forEach((key) => this.shots.delete(key));
    return restored.map((key) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });
  }
}
