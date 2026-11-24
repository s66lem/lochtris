'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadAppContext(extraGlobals = {}) {
  const ctx = Object.assign({
    console,
    Math,
    Uint8Array,
    Array,
    Object,
    Boolean,
    Number,
    String,
    JSON,
    Date,
    isFinite,
    parseFloat,
    parseInt,
    encodeURIComponent,
    decodeURIComponent
  }, extraGlobals);
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['data.js', 'problemData.js', 'problem.js', 'techniques.js', 'storage.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

const ctx = loadAppContext();
const D = ctx.LochtrisData;
const Eng = ctx.LochtrisEngine;

// Deterministic seeded PRNG (Mulberry32) so tests never flake on random 7-bag order
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper: legal SRS+ BFS reachability for a single placement (supports 90°-only or 90°+180°)
function findReachablePlacement(eng, guide, allow180) {
  const targetY = guide.y + D.DEADLINE_HEIGHT;
  const visited = new Set();
  const q = [{ x: eng.curX, y: eng.curY, dir: eng.curDir, tSpin: 0, allSpin: null, rotStep: 0 }];
  visited.add(`${eng.curX},${eng.curY},${eng.curDir},0,,0`);
  const acts = allow180 ? ['left', 'right', 'down', 'cw', 'ccw', '180'] : ['left', 'right', 'down', 'cw', 'ccw'];
  let best = null;

  while (q.length) {
    const cur = q.shift();
    if (!eng.canPlace(eng.curMino, cur.dir, cur.x, cur.y + 1)) {
      if (eng.curMino.id === guide.mino.id &&
          Eng.samePlacement(eng.curMino, cur.dir, cur.x, cur.y, guide.mino, guide.dir, guide.x, targetY)) {
        const spinOk = !guide.requiresSpin || cur.tSpin > 0 || cur.allSpin !== null;
        const rot180Ok = !guide.requires180 || cur.rotStep === 2;
        if (spinOk && rot180Ok) {
          return cur;
        }
        if (!best) best = cur;
      }
    }
    for (const act of acts) {
      eng.curX = cur.x; eng.curY = cur.y; eng.curDir = cur.dir;
      eng.tSpinType = cur.tSpin; eng.allSpinMino = cur.allSpin; eng.lastRotateStep = cur.rotStep;
      let ok = false;
      if (act === 'left' && eng.canPlace(eng.curMino, cur.dir, cur.x - 1, cur.y)) { eng.curX--; eng.clearSpinFlags(); ok = true; }
      else if (act === 'right' && eng.canPlace(eng.curMino, cur.dir, cur.x + 1, cur.y)) { eng.curX++; eng.clearSpinFlags(); ok = true; }
      else if (act === 'down' && eng.canPlace(eng.curMino, cur.dir, cur.x, cur.y + 1)) { eng.curY++; eng.clearSpinFlags(); ok = true; }
      else if (act === 'cw') ok = eng.rotate(1, true);
      else if (act === 'ccw') ok = eng.rotate(-1, true);
      else if (act === '180') ok = eng.rotate180(true);
      if (ok) {
        const k = `${eng.curX},${eng.curY},${eng.curDir},${eng.tSpinType},${eng.allSpinMino || ''},${eng.lastRotateStep}`;
        if (!visited.has(k)) {
          visited.add(k);
          q.push({ x: eng.curX, y: eng.curY, dir: eng.curDir, tSpin: eng.tSpinType, allSpin: eng.allSpinMino, rotStep: eng.lastRotateStep });
        }
      }
    }
  }
  return best;
}

function countCoveredHoles(matrix) {
  let holes = 0;
  for (let c = 0; c < D.MATRIX_WIDTH; c++) {
    let seen = false;
    for (let r = D.DEADLINE_HEIGHT; r < D.MATRIX_HEIGHT; r++) {
      if (matrix[r][c] !== 0) seen = true;
      else if (seen) holes++;
    }
  }
  return holes;
}

test('SRS+ I-piece 90-degree kick table matches symmetric SRS+ specification', () => {
  const K = D.KICKS_I;
  const norm = (arr) => Array.from(arr, (p) => [p[0], p[1]]);
  assert.deepEqual(norm(K['0>1']), [[0, 0], [1, 0], [-2, 0], [-2, 1], [1, -2]]);
  assert.deepEqual(norm(K['1>0']), [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]);
  assert.deepEqual(norm(K['1>2']), [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]);
  assert.deepEqual(norm(K['2>1']), [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]);
  assert.deepEqual(norm(K['2>3']), [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]]);
  assert.deepEqual(norm(K['3>2']), [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]);
  assert.deepEqual(norm(K['3>0']), [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]]);
  assert.deepEqual(norm(K['0>3']), [[0, 0], [-1, 0], [2, 0], [2, 1], [-1, -2]]);

  const mirrorPairs = [['0>1', '0>3'], ['1>0', '3>0'], ['1>2', '3>2'], ['2>1', '2>3']];
  for (const [a, b] of mirrorPairs) {
    for (let i = 0; i < 5; i++) {
      assert.equal(K[a][i][0], -K[b][i][0] + 0, `${a} vs ${b} x at index ${i}`);
      assert.equal(K[a][i][1], K[b][i][1], `${a} vs ${b} y at index ${i}`);
    }
  }
});

test('Handling: ARR = 0F snaps instantly to wall after DAS completes', () => {
  const eng = new Eng({ rng: makeRng(11), handling: { das: 6.0, arr: 0.0, dcd: 0.0, sdf: 20 } });
  eng.startFreeMode('zen');
  eng.pressAction('right');
  const afterInitial = eng.curX;
  assert.equal(afterInitial, D.INITIAL_X + 1);

  eng.update(5 * D.FRAME_MS);
  assert.equal(eng.curX, afterInitial);

  eng.update(1.5 * D.FRAME_MS);
  assert.equal(eng.canPlace(eng.curMino, eng.curDir, eng.curX + 1, eng.curY), false);
});

test('Handling: SDF = Infinity sonic-drops instantly and re-drops off ledges', () => {
  const eng = new Eng({ handling: { das: 8, arr: 1, dcd: 0, sdf: 41 } });
  const prob = {
    storageId: 'TEST_SONIC',
    initialBlocks: ctx.LochtrisTechniques.boardFromRows(['#####.....', '#####.....']),
    ingredients: [[], ctx.O],
    guides: [],
    useGuide: false,
    req: [0,0,0,0,0,0,0,0,0,0,1,0,0,0]
  };
  eng.loadProblem(prob, false);
  eng.pressAction('left');
  eng.pressAction('softDrop');
  const yOnShelf = eng.curY;
  assert.equal(eng.isGrounded(), true);

  eng.pressAction('right'); eng.pressAction('right'); eng.pressAction('right'); eng.pressAction('right');
  assert.equal(eng.curY, yOnShelf + 2);
});

test('Handling: SOCD last-key-wins and fallback on release', () => {
  const eng = new Eng({ rng: makeRng(12), handling: { das: 5, arr: 0, dcd: 0, sdf: 20, cancelDasOnDirChange: true } });
  eng.startFreeMode('zen');
  eng.pressAction('left');
  assert.equal(eng.activeDir, -1);
  eng.pressAction('right');
  assert.equal(eng.activeDir, 1);
  eng.releaseAction('right');
  assert.equal(eng.activeDir, -1);
  eng.releaseAction('left');
  assert.equal(eng.activeDir, 0);
});

test('Handling: DCD delays DAS repeat on spawn, hold, and rotation', () => {
  const eng = new Eng({ rng: makeRng(13), handling: { das: 4, arr: 0, dcd: 3, sdf: 20, preserveDasOnSpawn: true } });
  eng.startFreeMode('zen');
  eng.pressAction('left');
  eng.update(5 * D.FRAME_MS);
  assert.equal(eng.dasCharged, true);

  // DCD on spawn
  eng.pressAction('hardDrop');
  assert.equal(eng.curX, D.INITIAL_X);
  eng.update(2 * D.FRAME_MS);
  assert.equal(eng.curX, D.INITIAL_X, 'DCD blocks immediate snap on spawn');
  eng.update(2 * D.FRAME_MS);
  assert.equal(eng.canPlace(eng.curMino, eng.curDir, eng.curX - 1, eng.curY), false);

  // DCD on rotation (use deterministic T piece so O-piece no-op cannot occur)
  eng.curMino = ctx.T;
  eng.curDir = 0;
  eng.curX = D.INITIAL_X;
  eng.dcdTimerMs = 0;
  eng.rotate(1, true);
  assert.ok(eng.dcdTimerMs > 0, 'rotation applies DCD while DAS is charged');
});

test('Hold: respects once-per-piece, preserveDasOnSpawn=false, and spawn block-out', () => {
  const eng = new Eng({ rng: makeRng(14), handling: { das: 4, arr: 0, dcd: 2, sdf: 41, preserveDasOnSpawn: false } });
  eng.startFreeMode('zen');
  eng.pressAction('left');
  eng.update(5 * D.FRAME_MS);
  assert.equal(eng.dasCharged, true);

  const first = eng.curMino;
  const second = eng.queue[0];
  assert.equal(eng.pressAction('hold'), true);
  assert.equal(eng.curHold, first);
  assert.equal(eng.curMino, second);
  assert.equal(eng.canHold, false);
  assert.equal(eng.dasCharged, false, 'preserveDasOnSpawn=false clears DAS on hold');

  // Second hold emits holdDenied and does not swap
  let denied = false;
  eng.onEvent = (t) => { if (t === 'holdDenied') denied = true; };
  eng.pressAction('hold');
  assert.equal(denied, true);
  assert.equal(eng.curHold, first);
  assert.equal(eng.curMino, second);

  // Block-out on hold fails instead of overlapping blocks
  eng.canHold = true;
  for (let r = D.INITIAL_Y; r <= D.INITIAL_Y + 3; r++) {
    for (let c = 0; c < D.MATRIX_WIDTH; c++) eng.matrix[r][c] = 1;
  }
  assert.equal(eng.doHold(true), false);
  assert.equal(eng.state, 'failed');
});

test('Lock delay: exact gravity-to-lock split, DAS-vs-lock frame invariance, 15 ground resets, lower-row reset & lockWarn', () => {
  let warned = 0;
  const eng = new Eng({ rng: makeRng(42), onEvent: (t) => { if (t === 'lockWarn') warned++; } });
  eng.startFreeMode('zen');
  eng.curMino = ctx.T;
  eng.curDir = 0;
  eng.curX = D.INITIAL_X;
  eng.curY = D.INITIAL_Y;

  // Mid-air inputs never burn resets
  eng.pressAction('left'); eng.releaseAction('left');
  eng.pressAction('right'); eng.releaseAction('right');
  eng.pressAction('rotCW'); eng.releaseAction('rotCW');
  assert.equal(eng.lockResets, 0);

  // Exact gravity-to-lock split: place 1 cell above floor with 1ms left before gravity tick
  eng.curY = eng.getGhostY() - 1;
  eng.gravityAccumMs = D.BASE_GRAVITY_INTERVAL_MS - 49;
  eng.update(50); // lands at 49ms -> only 1ms should be credited to lockTimerMs
  assert.equal(eng.isGrounded(), true);
  assert.ok(eng.lockTimerMs <= 2, `expected ~1ms lockTimerMs, got ${eng.lockTimerMs}`);

  // Dropping to a strictly lower row on a clean board with a 2-row shelf resets lockResets to 0
  eng.pressAction('hardDrop');
  eng.matrix.forEach((r) => r.fill(0));
  eng.curMino = ctx.T;
  eng.curDir = 0;
  eng.curX = D.INITIAL_X;
  eng.curY = D.INITIAL_Y;
  eng.resetLockState();
  eng.matrix[D.MATRIX_HEIGHT - 1].fill(1);
  eng.matrix[D.MATRIX_HEIGHT - 2].fill(1);
  eng.sonicDrop(true);
  eng.pressAction('left'); eng.releaseAction('left');
  assert.equal(eng.lockResets, 1);

  // Clear shelf below piece and drop to lower row -> resets manipulation counter
  eng.matrix[D.MATRIX_HEIGHT - 1].fill(0);
  eng.matrix[D.MATRIX_HEIGHT - 2].fill(0);
  eng.sonicDrop(true);
  assert.equal(eng.lockResets, 0, 'falling to a lower row resets ground manipulation counter');

  // Burn all 15 ground resets -> locks immediately on next tick (without waiting 500ms)
  const beforePieces = eng.piecesPlaced;
  for (let i = 0; i < D.LOCK_RESET_LIMIT; i++) {
    if (i % 2 === 0) { eng.pressAction('left'); eng.releaseAction('left'); }
    else { eng.pressAction('right'); eng.releaseAction('right'); }
  }
  assert.equal(eng.lockResets, D.LOCK_RESET_LIMIT);
  eng.update(1);
  assert.equal(eng.piecesPlaced, beforePieces + 1, '15th ground reset forces immediate lock');

  // lockWarn fires once at 80% lock delay
  eng.sonicDrop(true);
  eng.update(D.LOCK_DELAY_MS * 0.85);
  assert.equal(warned, 1, 'lockWarn emitted once at 80% lock delay');
  eng.update(D.LOCK_DELAY_MS * 0.20);
  assert.equal(eng.piecesPlaced, beforePieces + 2);

  // Frame-slicing invariance: grounded DAS repeat at 19ms produces identical lockTimerMs (1ms)
  // whether updated in one 20ms frame or split into 18ms + 2ms!
  function setupGroundedDas() {
    const e = new Eng({ rng: makeRng(7), handling: { das: 6.0, arr: 0, dcd: 0, sdf: 20 } });
    e.startFreeMode('zen');
    e.curMino = ctx.T; e.curDir = 0; e.curX = 4; e.curY = D.INITIAL_Y;
    e.sonicDrop(true);
    e.pressAction('right'); // moves to x=5, starts DAS (100ms)
    e.update(81); // 19ms left before DAS fires; lockTimerMs = 81ms
    return e;
  }
  const single = setupGroundedDas();
  single.update(20);
  const split = setupGroundedDas();
  split.update(18);
  split.update(2);
  assert.ok(Math.abs(single.lockTimerMs - 1) < 0.01, `single 20ms frame expected ~1ms lockTimerMs, got ${single.lockTimerMs}`);
  assert.ok(Math.abs(single.lockTimerMs - split.lockTimerMs) < 0.01, `frame slicing mismatch: ${single.lockTimerMs} vs ${split.lockTimerMs}`);

  // Event order & frame-slicing invariance: lock at 10ms before DAS at 19ms produces identical
  // post-lock gravity, DAS, and elapsed state across update(20) vs update(18) + update(2)!
  const raceSingle = setupGroundedDas();
  raceSingle.lockTimerMs = D.LOCK_DELAY_MS - 10;
  const placedBefore = raceSingle.piecesPlaced;
  raceSingle.update(20);

  const raceSplit = setupGroundedDas();
  raceSplit.lockTimerMs = D.LOCK_DELAY_MS - 10;
  raceSplit.update(18);
  raceSplit.update(2);

  assert.equal(raceSingle.piecesPlaced, placedBefore + 1, 'piece locks at 10ms before DAS repeat at 19ms');
  assert.equal(raceSplit.piecesPlaced, placedBefore + 1, 'split update also locks before DAS repeat');
  assert.ok(Math.abs(raceSingle.gravityAccumMs - 10) < 0.01, `expected 10ms post-lock gravity, got ${raceSingle.gravityAccumMs}`);
  assert.ok(Math.abs(raceSingle.gravityAccumMs - raceSplit.gravityAccumMs) < 0.01, `post-lock gravity mismatch: ${raceSingle.gravityAccumMs} vs ${raceSplit.gravityAccumMs}`);
  assert.ok(Math.abs(raceSingle.dasTimerMs - raceSplit.dasTimerMs) < 0.01, `post-lock DAS mismatch: ${raceSingle.dasTimerMs} vs ${raceSplit.dasTimerMs}`);
  assert.ok(Math.abs(raceSingle.elapsedMs - raceSplit.elapsedMs) < 0.01, `elapsed mismatch: ${raceSingle.elapsedMs} vs ${raceSplit.elapsedMs}`);

  // Exact tie: lock and DAS both due at 19ms -> update(20) === update(19) + update(1) including dasTimerMs!
  const tieSingle = setupGroundedDas();
  tieSingle.lockTimerMs = D.LOCK_DELAY_MS - 19;
  tieSingle.update(20);

  const tieSplit = setupGroundedDas();
  tieSplit.lockTimerMs = D.LOCK_DELAY_MS - 19;
  tieSplit.update(19);
  tieSplit.update(1);

  assert.equal(tieSingle.piecesPlaced, tieSplit.piecesPlaced);
  assert.ok(Math.abs(tieSingle.dasTimerMs - tieSplit.dasTimerMs) < 0.01, `tie DAS mismatch: ${tieSingle.dasTimerMs} vs ${tieSplit.dasTimerMs}`);
  assert.ok(Math.abs(tieSingle.gravityAccumMs - tieSplit.gravityAccumMs) < 0.01, `tie gravity mismatch: ${tieSingle.gravityAccumMs} vs ${tieSplit.gravityAccumMs}`);
});

test('IRS & IHS work in hold mode and during 40L Sprint 3-2-1-GO countdown with pre-DAS', () => {
  const events = [];
  const eng = new Eng({
    rng: makeRng(101),
    handling: { das: 4, arr: 0, dcd: 0, sdf: 20, irs: 'hold', ihs: 'hold', sprintCountdown: true },
    onEvent: (t, e) => events.push([t, e])
  });
  eng.startFreeMode('sprint');
  assert.equal(eng.state, 'countdown');
  assert.equal(eng.curMino, null);

  // Use deterministic non-O pieces at front of queue so IRS rotation is guaranteed observable
  eng.queue[0] = ctx.I;
  eng.queue[1] = ctx.T;
  eng.queue[2] = ctx.J;
  const firstInQueue = eng.queue[0];
  const secondInQueue = eng.queue[1];
  eng.pressAction('left');
  eng.pressAction('rotCW');
  eng.pressAction('hold');

  // Advance past 1800ms countdown
  eng.update(600);
  eng.update(600);
  eng.update(650);

  assert.equal(eng.state, 'playing');
  assert.equal(eng.curHold, firstInQueue, 'IHS swapped first piece into hold on GO!');
  assert.equal(eng.curMino, secondInQueue, 'IHS spawned second piece on GO!');
  assert.equal(eng.curDir, 1, 'IRS rotated spawned piece CW on GO!');
  assert.equal(eng.canPlace(eng.curMino, eng.curDir, eng.curX - 1, eng.curY), false, 'pre-DAS snapped piece to left wall on GO!');

  // Subsequent spawn (ctx.J) while holding rotCCW triggers IRS again
  eng.releaseAction('hold');
  eng.releaseAction('rotCW');
  eng.releaseAction('left');
  eng.pressAction('rotCCW');
  eng.pressAction('hardDrop');
  assert.equal(eng.curDir, 3, 'IRS rotated next piece CCW while key held across hardDrop');
});

test('180° rotation never wrongly upgrades T-Spin Mini, and All-Mini+ formats callouts properly', () => {
  // 180° T-spin mini test: kickIndex 4 on 180° is [1,0], NOT the 90° special TST kick
  const eng = new Eng({ handling: { spinRule: 'all-mini+' } });
  const prob = {
    storageId: 'TEST_180_MINI',
    initialBlocks: ctx.LochtrisTechniques.boardFromRows([
      '...#......',
      '..........',
      '...#.#....'
    ]),
    ingredients: [[], ctx.T],
    guides: [],
    useGuide: false,
    req: [0,0,0,0,0,0,0,0,0,0,1,0,0,0]
  };
  eng.loadProblem(prob, false);
  eng.startPlayingIfReady();
  eng.curDir = 0; // stem up
  eng.curX = 3;
  eng.curY = D.MATRIX_HEIGHT - 3;
  // Simulate 180° landing at kickIndex 4: 3 corners filled (2 back, 1 front) -> must be Mini (1), NOT full (2)!
  eng.updateSpinState(4, 2);
  assert.equal(eng.tSpinType, 1, '180° kickIndex 4 must NOT upgrade a 1-front-corner T-spin mini to full');

  // All-Mini+ callout check & modern combo numbering
  const calloutsLog = [];
  const asEng = new Eng({
    handling: { spinRule: 'all-mini+' },
    onEvent: (t, e) => { if (t === 'lineClear') calloutsLog.push(e.callouts); }
  });
  const as1 = ctx.LochtrisTechniques.getTechniqueProblems().allSpins[0]; // AS1 S-Spin Double
  asEng.loadProblem(as1, true);
  asEng.startPlayingIfReady();
  const sol = findReachablePlacement(asEng, as1.guides[0], false);
  assert.ok(sol);
  asEng.curX = sol.x; asEng.curY = sol.y; asEng.curDir = sol.dir;
  asEng.tSpinType = sol.tSpin; asEng.allSpinMino = sol.allSpin; asEng.lastRotateStep = sol.rotStep;
  asEng.lockCurrentPiece(true);
  assert.ok(calloutsLog[0].includes('S-SPIN MINI DOUBLE'), `expected S-SPIN MINI DOUBLE, got ${calloutsLog[0]}`);

  // Combo numbering: 2nd consecutive clear -> "1 COMBO"
  const cLog = [];
  const cEng = new Eng({ onEvent: (t, e) => { if (t === 'lineClear') cLog.push(e.callouts); } });
  const op5 = ctx.LochtrisTechniques.getTechniqueProblems().openers[4]; // 3 Combo Downstack
  cEng.loadProblem(op5, true);
  cEng.startPlayingIfReady();
  for (const g of op5.guides) {
    if (cEng.curMino.id !== g.mino.id) cEng.doHold(true);
    const s = findReachablePlacement(cEng, g, false);
    assert.ok(s);
    cEng.curX = s.x; cEng.curY = s.y; cEng.curDir = s.dir;
    cEng.lockCurrentPiece(true);
  }
  assert.ok(cLog[1].includes('1 COMBO'), '2nd consecutive line clear is 1 COMBO');
  assert.ok(cLog[3].includes('3 COMBO'), '4th consecutive line clear is 3 COMBO');
});

test('All 17 Technique & Opener puzzles pass strict reachability, spin enforcement, 180-only & 0-hole checks', () => {
  const groups = ctx.LochtrisTechniques.getTechniqueProblems();
  let total = 0;

  for (const [gname, list] of Object.entries(groups)) {
    for (const p of list) {
      total++;
      // AS5 is explicitly proven 180°-ONLY: verify 90°-only BFS CANNOT reach it!
      if (p.storageId === 'AS5') {
        const eng90 = new Eng();
        eng90.loadProblem(p, true);
        eng90.startPlayingIfReady();
        const sol90 = findReachablePlacement(eng90, p.guides[0], false);
        assert.equal(sol90, null, 'AS5 must be strictly impossible with 90° rotations alone');
      }

      const allow180 = p.storageId === 'AS5';
      const eng = new Eng();
      eng.loadProblem(p, true);
      eng.startPlayingIfReady();

      for (let step = 0; step < p.guides.length; step++) {
        const g = p.guides[step];
        if (eng.curMino.id !== g.mino.id) eng.doHold(true);
        const sol = findReachablePlacement(eng, g, allow180);
        assert.ok(sol, `${gname}/${p.storageId} (${p.caption}) step ${step} unreachable`);
        eng.curX = sol.x; eng.curY = sol.y; eng.curDir = sol.dir;
        eng.tSpinType = sol.tSpin; eng.allSpinMino = sol.allSpin; eng.lastRotateStep = sol.rotStep;
        eng.lockCurrentPiece(true);
      }

      assert.equal(eng.state, 'cleared', `${gname}/${p.storageId} (${p.caption}) did not clear`);

      if (['AS1', 'AS2', 'AS3', 'AS4', 'OP1', 'OP2', 'OP3'].includes(p.storageId)) {
        assert.equal(countCoveredHoles(eng.matrix), 0, `${p.storageId} left covered holes on board`);
      }
    }
  }
  assert.equal(total, 17);

  // Verify guide mode rejects placing a spin-required step without an actual spin
  const ts1 = groups.tSpins[0];
  let failReason = null;
  const spinCheckEng = new Eng({ onEvent: (t, e) => { if (t === 'problemFail') failReason = e.reason; } });
  spinCheckEng.loadProblem(ts1, true);
  spinCheckEng.startPlayingIfReady();
  const g0 = ts1.guides[0];
  spinCheckEng.curDir = g0.dir; spinCheckEng.curX = g0.x; spinCheckEng.curY = g0.y + D.DEADLINE_HEIGHT;
  spinCheckEng.tSpinType = 0; // placed without rotating
  spinCheckEng.lockCurrentPiece(true);
  assert.equal(failReason, 'missing_spin');
});

test('All 1,480 unique PCO problems are 90°-only SRS+ BFS-reachable and clear to Perfect Clear', () => {
  const probs = ctx.getProblems();
  const checked = new Set();
  for (let t = 0; t <= 21; t++) {
    for (const pid of ctx.getProblemIdList(t)) {
      if (checked.has(pid)) continue;
      checked.add(pid);
      const p = probs[pid];
      const eng = new Eng();
      eng.loadProblem(p, true);
      eng.startPlayingIfReady();

      for (let s = 0; s < p.guides.length; s++) {
        const g = p.guides[s];
        if (eng.curMino.id !== g.mino.id) {
          assert.equal(eng.doHold(true), true, `hold needed on PCO ${pid} step ${s}`);
        }
        const sol = findReachablePlacement(eng, g, false);
        assert.ok(sol, `PCO ${pid} (${p.storageId}) step ${s} unreachable via legal 90° SRS+ moves`);
        eng.curX = sol.x; eng.curY = sol.y; eng.curDir = sol.dir;
        eng.tSpinType = sol.tSpin; eng.allSpinMino = sol.allSpin;
        eng.lockCurrentPiece(true);
      }
      assert.equal(eng.state, 'cleared', `PCO ${pid} (${p.storageId}) failed to clear`);
    }
  }
  assert.equal(checked.size, 1480);
});

test('Storage: legacy cookie migration (with literal Space), throwing cookies, quota fallback & reserved-key sanitization', () => {
  const mem = {};
  const fakeStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  };
  const sCtx = loadAppContext({
    localStorage: fakeStorage,
    document: { cookie: 'MoveLeft=arrowleft; HardDrop= ; RotateLeft=ctrl; DAS=6.5; ARR=0; SDF=40; Prg1=1; Prg10=0; TextOverlay=0' }
  });
  const st = sCtx.LochtrisStorage;
  const loaded = st.loadSettings();
  assert.equal(loaded.keys.left, 'ArrowLeft');
  assert.equal(loaded.keys.hardDrop, 'Space', 'literal space cookie preserved before trim');
  assert.equal(loaded.keys.rotCCW, 'ControlLeft');
  assert.equal(loaded.handling.das, 6.5);
  assert.equal(loaded.visuals.textOverlay, false);
  assert.equal(st.isSectionCleared(1), true);
  assert.equal(st.isSectionCleared(10), false);

  // Reserved & duplicate key sanitization on load
  mem['lochtris_v2_settings'] = JSON.stringify({
    keys: { left: 'F5', right: 'ArrowRight', softDrop: 'ArrowRight' }
  });
  const sanitized = st.loadSettings();
  assert.notEqual(sanitized.keys.left, 'F5', 'reserved key F5 rejected on load');
  assert.notEqual(sanitized.keys.right, sanitized.keys.softDrop, 'duplicate keys rejected on load');

  // QuotaExceededError fallback + resetAllProgress tombstone + throwing document.cookie
  const quotaMem = { lochtris_v2_progress: JSON.stringify({ sections: { 1: true }, problems: {}, pbs: { W0: 1234 } }) };
  const throwingStorage = {
    getItem: (k) => (k in quotaMem ? quotaMem[k] : null),
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); }
  };
  const qCtx = loadAppContext({
    localStorage: throwingStorage,
    document: { get cookie() { throw new Error('SecurityError'); } }
  });
  const qSt = qCtx.LochtrisStorage;
  assert.equal(qSt.isSectionCleared(1), true);
  qSt.resetAllProgress();
  assert.equal(qSt.isSectionCleared(1), false, 'resetAllProgress tombstone overrides stale disk data when storage throws');
  assert.equal(qSt.getPB('W0'), null);
});

test('40L Sprint completes cleanly on 40 lines cleared and tracks Finesse faults', () => {
  const eng = new Eng({ rng: makeRng(15), handling: { sprintCountdown: false } });
  eng.startFreeMode('sprint');
  eng.startPlayingIfReady();

  // Over-inputted placement counts a finesse fault
  eng.pressAction('left'); eng.releaseAction('left');
  eng.pressAction('right'); eng.releaseAction('right');
  eng.pressAction('left'); eng.releaseAction('left');
  eng.pressAction('right'); eng.releaseAction('right');
  eng.pressAction('hardDrop');
  assert.ok(eng.finesseFaults >= 1, 'excess horizontal inputs recorded as finesse fault');

  // Clear 40 lines cleanly
  eng.matrix.forEach((r) => r.fill(0));
  for (let round = 0; round < 10; round++) {
    for (let r = D.MATRIX_HEIGHT - 4; r < D.MATRIX_HEIGHT; r++) {
      for (let c = 1; c < D.MATRIX_WIDTH; c++) eng.matrix[r][c] = 1;
      eng.matrix[r][0] = 0;
    }
    eng.curMino = ctx.I;
    eng.curDir = 3;
    eng.curX = -1;
    eng.curY = D.MATRIX_HEIGHT - 4;
    eng.lockCurrentPiece(true);
  }
  assert.equal(eng.linesCleared, 40);
  assert.equal(eng.state, 'cleared');
});

test('Animation & audio event payloads include rowBlocks, queueShifted, guideAlign, b2bStreak & comboBreak', () => {
  const events = [];
  const eng = new Eng({
    rng: makeRng(77),
    handling: { das: 4, arr: 0, dcd: 0, sdf: 20 },
    onEvent: (t, e) => events.push({ t, e })
  });
  eng.startFreeMode('zen');
  const initSpawn = events.find((x) => x.t === 'spawn');
  assert.ok(initSpawn && initSpawn.e.fromHold === false && initSpawn.e.queueShifted === 0, 'initial spawn has queueShifted=0');

  // Empty-slot hold consumes 1 from queue -> queueShifted=1; subsequent swap -> queueShifted=0
  eng.pressAction('hold');
  const holdSpawn = events.filter((x) => x.t === 'spawn').pop();
  assert.equal(holdSpawn.e.fromHold, true);
  assert.equal(holdSpawn.e.queueShifted, 1, 'empty hold shifts queue by 1');

  // ARR=0 snap emits move with fromX, col, steps, mino
  eng.pressAction('right');
  eng.update(5 * D.FRAME_MS);
  const snapEv = events.find((x) => x.t === 'move' && x.e.snapped);
  assert.ok(snapEv && typeof snapEv.e.fromX === 'number' && typeof snapEv.e.col === 'number' && snapEv.e.mino);

  // Rotate emits fromDir/toDir/mino
  eng.curMino = ctx.T; eng.curDir = 0; eng.curX = 4; eng.curY = 10;
  eng.rotate(1, false);
  const rotEv = events.find((x) => x.t === 'rotate');
  assert.ok(rotEv && rotEv.e.fromDir === 0 && rotEv.e.toDir === 1 && rotEv.e.mino);

  // Line clear emits rowBlocks, b2bStreak, and increments matrixVersion; dropping combo >= 2 emits comboBreak
  const mvBefore = eng.matrixVersion;
  eng.combo = 2;
  eng.matrix[D.MATRIX_HEIGHT - 1].fill(11);
  eng.matrix[D.MATRIX_HEIGHT - 1][4] = 0;
  eng.matrix[D.MATRIX_HEIGHT - 1][5] = 0;
  eng.matrix[D.MATRIX_HEIGHT - 1][6] = 0;
  eng.matrix[D.MATRIX_HEIGHT - 1][7] = 0;
  eng.curMino = ctx.I; eng.curDir = 0; eng.curX = 4; eng.curY = D.MATRIX_HEIGHT - 2;
  eng.lockCurrentPiece(true);
  assert.ok(eng.matrixVersion > mvBefore, 'matrixVersion increments on lock');
  const lcEv = events.find((x) => x.t === 'lineClear');
  assert.ok(lcEv && Array.isArray(lcEv.e.rowBlocks) && lcEv.e.rowBlocks.length === 1);
  assert.equal(lcEv.e.rowBlocks[0][0], 11);

  // Non-clearing placement after combo >= 2 emits comboBreak
  eng.pressAction('hardDrop');
  assert.ok(events.some((x) => x.t === 'comboBreak' && x.e.prevCombo >= 2), 'comboBreak emitted when combo >= 2 ends');

  // Target-scoped guideAlign transition emits once per aligned target
  const alignEvents = [];
  const gEng = new Eng({ onEvent: (t, e) => { if (t === 'guideAlign') alignEvents.push(e); } });
  const op1 = ctx.LochtrisTechniques.getTechniqueProblems().openers[0];
  gEng.loadProblem(op1, true);
  gEng.startPlayingIfReady();
  const g0 = op1.guides[0];
  gEng.curDir = g0.dir; gEng.curX = g0.x - 1;
  gEng.tryHorizontalStep(1, true);
  assert.equal(alignEvents.length, 1, 'guideAlign emitted when stepping into target');
  gEng.tryHorizontalStep(-1, true);
  gEng.tryHorizontalStep(1, true);
  assert.equal(alignEvents.length, 1, 'guideAlign does not refire when leaving and returning to same target');
});
