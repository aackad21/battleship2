/**
 * Headless rules + AI checks (no DOM needed): node tests/simulate.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Board } from '../js/board.js';
import {
  AggressiveAI,
  DeceptiveAI,
  HuntTargetAI,
  ProbabilityAI,
  RandomAI,
  createAI,
} from '../js/ai.js';
import { Game, PHASE } from '../js/game.js';
import {
  AI_PERSONALITIES,
  ARMADA_FLEET,
  BASE_MODES,
  BOARD_SIZE,
  FLEET,
  GAME_VARIANTS,
  HORIZONTAL,
  TOTAL_SHIP_CELLS,
  VERTICAL,
  createGameConfig,
  createSeededRandom,
} from '../js/constants.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const readRepoFile = (relative) => readFileSync(repoRoot + relative, 'utf8');

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

const boardSignature = (board) =>
  board.ships
    .map((ship) => `${ship.id}:${ship.row},${ship.col},${ship.orientation}`)
    .join('|');

function openWater(board) {
  const cells = [];
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      if (!board.shipAt(row, col) && !board.alreadyShot(row, col)) cells.push({ row, col });
    }
  }
  return cells;
}

function placementRules() {
  console.log('placement rules');
  const board = new Board();
  const carrier = FLEET[0];
  const destroyer = FLEET[4];

  check('places a ship in bounds', board.place(carrier, 0, 0, HORIZONTAL));
  check('rejects out-of-bounds placement', !board.canPlace(0, 7, carrier.size, HORIZONTAL));
  check('rejects overlapping placement', !board.canPlace(0, 3, destroyer.size, HORIZONTAL));
  check('allows ships to touch', board.place(destroyer, 1, 0, HORIZONTAL));
  check('rejects a rotation that would overlap', !board.place(carrier, 0, 0, VERTICAL));
  check(
    'rotating in place keeps a single instance',
    board.place(carrier, 0, 5, HORIZONTAL) &&
      board.place(carrier, 0, 5, VERTICAL) &&
      board.ships.filter((ship) => ship.id === carrier.id).length === 1
  );

  board.placeRandomly(FLEET);
  const occupied = new Set();
  board.ships.forEach((ship) =>
    ship.cells.forEach((cell) => occupied.add(`${cell.row},${cell.col}`))
  );
  check('random fleet occupies exactly 17 distinct cells', occupied.size === TOTAL_SHIP_CELLS);
}

function boundaryRules() {
  console.log('boundaries');
  const carrier = FLEET[0];
  const last = BOARD_SIZE - 1;

  const corners = new Board();
  check(
    'accepts placements flush against every edge',
    corners.canPlace(0, 0, carrier.size, HORIZONTAL) &&
      corners.canPlace(0, BOARD_SIZE - carrier.size, carrier.size, HORIZONTAL) &&
      corners.canPlace(last, 0, carrier.size, HORIZONTAL) &&
      corners.canPlace(0, last, carrier.size, VERTICAL) &&
      corners.canPlace(BOARD_SIZE - carrier.size, last, carrier.size, VERTICAL)
  );
  check(
    'rejects overflow past each of the four edges',
    !corners.canPlace(0, BOARD_SIZE - carrier.size + 1, carrier.size, HORIZONTAL) &&
      !corners.canPlace(BOARD_SIZE - carrier.size + 1, 0, carrier.size, VERTICAL) &&
      !corners.canPlace(0, -1, carrier.size, HORIZONTAL) &&
      !corners.canPlace(-1, 0, carrier.size, VERTICAL)
  );

  // rotating at an edge where the ship would overflow must leave it untouched
  const edge = new Board();
  edge.place(carrier, last, 0, HORIZONTAL);
  const before = JSON.stringify(edge.ships);
  check('rejects a rotation that would overflow the board', !edge.place(carrier, last, 0, VERTICAL));
  check('ship survives a rejected rotation unchanged', JSON.stringify(edge.ships) === before);

  const board = new Board();
  board.placeRandomly(FLEET);
  check(
    'random fleet never leaves the board',
    board.ships.every((ship) =>
      ship.cells.every(
        (cell) =>
          cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE
      )
    )
  );
}

function shotResolution() {
  console.log('shot resolution');
  const board = new Board();
  const destroyer = FLEET[4];
  board.place(destroyer, 4, 4, HORIZONTAL);

  check('miss on empty water', board.receiveShot(0, 0).result === 'miss');
  const first = board.receiveShot(4, 4);
  check('hit on ship', first.result === 'hit' && !first.sunk);
  const second = board.receiveShot(4, 5);
  check('final hit reports sunk', second.result === 'hit' && second.sunk);
  check('sunk ship counts once', board.ships[0].hits.length === destroyer.size);
  check('repeat shot does not double-count hits', (() => {
    board.receiveShot(4, 5);
    return board.ships[0].hits.length === destroyer.size;
  })());
  check('allSunk true when fleet destroyed', board.allSunk());
}

function fullGames(games = 500) {
  console.log(`ai + turn order over ${games} games`);
  let playerWins = 0;
  let aiShots = 0;
  let alternated = true;
  let noRepeats = true;
  let balanced = true;

  for (let i = 0; i < games; i += 1) {
    const game = new Game();
    game.playerBoard.placeRandomly(FLEET);
    game.startBattle();
    const aiSeen = new Set();
    let guard = 0;

    while (game.phase !== PHASE.OVER && guard < 400) {
      guard += 1;
      const open = [];
      for (let row = 0; row < 10; row += 1) {
        for (let col = 0; col < 10; col += 1) {
          if (!game.enemyBoard.alreadyShot(row, col)) open.push([row, col]);
        }
      }
      const [row, col] = open[Math.floor(Math.random() * open.length)];
      if (game.playerFire(row, col) === null) alternated = false;
      if (game.phase === PHASE.AI_TURN) {
        const outcome = game.aiFire();
        if (outcome === null) alternated = false;
        const key = `${outcome.row},${outcome.col}`;
        if (aiSeen.has(key)) noRepeats = false;
        aiSeen.add(key);
      }
      if (Math.abs(game.playerStats.shots - game.enemyStats.shots) > 1) balanced = false;
    }

    if (guard >= 400) {
      failures += 1;
      console.log('  FAIL game failed to terminate');
      return;
    }
    if (game.winner === 'player') playerWins += 1;
    else if (!game.playerBoard.allSunk()) {
      failures += 1;
      console.log('  FAIL declared an enemy win with ships afloat');
    }
    aiShots += game.enemyStats.shots;
  }

  const avg = aiShots / games;
  check('turns strictly alternate', alternated);
  check('shot counts never diverge by more than one', balanced);
  check('ai never fires at the same cell twice', noRepeats);
  check(`hunt/target beats random search (avg ${avg.toFixed(1)} shots < 80)`, avg < 80);
  console.log(`  info player (random shots) won ${playerWins}/${games}`);
}

function configurationRules() {
  console.log('configurations + seeded placement');
  const defaults = createGameConfig();
  check(
    'default config preserves Classic 10x10 rules',
    defaults.mode === BASE_MODES.CLASSIC &&
      defaults.variant === GAME_VARIANTS.STANDARD &&
      defaults.boardSize === BOARD_SIZE &&
      defaults.fleet.length === FLEET.length &&
      defaults.shotsPerTurn === 1 &&
      defaults.playerAmmo === null &&
      !defaults.oneShotSinks
  );

  const compact = createGameConfig({ variant: GAME_VARIANTS.COMPACT });
  const compactBoard = new Board({
    size: compact.boardSize,
    fleet: compact.fleet,
    rng: createSeededRandom('compact'),
  });
  check('compact variant selects an 8x8 board', compact.boardSize === 8);
  check('classic fleet fits a seeded compact board', compactBoard.placeRandomly());
  check(
    'compact placement stays inside 8x8 bounds',
    compactBoard.ships.every((ship) =>
      ship.cells.every((cell) => cell.row < 8 && cell.col < 8)
    )
  );

  const armada = createGameConfig({ variant: GAME_VARIANTS.ARMADA });
  const patrol = armada.fleet.find((ship) => ship.id === 'patrol');
  check(
    'armada adds a patrol boat mapped to existing art',
    armada.fleet.length === ARMADA_FLEET.length && patrol?.assetId === 'destroyer'
  );

  const first = new Board({ rng: createSeededRandom('same-board') });
  const second = new Board({ rng: createSeededRandom('same-board') });
  const third = new Board({ rng: createSeededRandom('different-board') });
  first.placeRandomly();
  second.placeRandomly();
  third.placeRandomly();
  check('same seed reproduces the exact fleet', boardSignature(first) === boardSignature(second));
  check('different seed changes the fleet', boardSignature(first) !== boardSignature(third));

  const dailyA = new Game({
    playerRng: createSeededRandom('player-a'),
    enemyRng: createSeededRandom('enemy:2099-01-01'),
  });
  dailyA.playerBoard.placeRandomly();
  // Consume extra player randomness; it must not shift the daily enemy board.
  dailyA.playerBoard.placeRandomly();
  dailyA.startBattle();
  const dailyB = new Game({
    playerRng: createSeededRandom('player-b'),
    enemyRng: createSeededRandom('enemy:2099-01-01'),
  });
  dailyB.playerBoard.placeRandomly();
  dailyB.startBattle();
  check(
    'daily enemy seed is independent of player randomize calls',
    boardSignature(dailyA.enemyBoard) === boardSignature(dailyB.enemyBoard)
  );
}

function personalityRules() {
  console.log('ai personalities');
  const expectedClasses = {
    easy: RandomAI,
    random: RandomAI,
    medium: HuntTargetAI,
    hunter: HuntTargetAI,
    hard: ProbabilityAI,
    probability: ProbabilityAI,
    aggressive: AggressiveAI,
    deceptive: DeceptiveAI,
  };

  Object.entries(expectedClasses).forEach(([name, Expected]) => {
    const ai = createAI(name, { size: 8, rng: createSeededRandom(`ai:${name}`) });
    const seen = new Set();
    let valid = ai instanceof Expected;
    for (let count = 0; count < 64; count += 1) {
      const shot = ai.nextShot();
      const key = shot && `${shot.row},${shot.col}`;
      valid =
        valid &&
        Boolean(shot) &&
        shot.row >= 0 &&
        shot.row < 8 &&
        shot.col >= 0 &&
        shot.col < 8 &&
        !seen.has(key);
      if (shot) {
        seen.add(key);
        ai.registerResult(shot.row, shot.col, {
          result: 'miss',
          sunk: false,
          ship: null,
          affectedCells: [shot],
        });
      }
    }
    valid = valid && ai.nextShot() === null;
    check(`${name} AI respects size and never repeats`, valid);
  });
  check(
    'difficulty aliases are public',
    AI_PERSONALITIES.EASY === 'easy' &&
      AI_PERSONALITIES.MEDIUM === 'medium' &&
      AI_PERSONALITIES.HARD === 'hard'
  );
}

function turnQuotaRules() {
  console.log('turn quotas + variants');
  const standard = new Game({ rng: createSeededRandom('standard') });
  standard.playerBoard.placeRandomly();
  standard.startBattle();
  const standardMiss = openWater(standard.enemyBoard)[0];
  standard.playerFire(standardMiss.row, standardMiss.col);
  check('standard switches after one player shot', standard.phase === PHASE.AI_TURN);

  const rapid = new Game({ variant: GAME_VARIANTS.RAPID, rng: createSeededRandom('rapid') });
  rapid.playerBoard.placeRandomly();
  rapid.startBattle();
  const rapidMisses = openWater(rapid.enemyBoard).slice(0, 3);
  rapid.playerFire(rapidMisses[0].row, rapidMisses[0].col);
  rapid.playerFire(rapidMisses[1].row, rapidMisses[1].col);
  check(
    'rapid mode holds the player turn for first two shots',
    rapid.phase === PHASE.PLAYER_TURN && rapid.turnShotsRemaining === 1
  );
  rapid.playerFire(rapidMisses[2].row, rapidMisses[2].col);
  check(
    'rapid mode switches on its third shot',
    rapid.phase === PHASE.AI_TURN && rapid.turnShotQuota === 3
  );

  const salvo = new Game({ variant: GAME_VARIANTS.SALVO, rng: createSeededRandom('salvo') });
  salvo.playerBoard.placeRandomly();
  const sunkBeforeStart = salvo.playerBoard.ships.at(-1);
  sunkBeforeStart.cells.forEach((cell) => salvo.playerBoard.receiveShot(cell.row, cell.col));
  salvo.startBattle();
  check(
    'salvo quota equals surviving ships',
    salvo.turnShotQuota === FLEET.length - 1
  );
  const salvoMisses = openWater(salvo.enemyBoard).slice(0, salvo.turnShotQuota);
  salvoMisses.forEach((cell) => salvo.playerFire(cell.row, cell.col));
  check(
    'enemy receives its own surviving-fleet salvo',
    salvo.phase === PHASE.AI_TURN && salvo.turnShotQuota === FLEET.length
  );
  for (let shot = 1; shot < FLEET.length; shot += 1) salvo.aiFire();
  check('enemy stays active until its final salvo shot', salvo.phase === PHASE.AI_TURN);
  salvo.aiFire();
  check('salvo returns control after the full volley', salvo.phase === PHASE.PLAYER_TURN);

  const oneShotFleet = [{ id: 'duo', name: 'Duo', size: 2 }];
  const oneShot = new Game({
    variant: GAME_VARIANTS.ONE_SHOT,
    boardSize: 4,
    fleet: oneShotFleet,
    rng: createSeededRandom('one-shot'),
  });
  oneShot.playerBoard.place(oneShotFleet[0], 3, 0, HORIZONTAL);
  oneShot.startBattle();
  const enemyShip = oneShot.enemyBoard.ships[0];
  const strike = enemyShip.cells[0];
  const oneShotOutcome = oneShot.playerFire(strike.row, strike.col);
  check(
    'one-shot hit sinks the entire ship and wins',
    oneShotOutcome.sunk &&
      oneShotOutcome.affectedCells.length === 2 &&
      oneShot.enemyBoard.allSunk() &&
      oneShot.winner === 'player' &&
      oneShot.endReason === 'fleet-destroyed'
  );
}

function limitedAmmoAndOutcomeRules() {
  console.log('ammo + win/loss + event history');
  const limited = new Game({
    variant: GAME_VARIANTS.LIMITED,
    aiPersonality: 'easy',
    aiRng: () => 0,
    enemyRng: createSeededRandom('limited-enemy'),
  });
  const rows = [9, 8, 7, 6, 5];
  limited.fleet.forEach((ship, index) =>
    limited.playerBoard.place(ship, rows[index], 0, HORIZONTAL)
  );
  limited.startBattle();
  const guaranteedMisses = openWater(limited.enemyBoard).slice(0, 32);
  guaranteedMisses.forEach((cell, index) => {
    if (limited.phase === PHASE.PLAYER_TURN) limited.playerFire(cell.row, cell.col);
    if (index < 31 && limited.phase === PHASE.AI_TURN) limited.aiFire();
  });
  check(
    'limited mode ends as a loss exactly after shot 32',
    limited.playerStats.shots === 32 &&
      limited.playerAmmoRemaining === 0 &&
      limited.phase === PHASE.OVER &&
      limited.winner === 'enemy' &&
      limited.endReason === 'ammo-exhausted'
  );

  const duelFleet = [{ id: 'duo', name: 'Duo', size: 2 }];
  const playerWin = new Game({
    boardSize: 4,
    fleet: duelFleet,
    aiPersonality: 'easy',
    aiRng: () => 0,
    enemyRng: createSeededRandom('player-win'),
  });
  playerWin.playerBoard.place(duelFleet[0], 3, 0, HORIZONTAL);
  playerWin.startBattle();
  const targetCells = [...playerWin.enemyBoard.ships[0].cells];
  playerWin.playerFire(targetCells[0].row, targetCells[0].col);
  playerWin.aiFire();
  playerWin.playerFire(targetCells[1].row, targetCells[1].col);
  check(
    'destroying the final enemy segment records a player win',
    playerWin.winner === 'player' && playerWin.endReason === 'fleet-destroyed'
  );

  const soloFleet = [{ id: 'solo', name: 'Solo', size: 1 }];
  const enemyWin = new Game({
    boardSize: 2,
    fleet: soloFleet,
    aiPersonality: 'easy',
    aiRng: () => 0,
    enemyRng: createSeededRandom('enemy-win'),
  });
  enemyWin.playerBoard.place(soloFleet[0], 0, 0, HORIZONTAL);
  enemyWin.startBattle();
  const miss = openWater(enemyWin.enemyBoard)[0];
  enemyWin.playerFire(miss.row, miss.col);
  enemyWin.aiFire();
  check(
    'destroying the final player segment records an enemy win',
    enemyWin.winner === 'enemy' && enemyWin.endReason === 'fleet-destroyed'
  );

  let observed = 0;
  const events = new Game({ rng: createSeededRandom('events') });
  events.playerBoard.placeRandomly();
  events.startBattle();
  const unsubscribe = events.onShot(() => {
    observed += 1;
  });
  const eventMiss = openWater(events.enemyBoard)[0];
  const fired = events.playerFire(eventMiss.row, eventMiss.col);
  unsubscribe();
  check(
    'shots are observable and replay-safe',
    observed === 1 &&
      fired.event.id === 1 &&
      events.getShotEvents()[0].actor === 'player' &&
      events.getShotEvents()[0].result === 'miss'
  );
}

function powerEngineHooks() {
  console.log('power-mode engine hooks');
  const classic = new Game({ rng: createSeededRandom('classic-hook') });
  classic.playerBoard.placeRandomly();
  classic.startBattle();
  check('power hooks do not alter Classic mode', classic.scanEnemy(0, 0) === null);

  const power = new Game({
    mode: BASE_MODES.POWER,
    rng: createSeededRandom('power-hooks'),
  });
  power.playerBoard.placeRandomly();
  power.startBattle();
  const scan = power.scanEnemy(0, 0, 1);
  const initialQuota = power.turnShotsRemaining;
  const extra = power.grantExtraShots(1);
  check(
    'Power scan returns bounded cells and a contact count',
    scan?.type === 'scan' && scan.cells.length === 4 && Number.isInteger(scan.contacts)
  );
  check(
    'Power extra shot extends the active quota',
    extra?.amount === 1 && power.turnShotsRemaining === initialQuota + 1
  );
}

function integrationConsistencyRules() {
  console.log('event, ammo, and repair consistency');
  const eventFleet = [{ id: 'duo', name: 'Duo', size: 2 }];
  const events = new Game({
    boardSize: 4,
    fleet: eventFleet,
    aiPersonality: 'easy',
    aiRng: () => 0,
    enemyRng: createSeededRandom('event-semantics'),
  });
  events.playerBoard.place(eventFleet[0], 3, 0, HORIZONTAL);
  events.startBattle();
  const miss = openWater(events.enemyBoard)[0];
  const playerShot = events.playerFire(miss.row, miss.col);
  const enemyShot = events.aiFire();
  check(
    'player event reports shooter quota before the transition',
    playerShot.event.turn === 1 &&
      playerShot.event.turnQuota === 1 &&
      playerShot.event.shotsRemaining === 0 &&
      playerShot.event.phaseAfter === PHASE.AI_TURN &&
      playerShot.event.nextTurnShotsRemaining === 1
  );
  check(
    'last enemy shot remains in its original turn',
    enemyShot.event.turn === 1 &&
      enemyShot.event.shotsRemaining === 0 &&
      enemyShot.event.phaseAfter === PHASE.PLAYER_TURN &&
      enemyShot.event.nextTurnShotsRemaining === 1 &&
      events.turnNumber === 2
  );

  const limited = new Game({
    mode: BASE_MODES.POWER,
    variant: GAME_VARIANTS.LIMITED,
    playerAmmo: 2,
    aiPersonality: 'easy',
    aiRng: () => 0,
    enemyRng: createSeededRandom('limited-extra-boundary'),
  });
  limited.playerBoard.placeRandomly();
  limited.startBattle();
  const partialGrant = limited.grantExtraShots(2);
  const misses = openWater(limited.enemyBoard).slice(0, 2);
  limited.playerFire(misses[0].row, misses[0].col);
  limited.playerFire(misses[1].row, misses[1].col);
  check(
    'extra shots are capped by remaining limited ammo',
    partialGrant?.amount === 1 &&
      limited.playerStats.shots === 2 &&
      limited.playerAmmoRemaining === 0 &&
      limited.endReason === 'ammo-exhausted'
  );

  const finalRound = new Game({
    mode: BASE_MODES.POWER,
    variant: GAME_VARIANTS.LIMITED,
    playerAmmo: 1,
    rng: createSeededRandom('no-extra-ammo'),
  });
  finalRound.playerBoard.placeRandomly();
  finalRound.startBattle();
  check(
    'extra-shot activation fails cleanly when quota already consumes final ammo',
    finalRound.grantExtraShots(1) === null &&
      finalRound.turnShotQuota === 1 &&
      finalRound.turnShotsRemaining === 1
  );

  const repairFleet = [{ id: 'duo', name: 'Duo', size: 2 }];
  const repair = new Game({
    mode: BASE_MODES.POWER,
    boardSize: 4,
    fleet: repairFleet,
    aiPersonality: 'hard',
    rng: createSeededRandom('repair-integration'),
  });
  repair.playerBoard.place(repairFleet[0], 3, 0, HORIZONTAL);
  repair.startBattle();
  const damaged = repair.playerBoard.receiveShot(3, 0);
  repair.ai.registerResult(3, 0, damaged);
  const repaired = repair.repairPlayerShip('duo');
  check(
    'Game repair restores an unsunk segment in Board and AI state',
    repaired?.restoredCells.length === 1 &&
      !repair.playerBoard.alreadyShot(3, 0) &&
      !repair.ai.tried.has('3,0') &&
      !repair.ai.results.has('3,0') &&
      repair.ai.remainingShipSizes.includes(2)
  );

  [HuntTargetAI, AggressiveAI, DeceptiveAI].forEach((Strategy) => {
    const hunter = new Strategy({ size: 4, rng: () => 0 });
    hunter.registerResult(1, 1, {
      result: 'hit',
      sunk: false,
      affectedCells: [{ row: 1, col: 1 }],
    });
    hunter.forget(1, 1);
    check(
      `${Strategy.name} clears stale targets when its only hit is repaired`,
      hunter.currentHits.length === 0 && hunter.targets.length === 0
    );
  });
  repair.playerBoard.receiveShot(3, 0);
  repair.playerBoard.receiveShot(3, 1);
  check(
    'Game repair rejects sunk ships to preserve sink stats and AI model',
    repair.playerBoard.allSunk() && repair.repairPlayerShip('duo') === null
  );
}

function renderingLayers() {
  console.log('rendering layers');
  const html = readRepoFile('index.html');
  const css = readRepoFile('css/styles.css');
  const main = readRepoFile('js/main.js');
  const boardMarkup = html;

  ['player', 'enemy'].forEach((side) => {
    const shipAt = boardMarkup.indexOf(`id="${side}-ships"`);
    const markerAt = boardMarkup.indexOf(`id="${side}-markers"`);
    check(
      `${side} markers paint above the ship layer`,
      shipAt !== -1 && markerAt !== -1 && markerAt > shipAt
    );
  });

  check('shot markers are styled on the marker layer, not the cell', css.includes('.marker-hit::after') && !css.includes('.cell.hit::after'));
  check('page declares a favicon', html.includes('rel="icon"'));
  check(
    'board containers expose valid non-grid semantics',
    !html.includes('role="grid"') &&
      html.includes('id="player-grid" role="group"') &&
      html.includes('id="replay-grid-player"') &&
      html.includes('role="img"')
  );
  check(
    'history replay control retains a 44px touch target',
    /\.history-replay\s*\{[^}]*min-height:\s*44px/s.test(css)
  );
  check(
    'deployment drag is pointer-driven so touch and pen can drag too',
    main.includes("dom.tray.addEventListener('pointerdown'") &&
      main.includes("dom.playerShips.addEventListener('pointerdown'") &&
      main.includes("document.addEventListener('pointermove'") &&
      main.includes("document.addEventListener('pointercancel'") &&
      !main.includes("dom.tray.addEventListener('mousedown'")
  );
  check(
    'a ghost hull follows the pointer and marks illegal drops',
    /function moveGhost/.test(main) &&
      /classList\.toggle\('invalid'/.test(main) &&
      /\.drag-ghost\s*\{[^}]*position:\s*fixed/s.test(css) &&
      /\.drag-ghost\s*\{[^}]*pointer-events:\s*none/s.test(css)
  );
  check(
    'draggable surfaces opt out of touch scrolling so a drag is not stolen',
    /\.tray-item\s*\{[^}]*touch-action:\s*none/s.test(css) &&
      /\.grid\.deploying\s*\{[^}]*touch-action:\s*none/s.test(css)
  );
  check(
    'the post-drop click guard is one-shot and cell-scoped so click-to-place survives a drag',
    /CLICK_AFTER_DROP_MS = \d+/.test(main) &&
      /cell === placement\.dropCell && performance\.now\(\) - placement\.dropAt < CLICK_AFTER_DROP_MS/.test(
        main
      ) &&
      /function isDropEcho[\s\S]{0,320}placement\.dropCell = null;\n\s*return echo;/.test(main) &&
      !/placement\.suppressClick/.test(main)
  );
  check(
    'the setup hint describes dragging as a real drag',
    /Drag a ship from the tray or the grid/.test(html) && /<kbd>Esc<\/kbd>/.test(html)
  );
  check(
    'ability and power-up results surface in a transparent heads-up card, not only the log',
    /id="hud-feed"/.test(html) &&
      /\.hud-feed\s*\{[^}]*position:\s*fixed/s.test(css) &&
      /\.hud-feed\s*\{[^}]*pointer-events:\s*none/s.test(css) &&
      /\.hud-card\s*\{[^}]*backdrop-filter:\s*blur/s.test(css) &&
      /function announce\(/.test(main) &&
      /announce\('Power-up earned'/.test(main) &&
      main.match(/\n\s*announce\(/g)?.length >= 5
  );
  check(
    'heads-up cards expire on their own and are cleared by a new game',
    /HUD_HOLD_MS = \d+/.test(main) &&
      /setTimeout\(\(\) => dismissHud\(card\), HUD_HOLD_MS\)/.test(main) &&
      /function clearHud[\s\S]{0,120}replaceChildren\(\)/.test(main) &&
      /dom\.log\.innerHTML = '';\n\s*clearHud\(\);/.test(main)
  );
  const airstrikeAction = main.indexOf("const actionEvent = recordAbility('powerup-airstrike'");
  const airstrikeExecution = main.indexOf('const outcomes = executeAirstrike', airstrikeAction);
  check(
    'Airstrike action is recorded before its shot outcomes execute',
    airstrikeAction !== -1 && airstrikeExecution > airstrikeAction
  );
}

placementRules();
boundaryRules();
shotResolution();
fullGames();
configurationRules();
personalityRules();
turnQuotaRules();
limitedAmmoAndOutcomeRules();
powerEngineHooks();
integrationConsistencyRules();
renderingLayers();

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
