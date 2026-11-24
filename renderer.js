/*========================================================================================
  renderer.js — High-efficiency DPR-scaled Canvas renderer & zero-delay VFX choreography.
  - Offscreen cached block sprites, bokeh mote sprites, beam textures, grid & settled stack
  - Pre-allocated fixed particle ring buffer (zero per-particle GC, clean oldest recycle)
  - Grouped band visual stack-collapse (~82ms) + sprite-based center-out dissolve
  - Ghost & Active Piece ALWAYS rendered on top of VFX; zero per-frame color/gradient allocs
========================================================================================*/
(function (root) {
  'use strict';

  var D = root.LochtrisData;

  var MAX_TRAILS = 16;
  var MAX_RINGS = 10;
  var MAX_DISSOLVE = 40;
  var MAX_PARTICLES = 96;
  var MAX_SHARDS = 220;

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function shadeHex(hex, factor) {
    var rgb = hexToRgb(hex);
    var r = Math.max(0, Math.min(255, Math.round(rgb[0] * factor)));
    var g = Math.max(0, Math.min(255, Math.round(rgb[1] * factor)));
    var b = Math.max(0, Math.min(255, Math.round(rgb[2] * factor)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rgbaHex(hex, alpha) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function easeOutCubic(t) {
    var u = 1 - t;
    return 1 - u * u * u;
  }

  function swapRemove(arr, i) {
    var last = arr.length - 1;
    if (i < last) arr[i] = arr[last];
    arr.pop();
  }

  function createBlockSprite(pxSize, hex, skin, dpr) {
    var c = document.createElement('canvas');
    c.width = pxSize;
    c.height = pxSize;
    var ctx = c.getContext('2d');
    var s = pxSize;
    var pad = Math.max(1, Math.round(s * 0.035));

    if (skin === 'flat') {
      ctx.fillStyle = hex;
      ctx.fillRect(pad, pad, s - pad * 2, s - pad * 2);
      var edge = Math.max(1, Math.round(s * 0.08));
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(pad, pad, s - pad * 2, edge);
      ctx.fillRect(pad, pad, edge, s - pad * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(pad, s - pad - edge, s - pad * 2, edge);
      ctx.fillRect(s - pad - edge, pad, edge, s - pad * 2);
      return c;
    }

    if (skin === 'neon') {
      ctx.fillStyle = rgbaHex(hex, 0.24);
      ctx.fillRect(pad, pad, s - pad * 2, s - pad * 2);
      ctx.strokeStyle = shadeHex(hex, 1.35);
      ctx.lineWidth = Math.max(1.5, s * 0.09);
      var inset = pad + ctx.lineWidth * 0.5;
      ctx.strokeRect(inset, inset, s - inset * 2, s - inset * 2);
      ctx.fillStyle = rgbaHex(hex, 0.44);
      var core = Math.round(s * 0.34);
      ctx.fillRect(core, core, s - core * 2, s - core * 2);
      var glint = Math.max(2, Math.round(s * 0.14));
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillRect(pad + 1, pad + 1, glint, Math.max(1, Math.round(s * 0.06)));
      ctx.fillRect(pad + 1, pad + 1, Math.max(1, Math.round(s * 0.06)), glint);
      return c;
    }

    // Modern (beveled tile)
    var b = Math.max(2, Math.round(s * 0.14));
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, s, s);

    ctx.fillStyle = shadeHex(hex, 1.24);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(s - b, b); ctx.lineTo(b, b);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(hex, 1.1);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(b, b); ctx.lineTo(b, s - b); ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(hex, 0.8);
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(s, s); ctx.lineTo(s - b, s - b); ctx.lineTo(s - b, b);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadeHex(hex, 0.68);
    ctx.beginPath();
    ctx.moveTo(0, s); ctx.lineTo(b, s - b); ctx.lineTo(s - b, s - b); ctx.lineTo(s, s);
    ctx.closePath();
    ctx.fill();

    var grad = ctx.createLinearGradient(0, b, 0, s - b);
    grad.addColorStop(0, shadeHex(hex, 1.07));
    grad.addColorStop(1, shadeHex(hex, 0.92));
    ctx.fillStyle = grad;
    ctx.fillRect(b, b, s - b * 2, s - b * 2);

    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, Math.round(dpr || 1));
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

    return c;
  }

  function createBeamSprite(hex) {
    var c = document.createElement('canvas');
    c.width = 16;
    c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, rgbaHex(hex, 0));
    g.addColorStop(0.55, rgbaHex(hex, 0.20));
    g.addColorStop(1, rgbaHex(hex, 0.46));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 64);

    // Subtle seafoam-aqua core shimmer so drop beams read like light refracting through water
    var core = ctx.createLinearGradient(0, 0, 0, 64);
    core.addColorStop(0, 'rgba(170, 244, 255, 0)');
    core.addColorStop(0.7, 'rgba(182, 246, 255, 0.20)');
    core.addColorStop(1, 'rgba(220, 252, 255, 0.42)');
    ctx.fillStyle = core;
    ctx.fillRect(5, 0, 6, 64);
    return c;
  }

  // Pre-rendered radial bokeh mote sprite (1 drawImage per mote instead of 2 beginPath/arc/fill calls)
  function createMoteSprite(hex) {
    var c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(12, 12, 1, 12, 12, 11);
    g.addColorStop(0, 'rgba(242,254,255,0.92)');
    g.addColorStop(0.38, rgbaHex(hex, 0.55));
    g.addColorStop(1, rgbaHex(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
    return c;
  }

  function LochtrisRenderer(elements, visuals) {
    this.boardCanvas = elements.boardCanvas;
    this.boardCtx = this.boardCanvas.getContext('2d', { alpha: true });
    this.holdCanvas = elements.holdCanvas;
    this.holdCtx = this.holdCanvas.getContext('2d', { alpha: true });
    this.nextCanvas = elements.nextCanvas;
    this.nextCtx = this.nextCanvas.getContext('2d', { alpha: true });
    this.bounceEl = elements.boardColEl || elements.stageEl;
    this.arenaEl = elements.arenaEl || null;
    this.onReducedMotionChange = typeof elements.onReducedMotionChange === 'function'
      ? elements.onReducedMotionChange
      : null;

    this.visuals = Object.assign({}, D.DEFAULT_VISUALS, visuals || {});
    this.reducedMotion = false;
    this.initReducedMotion();

    this.dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    this.cellSize = 30;
    this.previewCell = 18;
    this.sprites = {};
    this.beamSprites = {};
    this.moteSprites = {};
    this.spriteKey = '';
    this.gridCanvas = null;
    this.gridKey = '';
    this.stackCanvas = null;
    this.lastMatrixVersion = -1;
    this.highestOccupiedVisRow = D.VISIBLE_HEIGHT + D.PEEK_ROWS;
    this.lastLayoutKey = '';

    // Pre-build beam & bokeh mote sprites once for all piece + accent colors
    var preColors = [
      D.BLOCK_COLORS[11], D.BLOCK_COLORS[12], D.BLOCK_COLORS[13], D.BLOCK_COLORS[14],
      D.BLOCK_COLORS[15], D.BLOCK_COLORS[16], D.BLOCK_COLORS[17],
      '#69f0ae', '#d88cf0', '#7ee0e6', '#c6f2fa'
    ];
    for (var ci = 0; ci < preColors.length; ci++) {
      var hex = preColors[ci];
      if (!this.beamSprites[hex]) this.beamSprites[hex] = createBeamSprite(hex);
      if (!this.moteSprites[hex]) this.moteSprites[hex] = createMoteSprite(hex);
    }

    // Pre-allocated fixed-capacity particle ring buffer (zero per-particle GC!)
    this.particlePool = new Array(MAX_PARTICLES);
    for (var pi = 0; pi < MAX_PARTICLES; pi++) {
      this.particlePool[pi] = {
        alive: false, x: 0, y: 0, vx: 0, vy: 0,
        color: '#7ee0e6', sprite: this.moteSprites['#7ee0e6'],
        size: 3, age: 0, life: 200, kind: 'mote', phase: 0
      };
    }
    this.particleCursor = 0;
    this.activeParticleCount = 0;

    // Capped VFX pools
    this.trails = [];
    this.beams = [];
    this.rings = [];
    this.dissolveCells = [];
    this.lockFlashes = [];
    this.lineFlashes = [];
    this.shatterShards = [];

    // Non-blocking grouped visual stack collapse (~82ms)
    this.collapseBands = [];
    this.collapseAge = 0;
    this.collapseLife = 0;

    // Kinetic micro-animations
    this.spawnSheen = 0;
    this.nextSlidePx = 0;
    this.pcHalo = 0;
    this.guideSnapFlash = 0;
    this.lockWarnFlash = 0;

    // Subtle horizontal wall-push spring only (with transform string dedupe)
    this.spring = { x: 0, vx: 0, targetX: 0 };
    this.lastBounceTransform = '';

    this.lastHoldSig = -1;
    this.lastNextSig = -1;

    this.resize();
  }

  LochtrisRenderer.prototype.initReducedMotion = function () {
    if (typeof root.matchMedia !== 'function') return;
    var mq = root.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = Boolean(mq.matches);
    var self = this;
    var onChange = function (e) {
      self.reducedMotion = Boolean(e.matches);
      self.clearVFX();
      self.lastHoldSig = -1;
      self.lastNextSig = -1;
      self.lastMatrixVersion = -1;
      if (self.onReducedMotionChange) self.onReducedMotionChange(self.reducedMotion);
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange);
  };

  LochtrisRenderer.prototype.setVisuals = function (visuals) {
    var prevSkin = this.visuals.skin;
    var prevGrid = this.visuals.gridOpacity;
    this.visuals = Object.assign({}, D.DEFAULT_VISUALS, visuals || {});
    if (this.visuals.skin !== prevSkin) {
      this.rebuildSprites();
      this.lastHoldSig = -1;
      this.lastNextSig = -1;
      this.lastMatrixVersion = -1;
    }
    if (this.visuals.gridOpacity !== prevGrid) {
      this.rebuildGridLayer();
    }
  };

  LochtrisRenderer.prototype.resize = function () {
    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    var arenaW = (this.arenaEl && this.arenaEl.clientWidth > 0) ? this.arenaEl.clientWidth : (root.innerWidth || 1200);
    var arenaH = (this.arenaEl && this.arenaEl.clientHeight > 0) ? this.arenaEl.clientHeight : Math.max(360, (root.innerHeight || 800) - 96);

    var sideReserve = arenaW < 720 ? 186 : 336;
    var maxByHeight = Math.floor((arenaH - 36) / (D.VISIBLE_HEIGHT + D.PEEK_ROWS));
    var maxByWidth = Math.floor((arenaW - sideReserve) / D.MATRIX_WIDTH);
    var cell = Math.max(16, Math.min(36, maxByHeight, maxByWidth));
    var previewCell = Math.max(11, Math.round(cell * 0.60));

    var layoutKey = cell + ':' + previewCell + ':' + dpr;
    if (layoutKey === this.lastLayoutKey) return false;
    this.lastLayoutKey = layoutKey;

    this.dpr = dpr;
    this.cellSize = cell;
    this.previewCell = previewCell;

    var boardW = D.MATRIX_WIDTH * cell;
    var boardH = (D.VISIBLE_HEIGHT + D.PEEK_ROWS) * cell;
    this.configureCanvas(this.boardCanvas, this.boardCtx, boardW, boardH);

    var holdW = Math.round(this.previewCell * 4.7);
    var holdH = Math.round(this.previewCell * 2.9);
    this.configureCanvas(this.holdCanvas, this.holdCtx, holdW, holdH);

    var nextW = holdW;
    var nextH = Math.round(this.previewCell * (2.95 + 2.45 * (D.NEXT_MINOS - 1)));
    this.configureCanvas(this.nextCanvas, this.nextCtx, nextW, nextH);

    if (typeof document !== 'undefined' && document.documentElement) {
      var rs = document.documentElement.style;
      rs.setProperty('--cell', cell + 'px');
      rs.setProperty('--board-w', boardW + 'px');
      rs.setProperty('--peek-h', (D.PEEK_ROWS * cell) + 'px');
      rs.setProperty('--side-w', holdW + 'px');
    }

    this.clearVFX();
    this.rebuildSprites();
    this.rebuildGridLayer();
    this.ensureStackCanvas(boardW, boardH);
    this.lastMatrixVersion = -1;
    this.lastHoldSig = -1;
    this.lastNextSig = -1;
    return true;
  };

  LochtrisRenderer.prototype.configureCanvas = function (canvas, ctx, cssW, cssH) {
    var targetW = Math.round(cssW * this.dpr);
    var targetH = Math.round(cssH * this.dpr);
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  LochtrisRenderer.prototype.ensureStackCanvas = function (cssW, cssH) {
    if (!this.stackCanvas) this.stackCanvas = document.createElement('canvas');
    var tw = Math.round(cssW * this.dpr);
    var th = Math.round(cssH * this.dpr);
    if (this.stackCanvas.width !== tw) this.stackCanvas.width = tw;
    if (this.stackCanvas.height !== th) this.stackCanvas.height = th;
  };

  LochtrisRenderer.prototype.rebuildSprites = function () {
    var key = this.cellSize + ':' + this.dpr + ':' + this.visuals.skin;
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    this.sprites = {};

    var ids = [1, 11, 12, 13, 14, 15, 16, 17];
    var pxSize = Math.round(this.cellSize * this.dpr);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      this.sprites[id] = createBlockSprite(pxSize, D.BLOCK_COLORS[id], this.visuals.skin, this.dpr);
    }
  };

  LochtrisRenderer.prototype.rebuildGridLayer = function () {
    var key = this.cellSize + ':' + this.dpr + ':' + this.visuals.gridOpacity;
    if (key === this.gridKey && this.gridCanvas) return;
    this.gridKey = key;

    var cs = this.cellSize;
    var w = D.MATRIX_WIDTH * cs;
    var totalRows = D.VISIBLE_HEIGHT + D.PEEK_ROWS;
    var h = totalRows * cs;
    var peekPx = D.PEEK_ROWS * cs;

    if (!this.gridCanvas) this.gridCanvas = document.createElement('canvas');
    var targetW = Math.round(w * this.dpr);
    var targetH = Math.round(h * this.dpr);
    if (this.gridCanvas.width !== targetW) this.gridCanvas.width = targetW;
    if (this.gridCanvas.height !== targetH) this.gridCanvas.height = targetH;

    var gctx = this.gridCanvas.getContext('2d', { alpha: true });
    gctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    gctx.clearRect(0, 0, w, h);

    // Submerged depth gradient well: faintly translucent near skyline, deep abyssal contrast below
    var wellGrad = gctx.createLinearGradient(0, peekPx, 0, h);
    wellGrad.addColorStop(0.0, 'rgba(5, 25, 38, 0.74)');
    wellGrad.addColorStop(0.45, 'rgba(3, 15, 25, 0.84)');
    wellGrad.addColorStop(1.0, 'rgba(2, 10, 17, 0.90)');
    gctx.fillStyle = wellGrad;
    gctx.fillRect(0, peekPx, w, h - peekPx);

    // Subtle sunlit surface sheen right beneath the skyline
    var topSheen = gctx.createLinearGradient(0, peekPx, 0, peekPx + cs * 1.4);
    topSheen.addColorStop(0.0, 'rgba(136, 228, 244, 0.08)');
    topSheen.addColorStop(1.0, 'rgba(136, 228, 244, 0)');
    gctx.fillStyle = topSheen;
    gctx.fillRect(0, peekPx, w, cs * 1.4);

    gctx.fillStyle = 'rgba(148, 230, 244, 0.34)';
    gctx.fillRect(0, peekPx - 1, w, 1);

    var gridAlpha = (this.visuals.gridOpacity / 100) * 0.24;
    if (gridAlpha > 0.005) {
      gctx.strokeStyle = 'rgba(138, 204, 222, ' + gridAlpha.toFixed(3) + ')';
      gctx.lineWidth = 1;
      gctx.beginPath();
      for (var gx = 1; gx < D.MATRIX_WIDTH; gx++) {
        var px = gx * cs + 0.5;
        gctx.moveTo(px, peekPx);
        gctx.lineTo(px, h);
      }
      for (var gy = 1; gy < D.VISIBLE_HEIGHT; gy++) {
        var py = peekPx + gy * cs + 0.5;
        gctx.moveTo(0, py);
        gctx.lineTo(w, py);
      }
      gctx.stroke();
    }
  };

  LochtrisRenderer.prototype.syncStackCache = function (engine) {
    if (engine.matrixVersion === this.lastMatrixVersion && this.stackCanvas) return;
    this.lastMatrixVersion = engine.matrixVersion;

    var cs = this.cellSize;
    var w = D.MATRIX_WIDTH * cs;
    var totalRows = D.VISIBLE_HEIGHT + D.PEEK_ROWS;
    var h = totalRows * cs;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    this.ensureStackCanvas(w, h);

    var sctx = this.stackCanvas.getContext('2d', { alpha: true });
    sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);

    var highestVis = totalRows;
    for (var r = rowOffset; r < D.MATRIX_HEIGHT; r++) {
      var visR = r - rowOffset;
      var visY = visR * cs;
      var row = engine.matrix[r];
      for (var c = 0; c < D.MATRIX_WIDTH; c++) {
        var bid = row[c];
        if (bid !== 0) {
          if (visR < highestVis) highestVis = visR;
          var spr = this.sprites[bid];
          if (spr) sctx.drawImage(spr, c * cs, visY, cs, cs);
        }
      }
    }
    this.highestOccupiedVisRow = highestVis;
  };

  LochtrisRenderer.prototype.clearVFX = function () {
    this.trails.length = 0;
    this.beams.length = 0;
    this.rings.length = 0;
    this.dissolveCells.length = 0;
    this.lockFlashes.length = 0;
    this.lineFlashes.length = 0;
    this.shatterShards.length = 0;
    for (var i = 0; i < MAX_PARTICLES; i++) this.particlePool[i].alive = false;
    this.activeParticleCount = 0;
    this.particleCursor = 0;
    this.collapseBands.length = 0;
    this.collapseAge = 0;
    this.collapseLife = 0;
    this.spawnSheen = 0;
    this.nextSlidePx = 0;
    this.pcHalo = 0;
    this.guideSnapFlash = 0;
    this.lockWarnFlash = 0;
    this.spring.x = 0; this.spring.vx = 0; this.spring.targetX = 0;
    if (this.bounceEl && this.lastBounceTransform !== '') {
      this.bounceEl.style.transform = '';
      this.lastBounceTransform = '';
    }
  };

  LochtrisRenderer.prototype.bounceScale = function () {
    if (this.reducedMotion) return 0;
    return this.visuals.bounce / 100;
  };

  /*--------------------------------------------------------------------------------------
    Gameplay Event VFX Hooks
  --------------------------------------------------------------------------------------*/
  LochtrisRenderer.prototype.onSpawn = function (ev) {
    if (this.reducedMotion) return;
    this.spawnSheen = 1.0;
    var shifted = (ev && ev.queueShifted) ? ev.queueShifted : 0;
    if (shifted > 0) {
      var slotStep = this.previewCell * 1.15;
      var maxSlide = this.previewCell * 1.35;
      this.nextSlidePx = Math.min(maxSlide, this.nextSlidePx * 0.35 + shifted * slotStep * 0.55);
    }
  };

  LochtrisRenderer.prototype.onGuideAlign = function () {
    if (this.reducedMotion) return;
    this.guideSnapFlash = 1.0;
  };

  LochtrisRenderer.prototype.onLockWarn = function () {
    if (this.reducedMotion) return;
    this.lockWarnFlash = 1.0;
  };

  LochtrisRenderer.prototype.addTrail = function (mino, rotDir, x, y, alpha, life) {
    if (this.reducedMotion || !this.visuals.particles || !mino) return;
    if (this.trails.length >= MAX_TRAILS) return;
    this.trails.push({
      mino: mino,
      dir: rotDir,
      x: x,
      y: y,
      alpha: alpha,
      age: 0,
      life: life
    });
  };

  LochtrisRenderer.prototype.addRing = function (x, y, r0, r1, color, lineWidth, life, delay) {
    if (this.reducedMotion || !this.visuals.particles) return;
    if (this.rings.length >= MAX_RINGS) return;
    this.rings.push({
      x: x,
      y: y,
      r0: r0,
      r1: r1,
      color: color,
      lineWidth: lineWidth,
      age: -(delay || 0),
      life: life
    });
  };

  LochtrisRenderer.prototype.onMove = function (ev) {
    if (!ev || this.reducedMotion || !this.visuals.particles) return;
    if (ev.snapped && ev.steps >= 2 && ev.mino) {
      var ghosts = Math.min(2, ev.steps);
      for (var i = 0; i < ghosts; i++) {
        var frac = (i + 1) / (ghosts + 1);
        var gx = ev.fromX + (ev.col - ev.fromX) * frac;
        this.addTrail(ev.mino, ev.rotDir, gx, ev.y, 0.16 + frac * 0.10, 62);
      }
    }
  };

  LochtrisRenderer.prototype.onHardDrop = function (ev) {
    this.addLockFlash(ev.cells, ev.color);
    if (!this.visuals.particles || this.reducedMotion) return;

    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    if (ev.dy > 0 && ev.cells && ev.cells.length > 0) {
      var colTop = {};
      var colBot = {};
      for (var i = 0; i < ev.cells.length; i++) {
        var cx = ev.cells[i][0];
        var cy = ev.cells[i][1];
        var startY = cy - ev.dy;
        if (colTop[cx] === undefined || startY < colTop[cx]) colTop[cx] = startY;
        if (colBot[cx] === undefined || cy > colBot[cx]) colBot[cx] = cy;
      }
      var cols = Object.keys(colTop);
      for (var j = 0; j < cols.length; j++) {
        var col = parseInt(cols[j], 10);
        this.beams.push({
          col: col,
          fromRow: colTop[col] - rowOffset,
          toRow: colBot[col] - rowOffset + 1,
          color: ev.color,
          age: 0,
          life: 105
        });
      }
    }

    var count = Math.min(10, 4 + Math.floor((ev.dy || 0) * 0.4));
    for (var p = 0; p < count; p++) {
      var cell = ev.cells[p % ev.cells.length];
      var isMote = (p % 3 === 0);
      this.spawnParticle(
        (cell[0] + 0.15 + Math.random() * 0.7) * this.cellSize,
        (cell[1] - rowOffset + 0.85) * this.cellSize,
        (Math.random() - 0.5) * (isMote ? 55 : 140),
        isMote ? -(55 + Math.random() * 75) : -(45 + Math.random() * 115),
        ev.color,
        isMote ? (3.2 + Math.random() * 2.4) : (2.0 + Math.random() * 1.6),
        isMote ? (230 + Math.random() * 50) : (130 + Math.random() * 60),
        isMote ? 'mote' : 'spark'
      );
    }
  };

  LochtrisRenderer.prototype.onLock = function (ev) {
    this.addLockFlash(ev.cells, ev.color);
  };

  LochtrisRenderer.prototype.addLockFlash = function (cells, color) {
    if (!cells) return;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    for (var i = 0; i < cells.length; i++) {
      this.lockFlashes.push({
        col: cells[i][0],
        row: cells[i][1] - rowOffset,
        matrixRow: cells[i][1],
        color: color,
        age: 0,
        life: 52
      });
    }
  };

  LochtrisRenderer.prototype.onRotate = function (ev) {
    if (!ev) return;
    if (ev.mino && (ev.kickIndex > 0 || ev.isSpin)) {
      this.addTrail(ev.mino, ev.fromDir, ev.fromX, ev.fromY, ev.isSpin ? 0.30 : 0.20, ev.isSpin ? 95 : 70);
    }

    if (!ev.isSpin) return;

    if (this.visuals.particles && !this.reducedMotion && ev.mino) {
      var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
      var b = ev.mino.bounds[ev.toDir];
      var px = (ev.x + (b.minC + b.maxC + 1) * 0.5) * this.cellSize;
      var py = (ev.y + (b.minR + b.maxR + 1) * 0.5 - rowOffset) * this.cellSize;
      this.addRing(px, py, this.cellSize * 0.35, this.cellSize * 2.4, ev.mino.palette, 2.0, 210, 0);

      for (var i = 0; i < 8; i++) {
        var ang = (i / 8) * Math.PI * 2 + Math.random() * 0.35;
        var spd = 65 + Math.random() * 80;
        var isMote = (i % 2 === 0);
        // Buoyant motes always start rising (vy <= -30); sparks streak radially
        var vy = isMote ? -(45 + Math.random() * 65) : (Math.sin(ang) * spd - 30);
        this.spawnParticle(
          px + Math.cos(ang) * this.cellSize * 0.4,
          py + Math.sin(ang) * this.cellSize * 0.4,
          Math.cos(ang) * spd,
          vy,
          ev.mino.palette,
          isMote ? (3.0 + Math.random() * 2.2) : (2.2 + Math.random() * 1.6),
          isMote ? (210 + Math.random() * 60) : (140 + Math.random() * 60),
          isMote ? 'mote' : 'spark'
        );
      }
    }
  };

  LochtrisRenderer.prototype.onWallPush = function (dir) {
    this.spring.targetX = dir * 1.2 * this.bounceScale();
  };

  LochtrisRenderer.prototype.onSoftDrop = function () {};

  LochtrisRenderer.prototype.onLineClear = function (ev) {
    var isBig = ev.isPC || ev.count >= 4 || ev.tSpin > 0 || Boolean(ev.allSpin) || ev.isB2B;
    var accentHex = ev.isPC ? '#69f0ae'
      : (ev.tSpin > 0 ? '#d88cf0'
      : (ev.allSpin && ev.pieceColor ? ev.pieceColor
      : (ev.count >= 4 ? '#7ee0e6' : '#c6f2fa')));

    if (ev.isPC && !this.reducedMotion) {
      this.pcHalo = 1.0;
    }

    if (!ev.rows || !ev.rows.length) return;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    var cs = this.cellSize;
    var boardW = D.MATRIX_WIDTH * cs;

    // Compute per-row collapse shifts, then merge contiguous equal-shift rows into bands
    var clearedSet = Object.create(null);
    for (var ci = 0; ci < ev.rows.length; ci++) clearedSet[ev.rows[ci]] = true;

    var rowShifts = new Uint8Array(D.MATRIX_HEIGHT);
    var fallen = 0;
    for (var origR = D.MATRIX_HEIGHT - 1; origR >= 0; origR--) {
      if (clearedSet[origR]) {
        fallen++;
      } else if (fallen > 0 && origR + fallen < D.MATRIX_HEIGHT) {
        rowShifts[origR + fallen] = fallen;
      }
    }

    this.collapseBands.length = 0;
    if (!this.reducedMotion && fallen > 0) {
      var curBand = null;
      for (var r = rowOffset; r < D.MATRIX_HEIGHT; r++) {
        var visR = r - rowOffset;
        var sh = rowShifts[r];
        if (!curBand || curBand.shift !== sh) {
          curBand = { startVisR: visR, count: 1, shift: sh };
          this.collapseBands.push(curBand);
        } else {
          curBand.count++;
        }
      }
      this.collapseAge = 0;
      this.collapseLife = 82; // Snappy 82ms grouped band collapse!
    }

    // Shift/drop lockFlashes cleanly with collapsed rows
    for (var lfIdx = this.lockFlashes.length - 1; lfIdx >= 0; lfIdx--) {
      var lf = this.lockFlashes[lfIdx];
      if (clearedSet[lf.matrixRow]) {
        swapRemove(this.lockFlashes, lfIdx);
      } else {
        var dropBy = 0;
        for (var cr = 0; cr < ev.rows.length; cr++) {
          if (ev.rows[cr] > lf.matrixRow) dropBy++;
        }
        lf.matrixRow += dropBy;
        lf.row += dropBy;
      }
    }

    var midVisRow = 0;
    for (var i = 0; i < ev.rows.length; i++) {
      var visRow = ev.rows[i] - rowOffset;
      midVisRow += visRow;

      this.lineFlashes.push({
        row: visRow,
        age: 0,
        life: ev.isPC ? 170 : 120,
        isPC: ev.isPC,
        color: accentHex
      });

      // Sprite-based center-out dissolve using the pre-splice rowBlocks snapshot!
      if (this.visuals.particles && !this.reducedMotion && ev.rowBlocks && ev.rowBlocks[i]) {
        var blocks = ev.rowBlocks[i];
        for (var c = 0; c < D.MATRIX_WIDTH; c++) {
          var bid = blocks[c];
          if (!bid || this.dissolveCells.length >= MAX_DISSOLVE) continue;
          var distFromCenter = Math.abs(c - 4.5);
          this.dissolveCells.push({
            col: c,
            row: visRow,
            bid: bid,
            age: -(distFromCenter * 20),
            life: 145
          });
        }
      }
    }

    // Buoyant water-motes & directional streaks capped per clear event (<= 24 total)
    if (this.visuals.particles && !this.reducedMotion) {
      var totalMotes = ev.isPC ? 24 : (isBig ? 18 : 10);
      for (var s = 0; s < totalMotes; s++) {
        var rowIdx = s % ev.rows.length;
        var visR2 = ev.rows[rowIdx] - rowOffset;
        var cellCol = Math.floor(Math.random() * D.MATRIX_WIDTH);
        var bidColor = (ev.rowBlocks && ev.rowBlocks[rowIdx] && ev.rowBlocks[rowIdx][cellCol])
          ? D.BLOCK_COLORS[ev.rowBlocks[rowIdx][cellCol]]
          : accentHex;
        var isMote2 = (s % 3 !== 0);
        this.spawnParticle(
          (cellCol + Math.random()) * cs,
          (visR2 + 0.5) * cs,
          (Math.random() - 0.5) * (isMote2 ? 80 : 185),
          isMote2 ? -(60 + Math.random() * 110) : -(45 + Math.random() * 135),
          (ev.isPC || s % 2 === 0) ? accentHex : bidColor,
          isMote2 ? (3.4 + Math.random() * 3.0) : (2.0 + Math.random() * 1.8),
          isMote2 ? (240 + Math.random() * 50) : (150 + Math.random() * 70),
          isMote2 ? 'mote' : 'spark'
        );
      }
    }

    // Concentric sonar shockwave rings
    if (this.visuals.particles && !this.reducedMotion && (isBig || ev.count >= 3 || (ev.combo || 0) >= 2)) {
      var cy = (midVisRow / ev.rows.length + 0.5) * cs;
      var cx = boardW * 0.5;
      this.addRing(cx, cy, cs * 0.6, boardW * (ev.isPC ? 1.0 : 0.68), accentHex, ev.isPC ? 2.6 : 1.8, ev.isPC ? 340 : 240, 0);
      if (ev.isPC || ev.count >= 4 || ev.isB2B) {
        this.addRing(cx, cy, cs * 0.3, boardW * (ev.isPC ? 0.80 : 0.50), '#eaf9ff', 1.3, ev.isPC ? 300 : 210, 50);
      }
    }
  };

  LochtrisRenderer.prototype.onFail = function (ev) {
    if (!this.visuals.explodeOnFail || this.reducedMotion || !ev.matrixSnapshot) return;
    this.shatterShards.length = 0;
    var mat = ev.matrixSnapshot;
    var cs = this.cellSize;
    var half = cs * 0.5;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    var totalBlocks = 0;
    for (var cr = rowOffset; cr < D.MATRIX_HEIGHT; cr++) {
      for (var cc = 0; cc < D.MATRIX_WIDTH; cc++) {
        if (mat[cr][cc]) totalBlocks++;
      }
    }
    var quadsPerBlock = totalBlocks * 4 <= MAX_SHARDS ? 4 : (totalBlocks * 2 <= MAX_SHARDS ? 2 : 1);

    for (var r = rowOffset; r < D.MATRIX_HEIGHT && this.shatterShards.length < MAX_SHARDS; r++) {
      for (var c = 0; c < D.MATRIX_WIDTH && this.shatterShards.length < MAX_SHARDS; c++) {
        var bid = mat[r][c];
        if (!bid) continue;
        var color = D.BLOCK_COLORS[bid] || '#888';
        var bx = c * cs;
        var by = (r - rowOffset) * cs;
        var shardW = quadsPerBlock === 1 ? cs * 0.78 : half;
        for (var q = 0; q < quadsPerBlock && this.shatterShards.length < MAX_SHARDS; q++) {
          var ox = (q & 1) * half;
          var oy = ((q >> 1) & 1) * half;
          this.shatterShards.push({
            x: bx + ox,
            y: by + oy,
            w: shardW,
            vx: (Math.random() - 0.5) * 260 + (c - 4.5) * 20,
            vy: -(65 + Math.random() * 190),
            rot: 0,
            vrot: (Math.random() - 0.5) * 12,
            color: color,
            age: 0,
            life: 540 + Math.random() * 200
          });
        }
      }
    }
  };

  // Zero-allocation ring-buffer spawn (recycles oldest slot smoothly if full)
  LochtrisRenderer.prototype.spawnParticle = function (x, y, vx, vy, color, size, life, kind) {
    var pt = this.particlePool[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    if (!pt.alive) this.activeParticleCount++;
    pt.alive = true;
    pt.x = x;
    pt.y = y;
    pt.vx = vx;
    pt.vy = vy;
    pt.color = color;
    pt.sprite = this.moteSprites[color] || this.moteSprites['#7ee0e6'];
    pt.size = size;
    pt.age = 0;
    pt.life = life;
    pt.kind = kind || 'spark';
    pt.phase = Math.random() * Math.PI * 2;
  };

  LochtrisRenderer.prototype.hasPendingVFX = function () {
    var sp = this.spring;
    var spMoving = Math.abs(sp.targetX - sp.x) >= 0.02 || Math.abs(sp.vx) >= 0.05;
    return this.trails.length > 0 ||
      this.beams.length > 0 ||
      this.rings.length > 0 ||
      this.dissolveCells.length > 0 ||
      this.lockFlashes.length > 0 ||
      this.lineFlashes.length > 0 ||
      this.activeParticleCount > 0 ||
      this.shatterShards.length > 0 ||
      this.collapseLife > 0 ||
      this.spawnSheen > 0 ||
      this.nextSlidePx > 0 ||
      this.pcHalo > 0 ||
      this.guideSnapFlash > 0 ||
      this.lockWarnFlash > 0 ||
      spMoving;
  };

  LochtrisRenderer.prototype.updateEffects = function (dtMs) {
    var dt = Math.min(dtMs, 40) / 1000;
    var canvasDirty = false;
    var nextDirty = false;
    var stageActive = false;
    var i;

    // Critically damped wall-push lean (zero oscillation/subpixel grid shimmer)
    var sp = this.spring;
    if (Math.abs(sp.targetX - sp.x) >= 0.02 || Math.abs(sp.vx) >= 0.05) {
      var remSp = dt;
      while (remSp > 0) {
        var step = remSp > 0.008 ? 0.008 : remSp;
        sp.vx += ((sp.targetX - sp.x) * 320 - sp.vx * 38) * step;
        sp.x += sp.vx * step;
        remSp -= step;
      }
      if (Math.abs(sp.targetX - sp.x) < 0.02 && Math.abs(sp.vx) < 0.05) {
        sp.x = sp.targetX;
        sp.vx = 0;
      } else {
        stageActive = true;
      }
      if (this.bounceEl) {
        var nextTf = sp.x !== 0 ? ('translate3d(' + sp.x.toFixed(2) + 'px,0,0)') : '';
        if (nextTf !== this.lastBounceTransform) {
          this.bounceEl.style.transform = nextTf;
          this.lastBounceTransform = nextTf;
        }
      }
    }

    if (this.collapseLife > 0) {
      canvasDirty = true;
      this.collapseAge += dtMs;
      if (this.collapseAge >= this.collapseLife) {
        this.collapseAge = 0;
        this.collapseLife = 0;
        this.collapseBands.length = 0;
      }
    }

    if (this.spawnSheen > 0) {
      canvasDirty = true;
      this.spawnSheen = Math.max(0, this.spawnSheen - dt / 0.075);
    }

    if (this.nextSlidePx > 0) {
      nextDirty = true;
      this.nextSlidePx *= Math.exp(-dt * 58);
      if (this.nextSlidePx < 0.30) this.nextSlidePx = 0;
    }

    if (this.guideSnapFlash > 0) {
      canvasDirty = true;
      this.guideSnapFlash = Math.max(0, this.guideSnapFlash - dt / 0.18);
    }

    if (this.lockWarnFlash > 0) {
      canvasDirty = true;
      this.lockWarnFlash = Math.max(0, this.lockWarnFlash - dt / 0.18);
    }

    if (this.pcHalo > 0) {
      canvasDirty = true;
      this.pcHalo = Math.max(0, this.pcHalo - dt / 0.54); // Synced to 540ms PC harp bloom
    }

    for (i = this.trails.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.trails[i].age += dtMs;
      if (this.trails[i].age >= this.trails[i].life) swapRemove(this.trails, i);
    }

    for (i = this.beams.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.beams[i].age += dtMs;
      if (this.beams[i].age >= this.beams[i].life) swapRemove(this.beams, i);
    }

    for (i = this.rings.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.rings[i].age += dtMs;
      if (this.rings[i].age >= this.rings[i].life) swapRemove(this.rings, i);
    }

    for (i = this.dissolveCells.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.dissolveCells[i].age += dtMs;
      if (this.dissolveCells[i].age >= this.dissolveCells[i].life) swapRemove(this.dissolveCells, i);
    }

    for (i = this.lockFlashes.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.lockFlashes[i].age += dtMs;
      if (this.lockFlashes[i].age >= this.lockFlashes[i].life) swapRemove(this.lockFlashes, i);
    }

    for (i = this.lineFlashes.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.lineFlashes[i].age += dtMs;
      if (this.lineFlashes[i].age >= this.lineFlashes[i].life) swapRemove(this.lineFlashes, i);
    }

    if (this.activeParticleCount > 0) {
      canvasDirty = true;
      var dragMoteX = Math.exp(-dt * 2.6);
      var dragMoteY = Math.exp(-dt * 1.2);
      var dragSpark = Math.exp(-dt * 2.4);
      for (i = 0; i < MAX_PARTICLES; i++) {
        var p = this.particlePool[i];
        if (!p.alive) continue;
        p.age += dtMs;
        if (p.age >= p.life) {
          p.alive = false;
          this.activeParticleCount--;
        } else if (p.kind === 'mote') {
          // Screen +y is down, so negative vy rises upward through the loch!
          p.vx *= dragMoteX;
          p.vy = p.vy * dragMoteY - 36 * dt;
          p.x += (p.vx + Math.sin(p.age * 0.014 + p.phase) * 16) * dt;
          p.y += p.vy * dt;
        } else {
          p.vx *= dragSpark;
          p.vy += 80 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
    }

    for (i = this.shatterShards.length - 1; i >= 0; i--) {
      canvasDirty = true;
      var sh = this.shatterShards[i];
      sh.age += dtMs;
      if (sh.age >= sh.life) {
        swapRemove(this.shatterShards, i);
      } else {
        sh.vy += 580 * dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        sh.rot += sh.vrot * dt;
      }
    }

    return { canvasDirty: canvasDirty, nextDirty: nextDirty, stageActive: stageActive };
  };

  LochtrisRenderer.prototype.render = function (engine, nowMs, forceNext) {
    this.renderBoard(engine, nowMs);
    this.renderHold(engine);
    this.renderNext(engine, Boolean(forceNext));
  };

  LochtrisRenderer.prototype.renderBoard = function (engine, nowMs) {
    var ctx = this.boardCtx;
    var cs = this.cellSize;
    var w = D.MATRIX_WIDTH * cs;
    var totalRows = D.VISIBLE_HEIGHT + D.PEEK_ROWS;
    var h = totalRows * cs;
    var peekPx = D.PEEK_ROWS * cs;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;

    ctx.clearRect(0, 0, w, h);

    // 1. Cached playfield well & gridlines (1 blit)
    if (this.gridCanvas) {
      ctx.drawImage(this.gridCanvas, 0, 0, w, h);
    }

    // 2. Hard-drop light ribbons (cached beam texture, sharp peak -> 105ms taper, behind stack)
    if (this.beams.length > 0) {
      ctx.save();
      for (var bi = 0; bi < this.beams.length; bi++) {
        var bm = this.beams[bi];
        var t = bm.age / bm.life;
        var amp = t < 0.25 ? (0.65 + (t / 0.25) * 0.35) : (1 - easeOutCubic((t - 0.25) / 0.75));
        var bx = bm.col * cs;
        var by0 = Math.max(0, bm.fromRow * cs);
        var by1 = bm.toRow * cs;
        var bSpr = this.beamSprites[bm.color];
        if (by1 > by0 && bSpr) {
          var bw = (cs - 2) * (0.55 + 0.45 * amp);
          ctx.globalAlpha = amp * 0.85;
          ctx.drawImage(bSpr, bx + (cs - bw) * 0.5, by0, bw, by1 - by0);
        }
      }
      ctx.restore();
    }

    // 3. Settled stack (cached offscreen stackCanvas — 1 blit normally, or grouped clipped bands during collapse)
    var hideMatrix = (engine.state === 'failed' && this.visuals.explodeOnFail && this.shatterShards.length > 0);
    if (!hideMatrix) {
      this.syncStackCache(engine);
      if (this.collapseLife > 0 && this.collapseBands.length > 0) {
        var colProg = easeOutCubic(Math.min(1, this.collapseAge / this.collapseLife));
        var remFrac = 1 - colProg;
        var rowPxSrc = Math.round(cs * this.dpr);
        var srcW = this.stackCanvas.width;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        for (var bIdx = 0; bIdx < this.collapseBands.length; bIdx++) {
          var band = this.collapseBands[bIdx];
          var bandH = band.count * cs;
          var dy = band.shift > 0 ? -(band.shift * cs * remFrac) : 0;
          var drawY = Math.round((band.startVisR * cs + dy) * this.dpr) / this.dpr;
          ctx.drawImage(
            this.stackCanvas,
            0, band.startVisR * rowPxSrc, srcW, band.count * rowPxSrc,
            0, drawY, w, bandH
          );
        }
        ctx.restore();
      } else {
        ctx.drawImage(this.stackCanvas, 0, 0, w, h);
      }
    }

    // 4. Crisp 52ms lock perimeter rim flashes
    if (this.lockFlashes.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#eefbff';
      ctx.lineWidth = 1.6;
      for (var li = 0; li < this.lockFlashes.length; li++) {
        var lf = this.lockFlashes[li];
        var lt = 1 - lf.age / lf.life;
        ctx.globalAlpha = lt * lt * 0.72;
        ctx.strokeRect(lf.col * cs + 1, lf.row * cs + 1, cs - 2, cs - 2);
      }
      ctx.restore();
    }

    // 5. Non-obstructing clear effects (drawn BELOW Ghost & Active Piece for 5+ PPS readability)
    if (this.lineFlashes.length > 0) {
      ctx.save();
      for (var fi = 0; fi < this.lineFlashes.length; fi++) {
        var fl = this.lineFlashes[fi];
        var ft = fl.age / fl.life;
        var fadeFl = 1 - easeOutCubic(ft);
        var halfW = w * 0.5 * (0.30 + easeOutCubic(ft) * 0.70);
        ctx.globalAlpha = fadeFl * (fl.isPC ? 0.34 : 0.26);
        ctx.fillStyle = fl.color;
        ctx.fillRect(w * 0.5 - halfW, fl.row * cs + cs * 0.22, halfW * 2, cs * 0.56);
        // Thin seafoam water-ripple filament along the center of each cleared row
        ctx.globalAlpha = fadeFl * 0.42;
        ctx.fillStyle = '#d4f9ff';
        ctx.fillRect(w * 0.5 - halfW, fl.row * cs + cs * 0.48, halfW * 2, 1.5);
      }
      ctx.restore();
    }

    // Sprite-based center-out dissolve tiles (uses cached block sprites, <= 0.42 alpha, zero white-out)
    if (this.dissolveCells.length > 0) {
      ctx.save();
      for (var di = 0; di < this.dissolveCells.length; di++) {
        var dc = this.dissolveCells[di];
        if (dc.age < 0) continue;
        var dSpr = this.sprites[dc.bid];
        if (!dSpr) continue;
        var dtProg = easeOutCubic(dc.age / dc.life);
        var sy = Math.max(0.08, 1 - dtProg * 0.92);
        var sx = Math.max(0.42, 1 - dtProg * 0.44);
        var dw = cs * sx;
        var dh = cs * sy;
        var dx = (dc.col + 0.5) * cs - dw * 0.5;
        var dy = (dc.row + 0.5) * cs - dh * 0.5 - dtProg * cs * 0.22;
        ctx.globalAlpha = (1 - dtProg) * 0.42;
        ctx.drawImage(dSpr, dx, dy, dw, dh);
      }
      ctx.restore();
    }

    // Bioluminescent sonar rings (clipped to well)
    if (this.rings.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      for (var ri = 0; ri < this.rings.length; ri++) {
        var rg = this.rings[ri];
        if (rg.age < 0) continue;
        var rt = easeOutCubic(rg.age / rg.life);
        var radius = rg.r0 + (rg.r1 - rg.r0) * rt;
        ctx.globalAlpha = (1 - rt) * 0.62;
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = Math.max(0.8, rg.lineWidth * (1 - rt * 0.5));
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Perfect Clear rising Abyssal Halo (uses cached highestOccupiedVisRow, stops above stack)
    if (this.pcHalo > 0) {
      var lowestEmptyY = this.highestOccupiedVisRow * cs;
      if (lowestEmptyY > peekPx) {
        ctx.save();
        var haloProg = 1 - this.pcHalo;
        var bandY = lowestEmptyY - haloProg * (lowestEmptyY - peekPx);
        var bandH = cs * 2.4;
        ctx.globalAlpha = this.pcHalo * 0.34;
        ctx.fillStyle = '#69f0ae';
        ctx.fillRect(0, Math.max(peekPx, bandY - bandH * 0.5), w, Math.min(bandH, lowestEmptyY - peekPx));
        ctx.restore();
      }
    }

    // Pre-rendered bokeh mote sprites (1 drawImage/mote!) & directional spark streaks
    if (this.activeParticleCount > 0) {
      ctx.save();
      for (var pi = 0; pi < MAX_PARTICLES; pi++) {
        var pt = this.particlePool[pi];
        if (!pt.alive) continue;
        var alpha = 1 - pt.age / pt.life;
        if (pt.kind === 'mote') {
          var d = pt.size * (2.6 + 0.8 * alpha);
          ctx.globalAlpha = alpha * 0.88;
          ctx.drawImage(pt.sprite, pt.x - d * 0.5, pt.y - d * 0.5, d, d);
        } else {
          var vxLen = pt.vx * 0.020;
          var vyLen = pt.vy * 0.020;
          ctx.globalAlpha = alpha * 0.82;
          ctx.strokeStyle = pt.color;
          ctx.lineWidth = Math.max(1.2, pt.size * 0.62);
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x - vxLen, pt.y - vyLen);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Fail shatter shards (single save/restore, clean DPR-composed transform)
    if (this.shatterShards.length > 0) {
      ctx.save();
      var dpr = this.dpr;
      for (var si = 0; si < this.shatterShards.length; si++) {
        var sh = this.shatterShards[si];
        var st = 1 - sh.age / sh.life;
        var cR = Math.cos(sh.rot);
        var sR = Math.sin(sh.rot);
        ctx.setTransform(cR * dpr, sR * dpr, -sR * dpr, cR * dpr, (sh.x + sh.w * 0.5) * dpr, (sh.y + sh.w * 0.5) * dpr);
        ctx.globalAlpha = st;
        ctx.fillStyle = sh.color;
        ctx.fillRect(-sh.w * 0.5, -sh.w * 0.5, sh.w, sh.w);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.restore();
    }

    // 6. Guide target overlay
    if (engine.guideMode && engine.curGuide) {
      this.renderGuide(ctx, engine, cs, rowOffset, nowMs);
    }

    // 7. Motion trails (behind active piece)
    if (this.trails.length > 0) {
      ctx.save();
      for (var ti = 0; ti < this.trails.length; ti++) {
        var tr = this.trails[ti];
        var tf = 1 - (tr.age / tr.life);
        var tSpr = this.sprites[tr.mino.placedBlockId];
        if (!tSpr) continue;
        ctx.globalAlpha = tr.alpha * tf * tf;
        var tOff = tr.mino.cells[tr.dir];
        for (var tc = 0; tc < 4; tc++) {
          var tx = (tr.x + tOff[tc][0]) * cs;
          var ty = (tr.y + tOff[tc][1] - rowOffset) * cs;
          if (ty + cs > 0) ctx.drawImage(tSpr, tx, ty, cs, cs);
        }
      }
      ctx.restore();
    }

    // 8. Ghost piece (drawn ABOVE clear VFX; outline-only while stack collapse or trails are active)
    if (engine.curMino && this.visuals.ghostOpacity > 0) {
      var ghostY = engine.getGhostY();
      if (ghostY !== engine.curY) {
        var gOffsets = engine.curMino.cells[engine.curDir];
        var gAlpha = this.visuals.ghostOpacity / 100;
        var gSpr = this.sprites[engine.curMino.placedBlockId];
        ctx.save();
        if (this.trails.length === 0 && this.collapseLife === 0 && gSpr) {
          ctx.globalAlpha = gAlpha;
          for (var gi = 0; gi < 4; gi++) {
            var gcx = (engine.curX + gOffsets[gi][0]) * cs;
            var gcy = (ghostY + gOffsets[gi][1] - rowOffset) * cs;
            if (gcy + cs > 0) ctx.drawImage(gSpr, gcx, gcy, cs, cs);
          }
        }
        ctx.globalAlpha = Math.min(0.85, gAlpha + 0.24);
        ctx.strokeStyle = engine.curMino.palette;
        ctx.lineWidth = 1.25;
        for (var gj = 0; gj < 4; gj++) {
          var ox = (engine.curX + gOffsets[gj][0]) * cs;
          var oy = (ghostY + gOffsets[gj][1] - rowOffset) * cs;
          if (oy + cs > 0) ctx.strokeRect(ox + 1, oy + 1, cs - 2, cs - 2);
        }
        ctx.restore();
      }
    }

    // 9. Active falling piece ALWAYS LAST (zero per-frame rgba string allocations!)
    if (engine.curMino) {
      var aOffsets = engine.curMino.cells[engine.curDir];
      var aSpr = this.sprites[engine.curMino.placedBlockId];
      var lockProg = engine.getLockProgress();
      var hasDarken = lockProg > 0.02;
      var hasSheen = this.spawnSheen > 0.05;
      var hasWarn = this.lockWarnFlash > 0.04;
      var sheenH = Math.max(2, cs * 0.14);

      if (aSpr) {
        for (var ai = 0; ai < 4; ai++) {
          var acx = (engine.curX + aOffsets[ai][0]) * cs;
          var acy = (engine.curY + aOffsets[ai][1] - rowOffset) * cs;
          if (acy + cs > 0) ctx.drawImage(aSpr, acx, acy, cs, cs);
        }
      }
      if (hasDarken || hasSheen || hasWarn) {
        ctx.save();
        if (hasDarken) {
          ctx.fillStyle = '#000000';
          ctx.globalAlpha = lockProg * 0.20;
          for (var di2 = 0; di2 < 4; di2++) {
            var dcx = (engine.curX + aOffsets[di2][0]) * cs;
            var dcy = (engine.curY + aOffsets[di2][1] - rowOffset) * cs;
            if (dcy + cs > 0) ctx.fillRect(dcx, dcy, cs, cs);
          }
        }
        if (hasSheen) {
          ctx.fillStyle = '#f0fdff';
          ctx.globalAlpha = this.spawnSheen * 0.22;
          for (var si2 = 0; si2 < 4; si2++) {
            var scx = (engine.curX + aOffsets[si2][0]) * cs;
            var scy = (engine.curY + aOffsets[si2][1] - rowOffset) * cs;
            if (scy + cs > 0) ctx.fillRect(scx + 1, scy + 1, cs - 2, sheenH);
          }
        }
        if (hasWarn) {
          ctx.strokeStyle = '#ff6c6c';
          ctx.lineWidth = 1.75;
          ctx.globalAlpha = this.lockWarnFlash * 0.90;
          for (var wi = 0; wi < 4; wi++) {
            var wcx = (engine.curX + aOffsets[wi][0]) * cs;
            var wcy = (engine.curY + aOffsets[wi][1] - rowOffset) * cs;
            if (wcy + cs > 0) ctx.strokeRect(wcx + 1, wcy + 1, cs - 2, cs - 2);
          }
        }
        ctx.restore();
      }
    }
  };

  LochtrisRenderer.prototype.renderGuide = function (ctx, engine, cs, rowOffset, nowMs) {
    var g = engine.curGuide;
    var offsets = g.mino.cells[g.dir];
    var aligned = engine.isGuideAligned();
    var pulse = this.reducedMotion ? 0.72 : (0.60 + 0.22 * Math.sin((nowMs || 0) * 0.0055));
    var baseColor = aligned ? '#69f0ae' : g.mino.palette;
    var fillAlpha = aligned ? (0.28 + this.guideSnapFlash * 0.20) : (0.13 + 0.09 * pulse);
    var strokeAlpha = aligned ? 0.96 : (0.70 + 0.20 * pulse);

    ctx.save();
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = aligned ? 2.2 : 1.7;

    for (var i = 0; i < 4; i++) {
      var x = (g.x + offsets[i][0]) * cs;
      var y = (g.y + D.DEADLINE_HEIGHT + offsets[i][1] - rowOffset) * cs;
      ctx.globalAlpha = fillAlpha;
      ctx.fillRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
      ctx.globalAlpha = strokeAlpha;
      ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
    }
    ctx.restore();
  };

  LochtrisRenderer.prototype.drawMiniPiece = function (ctx, mino, boxX, boxY, boxW, boxH, dimmed, scale) {
    if (!mino) return;
    var b = mino.bounds[0];
    var offsets = mino.cells[0];
    var cell = Math.max(8, Math.round(this.previewCell * (scale || 1)));
    var pw = (b.maxC - b.minC + 1) * cell;
    var ph = (b.maxR - b.minR + 1) * cell;
    var startX = Math.round(boxX + (boxW - pw) * 0.5);
    var startY = Math.round(boxY + (boxH - ph) * 0.5);
    var spr = this.sprites[dimmed ? 1 : mino.placedBlockId];
    if (!spr) return;

    ctx.save();
    if (dimmed) ctx.globalAlpha = 0.48;
    for (var i = 0; i < 4; i++) {
      ctx.drawImage(
        spr,
        startX + (offsets[i][0] - b.minC) * cell,
        startY + (offsets[i][1] - b.minR) * cell,
        cell,
        cell
      );
    }
    ctx.restore();
  };

  LochtrisRenderer.prototype.renderHold = function (engine) {
    var sig = ((engine.curHold ? engine.curHold.id : 0) << 1) | (engine.canHold ? 1 : 0);
    if (sig === this.lastHoldSig) return;
    this.lastHoldSig = sig;

    var w = this.holdCanvas.width / this.dpr;
    var h = this.holdCanvas.height / this.dpr;
    this.holdCtx.clearRect(0, 0, w, h);
    if (engine.curHold) {
      this.drawMiniPiece(this.holdCtx, engine.curHold, 0, 0, w, h, !engine.canHold, 0.96);
    }
  };

  LochtrisRenderer.prototype.renderNext = function (engine, forceRedraw) {
    var sig = 0;
    for (var i = 0; i < D.NEXT_MINOS; i++) {
      sig = sig * 16 + (engine.queue[i] ? engine.queue[i].id : 0);
    }
    if (!forceRedraw && sig === this.lastNextSig && this.nextSlidePx <= 0) return;
    this.lastNextSig = sig;

    var ctx = this.nextCtx;
    var w = this.nextCanvas.width / this.dpr;
    var h = this.nextCanvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);

    var firstH = Math.round(this.previewCell * 2.95);
    var restH = (h - firstH) / (D.NEXT_MINOS - 1);
    var slideY = this.nextSlidePx;

    for (var j = 0; j < D.NEXT_MINOS; j++) {
      var mino = engine.queue[j];
      var y0 = j === 0 ? 0 : firstH + (j - 1) * restH;
      var sh = j === 0 ? firstH : restH;
      var scale = j === 0 ? 1.0 : (j === 1 ? 0.84 : 0.78);

      if (j > 0) {
        ctx.fillStyle = j === 1 ? 'rgba(206, 226, 236, 0.24)' : 'rgba(136, 198, 218, 0.13)';
        ctx.fillRect(6, Math.round(y0) + 0.5, w - 12, 1);
      }
      if (mino) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, w, sh);
        ctx.clip();
        this.drawMiniPiece(ctx, mino, 0, y0 + slideY, w, sh, false, scale);
        ctx.restore();
      }
    }
  };

  LochtrisRenderer.renderSkinPreview = function (canvas, skin) {
    if (!canvas) return;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var cssW = 148;
    var cssH = 24;
    var tw = Math.round(cssW * dpr);
    var th = Math.round(cssH * dpr);
    if (canvas.width !== tw) canvas.width = tw;
    if (canvas.height !== th) canvas.height = th;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var ids = [11, 12, 13, 14, 15, 16, 17];
    var cell = 18;
    var gap = 3;
    var pxSize = Math.round(cell * dpr);
    var totalW = ids.length * cell + (ids.length - 1) * gap;
    var startX = Math.round((cssW - totalW) * 0.5);
    var startY = Math.round((cssH - cell) * 0.5);

    for (var i = 0; i < ids.length; i++) {
      var spr = createBlockSprite(pxSize, D.BLOCK_COLORS[ids[i]], skin, dpr);
      ctx.drawImage(spr, startX + i * (cell + gap), startY, cell, cell);
    }
  };

  /*--------------------------------------------------------------------------------------
    LochtrisBackdrop — Lightweight underwater Scottish loch atmosphere canvas.
    Pre-rendered light-shaft, bloom, and bokeh textures keep per-frame cost < 0.3ms
    with zero gradient or object allocations in the animation loop.
  --------------------------------------------------------------------------------------*/
  function createRaySprite() {
    var c = document.createElement('canvas');
    c.width = 96;
    c.height = 256;
    var ctx = c.getContext('2d');
    var hGrad = ctx.createLinearGradient(0, 0, 96, 0);
    hGrad.addColorStop(0.0, 'rgba(130, 232, 248, 0)');
    hGrad.addColorStop(0.32, 'rgba(130, 232, 248, 0.28)');
    hGrad.addColorStop(0.50, 'rgba(176, 246, 255, 0.52)');
    hGrad.addColorStop(0.68, 'rgba(130, 232, 248, 0.28)');
    hGrad.addColorStop(1.0, 'rgba(130, 232, 248, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 96, 256);

    ctx.globalCompositeOperation = 'destination-in';
    var vGrad = ctx.createLinearGradient(0, 0, 0, 256);
    vGrad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
    vGrad.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    vGrad.addColorStop(0.82, 'rgba(255,255,255,0.08)');
    vGrad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 96, 256);
    return c;
  }

  function createBloomSprite(hex) {
    var c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(80, 80, 4, 80, 80, 78);
    g.addColorStop(0.0, rgbaHex(hex, 0.52));
    g.addColorStop(0.42, rgbaHex(hex, 0.18));
    g.addColorStop(1.0, rgbaHex(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 160, 160);
    return c;
  }

  function LochtrisBackdrop(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
    this.w = 640;
    this.h = 360;
    this.time = 0;
    this.energy = 0;
    this.energyKind = 'cyan';

    this.raySprite = this.ctx ? createRaySprite() : null;
    this.bloomSprites = this.ctx ? {
      cyan: createBloomSprite('#58d8ee'),
      spin: createBloomSprite('#c68ef6'),
      pc: createBloomSprite('#69f0ae')
    } : {};
    this.moteSprites = this.ctx ? [
      createMoteSprite('#84e8f8'),
      createMoteSprite('#5cd4e8'),
      createMoteSprite('#d6f7ff'),
      createMoteSprite('#7ef0cc')
    ] : [];

    // 5 soft volumetric sunbeams angling down from the loch surface
    this.rays = [
      { x: 0.16, w: 0.17, len: 0.84, tilt: 0.16, speed: 0.24, phase: 0.4, baseAlpha: 0.085 },
      { x: 0.34, w: 0.22, len: 0.92, tilt: 0.13, speed: 0.19, phase: 2.1, baseAlpha: 0.110 },
      { x: 0.52, w: 0.25, len: 0.96, tilt: 0.10, speed: 0.16, phase: 3.7, baseAlpha: 0.125 },
      { x: 0.70, w: 0.20, len: 0.88, tilt: 0.08, speed: 0.22, phase: 5.0, baseAlpha: 0.095 },
      { x: 0.86, w: 0.15, len: 0.76, tilt: 0.06, speed: 0.27, phase: 1.3, baseAlpha: 0.070 }
    ];

    // 48 pre-allocated multi-depth bioluminescent plankton motes & fine rising micro-bubbles
    this.motes = [];
    var seed = 1337;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    for (var i = 0; i < 48; i++) {
      var depth = i < 20 ? 0.38 : (i < 38 ? 0.68 : 1.0);
      this.motes.push({
        x: rand(),
        y: rand(),
        z: depth,
        r: (depth === 0.38 ? 2.2 : (depth === 0.68 ? 3.8 : 5.6)) + rand() * 2.4,
        vy: -(0.006 + depth * 0.014 + rand() * 0.008),
        swayAmp: 0.003 + rand() * 0.007,
        swayFreq: 0.35 + rand() * 0.55,
        phase: rand() * Math.PI * 2,
        twinkleFreq: 0.8 + rand() * 1.4,
        spriteIdx: i % 4,
        flare: 0,
        vxKick: 0,
        vyKick: 0
      });
    }

    // Reactive expanding sonar ripples (max 4 concurrent)
    this.ripples = [];
    this.resize();
  }

  LochtrisBackdrop.prototype.resize = function () {
    if (!this.canvas || !this.ctx) return;
    var vw = root.innerWidth || 1280;
    var vh = root.innerHeight || 720;
    var scale = 0.6;
    var tw = Math.max(360, Math.min(960, Math.round(vw * scale)));
    var th = Math.max(220, Math.min(540, Math.round(vh * scale)));
    if (this.canvas.width !== tw || this.canvas.height !== th) {
      this.canvas.width = tw;
      this.canvas.height = th;
      this.w = tw;
      this.h = th;
    }
  };

  LochtrisBackdrop.prototype.pulse = function (kind, amp, originNormY) {
    if (!amp || amp <= 0) {
      this.ripples.length = 0;
      this.energy = 0;
      return;
    }
    var k = kind || 'cyan';
    var ny = (typeof originNormY === 'number' && isFinite(originNormY))
      ? Math.max(0.20, Math.min(0.84, originNormY))
      : 0.52;
    this.energy = Math.min(1.0, Math.max(this.energy, amp));
    this.energyKind = k;
    this.energyNormY = ny;
    var color = k === 'pc' ? '#69f0ae' : (k === 'spin' ? '#d498f8' : '#7ae8f8');
    var dur = k === 'pc' ? 1280 : (k === 'spin' ? 880 : 760);
    if (this.ripples.length >= 4) this.ripples.shift();
    this.ripples.push({
      age: 0,
      life: dur,
      color: color,
      amp: Math.min(1, amp),
      ny: ny,
      rPrev: 0
    });
    if (k === 'pc' && this.ripples.length < 4) {
      this.ripples.push({
        age: -130,
        life: 1180,
        color: '#a8fce0',
        amp: 0.72,
        ny: ny,
        rPrev: 0
      });
    }
  };

  LochtrisBackdrop.prototype.hasActivePulse = function () {
    return this.ripples.length > 0 || this.energy > 0.015;
  };

  LochtrisBackdrop.prototype.renderStatic = function () {
    this.ripples.length = 0;
    this.energy = 0;
    this.draw(0);
  };

  LochtrisBackdrop.prototype.updateAndRender = function (dtMs) {
    if (!this.ctx) return;
    var dt = Math.min(dtMs, 50) / 1000;
    this.time += dt;
    if (this.energy > 0) {
      this.energy = Math.max(0, this.energy - dt * 0.95);
    }

    var w = this.w;
    var h = this.h;
    var cx = w * 0.5;
    var cy = h * 0.50;
    var rMax = Math.hypot(w, h) * 0.56;

    // Advance reactive sonar ripples and gently illuminate/nudge passing motes
    for (var ri = this.ripples.length - 1; ri >= 0; ri--) {
      var rp = this.ripples[ri];
      rp.age += dtMs;
      if (rp.age >= rp.life) {
        this.ripples.splice(ri, 1);
      } else if (rp.age >= 0) {
        var prog = easeOutCubic(rp.age / rp.life);
        var rad = 26 + prog * rMax;
        var band = Math.max(22, rad - rp.rPrev + 14);
        var rcy = h * (rp.ny || 0.52);
        for (var mi = 0; mi < this.motes.length; mi++) {
          var mt = this.motes[mi];
          var dx = mt.x * w - cx;
          var dy = mt.y * h - rcy;
          var dist = Math.hypot(dx, dy);
          if (Math.abs(dist - rad) < band && dist > 1) {
            mt.flare = Math.min(1, Math.max(mt.flare, rp.amp * (1 - prog * 0.45)));
            var push = (0.016 * rp.amp * (1 - prog * 0.6)) / dist;
            mt.vxKick += dx * push;
            mt.vyKick += (dy * push - 0.012 * rp.amp);
          }
        }
        rp.rPrev = rad;
      }
    }

    var kickDecay = Math.exp(-dt * 3.4);
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      m.y += (m.vy + m.vyKick) * dt;
      m.x += (Math.sin(this.time * m.swayFreq + m.phase) * m.swayAmp + m.vxKick) * dt;
      m.vxKick *= kickDecay;
      m.vyKick *= kickDecay;
      if (m.flare > 0) m.flare = Math.max(0, m.flare - dt * 1.45);
      if (m.y < -0.05) { m.y = 1.05; m.x = (m.x + 0.37) % 1; }
      if (m.x < -0.04) m.x += 1.08;
      else if (m.x > 1.04) m.x -= 1.08;
    }

    this.draw(this.time);
  };

  LochtrisBackdrop.prototype.draw = function (t) {
    var ctx = this.ctx;
    if (!ctx) return;
    var w = this.w;
    var h = this.h;
    var cx = w * 0.5;
    var cy = h * 0.50;

    ctx.clearRect(0, 0, w, h);

    // 1. Delicate undulating Snell's-window surface refraction filaments at the top
    ctx.save();
    for (var s = 0; s < 3; s++) {
      var baseY = h * (0.045 + s * 0.036);
      var ampY = h * (0.011 + s * 0.004);
      var spd = (s % 2 === 0 ? 0.55 : -0.42) + s * 0.12;
      var alpha = (0.14 - s * 0.032) + this.energy * 0.055;
      ctx.beginPath();
      for (var x = 0; x <= w; x += 24) {
        var nx = x / w;
        var y = baseY +
          Math.sin(nx * 6.2 + t * spd + s * 1.7) * ampY +
          Math.sin(nx * 13.5 - t * spd * 1.3 + s) * (ampY * 0.42);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s === 0 ? '#a8f0fc' : '#64d6ea';
      ctx.lineWidth = s === 0 ? 1.8 : (1.3 - s * 0.2);
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Soft volumetric angled god-rays descending through the loch
    if (this.raySprite) {
      ctx.save();
      for (var rIdx = 0; rIdx < this.rays.length; rIdx++) {
        var ray = this.rays[rIdx];
        var sway = Math.sin(t * ray.speed + ray.phase) * 0.025;
        var breath = 0.78 + 0.22 * Math.sin(t * (ray.speed * 1.4) + ray.phase * 1.7);
        var rayW = w * ray.w;
        var rayH = h * ray.len;
        ctx.save();
        ctx.translate((ray.x + sway) * w, -h * 0.06);
        ctx.rotate(-ray.tilt);
        ctx.globalAlpha = (ray.baseAlpha + this.energy * 0.055) * breath;
        ctx.drawImage(this.raySprite, -rayW * 0.5, 0, rayW, rayH);
        ctx.restore();
      }
      ctx.restore();
    }

    // 3. Reactive bioluminescent deep-loch bloom centered at the clear/spin row height
    if (this.energy > 0.01) {
      var bSpr = this.bloomSprites[this.energyKind] || this.bloomSprites.cyan;
      if (bSpr) {
        var bcy = h * (this.energyNormY || 0.52);
        var bw = w * (0.68 + this.energy * 0.14);
        var bh = h * (0.86 + this.energy * 0.12);
        ctx.save();
        ctx.globalAlpha = this.energy * 0.52;
        ctx.drawImage(bSpr, cx - bw * 0.5, bcy - bh * 0.5, bw, bh);
        ctx.restore();
      }
    }

    // 4. Expanding underwater sonar pressure rings radiating from the clear/spin height behind the board
    if (this.ripples.length > 0) {
      var rMax = Math.hypot(w, h) * 0.56;
      ctx.save();
      for (var ri = 0; ri < this.ripples.length; ri++) {
        var rp = this.ripples[ri];
        if (rp.age < 0) continue;
        var p = easeOutCubic(rp.age / rp.life);
        var rad = 26 + p * rMax;
        var fade = (1 - p) * (1 - p);
        var rcy = h * (rp.ny || 0.52);
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = Math.max(0.8, (2.6 - p * 1.6) * rp.amp);
        ctx.globalAlpha = fade * 0.34 * rp.amp;
        ctx.beginPath();
        ctx.ellipse(cx, rcy, rad, rad * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Multi-depth bioluminescent loch plankton & fine micro-bubbles
    if (this.moteSprites.length > 0) {
      ctx.save();
      for (var i = 0; i < this.motes.length; i++) {
        var m = this.motes[i];
        var tw = 0.62 + 0.38 * Math.sin(t * m.twinkleFreq + m.phase);
        var spr = this.moteSprites[m.spriteIdx];
        var sz = (m.r + m.flare * 2.4) * 2;
        var mx = m.x * w;
        var my = m.y * h;
        var baseA = (0.12 + m.z * 0.24) * tw;
        ctx.globalAlpha = Math.min(0.88, baseA + m.flare * 0.52);
        ctx.drawImage(spr, mx - sz * 0.5, my - sz * 0.5, sz, sz);
      }
      ctx.restore();
    }
  };

  root.LochtrisRenderer = LochtrisRenderer;
  root.LochtrisBackdrop = LochtrisBackdrop;
})(typeof globalThis !== 'undefined' ? globalThis : window);
