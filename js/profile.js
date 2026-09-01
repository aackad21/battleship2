const PROFILE_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'battleship.profile';
const MAX_HISTORY = 20;

const DEFAULT_CUSTOMIZATION = Object.freeze({
  theme: 'classic',
  effect: 'classic',
  flag: 'none',
  victory: 'classic',
});

const ABILITY_ALIASES = Object.freeze({
  carrier: 'carrier',
  recon: 'carrier',
  'carrier-recon': 'carrier',
  destroyer: 'destroyer',
  sonar: 'destroyer',
  'destroyer-sonar': 'destroyer',
  submarine: 'submarine',
  stealth: 'submarine',
  'submarine-stealth': 'submarine',
  battleship: 'battleship',
  salvo: 'battleship',
  'battleship-salvo': 'battleship',
  cruiser: 'cruiser',
  radar: 'cruiser',
  'cruiser-radar': 'cruiser',
});

const REQUIRED_ABILITIES = Object.freeze([
  'carrier',
  'destroyer',
  'submarine',
  'battleship',
  'cruiser',
]);

export const ACHIEVEMENTS = Object.freeze({
  'first-win': Object.freeze({
    id: 'first-win',
    title: 'First Victory',
    description: 'Win your first match.',
  }),
  sharpshooter: Object.freeze({
    id: 'sharpshooter',
    title: 'Sharpshooter',
    description: 'Win a match with at least 50% accuracy.',
  }),
  'flawless-fleet': Object.freeze({
    id: 'flawless-fleet',
    title: 'Flawless Fleet',
    description: 'Win without losing a ship.',
  }),
  'hot-streak': Object.freeze({
    id: 'hot-streak',
    title: 'Hot Streak',
    description: 'Win three matches in a row.',
  }),
  veteran: Object.freeze({
    id: 'veteran',
    title: 'Veteran Commander',
    description: 'Complete 10 matches.',
  }),
  'full-arsenal': Object.freeze({
    id: 'full-arsenal',
    title: 'Full Arsenal',
    description: 'Use every ship ability.',
  }),
});

const MEMORY_VALUES = new Map();
const MEMORY_STORAGE = {
  getItem(key) {
    return MEMORY_VALUES.has(key) ? MEMORY_VALUES.get(key) : null;
  },
  setItem(key, value) {
    MEMORY_VALUES.set(key, String(value));
  },
  removeItem(key) {
    MEMORY_VALUES.delete(key);
  },
};

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function integerNonNegative(value, fallback = 0) {
  return Math.floor(finiteNonNegative(value, fallback));
}

function jsonClone(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function safeDate(value, fallback = new Date()) {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(result.getTime()) ? fallback : result;
}

function isoTimestamp(value, fallback = new Date()) {
  return safeDate(value, fallback).toISOString();
}

function localStorageOrFallback() {
  try {
    const storage = globalThis.localStorage;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
  } catch {
    // localStorage can throw in privacy-restricted or sandboxed browser contexts.
  }
  return MEMORY_STORAGE;
}

function normalizeAbility(value) {
  if (value && typeof value === 'object') {
    return normalizeAbility(value.shipId ?? value.ship ?? value.abilityId ?? value.ability);
  }
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[_\s]+/g, '-');
  return ABILITY_ALIASES[key] ?? null;
}

function abilitiesFromSummary(summary = {}) {
  const candidates = [
    ...(Array.isArray(summary.abilitiesUsed) ? summary.abilitiesUsed : []),
    ...(Array.isArray(summary.shipAbilitiesUsed) ? summary.shipAbilitiesUsed : []),
  ];
  const events = Array.isArray(summary.events)
    ? summary.events
    : Array.isArray(summary.replay?.events)
      ? summary.replay.events
      : [];
  events.forEach((event) => {
    if (event?.type === 'ability' || event?.action === 'ability') candidates.push(event);
  });
  return [...new Set(candidates.map(normalizeAbility).filter(Boolean))];
}

function unlockedIds(profile = {}) {
  const achievements = profile.achievements;
  if (Array.isArray(achievements)) {
    return new Set(
      achievements
        .map((item) => (typeof item === 'string' ? item : item?.id))
        .filter((id) => typeof id === 'string')
    );
  }
  if (achievements && typeof achievements === 'object') {
    return new Set(Object.keys(achievements).filter((id) => achievements[id]));
  }
  return new Set();
}

function playerWon(summary = {}) {
  if (typeof summary.won === 'boolean') return summary.won;
  const winner = String(summary.winner ?? '').toLowerCase();
  return winner === 'player' || winner === 'human' || winner === 'you';
}

function matchStats(summary = {}) {
  const source = summary.playerStats ?? summary.stats ?? summary;
  const shots = integerNonNegative(source.shots ?? source.totalShots);
  const hits = Math.min(shots, integerNonNegative(source.hits ?? source.totalHits));
  const suppliedMisses = source.misses ?? source.totalMisses;
  const misses = suppliedMisses == null
    ? Math.max(0, shots - hits)
    : integerNonNegative(suppliedMisses);
  return { shots, hits, misses };
}

function shipsLost(summary = {}) {
  if (Array.isArray(summary.playerShipsLost)) return summary.playerShipsLost.length;
  if (Array.isArray(summary.shipsLost)) return summary.shipsLost.length;
  if (Array.isArray(summary.lostShips)) return summary.lostShips.length;
  if (summary.playerShipsLost != null) return integerNonNegative(summary.playerShipsLost);
  if (summary.shipsLost != null && !Array.isArray(summary.shipsLost)) {
    return integerNonNegative(summary.shipsLost);
  }
  if (summary.playerShipsRemaining != null) {
    return Math.max(0, 5 - integerNonNegative(summary.playerShipsRemaining));
  }
  return null;
}

function normalizeAchievementList(value) {
  const seen = new Set();
  const items = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (!ACHIEVEMENTS[id] || seen.has(id)) return;
      seen.add(id);
      items.push({
        id,
        unlockedAt: typeof entry === 'object' && entry?.unlockedAt
          ? isoTimestamp(entry.unlockedAt)
          : null,
      });
    });
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([id, unlockedAt]) => {
      if (!ACHIEVEMENTS[id] || !unlockedAt || seen.has(id)) return;
      seen.add(id);
      items.push({ id, unlockedAt: isoTimestamp(unlockedAt) });
    });
  }
  return items;
}

function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    career: {
      games: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0,
      shots: 0,
      hits: 0,
      misses: 0,
      accuracy: 0,
      abilitiesUsed: [],
    },
    history: [],
    achievements: [],
    customization: { ...DEFAULT_CUSTOMIZATION },
    dailyChallenges: {},
  };
}

function normalizeProfile(value) {
  const defaults = defaultProfile();
  if (!value || typeof value !== 'object') return defaults;

  const sourceCareer = value.career && typeof value.career === 'object' ? value.career : value;
  const shots = integerNonNegative(sourceCareer.shots ?? sourceCareer.totalShots);
  const hits = Math.min(shots, integerNonNegative(sourceCareer.hits ?? sourceCareer.totalHits));
  const misses = sourceCareer.misses == null
    ? Math.max(0, shots - hits)
    : integerNonNegative(sourceCareer.misses);
  const abilities = Array.isArray(sourceCareer.abilitiesUsed)
    ? sourceCareer.abilitiesUsed.map(normalizeAbility).filter(Boolean)
    : [];

  const history = Array.isArray(value.history)
    ? value.history.slice(0, MAX_HISTORY).map((match) => jsonClone(match)).filter(Boolean)
    : [];
  const customization = value.customization && typeof value.customization === 'object'
    ? value.customization
    : {};
  const dailyChallenges = value.dailyChallenges && typeof value.dailyChallenges === 'object'
    ? jsonClone(value.dailyChallenges, {})
    : {};

  return {
    version: PROFILE_VERSION,
    career: {
      games: integerNonNegative(sourceCareer.games),
      wins: integerNonNegative(sourceCareer.wins),
      losses: integerNonNegative(sourceCareer.losses),
      streak: integerNonNegative(sourceCareer.streak),
      bestStreak: integerNonNegative(sourceCareer.bestStreak),
      shots,
      hits,
      misses,
      accuracy: shots === 0 ? 0 : Math.round((hits / shots) * 100),
      abilitiesUsed: [...new Set(abilities)],
    },
    history,
    achievements: normalizeAchievementList(value.achievements),
    customization: {
      theme: String(customization.theme ?? defaults.customization.theme),
      effect: String(customization.effect ?? defaults.customization.effect),
      flag: String(customization.flag ?? defaults.customization.flag),
      victory: String(customization.victory ?? defaults.customization.victory),
    },
    dailyChallenges,
  };
}

/** Return a YYYY-MM-DD key in the user's local calendar (not UTC). */
export function dailyKey(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError('dailyKey requires a valid date');
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** FNV-1a: turn any serializable seed into a stable unsigned 32-bit integer. */
export function hashSeed(seed) {
  const text = typeof seed === 'string' ? seed : JSON.stringify(seed) ?? String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Return a deterministic PRNG compatible with Math.random's [0, 1) contract. */
export function createSeededRandom(seed) {
  let state = hashSeed(seed);
  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Evaluate a completed match against an already-updated profile. The return value
 * contains only achievement IDs not present in currentProfile. This function has
 * no side effects.
 */
export function evaluateAchievements(summary = {}, currentProfile = {}) {
  const unlocked = unlockedIds(currentProfile);
  const career = currentProfile.career ?? {};
  const stats = matchStats(summary);
  const won = playerWon(summary);
  const abilitySet = new Set([
    ...(Array.isArray(career.abilitiesUsed) ? career.abilitiesUsed : []),
    ...abilitiesFromSummary(summary),
  ].map(normalizeAbility).filter(Boolean));
  const candidates = [];

  if (finiteNonNegative(career.wins) >= 1 || won) candidates.push('first-win');
  if (won && stats.shots > 0 && stats.hits / stats.shots >= 0.5) candidates.push('sharpshooter');
  if (won && shipsLost(summary) === 0) candidates.push('flawless-fleet');
  if (finiteNonNegative(career.streak) >= 3) candidates.push('hot-streak');
  if (finiteNonNegative(career.games) >= 10) candidates.push('veteran');
  if (REQUIRED_ABILITIES.every((ability) => abilitySet.has(ability))) {
    candidates.push('full-arsenal');
  }

  return candidates.filter((id) => !unlocked.has(id));
}

function replayEvents(match = {}) {
  if (Array.isArray(match.events)) return match.events;
  if (Array.isArray(match.replay)) return match.replay;
  if (Array.isArray(match.replay?.events)) return match.replay.events;
  if (Array.isArray(match.actions)) return match.actions;
  return [];
}

function boardTarget(event) {
  const explicit = String(event.target ?? event.board ?? '').toLowerCase();
  if (explicit === 'player' || explicit === 'enemy') return explicit;
  const actor = String(event.actor ?? event.by ?? event.player ?? '').toLowerCase();
  return actor === 'player' || actor === 'human' || actor === 'you' ? 'enemy' : 'player';
}

function replayFrame(index, event, state, match, totalEvents) {
  const playerShots = jsonClone(state.playerShots, []);
  const enemyShots = jsonClone(state.enemyShots, []);
  const actions = jsonClone(state.actions, []);
  const complete = index === totalEvents;
  return {
    index,
    event: event ? jsonClone(event) : null,
    playerShots,
    enemyShots,
    actions,
    boards: {
      player: { shots: playerShots },
      enemy: { shots: enemyShots },
    },
    complete,
    winner: complete ? (match.winner ?? (match.won === true ? 'player' : match.won === false ? 'enemy' : null)) : null,
  };
}

/**
 * Build immutable snapshots for replay controls. Frame 0 is the untouched board;
 * every subsequent frame reflects one recorded shot/action event.
 */
export function createReplayFrames(match = {}) {
  const events = replayEvents(match).map((event) => jsonClone(event)).filter(Boolean);
  const state = { playerShots: [], enemyShots: [], actions: [] };
  const frames = [replayFrame(0, null, state, match, events.length)];

  events.forEach((event, eventIndex) => {
    const type = String(event.type ?? event.action ?? '').toLowerCase();
    const isShot = type === 'shot' || type === 'fire' ||
      (!type && event.row != null && event.col != null);
    if (isShot) {
      const recordedCells = Array.isArray(event.affectedCells)
        ? event.affectedCells.filter((cell) => cell?.row != null && cell?.col != null)
        : [];
      const affectedCells = recordedCells.length > 0
        ? recordedCells
        : [{ row: event.row, col: event.col }];
      const targetShots = boardTarget(event) === 'enemy' ? state.enemyShots : state.playerShots;
      affectedCells.forEach((cell) => {
        const shot = {
          row: integerNonNegative(cell.row),
          col: integerNonNegative(cell.col),
          result: cell.result ??
            (cell.hit === true ? 'hit' : cell.hit === false ? 'miss' : null) ??
            event.result ??
            (event.hit === true ? 'hit' : event.hit === false ? 'miss' : null),
          sunk: Boolean(cell.sunk ?? event.sunk),
          shipId: cell.shipId ?? cell.ship ?? event.shipId ?? event.ship ?? null,
          actor: event.actor ?? event.by ?? null,
          eventIndex,
        };
        const existingIndex = targetShots.findIndex(
          (existing) => existing.row === shot.row && existing.col === shot.col
        );
        if (existingIndex === -1) targetShots.push(shot);
        else targetShots[existingIndex] = shot;
      });
    } else {
      const actionNames = [type, event.action, event.ability, event.powerup, event.powerupId]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase());
      const isRepair = actionNames.some((value) => value === 'repair' || value.endsWith('-repair'));
      if (isRepair && Array.isArray(event.restoredCells)) {
        const restoredKeys = new Set(
          event.restoredCells
            .filter((cell) => cell?.row != null && cell?.col != null)
            .map((cell) => `${integerNonNegative(cell.row)},${integerNonNegative(cell.col)}`)
        );
        state.playerShots = state.playerShots.filter(
          (shot) => !restoredKeys.has(`${shot.row},${shot.col}`)
        );
      }
      state.actions.push({ ...event, eventIndex });
    }
    frames.push(replayFrame(eventIndex + 1, event, state, match, events.length));
  });

  return frames;
}

export class ProfileStore {
  constructor(options = {}) {
    if (options && typeof options.getItem === 'function') options = { storage: options };
    this.key = String(options.key ?? DEFAULT_STORAGE_KEY);
    this.storage = options.storage ?? localStorageOrFallback();
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
    this.sequence = 0;
    this.profile = this.#load();
  }

  #load() {
    let raw = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      this.storage = MEMORY_STORAGE;
      raw = this.storage.getItem(this.key);
    }
    if (!raw) return defaultProfile();
    try {
      return normalizeProfile(JSON.parse(raw));
    } catch {
      return defaultProfile();
    }
  }

  #save() {
    const serialized = JSON.stringify(this.profile);
    try {
      this.storage.setItem(this.key, serialized);
    } catch {
      this.storage = MEMORY_STORAGE;
      this.storage.setItem(this.key, serialized);
    }
  }

  getProfile() {
    return jsonClone(this.profile);
  }

  getHistory() {
    return jsonClone(this.profile.history, []);
  }

  getMatch(id) {
    const match = this.profile.history.find((entry) => entry.id === id);
    return match ? jsonClone(match) : null;
  }

  /**
   * Record a completed match and return newly unlocked achievement IDs.
   * Supported summary fields include winner/won, mode, playerStats or flat
   * shots/hits/misses, playerShipsLost, abilitiesUsed, and events/replay.events.
   */
  recordMatch(summary = {}) {
    const safeSummary = jsonClone(summary, {});
    const stats = matchStats(safeSummary);
    const won = playerWon(safeSummary);
    const now = safeDate(this.now());
    const timestamp = isoTimestamp(safeSummary.endedAt ?? safeSummary.timestamp, now);
    const winner = safeSummary.winner ?? (won ? 'player' : 'enemy');
    const events = replayEvents(safeSummary).map((event) => jsonClone(event)).filter(Boolean);
    const abilities = abilitiesFromSummary({ ...safeSummary, events });
    const id = String(safeSummary.id ?? `${now.getTime()}-${this.sequence++}`);
    const lost = shipsLost(safeSummary);
    const match = {
      ...safeSummary,
      id,
      timestamp,
      mode: String(safeSummary.mode ?? 'classic'),
      winner,
      won,
      playerStats: stats,
      playerShipsLost: lost,
      abilitiesUsed: abilities,
      events,
    };

    const career = this.profile.career;
    career.games += 1;
    if (won) {
      career.wins += 1;
      career.streak += 1;
      career.bestStreak = Math.max(career.bestStreak, career.streak);
    } else {
      career.losses += 1;
      career.streak = 0;
    }
    career.shots += stats.shots;
    career.hits += stats.hits;
    career.misses += stats.misses;
    career.accuracy = career.shots === 0 ? 0 : Math.round((career.hits / career.shots) * 100);
    career.abilitiesUsed = [...new Set([...career.abilitiesUsed, ...abilities])];

    this.profile.history.unshift(match);
    this.profile.history = this.profile.history.slice(0, MAX_HISTORY);

    const newlyUnlocked = evaluateAchievements(match, this.profile);
    newlyUnlocked.forEach((achievementId) => {
      this.profile.achievements.push({ id: achievementId, unlockedAt: timestamp });
    });
    this.#save();
    return newlyUnlocked;
  }

  setCustomization(patch = {}) {
    const allowed = ['theme', 'effect', 'flag', 'victory'];
    allowed.forEach((key) => {
      if (patch[key] != null) this.profile.customization[key] = String(patch[key]);
    });
    this.#save();
    return jsonClone(this.profile.customization);
  }

  /** Keep the lowest completed shot count for each local calendar day. */
  recordDailyChallenge(result, date = this.now()) {
    const input = typeof result === 'number' ? { shots: result } : jsonClone(result, {});
    const key = dailyKey(date);
    const previous = this.profile.dailyChallenges[key];
    const attempts = integerNonNegative(previous?.attempts) + 1;
    const rawShots = Number(input.shots ?? input.score);
    const completed = input.completed !== false && Number.isFinite(rawShots) && rawShots >= 0;
    const shots = completed ? Math.floor(rawShots) : null;
    const isBest = completed && (!previous?.best || shots < previous.best.shots);
    const timestamp = isoTimestamp(input.timestamp, safeDate(this.now()));
    const best = isBest
      ? { ...input, shots, timestamp }
      : previous?.best ?? null;
    const record = { attempts, best };
    this.profile.dailyChallenges[key] = record;
    this.#save();
    return jsonClone(record);
  }

  getDailyChallenge(date = this.now()) {
    return jsonClone(this.profile.dailyChallenges[dailyKey(date)], { attempts: 0, best: null });
  }

  clear() {
    this.profile = defaultProfile();
    try {
      this.storage.removeItem(this.key);
    } catch {
      this.storage = MEMORY_STORAGE;
      this.storage.removeItem(this.key);
    }
    return this.getProfile();
  }
}

export { PROFILE_VERSION };
