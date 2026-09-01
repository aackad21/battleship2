import { Board, inBounds } from './board.js';
import { createAI } from './ai.js';
import { BASE_MODES, createGameConfig } from './constants.js';

export const PHASE = Object.freeze({
  SETUP: 'setup',
  PLAYER_TURN: 'player-turn',
  AI_TURN: 'ai-turn',
  OVER: 'over',
});

function emptyStats() {
  return { shots: 0, hits: 0, misses: 0, sunk: 0 };
}

export class Game {
  constructor(options = {}) {
    this.config = createGameConfig(options);
    this.listeners = new Set();
    this.enemyShotDefender = null;
    this.reset();
  }

  /** Reset the current rules, or atomically switch to a new configuration. */
  reset(options) {
    if (arguments.length > 0) this.config = createGameConfig(options);
    const boardOptions = {
      size: this.config.boardSize,
      fleet: this.config.fleet,
      oneShotSinks: this.config.oneShotSinks,
    };
    this.phase = PHASE.SETUP;
    this.playerBoard = new Board({ ...boardOptions, rng: this.config.playerRng });
    this.enemyBoard = new Board({ ...boardOptions, rng: this.config.enemyRng });
    this.ai = createAI(this.config.aiPersonality, {
      size: this.config.boardSize,
      fleet: this.config.fleet,
      rng: this.config.aiRng,
    });
    this.playerStats = emptyStats();
    this.enemyStats = emptyStats();
    this.winner = null;
    this.endReason = null;
    this.turnActor = null;
    this.turnNumber = 0;
    this.turnShotQuota = 0;
    this.turnShotsRemaining = 0;
    this.playerAmmoRemaining = this.config.playerAmmo;
    this.shotEvents = [];
    this.abilityEvents = [];
    this.pendingDefensiveCells = new Map();
    return this;
  }

  configure(options = {}) {
    return this.reset(options);
  }

  get mode() {
    return this.config.mode;
  }

  get variant() {
    return this.config.variant;
  }

  get boardSize() {
    return this.config.boardSize;
  }

  get fleet() {
    return this.config.fleet;
  }

  get shotsRemaining() {
    return this.turnShotsRemaining;
  }

  get ammoRemaining() {
    return this.playerAmmoRemaining;
  }

  startBattle(options = {}) {
    if (!this.playerBoard.isComplete(this.config.fleet)) return false;
    const startOptions = typeof options === 'function' ? { enemyRng: options } : options || {};
    const enemyRng =
      typeof startOptions.enemyRng === 'function'
        ? startOptions.enemyRng
        : this.config.enemyRng;
    this.enemyBoard.clear();
    if (!this.enemyBoard.placeRandomly(this.config.fleet, enemyRng)) return false;
    this.playerStats = emptyStats();
    this.enemyStats = emptyStats();
    this.winner = null;
    this.endReason = null;
    this.playerAmmoRemaining = this.config.playerAmmo;
    this.shotEvents = [];
    this.abilityEvents = [];
    this.pendingDefensiveCells = new Map();
    this.turnNumber = 0;
    this._beginTurn('player');
    return true;
  }

  shotQuotaFor(actor) {
    if (this.config.shotsPerTurn !== 'surviving-ships') {
      return this.config.shotsPerTurn;
    }
    const ownBoard = actor === 'player' ? this.playerBoard : this.enemyBoard;
    return ownBoard.remainingShips().length;
  }

  _beginTurn(actor) {
    this.turnActor = actor;
    if (actor === 'player') this.turnNumber += 1;
    this.phase = actor === 'player' ? PHASE.PLAYER_TURN : PHASE.AI_TURN;
    let quota = this.shotQuotaFor(actor);
    if (actor === 'player' && this.playerAmmoRemaining !== null) {
      quota = Math.min(quota, this.playerAmmoRemaining);
    }
    this.turnShotQuota = quota;
    this.turnShotsRemaining = quota;
  }

  _finish(winner, reason) {
    this.phase = PHASE.OVER;
    this.turnActor = null;
    this.turnShotsRemaining = 0;
    this.winner = winner;
    this.endReason = reason;
  }

  _hasOpenTarget(board) {
    return board.shots.size < board.size * board.size;
  }

  canPlayerFire(row, col) {
    return (
      this.phase === PHASE.PLAYER_TURN &&
      this.turnShotsRemaining > 0 &&
      (this.playerAmmoRemaining === null || this.playerAmmoRemaining > 0) &&
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      inBounds(row, col, this.config.boardSize) &&
      !this.enemyBoard.alreadyShot(row, col)
    );
  }

  canAIFire() {
    return (
      this.phase === PHASE.AI_TURN &&
      this.turnShotsRemaining > 0 &&
      this._hasOpenTarget(this.playerBoard)
    );
  }

  playerFire(row, col) {
    if (!this.canPlayerFire(row, col)) return null;
    const phaseBefore = this.phase;
    const shotTurn = this.turnNumber;
    const turnQuota = this.turnShotQuota;
    const outcome = this.enemyBoard.receiveShot(row, col);
    this.turnShotsRemaining -= 1;
    const actorShotsRemaining = this.turnShotsRemaining;
    if (this.playerAmmoRemaining !== null) this.playerAmmoRemaining -= 1;
    this._updateStats(this.playerStats, outcome);

    if (this.enemyBoard.allSunk()) {
      this._finish('player', 'fleet-destroyed');
    } else if (this.playerAmmoRemaining === 0) {
      this._finish('enemy', 'ammo-exhausted');
    } else if (this.turnShotsRemaining === 0 || !this._hasOpenTarget(this.enemyBoard)) {
      this._beginTurn('enemy');
    }

    return this._completeShot('player', row, col, outcome, {
      phaseBefore,
      shotTurn,
      turnQuota,
      actorShotsRemaining,
    });
  }

  aiFire(options = {}) {
    if (!this.canAIFire()) return null;
    const phaseBefore = this.phase;
    const shotTurn = this.turnNumber;
    const turnQuota = this.turnShotQuota;
    const target = this.ai.nextShot();
    if (!target) {
      this._finish('player', 'enemy-no-targets');
      return null;
    }
    const { row, col } = target;
    const defender = this._resolveEnemyShotDefender(options);
    const decision = this._interceptEnemyShot(defender, row, col);
    const blockedBy = this._blockedBy(decision);
    const outcome = blockedBy
      ? this.playerBoard.receiveMiss(row, col, { blocked: true, blockedBy })
      : this.playerBoard.receiveShot(row, col);
    if (blockedBy) {
      this.pendingDefensiveCells.set(Board.key(row, col), { row, col, blockedBy });
    }
    this.ai.registerResult(row, col, outcome);
    this.turnShotsRemaining -= 1;
    const actorShotsRemaining = this.turnShotsRemaining;
    this._updateStats(this.enemyStats, outcome);

    if (this.playerBoard.allSunk()) {
      this._finish('enemy', 'fleet-destroyed');
    } else if (this.turnShotsRemaining === 0 || !this._hasOpenTarget(this.playerBoard)) {
      this._beginTurn('player');
    }

    let releasedDefensiveCells = [];
    if (this.phase !== PHASE.AI_TURN) {
      this._notifyEnemyTurnEnd(defender, {
        game: this,
        turn: shotTurn,
        outcome,
        phaseAfter: this.phase,
      });
      releasedDefensiveCells = this._releaseDefensiveCells();
    }

    const finalOutcome = { ...outcome, releasedDefensiveCells };
    return this._completeShot('enemy', row, col, finalOutcome, {
      phaseBefore,
      shotTurn,
      turnQuota,
      actorShotsRemaining,
    });
  }

  setEnemyShotDefender(defender = null) {
    if (
      defender !== null &&
      typeof defender !== 'function' &&
      typeof defender?.interceptEnemyShot !== 'function'
    ) {
      throw new TypeError('defender must be a function, interceptor object, or null');
    }
    this.enemyShotDefender = defender;
    return this;
  }

  _resolveEnemyShotDefender(options) {
    if (this.config.mode !== BASE_MODES.POWER) return null;
    if (typeof options === 'function' || typeof options?.interceptEnemyShot === 'function') {
      return options;
    }
    return options?.defender ?? this.enemyShotDefender;
  }

  _interceptEnemyShot(defender, row, col) {
    if (!defender) return null;
    const context = {
      game: this,
      row,
      col,
      ship: this.playerBoard.shipAt(row, col) ?? null,
      turn: this.turnNumber,
      turnQuota: this.turnShotQuota,
      shotsRemaining: this.turnShotsRemaining,
    };
    return typeof defender === 'function'
      ? defender(context)
      : defender.interceptEnemyShot(context);
  }

  _blockedBy(decision) {
    if (!decision) return null;
    if (decision === true) return 'defense';
    if (typeof decision === 'string') return decision;
    if (decision.blocked) return decision.blockedBy || 'defense';
    return null;
  }

  _notifyEnemyTurnEnd(defender, context) {
    if (typeof defender?.onEnemyTurnEnd === 'function') defender.onEnemyTurnEnd(context);
  }

  _releaseDefensiveCells() {
    const released = [...this.pendingDefensiveCells.values()].map((cell) => ({ ...cell }));
    released.forEach(({ row, col }) => {
      this.playerBoard.shots.delete(Board.key(row, col));
      this.ai.forget(row, col);
    });
    this.pendingDefensiveCells.clear();
    return released;
  }

  _updateStats(stats, outcome) {
    stats.shots += 1;
    stats[outcome.result === 'hit' ? 'hits' : 'misses'] += 1;
    if (outcome.sunk) stats.sunk += 1;
  }

  _completeShot(actor, row, col, outcome, shotContext) {
    const { phaseBefore, shotTurn, turnQuota, actorShotsRemaining } = shotContext;
    const event = Object.freeze({
      id: this.shotEvents.length + 1,
      type: 'shot',
      actor,
      turn: shotTurn,
      row,
      col,
      result: outcome.result,
      sunk: outcome.sunk,
      shipId: outcome.ship?.id ?? null,
      shipName: outcome.ship?.name ?? null,
      affectedCells: (outcome.affectedCells ?? [{ row, col }]).map((cell) => ({ ...cell })),
      blocked: Boolean(outcome.blocked),
      blockedBy: outcome.blockedBy ?? null,
      releasedDefensiveCells: (outcome.releasedDefensiveCells ?? [])
        .map((cell) => ({ ...cell })),
      phaseBefore,
      phaseAfter: this.phase,
      turnQuota,
      shotsRemaining: actorShotsRemaining,
      nextTurnQuota: this.turnShotQuota,
      nextTurnShotsRemaining: this.turnShotsRemaining,
      ammoRemaining: this.playerAmmoRemaining,
      winner: this.winner,
      endReason: this.endReason,
    });
    this.shotEvents.push(event);
    this._emit(event);
    return { ...outcome, row, col, event };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onShot(listener) {
    return this.subscribe((event) => {
      if (event.type === 'shot') listener(event);
    });
  }

  _emit(event) {
    this.listeners.forEach((listener) => listener(event));
  }

  getShotEvents() {
    return this.shotEvents.map((event) => ({
      ...event,
      affectedCells: event.affectedCells.map((cell) => ({ ...cell })),
    }));
  }

  /** Radar-style square scan. It reports a contact count, not exact ship cells. */
  scanEnemy(row, col, radius = 1) {
    if (
      this.config.mode !== BASE_MODES.POWER ||
      this.phase !== PHASE.PLAYER_TURN ||
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      !Number.isInteger(radius) ||
      radius < 0 ||
      !inBounds(row, col, this.config.boardSize)
    ) {
      return null;
    }
    const cells = [];
    let contacts = 0;
    for (let scanRow = Math.max(0, row - radius); scanRow <= Math.min(this.boardSize - 1, row + radius); scanRow += 1) {
      for (let scanCol = Math.max(0, col - radius); scanCol <= Math.min(this.boardSize - 1, col + radius); scanCol += 1) {
        cells.push({ row: scanRow, col: scanCol });
        if (this.enemyBoard.shipAt(scanRow, scanCol)) contacts += 1;
      }
    }
    return this._recordAbility({
      type: 'scan',
      actor: 'player',
      row,
      col,
      radius,
      contacts,
      cells,
    });
  }

  grantExtraShots(amount = 1, actor = 'player') {
    const actorHasTurn =
      (actor === 'player' && this.phase === PHASE.PLAYER_TURN) ||
      (actor === 'enemy' && this.phase === PHASE.AI_TURN);
    if (
      this.config.mode !== BASE_MODES.POWER ||
      !actorHasTurn ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return null;
    }
    const granted =
      actor === 'player' && this.playerAmmoRemaining !== null
        ? Math.min(amount, this.playerAmmoRemaining - this.turnShotsRemaining)
        : amount;
    if (granted < 1) return null;
    this.turnShotQuota += granted;
    this.turnShotsRemaining += granted;
    return this._recordAbility({
      type: 'extra-shots',
      actor,
      amount: granted,
      shotsRemaining: this.turnShotsRemaining,
    });
  }

  repairPlayerShip(shipId, amount = 1) {
    if (
      this.config.mode !== BASE_MODES.POWER ||
      this.phase !== PHASE.PLAYER_TURN ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return null;
    }
    const ship = this.playerBoard.ships.find((entry) => entry.id === shipId);
    if (!ship || this.playerBoard.isShipSunk(ship)) return null;
    const restoredCells = this.playerBoard.repair(shipId, amount);
    if (restoredCells.length === 0) return null;
    restoredCells.forEach(({ row, col }) => this.ai.forget(row, col));
    return this._recordAbility({
      type: 'repair',
      actor: 'player',
      shipId,
      restoredCells,
    });
  }

  _recordAbility(details) {
    const event = Object.freeze({
      id: this.abilityEvents.length + 1,
      turn: this.turnNumber,
      ...details,
    });
    this.abilityEvents.push(event);
    this._emit(event);
    return event;
  }
}

export function accuracy(stats) {
  if (stats.shots === 0) return 0;
  return Math.round((stats.hits / stats.shots) * 100);
}
