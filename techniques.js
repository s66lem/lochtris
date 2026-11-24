/*========================================================================================
  techniques.js — Guided Technique & Opener puzzles (T-Spins, All-Spins, 180°, Openers).
  Every puzzle is verified via SRS+ BFS reachability in tests/engine.test.js:
  - AS1..AS4 are proven solvable with 90° rotations only (zero holes).
  - AS5 is proven 180°-ONLY (impossible with 90° rotations alone).
  - Openers (TKI-3 Flat/Castle, MKO, C-Spin) leave zero covered holes.
========================================================================================*/
(function (root) {
  'use strict';

  function boardFromRows(bottomRows) {
    var charMap = { '.': 0, '#': 1, 'I': 11, 'T': 12, 'J': 13, 'L': 14, 'Z': 15, 'S': 16, 'O': 17 };
    var mat = [];
    var pad = 20 - bottomRows.length;
    for (var r = 0; r < 20; r++) {
      var row = [];
      if (r < pad) {
        for (var c = 0; c < 10; c++) row.push(0);
      } else {
        var str = bottomRows[r - pad];
        for (var c2 = 0; c2 < 10; c2++) {
          row.push(charMap[str[c2]] || 0);
        }
      }
      mat.push(row);
    }
    return mat;
  }

  function makeTechProblem(cfg) {
    return {
      id: cfg.id,
      storageId: cfg.storageId,
      cleared: false,
      initialBlocks: boardFromRows(cfg.rows),
      ingredients: [[]].concat(cfg.pieces),
      caption: cfg.caption,
      hint: cfg.hint,
      guides: cfg.guides,
      useGuide: cfg.useGuide !== false,
      req: cfg.req,
      personalBest: Infinity
    };
  }

  // req indices:
  // 0:Single, 1:Double, 2:Triple, 3:Quad, 4:TSM0, 5:TS0, 6:TSMS, 7:TSS, 8:TSD, 9:TST, 10:PC, 11:B2B, 12:Combo, 13:AllSpin

  function getTechniqueProblems() {
    var I = root.I, T = root.T, J = root.J, L = root.L, Z = root.Z, S = root.S, O = root.O, G = root.G;

    var tSpins = [
      makeTechProblem({
        id: 1, storageId: 'TS1',
        caption: 'T-Spin Double',
        hint: 'Soft drop T into the notch and rotate under the overhang.',
        rows: [
          '#####.....',
          '####...###',
          '#####.####'
        ],
        pieces: [T],
        guides: [G(T, 2, 4, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,1,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 2, storageId: 'TS2',
        caption: 'T-Spin Single',
        hint: 'Drop T into the slot and spin under the overhang for a T-Spin Single.',
        rows: [
          '#####.....',
          '####...###',
          '#####.#..#'
        ],
        pieces: [T],
        guides: [G(T, 2, 4, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,1,0,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 3, storageId: 'TS3',
        caption: 'T-Spin Triple',
        hint: 'Rest T flat under the left overhang (col 4) and rotate CW to kick 2 rows down into the TST.',
        rows: [
          '#####.....',
          '###.......',
          '####.#####',
          '####..####',
          '####.#####'
        ],
        pieces: [T],
        guides: [G(T, 1, 3, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,0,1,0,0,0,0]
      }),
      makeTechProblem({
        id: 4, storageId: 'TS4',
        caption: 'T-Spin Fin (TSD)',
        hint: 'Rest flat T on the lip and rotate CW to kick 2 rows down via SRS Kick 5.',
        rows: [
          '#####.....',
          '###.......',
          '###..#####',
          '####..####',
          '####.#####'
        ],
        pieces: [T],
        guides: [G(T, 1, 3, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,1,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 5, storageId: 'TS5',
        caption: 'Imperial Cross (B2B TSD)',
        hint: 'Spin two T-pieces in sequence for a Back-to-Back T-Spin Double.',
        rows: [
          '#####.....',
          '####...###',
          '#####.####',
          '####...###',
          '#####.####'
        ],
        pieces: [T, T],
        guides: [G(T, 2, 4, 15, { requiresSpin: true }), G(T, 2, 4, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,2,0,0,1,0,0]
      }),
      makeTechProblem({
        id: 6, storageId: 'TS6',
        caption: 'STSD (Super TSD)',
        hint: 'Kick the first T down via SRS Kick 5, then spin the second T below for Back-to-Back TSD.',
        rows: [
          '#####.....',
          '###.......',
          '###..#....',
          '####..####',
          '####.#####',
          '#####...##',
          '######.###'
        ],
        pieces: [T, T],
        guides: [G(T, 1, 3, 15, { requiresSpin: true }), G(T, 2, 5, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,2,0,0,1,0,0]
      }),
      makeTechProblem({
        id: 7, storageId: 'TS7',
        caption: 'DT Cannon Finish',
        hint: 'Clear the upper TSD first, then kick the second T down for a Back-to-Back TST.',
        rows: [
          '#####.....',
          '####...###',
          '#####.####',
          '###.......',
          '####.#####',
          '####..####',
          '####.#####'
        ],
        pieces: [T, T],
        guides: [G(T, 2, 4, 13, { requiresSpin: true }), G(T, 1, 3, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,1,1,0,1,0,0]
      })
    ];

    var allSpins = [
      makeTechProblem({
        id: 1, storageId: 'AS1',
        caption: 'S-Spin Double',
        hint: 'Stand S vertically (CW) above the right notch, then rotate CW to tuck under the lip.',
        rows: [
          '.......###',
          '######..##',
          '#####..###'
        ],
        pieces: [S],
        guides: [G(S, 2, 5, 17, { requiresSpin: true })],
        req: [0,1,0,0,0,0,0,0,0,0,0,0,0,1]
      }),
      makeTechProblem({
        id: 2, storageId: 'AS2',
        caption: 'Z-Spin Double',
        hint: 'Stand Z vertically (CCW) above the left notch, then rotate CCW to tuck under the lip.',
        rows: [
          '###.......',
          '##..######',
          '###..#####'
        ],
        pieces: [Z],
        guides: [G(Z, 2, 2, 17, { requiresSpin: true })],
        req: [0,1,0,0,0,0,0,0,0,0,0,0,0,1]
      }),
      makeTechProblem({
        id: 3, storageId: 'AS3',
        caption: 'L-Spin Double',
        hint: 'Stand L vertically (CCW) beside the overhang, then rotate CCW to kick into the pocket.',
        rows: [
          '.....#..##',
          '####...###',
          '####.#####'
        ],
        pieces: [L],
        guides: [G(L, 2, 4, 17, { requiresSpin: true })],
        req: [0,1,0,0,0,0,0,0,0,0,0,0,0,1]
      }),
      makeTechProblem({
        id: 4, storageId: 'AS4',
        caption: 'J-Spin Double',
        hint: 'Stand J vertically (CW) beside the overhang, then rotate CW to kick into the pocket.',
        rows: [
          '##..#.....',
          '###...####',
          '#####.####'
        ],
        pieces: [J],
        guides: [G(J, 2, 3, 17, { requiresSpin: true })],
        req: [0,1,0,0,0,0,0,0,0,0,0,0,0,1]
      }),
      makeTechProblem({
        id: 5, storageId: 'AS5',
        caption: '180° J-Spin Double',
        hint: 'Drop J vertically (CW) into the slot, then press Rotate 180° to tuck under the lip (impossible with 90°).',
        rows: [
          '##......##',
          '##......##',
          '#####.####',
          '####..####'
        ],
        pieces: [J],
        guides: [G(J, 3, 4, 17, { requiresSpin: true, requires180: true })],
        req: [0,1,0,0,0,0,0,0,0,0,0,0,0,1]
      })
    ];

    var openers = [
      makeTechProblem({
        id: 1, storageId: 'OP1',
        caption: 'TKI-3 (Flat Top)',
        hint: 'Build a clean zero-hole 1st-bag TKI-3 Flat Top, then spin T for an opening TSD.',
        rows: [],
        pieces: [I, L, O, J, S, Z, T],
        guides: [
          G(I, 0, 0, 18),
          G(L, 0, 5, 18),
          G(O, 0, 7, 18),
          G(J, 0, 0, 17),
          G(S, 3, 5, 16),
          G(Z, 0, 0, 16),
          G(T, 2, 3, 17, { requiresSpin: true })
        ],
        req: [0,0,0,0,0,0,0,0,1,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 2, storageId: 'OP2',
        caption: 'TKI-3 (Castle Top)',
        hint: 'Build a zero-hole 1st-bag Castle Top, then spin T under the Z overhang.',
        rows: [],
        pieces: [O, J, I, L, Z, S, T],
        guides: [
          G(O, 0, -1, 18),
          G(J, 0, 2, 18),
          G(I, 0, 6, 18),
          G(L, 0, 7, 17),
          G(Z, 1, 2, 16),
          G(S, 0, 7, 16),
          G(T, 2, 4, 17, { requiresSpin: true })
        ],
        req: [0,0,0,0,0,0,0,0,1,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 3, storageId: 'OP3',
        caption: 'MKO Stacking',
        hint: 'Build a zero-hole 1st-bag MKO stack and finish with an opening TSD.',
        rows: [],
        pieces: [O, I, L, J, S, Z, T],
        guides: [
          G(O, 0, -1, 18),
          G(I, 0, 2, 18),
          G(L, 0, 7, 18),
          G(J, 0, 2, 17),
          G(S, 3, 7, 16),
          G(Z, 0, 2, 16),
          G(T, 2, 5, 17, { requiresSpin: true })
        ],
        req: [0,0,0,0,0,0,0,0,1,0,0,0,0,0]
      }),
      makeTechProblem({
        id: 4, storageId: 'OP4',
        caption: 'C-Spin Finish (TST → TSD)',
        hint: 'Kick the first T into the upper TST, then finish the Back-to-Back TSD below.',
        rows: [
          '#####.....',
          '###.......',
          '####.#####',
          '####..####',
          '####.#####',
          '#####.....',
          '####...###',
          '#####.####'
        ],
        pieces: [T, T],
        guides: [G(T, 1, 3, 14, { requiresSpin: true }), G(T, 2, 4, 17, { requiresSpin: true })],
        req: [0,0,0,0,0,0,0,0,1,1,0,1,0,0]
      }),
      makeTechProblem({
        id: 5, storageId: 'OP5',
        caption: '3 Combo Downstack',
        hint: 'Chain 4 consecutive line clears (3 COMBO).',
        rows: [
          '######....',
          '#######...',
          '######...#',
          '######..##'
        ],
        pieces: [I, L, T, I],
        guides: [
          G(I, 0, 6, 15),
          G(L, 0, 7, 16),
          G(T, 2, 6, 17),
          G(I, 1, 4, 16)
        ],
        req: [0,0,0,0,0,0,0,0,0,0,0,0,3,0]
      })
    ];

    return {
      tSpins: tSpins,
      allSpins: allSpins,
      openers: openers
    };
  }

  root.LochtrisTechniques = {
    getTechniqueProblems: getTechniqueProblems,
    boardFromRows: boardFromRows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.LochtrisTechniques;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
