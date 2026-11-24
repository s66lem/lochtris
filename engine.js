/*========================================================================================
  engine.js — Headless modern guideline Tetris & PCO/Technique training engine.
  Pure simulation (no DOM calls):
  - Symmetric SRS+ kicks (JLSTZ, symmetric I, 180°), T-Spin & All-Mini+ rules
  - Sub-frame DAS / ARR (0F instant) / DCD (spawn, hold & rotate) / SDF (∞ sonic)
  - Working IRS / IHS (off | tap | hold), 40L Sprint 3-2-1-GO countdown with pre-DAS
  - Exact gravity-to-lock split timing, 30F lock delay, 15 ground resets, lockWarn cue
  - Zero-allocation occupancy comparison & 2-step Finesse fault tracking
========================================================================================*/
(function (root) {
  'use strict';

  var D = root.LochtrisData;

  function createEmptyMatrix() {
    var m = new Array(D.MATRIX_HEIGHT);
    for (var r = 0; r < D.MATRIX_HEIGHT; r++) {
      m[r] = new Uint8Array(D.MATRIX_WIDTH);
    }
    return m;
  }

  function cloneMatrix(src) {
    var m = new Array(src.length);
    for (var r = 0; r < src.length; r++) {
      m[r] = new Uint8Array(src[r]);
    }
    return m;
  }

  // Returns absolute [[x,y], ...] cells for a mino using precomputed offsets
  function pieceCells(mino, dir, x, y) {
    var offsets = mino.cells[dir];
    return [
      [x + offsets[0][0], y + offsets[0][1]],
      [x + offsets[1][0], y + offsets[1][1]],
      [x + offsets[2][0], y + offsets[2][1]],
      [x + offsets[3][0], y + offsets[3][1]]
    ];
  }

  function lowestCellY(mino, dir, y) {
    return y + mino.bounds[dir].maxR;
  }

  // Allocation-free cell-set equality for 4-cell tetromino placements
  function samePlacement(minoA, dirA, xA, yA, minoB, dirB, xB, yB) {
    var a = minoA.cells[dirA];
    var b = minoB.cells[dirB];
    for (var i = 0; i < 4; i++) {
      var ax = xA + a[i][0];
      var ay = yA + a[i][1];
      var found = false;
      for (var j = 0; j < 4; j++) {
        if (xB + b[j][0] === ax && yB + b[j][1] === ay) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  function sameCellSet(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var found = false;
      for (var j = 0; j < b.length; j++) {
        if (a[i][0] === b[j][0] && a[i][1] === b[j][1]) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  // Optimal 2-step finesse move count (horizontal + rotation inputs, excluding hard drop)
  function optimalFinesseInputs(mino, dir, x) {
    var bounds = mino.bounds[dir];
    var minX = -bounds.minC;
    var maxX = D.MATRIX_WIDTH - 1 - bounds.maxC;
    var spawnX = D.INITIAL_X;

    // Rotation count: 0 for dir 0, 1 for dir 1/3 (or symmetric I/S/Z/O), 2 or 1 (with 180) for dir 2
    var rotCost = 0;
    if (mino.id === 7) rotCost = 0;
    else if (mino.id === 1 || mino.id === 5 || mino.id === 6) rotCost = (dir === 1 || dir === 3) ? 1 : 0;
    else rotCost = dir === 0 ? 0 : (dir === 2 ? 1 : 1); // 180 key makes dir 2 cost 1 input

    // Horizontal cost under 0F ARR (max 2 inputs to reach any column: tap, tap-tap, DAS, or DAS+tap-back)
    var distSpawn = Math.abs(x - spawnX);
    var distLeftWall = x - minX;
    var distRightWall = maxX - x;
    var horizCost = Math.min(distSpawn, 1 + distLeftWall, 1 + distRightWall);
    return rotCost + Math.min(2, horizCost);
  }

  function LochtrisEngine(opts) {
    opts = opts || {};
    this.onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : function () {};
    this.rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    this.handling = Object.assign({}, D.DEFAULT_HANDLING, opts.handling || {});

    this.matrix = createEmptyMatrix();
    this.state = 'idle'; // 'idle' | 'ready' | 'countdown' | 'playing' | 'paused' | 'cleared' | 'failed'

    this.mode = 'problem'; // 'problem' | 'sprint' | 'zen'
    this.problem = null;
    this.req = [];
    this.queue = [];
    this.guidesQueue = [];
    this.guideMode = false;
    this.linesCleared = 0;
    this.targetLines = 0;

    // Sprint 3-2-1-GO countdown
    this.countdownMs = 0;
    this.countdownBeat = 0;

    // Active piece state
    this.curMino = null;
    this.curHold = null;
    this.canHold = true;
    this.curGuide = null;
    this.curX = D.INITIAL_X;
    this.curY = D.INITIAL_Y;
    this.curDir = D.INITIAL_DIR;

    // Gravity & lock delay state
    this.gravityAccumMs = 0;
    this.lockTimerMs = 0;
    this.lockResets = 0;
    this.lockLowestY = -99;
    this.lockTouchedGround = false;
    this.lockWarnFired = false;

    // Scoring / technique flags
    this.tSpinType = 0;
    this.allSpinMino = null;
    this.lastRotateStep = 0; // 1 = CW, -1 = CCW, 2 = 180, 0 = not rotate
    this.combo = -1;
    this.b2b = false;

    // Stats & finesse
    this.elapsedMs = 0;
    this.inputs = 0;
    this.piecesPlaced = 0;
    this.pieceInputs = 0;
    this.pieceUsedSoftDrop = false;
    this.pieceUsedKick = false;
    this.finesseFaults = 0;
    this.finesseChecked = 0;

    // Held keys for DAS/ARR, SDF, IRS, IHS
    this.keys = {
      left: false,
      right: false,
      softDrop: false,
      rotCW: false,
      rotCCW: false,
      rot180: false,
      hold: false
    };
    this.activeDir = 0;
    this.dasTimerMs = 0;
    this.arrTimerMs = 0;
    this.dcdTimerMs = 0;
    this.dasCharged = false;
    this.wallPushingDir = 0;

    // Tap-buffered IRS/IHS (used during countdown or 'tap' mode)
    this.irsTapDir = 0;
    this.ihsTapQueued = false;

    this.dirty = true;
  }

  LochtrisEngine.prototype.setHandling = function (handling) {
    this.handling = Object.assign({}, D.DEFAULT_HANDLING, handling || {});
  };

  LochtrisEngine.prototype.emit = function (type, payload) {
    this.onEvent(type, payload);
  };

  LochtrisEngine.prototype.loadProblem = function (problem, forceGuide) {
    this.mode = 'problem';
    this.problem = problem;
    this.req = problem.req ? problem.req.slice() : [0,0,0,0,0,0,0,0,0,0,1,0,0,0];
    this.guideMode = Boolean(forceGuide || problem.useGuide);
    this.linesCleared = 0;
    this.targetLines = 0;
    this.countdownMs = 0;
    this.countdownBeat = 0;

    this.matrix = createEmptyMatrix();
    for (var r = 0; r < D.VISIBLE_HEIGHT; r++) {
      var srcRow = problem.initialBlocks[r];
      for (var c = 0; c < D.MATRIX_WIDTH; c++) {
        this.matrix[r + D.DEADLINE_HEIGHT][c] = srcRow ? (srcRow[c] || 0) : 0;
      }
    }

    this.queue = [];
    this.guidesQueue = [];
    var firstHold = (problem.ingredients && problem.ingredients[0] && problem.ingredients[0].length > 0)
      ? problem.ingredients[0][0]
      : null;
    this.curHold = firstHold || null;
    for (var i = 1; i < problem.ingredients.length; i++) {
      this.queue.push(problem.ingredients[i]);
    }
    if (problem.guides) {
      for (var g = 0; g < problem.guides.length; g++) {
        this.guidesQueue.push(problem.guides[g]);
      }
    }

    this.resetRunMetrics();
    this.resetInputTimers(true);
    this.dequeue(false);
    this.state = 'ready';
    this.dirty = true;
  };

  LochtrisEngine.prototype.refillBag = function () {
    var bag = [D.MINOS[1], D.MINOS[2], D.MINOS[3], D.MINOS[4], D.MINOS[5], D.MINOS[6], D.MINOS[7]];
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(this.rng() * (i + 1));
      var tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    for (var k = 0; k < bag.length; k++) {
      this.queue.push(bag[k]);
    }
  };

  LochtrisEngine.prototype.startFreeMode = function (modeName, skipCountdown) {
    this.mode = modeName === 'sprint' ? 'sprint' : 'zen';
    this.problem = {
      storageId: this.mode === 'sprint' ? 'MODE_SPRINT40' : 'MODE_ZEN',
      caption: this.mode === 'sprint' ? '40L Sprint' : 'Zen Practice',
      hint: this.mode === 'sprint' ? 'Race to 40 lines. Charge DAS during countdown.' : 'Endless 7-bag board. Press F4 to reset.',
      useGuide: false
    };
    this.req = [];
    this.guideMode = false;
    this.linesCleared = 0;
    this.targetLines = this.mode === 'sprint' ? 40 : 0;

    this.matrix = createEmptyMatrix();
    this.queue = [];
    this.guidesQueue = [];
    this.refillBag();
    this.refillBag();

    this.curHold = null;
    this.resetRunMetrics();
    this.resetInputTimers(true);

    var useCd = (this.mode === 'sprint') && !skipCountdown && Boolean(this.handling.sprintCountdown);
    if (useCd) {
      this.curMino = null;
      this.countdownMs = D.SPRINT_COUNTDOWN_MS;
      this.countdownBeat = 3;
      this.state = 'countdown';
      this.emit('countdown', { beat: 3, label: '3' });
    } else {
      this.countdownMs = 0;
      this.countdownBeat = 0;
      this.dequeue(false);
      this.state = 'ready';
    }
    this.dirty = true;
  };

  LochtrisEngine.prototype.resetRunMetrics = function () {
    this.curMino = null;
    this.curGuide = null;
    this.canHold = true;
    this.clearSpinFlags();
    this.combo = -1;
    this.b2b = false;
    this.elapsedMs = 0;
    this.inputs = 0;
    this.piecesPlaced = 0;
    this.pieceInputs = 0;
    this.pieceUsedSoftDrop = false;
    this.pieceUsedKick = false;
    this.finesseFaults = 0;
    this.finesseChecked = 0;
    this.irsTapDir = 0;
    this.ihsTapQueued = false;
  };

  LochtrisEngine.prototype.resetInputTimers = function (clearHeldKeys) {
    if (clearHeldKeys) {
      this.keys.left = false;
      this.keys.right = false;
      this.keys.softDrop = false;
      this.keys.rotCW = false;
      this.keys.rotCCW = false;
      this.keys.rot180 = false;
      this.keys.hold = false;
      this.activeDir = 0;
    }
    this.dasTimerMs = 0;
    this.arrTimerMs = 0;
    this.dcdTimerMs = 0;
    this.dasCharged = false;
    this.setWallPush(0);
  };

  LochtrisEngine.prototype.startPlayingIfReady = function () {
    if (this.state === 'ready') {
      this.state = 'playing';
      this.emit('runStart', {});
      this.dirty = true;
    }
  };

  LochtrisEngine.prototype.setPaused = function (paused) {
    if (paused && (this.state === 'playing' || this.state === 'countdown')) {
      this._prePauseState = this.state;
      this.state = 'paused';
      this.resetInputTimers(true);
      this.dirty = true;
    } else if (!paused && this.state === 'paused') {
      this.state = this._prePauseState || 'playing';
      this.dirty = true;
    }
  };

  LochtrisEngine.prototype.canPlace = function (mino, dir, x, y) {
    if (!mino) return false;
    var offsets = mino.cells[dir];
    for (var i = 0; i < 4; i++) {
      var nx = x + offsets[i][0];
      var ny = y + offsets[i][1];
      if (nx < 0 || nx >= D.MATRIX_WIDTH || ny >= D.MATRIX_HEIGHT) return false;
      if (ny >= 0 && this.matrix[ny][nx] !== 0) return false;
    }
    return true;
  };

  LochtrisEngine.prototype.isGrounded = function () {
    return this.curMino !== null && !this.canPlace(this.curMino, this.curDir, this.curX, this.curY + 1);
  };

  LochtrisEngine.prototype.getGhostY = function () {
    if (!this.curMino) return this.curY;
    var y = this.curY;
    while (this.canPlace(this.curMino, this.curDir, this.curX, y + 1)) y++;
    return y;
  };

  LochtrisEngine.prototype.resetLockState = function () {
    this.lockTimerMs = 0;
    this.lockResets = 0;
    this.lockTouchedGround = false;
    this.lockWarnFired = false;
    this.lockLowestY = this.curMino ? lowestCellY(this.curMino, this.curDir, this.curY) : -99;
  };

  LochtrisEngine.prototype.onGroundManipulation = function () {
    if (!this.curMino) return;
    if (!this.lockTouchedGround && !this.isGrounded()) return;
    var ly = lowestCellY(this.curMino, this.curDir, this.curY);
    if (ly > this.lockLowestY) {
      this.lockLowestY = ly;
      this.lockResets = 0;
      this.lockTimerMs = 0;
      this.lockWarnFired = false;
      return;
    }
    if (this.lockResets < D.LOCK_RESET_LIMIT) {
      this.lockResets++;
      this.lockTimerMs = 0;
      this.lockWarnFired = false;
    }
  };

  // Shared spawn setup for dequeue() and doHold(): validates block-out BEFORE sonic drop,
  // and applies preserveDasOnSpawn / DCD consistently.
  LochtrisEngine.prototype.finalizeSpawn = function (allowIRS) {
    this.curDir = D.INITIAL_DIR;
    this.curX = D.INITIAL_X;
    this.curY = D.INITIAL_Y;
    this.gravityAccumMs = 0;
    this.clearSpinFlags();
    this.resetLockState();
    this.pieceInputs = 0;
    this.pieceUsedSoftDrop = false;
    this.pieceUsedKick = false;

    // Apply IRS (Initial Rotation System) before checking spawn block-out
    if (allowIRS && this.handling.irs !== 'off') {
      var irsDir = 0;
      if (this.irsTapDir !== 0) {
        irsDir = this.irsTapDir;
        this.irsTapDir = 0;
      } else if (this.handling.irs === 'hold') {
        if (this.keys.rot180) irsDir = 2;
        else if (this.keys.rotCW) irsDir = 1;
        else if (this.keys.rotCCW) irsDir = -1;
      }
      if (irsDir !== 0) {
        if (irsDir === 2) this.rotate180(true);
        else this.rotate(irsDir, true);
      }
    } else {
      this.irsTapDir = 0;
    }

    // Block-out check BEFORE sonic drop
    if (!this.canPlace(this.curMino, this.curDir, this.curX, this.curY)) {
      this.curMino = null;
      this.fail('blockout');
      return false;
    }

    // Apply DAS / DCD policy consistently on spawn & hold
    if (this.activeDir !== 0) {
      if (this.handling.preserveDasOnSpawn) {
        this.dcdTimerMs = Math.max(0, this.handling.dcd) * D.FRAME_MS;
        this.arrTimerMs = 0;
      } else {
        this.dasTimerMs = 0;
        this.arrTimerMs = 0;
        this.dcdTimerMs = 0;
        this.dasCharged = false;
      }
    }

    // Continuous sonic drop if SDF == Infinity and softDrop is held
    if (this.keys.softDrop && this.handling.sdf >= 41) {
      this.sonicDrop(true);
    }

    this.dirty = true;
    return true;
  };

  LochtrisEngine.prototype.dequeue = function (allowInitialSystems) {
    if (this.mode !== 'problem' && this.queue.length < 7) this.refillBag();
    if (this.queue.length === 0 && !this.curHold) {
      this.curMino = null;
      return false;
    }

    if (this.queue.length > 0) {
      this.curMino = this.queue.shift();
    } else {
      this.curMino = this.curHold;
      this.curHold = null;
    }

    if (this.mode !== 'problem' && this.queue.length < 7) this.refillBag();

    this.curGuide = this.guidesQueue.length > 0 ? this.guidesQueue.shift() : null;
    this.canHold = true;

    // Apply IHS (Initial Hold System) before finalizing spawn
    var wantsIHS = false;
    if (allowInitialSystems && this.handling.ihs !== 'off') {
      if (this.ihsTapQueued) {
        wantsIHS = true;
        this.ihsTapQueued = false;
      } else if (this.handling.ihs === 'hold' && this.keys.hold) {
        wantsIHS = true;
      }
    } else {
      this.ihsTapQueued = false;
    }

    if (wantsIHS && (this.queue.length > 0 || this.curHold)) {
      if (!this.curHold) {
        this.curHold = this.curMino;
        this.curMino = this.queue.shift();
      } else {
        var tmp = this.curHold;
        this.curHold = this.curMino;
        this.curMino = tmp;
      }
      if (this.mode !== 'problem' && this.queue.length < 7) this.refillBag();
      this.canHold = false;
      this.emit('hold', { piece: this.curHold, ihs: true });
    }

    return this.finalizeSpawn(allowInitialSystems);
  };

  /*--------------------------------------------------------------------------------------
    Discrete Actions (called immediately on keydown after advancing sub-frame timestamp)
  --------------------------------------------------------------------------------------*/
  LochtrisEngine.prototype.pressAction = function (action) {
    if (this.state === 'idle' || this.state === 'paused' || this.state === 'cleared' || this.state === 'failed') {
      return false;
    }

    // During 3-2-1-GO Sprint countdown: allow DAS pre-charging and IRS/IHS buffering!
    if (this.state === 'countdown') {
      if (action === 'left' || action === 'right') {
        var cDir = action === 'right' ? 1 : -1;
        if (action === 'left') this.keys.left = true;
        else this.keys.right = true;
        if (this.activeDir !== cDir && this.handling.cancelDasOnDirChange) {
          this.dasTimerMs = 0;
          this.dasCharged = false;
        }
        this.activeDir = cDir;
        return true;
      }
      if (action === 'softDrop') { this.keys.softDrop = true; return true; }
      if (action === 'rotCW') { this.keys.rotCW = true; if (this.handling.irs !== 'off') this.irsTapDir = 1; return true; }
      if (action === 'rotCCW') { this.keys.rotCCW = true; if (this.handling.irs !== 'off') this.irsTapDir = -1; return true; }
      if (action === 'rot180') { this.keys.rot180 = true; if (this.handling.irs !== 'off') this.irsTapDir = 2; return true; }
      if (action === 'hold') { this.keys.hold = true; if (this.handling.ihs !== 'off') this.ihsTapQueued = true; return true; }
      return false;
    }

    if (action === 'left' || action === 'right') {
      this.startPlayingIfReady();
      var dir = action === 'right' ? 1 : -1;
      if (action === 'left') this.keys.left = true;
      else this.keys.right = true;

      var dirChanged = (this.activeDir !== dir);
      this.activeDir = dir;

      if (dirChanged && this.handling.cancelDasOnDirChange) {
        this.dasTimerMs = 0;
        this.dasCharged = false;
      }
      this.arrTimerMs = 0;
      this.dcdTimerMs = 0;
      this.inputs++;
      this.pieceInputs++;
      this.tryHorizontalStep(dir, false);
      return true;
    }

    if (action === 'softDrop') {
      this.startPlayingIfReady();
      if (!this.keys.softDrop) {
        this.keys.softDrop = true;
        this.inputs++;
        this.pieceUsedSoftDrop = true;
        if (this.handling.sdf >= 41) this.sonicDrop(false);
        else this.stepSoftDrop();
      }
      return true;
    }

    if (action === 'hardDrop') {
      this.startPlayingIfReady();
      this.inputs++;
      this.hardDrop();
      return true;
    }

    if (action === 'rotCW') {
      this.startPlayingIfReady();
      this.keys.rotCW = true;
      this.inputs++;
      this.pieceInputs++;
      if (this.curMino) this.rotate(1, false);
      else if (this.handling.irs !== 'off') this.irsTapDir = 1;
      return true;
    }

    if (action === 'rotCCW') {
      this.startPlayingIfReady();
      this.keys.rotCCW = true;
      this.inputs++;
      this.pieceInputs++;
      if (this.curMino) this.rotate(-1, false);
      else if (this.handling.irs !== 'off') this.irsTapDir = -1;
      return true;
    }

    if (action === 'rot180') {
      this.startPlayingIfReady();
      this.keys.rot180 = true;
      this.inputs++;
      this.pieceInputs++;
      if (this.curMino) this.rotate180(false);
      else if (this.handling.irs !== 'off') this.irsTapDir = 2;
      return true;
    }

    if (action === 'hold') {
      this.startPlayingIfReady();
      this.keys.hold = true;
      this.inputs++;
      if (this.curMino) this.doHold(false);
      else if (this.handling.ihs !== 'off') this.ihsTapQueued = true;
      return true;
    }

    return false;
  };

  LochtrisEngine.prototype.releaseAction = function (action) {
    if (action === 'left') {
      this.keys.left = false;
      if (this.activeDir === -1) {
        if (this.keys.right) {
          this.activeDir = 1;
          if (this.handling.cancelDasOnDirChange) {
            this.dasTimerMs = 0;
            this.dasCharged = false;
          }
          this.arrTimerMs = 0;
        } else {
          this.activeDir = 0;
          this.dasTimerMs = 0;
          this.arrTimerMs = 0;
          this.dasCharged = false;
          this.setWallPush(0);
        }
      }
    } else if (action === 'right') {
      this.keys.right = false;
      if (this.activeDir === 1) {
        if (this.keys.left) {
          this.activeDir = -1;
          if (this.handling.cancelDasOnDirChange) {
            this.dasTimerMs = 0;
            this.dasCharged = false;
          }
          this.arrTimerMs = 0;
        } else {
          this.activeDir = 0;
          this.dasTimerMs = 0;
          this.arrTimerMs = 0;
          this.dasCharged = false;
          this.setWallPush(0);
        }
      }
    } else if (action === 'softDrop') {
      this.keys.softDrop = false;
    } else if (action === 'rotCW') {
      this.keys.rotCW = false;
    } else if (action === 'rotCCW') {
      this.keys.rotCCW = false;
    } else if (action === 'rot180') {
      this.keys.rot180 = false;
    } else if (action === 'hold') {
      this.keys.hold = false;
    }
  };

  LochtrisEngine.prototype.setWallPush = function (dir) {
    if (this.wallPushingDir !== dir) {
      this.wallPushingDir = dir;
      this.emit('wallPush', { dir: dir });
    }
  };

  LochtrisEngine.prototype.clearSpinFlags = function () {
    this.tSpinType = 0;
    this.allSpinMino = null;
    this.lastRotateStep = 0;
  };

  LochtrisEngine.prototype.tryHorizontalStep = function (dir, silentWall) {
    if (!this.curMino) return false;
    if (this.canPlace(this.curMino, this.curDir, this.curX + dir, this.curY)) {
      this.curX += dir;
      this.clearSpinFlags();
      this.setWallPush(0);
      this.onGroundManipulation();
      this.emit('move', { dir: dir });
      if (this.keys.softDrop && this.handling.sdf >= 41) this.sonicDrop(true);
      this.dirty = true;
      return true;
    } else {
      this.setWallPush(dir);
      if (!silentWall) this.emit('wallHit', { dir: dir });
      return false;
    }
  };

  LochtrisEngine.prototype.snapHorizontal = function (dir) {
    if (!this.curMino) return 0;
    var moved = 0;
    while (this.canPlace(this.curMino, this.curDir, this.curX + dir, this.curY)) {
      this.curX += dir;
      moved++;
      if (this.keys.softDrop && this.handling.sdf >= 41) this.sonicDrop(true);
    }
    if (moved > 0) {
      this.clearSpinFlags();
      this.onGroundManipulation();
      this.emit('move', { dir: dir, snapped: true, steps: moved });
      this.dirty = true;
    }
    this.setWallPush(dir);
    return moved;
  };

  LochtrisEngine.prototype.stepSoftDrop = function () {
    if (!this.curMino) return false;
    if (this.canPlace(this.curMino, this.curDir, this.curX, this.curY + 1)) {
      this.curY++;
      this.clearSpinFlags();
      this.gravityAccumMs = 0;
      var ly = lowestCellY(this.curMino, this.curDir, this.curY);
      if (ly > this.lockLowestY) {
        this.lockLowestY = ly;
        this.lockResets = 0;
        this.lockTimerMs = 0;
        this.lockWarnFired = false;
      }
      this.emit('softDrop', { color: this.curMino.palette });
      if (this.isGrounded()) this.lockTouchedGround = true;
      this.dirty = true;
      return true;
    }
    return false;
  };

  LochtrisEngine.prototype.sonicDrop = function (silent) {
    if (!this.curMino) return 0;
    var startY = this.curY;
    var targetY = this.getGhostY();
    var dy = targetY - startY;
    if (dy > 0) {
      this.curY = targetY;
      this.clearSpinFlags();
      this.gravityAccumMs = 0;
      var ly = lowestCellY(this.curMino, this.curDir, this.curY);
      if (ly > this.lockLowestY) {
        this.lockLowestY = ly;
        this.lockResets = 0;
        this.lockTimerMs = 0;
        this.lockWarnFired = false;
      }
      this.lockTouchedGround = true;
      if (!silent) {
        this.emit('softDrop', { sonic: true, dy: dy, color: this.curMino.palette });
      }
      this.dirty = true;
    }
    return dy;
  };

  LochtrisEngine.prototype.rotate = function (step, silent) {
    if (!this.curMino) return false;
    var fromDir = this.curDir;
    var toDir = (fromDir + (step > 0 ? 1 : 3)) % 4;
    return this.applyKickTable(fromDir, toDir, step, silent);
  };

  LochtrisEngine.prototype.rotate180 = function (silent) {
    if (!this.curMino) return false;
    var fromDir = this.curDir;
    var toDir = (fromDir + 2) % 4;
    return this.applyKickTable(fromDir, toDir, 2, silent);
  };

  LochtrisEngine.prototype.applyKickTable = function (fromDir, toDir, step, silent) {
    if (this.curMino.id === 7) return false; // O-piece rotation no-op
    var key = fromDir + '>' + toDir;
    var kicks = this.curMino.kicks[key];
    if (!kicks) return false;

    for (var i = 0; i < kicks.length; i++) {
      var nx = this.curX + kicks[i][0];
      var ny = this.curY + kicks[i][1];
      if (this.canPlace(this.curMino, toDir, nx, ny)) {
        this.curX = nx;
        this.curY = ny;
        this.curDir = toDir;
        if (i > 0) this.pieceUsedKick = true;
        this.lastRotateStep = step;
        this.updateSpinState(i, step);
        this.onGroundManipulation();

        // Apply DCD on rotation when DAS is already charged
        if (this.activeDir !== 0 && this.dasCharged && this.handling.dcd > 0) {
          this.dcdTimerMs = this.handling.dcd * D.FRAME_MS;
          this.arrTimerMs = 0;
        }

        if (this.keys.softDrop && this.handling.sdf >= 41) this.sonicDrop(true);
        if (!silent) {
          this.emit('rotate', {
            step: step,
            kickIndex: i,
            isSpin: this.tSpinType > 0 || this.allSpinMino !== null,
            pieceKey: this.curMino.key
          });
        }
        this.dirty = true;
        return true;
      }
    }
    return false;
  };

  LochtrisEngine.prototype.isPieceImmobile = function () {
    if (!this.curMino) return false;
    return !this.canPlace(this.curMino, this.curDir, this.curX - 1, this.curY)
      && !this.canPlace(this.curMino, this.curDir, this.curX + 1, this.curY)
      && !this.canPlace(this.curMino, this.curDir, this.curX, this.curY - 1)
      && !this.canPlace(this.curMino, this.curDir, this.curX, this.curY + 1);
  };

  LochtrisEngine.prototype.updateSpinState = function (kickIndex, step) {
    this.tSpinType = 0;
    this.allSpinMino = null;
    if (!this.curMino) return;

    if (this.curMino.id === 2) {
      var corners = D.T_CORNERS[this.curDir];
      var frontFilled = 0;
      var backFilled = 0;
      var i, cx, cy;

      for (i = 0; i < corners.front.length; i++) {
        cx = this.curX + corners.front[i][0];
        cy = this.curY + corners.front[i][1];
        if (this.isSolidCell(cx, cy)) frontFilled++;
      }
      for (i = 0; i < corners.back.length; i++) {
        cx = this.curX + corners.back[i][0];
        cy = this.curY + corners.back[i][1];
        if (this.isSolidCell(cx, cy)) backFilled++;
      }

      if (frontFilled + backFilled >= 3) {
        // 5th-kick full T-spin upgrade applies ONLY to 90° SRS kicks (never 180° index 4!)
        this.tSpinType = (frontFilled === 2 || (kickIndex === 4 && step !== 2)) ? 2 : 1;
      }
      return;
    }

    // Immobile All-Spin detection (S, Z, L, J, I)
    if (this.curMino.id !== 7 && this.isPieceImmobile()) {
      var allowAllSpin = this.handling.spinRule !== 't-spins'
        || (this.mode === 'problem' && this.req && this.req[13] > 0);
      if (allowAllSpin) {
        this.allSpinMino = this.curMino.key;
      }
    }
  };

  LochtrisEngine.prototype.isSolidCell = function (x, y) {
    if (x < 0 || x >= D.MATRIX_WIDTH || y >= D.MATRIX_HEIGHT) return true;
    if (y < 0) return false;
    return this.matrix[y][x] !== 0;
  };

  LochtrisEngine.prototype.doHold = function (silent) {
    if (!this.curMino) return false;
    if (!this.canHold) {
      if (!silent) this.emit('holdDenied', {});
      return false;
    }
    if (this.queue.length === 0 && !this.curHold) {
      if (!silent) this.emit('holdDenied', {});
      return false;
    }

    if (!this.curHold) {
      this.curHold = this.curMino;
      this.curMino = this.queue.shift();
    } else {
      var tmp = this.curHold;
      this.curHold = this.curMino;
      this.curMino = tmp;
    }

    if (this.mode !== 'problem' && this.queue.length < 7) this.refillBag();
    this.canHold = false;

    if (!silent) this.emit('hold', { piece: this.curHold, ihs: false });
    return this.finalizeSpawn(false);
  };

  LochtrisEngine.prototype.hardDrop = function () {
    if (!this.curMino) return;
    var fromY = this.curY;
    var toY = this.getGhostY();
    var dy = toY - fromY;
    if (dy > 0) this.clearSpinFlags();
    this.curY = toY;

    var cells = pieceCells(this.curMino, this.curDir, this.curX, this.curY);
    this.emit('hardDrop', {
      fromY: fromY,
      toY: toY,
      dy: dy,
      cells: cells,
      color: this.curMino.palette
    });

    this.lockCurrentPiece(true);
  };

  LochtrisEngine.prototype.lockCurrentPiece = function (fromHardDrop) {
    if (!this.curMino) return;

    var mino = this.curMino;
    var dir = this.curDir;
    var px = this.curX;
    var py = this.curY;
    var cells = pieceCells(mino, dir, px, py);
    this.piecesPlaced++;

    // Finesse check for open, non-soft-drop, non-kick placements
    if (!this.pieceUsedSoftDrop && !this.pieceUsedKick) {
      this.finesseChecked++;
      var opt = optimalFinesseInputs(mino, dir, px);
      if (this.pieceInputs > opt) {
        this.finesseFaults++;
      }
    }

    var allAboveDeadline = true;
    for (var i = 0; i < 4; i++) {
      var cx = cells[i][0];
      var cy = cells[i][1];
      if (cy >= D.DEADLINE_HEIGHT) allAboveDeadline = false;
      if (cy >= 0 && cy < D.MATRIX_HEIGHT && cx >= 0 && cx < D.MATRIX_WIDTH) {
        this.matrix[cy][cx] = mino.placedBlockId;
      }
    }

    if (!fromHardDrop) {
      this.emit('lock', { cells: cells, color: mino.palette });
    }

    // Strict guide enforcement when guide mode is active
    if (this.guideMode && this.curGuide) {
      var g = this.curGuide;
      var posMatch = (mino.id === g.mino.id) && samePlacement(mino, dir, px, py, g.mino, g.dir, g.x, g.y + D.DEADLINE_HEIGHT);
      if (!posMatch) {
        this.curMino = null;
        this.fail('guide_mismatch');
        return;
      }
      if (g.requires180 && this.lastRotateStep !== 2) {
        this.curMino = null;
        this.fail('missing_180');
        return;
      }
      if (g.requiresSpin && this.tSpinType === 0 && this.allSpinMino === null) {
        this.curMino = null;
        this.fail('missing_spin');
        return;
      }
    }

    if (allAboveDeadline) {
      this.curMino = null;
      this.fail('lockout');
      return;
    }

    var clearedRows = [];
    for (var r = 0; r < D.MATRIX_HEIGHT; r++) {
      var full = true;
      for (var c = 0; c < D.MATRIX_WIDTH; c++) {
        if (this.matrix[r][c] === 0) { full = false; break; }
      }
      if (full) clearedRows.push(r);
    }

    var numCleared = clearedRows.length;
    if (numCleared > 0) {
      this.linesCleared += numCleared;
      for (var ri = 0; ri < clearedRows.length; ri++) {
        this.matrix.splice(clearedRows[ri], 1);
        this.matrix.unshift(new Uint8Array(D.MATRIX_WIDTH));
      }
    }

    // Evaluate techniques / features (all-mini+ & modern combo numbering)
    var features = [];
    var callouts = [];
    var isTSpin = this.tSpinType > 0;
    var allSpinKey = this.allSpinMino;
    var allSpinIsMini = (this.handling.spinRule === 'all-mini+');
    var isDifficult = (numCleared === 4) || (isTSpin && numCleared > 0) || (allSpinKey !== null && numCleared > 0);
    var isB2BTriggered = false;
    var isPC = false;

    if (numCleared === 0) {
      this.combo = -1;
      if (this.tSpinType === 1) { features.push(4); callouts.push('T-SPIN MINI'); }
      else if (this.tSpinType === 2) { features.push(5); callouts.push('T-SPIN'); }
      else if (allSpinKey) {
        features.push(13);
        callouts.push(allSpinKey + (allSpinIsMini ? '-SPIN MINI' : '-SPIN'));
      }
    } else {
      this.combo++;
      if (allSpinKey) {
        features.push(13);
        var lineWord = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD'][Math.min(numCleared, 4)];
        callouts.push(allSpinKey + (allSpinIsMini ? '-SPIN MINI ' : '-SPIN ') + lineWord);
        if (numCleared >= 1 && numCleared <= 4) features.push(numCleared - 1);
      } else if (numCleared === 1) {
        features.push([0, 6, 7][this.tSpinType]);
        callouts.push(['SINGLE', 'T-SPIN MINI SINGLE', 'T-SPIN SINGLE'][this.tSpinType]);
      } else if (numCleared === 2) {
        features.push(isTSpin ? 8 : 1);
        callouts.push(isTSpin ? 'T-SPIN DOUBLE' : 'DOUBLE');
      } else if (numCleared === 3) {
        features.push(isTSpin ? 9 : 2);
        callouts.push(isTSpin ? 'T-SPIN TRIPLE' : 'TRIPLE');
      } else if (numCleared >= 4) {
        features.push(3);
        callouts.push('QUAD');
      }

      // Modern combo numbering: 2nd clear in a row = "1 COMBO"
      if (this.combo >= 1) {
        features.push(100 + this.combo);
        callouts.push(this.combo + ' COMBO');
      }
      if (this.b2b && isDifficult) {
        isB2BTriggered = true;
        features.push(11);
        callouts.unshift('BACK-TO-BACK');
      }
      this.b2b = isDifficult;

      if (this.isMatrixEmpty()) {
        isPC = true;
        features.push(10);
        callouts.push('PERFECT CLEAR');
      }
    }

    if (features.length > 0) {
      if (this.mode === 'problem') this.applyRequirements(features);
      this.emit('lineClear', {
        rows: clearedRows,
        count: numCleared,
        tSpin: this.tSpinType,
        allSpin: allSpinKey,
        isB2B: isB2BTriggered,
        combo: this.combo,
        isPC: isPC,
        callouts: callouts
      });
    }

    this.curMino = null;
    this.clearSpinFlags();
    this.resetLockState();

    if (this.mode === 'sprint') {
      if (this.linesCleared >= this.targetLines) {
        this.state = 'cleared';
        this.setWallPush(0);
        this.dirty = true;
        this.emit('problemClear', {
          problem: this.problem,
          elapsedMs: this.elapsedMs,
          pieces: this.piecesPlaced,
          inputs: this.inputs,
          pps: this.getPPS(),
          kpp: this.getKPP(),
          finesseFaults: this.finesseFaults,
          finessePct: this.getFinessePct(),
          usedGuide: false
        });
        return;
      }
    } else if (this.mode === 'problem') {
      if (this.isReqCleared()) {
        this.state = 'cleared';
        this.setWallPush(0);
        this.dirty = true;
        this.emit('problemClear', {
          problem: this.problem,
          elapsedMs: this.elapsedMs,
          pieces: this.piecesPlaced,
          inputs: this.inputs,
          pps: this.getPPS(),
          kpp: this.getKPP(),
          finesseFaults: this.finesseFaults,
          finessePct: this.getFinessePct(),
          usedGuide: this.guideMode
        });
        return;
      }
    }

    if (!this.dequeue(true)) {
      if (this.state === 'playing') {
        this.fail('out_of_pieces');
      }
    }
  };

  LochtrisEngine.prototype.applyRequirements = function (features) {
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var idx = f > 100 ? 12 : f;
      if (idx >= 0 && idx < this.req.length) this.req[idx]--;
      if (idx === 6 || idx === 7) this.req[0]--;
      else if (idx === 8) this.req[1]--;
      else if (idx === 9) this.req[2]--;
    }
  };

  LochtrisEngine.prototype.isReqCleared = function () {
    for (var i = 0; i < this.req.length; i++) {
      if (this.req[i] > 0) return false;
    }
    return true;
  };

  LochtrisEngine.prototype.isMatrixEmpty = function () {
    for (var r = 0; r < D.MATRIX_HEIGHT; r++) {
      for (var c = 0; c < D.MATRIX_WIDTH; c++) {
        if (this.matrix[r][c] !== 0) return false;
      }
    }
    return true;
  };

  LochtrisEngine.prototype.fail = function (reason) {
    var snapshot = cloneMatrix(this.matrix);
    this.state = 'failed';
    this.setWallPush(0);
    this.dirty = true;
    this.emit('problemFail', {
      problem: this.problem,
      reason: reason,
      matrixSnapshot: snapshot
    });
  };

  /*--------------------------------------------------------------------------------------
    Sub-Frame Accurate Simulation Update (splits gravity landing & lock delay cleanly)
  --------------------------------------------------------------------------------------*/
  LochtrisEngine.prototype.update = function (dtMs) {
    if (dtMs <= 0) return;

    // 40L Sprint 3-2-1-GO countdown: charge DAS while waiting, launch at GO!
    if (this.state === 'countdown') {
      if (this.activeDir !== 0 && !this.dasCharged) {
        var dasTarget = Math.max(0, this.handling.das) * D.FRAME_MS;
        this.dasTimerMs = Math.min(dasTarget, this.dasTimerMs + dtMs);
        if (this.dasTimerMs >= dasTarget) this.dasCharged = true;
      }

      this.countdownMs -= dtMs;
      var newBeat = Math.ceil(this.countdownMs / 600);
      if (this.countdownMs <= 0) {
        this.countdownMs = 0;
        this.countdownBeat = 0;
        this.state = 'playing';
        this.emit('countdown', { beat: 0, label: 'GO!' });
        this.emit('runStart', {});
        this.dequeue(true);
        // If DAS already charged during countdown and DCD is 0, apply immediately
        if (this.activeDir !== 0 && this.dasCharged && this.dcdTimerMs <= 0 && this.curMino) {
          if (this.handling.arr <= 0.001) this.snapHorizontal(this.activeDir);
          else this.tryHorizontalStep(this.activeDir, true);
        }
        this.dirty = true;
      } else if (newBeat !== this.countdownBeat && newBeat > 0) {
        this.countdownBeat = newBeat;
        this.emit('countdown', { beat: newBeat, label: String(newBeat) });
      }
      return;
    }

    if (this.state !== 'playing' || !this.curMino) return;

    var self = this;
    function maybeEmitLockWarn() {
      if (!self.lockWarnFired && self.lockTimerMs >= D.LOCK_DELAY_MS * 0.8) {
        self.lockWarnFired = true;
        self.emit('lockWarn', {});
      }
    }

    // Pre-check: if piece is already grounded and will lock BEFORE the next scheduled DAS/ARR move,
    // advance timers strictly up to exact lock time, lock, and carry leftover dt to the next piece.
    // This makes lock-before-DAS 100% invariant to frame slicing (e.g. update(20) === update(18)+update(2)).
    if (this.isGrounded()) {
      var curLowStart = lowestCellY(this.curMino, this.curDir, this.curY);
      if (!this.lockTouchedGround || curLowStart > this.lockLowestY) {
        this.lockTouchedGround = true;
        if (curLowStart > this.lockLowestY) {
          this.lockLowestY = curLowStart;
          this.lockResets = 0;
          this.lockTimerMs = 0;
          this.lockWarnFired = false;
        }
      }
      var timeToLock = this.lockResets >= D.LOCK_RESET_LIMIT ? 0 : Math.max(0, D.LOCK_DELAY_MS - this.lockTimerMs);
      if (timeToLock < dtMs) {
        var nextHorizMs = Infinity;
        if (this.activeDir !== 0) {
          var dcdRem = Math.max(0, this.dcdTimerMs);
          var dasTarget0 = Math.max(0, this.handling.das) * D.FRAME_MS;
          var arrInt0 = Math.max(0, this.handling.arr) * D.FRAME_MS;
          if (!this.dasCharged) nextHorizMs = dcdRem + Math.max(0, dasTarget0 - this.dasTimerMs);
          else if (arrInt0 <= 0.001) nextHorizMs = dcdRem;
          else nextHorizMs = dcdRem + Math.max(0, arrInt0 - this.arrTimerMs);
        }
        if (this.lockResets >= D.LOCK_RESET_LIMIT || timeToLock <= nextHorizMs) {
          if (timeToLock > 0) {
            this.elapsedMs += timeToLock;
            if (this.activeDir !== 0) {
              var hAdv = timeToLock;
              if (this.dcdTimerMs > 0) {
                var usedDcd = Math.min(hAdv, this.dcdTimerMs);
                this.dcdTimerMs -= usedDcd;
                hAdv -= usedDcd;
              }
              if (hAdv > 0) {
                if (!this.dasCharged) {
                  this.dasTimerMs = Math.min(dasTarget0, this.dasTimerMs + hAdv);
                  if (this.dasTimerMs >= dasTarget0) this.dasCharged = true;
                } else {
                  this.arrTimerMs += hAdv;
                }
              }
            }
            this.lockTimerMs += timeToLock;
            maybeEmitLockWarn();
          }
          var remAfterLock = dtMs - timeToLock;
          this.lockCurrentPiece(false);
          if (remAfterLock > 0 && this.state === 'playing' && this.curMino) {
            this.update(remAfterLock);
          }
          return;
        }
      }
    }

    this.elapsedMs += dtMs;

    // Helper: advance grounded lock timer over a sub-frame slice before a scheduled DAS/ARR event.
    // Returns true if the piece locked during this slice (caller should stop & pass remainder to next piece).
    var lockAccountedMs = 0;
    function chargeGroundedUntil(eventOffsetMs) {
      if (!self.isGrounded()) return false;
      var curLow = lowestCellY(self.curMino, self.curDir, self.curY);
      if (!self.lockTouchedGround || curLow > self.lockLowestY) {
        self.lockTouchedGround = true;
        if (curLow > self.lockLowestY) {
          self.lockLowestY = curLow;
          self.lockResets = 0;
          self.lockTimerMs = 0;
          self.lockWarnFired = false;
        }
      }
      var seg = eventOffsetMs - lockAccountedMs;
      if (seg <= 0) return false;
      var tLock = Math.max(0, D.LOCK_DELAY_MS - self.lockTimerMs);
      if (self.lockResets >= D.LOCK_RESET_LIMIT || seg >= tLock) {
        var used = self.lockResets >= D.LOCK_RESET_LIMIT ? 0 : tLock;
        self.lockTimerMs += used;
        maybeEmitLockWarn();
        var postLockRem = dtMs - (lockAccountedMs + used);
        self.elapsedMs -= postLockRem;
        self.lockCurrentPiece(false);
        if (postLockRem > 0 && self.state === 'playing' && self.curMino) {
          self.update(postLockRem);
        }
        return true;
      }
      self.lockTimerMs += seg;
      lockAccountedMs = eventOffsetMs;
      maybeEmitLockWarn();
      self.dirty = true;
      return false;
    }

    // 1. Horizontal DAS / DCD / ARR (event-ordered against grounded lock delay)
    if (this.activeDir !== 0) {
      var remaining = dtMs;
      if (this.dcdTimerMs > 0) {
        if (remaining >= this.dcdTimerMs) {
          remaining -= this.dcdTimerMs;
          this.dcdTimerMs = 0;
        } else {
          this.dcdTimerMs -= remaining;
          remaining = 0;
        }
      }

      if (remaining > 0) {
        var dasTargetMs = Math.max(0, this.handling.das) * D.FRAME_MS;
        var arrIntervalMs = Math.max(0, this.handling.arr) * D.FRAME_MS;

        if (!this.dasCharged) {
          this.dasTimerMs += remaining;
          if (this.dasTimerMs >= dasTargetMs) {
            var overflow = this.dasTimerMs - dasTargetMs;
            this.dasTimerMs = dasTargetMs;
            this.dasCharged = true;
            if (chargeGroundedUntil(dtMs - overflow)) return;
            if (arrIntervalMs <= 0.001) {
              this.snapHorizontal(this.activeDir);
            } else {
              this.tryHorizontalStep(this.activeDir, true);
              this.arrTimerMs = overflow;
              while (this.arrTimerMs >= arrIntervalMs) {
                this.arrTimerMs -= arrIntervalMs;
                if (chargeGroundedUntil(dtMs - this.arrTimerMs)) return;
                if (!this.tryHorizontalStep(this.activeDir, true)) {
                  this.arrTimerMs = 0;
                  break;
                }
              }
            }
          }
        } else {
          if (arrIntervalMs <= 0.001) {
            if (chargeGroundedUntil(dtMs - remaining)) return;
            this.snapHorizontal(this.activeDir);
          } else {
            this.arrTimerMs += remaining;
            while (this.arrTimerMs >= arrIntervalMs) {
              this.arrTimerMs -= arrIntervalMs;
              if (chargeGroundedUntil(dtMs - this.arrTimerMs)) return;
              if (!this.tryHorizontalStep(this.activeDir, true)) {
                this.arrTimerMs = 0;
                break;
              }
            }
          }
        }
      }
    }

    // 2. Gravity & Soft Drop (only remaining uncharged frame time counts toward lock delay)
    var remDtForLock = Math.max(0, dtMs - lockAccountedMs);
    var groundedDtMs = 0;
    if (this.keys.softDrop && this.handling.sdf >= 41) {
      this.sonicDrop(true);
      if (this.isGrounded()) groundedDtMs = remDtForLock;
    } else {
      var intervalMs = D.BASE_GRAVITY_INTERVAL_MS;
      if (this.keys.softDrop) {
        intervalMs = D.BASE_GRAVITY_INTERVAL_MS / Math.max(1, this.handling.sdf);
      }

      if (this.isGrounded()) {
        this.gravityAccumMs = 0;
        groundedDtMs = remDtForLock;
      } else {
        var timeLeft = remDtForLock;
        while (timeLeft > 0) {
          var needed = intervalMs - this.gravityAccumMs;
          if (timeLeft < needed) {
            this.gravityAccumMs += timeLeft;
            timeLeft = 0;
            break;
          }
          timeLeft -= needed;
          this.gravityAccumMs = 0;
          if (!this.canPlace(this.curMino, this.curDir, this.curX, this.curY + 1)) {
            groundedDtMs = timeLeft;
            break;
          }
          this.curY++;
          this.clearSpinFlags();
          var ly = lowestCellY(this.curMino, this.curDir, this.curY);
          if (ly > this.lockLowestY) {
            this.lockLowestY = ly;
            this.lockResets = 0;
            this.lockTimerMs = 0;
            this.lockWarnFired = false;
          }
          if (this.keys.softDrop) {
            this.emit('softDrop', { color: this.curMino.palette });
          }
          this.dirty = true;
          if (!this.canPlace(this.curMino, this.curDir, this.curX, this.curY + 1)) {
            groundedDtMs = timeLeft;
            break;
          }
        }
      }
    }

    // 3. Lock Delay (strictly grounded, exact post-landing time only)
    if (this.isGrounded()) {
      var curLow = lowestCellY(this.curMino, this.curDir, this.curY);
      if (!this.lockTouchedGround) {
        this.lockTouchedGround = true;
        if (curLow > this.lockLowestY) {
          this.lockLowestY = curLow;
          this.lockResets = 0;
          this.lockTimerMs = 0;
          this.lockWarnFired = false;
        }
      } else if (curLow > this.lockLowestY) {
        this.lockLowestY = curLow;
        this.lockResets = 0;
        this.lockTimerMs = 0;
        this.lockWarnFired = false;
      }

      if (groundedDtMs > 0) {
        this.lockTimerMs += groundedDtMs;
        this.dirty = true;
      }

      maybeEmitLockWarn();

      if (this.lockTimerMs >= D.LOCK_DELAY_MS || this.lockResets >= D.LOCK_RESET_LIMIT) {
        var tailRem = this.lockResets >= D.LOCK_RESET_LIMIT
          ? 0
          : Math.max(0, this.lockTimerMs - D.LOCK_DELAY_MS);
        if (tailRem > 0) this.elapsedMs -= tailRem;
        this.lockCurrentPiece(false);
        if (tailRem > 0 && this.state === 'playing' && this.curMino) {
          this.update(tailRem);
        }
      }
    }
  };

  /*--------------------------------------------------------------------------------------
    Derived Metrics & Readouts
  --------------------------------------------------------------------------------------*/
  LochtrisEngine.prototype.getPPS = function () {
    if (this.elapsedMs <= 0) return 0;
    return this.piecesPlaced / (this.elapsedMs / 1000);
  };

  LochtrisEngine.prototype.getKPP = function () {
    if (this.piecesPlaced <= 0) return 0;
    return this.inputs / this.piecesPlaced;
  };

  LochtrisEngine.prototype.getFinessePct = function () {
    if (this.finesseChecked <= 0) return 100;
    return Math.round(((this.finesseChecked - this.finesseFaults) / this.finesseChecked) * 100);
  };

  LochtrisEngine.prototype.getLockProgress = function () {
    if (!this.curMino || !this.isGrounded()) return 0;
    return Math.min(1, this.lockTimerMs / D.LOCK_DELAY_MS);
  };

  LochtrisEngine.prototype.getRemainingLockResets = function () {
    return Math.max(0, D.LOCK_RESET_LIMIT - this.lockResets);
  };

  LochtrisEngine.prototype.isGuideAligned = function () {
    if (!this.guideMode || !this.curGuide || !this.curMino) return false;
    var g = this.curGuide;
    if (this.curMino.id !== g.mino.id) return false;
    var gy = this.getGhostY();
    if (!samePlacement(this.curMino, this.curDir, this.curX, gy, g.mino, g.dir, g.x, g.y + D.DEADLINE_HEIGHT)) {
      return false;
    }
    // If step requires a spin or 180°, only light up aligned once the piece is actually spun in place
    if (g.requires180 && (gy !== this.curY || this.lastRotateStep !== 2)) return false;
    if (g.requiresSpin && (gy !== this.curY || (this.tSpinType === 0 && this.allSpinMino === null))) return false;
    return true;
  };

  LochtrisEngine.prototype.needsHoldForGuide = function () {
    if (!this.guideMode || !this.curGuide || !this.curMino) return false;
    return this.curMino.id !== this.curGuide.mino.id;
  };

  LochtrisEngine.pieceCells = pieceCells;
  LochtrisEngine.sameCellSet = sameCellSet;
  LochtrisEngine.samePlacement = samePlacement;

  root.LochtrisEngine = LochtrisEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LochtrisEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
