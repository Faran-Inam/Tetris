// script.js — Full Tetris logic (cleaned & minimal UI)

// Canvas elements (logical sizes are set in HTML; CSS scales them visually)
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');

const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');

// Colors for pieces (index matches matrix values)
const colors = [
  null,
  '#FF0D72', // 1
  '#0DC2FF', // 2
  '#0DFF72', // 3
  '#F538FF', // 4
  '#FF8E0D', // 5
  '#FFE138', // 6
  '#3877FF', // 7
];

// Helpers
function createMatrix(w, h) {
  const m = [];
  while (h--) m.push(new Array(w).fill(0));
  return m;
}

function createPiece(type) {
  switch (type) {
    case 'T':
      return [
        [0, 0, 0],
        [1, 1, 1],
        [0, 1, 0],
      ];
    case 'O':
      return [
        [2, 2],
        [2, 2],
      ];
    case 'L':
      return [
        [0, 3, 0],
        [0, 3, 0],
        [0, 3, 3],
      ];
    case 'J':
      return [
        [0, 4, 0],
        [0, 4, 0],
        [4, 4, 0],
      ];
    case 'I':
      return [
        [0, 5, 0, 0],
        [0, 5, 0, 0],
        [0, 5, 0, 0],
        [0, 5, 0, 0],
      ];
    case 'S':
      return [
        [0, 6, 6],
        [6, 6, 0],
        [0, 0, 0],
      ];
    case 'Z':
      return [
        [7, 7, 0],
        [0, 7, 7],
        [0, 0, 0],
      ];
  }
}

// Game state
const arena = createMatrix(12, 20);

const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
  score: 0,
  lines: 0,
  level: 1,
};

// Next piece holder
let nextPiece = null;

// Timing & control
let dropCounter = 0;
let dropInterval = 1000; // ms - will be adjusted by difficulty/level
let lastTime = 0;
let playing = false;
let paused = false;

// Sound
let soundOn = true;
let audioCtx = null;
function beep(f = 440, d = 0.06) {
  if (!soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'sine';
  o.frequency.value = f;
  g.gain.setValueAtTime(0.12, audioCtx.currentTime);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d);
  o.stop(audioCtx.currentTime + d + 0.02);
}

// Difficulty presets
const difficulties = {
  easy:   { base: 1200, speedFactor: 0.85 },
  normal: { base: 1000, speedFactor: 0.78 },
  hard:   { base: 700,  speedFactor: 0.72 },
};

// Score table (classic multipliers)
const lineScoreBase = [0, 40, 100, 300, 1200];

// Collision, merge, rotate
function collide(arena, player) {
  const m = player.matrix;
  const o = player.pos;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x] !== 0 &&
          (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        arena[y + player.pos.y][x + player.pos.x] = value;
      }
    });
  });
}

function rotate(matrix, dir) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < y; x++) {
      [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
  }
  if (dir > 0) {
    matrix.forEach(row => row.reverse());
  } else {
    matrix.reverse();
  }
}

// Player actions
function playerDrop() {
  if (!playing || paused) return;
  player.pos.y++;
  if (collide(arena, player)) {
    player.pos.y--;
    merge(arena, player);
    const linesCleared = arenaSweep();
    if (linesCleared > 0) {
      const base = lineScoreBase[linesCleared] || 0;
      const gained = base * player.level;
      player.score += gained;
      player.lines += linesCleared;
      const oldLevel = player.level;
      player.level = Math.floor(player.lines / 10) + 1;
      if (player.level > oldLevel) applySpeed();
    }
    updateUI();
    playerReset();
  }
  dropCounter = 0;
}

function playerMove(dir) {
  if (!playing || paused) return;
  player.pos.x += dir;
  if (collide(arena, player)) {
    player.pos.x -= dir;
    return;
  }
  beep(900, 0.02);
}

// Hard drop
function hardDrop() {
  if (!playing || paused) return;
  let drop = 0;
  while (!collide(arena, player)) {
    player.pos.y++;
    drop++;
  }
  player.pos.y--;
  drop--; // last increment collides
  if (drop > 0) player.score += drop * 2;
  merge(arena, player);

  const linesCleared = arenaSweep();
  if (linesCleared > 0) {
    const base = lineScoreBase[linesCleared] || 0;
    const gained = base * player.level;
    player.score += gained;
    player.lines += linesCleared;
    const oldLevel = player.level;
    player.level = Math.floor(player.lines / 10) + 1;
    if (player.level > oldLevel) applySpeed();
  }
  updateUI();
  playerReset();
  dropCounter = 0;
  beep(1400, 0.06);
}

// Rotate with simple wall kicks
function playerRotate(dir) {
  if (!playing || paused) return;
  const pos = player.pos.x;
  let offset = 1;
  rotate(player.matrix, dir);
  while (collide(arena, player)) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (Math.abs(offset) > player.matrix[0].length) {
      rotate(player.matrix, -dir);
      player.pos.x = pos;
      return;
    }
  }
  beep(1200, 0.02);
}

// Reset player (spawn next piece)
function playerReset() {
  if (!nextPiece) nextPiece = randomPiece();
  player.matrix = nextPiece;
  nextPiece = randomPiece();
  player.pos.y = 0;
  player.pos.x = Math.floor((arena[0].length / 2) - (player.matrix[0].length / 2));
  if (collide(arena, player)) {
    // Game over - stop the game and clear the arena
    playing = false;
    paused = false;
    // clear arena visually but keep scores so player can restart
    arena.forEach(row => row.fill(0));
    updateUI(true);
    // subtle game over sound
    beep(220, 0.25);
  }
  drawNext();
}

function randomPiece() {
  const pieces = 'TJLOSZI';
  const t = pieces[Math.floor(Math.random() * pieces.length)];
  return createPiece(t);
}

// Clear full rows
function arenaSweep() {
  let rowCount = 0;
  outer: for (let y = arena.length - 1; y >= 0; --y) {
    for (let x = 0; x < arena[y].length; ++x) {
      if (arena[y][x] === 0) {
        continue outer;
      }
    }
    const row = arena.splice(y, 1)[0].fill(0);
    arena.unshift(row);
    ++y;
    rowCount++;
  }
  return rowCount;
}

// Drawing
function draw() {
  // Clear logical canvas (we draw one cell = 1x1 logical unit)
  ctx.fillStyle = '#03040a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMatrix(arena, { x: 0, y: 0 }, ctx);
  drawMatrix(player.matrix, player.pos, ctx);
}

function drawMatrix(matrix, offset, context) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      const val = matrix[y][x];
      if (val !== 0) {
        const px = x + offset.x;
        const py = y + offset.y;
        context.fillStyle = colors[val];
        context.fillRect(px, py, 1, 1);

        // small inner shade
        context.fillStyle = 'rgba(0,0,0,0.12)';
        context.fillRect(px + 0.08, py + 0.08, 0.84, 0.12);
      }
    }
  }
}

// Draw next-piece preview (centered in 6x6)
function drawNext() {
  nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const matrix = nextPiece;
  const mH = matrix.length;
  const mW = matrix[0].length;
  const offsetX = Math.floor((nextCanvas.width - mW) / 2);
  const offsetY = Math.floor((nextCanvas.height - mH) / 2);
  for (let y = 0; y < mH; y++) {
    for (let x = 0; x < mW; x++) {
      const v = matrix[y][x];
      if (v !== 0) {
        nctx.fillStyle = colors[v];
        nctx.fillRect(x + offsetX, y + offsetY, 1, 1);
      }
    }
  }
}

// Game loop
function update(time = 0) {
  if (!playing) {
    lastTime = time;
    requestAnimationFrame(update);
    return;
  }
  if (!paused) {
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      playerDrop();
    }
  } else {
    // keep lastTime fresh so when unpaused there's no massive skip
    lastTime = time;
  }
  draw();
  requestAnimationFrame(update);
}

// UI elements
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const difficultyEl = document.getElementById('difficulty');
const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const soundBtn = document.getElementById('toggle-sound');

function updateUI(gameOver = false) {
  scoreEl.textContent = player.score;
  levelEl.textContent = player.level;
  linesEl.textContent = player.lines;
  document.title = `Tetris — Score: ${player.score} | Level ${player.level}`;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  soundBtn.textContent = `Sound: ${soundOn ? 'On' : 'Off'}`;
  startBtn.textContent = playing ? 'Restart' : 'Start';
  if (gameOver) {
    // small visual cue: change start text to "Restart"
    startBtn.textContent = 'Restart';
  }
}

function applySpeed() {
  const diff = difficultyEl.value;
  const preset = difficulties[diff] || difficulties.normal;
  const base = preset.base;
  const sf = preset.speedFactor;
  const exponent = player.level - 1;
  const pow = Math.pow(sf, exponent);
  const finalInterval = Math.max(80, Math.round(base * pow));
  dropInterval = finalInterval;
}

// Buttons
startBtn.addEventListener('click', () => {
  // reset
  for (let y = 0; y < arena.length; y++) arena[y].fill(0);
  player.score = 0;
  player.lines = 0;
  player.level = 1;
  nextPiece = randomPiece();
  playerReset();
  applySpeed();
  playing = true;
  paused = false;
  updateUI();
  beep(1200, 0.06);
});

pauseBtn.addEventListener('click', () => {
  if (!playing) return;
  paused = !paused;
  updateUI();
});

difficultyEl.addEventListener('change', () => {
  applySpeed();
  beep(600, 0.03);
});

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  updateUI();
});

// Keyboard controls
document.addEventListener('keydown', (ev) => {
  if (!playing && ev.code === 'Space') return;
  switch (ev.code) {
    case 'ArrowLeft': playerMove(-1); break;
    case 'ArrowRight': playerMove(1); break;
    case 'ArrowDown': playerDrop(); break; // soft drop
    case 'KeyQ': playerRotate(-1); break;
    case 'KeyW': playerRotate(1); break;
    case 'Space': ev.preventDefault(); hardDrop(); break; // hard drop
    case 'KeyP': if (playing) { paused = !paused; updateUI(); } break;
    case 'KeyR': startBtn.click(); break;
  }
});

// Prevent arrow keys / space from scrolling page
window.addEventListener('keydown', function(e) {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) > -1) {
    e.preventDefault();
  }
}, false);

// Init
nextPiece = randomPiece();
playerReset();
applySpeed();
updateUI();
requestAnimationFrame(update);