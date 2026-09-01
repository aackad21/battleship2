import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  ProfileStore,
  createReplayFrames,
  createSeededRandom,
  dailyKey,
  evaluateAchievements,
  hashSeed,
} from '../js/profile.js';

class TestStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function clock(value = '2026-09-01T12:00:00.000Z') {
  return () => new Date(value);
}

console.log('profile persistence');
const storage = new TestStorage();
const store = new ProfileStore({ storage, key: 'test', now: clock() });
assert.deepEqual(store.getProfile().career, {
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
});
assert.deepEqual(store.setCustomization({ theme: 'storm', unknown: 'ignored' }), {
  theme: 'storm', effect: 'classic', flag: 'none', victory: 'classic',
});
assert.equal(new ProfileStore({ storage, key: 'test' }).getProfile().customization.theme, 'storm');

console.log('achievements + career totals');
const firstUnlocks = store.recordMatch({
  winner: 'player',
  playerStats: { shots: 30, hits: 17, misses: 13 },
  playerShipsLost: 0,
  abilitiesUsed: ['recon', 'sonar'],
  events: [{ type: 'shot', actor: 'player', row: 0, col: 0, result: 'hit' }],
});
assert.deepEqual(firstUnlocks, ['first-win', 'sharpshooter', 'flawless-fleet']);
assert.equal(store.getProfile().career.accuracy, 57);
assert.deepEqual(store.recordMatch({ won: false, shots: 10, hits: 2 }), []);
assert.equal(store.getProfile().career.streak, 0);
store.recordMatch({ won: true, shots: 40, hits: 10 });
store.recordMatch({ won: true, shots: 40, hits: 10 });
assert.deepEqual(store.recordMatch({ won: true, shots: 40, hits: 10 }), ['hot-streak']);
for (let index = 0; index < 5; index += 1) {
  store.recordMatch({ won: false, shots: 20, hits: 5 });
}
assert.ok(store.getProfile().achievements.some(({ id }) => id === 'veteran'));
assert.equal(store.getProfile().career.games, 10);

const arsenal = new ProfileStore({ storage: new TestStorage(), key: 'arsenal', now: clock() });
arsenal.recordMatch({ won: false, abilitiesUsed: ['carrier', 'destroyer'] });
arsenal.recordMatch({ won: false, abilitiesUsed: ['stealth', 'salvo'] });
assert.deepEqual(arsenal.recordMatch({ won: false, events: [{ type: 'ability', ability: 'radar' }] }), ['full-arsenal']);
assert.equal(Object.keys(ACHIEVEMENTS).length, 6);
assert.deepEqual(evaluateAchievements(
  { won: true, shots: 2, hits: 1 },
  { career: { wins: 1 }, achievements: ['first-win'] }
), ['sharpshooter']);

console.log('bounded history + defensive copies');
for (let index = 0; index < 25; index += 1) {
  arsenal.recordMatch({ id: `match-${index}`, won: false });
}
assert.equal(arsenal.getHistory().length, 20);
assert.equal(arsenal.getHistory()[0].id, 'match-24');
assert.equal(arsenal.getHistory()[19].id, 'match-5');
const copy = arsenal.getProfile();
copy.career.games = -1;
assert.notEqual(arsenal.getProfile().career.games, -1);

console.log('daily challenge');
assert.equal(dailyKey('2026-09-01'), '2026-09-01');
assert.equal(store.recordDailyChallenge(32, '2026-09-01').best.shots, 32);
assert.equal(store.recordDailyChallenge({ shots: 35 }, '2026-09-01').best.shots, 32);
assert.equal(store.recordDailyChallenge({ shots: 29 }, '2026-09-01').best.shots, 29);
assert.equal(store.getDailyChallenge('2026-09-01').attempts, 3);
assert.equal(store.recordDailyChallenge({ completed: false }, '2026-09-02').best, null);

console.log('seeded random');
assert.equal(hashSeed('2026-09-01'), hashSeed('2026-09-01'));
const firstRng = createSeededRandom('daily:2026-09-01');
const secondRng = createSeededRandom('daily:2026-09-01');
const firstSequence = Array.from({ length: 10 }, () => firstRng());
const secondSequence = Array.from({ length: 10 }, () => secondRng());
assert.deepEqual(firstSequence, secondSequence);
assert.ok(firstSequence.every((number) => number >= 0 && number < 1));

console.log('replay frames');
const frames = createReplayFrames({
  winner: 'player',
  events: [
    { type: 'ability', actor: 'player', ability: 'radar' },
    { type: 'ability', actor: 'player', ability: 'sonar', row: 1, col: 1 },
    {
      type: 'shot',
      actor: 'player',
      row: 2,
      col: 3,
      result: 'hit',
      sunk: true,
      shipId: 'cruiser',
      affectedCells: [
        { row: 2, col: 3 },
        { row: 2, col: 4 },
        { row: 2, col: 5 },
      ],
    },
    { type: 'shot', actor: 'enemy', row: 4, col: 5, result: 'miss' },
  ],
});
assert.equal(frames.length, 5);
assert.equal(frames[0].enemyShots.length, 0);
assert.equal(frames[1].actions.length, 1);
assert.equal(frames[2].actions.length, 2);
assert.equal(frames[3].enemyShots[0].result, 'hit');
assert.equal(frames[3].enemyShots.length, 3);
assert.deepEqual(
  frames[3].enemyShots.map(({ row, col, result, shipId, eventIndex }) => ({
    row, col, result, shipId, eventIndex,
  })),
  [
    { row: 2, col: 3, result: 'hit', shipId: 'cruiser', eventIndex: 2 },
    { row: 2, col: 4, result: 'hit', shipId: 'cruiser', eventIndex: 2 },
    { row: 2, col: 5, result: 'hit', shipId: 'cruiser', eventIndex: 2 },
  ]
);
assert.equal(frames[4].playerShots[0].result, 'miss');
assert.equal(frames[4].winner, 'player');
assert.equal(frames[3].winner, null);

const areaAttackFrames = createReplayFrames({
  events: [{
    type: 'shot',
    actor: 'player',
    row: 6,
    col: 6,
    result: 'hit',
    affectedCells: [
      { row: 6, col: 6, result: 'hit', shipId: 'destroyer' },
      { row: 6, col: 7, result: 'miss' },
    ],
  }],
});
assert.equal(areaAttackFrames.length, 2);
assert.deepEqual(areaAttackFrames[1].enemyShots.map(({ result }) => result), ['hit', 'miss']);

const repairFrames = createReplayFrames({
  events: [
    { type: 'shot', actor: 'enemy', row: 4, col: 5, result: 'hit', shipId: 'carrier' },
    { type: 'shot', actor: 'enemy', row: 4, col: 6, result: 'miss' },
    {
      type: 'ability',
      actor: 'player',
      ability: 'powerup-repair',
      action: 'repair',
      restoredCells: [{ row: 4, col: 5 }],
    },
  ],
});
assert.equal(repairFrames.length, 4);
assert.deepEqual(
  repairFrames[2].playerShots.map(({ row, col, result }) => ({ row, col, result })),
  [
    { row: 4, col: 5, result: 'hit' },
    { row: 4, col: 6, result: 'miss' },
  ]
);
assert.deepEqual(
  repairFrames[3].playerShots.map(({ row, col, result }) => ({ row, col, result })),
  [{ row: 4, col: 6, result: 'miss' }]
);
assert.equal(repairFrames[3].actions.length, 1);

const defensiveRetryFrames = createReplayFrames({
  events: [
    {
      type: 'shot',
      actor: 'enemy',
      row: 1,
      col: 2,
      result: 'miss',
      blocked: true,
      blockedBy: 'decoy',
      releasedDefensiveCells: [{ row: 1, col: 2, blockedBy: 'decoy' }],
    },
    {
      type: 'shot',
      actor: 'enemy',
      row: 1,
      col: 2,
      result: 'hit',
      shipId: 'carrier',
    },
  ],
});
assert.equal(defensiveRetryFrames.length, 3);
assert.deepEqual(
  defensiveRetryFrames[1].playerShots.map(({ row, col, result }) => ({ row, col, result })),
  [{ row: 1, col: 2, result: 'miss' }]
);
assert.deepEqual(
  defensiveRetryFrames[2].playerShots.map(({ row, col, result, eventIndex }) => ({
    row, col, result, eventIndex,
  })),
  [{ row: 1, col: 2, result: 'hit', eventIndex: 1 }]
);

console.log('memory fallback');
const throwingStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};
const fallback = new ProfileStore({ storage: throwingStorage, key: 'fallback', now: clock() });
fallback.recordMatch({ won: true, shots: 1, hits: 1 });
assert.equal(fallback.getProfile().career.wins, 1);
assert.equal(new ProfileStore({ storage: throwingStorage, key: 'fallback' }).getProfile().career.wins, 1);

console.log('All profile checks passed.');
