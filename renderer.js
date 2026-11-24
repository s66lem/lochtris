/*========================================================================================
  renderer.js — High-efficiency DPR-scaled Canvas renderer & spring-physics VFX engine.
  - Caches pre-rendered block sprites & static board well/grid on offscreen canvases
  - Only reallocates canvas backing stores when dimensions or DPR actually change
  - Separates canvas dirty state from board-col spring transforms (steady HUD)
  - Respects prefers-reduced-motion automatically
========================================================================================*/
(function (root) {
  'use strict';

  var D = root.LochtrisData;

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
      // Crisp top-left corner glint
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

  function LochtrisRenderer(elements, visuals) {
    this.boardCanvas = elements.boardCanvas;
    this.boardCtx = this.boardCanvas.getContext('2d', { alpha: true });
    this.holdCanvas = elements.holdCanvas;
    this.holdCtx = this.holdCanvas.getContext('2d', { alpha: true });
    this.nextCanvas = elements.nextCanvas;
    this.nextCtx = this.nextCanvas.getContext('2d', { alpha: true });
    this.bounceEl = elements.boardColEl || elements.stageEl;
    this.arenaEl = elements.arenaEl || null;

    this.visuals = Object.assign({}, D.DEFAULT_VISUALS, visuals || {});
    this.reducedMotion = false;
    this.initReducedMotion();

    this.dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    this.cellSize = 30;
    this.previewCell = 18;
    this.sprites = {};
    this.spriteKey = '';
    this.gridCanvas = null;
    this.gridKey = '';
    this.lastLayoutKey = '';

    this.beams = [];
    this.particles = [];
    this.lockFlashes = [];
    this.lineFlashes = [];
    this.shatterShards = [];
    this.pcFlash = 0;

    this.spring = {
      x: 0, vx: 0, targetX: 0,
      y: 0, vy: 0,
      rot: 0, vrot: 0
    };

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
      if (self.reducedMotion) self.clearVFX();
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
    }
    if (this.visuals.gridOpacity !== prevGrid) {
      this.rebuildGridLayer();
    }
  };

  LochtrisRenderer.prototype.resize = function () {
    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    var arenaW = (this.arenaEl && this.arenaEl.clientWidth > 0) ? this.arenaEl.clientWidth : (root.innerWidth || 1200);
    var arenaH = (this.arenaEl && this.arenaEl.clientHeight > 0) ? this.arenaEl.clientHeight : Math.max(360, (root.innerHeight || 800) - 96);

    var sideReserve = arenaW < 720 ? 186 : 292;
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
    // Slot 0 is full-height, slots 1..4 are slightly tighter for visual hierarchy
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

    // Abyssal playfield well below skyline
    gctx.fillStyle = 'rgba(3, 12, 20, 0.90)';
    gctx.fillRect(0, peekPx, w, h - peekPx);

    // Subtle skyline bar
    gctx.fillStyle = 'rgba(204, 224, 234, 0.28)';
    gctx.fillRect(0, peekPx - 1, w, 1);

    // Cached gridlines
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

  LochtrisRenderer.prototype.clearVFX = function () {
    this.beams.length = 0;
    this.particles.length = 0;
    this.lockFlashes.length = 0;
    this.lineFlashes.length = 0;
    this.shatterShards.length = 0;
    this.pcFlash = 0;
    this.spring.x = 0; this.spring.vx = 0; this.spring.targetX = 0;
    this.spring.y = 0; this.spring.vy = 0;
    this.spring.rot = 0; this.spring.vrot = 0;
    if (this.bounceEl) this.bounceEl.style.transform = '';
  };

  LochtrisRenderer.prototype.bounceScale = function () {
    if (this.reducedMotion) return 0;
    return this.visuals.bounce / 100;
  };

  LochtrisRenderer.prototype.onHardDrop = function (ev) {
    var bScale = this.bounceScale();
    if (bScale > 0) this.spring.vy += 116 * bScale;

    this.addLockFlash(ev.cells, ev.color);
    if (!this.visuals.particles || this.reducedMotion) return;

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
          fromRow: colTop[col] - (D.DEADLINE_HEIGHT - D.PEEK_ROWS),
          toRow: colBot[col] - (D.DEADLINE_HEIGHT - D.PEEK_ROWS) + 1,
          color: ev.color,
          age: 0,
          life: 160
        });
      }
    }

    var count = Math.min(12, 4 + Math.floor((ev.dy || 0) * 0.45));
    for (var p = 0; p < count; p++) {
      var cell = ev.cells[p % ev.cells.length];
      this.spawnParticle(
        (cell[0] + Math.random()) * this.cellSize,
        (cell[1] - (D.DEADLINE_HEIGHT - D.PEEK_ROWS) + 0.85) * this.cellSize,
        (Math.random() - 0.5) * 140,
        -(40 + Math.random() * 130),
        ev.color,
        2 + Math.random() * 2.5,
        220 + Math.random() * 140
      );
    }
  };

  LochtrisRenderer.prototype.onLock = function (ev) {
    this.addLockFlash(ev.cells, ev.color);
    var bScale = this.bounceScale();
    if (bScale > 0) this.spring.vy += 30 * bScale;
  };

  LochtrisRenderer.prototype.addLockFlash = function (cells, color) {
    if (!cells) return;
    for (var i = 0; i < cells.length; i++) {
      this.lockFlashes.push({
        col: cells[i][0],
        row: cells[i][1] - (D.DEADLINE_HEIGHT - D.PEEK_ROWS),
        color: color,
        age: 0,
        life: 90
      });
    }
  };

  LochtrisRenderer.prototype.onRotate = function (ev) {
    // Only tilt the well on genuine spins, never on routine turns
    if (!ev || !ev.isSpin) return;
    var bScale = this.bounceScale();
    if (bScale > 0) {
      var dir = ev.step === -1 ? -1 : 1;
      this.spring.vrot += dir * 2.6 * bScale;
    }
  };

  LochtrisRenderer.prototype.onWallPush = function (dir) {
    this.spring.targetX = dir * 2.8 * this.bounceScale();
  };

  LochtrisRenderer.prototype.onSoftDrop = function (ev) {
    if (ev && ev.sonic) {
      var bScale = this.bounceScale();
      if (bScale > 0) this.spring.vy += 36 * bScale;
    }
  };

  LochtrisRenderer.prototype.onLineClear = function (ev) {
    var bScale = this.bounceScale();
    if (bScale > 0) this.spring.vy += (38 + ev.count * 22) * bScale;
    if (ev.isPC) this.pcFlash = 1.0;
    if (!ev.rows) return;

    for (var i = 0; i < ev.rows.length; i++) {
      var visRow = ev.rows[i] - (D.DEADLINE_HEIGHT - D.PEEK_ROWS);
      this.lineFlashes.push({
        row: visRow,
        age: 0,
        life: ev.isPC ? 280 : 180,
        isPC: ev.isPC
      });
      if (this.visuals.particles && !this.reducedMotion) {
        var sparkCount = ev.isPC ? 16 : 8;
        for (var s = 0; s < sparkCount; s++) {
          this.spawnParticle(
            Math.random() * D.MATRIX_WIDTH * this.cellSize,
            (visRow + 0.5) * this.cellSize,
            (Math.random() - 0.5) * 210,
            -(30 + Math.random() * 130),
            ev.isPC ? '#7ee0e6' : '#d6f4fa',
            2 + Math.random() * 3,
            260 + Math.random() * 180
          );
        }
      }
    }
  };

  LochtrisRenderer.prototype.onFail = function (ev) {
    var bScale = this.bounceScale();
    if (bScale > 0) {
      this.spring.vy += 76 * bScale;
      this.spring.vrot += (Math.random() > 0.5 ? 1 : -1) * 3.6 * bScale;
    }

    if (!this.visuals.explodeOnFail || this.reducedMotion || !ev.matrixSnapshot) return;
    this.shatterShards.length = 0;
    var mat = ev.matrixSnapshot;
    var cs = this.cellSize;
    var half = cs * 0.5;
    var rowOffset = D.DEADLINE_HEIGHT - D.PEEK_ROWS;
    for (var r = rowOffset; r < D.MATRIX_HEIGHT; r++) {
      for (var c = 0; c < D.MATRIX_WIDTH; c++) {
        var bid = mat[r][c];
        if (!bid) continue;
        var color = D.BLOCK_COLORS[bid] || '#888';
        var bx = c * cs;
        var by = (r - rowOffset) * cs;
        for (var q = 0; q < 4; q++) {
          var ox = (q & 1) * half;
          var oy = ((q >> 1) & 1) * half;
          this.shatterShards.push({
            x: bx + ox,
            y: by + oy,
            w: half,
            vx: (Math.random() - 0.5) * 280 + (c - 4.5) * 22,
            vy: -(70 + Math.random() * 210),
            rot: 0,
            vrot: (Math.random() - 0.5) * 14,
            color: color,
            age: 0,
            life: 620 + Math.random() * 240
          });
        }
      }
    }
  };

  LochtrisRenderer.prototype.spawnParticle = function (x, y, vx, vy, color, size, life) {
    if (this.particles.length >= 96) this.particles.shift();
    this.particles.push({ x: x, y: y, vx: vx, vy: vy, color: color, size: size, age: 0, life: life });
  };

  LochtrisRenderer.prototype.hasPendingVFX = function () {
    var sp = this.spring;
    return this.beams.length > 0 ||
      this.lockFlashes.length > 0 ||
      this.lineFlashes.length > 0 ||
      this.particles.length > 0 ||
      this.shatterShards.length > 0 ||
      this.pcFlash > 0 ||
      sp.x !== 0 || sp.vx !== 0 || sp.targetX !== 0 ||
      sp.y !== 0 || sp.vy !== 0 ||
      sp.rot !== 0 || sp.vrot !== 0;
  };

  // Returns { canvasDirty, stageActive } — expiring final effect marks canvasDirty so cleanup frame renders!
  LochtrisRenderer.prototype.updateEffects = function (dtMs) {
    var dt = Math.min(dtMs, 40) / 1000;
    var canvasDirty = false;
    var stageActive = false;
    var i;

    var sp = this.spring;
    if (sp.x !== 0 || sp.vx !== 0 || sp.targetX !== 0 || sp.y !== 0 || sp.vy !== 0 || sp.rot !== 0 || sp.vrot !== 0) {
      sp.vx += ((sp.targetX - sp.x) * 320 - sp.vx * 24) * dt;
      sp.x += sp.vx * dt;
      sp.vy += ((0 - sp.y) * 320 - sp.vy * 24) * dt;
      sp.y += sp.vy * dt;
      sp.vrot += ((0 - sp.rot) * 260 - sp.vrot * 22) * dt;
      sp.rot += sp.vrot * dt;

      if (Math.abs(sp.x) < 0.02 && Math.abs(sp.vx) < 0.05 && sp.targetX === 0) { sp.x = 0; sp.vx = 0; }
      if (Math.abs(sp.y) < 0.02 && Math.abs(sp.vy) < 0.05) { sp.y = 0; sp.vy = 0; }
      if (Math.abs(sp.rot) < 0.005 && Math.abs(sp.vrot) < 0.01) { sp.rot = 0; sp.vrot = 0; }

      if (this.bounceEl) {
        if (sp.x !== 0 || sp.y !== 0 || sp.rot !== 0) {
          this.bounceEl.style.transform =
            'translate3d(' + sp.x.toFixed(2) + 'px,' + sp.y.toFixed(2) + 'px,0) rotate(' + sp.rot.toFixed(3) + 'deg)';
          stageActive = true;
        } else if (this.bounceEl.style.transform) {
          this.bounceEl.style.transform = '';
        }
      }
    }

    for (i = this.beams.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.beams[i].age += dtMs;
      if (this.beams[i].age >= this.beams[i].life) this.beams.splice(i, 1);
    }

    for (i = this.lockFlashes.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.lockFlashes[i].age += dtMs;
      if (this.lockFlashes[i].age >= this.lockFlashes[i].life) this.lockFlashes.splice(i, 1);
    }

    for (i = this.lineFlashes.length - 1; i >= 0; i--) {
      canvasDirty = true;
      this.lineFlashes[i].age += dtMs;
      if (this.lineFlashes[i].age >= this.lineFlashes[i].life) this.lineFlashes.splice(i, 1);
    }

    for (i = this.particles.length - 1; i >= 0; i--) {
      canvasDirty = true;
      var p = this.particles[i];
      p.age += dtMs;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
      } else {
        p.vy += 460 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    for (i = this.shatterShards.length - 1; i >= 0; i--) {
      canvasDirty = true;
      var sh = this.shatterShards[i];
      sh.age += dtMs;
      if (sh.age >= sh.life) {
        this.shatterShards.splice(i, 1);
      } else {
        sh.vy += 680 * dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        sh.rot += sh.vrot * dt;
      }
    }

    if (this.pcFlash > 0) {
      canvasDirty = true;
      this.pcFlash = Math.max(0, this.pcFlash - dt * 2.4);
    }

    return { canvasDirty: canvasDirty, stageActive: stageActive };
  };

  LochtrisRenderer.prototype.render = function (engine, nowMs) {
    this.renderBoard(engine, nowMs);
    this.renderHold(engine);
    this.renderNext(engine);
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

    // Blit cached playfield well & gridlines in one call
    if (this.gridCanvas) {
      ctx.drawImage(this.gridCanvas, 0, 0, w, h);
    }

    // Hard-drop beams
    for (var bi = 0; bi < this.beams.length; bi++) {
      var bm = this.beams[bi];
      var bt = bm.age / bm.life;
      var bx = bm.col * cs;
      var by0 = Math.max(0, bm.fromRow * cs);
      var by1 = bm.toRow * cs;
      if (by1 > by0) {
        var grad = ctx.createLinearGradient(0, by0, 0, by1);
        grad.addColorStop(0, rgbaHex(bm.color, 0));
        grad.addColorStop(1, rgbaHex(bm.color, (1 - bt) * 0.34));
        ctx.fillStyle = grad;
        ctx.fillRect(bx + 1, by0, cs - 2, by1 - by0);
      }
    }

    // Placed blocks
    var hideMatrix = (engine.state === 'failed' && this.visuals.explodeOnFail && this.shatterShards.length > 0);
    if (!hideMatrix) {
      for (var r = rowOffset; r < D.MATRIX_HEIGHT; r++) {
        var visY = (r - rowOffset) * cs;
        var row = engine.matrix[r];
        for (var c = 0; c < D.MATRIX_WIDTH; c++) {
          var bid = row[c];
          if (bid !== 0) {
            var spr = this.sprites[bid];
            if (spr) ctx.drawImage(spr, c * cs, visY, cs, cs);
          }
        }
      }
    }

    // Guide target overlay
    if (engine.guideMode && engine.curGuide) {
      this.renderGuide(ctx, engine, cs, rowOffset, nowMs);
    }

    // Sprite-based Ghost piece (preserves active block skin & hue clarity)
    if (engine.curMino && this.visuals.ghostOpacity > 0) {
      var ghostY = engine.getGhostY();
      if (ghostY !== engine.curY) {
        var gOffsets = engine.curMino.cells[engine.curDir];
        var gAlpha = this.visuals.ghostOpacity / 100;
        var gSpr = this.sprites[engine.curMino.placedBlockId];
        ctx.save();
        ctx.globalAlpha = gAlpha;
        for (var gi = 0; gi < 4; gi++) {
          var gcx = (engine.curX + gOffsets[gi][0]) * cs;
          var gcy = (ghostY + gOffsets[gi][1] - rowOffset) * cs;
          if (gcy + cs > 0 && gSpr) {
            ctx.drawImage(gSpr, gcx, gcy, cs, cs);
          }
        }
        ctx.globalAlpha = Math.min(0.85, gAlpha + 0.22);
        ctx.strokeStyle = engine.curMino.palette;
        ctx.lineWidth = 1.25;
        for (var gj = 0; gj < 4; gj++) {
          var ox = (engine.curX + gOffsets[gj][0]) * cs;
          var oy = (ghostY + gOffsets[gj][1] - rowOffset) * cs;
          if (oy + cs > 0) {
            ctx.strokeRect(ox + 1, oy + 1, cs - 2, cs - 2);
          }
        }
        ctx.restore();
      }
    }

    // Active falling piece (subtle lock darken capped at 0.20 so hue stays vivid)
    if (engine.curMino) {
      var aOffsets = engine.curMino.cells[engine.curDir];
      var aSpr = this.sprites[engine.curMino.placedBlockId];
      var lockProg = engine.getLockProgress();
      for (var ai = 0; ai < 4; ai++) {
        var acx = (engine.curX + aOffsets[ai][0]) * cs;
        var acy = (engine.curY + aOffsets[ai][1] - rowOffset) * cs;
        if (acy + cs > 0 && aSpr) {
          ctx.drawImage(aSpr, acx, acy, cs, cs);
          if (lockProg > 0.02) {
            ctx.fillStyle = 'rgba(0,0,0,' + (lockProg * 0.20).toFixed(3) + ')';
            ctx.fillRect(acx, acy, cs, cs);
          }
        }
      }
    }

    // Lock flashes
    for (var li = 0; li < this.lockFlashes.length; li++) {
      var lf = this.lockFlashes[li];
      var lt = 1 - lf.age / lf.life;
      ctx.fillStyle = 'rgba(255,255,255,' + (lt * 0.42).toFixed(3) + ')';
      ctx.fillRect(lf.col * cs, lf.row * cs, cs, cs);
    }

    // Line clear flashes
    for (var fi = 0; fi < this.lineFlashes.length; fi++) {
      var fl = this.lineFlashes[fi];
      var ft = 1 - fl.age / fl.life;
      ctx.fillStyle = fl.isPC
        ? 'rgba(130, 238, 248, ' + (ft * 0.65).toFixed(3) + ')'
        : 'rgba(255, 255, 255, ' + (ft * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, fl.row * cs, w, cs);
    }

    if (this.pcFlash > 0) {
      ctx.fillStyle = 'rgba(116, 232, 244, ' + (this.pcFlash * 0.26).toFixed(3) + ')';
      ctx.fillRect(0, peekPx, w, h - peekPx);
    }

    // Fail shatter shards
    for (var si = 0; si < this.shatterShards.length; si++) {
      var sh = this.shatterShards[si];
      var st = 1 - sh.age / sh.life;
      ctx.save();
      ctx.globalAlpha = st;
      ctx.translate(sh.x + sh.w * 0.5, sh.y + sh.w * 0.5);
      ctx.rotate(sh.rot);
      ctx.fillStyle = sh.color;
      ctx.fillRect(-sh.w * 0.5, -sh.w * 0.5, sh.w, sh.w);
      ctx.restore();
    }

    // Impact & clear sparks
    for (var pi = 0; pi < this.particles.length; pi++) {
      var pt = this.particles[pi];
      var alpha = 1 - pt.age / pt.life;
      ctx.fillStyle = rgbaHex(pt.color, alpha);
      ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
    }
  };

  LochtrisRenderer.prototype.renderGuide = function (ctx, engine, cs, rowOffset, nowMs) {
    var g = engine.curGuide;
    var offsets = g.mino.cells[g.dir];
    var aligned = engine.isGuideAligned();
    var pulse = this.reducedMotion ? 0.72 : (0.58 + 0.24 * Math.sin((nowMs || 0) * 0.0055));
    var baseColor = aligned ? '#69f0ae' : g.mino.palette;
    var fillAlpha = aligned ? 0.30 : (0.14 + 0.10 * pulse);
    var strokeAlpha = aligned ? 0.96 : (0.72 + 0.20 * pulse);

    ctx.save();
    ctx.fillStyle = rgbaHex(baseColor, fillAlpha);
    ctx.strokeStyle = rgbaHex(baseColor, strokeAlpha);
    ctx.lineWidth = aligned ? 2.25 : 1.75;

    for (var i = 0; i < 4; i++) {
      var x = (g.x + offsets[i][0]) * cs;
      var y = (g.y + D.DEADLINE_HEIGHT + offsets[i][1] - rowOffset) * cs;
      ctx.fillRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
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

  LochtrisRenderer.prototype.renderNext = function (engine) {
    var sig = 0;
    for (var i = 0; i < D.NEXT_MINOS; i++) {
      sig = sig * 16 + (engine.queue[i] ? engine.queue[i].id : 0);
    }
    if (sig === this.lastNextSig) return;
    this.lastNextSig = sig;

    var ctx = this.nextCtx;
    var w = this.nextCanvas.width / this.dpr;
    var h = this.nextCanvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);

    // Slot 0 is larger (next immediate piece), slots 1..4 stepped slightly down with crisp 1px separators
    var firstH = Math.round(this.previewCell * 2.95);
    var restH = (h - firstH) / (D.NEXT_MINOS - 1);

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
        this.drawMiniPiece(ctx, mino, 0, y0, w, sh, false, scale);
      }
    }
  };

  // Renders a live 7-piece swatch (I T J L Z S O) inside Preferences
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

  root.LochtrisRenderer = LochtrisRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
