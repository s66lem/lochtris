# Lochtris

A static, zero-dependency browser trainer for modern Tetris Perfect Clear Openers (PCO), spins, openers, and 40-Line Sprint.

Play online at **https://s66lem.github.io/lochtris/**.

## Curriculum & Modes

- **Perfect Clear Opener (21 sections, 1,480 unique problems):** Guided templates, randomized drills, exams, skimming patterns, and endurance runs covering all 711 solvable PCO queues plus mirrored variants.
- **T-Spin Mastery (7 drills):** TSD, TSS, TST, T-Spin Fin, Imperial Cross, STSD, and DT Cannon Finish.
- **All-Spin & 180° Kicks (5 drills):** S-Spin, Z-Spin, L-Spin, and J-Spin Doubles (90°-solvable), plus a 180°-only J-Spin Double.
- **Modern Openers & Combos (5 drills):** TKI-3 (Flat Top), TKI-3 (Castle Top), MKO Stacking, C-Spin Finish (TST → TSD), and 3-Combo Downstack.
- **40L Sprint:** 40-line time trial with optional 3-2-1-GO countdown (supporting pre-DAS, IRS, and IHS), live PPS/KPP/Finesse tracking, and saved personal best.
- **Zen Practice:** Endless 7-bag free play for stacking and handling warmups.

## Engine & Features

- **SRS+ Ruleset:** Guideline JLSTZ 90° kicks, SRS+ 180° kicks, symmetric SRS+ I-piece 90° kicks, 500 ms lock delay with 15 ground move/rotate resets, and a 2-row visible peek buffer above the skyline.
- **Tunable Handling:** Sub-frame DAS (`0.1F`), ARR (down to `0.0F` instant wall snap), DCD, SDF (up to `Infinity`), SOCD last-key-wins, configurable IRS/IHS (`Off` / `Tap` / `Hold`), spin rule modes (`T-Spins`, `All-Mini+`, `All`), and handling/keybinding presets.
- **Shadow Guides & Finesse:** Toggleable placement shadow guides (`R`), spin-requirement enforcement on technique drills, and a 2-step Finesse fault counter.
- **Visuals & Audio:** DPR-scaled Canvas renderer with 3 block skins (`Modern`, `Flat`, `Neon`), zero-delay clear/drop/lock effects, procedural stereo-panned Web Audio synthesis, and `prefers-reduced-motion: reduce` support.
- **Persistence:** Settings, keybindings, problem clears, and Sprint bests are saved in `localStorage` with automatic migration from legacy cookies.

## Default Controls

All bindings are configurable in **Preferences** using layout-independent physical key codes (`KeyboardEvent.code`).

| Action | Default Key |
| --- | --- |
| Move Left / Right | `ArrowLeft` / `ArrowRight` |
| Soft Drop | `ArrowDown` |
| Hard Drop | `Space` |
| Rotate CW / CCW / 180° | `ArrowUp` / `Left Ctrl` / `Left Shift` |
| Hold | `C` |
| Toggle Shadow Guide | `R` |
| Quick Retry | `F4` |
| Pause / Close Preferences | `Esc` |

## Running Locally

No build step or runtime dependencies are required.

```sh
git clone https://github.com/s66lem/lochtris.git
cd lochtris
```

Open `index.html` directly in a browser, or serve the directory locally:

```sh
python -m http.server 8000
```

## Testing

Requires Node.js 18+:

```sh
node --test tests/engine.test.js
```

The test suite verifies SRS+ kick tables, DAS/ARR/DCD/SDF/SOCD/IRS/IHS handling, lock delay mechanics, 40L Sprint and Finesse tracking, storage migration, all 17 technique/opener puzzles (reachability, spin enforcement, 180°-only, zero covered holes), and 90°-only SRS+ BFS reachability across all 1,480 PCO puzzles.

## Architecture

| File | Role |
| --- | --- |
| [`index.html`](index.html) | App shell, ocean backdrop markup, playfield layout, and preferences dialog |
| [`ttt.css`](ttt.css) | Deep-loch theme, responsive layout, compositor animations, and reduced-motion rules |
| [`data.js`](data.js) | Tetromino shapes, SRS+ kick tables, defaults, presets, and section metadata |
| [`problem.js`](problem.js) | 1,480 PCO problem definitions and queue groupings |
| [`techniques.js`](techniques.js) | 17 guided T-Spin, All-Spin, 180°, and Opener puzzles |
| [`engine.js`](engine.js) | Headless fixed-timestep game engine, handling, spin detection, and Finesse |
| [`renderer.js`](renderer.js) | DPR Canvas renderer, sprite/stack caches, and zero-delay visual effects |
| [`audio.js`](audio.js) | Procedural Web Audio synthesizer with harmonic scaling and stereo panning |
| [`storage.js`](storage.js) | `localStorage` persistence, key sanitization, and legacy cookie migration |
| [`ui.js`](ui.js) | View routing, input binding, HUD updates, and animation loop scheduling |
| [`tests/engine.test.js`](tests/engine.test.js) | Node test suite for physics, handling, storage, and full puzzle verification |

## Credits

- **Chotia** ([`sakuramochi84/ttpc`](https://github.com/sakuramochi84/ttpc)) — original author of the PCO curriculum, solutions, and `TetrisPerfectClear.xlsx`.
- **Davdav1233** ([`davdav1233`](https://github.com/davdav1233/)) — upstream fork lineage.
