/*========================================================================================
  data.js — Tetromino definitions, SRS+ kick tables, section metadata, and constants.
  Pure data module (no DOM dependencies) so it can be imported directly in Node tests.
========================================================================================*/
(function (root) {
  'use strict';

  var MATRIX_WIDTH = 10;
  var BUFFER_HEIGHT = 4;        // Hidden rows above the 20 visible rows (2 peek visibly)
  var VISIBLE_HEIGHT = 20;
  var MATRIX_HEIGHT = VISIBLE_HEIGHT + BUFFER_HEIGHT; // 24 total rows
  var DEADLINE_HEIGHT = BUFFER_HEIGHT;                // Index where visible row 0 begins
  var PEEK_ROWS = 2;            // Visible buffer rows above skyline

  var NEXT_MINOS = 5;
  var SECTION_NUM = 24;

  // Timing constants (milliseconds, based on 60 FPS frame = 16.6667ms)
  var FRAME_MS = 1000 / 60;
  var BASE_GRAVITY_INTERVAL_MS = 50 * FRAME_MS;
  var LOCK_DELAY_MS = 30 * FRAME_MS;            // 500ms (modern guideline)
  var LOCK_RESET_LIMIT = 15;                    // 15 ground move/rotate resets
  var SPRINT_COUNTDOWN_MS = 1800;               // 3-2-1-GO (600ms per beat)

  var INITIAL_DIR = 0;
  var INITIAL_X = 3;
  var INITIAL_Y = DEADLINE_HEIGHT - 2;          // Spawns just above skyline

  // Keys that must never be bound to gameplay actions
  var RESERVED_KEY_CODES = {
    Escape: true,
    Tab: true,
    F5: true,
    F11: true,
    F12: true,
    PrintScreen: true
  };

  // Default controls using KeyboardEvent.code (physical key, layout-independent)
  var DEFAULT_KEYS = {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    softDrop: 'ArrowDown',
    hardDrop: 'Space',
    rotCW: 'ArrowUp',
    rotCCW: 'ControlLeft',
    rot180: 'ShiftLeft',
    hold: 'KeyC',
    guide: 'KeyR',
    retry: 'F4'
  };

  var DEFAULT_HANDLING = {
    das: 8.0,                     // Frames (0.1F precision)
    arr: 1.5,                     // Frames (0.0F = instant wall snap)
    dcd: 1.0,                     // Frames (DAS cut delay on lock/spawn/rotate)
    sdf: 20,                      // Multiplier (41 = Infinity / instant sonic drop)
    irs: 'hold',                  // 'off' | 'tap' | 'hold'
    ihs: 'hold',                  // 'off' | 'tap' | 'hold'
    spinRule: 'all-mini+',        // 't-spins' | 'all-mini+' | 'all'
    sprintCountdown: true,        // 3-2-1-GO countdown in 40L Sprint (DAS/IRS/IHS allowed)
    cancelDasOnDirChange: true,
    preserveDasOnSpawn: true
  };

  var DEFAULT_VISUALS = {
    skin: 'modern',               // 'modern' | 'flat' | 'neon'
    bounce: 60,                   // 0..100 board bounce intensity
    particles: true,              // Hard-drop beam & impact sparks
    explodeOnFail: false,         // Canvas shatter explosion on fail
    ghostOpacity: 35,             // 0..100
    gridOpacity: 40,              // 0..100
    textOverlay: true,            // Clear / Fail overlay on playfield
    showFps: false,               // Subtle FPS counter
    sfxVolume: 50                 // 0..100
  };

  var HANDLING_PRESETS = {
    tetrio: { label: 'TETR.IO Default', das: 10.0, arr: 2.0, dcd: 1.0, sdf: 6 },
    snappy: { label: 'Snappy',          das: 6.5,  arr: 0.0, dcd: 1.0, sdf: 41 },
    speed:  { label: 'Speed',           das: 4.5,  arr: 0.0, dcd: 0.0, sdf: 41 }
  };

  var KEY_PRESETS = {
    lochtris: {
      label: 'Lochtris Classic',
      keys: {
        left: 'ArrowLeft', right: 'ArrowRight', softDrop: 'ArrowDown', hardDrop: 'Space',
        rotCW: 'ArrowUp', rotCCW: 'ControlLeft', rot180: 'ShiftLeft', hold: 'KeyC', guide: 'KeyR', retry: 'F4'
      }
    },
    guideline: {
      label: 'Guideline',
      keys: {
        left: 'ArrowLeft', right: 'ArrowRight', softDrop: 'ArrowDown', hardDrop: 'Space',
        rotCW: 'ArrowUp', rotCCW: 'KeyZ', rot180: 'KeyA', hold: 'KeyC', guide: 'KeyR', retry: 'F4'
      }
    }
  };

  /*--------------------------------------------------------------------------------------
    SRS+ Kick Tables (screen coordinates: +x right, +y down)
    - JLSTZ 90°: standard Guideline SRS
    - JLSTZ 180°: SRS+ 180° kick table
    - I 90°: symmetric SRS+ I-piece kick table
      (mirror-symmetric across vertical axis; reverse rotations prioritize the closer kick)
    - I 180°: minimal in-place / 1-cell alignment kicks for wall/floor 180° flips
  --------------------------------------------------------------------------------------*/
  var KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [ 1, 0], [ 1,  1], [0,-2], [ 1,-2]],
    '1>2': [[0, 0], [ 1, 0], [ 1,  1], [0,-2], [ 1,-2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [ 1, 0], [ 1, -1], [0, 2], [ 1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1,  1], [0,-2], [-1,-2]],
    '3>0': [[0, 0], [-1, 0], [-1,  1], [0,-2], [-1,-2]],
    '0>3': [[0, 0], [ 1, 0], [ 1, -1], [0, 2], [ 1, 2]],
    // SRS+ 180° kicks (+y down)
    '0>2': [[0, 0], [0, -1], [ 1, -1], [-1, -1], [ 1, 0], [-1, 0]],
    '2>0': [[0, 0], [0,  1], [-1,  1], [ 1,  1], [-1, 0], [ 1, 0]],
    '1>3': [[0, 0], [ 1, 0], [ 1, -2], [ 1, -1], [0, -2], [0, -1]],
    '3>1': [[0, 0], [-1, 0], [-1, -2], [-1, -1], [0, -2], [0, -1]]
  };

  var KICKS_I = {
    // Symmetric SRS+ I-piece 90° kicks (+y down)
    '0>1': [[0, 0], [ 1, 0], [-2, 0], [-2,  1], [ 1, -2]],
    '1>0': [[0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
    '1>2': [[0, 0], [-1, 0], [ 2, 0], [-1, -2], [ 2,  1]],
    '2>1': [[0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
    '2>3': [[0, 0], [ 2, 0], [-1, 0], [ 2, -1], [-1,  2]],
    '3>2': [[0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
    '3>0': [[0, 0], [ 1, 0], [-2, 0], [ 1,  2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [ 2, 0], [ 2,  1], [-1, -2]],
    // I-piece 180° alignment kicks (+y down)
    '0>2': [[0, 0], [0, -1]],
    '2>0': [[0, 0], [0,  1]],
    '1>3': [[0, 0], [ 1, 0]],
    '3>1': [[0, 0], [-1, 0]]
  };

  var KICKS_O = {
    '0>1': [[0, 0]], '1>0': [[0, 0]], '1>2': [[0, 0]], '2>1': [[0, 0]],
    '2>3': [[0, 0]], '3>2': [[0, 0]], '3>0': [[0, 0]], '0>3': [[0, 0]],
    '0>2': [[0, 0]], '2>0': [[0, 0]], '1>3': [[0, 0]], '3>1': [[0, 0]]
  };

  /*--------------------------------------------------------------------------------------
    Tetrominoes — precomputes flat [col, row] offset tuples per orientation for zero GC
  --------------------------------------------------------------------------------------*/
  function makeMino(id, key, placedBlockId, palette, kicks, shape) {
    var cells = [];
    var bounds = [];
    for (var d = 0; d < 4; d++) {
      var list = [];
      var minC = 4, maxC = -1, minR = 4, maxR = -1;
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          if (shape[d][r][c]) {
            list.push([c, r]);
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
          }
        }
      }
      cells.push(list);
      bounds.push({ minC: minC, maxC: maxC, minR: minR, maxR: maxR });
    }
    return {
      id: id,
      key: key,
      activeBlockId: placedBlockId,
      placedBlockId: placedBlockId,
      ghostBlockId: 31,
      guideBlockId: 40 + id,
      ghostGuideBlockId: 50 + id,
      palette: palette,
      kicks: kicks,
      shape: shape,
      cells: cells,
      bounds: bounds
    };
  }

  var I = makeMino(1, 'I', 11, '#32B484', KICKS_I, [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
  ]);

  var T = makeMino(2, 'T', 12, '#A53E9B', KICKS_JLSTZ, [
    [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]
  ]);

  var J = makeMino(3, 'J', 13, '#5B51C4', KICKS_JLSTZ, [
    [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]
  ]);

  var L = makeMino(4, 'L', 14, '#C8743B', KICKS_JLSTZ, [
    [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
    [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]
  ]);

  var Z = makeMino(5, 'Z', 15, '#C73F47', KICKS_JLSTZ, [
    [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]
  ]);

  var S = makeMino(6, 'S', 16, '#8CC03F', KICKS_JLSTZ, [
    [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]
  ]);

  var O = makeMino(7, 'O', 17, '#C9B043', KICKS_O, [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]]
  ]);

  var gMino = [null, I, T, J, L, Z, S, O];

  var BLOCK_COLORS = {
    1:  '#6C7582',
    11: I.palette,
    12: T.palette,
    13: J.palette,
    14: L.palette,
    15: Z.palette,
    16: S.palette,
    17: O.palette
  };

  var T_CORNERS = [
    { front: [[0,0],[2,0]], back: [[0,2],[2,2]] },
    { front: [[2,0],[2,2]], back: [[0,0],[0,2]] },
    { front: [[0,2],[2,2]], back: [[0,0],[2,0]] },
    { front: [[0,0],[0,2]], back: [[2,0],[2,2]] }
  ];

  function Guide(mino, dir, x, y, opts) {
    this.mino = mino;
    this.dir = dir;
    this.x = x;
    this.y = y;
    this.requiresSpin = Boolean(opts && opts.requiresSpin);
    this.requires180 = Boolean(opts && opts.requires180);
  }

  function G(mino, dir, x, y, opts) {
    return new Guide(mino, dir, x, y, opts);
  }

  /*--------------------------------------------------------------------------------------
    Curriculum & Technique Sections
  --------------------------------------------------------------------------------------*/
  var SECTION_GROUPS = [
    {
      id: 'group1',
      title: 'Introduction',
      rate: null,
      sections: [
        { id: 0, num: 1, title: 'Creating the Template', meta: '1 pattern · Guide', guided: true }
      ]
    },
    {
      id: 'group2',
      title: 'Vertical I-Mino Placement',
      rate: 'PCO 61%',
      rateTip: 'Share of solvable PCO queues covered by Vertical I patterns',
      sections: [
        { id: 1, num: 2, title: 'Vertical I-Mino, 14 patterns', meta: '14 patterns · Guide', guided: true },
        { id: 2, num: 3, title: 'Vertical I-Mino, 20q', meta: '20 random · Drill', guided: false }
      ]
    },
    {
      id: 'group3',
      title: 'Horizontal I-Mino Placement',
      rate: 'PCO 84%',
      rateTip: 'Cumulative solvable PCO queue coverage with Horizontal I patterns',
      sections: [
        { id: 3,  num: 4,  title: 'I-Mino 1st Layer, 6 patterns', meta: '6 patterns · Guide', guided: true },
        { id: 4,  num: 5,  title: 'I-Mino 1st Layer, 20q', meta: '20 random · Drill', guided: false },
        { id: 5,  num: 6,  title: 'I-Mino 3rd Layer, Flat Placement, 4 patterns', meta: '4 patterns · Guide', guided: true },
        { id: 6,  num: 7,  title: 'I-Mino 3rd Layer, Flat Placement, 20q', meta: '20 random · Drill', guided: false },
        { id: 7,  num: 8,  title: 'IILO, 2 patterns', meta: '2 patterns · Guide', guided: true },
        { id: 8,  num: 9,  title: 'IILO, 10q', meta: '10 random · Drill', guided: false },
        { id: 9,  num: 10, title: '3rd Layer I-Mino, 3 patterns', meta: '3 patterns · Guide', guided: true },
        { id: 10, num: 11, title: '3rd Layer I-Mino, 20q', meta: '20 random · Drill', guided: false }
      ]
    },
    {
      id: 'group4',
      title: 'Horizontal I-Mino Summary',
      rate: null,
      note: 'Covers 710 of 711 solvable PCO queues. Learn LSIO below for the final case.',
      sections: [
        { id: 11, num: 12, title: 'Midterm Test', meta: '20 random · Exam', guided: false }
      ]
    },
    {
      id: 'group5',
      title: 'LSIO Type',
      rate: 'PCO 84.6%',
      rateTip: 'Full PCO coverage including the final LSIO queue case',
      sections: [
        { id: 12, num: 13, title: 'LSIO Type, 1 pattern', meta: '1 pattern · Guide', guided: true },
        { id: 13, num: 14, title: 'LSIO Type, 12q', meta: '12 shuffled · Drill', guided: false }
      ]
    },
    {
      id: 'group6',
      title: 'Summary',
      rate: null,
      sections: [
        { id: 14, num: 15, title: 'Final Exam', meta: '30 random · Exam', guided: false },
        { id: 15, num: 16, title: 'Graduation Test (+ Mirror)', meta: '100 random · Exam', guided: false }
      ]
    },
    {
      id: 'group7',
      title: 'Bonus',
      rate: null,
      sections: [
        { id: 16, num: 17, title: 'Skimming Patterns', meta: '27 patterns · Guide', guided: true },
        { id: 17, num: 18, title: 'Vertical I-Mino, All 514q', meta: '514 shuffled · Endurance', guided: false },
        { id: 18, num: 19, title: 'Horizontal I-Mino, All 196q', meta: '196 shuffled · Endurance', guided: false },
        { id: 19, num: 20, title: 'All 711q', meta: '711 shuffled · Endurance', guided: false },
        { id: 20, num: 21, title: 'All 711q Mirror', meta: '711 mirrored · Endurance', guided: false }
      ]
    },
    {
      id: 'group8',
      title: 'Techniques & Openers',
      rate: null,
      sections: [
        { id: 21, num: 22, title: 'T-Spin Mastery', meta: '7 patterns · Guide', guided: true, category: 'tech' },
        { id: 22, num: 23, title: 'All-Spin & 180° Kicks', meta: '5 patterns · Guide', guided: true, category: 'tech' },
        { id: 23, num: 24, title: 'Modern Openers & Combos', meta: '5 patterns · Guide', guided: true, category: 'tech' }
      ]
    }
  ];

  var SECTIONS = [];
  for (var gi = 0; gi < SECTION_GROUPS.length; gi++) {
    for (var si = 0; si < SECTION_GROUPS[gi].sections.length; si++) {
      SECTIONS.push(SECTION_GROUPS[gi].sections[si]);
    }
  }

  function SectionTitle(id) {
    var sec = SECTIONS[id];
    if (!sec) return '?';
    return '[' + sec.num + '] ' + sec.title;
  }

  function getTechProblemIds(groupKey) {
    if (!root.LochtrisAllProblemsMeta) return [];
    return (root.LochtrisAllProblemsMeta[groupKey] || []).slice();
  }

  function getSectionPool(sectionIndex) {
    if (typeof getProblemIdList !== 'function') return [];
    switch (sectionIndex) {
      case 0:  return getProblemIdList(WARMING_UP);
      case 1:  return getProblemIdList(GUIDANCE_VERTICAL);
      case 2:  return getProblemIdList(PROB840_VERTICAL);
      case 3:  return getProblemIdList(GUIDANCE_HORIZONTAL_1);
      case 4:  return getProblemIdList(PROB840_HORIZONTAL_1);
      case 5:  return getProblemIdList(GUIDANCE_HORIZONTAL_LAYDOWN);
      case 6:  return getProblemIdList(PROB840_HORIZONTAL_LAYDOWN);
      case 7:  return getProblemIdList(GUIDANCE_HORIZONTAL_IILO);
      case 8:  return getProblemIdList(PROB840_HORIZONTAL_IILO);
      case 9:  return getProblemIdList(GUIDANCE_HORIZONTAL_3);
      case 10: return getProblemIdList(PROB840_HORIZONTAL_3);
      case 11:
      case 18:
        return getProblemIdList(PROB840_HORIZONTAL_1)
          .concat(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN))
          .concat(getProblemIdList(PROB840_HORIZONTAL_IILO))
          .concat(getProblemIdList(PROB840_HORIZONTAL_3));
      case 12: return getProblemIdList(GUIDANCE_LSIO);
      case 13: return getProblemIdList(PROB840_LSIO);
      case 14: return getProblemIdList(PROB840);
      case 15: return getProblemIdList(PROB840).concat(getProblemIdList(PROB840_MIRROR));
      case 16: return getProblemIdList(GUIDANCE_OTHER_WISE);
      case 17: return getProblemIdList(PROB840_VERTICAL);
      case 19: return getProblemIdList(PROB840);
      case 20: return getProblemIdList(PROB840_MIRROR);
      case 21: return getTechProblemIds('tSpins');
      case 22: return getTechProblemIds('allSpins');
      case 23: return getTechProblemIds('openers');
      default: return [];
    }
  }

  function buildSectionRun(sectionIndex) {
    if (typeof getProblemIdList !== 'function') return [];
    var pool;
    switch (sectionIndex) {
      case 0:  return getProblemIdList(WARMING_UP);
      case 1:  return getProblemIdList(GUIDANCE_VERTICAL);
      case 2:  return shuffle(getProblemIdList(PROB840_VERTICAL)).slice(0, 20);
      case 3:  return getProblemIdList(GUIDANCE_HORIZONTAL_1);
      case 4:  return shuffle(getProblemIdList(PROB840_HORIZONTAL_1)).slice(0, 20);
      case 5:  return getProblemIdList(GUIDANCE_HORIZONTAL_LAYDOWN);
      case 6:  return shuffle(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN)).slice(0, 20);
      case 7:  return getProblemIdList(GUIDANCE_HORIZONTAL_IILO);
      case 8:  return shuffle(getProblemIdList(PROB840_HORIZONTAL_IILO)).slice(0, 10);
      case 9:  return getProblemIdList(GUIDANCE_HORIZONTAL_3);
      case 10: return shuffle(getProblemIdList(PROB840_HORIZONTAL_3)).slice(0, 20);
      case 11:
        pool = getSectionPool(11);
        return shuffle(pool).slice(0, 20);
      case 12: return getProblemIdList(GUIDANCE_LSIO);
      case 13: return shuffle(getProblemIdList(PROB840_LSIO));
      case 14: return shuffle(getProblemIdList(PROB840)).slice(0, 30);
      case 15:
        return shuffle(
          shuffle(getProblemIdList(PROB840)).slice(0, 50)
            .concat(shuffle(getProblemIdList(PROB840_MIRROR)).slice(0, 50))
        );
      case 16: return getProblemIdList(GUIDANCE_OTHER_WISE);
      case 17: return shuffle(getProblemIdList(PROB840_VERTICAL));
      case 18: return shuffle(getSectionPool(18));
      case 19: return shuffle(getProblemIdList(PROB840));
      case 20: return shuffle(getProblemIdList(PROB840_MIRROR));
      case 21: return getTechProblemIds('tSpins');
      case 22: return getTechProblemIds('allSpins');
      case 23: return getTechProblemIds('openers');
      default: return [];
    }
  }

  root.I = I;
  root.T = T;
  root.J = J;
  root.L = L;
  root.Z = Z;
  root.S = S;
  root.O = O;
  root.gMino = gMino;
  root.Guide = Guide;
  root.G = G;
  root.SectionTitle = SectionTitle;

  root.LochtrisData = {
    MATRIX_WIDTH: MATRIX_WIDTH,
    BUFFER_HEIGHT: BUFFER_HEIGHT,
    VISIBLE_HEIGHT: VISIBLE_HEIGHT,
    MATRIX_HEIGHT: MATRIX_HEIGHT,
    DEADLINE_HEIGHT: DEADLINE_HEIGHT,
    PEEK_ROWS: PEEK_ROWS,
    NEXT_MINOS: NEXT_MINOS,
    SECTION_NUM: SECTION_NUM,
    FRAME_MS: FRAME_MS,
    BASE_GRAVITY_INTERVAL_MS: BASE_GRAVITY_INTERVAL_MS,
    LOCK_DELAY_MS: LOCK_DELAY_MS,
    LOCK_RESET_LIMIT: LOCK_RESET_LIMIT,
    SPRINT_COUNTDOWN_MS: SPRINT_COUNTDOWN_MS,
    INITIAL_DIR: INITIAL_DIR,
    INITIAL_X: INITIAL_X,
    INITIAL_Y: INITIAL_Y,
    RESERVED_KEY_CODES: RESERVED_KEY_CODES,
    DEFAULT_KEYS: DEFAULT_KEYS,
    DEFAULT_HANDLING: DEFAULT_HANDLING,
    DEFAULT_VISUALS: DEFAULT_VISUALS,
    HANDLING_PRESETS: HANDLING_PRESETS,
    KEY_PRESETS: KEY_PRESETS,
    KICKS_JLSTZ: KICKS_JLSTZ,
    KICKS_I: KICKS_I,
    KICKS_O: KICKS_O,
    T_CORNERS: T_CORNERS,
    BLOCK_COLORS: BLOCK_COLORS,
    MINOS: gMino,
    SECTION_GROUPS: SECTION_GROUPS,
    SECTIONS: SECTIONS,
    SectionTitle: SectionTitle,
    getSectionPool: getSectionPool,
    buildSectionRun: buildSectionRun
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.LochtrisData;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
