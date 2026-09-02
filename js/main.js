import {
  BASE_MODES,
  COLUMN_LABELS,
  GAME_VARIANTS,
  HORIZONTAL,
  VERTICAL,
} from './constants.js';
import { cellsFor } from './board.js';
import { Game, PHASE, accuracy } from './game.js';
import { audio } from './audio.js';
import {
  POWERUPS,
  SHIP_ABILITIES,
  PowerState,
  cellsInCross,
  createEnemyShotDefender,
  executeAirstrike,
  extraShotCapacity,
  scanResult,
} from './powers.js';
import {
  ACHIEVEMENTS,
  ProfileStore,
  createReplayFrames,
  createSeededRandom,
  dailyKey,
} from './profile.js';

const AI_DELAY_MS = 420;
const RESULT_DELAY_MS = 700;
const SCAN_DISPLAY_MS = 1800;

const VARIANT_NAMES = Object.freeze({
  [GAME_VARIANTS.STANDARD]: 'Classic rules',
  [GAME_VARIANTS.SALVO]: 'Salvo',
  [GAME_VARIANTS.RAPID]: 'Rapid fire',
  [GAME_VARIANTS.ONE_SHOT]: 'One-shot',
  [GAME_VARIANTS.COMPACT]: 'Compact 8 × 8',
  [GAME_VARIANTS.ARMADA]: 'Armada fleet',
  [GAME_VARIANTS.LIMITED]: 'Limited ammo',
});

const dom = {
  setupPanel: document.getElementById('setup-panel'),
  tray: document.getElementById('ship-tray'),
  rotateBtn: document.getElementById('rotate-btn'),
  randomBtn: document.getElementById('random-btn'),
  clearBtn: document.getElementById('clear-btn'),
  startBtn: document.getElementById('start-btn'),
  muteBtn: document.getElementById('mute-btn'),
  restartBtn: document.getElementById('restart-btn'),
  classicBtn: document.getElementById('mode-classic-btn'),
  powerBtn: document.getElementById('mode-power-btn'),
  variantSelect: document.getElementById('variant-select'),
  aiSelect: document.getElementById('ai-select'),
  dailyBtn: document.getElementById('daily-btn'),
  dailyStatus: document.getElementById('daily-status'),
  playerGrid: document.getElementById('player-grid'),
  enemyGrid: document.getElementById('enemy-grid'),
  playerShips: document.getElementById('player-ships'),
  enemyShips: document.getElementById('enemy-ships'),
  playerMarkers: document.getElementById('player-markers'),
  enemyMarkers: document.getElementById('enemy-markers'),
  playerWrap: document.getElementById('player-board-wrap'),
  enemyWrap: document.getElementById('enemy-board-wrap'),
  playerFleetStatus: document.getElementById('player-fleet-status'),
  enemyFleetStatus: document.getElementById('enemy-fleet-status'),
  turnBanner: document.getElementById('turn-banner'),
  log: document.getElementById('log'),
  powerPanel: document.getElementById('power-panel'),
  abilityList: document.getElementById('ability-list'),
  powerupList: document.getElementById('powerup-list'),
  powerHint: document.getElementById('power-hint'),
  careerStats: document.getElementById('career-stats'),
  matchHistory: document.getElementById('match-history'),
  achievements: document.getElementById('achievements'),
  themeSelect: document.getElementById('theme-select'),
  effectSelect: document.getElementById('effect-select'),
  flagSelect: document.getElementById('flag-select'),
  victorySelect: document.getElementById('victory-select'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlaySubtitle: document.getElementById('overlay-subtitle'),
  overlayStats: document.getElementById('overlay-stats'),
  playAgainBtn: document.getElementById('play-again-btn'),
  replayBtn: document.getElementById('replay-btn'),
  replayOverlay: document.getElementById('replay-overlay'),
  replayTitle: document.getElementById('replay-title'),
  replayPlayerGrid: document.getElementById('replay-grid-player'),
  replayEnemyGrid: document.getElementById('replay-grid-enemy'),
  replayFrameLabel: document.getElementById('replay-frame-label'),
  replayPrevBtn: document.getElementById('replay-prev-btn'),
  replayNextBtn: document.getElementById('replay-next-btn'),
  replayCloseBtn: document.getElementById('replay-close-btn'),
};

const statsDom = {
  playerShots: document.getElementById('player-shots'),
  playerHits: document.getElementById('player-hits'),
  playerAccuracy: document.getElementById('player-accuracy'),
  playerSunk: document.getElementById('player-sunk'),
  enemyShots: document.getElementById('enemy-shots'),
  enemyHits: document.getElementById('enemy-hits'),
  enemyAccuracy: document.getElementById('enemy-accuracy'),
  enemySunk: document.getElementById('enemy-sunk'),
};

const settings = {
  mode: BASE_MODES.CLASSIC,
  variant: GAME_VARIANTS.STANDARD,
  aiPersonality: 'hunter',
  daily: false,
};

const placement = {
  selectedShipId: null,
  orientation: HORIZONTAL,
  anchorIndex: 0,
  carrying: false,
  pointerId: null,
  pointer: { x: 0, y: 0 },
  ghost: null,
  suppressClick: false,
};

const profileStore = new ProfileStore();
const powerState = new PowerState();

let game;
let busy = false;
let aiTimer = null;
let overlayTimer = null;
let scanTimer = null;
let defenseCleanupTimers = new Set();
let matchRecorded = false;
let nextHitReward = 3;
let timeline = [];
let latestMatch = profileStore.getHistory()[0] ?? null;
let replayMatch = null;
let replayFrames = [];
let replayIndex = 0;
let replayReturnFocus = null;
let activeDailyKey = null;

function currentGameOptions() {
  if (settings.daily) {
    const key = activeDailyKey ?? dailyKey();
    return {
      mode: BASE_MODES.CLASSIC,
      variant: GAME_VARIANTS.LIMITED,
      aiPersonality: 'probability',
      enemyRng: createSeededRandom(`fleet-command:${key}:enemy`),
      aiRng: createSeededRandom(`fleet-command:${key}:commander`),
    };
  }
  return {
    mode: settings.mode,
    variant: settings.variant,
    aiPersonality: settings.aiPersonality,
  };
}

function clearTimers() {
  if (aiTimer !== null) window.clearTimeout(aiTimer);
  if (overlayTimer !== null) window.clearTimeout(overlayTimer);
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  defenseCleanupTimers.forEach((timer) => window.clearTimeout(timer));
  defenseCleanupTimers.clear();
  aiTimer = null;
  overlayTimer = null;
  scanTimer = null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shipDef(shipId) {
  return game.fleet.find((ship) => ship.id === shipId);
}

function cellAt(gridEl, row, col, size = game.boardSize) {
  return gridEl.children[row * size + col] ?? null;
}

function coordLabel(row, col) {
  return `${COLUMN_LABELS[col] ?? col + 1}${row + 1}`;
}

function buildGrid(gridEl, side) {
  const size = game.boardSize;
  gridEl.innerHTML = '';
  gridEl.classList.add(side);
  gridEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute(
        'aria-label',
        `${side === 'enemy' ? 'Enemy' : 'Your'} cell ${coordLabel(row, col)}`
      );
      gridEl.appendChild(cell);
    }
  }
}

function buildLabels(wrapEl) {
  const size = game.boardSize;
  const rowLabels = wrapEl.querySelector('.labels-row');
  const colLabels = wrapEl.querySelector('.labels-col');
  rowLabels.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
  colLabels.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`;
  rowLabels.innerHTML = COLUMN_LABELS.slice(0, size)
    .map((label) => `<span>${label}</span>`)
    .join('');
  colLabels.innerHTML = Array.from({ length: size }, (_, index) => `<span>${index + 1}</span>`)
    .join('');
}

function rebuildBoards() {
  buildGrid(dom.playerGrid, 'player');
  buildGrid(dom.enemyGrid, 'enemy');
  buildLabels(dom.playerWrap);
  buildLabels(dom.enemyWrap);
}

function renderTray() {
  dom.tray.innerHTML = '';
  game.fleet.forEach((ship) => {
    const placed = game.playerBoard.ships.some((entry) => entry.id === ship.id);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-item';
    button.dataset.shipId = ship.id;
    button.setAttribute('aria-pressed', String(placement.selectedShipId === ship.id));
    button.classList.toggle('placed', placed);
    button.classList.toggle('selected', placement.selectedShipId === ship.id);

    const image = document.createElement('img');
    image.src = `assets/img/${ship.assetId ?? ship.id}.svg`;
    image.alt = '';
    const name = document.createElement('span');
    name.className = 'tray-name';
    name.textContent = ship.name;
    const size = document.createElement('span');
    size.className = 'tray-size';
    size.textContent = String(ship.size);
    button.append(image, name, size);
    item.appendChild(button);
    dom.tray.appendChild(item);
  });
}

function spriteFor(ship, { draggable = false, sunk = false } = {}) {
  const sprite = document.createElement('div');
  const unit = 100 / game.boardSize;
  const length = ship.size * unit;
  sprite.className = 'ship-sprite';
  sprite.dataset.shipId = ship.id;
  if (ship.orientation === HORIZONTAL) {
    sprite.style.left = `${ship.col * unit}%`;
    sprite.style.top = `${ship.row * unit}%`;
    sprite.style.width = `${length}%`;
    sprite.style.height = `${unit}%`;
  } else {
    const centerX = (ship.col + 0.5) * unit;
    const centerY = (ship.row + ship.size / 2) * unit;
    sprite.style.left = `${centerX - length / 2}%`;
    sprite.style.top = `${centerY - unit / 2}%`;
    sprite.style.width = `${length}%`;
    sprite.style.height = `${unit}%`;
    sprite.classList.add('vertical');
  }
  sprite.classList.toggle('draggable', draggable);
  sprite.classList.toggle('sunk', sunk);
  const image = document.createElement('img');
  image.src = `assets/img/${ship.assetId ?? ship.id}.svg`;
  image.alt = ship.name;
  sprite.appendChild(image);
  return sprite;
}

function renderPlayerShips() {
  dom.playerShips.innerHTML = '';
  game.playerBoard.ships.forEach((ship) => {
    dom.playerShips.appendChild(
      spriteFor(ship, {
        draggable: game.phase === PHASE.SETUP,
        sunk: game.playerBoard.isShipSunk(ship),
      })
    );
  });
}

function renderEnemyShips() {
  dom.enemyShips.innerHTML = '';
  game.enemyBoard.ships.forEach((ship) => {
    const sunk = game.enemyBoard.isShipSunk(ship);
    if (game.phase !== PHASE.OVER && !sunk) return;
    dom.enemyShips.appendChild(spriteFor(ship, { sunk }));
  });
}

function clearShotClasses(gridEl, markerLayerEl) {
  Array.from(gridEl.children).forEach((cell) => {
    cell.classList.remove(
      'shot',
      'hit',
      'miss',
      'sunk',
      'preview-valid',
      'preview-invalid',
      'scan-area'
    );
  });
  markerLayerEl.innerHTML = '';
}

function placeInLayer(layerEl, row, col, className) {
  const unit = 100 / game.boardSize;
  const slot = document.createElement('span');
  slot.className = 'cell-slot';
  slot.dataset.row = String(row);
  slot.dataset.col = String(col);
  slot.style.left = `${col * unit}%`;
  slot.style.top = `${row * unit}%`;
  slot.style.width = `${unit}%`;
  slot.style.height = `${unit}%`;
  const node = document.createElement('span');
  node.className = className;
  slot.appendChild(node);
  layerEl.appendChild(slot);
  return node;
}

function addMarker(layerEl, row, col, kind) {
  placeInLayer(layerEl, row, col, `marker marker-${kind}`);
}

function playEffect(layerEl, row, col, kind) {
  const effect = placeInLayer(
    layerEl,
    row,
    col,
    `fx ${kind === 'hit' ? 'fx-blast' : 'fx-splash'}`
  );
  effect.addEventListener('animationend', () => effect.parentElement?.remove(), { once: true });
  if (kind === 'hit') {
    const smoke = placeInLayer(layerEl, row, col, 'fx fx-smoke');
    smoke.addEventListener('animationend', () => smoke.parentElement?.remove(), { once: true });
  }
}

function shakeBoard(wrapEl) {
  wrapEl.classList.remove('shake');
  void wrapEl.offsetWidth;
  wrapEl.classList.add('shake');
  wrapEl.addEventListener('animationend', () => wrapEl.classList.remove('shake'), { once: true });
}

function animateSinking(layerEl, shipId) {
  const sprite = layerEl.querySelector(`.ship-sprite[data-ship-id="${shipId}"]`);
  sprite?.classList.add('sinking');
}

function renderShotMap(board, gridEl, markerEl) {
  board.shots.forEach((result, key) => {
    const [row, col] = key.split(',').map(Number);
    const cell = cellAt(gridEl, row, col);
    if (!cell) return;
    cell.classList.add('shot', result);
    addMarker(markerEl, row, col, result);
  });
  board.ships.forEach((ship) => {
    if (!board.isShipSunk(ship)) return;
    ship.cells.forEach(({ row, col }) => cellAt(gridEl, row, col)?.classList.add('sunk'));
  });
}

function renderBoards() {
  clearShotClasses(dom.playerGrid, dom.playerMarkers);
  clearShotClasses(dom.enemyGrid, dom.enemyMarkers);
  renderPlayerShips();
  renderEnemyShips();
  renderShotMap(game.playerBoard, dom.playerGrid, dom.playerMarkers);
  renderShotMap(game.enemyBoard, dom.enemyGrid, dom.enemyMarkers);
}

function clearPreview() {
  Array.from(dom.playerGrid.children).forEach((cell) => {
    cell.classList.remove('preview-valid', 'preview-invalid');
  });
}

function anchoredOrigin(row, col, orientation, anchorIndex) {
  return orientation === HORIZONTAL
    ? { row, col: col - anchorIndex }
    : { row: row - anchorIndex, col };
}

function showPreview(row, col) {
  clearPreview();
  const definition = shipDef(placement.selectedShipId);
  if (!definition || game.phase !== PHASE.SETUP) return;
  const origin = anchoredOrigin(row, col, placement.orientation, placement.anchorIndex);
  const valid = game.playerBoard.canPlace(
    origin.row,
    origin.col,
    definition.size,
    placement.orientation,
    definition.id
  );
  cellsFor(origin.row, origin.col, definition.size, placement.orientation).forEach((cell) => {
    if (cell.row < 0 || cell.row >= game.boardSize || cell.col < 0 || cell.col >= game.boardSize) {
      return;
    }
    cellAt(dom.playerGrid, cell.row, cell.col)?.classList.add(
      valid ? 'preview-valid' : 'preview-invalid'
    );
  });
}

function selectNextUnplaced() {
  const next = game.fleet.find(
    (ship) => !game.playerBoard.ships.some((entry) => entry.id === ship.id)
  );
  if (next) placement.selectedShipId = next.id;
}

function tryPlace(row, col) {
  const definition = shipDef(placement.selectedShipId);
  if (!definition) return false;
  const origin = anchoredOrigin(row, col, placement.orientation, placement.anchorIndex);
  if (!game.playerBoard.place(definition, origin.row, origin.col, placement.orientation)) {
    return false;
  }
  placement.anchorIndex = 0;
  selectNextUnplaced();
  refreshSetup();
  return true;
}

function rotateSelected() {
  if (game.phase !== PHASE.SETUP) return;
  if (placement.carrying) {
    placement.orientation = placement.orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
    buildGhost();
    updateDrag(placement.pointer.x, placement.pointer.y);
    return;
  }
  const definition = shipDef(placement.selectedShipId);
  const placed = game.playerBoard.ships.find((ship) => ship.id === placement.selectedShipId);
  const orientation = placement.orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
  if (placed && definition && !game.playerBoard.place(definition, placed.row, placed.col, orientation)) {
    logMessage('That ship cannot rotate in its current position.');
    return;
  }
  placement.orientation = orientation;
  refreshSetup();
}

function cellSizePx() {
  return dom.playerGrid.getBoundingClientRect().width / game.boardSize;
}

function cellFromPoint(x, y) {
  const cell = document.elementFromPoint(x, y)?.closest?.('.cell');
  return cell && dom.playerGrid.contains(cell) ? cell : null;
}

function buildGhost() {
  const definition = shipDef(placement.selectedShipId);
  if (!definition) return;
  placement.ghost?.remove();
  const unit = cellSizePx();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.classList.toggle('vertical', placement.orientation === VERTICAL);
  ghost.style.width = `${definition.size * unit}px`;
  ghost.style.height = `${unit}px`;
  const image = document.createElement('img');
  image.src = `assets/img/${definition.assetId ?? definition.id}.svg`;
  image.alt = '';
  ghost.appendChild(image);
  document.body.appendChild(ghost);
  placement.ghost = ghost;
}

function moveGhost(x, y) {
  const definition = shipDef(placement.selectedShipId);
  if (!placement.ghost || !definition) return;
  const unit = cellSizePx();
  const along = (definition.size / 2 - (placement.anchorIndex + 0.5)) * unit;
  const centerX = x + (placement.orientation === HORIZONTAL ? along : 0);
  const centerY = y + (placement.orientation === HORIZONTAL ? 0 : along);
  placement.ghost.style.left = `${centerX - (definition.size * unit) / 2}px`;
  placement.ghost.style.top = `${centerY - unit / 2}px`;
}

function updateDrag(x, y) {
  placement.pointer = { x, y };
  moveGhost(x, y);
  const cell = cellFromPoint(x, y);
  if (!cell) {
    clearPreview();
    placement.ghost?.classList.remove('invalid');
    return;
  }
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  showPreview(row, col);
  const definition = shipDef(placement.selectedShipId);
  const origin = anchoredOrigin(row, col, placement.orientation, placement.anchorIndex);
  const valid = Boolean(definition) && game.playerBoard.canPlace(
    origin.row,
    origin.col,
    definition.size,
    placement.orientation,
    definition.id
  );
  placement.ghost?.classList.toggle('invalid', !valid);
}

function startDrag(event, shipId, anchorIndex) {
  if (game.phase !== PHASE.SETUP || !shipDef(shipId)) return;
  placement.selectedShipId = shipId;
  placement.anchorIndex = anchorIndex;
  placement.carrying = true;
  placement.pointerId = event.pointerId ?? null;
  buildGhost();
  document.body.classList.add('dragging-ship');
  renderTray();
  dom.playerShips
    .querySelector(`.ship-sprite[data-ship-id="${shipId}"]`)
    ?.classList.add('lifted');
  updateDrag(event.clientX, event.clientY);
}

function endDrag({ cancelled = false } = {}) {
  if (!placement.carrying) return;
  const { x, y } = placement.pointer;
  placement.carrying = false;
  placement.pointerId = null;
  placement.ghost?.remove();
  placement.ghost = null;
  document.body.classList.remove('dragging-ship');
  clearPreview();
  const cell = cancelled ? null : cellFromPoint(x, y);
  if (cell) {
    placement.suppressClick = true;
    tryPlace(Number(cell.dataset.row), Number(cell.dataset.col));
    return;
  }
  refreshSetup();
}

function grabbedSegment(event, sprite, ship) {
  const rect = sprite.getBoundingClientRect();
  const distance = ship.orientation === HORIZONTAL
    ? (event.clientX - rect.left) / rect.width
    : (event.clientY - rect.top) / rect.height;
  return Math.min(ship.size - 1, Math.max(0, Math.floor(distance * ship.size)));
}

function refreshSetup() {
  renderTray();
  renderPlayerShips();
  dom.startBtn.disabled = !game.playerBoard.isComplete(game.fleet);
  updateBanner();
  updateInteractiveState();
}

function logMessage(message, className = '') {
  const item = document.createElement('li');
  item.textContent = message;
  if (className) item.className = className;
  dom.log.prepend(item);
  while (dom.log.children.length > 40) dom.log.lastChild?.remove();
}

function fleetStatusText(board) {
  return board.ships
    .map((ship) => board.isShipSunk(ship)
      ? `<span class="down">${ship.name}</span>`
      : `<span>${ship.name}</span>`)
    .join(' · ');
}

function updateStats() {
  statsDom.playerShots.textContent = String(game.playerStats.shots);
  statsDom.playerHits.textContent = String(game.playerStats.hits);
  statsDom.playerAccuracy.textContent = `${accuracy(game.playerStats)}%`;
  statsDom.playerSunk.textContent = String(game.playerStats.sunk);
  statsDom.enemyShots.textContent = String(game.enemyStats.shots);
  statsDom.enemyHits.textContent = String(game.enemyStats.hits);
  statsDom.enemyAccuracy.textContent = `${accuracy(game.enemyStats)}%`;
  statsDom.enemySunk.textContent = String(game.enemyStats.sunk);
  dom.playerFleetStatus.innerHTML = fleetStatusText(game.playerBoard);
  dom.enemyFleetStatus.innerHTML = game.enemyBoard.ships.length
    ? fleetStatusText(game.enemyBoard)
    : '';
}

function updateBanner() {
  if (game.phase === PHASE.SETUP) {
    const ready = game.playerBoard.isComplete(game.fleet);
    const label = settings.daily ? 'Daily challenge' : VARIANT_NAMES[game.variant];
    dom.turnBanner.textContent = ready
      ? `${label}: fleet ready — start the battle.`
      : `${label}: place your ships to begin.`;
  } else if (game.phase === PHASE.PLAYER_TURN) {
    const shots = game.turnShotsRemaining > 1 ? ` ${game.turnShotsRemaining} shots remain.` : '';
    const ammo = game.ammoRemaining === null ? '' : ` ${game.ammoRemaining} total rounds left.`;
    dom.turnBanner.textContent = `Your turn — fire at enemy waters.${shots}${ammo}`;
  } else if (game.phase === PHASE.AI_TURN) {
    const shots = game.turnShotsRemaining > 1 ? ` ${game.turnShotsRemaining} shots incoming.` : '';
    dom.turnBanner.textContent = `Enemy is taking aim…${shots}`;
  } else if (game.endReason === 'ammo-exhausted') {
    dom.turnBanner.textContent = 'Mission failed — your ammunition is exhausted.';
  } else {
    dom.turnBanner.textContent = game.winner === 'player'
      ? 'Victory — enemy fleet destroyed.'
      : 'Defeat — the computer sank your fleet.';
  }
}

function selectedAction() {
  const selected = powerState.selected;
  if (!selected) return null;
  const list = selected.kind === 'ability' ? SHIP_ABILITIES : POWERUPS;
  return list.find((entry) => entry.id === selected.id) ?? null;
}

function updateInteractiveState() {
  const setup = game.phase === PHASE.SETUP;
  dom.playerGrid.classList.toggle('deploying', setup);
  Array.from(dom.playerGrid.children).forEach((cell) => {
    cell.disabled = !setup;
    cell.tabIndex = setup ? 0 : -1;
    cell.setAttribute('aria-disabled', String(!setup));
  });

  const targeted = selectedAction()?.target === 'enemy';
  Array.from(dom.enemyGrid.children).forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    let enabled = false;
    if (!busy && game.phase === PHASE.PLAYER_TURN) {
      enabled = targeted || game.canPlayerFire(row, col);
      if (powerState.selected?.id === 'airstrike') {
        enabled = cellsInCross(row, col, game.boardSize)
          .some((target) => !game.enemyBoard.alreadyShot(target.row, target.col));
      }
    }
    cell.disabled = !enabled;
    cell.tabIndex = enabled ? 0 : -1;
    cell.setAttribute('aria-disabled', String(!enabled));
  });
  dom.enemyGrid.classList.toggle('active', game.phase === PHASE.PLAYER_TURN && !busy);
  updateControlAvailability();
}

function updateControlAvailability() {
  const locked = game.phase !== PHASE.SETUP;
  dom.classicBtn.disabled = locked || settings.daily;
  dom.powerBtn.disabled = locked || settings.daily;
  dom.variantSelect.disabled = locked || settings.daily;
  dom.aiSelect.disabled = locked || settings.daily;
  dom.dailyBtn.disabled = locked;
  dom.rotateBtn.disabled = locked;
  dom.randomBtn.disabled = locked;
  dom.clearBtn.disabled = locked;
  dom.replayBtn.disabled = locked || !latestMatch;
  dom.matchHistory.querySelectorAll('.history-replay').forEach((button) => {
    button.disabled = locked;
  });
}

function renderModeControls() {
  const mode = settings.daily ? BASE_MODES.CLASSIC : settings.mode;
  dom.classicBtn.classList.toggle('is-active', mode === BASE_MODES.CLASSIC);
  dom.powerBtn.classList.toggle('is-active', mode === BASE_MODES.POWER);
  dom.classicBtn.setAttribute('aria-pressed', String(mode === BASE_MODES.CLASSIC));
  dom.powerBtn.setAttribute('aria-pressed', String(mode === BASE_MODES.POWER));
  dom.variantSelect.value = settings.daily ? GAME_VARIANTS.LIMITED : settings.variant;
  dom.aiSelect.value = settings.daily ? 'probability' : settings.aiPersonality;
  dom.dailyBtn.setAttribute('aria-pressed', String(settings.daily));
  dom.dailyBtn.innerHTML = settings.daily
    ? '<span aria-hidden="true">×</span> Exit daily challenge'
    : '<span aria-hidden="true">◎</span> Deploy daily challenge';
  const powerMode = mode === BASE_MODES.POWER && !settings.daily;
  dom.powerPanel.classList.toggle('hidden', !powerMode);
  dom.powerPanel.setAttribute('aria-hidden', String(!powerMode));
  renderDailyStatus();
}

function renderDailyStatus() {
  const record = profileStore.getDailyChallenge(activeDailyKey ?? dailyKey());
  const best = record.best ? ` Local best: ${record.best.shots} shots.` : ' No completed run yet.';
  dom.dailyStatus.textContent = settings.daily
    ? `Today’s fixed fleet · sink it in 32 shots or fewer.${best}`
    : `New fixed board available today.${best}`;
}

function actionAvailable(kind, definition) {
  if (game.phase !== PHASE.PLAYER_TURN || busy) return false;
  if (kind === 'ability') {
    const ship = game.playerBoard.ships.find((entry) => entry.id === definition.id);
    const ready = Boolean(
      ship && !game.playerBoard.isShipSunk(ship) && powerState.canUseAbility(definition.id)
    );
    if (definition.id === 'battleship' && extraShotCapacity(game) === 0) return false;
    return ready;
  }
  if (!powerState.canUsePowerup(definition.id)) return false;
  if (
    (definition.id === 'airstrike' || definition.id === 'extra-shot') &&
    extraShotCapacity(game) === 0
  ) {
    return false;
  }
  if (definition.id === 'repair') {
    return game.playerBoard.ships.some(
      (ship) => ship.hits.length > 0 && !game.playerBoard.isShipSunk(ship)
    );
  }
  if (definition.id === 'decoy' && powerState.decoyArmed) return false;
  return true;
}

function appendActionItem(list, kind, definition, count, available) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.kind = kind;
  button.dataset.actionId = definition.id;
  button.disabled = !available;
  const selected = powerState.selected?.kind === kind && powerState.selected.id === definition.id;
  button.classList.toggle('is-selected', selected);
  button.setAttribute('aria-pressed', String(selected));
  button.textContent = `${definition.name} · ${count}`;
  const description = document.createElement('small');
  description.textContent = definition.description;
  item.append(button, description);
  list.appendChild(item);
}

function renderPowers() {
  const visible = game.mode === BASE_MODES.POWER;
  if (!visible) return;
  dom.abilityList.innerHTML = '';
  SHIP_ABILITIES.forEach((definition) => {
    appendActionItem(
      dom.abilityList,
      'ability',
      definition,
      powerState.abilityCharges[definition.id] ?? 0,
      actionAvailable('ability', definition)
    );
  });
  dom.powerupList.innerHTML = '';
  POWERUPS.forEach((definition) => {
    appendActionItem(
      dom.powerupList,
      'powerup',
      definition,
      powerState.inventory[definition.id] ?? 0,
      actionAvailable('powerup', definition)
    );
  });

  const selected = selectedAction();
  if (selected?.target === 'enemy') {
    dom.powerHint.textContent = `${selected.name} armed — choose a sector in enemy waters.`;
  } else if (game.phase === PHASE.SETUP) {
    dom.powerHint.textContent = 'One ship ability each; power-ups are earned by landing hits.';
  } else if (game.phase === PHASE.PLAYER_TURN) {
    dom.powerHint.textContent = powerState.decoyArmed
      ? 'Decoy armed. It will turn the next enemy hit into a miss.'
      : 'Choose a tactical system or fire normally.';
  } else {
    dom.powerHint.textContent = 'Tactical systems are standing by.';
  }
}

function recordAbility(ability, details = {}) {
  const event = {
    type: 'ability',
    actor: 'player',
    turn: game.turnNumber,
    ability,
    ...details,
  };
  timeline.push(event);
  return event;
}

function recordShot(actor, outcome) {
  timeline.push({
    type: 'shot',
    actor,
    turn: outcome.event?.turn ?? game.turnNumber,
    row: outcome.row,
    col: outcome.col,
    result: outcome.result,
    sunk: Boolean(outcome.sunk),
    shipId: outcome.ship?.id ?? null,
    shipName: outcome.ship?.name ?? null,
    blocked: Boolean(outcome.blocked),
    blockedBy: outcome.blockedBy ?? null,
    releasedDefensiveCells: (outcome.releasedDefensiveCells ?? []).map((cell) => ({ ...cell })),
    affectedCells: (outcome.affectedCells ?? [{ row: outcome.row, col: outcome.col }])
      .map((cell) => ({ ...cell })),
  });
}

function resolveOutcome(outcome, { gridEl, layerEl, markerEl, wrapEl, actor }) {
  const affected = outcome.result === 'hit'
    ? outcome.affectedCells ?? [{ row: outcome.row, col: outcome.col }]
    : [{ row: outcome.row, col: outcome.col }];
  affected.forEach(({ row, col }) => {
    const cell = cellAt(gridEl, row, col);
    cell?.classList.remove('hit', 'miss', 'sunk');
    markerEl
      .querySelectorAll(`.cell-slot[data-row="${row}"][data-col="${col}"]`)
      .forEach((slot) => slot.remove());
    cell?.classList.add('shot', outcome.result);
    addMarker(markerEl, row, col, outcome.result);
  });
  playEffect(markerEl, outcome.row, outcome.col, outcome.result);
  audio.play(outcome.sunk ? 'sunk' : outcome.result);
  if (outcome.result === 'hit') shakeBoard(wrapEl);

  const who = actor === 'player' ? 'You' : 'Computer';
  if (outcome.blockedBy) {
    logMessage(
      `${outcome.blockedBy === 'decoy' ? 'Decoy' : 'Submarine stealth'} defeated the shot at ${coordLabel(outcome.row, outcome.col)}.`,
      'you'
    );
  } else if (outcome.sunk) {
    outcome.ship.cells.forEach(({ row, col }) => cellAt(gridEl, row, col)?.classList.add('sunk'));
    if (actor === 'player') renderEnemyShips();
    animateSinking(layerEl, outcome.ship.id);
    logMessage(`${who} sank the ${outcome.ship.name}!`, 'sunk-line');
  } else {
    logMessage(
      `${who} fired at ${coordLabel(outcome.row, outcome.col)} — ${outcome.result}.`,
      actor === 'player' ? 'you' : ''
    );
  }
  updateStats();
}

function awardPowerups(outcome) {
  if (game.mode !== BASE_MODES.POWER) return;
  const awards = [];
  while (game.playerStats.hits >= nextHitReward) {
    awards.push(powerState.awardNext(`${nextHitReward} confirmed hits`));
    nextHitReward += 3;
  }
  if (outcome.sunk) awards.push(powerState.awardNext(`${outcome.ship.name} sunk`));
  awards.filter(Boolean).forEach((award) => {
    const definition = POWERUPS.find((powerup) => powerup.id === award.id);
    logMessage(`Power-up earned: ${definition?.name ?? award.id}.`, 'you');
  });
}

function flashScan(result) {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  Array.from(dom.enemyGrid.children).forEach((cell) => cell.classList.remove('scan-area'));
  result.cells.forEach(({ row, col }) => cellAt(dom.enemyGrid, row, col)?.classList.add('scan-area'));
  scanTimer = window.setTimeout(() => {
    Array.from(dom.enemyGrid.children).forEach((cell) => cell.classList.remove('scan-area'));
    scanTimer = null;
  }, SCAN_DISPLAY_MS);
}

function scheduleDefensiveMarkerRelease(cells = []) {
  if (cells.length === 0) return;
  const timer = window.setTimeout(() => {
    cells.forEach(({ row, col }) => {
      if (game.playerBoard.alreadyShot(row, col)) return;
      const cell = cellAt(dom.playerGrid, row, col);
      cell?.classList.remove('shot', 'hit', 'miss', 'sunk');
      dom.playerMarkers
        .querySelectorAll(`.cell-slot[data-row="${row}"][data-col="${col}"]`)
        .forEach((slot) => slot.remove());
    });
    defenseCleanupTimers.delete(timer);
  }, 650);
  defenseCleanupTimers.add(timer);
}

function useTargetedAction(row, col) {
  const selected = powerState.selected;
  const definition = selectedAction();
  if (!selected || !definition || definition.target !== 'enemy') return false;

  if (selected.kind === 'ability') {
    if (!actionAvailable('ability', definition)) return true;
    const result = scanResult(game.enemyBoard, definition.action, row, col);
    powerState.consumeAbility(definition.id);
    powerState.clearSelection();
    recordAbility(definition.id, { action: definition.action, row, col, contacts: result.contacts });
    flashScan(result);
    logMessage(`${definition.name}: ${result.contacts} unhit contact${result.contacts === 1 ? '' : 's'} in ${result.label}.`, 'you');
  } else if (definition.id === 'radar') {
    if (!actionAvailable('powerup', definition)) return true;
    const result = scanResult(game.enemyBoard, 'sonar', row, col);
    powerState.consumePowerup(definition.id);
    powerState.clearSelection();
    recordAbility('powerup-radar', { action: 'radar', row, col, contacts: result.contacts });
    flashScan(result);
    logMessage(`Radar scan: ${result.contacts} unhit contact${result.contacts === 1 ? '' : 's'} in the sector.`, 'you');
  } else if (definition.id === 'airstrike') {
    if (!actionAvailable('powerup', definition)) return true;
    busy = true;
    const actionEvent = recordAbility('powerup-airstrike', {
      action: 'airstrike',
      row,
      col,
      cells: [],
    });
    const outcomes = executeAirstrike(game, row, col, (outcome) => {
      recordShot('player', outcome);
      resolveOutcome(outcome, {
        gridEl: dom.enemyGrid,
        layerEl: dom.enemyShips,
        markerEl: dom.enemyMarkers,
        wrapEl: dom.enemyWrap,
        actor: 'player',
      });
      awardPowerups(outcome);
    });
    if (outcomes.length > 0) {
      powerState.consumePowerup(definition.id);
      powerState.clearSelection();
      actionEvent.cells = outcomes.map(({ row: targetRow, col: targetCol }) => ({
        row: targetRow,
        col: targetCol,
      }));
    } else {
      timeline.splice(timeline.indexOf(actionEvent), 1);
    }
    busy = false;
    if (outcomes.length === 0) {
      logMessage('Not enough ammunition to launch that airstrike.');
      renderPowers();
      updateInteractiveState();
      return true;
    }
    logMessage(`Airstrike complete: ${outcomes.length} sectors attacked.`, 'you');
  }

  renderPowers();
  updateBanner();
  updateInteractiveState();
  if (game.phase === PHASE.OVER) finishGame();
  return true;
}

function useImmediateAction(kind, definition) {
  if (!actionAvailable(kind, definition)) return;
  let completed = false;
  let detail = '';
  let eventDetails = {};

  if (kind === 'ability' && definition.id === 'battleship') {
    const event = game.grantExtraShots(2);
    if (event) {
      completed = powerState.consumeAbility(definition.id);
      detail = `${event.amount} extra shot${event.amount === 1 ? '' : 's'} granted`;
    }
  } else if (kind === 'ability' && definition.id === 'submarine') {
    completed = powerState.consumeAbility(definition.id);
    if (completed) {
      powerState.stealthTurns = 2;
      detail = 'protected for two enemy turns';
    }
  } else if (kind === 'powerup' && definition.id === 'repair') {
    const candidate = game.playerBoard.ships
      .filter((ship) => ship.hits.length > 0 && !game.playerBoard.isShipSunk(ship))
      .sort((left, right) => right.hits.length - left.hits.length)[0];
    const event = candidate ? game.repairPlayerShip(candidate.id, 1) : null;
    if (event) {
      completed = powerState.consumePowerup(definition.id);
      detail = `${candidate.name} restored`;
      eventDetails = { restoredCells: clone(event.restoredCells), shipId: candidate.id };
      renderBoards();
    }
  } else if (kind === 'powerup' && definition.id === 'decoy') {
    completed = powerState.consumePowerup(definition.id);
    if (completed) {
      powerState.decoyArmed = true;
      detail = 'next enemy hit will be blocked';
    }
  } else if (kind === 'powerup' && definition.id === 'extra-shot') {
    const event = game.grantExtraShots(1);
    if (event) {
      completed = powerState.consumePowerup(definition.id);
      detail = `${event.amount} extra shot granted`;
    }
  }

  if (!completed) {
    logMessage(`${definition.name} is unavailable right now.`);
    return;
  }
  recordAbility(kind === 'ability' ? definition.id : `powerup-${definition.id}`, {
    action: definition.action ?? definition.id,
    ...eventDetails,
  });
  logMessage(`${definition.name}: ${detail}.`, 'you');
  renderPowers();
  updateBanner();
  updateStats();
  updateInteractiveState();
}

function choosePowerAction(kind, id) {
  const list = kind === 'ability' ? SHIP_ABILITIES : POWERUPS;
  const definition = list.find((entry) => entry.id === id);
  if (!definition || !actionAvailable(kind, definition)) return;
  if (definition.target === 'enemy') {
    const alreadySelected = powerState.selected?.kind === kind && powerState.selected.id === id;
    if (alreadySelected) powerState.clearSelection();
    else powerState.select(kind, id);
    renderPowers();
    updateInteractiveState();
    return;
  }
  useImmediateAction(kind, definition);
}

function handleEnemyCellClick(event) {
  const cell = event.target.closest('.cell');
  if (!cell || busy) return;
  if (event.detail > 1) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (useTargetedAction(row, col)) return;
  if (!game.canPlayerFire(row, col)) return;

  const outcome = game.playerFire(row, col);
  if (!outcome) return;
  recordShot('player', outcome);
  resolveOutcome(outcome, {
    gridEl: dom.enemyGrid,
    layerEl: dom.enemyShips,
    markerEl: dom.enemyMarkers,
    wrapEl: dom.enemyWrap,
    actor: 'player',
  });
  awardPowerups(outcome);
  renderPowers();

  if (game.phase === PHASE.OVER) {
    finishGame();
  } else if (game.phase === PHASE.AI_TURN) {
    scheduleAI();
  } else {
    updateBanner();
    updateInteractiveState();
  }
}

function scheduleAI() {
  if (game.phase !== PHASE.AI_TURN || aiTimer !== null) return;
  busy = true;
  updateBanner();
  renderPowers();
  updateInteractiveState();
  aiTimer = window.setTimeout(runAIShot, AI_DELAY_MS);
}

function runAIShot() {
  aiTimer = null;
  if (game.phase !== PHASE.AI_TURN) {
    busy = false;
    updateInteractiveState();
    return;
  }

  const outcome = game.aiFire();
  if (outcome) {
    recordShot('enemy', outcome);
    resolveOutcome(outcome, {
      gridEl: dom.playerGrid,
      layerEl: dom.playerShips,
      markerEl: dom.playerMarkers,
      wrapEl: dom.playerWrap,
      actor: 'enemy',
    });
    scheduleDefensiveMarkerRelease(outcome.releasedDefensiveCells);
  }

  if (game.phase === PHASE.AI_TURN) {
    updateBanner();
    aiTimer = window.setTimeout(runAIShot, AI_DELAY_MS);
    return;
  }

  busy = false;
  renderPowers();
  if (game.phase === PHASE.OVER) finishGame();
  else {
    updateBanner();
    updateInteractiveState();
  }
}

function analyticsFor(events) {
  const playerShots = events.filter((event) => event.type === 'shot' && event.actor === 'player');
  const firstHitIndex = playerShots.findIndex((event) => event.result === 'hit');
  const sinks = playerShots
    .map((event, index) => ({ event, shot: index + 1 }))
    .filter(({ event }) => event.sunk)
    .map(({ event, shot }) => ({ shipName: event.shipName, shot }));
  return {
    firstHitShot: firstHitIndex === -1 ? null : firstHitIndex + 1,
    shotsToSink: sinks,
    heatMap: playerShots.map(({ row, col, result }) => ({ row, col, result })),
  };
}

function matchSnapshot() {
  const events = clone(timeline);
  return {
    endedAt: new Date().toISOString(),
    mode: game.mode,
    variant: game.variant,
    aiPersonality: game.config.aiPersonality,
    daily: settings.daily,
    dailyKey: settings.daily ? activeDailyKey : null,
    winner: game.winner,
    endReason: game.endReason,
    boardSize: game.boardSize,
    fleet: clone(game.fleet),
    playerStats: clone(game.playerStats),
    enemyStats: clone(game.enemyStats),
    playerShipsLost: game.playerBoard.ships.filter((ship) => game.playerBoard.isShipSunk(ship)).length,
    abilitiesUsed: [...powerState.usedAbilities],
    powerupsEarned: clone(powerState.awardLog),
    events,
    analytics: analyticsFor(events),
    playerShips: clone(game.playerBoard.ships),
    enemyShips: clone(game.enemyBoard.ships),
  };
}

function showOverlay(match, achievements = []) {
  const won = match.winner === 'player';
  dom.overlayTitle.textContent = won ? 'Victory' : 'Defeat';
  if (match.endReason === 'ammo-exhausted') {
    dom.overlaySubtitle.textContent = 'Ammunition exhausted before the enemy fleet was destroyed.';
  } else if (achievements.length > 0) {
    dom.overlaySubtitle.textContent = `Achievement unlocked: ${achievements.map((id) => ACHIEVEMENTS[id].title).join(', ')}.`;
  } else {
    dom.overlaySubtitle.textContent = won ? 'Enemy fleet destroyed.' : 'Your fleet has been sunk.';
  }
  const firstHit = match.analytics.firstHitShot ?? '—';
  const finalSink = match.analytics.shotsToSink.at(-1)?.shot ?? '—';
  dom.overlayStats.innerHTML = `
    <div><dt>Your shots</dt><dd>${match.playerStats.shots}</dd></div>
    <div><dt>Your accuracy</dt><dd>${accuracy(match.playerStats)}%</dd></div>
    <div><dt>First hit</dt><dd>${firstHit}</dd></div>
    <div><dt>Final sink</dt><dd>${finalSink}</dd></div>
    <div><dt>Enemy shots</dt><dd>${match.enemyStats.shots}</dd></div>
    <div><dt>Enemy accuracy</dt><dd>${accuracy(match.enemyStats)}%</dd></div>
  `;
  dom.overlay.classList.remove('hidden');
  dom.overlay.setAttribute('aria-hidden', 'false');
  setPageInert(true);
  dom.playAgainBtn.focus();
}

function finishGame() {
  if (!matchRecorded) {
    renderEnemyShips();
    updateBanner();
    updateStats();
    updateInteractiveState();
    const summary = matchSnapshot();
    const unlocked = profileStore.recordMatch(summary);
    latestMatch = profileStore.getHistory()[0];
    matchRecorded = true;
    if (settings.daily) {
      profileStore.recordDailyChallenge({
        shots: summary.playerStats.shots,
        completed: summary.winner === 'player',
        winner: summary.winner,
      }, activeDailyKey);
    }
    renderProfile();
    renderDailyStatus();
    if (summary.winner === 'player') audio.play('victory');
    overlayTimer = window.setTimeout(() => {
      overlayTimer = null;
      showOverlay(summary, unlocked);
    }, RESULT_DELAY_MS);
  }
}

function startBattle() {
  if (!game.startBattle()) return;
  dom.setupPanel.classList.add('hidden');
  powerState.clearSelection();
  renderBoards();
  renderPowers();
  updateStats();
  updateBanner();
  updateInteractiveState();
  logMessage(
    settings.daily
      ? 'Daily operation underway. Destroy the fixed fleet in no more than 32 shots.'
      : `${game.mode === BASE_MODES.POWER ? 'Power' : 'Classic'} battle stations! Fire at will.`
  );
}

function newGame({ announce = false } = {}) {
  clearTimers();
  audio.stopAll();
  activeDailyKey = settings.daily ? dailyKey() : null;
  game = new Game(currentGameOptions());
  powerState.reset();
  game.setEnemyShotDefender(createEnemyShotDefender(powerState));
  placement.selectedShipId = game.fleet[0].id;
  placement.orientation = HORIZONTAL;
  placement.anchorIndex = 0;
  placement.carrying = false;
  placement.pointerId = null;
  placement.suppressClick = false;
  placement.ghost?.remove();
  placement.ghost = null;
  document.body.classList.remove('dragging-ship');
  busy = false;
  matchRecorded = false;
  nextHitReward = 3;
  timeline = [];
  dom.log.innerHTML = '';
  dom.overlay.classList.add('hidden');
  dom.overlay.setAttribute('aria-hidden', 'true');
  closeReplay(false);
  setPageInert(false);
  dom.setupPanel.classList.remove('hidden');
  rebuildBoards();
  renderModeControls();
  renderBoards();
  renderPowers();
  refreshSetup();
  updateStats();
  updateBanner();
  updateInteractiveState();
  if (announce) logMessage('Mission settings updated. Deploy your fleet.');
}

function renderProfile() {
  const profile = profileStore.getProfile();
  const career = profile.career;
  dom.careerStats.innerHTML = `
    <div><dt>Matches</dt><dd>${career.games}</dd></div>
    <div><dt>Wins</dt><dd>${career.wins}</dd></div>
    <div><dt>Career accuracy</dt><dd>${career.accuracy}%</dd></div>
    <div><dt>Best streak</dt><dd>${career.bestStreak}</dd></div>
  `;

  dom.matchHistory.innerHTML = '';
  if (profile.history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Completed battles will appear here.';
    dom.matchHistory.appendChild(empty);
  } else {
    profile.history.slice(0, 8).forEach((match) => {
      const item = document.createElement('li');
      const summary = document.createElement('span');
      const name = match.daily ? 'Daily' : (VARIANT_NAMES[match.variant] ?? match.variant);
      summary.textContent = `${match.winner === 'player' ? 'Win' : 'Loss'} · ${name}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-replay';
      button.dataset.matchId = match.id;
      button.textContent = `${match.playerStats?.shots ?? 0} shots · Replay`;
      button.disabled = game?.phase !== PHASE.SETUP;
      item.append(summary, button);
      dom.matchHistory.appendChild(item);
    });
  }

  const unlocked = new Set(profile.achievements.map((entry) => entry.id));
  dom.achievements.innerHTML = '';
  Object.values(ACHIEVEMENTS).forEach((achievement) => {
    const item = document.createElement('li');
    const earned = unlocked.has(achievement.id);
    item.className = `achievement ${earned ? 'unlocked' : 'locked'}`;
    const icon = document.createElement('span');
    icon.className = 'achievement-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = earned ? '◆' : '◇';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = achievement.title;
    const description = document.createElement('small');
    description.textContent = achievement.description;
    copy.append(title, description);
    item.append(icon, copy);
    dom.achievements.appendChild(item);
  });

  latestMatch = latestMatch ?? profile.history[0] ?? null;
  dom.replayBtn.disabled = !latestMatch || game?.phase !== PHASE.SETUP;
}

function validChoice(select, value, fallback) {
  return Array.from(select.options).some((option) => option.value === value) ? value : fallback;
}

function applyCustomization() {
  const customization = profileStore.getProfile().customization;
  const theme = validChoice(dom.themeSelect, customization.theme, 'navy');
  const effect = validChoice(dom.effectSelect, customization.effect, 'classic');
  const flag = validChoice(dom.flagSelect, customization.flag, 'none');
  const victory = validChoice(dom.victorySelect, customization.victory, 'signal');
  document.body.classList.remove('theme-navy', 'theme-arctic', 'theme-sunset');
  document.body.classList.remove('effect-classic', 'effect-impact', 'effect-minimal');
  document.body.classList.remove('flag-ensign', 'flag-anchor', 'flag-skull', 'flag-none');
  document.body.classList.remove('victory-signal', 'victory-fireworks', 'victory-fleet');
  document.body.classList.add(`theme-${theme}`, `effect-${effect}`, `flag-${flag}`, `victory-${victory}`);
  dom.themeSelect.value = theme;
  dom.effectSelect.value = effect;
  dom.flagSelect.value = flag;
  dom.victorySelect.value = victory;
}

function replayShips(match, side) {
  return side === 'player'
    ? match.playerShips ?? []
    : match.enemyShips ?? [];
}

function buildReplayGrid(gridEl, size, ships) {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`;
  for (let index = 0; index < size * size; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'replay-cell';
    gridEl.appendChild(cell);
  }
  ships.forEach((ship) => {
    ship.cells?.forEach(({ row, col }) => {
      gridEl.children[row * size + col]?.classList.add('ship');
    });
  });
}

function replayEventLabel(frame) {
  if (!frame.event) return 'Opening positions';
  const event = frame.event;
  if (event.type === 'shot') {
    const actor = event.actor === 'player' ? 'You' : 'Computer';
    const result = event.blockedBy ? `${event.blockedBy} blocked the hit` : event.result;
    return `Step ${frame.index} of ${replayFrames.length - 1}: ${actor} at ${coordLabel(event.row, event.col)} — ${result}.`;
  }
  const label = String(event.ability ?? event.action ?? 'Tactical action').replaceAll('-', ' ');
  return `Step ${frame.index} of ${replayFrames.length - 1}: ${label}.`;
}

function renderReplayFrame() {
  const frame = replayFrames[replayIndex];
  if (!frame || !replayMatch) return;
  const size = replayMatch.boardSize ?? 10;
  Array.from(dom.replayPlayerGrid.children).forEach((cell) => cell.classList.remove('hit', 'miss'));
  Array.from(dom.replayEnemyGrid.children).forEach((cell) => cell.classList.remove('hit', 'miss'));
  frame.playerShots.forEach((shot) => {
    dom.replayPlayerGrid.children[shot.row * size + shot.col]?.classList.add(shot.result);
  });
  frame.enemyShots.forEach((shot) => {
    dom.replayEnemyGrid.children[shot.row * size + shot.col]?.classList.add(shot.result);
  });
  dom.replayFrameLabel.textContent = replayEventLabel(frame);
  dom.replayPrevBtn.disabled = replayIndex === 0;
  dom.replayNextBtn.disabled = replayIndex === replayFrames.length - 1;
  dom.replayNextBtn.textContent = replayIndex === replayFrames.length - 1 ? 'Replay complete' : 'Next turn';
}

function openReplay(match = latestMatch) {
  if (!match) return;
  replayReturnFocus = document.activeElement;
  replayMatch = match;
  replayFrames = createReplayFrames(match);
  replayIndex = 0;
  const size = match.boardSize ?? 10;
  buildReplayGrid(dom.replayPlayerGrid, size, replayShips(match, 'player'));
  buildReplayGrid(dom.replayEnemyGrid, size, replayShips(match, 'enemy'));
  dom.replayTitle.textContent = `${match.winner === 'player' ? 'Victory' : 'Defeat'} · ${match.daily ? 'Daily challenge' : VARIANT_NAMES[match.variant] ?? 'Battle'}`;
  dom.replayOverlay.classList.remove('hidden');
  dom.replayOverlay.setAttribute('aria-hidden', 'false');
  setPageInert(true);
  renderReplayFrame();
  dom.replayCloseBtn.focus();
}

function closeReplay(restoreFocus = true) {
  if (!dom.replayOverlay) return;
  dom.replayOverlay.classList.add('hidden');
  dom.replayOverlay.setAttribute('aria-hidden', 'true');
  replayMatch = null;
  replayFrames = [];
  replayIndex = 0;
  if (dom.overlay.classList.contains('hidden')) setPageInert(false);
  if (restoreFocus && replayReturnFocus instanceof HTMLElement) replayReturnFocus.focus();
  replayReturnFocus = null;
}

function setPageInert(inert) {
  document.querySelector('.topbar').inert = inert;
  document.querySelector('main').inert = inert;
}

function trapDialogFocus(event, dialog) {
  if (event.key !== 'Tab' || dialog.classList.contains('hidden')) return;
  const focusable = Array.from(
    dialog.querySelectorAll('button:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function wireTray() {
  dom.tray.addEventListener('click', (event) => {
    const item = event.target.closest('.tray-item');
    if (!item || game.phase !== PHASE.SETUP) return;
    placement.selectedShipId = item.dataset.shipId;
    placement.anchorIndex = 0;
    renderTray();
  });
  dom.tray.addEventListener('pointerdown', (event) => {
    const item = event.target.closest('.tray-item');
    if (!item || !event.isPrimary || event.button !== 0 || game.phase !== PHASE.SETUP) return;
    event.preventDefault();
    startDrag(event, item.dataset.shipId, 0);
  });
  dom.tray.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.tray-item')) return;
    event.preventDefault();
    rotateSelected();
  });
}

function wirePlayerBoard() {
  dom.playerGrid.addEventListener('mousemove', (event) => {
    if (game.phase !== PHASE.SETUP || placement.carrying) return;
    const cell = event.target.closest('.cell');
    if (cell) showPreview(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  dom.playerGrid.addEventListener('mouseleave', clearPreview);
  dom.playerGrid.addEventListener('click', (event) => {
    if (placement.suppressClick) {
      placement.suppressClick = false;
      return;
    }
    if (game.phase !== PHASE.SETUP) return;
    const cell = event.target.closest('.cell');
    if (!cell) return;
    tryPlace(Number(cell.dataset.row), Number(cell.dataset.col));
    clearPreview();
  });
  dom.playerGrid.addEventListener('contextmenu', (event) => {
    if (game.phase !== PHASE.SETUP) return;
    event.preventDefault();
    rotateSelected();
    const cell = event.target.closest('.cell');
    if (cell) showPreview(Number(cell.dataset.row), Number(cell.dataset.col));
  });
  dom.playerShips.addEventListener('pointerdown', (event) => {
    const sprite = event.target.closest('.ship-sprite');
    if (!sprite || !event.isPrimary || event.button !== 0 || game.phase !== PHASE.SETUP) return;
    const ship = game.playerBoard.ships.find((entry) => entry.id === sprite.dataset.shipId);
    if (!ship) return;
    event.preventDefault();
    placement.orientation = ship.orientation;
    startDrag(event, ship.id, grabbedSegment(event, sprite, ship));
  });
  document.addEventListener('pointermove', (event) => {
    if (!placement.carrying || event.pointerId !== placement.pointerId) return;
    event.preventDefault();
    updateDrag(event.clientX, event.clientY);
  });
  document.addEventListener('pointerup', (event) => {
    if (!placement.carrying || event.pointerId !== placement.pointerId) return;
    updateDrag(event.clientX, event.clientY);
    endDrag();
  });
  document.addEventListener('pointercancel', (event) => {
    if (!placement.carrying || event.pointerId !== placement.pointerId) return;
    endDrag({ cancelled: true });
  });
}

function changeMode(mode) {
  if (game.phase !== PHASE.SETUP || settings.daily || settings.mode === mode) return;
  settings.mode = mode;
  newGame({ announce: true });
}

function wireControls() {
  dom.rotateBtn.addEventListener('click', rotateSelected);
  dom.randomBtn.addEventListener('click', () => {
    game.playerBoard.placeRandomly(game.fleet);
    refreshSetup();
  });
  dom.clearBtn.addEventListener('click', () => {
    game.playerBoard.clear();
    placement.selectedShipId = game.fleet[0].id;
    refreshSetup();
  });
  dom.startBtn.addEventListener('click', startBattle);
  dom.restartBtn.addEventListener('click', () => {
    newGame();
    dom.randomBtn.focus();
  });
  dom.playAgainBtn.addEventListener('click', () => {
    newGame();
    dom.randomBtn.focus();
  });
  dom.classicBtn.addEventListener('click', () => changeMode(BASE_MODES.CLASSIC));
  dom.powerBtn.addEventListener('click', () => changeMode(BASE_MODES.POWER));
  dom.variantSelect.addEventListener('change', () => {
    if (game.phase !== PHASE.SETUP || settings.daily) return;
    settings.variant = dom.variantSelect.value;
    newGame({ announce: true });
  });
  dom.aiSelect.addEventListener('change', () => {
    if (game.phase !== PHASE.SETUP || settings.daily) return;
    settings.aiPersonality = dom.aiSelect.value;
    newGame({ announce: true });
  });
  dom.dailyBtn.addEventListener('click', () => {
    if (game.phase !== PHASE.SETUP) return;
    settings.daily = !settings.daily;
    newGame({ announce: true });
  });
  dom.muteBtn.addEventListener('click', () => {
    const muted = audio.toggleMute();
    dom.muteBtn.textContent = `Sound: ${muted ? 'Off' : 'On'}`;
    dom.muteBtn.setAttribute('aria-pressed', String(muted));
  });
  dom.enemyGrid.addEventListener('click', handleEnemyCellClick);
  dom.abilityList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action-id]');
    if (button) choosePowerAction(button.dataset.kind, button.dataset.actionId);
  });
  dom.powerupList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action-id]');
    if (button) choosePowerAction(button.dataset.kind, button.dataset.actionId);
  });
  dom.replayBtn.addEventListener('click', () => openReplay(latestMatch));
  dom.matchHistory.addEventListener('click', (event) => {
    const button = event.target.closest('.history-replay');
    if (!button) return;
    openReplay(profileStore.getMatch(button.dataset.matchId));
  });
  dom.replayCloseBtn.addEventListener('click', () => closeReplay());
  dom.replayPrevBtn.addEventListener('click', () => {
    replayIndex = Math.max(0, replayIndex - 1);
    renderReplayFrame();
  });
  dom.replayNextBtn.addEventListener('click', () => {
    replayIndex = Math.min(replayFrames.length - 1, replayIndex + 1);
    renderReplayFrame();
  });
  [
    ['theme', dom.themeSelect],
    ['effect', dom.effectSelect],
    ['flag', dom.flagSelect],
    ['victory', dom.victorySelect],
  ].forEach(([key, select]) => {
    select.addEventListener('change', () => {
      profileStore.setCustomization({ [key]: select.value });
      applyCustomization();
    });
  });
  document.addEventListener('keydown', (event) => {
    trapDialogFocus(event, dom.replayOverlay);
    trapDialogFocus(event, dom.overlay);
    const dialogOpen =
      !dom.replayOverlay.classList.contains('hidden') || !dom.overlay.classList.contains('hidden');
    if (!dialogOpen && event.key.toLowerCase() === 'r' && game.phase === PHASE.SETUP) {
      rotateSelected();
    }
    if (event.key === 'Escape') {
      if (placement.carrying) endDrag({ cancelled: true });
      else if (!dom.replayOverlay.classList.contains('hidden')) closeReplay();
      else if (powerState.selected) {
        powerState.clearSelection();
        renderPowers();
        updateInteractiveState();
      }
    }
  });
}

function init() {
  game = new Game(currentGameOptions());
  wireTray();
  wirePlayerBoard();
  wireControls();
  dom.muteBtn.textContent = `Sound: ${audio.isMuted ? 'Off' : 'On'}`;
  dom.muteBtn.setAttribute('aria-pressed', String(audio.isMuted));
  renderProfile();
  applyCustomization();
  newGame();
}

init();

// A read-only-ish console surface for deterministic QA and debugging.
window.battleship = {
  get game() { return game; },
  get settings() { return { ...settings }; },
  get powerState() { return powerState.snapshot(); },
  get profile() { return profileStore.getProfile(); },
  restart: () => newGame(),
};
