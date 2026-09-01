import { AI_PERSONALITIES, BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL } from './constants.js';
import { cellsFor, inBounds } from './board.js';

const SMALLEST_SHIP = 2;

function normalizedOptions(options = {}) {
  if (typeof options === 'number') return { size: options };
  return options || {};
}

function choose(values, rng) {
  if (values.length === 0) return null;
  const roll = Math.max(0, Math.min(0.9999999999999999, Number(rng()) || 0));
  return values[Math.floor(roll * values.length)];
}

export class BaseAI {
  constructor(options = {}) {
    const config = normalizedOptions(options);
    this.size = config.size ?? config.boardSize ?? BOARD_SIZE;
    this.rng = typeof config.rng === 'function' ? config.rng : Math.random;
    this.fleet = config.fleet ?? FLEET;
    this.reset();
  }

  reset() {
    this.tried = new Set();
    this.results = new Map();
  }

  static key(row, col) {
    return `${row},${col}`;
  }

  key(row, col) {
    return BaseAI.key(row, col);
  }

  openCells() {
    const cells = [];
    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        if (!this.tried.has(this.key(row, col))) cells.push({ row, col });
      }
    }
    return cells;
  }

  reserve(cell) {
    if (!cell) return null;
    this.tried.add(this.key(cell.row, cell.col));
    return cell;
  }

  registerResult(row, col, outcome) {
    const key = this.key(row, col);
    this.tried.add(key);
    this.results.set(key, outcome.result);
    (outcome.affectedCells ?? []).forEach((cell) => {
      const affectedKey = this.key(cell.row, cell.col);
      this.tried.add(affectedKey);
      if (!this.results.has(affectedKey)) this.results.set(affectedKey, outcome.result);
    });
  }

  forget(row, col) {
    const key = this.key(row, col);
    this.tried.delete(key);
    this.results.delete(key);
  }
}

export class RandomAI extends BaseAI {
  nextShot() {
    return this.reserve(choose(this.openCells(), this.rng));
  }
}

/**
 * Hunt/target AI: fires on a parity grid until it hits, then works
 * outward from the hit, locking onto an orientation once it finds one.
 */
export class HuntTargetAI extends BaseAI {
  reset() {
    super.reset();
    this.targets = [];
    this.currentHits = [];
  }

  nextShot() {
    while (this.targets.length > 0) {
      const candidate = this.targets.shift();
      if (!this.tried.has(this.key(candidate.row, candidate.col))) {
        return this.reserve(candidate);
      }
    }
    return this.reserve(this.randomHuntShot());
  }

  randomHuntShot() {
    const open = this.openCells();
    const parityCells = open.filter(({ row, col }) => (row + col) % SMALLEST_SHIP === 0);
    return choose(parityCells.length > 0 ? parityCells : open, this.rng);
  }

  /** @param {{result: string, sunk: boolean}} outcome */
  registerResult(row, col, outcome) {
    super.registerResult(row, col, outcome);
    if (outcome.result !== 'hit') return;

    if (outcome.sunk) {
      this.currentHits = [];
      this.targets = [];
      return;
    }

    if (!this.currentHits.some((hit) => hit.row === row && hit.col === col)) {
      this.currentHits.push({ row, col });
    }
    this.targets = this.buildTargets();
  }

  buildTargets() {
    const hits = this.currentHits;
    const candidates = [];
    const push = (row, col) => {
      if (!inBounds(row, col, this.size)) return;
      if (this.tried.has(this.key(row, col))) return;
      if (candidates.some((cell) => cell.row === row && cell.col === col)) return;
      candidates.push({ row, col });
    };

    if (hits.length >= 2) {
      const sameRow = hits.every((hit) => hit.row === hits[0].row);
      const sameCol = hits.every((hit) => hit.col === hits[0].col);
      if (sameRow) {
        const row = hits[0].row;
        const cols = hits.map((hit) => hit.col);
        push(row, Math.min(...cols) - 1);
        push(row, Math.max(...cols) + 1);
      } else if (sameCol) {
        const col = hits[0].col;
        const rows = hits.map((hit) => hit.row);
        push(Math.min(...rows) - 1, col);
        push(Math.max(...rows) + 1, col);
      }
      if (candidates.length > 0) return candidates;
    }

    hits.forEach(({ row, col }) => {
      push(row - 1, col);
      push(row + 1, col);
      push(row, col - 1);
      push(row, col + 1);
    });
    return candidates;
  }

  forget(row, col) {
    super.forget(row, col);
    this.currentHits = this.currentHits.filter((hit) => hit.row !== row || hit.col !== col);
    this.targets = this.buildTargets();
  }
}

/** Probability-density search over every still-plausible ship placement. */
export class ProbabilityAI extends BaseAI {
  reset() {
    super.reset();
    this.remainingShipSizes = this.fleet.map((ship) => ship.size);
    this.unresolvedHits = new Set();
  }

  registerResult(row, col, outcome) {
    super.registerResult(row, col, outcome);
    const key = this.key(row, col);
    if (outcome.result === 'hit') this.unresolvedHits.add(key);
    if (outcome.sunk) {
      const index = this.remainingShipSizes.indexOf(outcome.ship?.size);
      if (index !== -1) this.remainingShipSizes.splice(index, 1);
      (outcome.ship?.cells ?? [{ row, col }]).forEach((cell) => {
        this.unresolvedHits.delete(this.key(cell.row, cell.col));
      });
    }
  }

  scoreCells() {
    const scores = new Map(this.openCells().map((cell) => [this.key(cell.row, cell.col), 0]));
    const sizes = this.remainingShipSizes.length > 0 ? this.remainingShipSizes : [1];

    sizes.forEach((shipSize) => {
      [HORIZONTAL, VERTICAL].forEach((orientation) => {
        for (let row = 0; row < this.size; row += 1) {
          for (let col = 0; col < this.size; col += 1) {
            const placement = cellsFor(row, col, shipSize, orientation);
            if (!placement.every((cell) => inBounds(cell.row, cell.col, this.size))) continue;
            if (
              placement.some(
                (cell) => this.results.get(this.key(cell.row, cell.col)) === 'miss'
              )
            ) {
              continue;
            }
            const touchesHit = placement.some((cell) =>
              this.unresolvedHits.has(this.key(cell.row, cell.col))
            );
            const weight = touchesHit ? 8 : 1;
            placement.forEach((cell) => {
              const key = this.key(cell.row, cell.col);
              if (scores.has(key)) scores.set(key, scores.get(key) + weight);
            });
          }
        }
      });
    });
    return scores;
  }

  nextShot() {
    const scores = this.scoreCells();
    if (scores.size === 0) return null;
    const bestScore = Math.max(...scores.values());
    const best = [];
    scores.forEach((score, key) => {
      if (score !== bestScore) return;
      const [row, col] = key.split(',').map(Number);
      best.push({ row, col });
    });
    return this.reserve(choose(best, this.rng));
  }

  forget(row, col) {
    super.forget(row, col);
    this.unresolvedHits.delete(this.key(row, col));
  }
}

/** Hunter that favors the dense center lanes before widening its search. */
export class AggressiveAI extends HuntTargetAI {
  randomHuntShot() {
    const open = this.openCells();
    const parity = open.filter(({ row, col }) => (row + col) % SMALLEST_SHIP === 0);
    const pool = parity.length > 0 ? parity : open;
    if (pool.length === 0) return null;
    const midpoint = (this.size - 1) / 2;
    const distance = ({ row, col }) => Math.abs(row - midpoint) + Math.abs(col - midpoint);
    const nearest = Math.min(...pool.map(distance));
    return choose(pool.filter((cell) => distance(cell) === nearest), this.rng);
  }
}

/**
 * Hunter with an intentionally irregular search signature: it alternates
 * perimeter and diagonal pressure before falling back to the parity grid.
 */
export class DeceptiveAI extends HuntTargetAI {
  reset() {
    super.reset();
    this.huntStep = 0;
  }

  randomHuntShot() {
    const open = this.openCells();
    if (open.length === 0) return null;
    this.huntStep += 1;
    const perimeter = open.filter(
      ({ row, col }) => row === 0 || col === 0 || row === this.size - 1 || col === this.size - 1
    );
    const diagonals = open.filter(
      ({ row, col }) => row === col || row + col === this.size - 1
    );
    const preferred = this.huntStep % 2 === 1 ? perimeter : diagonals;
    if (preferred.length > 0) return choose(preferred, this.rng);
    return super.randomHuntShot();
  }
}

export function createAI(personality = AI_PERSONALITIES.MEDIUM, options = {}) {
  let requested = personality;
  let config = options;
  if (personality && typeof personality === 'object') {
    config = personality;
    requested = personality.personality ?? personality.aiPersonality ?? AI_PERSONALITIES.MEDIUM;
  }
  const normalized = String(requested ?? AI_PERSONALITIES.MEDIUM).toLowerCase();

  if (normalized === AI_PERSONALITIES.EASY || normalized === AI_PERSONALITIES.RANDOM) {
    return new RandomAI(config);
  }
  if (normalized === AI_PERSONALITIES.HARD || normalized === AI_PERSONALITIES.PROBABILITY) {
    return new ProbabilityAI(config);
  }
  if (normalized === AI_PERSONALITIES.AGGRESSIVE) return new AggressiveAI(config);
  if (normalized === AI_PERSONALITIES.DECEPTIVE) return new DeceptiveAI(config);
  return new HuntTargetAI(config);
}
