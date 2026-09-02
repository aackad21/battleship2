export const SHIP_ABILITIES = [
  {
    id: 'carrier',
    action: 'recon',
    name: 'Carrier Recon',
    shortName: 'Recon',
    target: 'enemy',
    description: 'Inspect a full row and report how many unhit ship sections remain.',
  },
  {
    id: 'battleship',
    action: 'salvo',
    name: 'Battleship Salvo',
    shortName: 'Salvo',
    target: null,
    description: 'Add two shots to the current turn.',
  },
  {
    id: 'cruiser',
    action: 'cruiser-radar',
    name: 'Cruiser Radar',
    shortName: 'Radar',
    target: 'enemy',
    description: 'Scan a 5×5 area and report the number of contacts.',
  },
  {
    id: 'submarine',
    action: 'stealth',
    name: 'Submarine Stealth',
    shortName: 'Stealth',
    target: null,
    description: 'Protect the submarine from hits for the next two enemy turns.',
  },
  {
    id: 'destroyer',
    action: 'sonar',
    name: 'Destroyer Sonar',
    shortName: 'Sonar',
    target: 'enemy',
    description: 'Scan a 3×3 area and report the number of contacts.',
  },
];

export const POWERUPS = [
  {
    id: 'radar',
    name: 'Radar Scan',
    target: 'enemy',
    description: 'Scan a 3×3 area for unhit ship sections.',
  },
  {
    id: 'airstrike',
    name: 'Airstrike',
    target: 'enemy',
    description: 'Attack the selected cell and its four orthogonal neighbors.',
  },
  {
    id: 'repair',
    name: 'Repair',
    target: null,
    description: 'Repair one damaged section of an unsunk friendly ship.',
  },
  {
    id: 'decoy',
    name: 'Decoy',
    target: null,
    description: 'Convert the next enemy hit into a miss.',
  },
  {
    id: 'extra-shot',
    name: 'Extra Shot',
    target: null,
    description: 'Add one shot to the current turn.',
  },
];

const POWERUP_IDS = POWERUPS.map((powerup) => powerup.id);

export class PowerState {
  constructor() {
    this.reset();
  }

  reset() {
    this.abilityCharges = Object.fromEntries(SHIP_ABILITIES.map((ability) => [ability.id, 1]));
    this.inventory = Object.fromEntries(POWERUP_IDS.map((id) => [id, 0]));
    this.selected = null;
    this.usedAbilities = new Set();
    this.stealthTurns = 0;
    this.decoyArmed = false;
    this.rewardCursor = 0;
    this.awardLog = [];
  }

  select(kind, id) {
    this.selected = { kind, id };
    return this.selected;
  }

  clearSelection() {
    this.selected = null;
  }

  canUseAbility(shipId) {
    return (this.abilityCharges[shipId] || 0) > 0;
  }

  consumeAbility(shipId) {
    if (!this.canUseAbility(shipId)) return false;
    this.abilityCharges[shipId] -= 1;
    this.usedAbilities.add(shipId);
    return true;
  }

  canUsePowerup(id) {
    return (this.inventory[id] || 0) > 0;
  }

  consumePowerup(id) {
    if (!this.canUsePowerup(id)) return false;
    this.inventory[id] -= 1;
    return true;
  }

  award(id, reason = '') {
    if (!POWERUP_IDS.includes(id)) return null;
    this.inventory[id] += 1;
    const reward = { id, reason };
    this.awardLog.push(reward);
    return reward;
  }

  awardNext(reason = 'Enemy ship sunk') {
    const id = POWERUP_IDS[this.rewardCursor % POWERUP_IDS.length];
    this.rewardCursor += 1;
    return this.award(id, reason);
  }

  snapshot() {
    return {
      abilityCharges: { ...this.abilityCharges },
      inventory: { ...this.inventory },
      usedAbilities: [...this.usedAbilities],
      stealthTurns: this.stealthTurns,
      decoyArmed: this.decoyArmed,
    };
  }

  /** Called by Game before an enemy shot is committed. */
  interceptEnemyShot({ ship }) {
    if (!ship) return null;
    if (this.decoyArmed) {
      this.decoyArmed = false;
      return { blocked: true, blockedBy: 'decoy' };
    }
    if (this.stealthTurns > 0 && ship.id === 'submarine') {
      return { blocked: true, blockedBy: 'stealth' };
    }
    return null;
  }

  /** Stealth duration is measured in complete enemy turns, not individual shots. */
  onEnemyTurnEnd() {
    if (this.stealthTurns > 0) this.stealthTurns -= 1;
  }
}

export function createEnemyShotDefender(powerState) {
  if (!(powerState instanceof PowerState)) {
    throw new TypeError('createEnemyShotDefender requires a PowerState');
  }
  return {
    interceptEnemyShot(context) {
      return powerState.interceptEnemyShot(context);
    },
    onEnemyTurnEnd(context) {
      powerState.onEnemyTurnEnd(context);
    },
  };
}

export function cellsInArea(row, col, radius, size) {
  const cells = [];
  for (let r = row - radius; r <= row + radius; r += 1) {
    for (let c = col - radius; c <= col + radius; c += 1) {
      if (r >= 0 && r < size && c >= 0 && c < size) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

export function cellsInCross(row, col, size) {
  return [
    { row, col },
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter((cell) => cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size);
}

export function extraShotCapacity(game) {
  if (game.ammoRemaining === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, game.ammoRemaining - game.turnShotsRemaining);
}

/**
 * Fire a Power-mode airstrike without consuming the player's existing turn
 * quota. Each still-valid target receives and immediately spends one bonus
 * shot, which prevents skipped One-shot cells from leaking unused shots.
 */
export function executeAirstrike(game, row, col, onOutcome = null) {
  const outcomes = [];
  for (const target of cellsInCross(row, col, game.boardSize)) {
    if (!game.canPlayerFire(target.row, target.col)) continue;
    const grant = game.grantExtraShots(1);
    if (!grant) break;
    const outcome = game.playerFire(target.row, target.col);
    if (outcome) {
      outcomes.push(outcome);
      if (typeof onOutcome === 'function') onOutcome(outcome, outcomes.length - 1);
    }
    if (game.phase === 'over') break;
  }
  return outcomes;
}

export function contactCount(board, cells) {
  return cells.reduce((count, cell) => {
    const ship = board.shipAt(cell.row, cell.col);
    if (!ship) return count;
    return board.alreadyShot(cell.row, cell.col) ? count : count + 1;
  }, 0);
}

export function scanResult(board, action, row, col) {
  if (action === 'recon') {
    const cells = Array.from({ length: board.size }, (_, column) => ({ row, col: column }));
    return { cells, contacts: contactCount(board, cells), label: `row ${row + 1}` };
  }
  const radius = action === 'cruiser-radar' ? 2 : 1;
  const cells = cellsInArea(row, col, radius, board.size);
  const span = radius * 2 + 1;
  return {
    cells,
    contacts: contactCount(board, cells),
    label: cells.length === span * span ? `${span}×${span} sector` : `${cells.length}-cell sector`,
  };
}

export function repairOne(board) {
  const candidates = board.ships
    .filter((ship) => ship.hits.length > 0 && !board.isShipSunk(ship))
    .sort((a, b) => b.hits.length - a.hits.length);
  const ship = candidates[0];
  if (!ship) return null;
  const key = ship.hits.pop();
  const [row, col] = key.split(',').map(Number);
  board.shots.delete(key);
  return { ship, row, col, key };
}
