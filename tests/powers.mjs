import {
  PowerState,
  cellsInArea,
  cellsInCross,
  createEnemyShotDefender,
  executeAirstrike,
  extraShotCapacity,
  scanResult,
  repairOne,
} from '../js/powers.js';
import { Board } from '../js/board.js';
import { Game, PHASE } from '../js/game.js';
import {
  BASE_MODES,
  FLEET,
  GAME_VARIANTS,
  HORIZONTAL,
  createSeededRandom,
} from '../js/constants.js';

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failures += 1;
}

console.log('power-mode helpers');
const state = new PowerState();
check('every ship ability starts with one charge', Object.values(state.abilityCharges).every((n) => n === 1));
check('ability can be consumed exactly once', state.consumeAbility('carrier') && !state.consumeAbility('carrier'));
check('power-up award and consume round trip', state.award('radar') && state.consumePowerup('radar') && !state.consumePowerup('radar'));
check('3x3 corner scan stays in bounds', cellsInArea(0, 0, 1, 10).length === 4);
check('cross at a corner stays in bounds', cellsInCross(0, 0, 10).length === 3);

const board = new Board();
board.place(FLEET[4], 0, 0, HORIZONTAL);
const scan = scanResult(board, 'sonar', 0, 0);
check('scan reports unhit occupied sections', scan.contacts === 2);
check(
  'unclipped scans label their nominal span',
  scanResult(board, 'sonar', 5, 5).label === '3×3 sector' &&
    scanResult(board, 'cruiser-radar', 5, 5).label === '5×5 sector'
);
check(
  'clipped scans label the area actually scanned',
  scanResult(board, 'sonar', 0, 0).label === '4-cell sector' &&
    scanResult(board, 'cruiser-radar', 0, 0).label === '9-cell sector' &&
    scanResult(board, 'cruiser-radar', 9, 9).label === '9-cell sector'
);
board.receiveShot(0, 0);
check('scan excludes hit sections', scanResult(board, 'sonar', 0, 0).contacts === 1);
const repaired = repairOne(board);
check('repair removes one unsunk hit', repaired?.ship.id === 'destroyer' && board.ships[0].hits.length === 0);

const strikeFleet = [
  { id: 'destroyer', name: 'Destroyer', size: 2 },
  { id: 'patrol', name: 'Patrol', size: 1 },
];
const oneShotStrike = new Game({
  mode: BASE_MODES.POWER,
  variant: GAME_VARIANTS.ONE_SHOT,
  boardSize: 4,
  fleet: strikeFleet,
  enemyRng: createSeededRandom('airstrike-enemy'),
});
oneShotStrike.playerBoard.place(strikeFleet[0], 0, 0, HORIZONTAL);
oneShotStrike.playerBoard.place(strikeFleet[1], 3, 3, HORIZONTAL);
oneShotStrike.startBattle();
oneShotStrike.enemyBoard.clear();
oneShotStrike.enemyBoard.place(strikeFleet[0], 1, 1, HORIZONTAL);
oneShotStrike.enemyBoard.place(strikeFleet[1], 3, 3, HORIZONTAL);
const strikeQuota = oneShotStrike.turnShotsRemaining;
const strikeProgress = [];
const strikeOutcomes = executeAirstrike(oneShotStrike, 1, 1, () => {
  strikeProgress.push(oneShotStrike.playerStats.shots);
});
check(
  'One-shot airstrike skips auto-resolved cells without leaking bonus shots',
  strikeOutcomes.length === 4 &&
    oneShotStrike.playerStats.shots === 4 &&
    oneShotStrike.enemyBoard.alreadyShot(1, 2) &&
    oneShotStrike.turnShotsRemaining === strikeQuota &&
    oneShotStrike.phase === PHASE.PLAYER_TURN
);
check(
  'Airstrike reports outcomes as each shot commits',
  JSON.stringify(strikeProgress) === JSON.stringify([1, 2, 3, 4])
);

const capacityGame = (ammo) => {
  const candidate = new Game({
    mode: BASE_MODES.POWER,
    variant: GAME_VARIANTS.LIMITED,
    playerAmmo: ammo,
    rng: createSeededRandom(`capacity-${ammo}`),
  });
  candidate.playerBoard.placeRandomly();
  candidate.startBattle();
  return candidate;
};
check(
  'extra-shot capacity matches Limited-ammo headroom',
  extraShotCapacity(capacityGame(1)) === 0 &&
    extraShotCapacity(capacityGame(2)) === 1 &&
    extraShotCapacity(capacityGame(3)) === 2
);

function fireAtWaterUntilEnemyTurn(game) {
  for (let row = 0; row < game.boardSize && game.phase === PHASE.PLAYER_TURN; row += 1) {
    for (let col = 0; col < game.boardSize && game.phase === PHASE.PLAYER_TURN; col += 1) {
      if (!game.enemyBoard.shipAt(row, col)) game.playerFire(row, col);
    }
  }
}

console.log('pre-commit defenses');
const soloFleet = [{ id: 'submarine', name: 'Submarine', size: 1 }];
const finalSink = new Game({
  mode: BASE_MODES.POWER,
  boardSize: 2,
  fleet: soloFleet,
  aiPersonality: 'easy',
  aiRng: () => 0,
  enemyRng: createSeededRandom('decoy-final'),
});
finalSink.playerBoard.place(soloFleet[0], 0, 0, HORIZONTAL);
finalSink.startBattle();
const finalPowers = new PowerState();
finalPowers.decoyArmed = true;
finalSink.setEnemyShotDefender(createEnemyShotDefender(finalPowers));
fireAtWaterUntilEnemyTurn(finalSink);
const blockedFinal = finalSink.aiFire();
check(
  'decoy prevents a final sink before win state commits',
  blockedFinal.blockedBy === 'decoy' &&
    blockedFinal.result === 'miss' &&
    finalSink.winner === null &&
    finalSink.phase === PHASE.PLAYER_TURN &&
    finalSink.playerBoard.ships[0].hits.length === 0
);
check(
  'blocked shot is released after the volley but remains a historical miss',
  !finalSink.playerBoard.alreadyShot(0, 0) &&
    !finalSink.ai.tried.has('0,0') &&
    blockedFinal.releasedDefensiveCells.some((cell) => cell.row === 0 && cell.col === 0) &&
    finalSink.enemyStats.hits === 0 &&
    finalSink.enemyStats.misses === 1 &&
    blockedFinal.event.result === 'miss' &&
    blockedFinal.event.blockedBy === 'decoy' &&
    blockedFinal.event.winner === null
);
fireAtWaterUntilEnemyTurn(finalSink);
const retargeted = finalSink.aiFire();
check(
  'a previously blocked standard segment can be retargeted and sunk next turn',
  retargeted.row === 0 &&
    retargeted.col === 0 &&
    retargeted.result === 'hit' &&
    retargeted.sunk &&
    finalSink.winner === 'enemy' &&
    finalSink.enemyStats.shots === 2 &&
    finalSink.enemyStats.hits === 1 &&
    finalSink.enemyStats.misses === 1
);

const oneShotFleet = [{ id: 'submarine', name: 'Submarine', size: 2 }];
const oneShot = new Game({
  mode: BASE_MODES.POWER,
  variant: GAME_VARIANTS.ONE_SHOT,
  boardSize: 2,
  fleet: oneShotFleet,
  aiPersonality: 'easy',
  aiRng: () => 0,
  enemyRng: createSeededRandom('decoy-one-shot'),
});
oneShot.playerBoard.place(oneShotFleet[0], 0, 0, HORIZONTAL);
oneShot.startBattle();
const oneShotPowers = new PowerState();
oneShotPowers.decoyArmed = true;
oneShot.setEnemyShotDefender(createEnemyShotDefender(oneShotPowers));
fireAtWaterUntilEnemyTurn(oneShot);
const blockedOneShot = oneShot.aiFire();
check(
  'blocked one-shot affects only its target and leaves other segments targetable',
  blockedOneShot.affectedCells.length === 1 &&
    blockedOneShot.event.affectedCells.length === 1 &&
    oneShot.playerBoard.ships[0].hits.length === 0 &&
    !oneShot.playerBoard.alreadyShot(0, 0) &&
    !oneShot.playerBoard.alreadyShot(0, 1) &&
    !oneShot.ai.tried.has('0,0') &&
    !oneShot.ai.tried.has('0,1')
);

console.log('stealth enemy-turn duration');
const rapidFleet = [{ id: 'submarine', name: 'Submarine', size: 3 }];
const rapid = new Game({
  mode: BASE_MODES.POWER,
  variant: GAME_VARIANTS.RAPID,
  boardSize: 4,
  fleet: rapidFleet,
  aiPersonality: 'easy',
  aiRng: () => 0,
  enemyRng: createSeededRandom('rapid-stealth'),
});
rapid.playerBoard.place(rapidFleet[0], 0, 0, HORIZONTAL);
rapid.startBattle();
const rapidPowers = new PowerState();
rapidPowers.stealthTurns = 2;
rapid.setEnemyShotDefender(createEnemyShotDefender(rapidPowers));
fireAtWaterUntilEnemyTurn(rapid);
const rapidShots = [rapid.aiFire(), rapid.aiFire(), rapid.aiFire()];
check(
  'Rapid stealth blocks every submarine hit in a volley',
  rapidShots.every((outcome) => outcome.blockedBy === 'stealth') &&
    new Set(rapidShots.map((outcome) => `${outcome.row},${outcome.col}`)).size === 3 &&
    rapid.playerBoard.ships[0].hits.length === 0
);
check('Rapid volley consumes one stealth turn, not three', rapidPowers.stealthTurns === 1);
check(
  'Rapid holds blocked cells until volley end, then releases all three',
  rapidShots[0].releasedDefensiveCells.length === 0 &&
    rapidShots[1].releasedDefensiveCells.length === 0 &&
    rapidShots[2].releasedDefensiveCells.length === 3 &&
    rapidShots[2].releasedDefensiveCells.every(
      (cell) => !rapid.playerBoard.alreadyShot(cell.row, cell.col) &&
        !rapid.ai.tried.has(`${cell.row},${cell.col}`)
    )
);

const salvoFleet = [
  { id: 'submarine', name: 'Submarine', size: 2 },
  { id: 'patrol', name: 'Patrol', size: 1 },
];
const salvo = new Game({
  mode: BASE_MODES.POWER,
  variant: GAME_VARIANTS.SALVO,
  boardSize: 4,
  fleet: salvoFleet,
  aiPersonality: 'easy',
  aiRng: () => 0,
  enemyRng: createSeededRandom('salvo-stealth'),
});
salvo.playerBoard.place(salvoFleet[0], 0, 0, HORIZONTAL);
salvo.playerBoard.place(salvoFleet[1], 3, 3, HORIZONTAL);
salvo.startBattle();
const salvoPowers = new PowerState();
salvoPowers.stealthTurns = 2;
salvo.setEnemyShotDefender(createEnemyShotDefender(salvoPowers));
fireAtWaterUntilEnemyTurn(salvo);
const salvoShots = [salvo.aiFire(), salvo.aiFire()];
check(
  'blocked Salvo sink preserves the restored fleet quota',
  salvo.phase === PHASE.PLAYER_TURN &&
    salvo.playerBoard.remainingShips().length === 2 &&
    salvo.turnShotQuota === 2
);
check('Salvo volley consumes one stealth turn', salvoPowers.stealthTurns === 1);
check(
  'Salvo never repeats within the volley and releases defenses afterward',
  new Set(salvoShots.map((outcome) => `${outcome.row},${outcome.col}`)).size === 2 &&
    salvoShots[0].releasedDefensiveCells.length === 0 &&
    salvoShots[1].releasedDefensiveCells.length === 2
);

console.log(failures === 0 ? '\nAll power checks passed.' : `\n${failures} power check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
