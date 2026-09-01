export const BOARD_SIZE = 10;

export const BASE_MODES = Object.freeze({
  CLASSIC: 'classic',
  POWER: 'power',
});

export const GAME_VARIANTS = Object.freeze({
  STANDARD: 'standard',
  SALVO: 'salvo',
  RAPID: 'rapid',
  ONE_SHOT: 'one-shot',
  COMPACT: 'compact',
  ARMADA: 'armada',
  LIMITED: 'limited',
});

// Shorter alias for callers that treat the values as a select-list.
export const VARIANTS = GAME_VARIANTS;

export const AI_PERSONALITIES = Object.freeze({
  EASY: 'easy',
  RANDOM: 'random',
  MEDIUM: 'medium',
  HUNTER: 'hunter',
  HARD: 'hard',
  PROBABILITY: 'probability',
  AGGRESSIVE: 'aggressive',
  DECEPTIVE: 'deceptive',
});

export const FLEET = Object.freeze([
  Object.freeze({ id: 'carrier', name: 'Carrier', size: 5 }),
  Object.freeze({ id: 'battleship', name: 'Battleship', size: 4 }),
  Object.freeze({ id: 'cruiser', name: 'Cruiser', size: 3 }),
  Object.freeze({ id: 'submarine', name: 'Submarine', size: 3 }),
  Object.freeze({ id: 'destroyer', name: 'Destroyer', size: 2 }),
]);

// The patrol boat intentionally reuses the destroyer artwork. Consumers should
// render assetId when it is present and fall back to id for the classic fleet.
export const PATROL_SHIP = Object.freeze({
  id: 'patrol',
  name: 'Patrol Boat',
  size: 2,
  assetId: 'destroyer',
});

export const ARMADA_FLEET = Object.freeze([...FLEET, PATROL_SHIP]);

export const SHIP_ASSET_IDS = Object.freeze({
  patrol: 'destroyer',
});

export const TOTAL_SHIP_CELLS = FLEET.reduce((sum, ship) => sum + ship.size, 0);

export const HORIZONTAL = 'horizontal';
export const VERTICAL = 'vertical';

export const COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, BOARD_SIZE).split('');

/** Small deterministic PRNG suitable for reproducible boards and daily games. */
export function createSeededRandom(seed) {
  const text = String(seed);
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const VARIANT_RULES = Object.freeze({
  [GAME_VARIANTS.STANDARD]: Object.freeze({}),
  [GAME_VARIANTS.SALVO]: Object.freeze({ shotsPerTurn: 'surviving-ships' }),
  [GAME_VARIANTS.RAPID]: Object.freeze({ shotsPerTurn: 3 }),
  [GAME_VARIANTS.ONE_SHOT]: Object.freeze({ oneShotSinks: true }),
  [GAME_VARIANTS.COMPACT]: Object.freeze({ boardSize: 8 }),
  [GAME_VARIANTS.ARMADA]: Object.freeze({ fleet: ARMADA_FLEET }),
  [GAME_VARIANTS.LIMITED]: Object.freeze({ playerAmmo: 32 }),
});

export const VARIANT_CONFIGS = VARIANT_RULES;

function normalizeVariant(variant) {
  if (variant === 'oneShot' || variant === 'one_shot') return GAME_VARIANTS.ONE_SHOT;
  return Object.values(GAME_VARIANTS).includes(variant) ? variant : GAME_VARIANTS.STANDARD;
}

/**
 * Resolve a small public configuration into the complete rule set used by the
 * engine. Explicit overrides are useful for tests and future custom modes.
 */
export function createGameConfig(options = {}) {
  const source = typeof options === 'string' ? { variant: options } : options || {};
  const variant = normalizeVariant(source.variant);
  const variantRules = VARIANT_RULES[variant];
  const mode = Object.values(BASE_MODES).includes(source.mode)
    ? source.mode
    : BASE_MODES.CLASSIC;
  const requestedSize = source.boardSize ?? source.size;
  const boardSize = Number.isInteger(requestedSize)
    ? requestedSize
    : variantRules.boardSize ?? BOARD_SIZE;
  const fleet = source.fleet ?? variantRules.fleet ?? FLEET;

  if (boardSize < 2) throw new RangeError('boardSize must be an integer of at least 2');
  if (!Array.isArray(fleet) || fleet.length === 0) {
    throw new TypeError('fleet must be a non-empty array');
  }
  fleet.forEach((ship) => {
    if (!ship?.id || !ship?.name || !Number.isInteger(ship.size) || ship.size < 1) {
      throw new TypeError('each fleet entry needs an id, name, and positive integer size');
    }
    if (ship.size > boardSize) {
      throw new RangeError(`${ship.name} does not fit on a ${boardSize}x${boardSize} board`);
    }
  });

  const shotsPerTurn = source.shotsPerTurn ?? variantRules.shotsPerTurn ?? 1;
  if (
    shotsPerTurn !== 'surviving-ships' &&
    (!Number.isInteger(shotsPerTurn) || shotsPerTurn < 1)
  ) {
    throw new RangeError('shotsPerTurn must be a positive integer or "surviving-ships"');
  }

  const playerAmmo = source.playerAmmo ?? source.ammo ?? variantRules.playerAmmo ?? null;
  if (playerAmmo !== null && (!Number.isInteger(playerAmmo) || playerAmmo < 1)) {
    throw new RangeError('playerAmmo must be null or a positive integer');
  }

  const rng = typeof source.rng === 'function' ? source.rng : Math.random;
  return {
    mode,
    variant,
    boardSize,
    // Definitions are copied so a caller cannot mutate one game through another.
    fleet: fleet.map((ship) => ({ ...ship })),
    shotsPerTurn,
    oneShotSinks: Boolean(source.oneShotSinks ?? variantRules.oneShotSinks ?? false),
    playerAmmo,
    aiPersonality: source.aiPersonality ?? source.difficulty ?? AI_PERSONALITIES.MEDIUM,
    rng,
    playerRng: typeof source.playerRng === 'function' ? source.playerRng : rng,
    enemyRng: typeof source.enemyRng === 'function' ? source.enemyRng : rng,
    aiRng: typeof source.aiRng === 'function' ? source.aiRng : rng,
  };
}

export const resolveGameConfig = createGameConfig;
