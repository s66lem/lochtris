/*========================================================================================
  ui.js — Application controller: scenes, sub-frame keyboard/mouse input, wall-clock
  Sprint timing, demand-driven rAF loop, accessible modal, and HUD controller.
========================================================================================*/
(function (root) {
  'use strict';

  var D = root.LochtrisData;
  var S = root.LochtrisStorage;
  var Audio = root.LochtrisAudio;

  var allProblems = [];
  var settings = S.loadSettings();
  var engine = null;
  var renderer = null;

  var currentView = 'menu';
  var prefsOpen = false;
  var prefsReturnToPlay = false;
  var prefsTriggerEl = null;
  var listeningAction = null;
  var lastNonZeroVolume = settings.visuals.sfxVolume > 0 ? settings.visuals.sfxVolume : 50;

  var activeSectionId = -1;
  var activeRunList = [];
  var activeRunIndex = 0;
  var activeMode = 'problem';
  var stateChangedAt = 0;

  // Monotonic wall-clock active time so Sprint PBs never depend on frame delivery
  var runWallStartMs = 0;
  var runPausedTotalMs = 0;
  var runPauseStartedMs = 0;
  var lastEngineStamp = 0;
  var autoPausedByVisibility = false;

  // Demand-driven animation loop
  var rafId = 0;
  var lastRafTime = 0;
  var fpsFrames = 0;
  var fpsLastSample = 0;

  var menuItems = [];
  var menuSelectedIdx = -1;
  var typeaheadBuf = '';
  var typeaheadTimer = null;

  var dom = {};
  var hudCache = {};
  var pipEls = [];
  var calloutTimer = null;
  var resetConfirmArmed = false;
  var resetConfirmTimer = null;

  function initProblemsCatalog() {
    allProblems = typeof getProblems === 'function' ? getProblems() : [];
    var techGroups = root.LochtrisTechniques ? root.LochtrisTechniques.getTechniqueProblems() : null;
    var meta = { tSpins: [], allSpins: [], openers: [] };

    if (techGroups) {
      ['tSpins', 'allSpins', 'openers'].forEach(function (gKey) {
        var list = techGroups[gKey] || [];
        for (var i = 0; i < list.length; i++) {
          meta[gKey].push(allProblems.length);
          allProblems.push(list[i]);
        }
      });
    }
    root.LochtrisAllProblemsMeta = meta;
  }

  function cacheDom() {
    dom.oceanBackdrop = document.getElementById('ocean-backdrop');
    dom.viewMenu = document.getElementById('view-menu');
    dom.viewPlay = document.getElementById('view-play');
    dom.prefsModal = document.getElementById('prefs-modal');

    dom.menuSections = document.getElementById('menu-sections');
    dom.menuSummary = document.getElementById('menu-summary');
    dom.sprintPbBadge = document.getElementById('sprint-pb-badge');

    dom.playSectionTitle = document.getElementById('play-section-title');
    dom.btnPlayGuide = document.getElementById('btn-play-guide');
    dom.btnPlayRetry = document.getElementById('btn-play-retry');
    dom.btnPlayPrefs = document.getElementById('btn-play-prefs');
    dom.btnPlayMute = document.getElementById('btn-play-mute');
    dom.btnPlayBack = document.getElementById('btn-play-back');

    dom.playArena = document.getElementById('play-arena');
    dom.stage = document.getElementById('playfield-stage');
    dom.boardCol = document.getElementById('board-col');
    dom.boardCanvas = document.getElementById('board-canvas');
    dom.holdCanvas = document.getElementById('hold-canvas');
    dom.nextCanvas = document.getElementById('next-canvas');
    dom.holdBox = document.getElementById('hold-box');
    dom.holdHint = document.getElementById('hold-hint');

    dom.lockBarFill = document.getElementById('lock-bar-fill');
    dom.pipGrid = document.getElementById('pip-grid');
    dom.lockResetNum = document.getElementById('lock-reset-num');
    dom.boardOverlay = document.getElementById('board-overlay');
    dom.overlayTitle = document.getElementById('overlay-title');
    dom.overlayMeta = document.getElementById('overlay-meta');
    dom.overlaySub = document.getElementById('overlay-sub');
    dom.overlayActions = document.getElementById('overlay-actions');
    dom.btnOverlayPrimary = document.getElementById('btn-overlay-primary');
    dom.btnOverlayGuide = document.getElementById('btn-overlay-guide');
    dom.btnOverlayMenu = document.getElementById('btn-overlay-menu');

    dom.calloutStack = document.getElementById('callout-stack');
    dom.hintBox = document.getElementById('hint-box');
    dom.guideBadge = document.getElementById('guide-badge');
    dom.fpsBadge = document.getElementById('fps-badge');
    dom.fpsValue = document.getElementById('fps-value');
    dom.keyLegend = document.getElementById('key-legend');

    dom.lblQuestion = document.getElementById('lbl-question');
    dom.valQuestion = document.getElementById('val-question');
    dom.lblPattern = document.getElementById('lbl-pattern');
    dom.valPattern = document.getElementById('val-pattern');
    dom.valPps = document.getElementById('val-pps');
    dom.valInputs = document.getElementById('val-inputs');
    dom.valKpp = document.getElementById('val-kpp');
    dom.statFinesse = document.getElementById('stat-finesse');
    dom.valFinesseFaults = document.getElementById('val-finesse-faults');
    dom.valFinessePct = document.getElementById('val-finesse-pct');
    dom.valTimeMain = document.getElementById('val-time-main');
    dom.valTimeMs = document.getElementById('val-time-ms');
    dom.valPbMain = document.getElementById('val-pb-main');
    dom.valPbMs = document.getElementById('val-pb-ms');
    dom.pbRow = document.getElementById('stat-pb');
  }

  function buildPipsOnce() {
    dom.pipGrid.innerHTML = '';
    pipEls = [];
    for (var i = 0; i < D.LOCK_RESET_LIMIT; i++) {
      var pip = document.createElement('span');
      pip.className = 'manip-pip';
      dom.pipGrid.appendChild(pip);
      pipEls.push(pip);
    }
  }

  function formatTimeParts(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) {
      return { main: '-:--', ms: '.---' };
    }
    var clamped = Math.max(0, Math.floor(ms));
    var totalSec = Math.floor(clamped / 1000);
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec % 60;
    var remMs = clamped % 1000;
    return {
      main: mins + ':' + String(secs).padStart(2, '0'),
      ms: '.' + String(remMs).padStart(3, '0')
    };
  }

  function setTextCached(key, el, text) {
    if (!el || hudCache[key] === text) return;
    hudCache[key] = text;
    el.textContent = text;
  }

  /*--------------------------------------------------------------------------------------
    Wall-Clock Timer & Sub-Frame Simulation Sync
  --------------------------------------------------------------------------------------*/
  function resetRunClock() {
    runWallStartMs = 0;
    runPausedTotalMs = 0;
    runPauseStartedMs = 0;
    lastEngineStamp = performance.now();
  }

  function beginRunClock(now) {
    runWallStartMs = now;
    runPausedTotalMs = 0;
    runPauseStartedMs = 0;
  }

  function pauseRunClock(now) {
    if (runWallStartMs > 0 && runPauseStartedMs === 0) {
      runPauseStartedMs = now;
    }
  }

  function resumeRunClock(now) {
    if (runPauseStartedMs > 0) {
      runPausedTotalMs += Math.max(0, now - runPauseStartedMs);
      runPauseStartedMs = 0;
    }
    lastEngineStamp = now;
  }

  function syncWallElapsed(now) {
    if (!engine || engine.state !== 'playing' || runWallStartMs <= 0) return;
    var activeWall = Math.max(0, now - runWallStartMs - runPausedTotalMs);
    if (activeWall > engine.elapsedMs) {
      engine.elapsedMs = activeWall;
    }
  }

  function eventStamp(e) {
    var now = performance.now();
    if (e && typeof e.timeStamp === 'number' && isFinite(e.timeStamp) && Math.abs(now - e.timeStamp) < 5000) {
      return Math.max(lastEngineStamp || 0, Math.min(now, e.timeStamp));
    }
    return now;
  }

  function syncBackdropPause() {
    if (!dom.oceanBackdrop) return;
    dom.oceanBackdrop.classList.toggle('is-paused', Boolean(prefsOpen || document.hidden));
  }

  function advanceEngineTo(now) {
    if (!engine || prefsOpen) return;
    if (!lastEngineStamp) { lastEngineStamp = now; return; }
    var rawDt = Math.max(0, now - lastEngineStamp);
    lastEngineStamp = now;
    if (rawDt <= 0) return;

    // Step simulation in <= 50ms chunks so long pauses never teleport pieces while preserving real time
    var rem = Math.min(rawDt, 200);
    while (rem > 0) {
      var step = rem > 50 ? 50 : rem;
      engine.update(step);
      rem -= step;
      if (engine.state !== 'playing' && engine.state !== 'countdown') break;
    }
    syncWallElapsed(now);
  }

  /*--------------------------------------------------------------------------------------
    Demand-Driven rAF Loop (0 CPU/GPU idle wakeups on Menu & behind Preferences)
  --------------------------------------------------------------------------------------*/
  function shouldKeepLoopAlive() {
    if (currentView !== 'play' || prefsOpen) return false;
    if (document.hidden) return false;
    if (engine.state === 'playing' || engine.state === 'countdown') return true;
    if (renderer.hasPendingVFX()) return true;
    if (engine.guideMode && engine.curGuide && !renderer.reducedMotion) return true;
    return false;
  }

  function ensureLoop() {
    if (rafId || !shouldKeepLoopAlive()) return;
    lastRafTime = performance.now();
    lastEngineStamp = lastRafTime;
    fpsFrames = 0;
    fpsLastSample = lastRafTime;
    rafId = root.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId) {
      root.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastRafTime = 0;
  }

  /*--------------------------------------------------------------------------------------
    Menu Construction & Navigation
  --------------------------------------------------------------------------------------*/
  function buildMenu() {
    var frag = document.createDocumentFragment();
    menuItems = [];

    for (var gi = 0; gi < D.SECTION_GROUPS.length; gi++) {
      var group = D.SECTION_GROUPS[gi];
      var secEl = document.createElement('section');
      secEl.className = 'menu-group';
      secEl.dataset.groupId = group.id;

      var header = document.createElement('div');
      header.className = 'menu-group-header';

      var titleSpan = document.createElement('h2');
      titleSpan.className = 'menu-group-title';
      titleSpan.textContent = group.title;
      header.appendChild(titleSpan);

      if (group.rate) {
        var rateBadge = document.createElement('span');
        rateBadge.className = 'menu-rate-badge';
        rateBadge.textContent = group.rate;
        if (group.rateTip) rateBadge.title = group.rateTip;
        header.appendChild(rateBadge);
      }

      var groupCheck = document.createElement('span');
      groupCheck.className = 'menu-group-status';
      groupCheck.id = 'status-' + group.id;
      header.appendChild(groupCheck);

      secEl.appendChild(header);

      if (group.note) {
        var noteEl = document.createElement('p');
        noteEl.className = 'menu-group-note';
        noteEl.textContent = group.note;
        secEl.appendChild(noteEl);
      }

      var list = document.createElement('div');
      list.className = 'menu-section-list';

      for (var si = 0; si < group.sections.length; si++) {
        var sec = group.sections[si];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'section-row';
        btn.dataset.sectionId = String(sec.id);
        btn.dataset.search = (String(sec.num) + ' ' + sec.title).toLowerCase();

        var numEl = document.createElement('span');
        numEl.className = 'section-num';
        numEl.textContent = String(sec.num).padStart(2, '0');

        var nameEl = document.createElement('span');
        nameEl.className = 'section-name';
        nameEl.textContent = sec.title;

        var metaEl = document.createElement('span');
        metaEl.className = 'section-meta';
        metaEl.textContent = sec.meta;

        var progEl = document.createElement('span');
        progEl.className = 'section-prog';
        progEl.id = 'sec-prog-' + sec.id;

        btn.appendChild(numEl);
        btn.appendChild(nameEl);
        btn.appendChild(metaEl);
        btn.appendChild(progEl);

        (function (sectionIndex, buttonEl) {
          buttonEl.addEventListener('click', function () {
            Audio.unlock();
            Audio.menuSelect();
            startSection(sectionIndex);
          });
        })(sec.id, btn);

        list.appendChild(btn);
        menuItems.push(btn);
      }

      secEl.appendChild(list);
      frag.appendChild(secEl);
    }

    dom.menuSections.innerHTML = '';
    dom.menuSections.appendChild(frag);
    refreshMenuProgress();
  }

  function refreshMenuProgress() {
    var clearedSections = 0;
    var totalSections = D.SECTIONS.length;

    for (var gi = 0; gi < D.SECTION_GROUPS.length; gi++) {
      var group = D.SECTION_GROUPS[gi];
      var groupClearedCount = 0;

      for (var si = 0; si < group.sections.length; si++) {
        var sec = group.sections[si];
        var isCleared = S.isSectionCleared(sec.id);
        if (isCleared) {
          clearedSections++;
          groupClearedCount++;
        }

        var pool = D.getSectionPool(sec.id);
        var solved = 0;
        for (var pi = 0; pi < pool.length; pi++) {
          var prob = allProblems[pool[pi]];
          if (prob && S.isProblemCleared(prob.storageId)) solved++;
        }

        var rowBtn = dom.menuSections.querySelector('.section-row[data-section-id="' + sec.id + '"]');
        var progEl = document.getElementById('sec-prog-' + sec.id);
        if (rowBtn) rowBtn.classList.toggle('is-cleared', isCleared);
        if (progEl) {
          if (isCleared) progEl.textContent = solved + '/' + pool.length + ' ✓';
          else if (solved > 0) progEl.textContent = solved + '/' + pool.length;
          else progEl.textContent = '';
        }
      }

      var statusEl = document.getElementById('status-' + group.id);
      var groupEl = dom.menuSections.querySelector('.menu-group[data-group-id="' + group.id + '"]');
      var allGroupDone = groupClearedCount === group.sections.length;
      if (groupEl) groupEl.classList.toggle('is-all-cleared', allGroupDone);
      if (statusEl) {
        statusEl.textContent = allGroupDone ? 'Cleared' : (groupClearedCount > 0 ? groupClearedCount + '/' + group.sections.length : '');
      }
    }

    if (dom.menuSummary) {
      dom.menuSummary.textContent = clearedSections + ' / ' + totalSections + ' sections cleared';
    }

    if (dom.sprintPbBadge) {
      var spb = S.getPB('MODE_SPRINT40');
      if (spb !== null) {
        var tp = formatTimeParts(spb);
        dom.sprintPbBadge.textContent = 'PB ' + tp.main + tp.ms;
      } else {
        dom.sprintPbBadge.textContent = 'Race to 40';
      }
    }
  }

  function setMenuSelection(idx, shouldScroll) {
    if (menuSelectedIdx >= 0 && menuItems[menuSelectedIdx]) {
      menuItems[menuSelectedIdx].classList.remove('is-selected');
    }
    menuSelectedIdx = idx;
    if (menuSelectedIdx >= 0 && menuItems[menuSelectedIdx]) {
      var el = menuItems[menuSelectedIdx];
      el.classList.add('is-selected');
      if (shouldScroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /*--------------------------------------------------------------------------------------
    View Switching & Mode Lifecycle
  --------------------------------------------------------------------------------------*/
  function showMenu() {
    currentView = 'menu';
    stopLoop();
    autoPausedByVisibility = false;
    resetRunClock();
    engine.state = 'idle';
    engine.resetInputTimers(true);
    renderer.clearVFX();
    clearCallouts();
    hideOverlay();
    dom.viewPlay.classList.add('is-hidden');
    dom.viewMenu.classList.remove('is-hidden');
    dom.oceanBackdrop.classList.remove('is-playing');
    refreshMenuProgress();
  }

  function showPlayView() {
    currentView = 'play';
    dom.viewMenu.classList.add('is-hidden');
    dom.viewPlay.classList.remove('is-hidden');
    dom.oceanBackdrop.classList.add('is-playing');
    renderer.resize();
    updateKeyLegend();
    updateMuteButton();
    if (dom.fpsBadge) dom.fpsBadge.classList.toggle('is-hidden', !settings.visuals.showFps);
  }

  function startSection(sectionId) {
    activeMode = 'problem';
    activeSectionId = sectionId;
    activeRunList = D.buildSectionRun(sectionId);
    activeRunIndex = 0;

    if (!activeRunList.length) return;
    showPlayView();
    dom.playSectionTitle.textContent = D.SectionTitle(sectionId);
    dom.btnPlayGuide.classList.remove('is-hidden');
    loadCurrentProblem(false);
  }

  function startFreeMode(modeName) {
    activeMode = modeName;
    activeSectionId = -1;
    activeRunList = [];
    activeRunIndex = 0;
    showPlayView();
    dom.playSectionTitle.textContent = modeName === 'sprint' ? '40L Sprint' : 'Zen Practice';
    dom.btnPlayGuide.classList.add('is-hidden');
    renderer.clearVFX();
    clearCallouts();
    hideOverlay();
    resetRunClock();
    engine.startFreeMode(modeName);
    refreshStaticProblemHud();
    renderer.render(engine, performance.now());
    ensureLoop();
  }

  function loadCurrentProblem(forceGuide) {
    var probIndex = activeRunList[activeRunIndex];
    var prob = allProblems[probIndex];
    if (!prob) {
      showMenu();
      return;
    }
    renderer.clearVFX();
    clearCallouts();
    hideOverlay();
    resetRunClock();
    engine.loadProblem(prob, forceGuide);
    refreshStaticProblemHud();
    renderer.render(engine, performance.now());
    ensureLoop();
  }

  function restartCurrent(forceGuide) {
    if (activeMode === 'problem') {
      var useGuide = typeof forceGuide === 'boolean' ? forceGuide : engine.guideMode;
      loadCurrentProblem(useGuide);
    } else {
      startFreeMode(activeMode);
    }
  }

  function advanceAfterClear() {
    if (activeMode !== 'problem') {
      startFreeMode(activeMode);
      return;
    }
    if (activeRunIndex >= activeRunList.length - 1) {
      S.markSectionCleared(activeSectionId);
      showMenu();
    } else {
      activeRunIndex++;
      loadCurrentProblem(false);
    }
  }

  /*--------------------------------------------------------------------------------------
    HUD Updates
  --------------------------------------------------------------------------------------*/
  function refreshPbHud() {
    var pb = engine && engine.problem ? S.getPB(engine.problem.storageId) : null;
    var tp = formatTimeParts(pb);
    setTextCached('pbm', dom.valPbMain, tp.main);
    setTextCached('pbms', dom.valPbMs, tp.ms);
    if (dom.pbRow) dom.pbRow.classList.remove('is-new-pb');
  }

  function refreshStaticProblemHud() {
    hudCache = {};
    if (activeMode === 'sprint') {
      setTextCached('lq', dom.lblQuestion, 'LINES');
      setTextCached('vq', dom.valQuestion, String(Math.max(0, engine.targetLines - engine.linesCleared)));
      setTextCached('lp', dom.lblPattern, 'MODE');
      setTextCached('vp', dom.valPattern, '40L');
    } else if (activeMode === 'zen') {
      setTextCached('lq', dom.lblQuestion, 'LINES');
      setTextCached('vq', dom.valQuestion, String(engine.linesCleared));
      setTextCached('lp', dom.lblPattern, 'MODE');
      setTextCached('vp', dom.valPattern, 'ZEN');
    } else {
      setTextCached('lq', dom.lblQuestion, 'QUESTION');
      setTextCached('vq', dom.valQuestion, (activeRunIndex + 1) + '/' + activeRunList.length);
      setTextCached('lp', dom.lblPattern, 'PATTERN');
      setTextCached('vp', dom.valPattern, engine.problem ? engine.problem.caption : '');
    }

    if (dom.statFinesse) {
      dom.statFinesse.classList.toggle('is-hidden', activeMode === 'problem');
    }

    refreshPbHud();

    if (dom.guideBadge) dom.guideBadge.classList.toggle('is-hidden', !engine.guideMode);
    if (dom.btnPlayGuide) dom.btnPlayGuide.classList.toggle('is-active', engine.guideMode);
    if (dom.hintBox) {
      var hint = (engine.problem && engine.problem.hint && engine.problem.hint.indexOf('PC this bad boy') === -1)
        ? engine.problem.hint.replace(/¥n/g, ' ').replace(/\/n/g, ' ').trim()
        : '';
      if (hint && (engine.problem.useGuide || activeMode !== 'problem')) {
        dom.hintBox.textContent = hint;
        dom.hintBox.classList.remove('is-hidden');
      } else {
        dom.hintBox.classList.add('is-hidden');
      }
    }

    updateDynamicHud();
  }

  function updateDynamicHud() {
    if (activeMode === 'sprint') {
      setTextCached('vq', dom.valQuestion, String(Math.max(0, engine.targetLines - engine.linesCleared)));
    } else if (activeMode === 'zen') {
      setTextCached('vq', dom.valQuestion, String(engine.linesCleared));
    }

    setTextCached('pps', dom.valPps, engine.getPPS().toFixed(2));
    setTextCached('inp', dom.valInputs, engine.inputs + ',');
    setTextCached('kpp', dom.valKpp, engine.getKPP().toFixed(2));

    if (activeMode !== 'problem') {
      setTextCached('ff', dom.valFinesseFaults, String(engine.finesseFaults));
      setTextCached('fp', dom.valFinessePct, ' · ' + engine.getFinessePct() + '%');
    }

    var tParts = formatTimeParts(engine.elapsedMs);
    setTextCached('tm', dom.valTimeMain, tParts.main);
    setTextCached('tms', dom.valTimeMs, tParts.ms);

    var grounded = engine.isGrounded();
    var lockProg = engine.getLockProgress();
    var barScale = grounded ? Math.max(0, 1 - lockProg) : 1;
    var isUrgent = grounded && barScale < 0.25;
    var barKey = (grounded ? (isUrgent ? 'u' : 'g') : 'a') + ':' + barScale.toFixed(3);
    if (hudCache.lockBar !== barKey && dom.lockBarFill) {
      hudCache.lockBar = barKey;
      dom.lockBarFill.style.transform = 'scaleX(' + barScale.toFixed(4) + ')';
      dom.lockBarFill.classList.toggle('is-active', grounded && !isUrgent);
      dom.lockBarFill.classList.toggle('is-urgent', isUrgent);
    }

    var remPips = engine.getRemainingLockResets();
    var resetKey = remPips + ':' + (grounded ? 1 : 0);
    if (hudCache.pips !== resetKey) {
      hudCache.pips = resetKey;
      for (var i = 0; i < pipEls.length; i++) {
        pipEls[i].classList.toggle('is-spent', i >= remPips);
      }
      if (dom.lockResetNum) {
        dom.lockResetNum.textContent = (grounded || remPips < D.LOCK_RESET_LIMIT) ? String(remPips) : '';
        dom.lockResetNum.classList.toggle('is-low', remPips <= 4);
      }
    }

    var needsHold = engine.needsHoldForGuide();
    if (hudCache.needsHold !== needsHold) {
      hudCache.needsHold = needsHold;
      if (dom.holdBox) dom.holdBox.classList.toggle('is-guide-hold', needsHold);
      if (dom.holdHint) dom.holdHint.classList.toggle('is-hidden', !needsHold);
    }
  }

  function clearCallouts() {
    if (calloutTimer) { clearTimeout(calloutTimer); calloutTimer = null; }
    if (dom.calloutStack) dom.calloutStack.innerHTML = '';
  }

  function pushCallouts(list) {
    if (!dom.calloutStack || !list || !list.length) return;
    dom.calloutStack.innerHTML = '';
    var hasPC = false;
    for (var i = 0; i < list.length; i++) {
      var item = document.createElement('div');
      var text = list[i];
      item.className = 'callout-item';
      if (text.indexOf('PERFECT CLEAR') !== -1) { item.classList.add('is-pc'); hasPC = true; }
      else if (text.indexOf('BACK-TO-BACK') !== -1) item.classList.add('is-b2b');
      else if (text.indexOf('SPIN') !== -1) item.classList.add('is-spin');
      else if (text.indexOf('COMBO') !== -1) item.classList.add('is-combo');
      item.textContent = text;
      dom.calloutStack.appendChild(item);
    }
    if (calloutTimer) clearTimeout(calloutTimer);
    calloutTimer = setTimeout(function () {
      if (dom.calloutStack) dom.calloutStack.innerHTML = '';
    }, hasPC ? 1850 : 1300);
  }

  function showCountdownOverlay(label) {
    if (!dom.boardOverlay) return;
    dom.boardOverlay.classList.remove('is-hidden', 'is-clear', 'is-fail');
    dom.boardOverlay.classList.add('is-countdown');
    dom.overlayTitle.textContent = label;
    dom.overlayMeta.textContent = label === 'GO!' ? '' : 'Hold direction to pre-charge DAS';
    dom.overlaySub.textContent = '';
    if (dom.overlayActions) dom.overlayActions.classList.add('is-hidden');
  }

  function showOverlay(kind, title, meta, sub, primaryLabel, showGuideBtn) {
    if (!settings.visuals.textOverlay || !dom.boardOverlay) return;
    dom.boardOverlay.classList.remove('is-hidden', 'is-clear', 'is-fail', 'is-countdown');
    dom.boardOverlay.classList.add(kind === 'clear' ? 'is-clear' : 'is-fail');
    dom.overlayTitle.textContent = title;
    dom.overlayMeta.textContent = meta || '';
    dom.overlaySub.textContent = sub || '';
    if (dom.overlayActions) {
      dom.overlayActions.classList.remove('is-hidden');
      if (dom.btnOverlayPrimary) dom.btnOverlayPrimary.textContent = primaryLabel || 'Next';
      if (dom.btnOverlayGuide) dom.btnOverlayGuide.classList.toggle('is-hidden', !showGuideBtn);
    }
  }

  function hideOverlay() {
    if (!dom.boardOverlay) return;
    dom.boardOverlay.classList.add('is-hidden');
    dom.boardOverlay.classList.remove('is-countdown', 'is-clear', 'is-fail');
    if (dom.overlayActions) dom.overlayActions.classList.add('is-hidden');
  }

  function updateKeyLegend() {
    if (!dom.keyLegend) return;
    var k = settings.keys;
    dom.keyLegend.textContent =
      S.formatKeyCode(k.guide) + ' Guide · ' + S.formatKeyCode(k.retry) + ' Retry · ESC Menu';
  }

  function updateMuteButton() {
    if (!dom.btnPlayMute) return;
    var muted = settings.visuals.sfxVolume <= 0;
    dom.btnPlayMute.textContent = muted ? 'SFX Off' : 'SFX ' + settings.visuals.sfxVolume + '%';
    dom.btnPlayMute.classList.toggle('is-muted', muted);
  }

  /*--------------------------------------------------------------------------------------
    Engine Event Handling
  --------------------------------------------------------------------------------------*/
  function handleEngineEvent(type, ev) {
    var now = performance.now();
    switch (type) {
      case 'runStart':
        beginRunClock(now);
        break;
      case 'countdown':
        Audio.countdown(ev.beat === 0);
        if (ev.beat > 0) {
          showCountdownOverlay(ev.label);
        } else {
          showCountdownOverlay('GO!');
          setTimeout(function () {
            if (engine && engine.state === 'playing' && dom.boardOverlay && dom.boardOverlay.classList.contains('is-countdown')) {
              hideOverlay();
            }
          }, 260);
        }
        break;
      case 'move': Audio.move(); break;
      case 'wallHit': Audio.wall(); break;
      case 'wallPush': renderer.onWallPush(ev.dir); break;
      case 'rotate':
        Audio.rotate(ev.isSpin, ev.pieceKey);
        renderer.onRotate(ev);
        break;
      case 'softDrop':
        if (!ev.sonic) Audio.softDrop();
        renderer.onSoftDrop(ev);
        break;
      case 'hardDrop':
        Audio.hardDrop();
        renderer.onHardDrop(ev);
        break;
      case 'lock':
        Audio.lock();
        renderer.onLock(ev);
        break;
      case 'lockWarn':
        Audio.lockWarn();
        break;
      case 'hold': Audio.hold(); break;
      case 'holdDenied': Audio.holdDenied(); break;
      case 'lineClear':
        Audio.lineClear(ev.count, ev.tSpin > 0 || Boolean(ev.allSpin), ev.isB2B, ev.combo, ev.isPC);
        renderer.onLineClear(ev);
        pushCallouts(ev.callouts);
        break;
      case 'problemClear':
        syncWallElapsed(now);
        ev.elapsedMs = engine.elapsedMs;
        ev.pps = engine.getPPS();
        stateChangedAt = now;

        // Immediately persist problem & final-section completion before user can click Menu
        var pbResult = null;
        if (ev.problem) {
          if (activeMode === 'problem') {
            S.markProblemCleared(ev.problem.storageId);
            if (activeRunIndex >= activeRunList.length - 1 && activeSectionId >= 0) {
              S.markSectionCleared(activeSectionId);
            }
          }
          if (!ev.usedGuide || (ev.problem.useGuide && activeMode === 'problem') || activeMode === 'sprint') {
            pbResult = S.recordPB(ev.problem.storageId, ev.elapsedMs);
            var tp = formatTimeParts(pbResult.pb);
            setTextCached('pbm', dom.valPbMain, tp.main);
            setTextCached('pbms', dom.valPbMs, tp.ms);
            if (pbResult.isNewPB && dom.pbRow) dom.pbRow.classList.add('is-new-pb');
          }
        }
        // Flush terminal HUD immediately so Sprint reads LINES 0 and exact finish time
        updateDynamicHud();

        var tStr = formatTimeParts(ev.elapsedMs);
        var meta = tStr.main + tStr.ms + ' · ' + ev.pps.toFixed(2) + ' PPS';
        if (activeMode === 'sprint') {
          meta += ' · ' + ev.finesseFaults + 'F (' + ev.finessePct + '%)';
        }
        if (pbResult && pbResult.isNewPB) meta += ' · NEW PB';

        var isLastInSection = activeMode === 'problem' && activeRunIndex >= activeRunList.length - 1;
        var primaryLbl = activeMode === 'sprint' ? 'Run Again' : (isLastInSection ? 'Done' : 'Next');
        var sub = activeMode === 'sprint'
          ? 'Space / Enter to run again'
          : (isLastInSection ? 'Section complete · Space / Enter for menu' : 'Space / Enter for next');
        showOverlay('clear', activeMode === 'sprint' ? 'FINISH!' : 'CLEAR!', meta, sub, primaryLbl, false);
        break;
      case 'problemFail':
        syncWallElapsed(now);
        stateChangedAt = now;
        Audio.fail();
        renderer.onFail(ev);
        updateDynamicHud();

        var reasonMap = {
          guide_mismatch: 'Off guide placement',
          missing_spin: 'Spin required for this step',
          missing_180: '180° rotation required',
          out_of_pieces: 'Out of pieces',
          lockout: 'Locked out above skyline',
          blockout: 'Blocked out on spawn'
        };
        var reasonText = reasonMap[ev.reason] || 'Topped out';
        var failSub = activeMode === 'problem'
          ? 'Space / Enter: Retry · ' + S.formatKeyCode(settings.keys.guide) + ': Show Guide'
          : 'Space / Enter to retry';
        showOverlay('fail', 'FAIL', reasonText, failSub, 'Retry', activeMode === 'problem');
        break;
    }
    ensureLoop();
  }

  /*--------------------------------------------------------------------------------------
    Keyboard & Window Focus Input
  --------------------------------------------------------------------------------------*/
  function codeToAction(code) {
    var k = settings.keys;
    var actions = Object.keys(k);
    for (var i = 0; i < actions.length; i++) {
      if (k[actions[i]] === code) return actions[i];
    }
    return null;
  }

  function isStandaloneModifierCode(code) {
    return code === 'ControlLeft' || code === 'ControlRight' ||
      code === 'ShiftLeft' || code === 'ShiftRight' ||
      code === 'AltLeft' || code === 'AltRight';
  }

  function hasDisallowedModifiers(e) {
    if (isStandaloneModifierCode(e.code)) {
      // Allow pressing L-Ctrl / L-Shift alone if bound, but reject Ctrl+Shift+Alt combos
      return (e.metaKey || (e.altKey && e.code.indexOf('Alt') !== 0));
    }
    return Boolean(e.ctrlKey || e.metaKey || e.altKey);
  }

  function onKeyDown(e) {
    Audio.unlock();

    if (listeningAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        finishKeyRebind(null);
      } else if (D.RESERVED_KEY_CODES[e.code]) {
        showReservedKeyWarning(e.code);
      } else {
        finishKeyRebind(e.code);
      }
      return;
    }

    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
      if (e.code === 'Escape' && prefsOpen) closePreferences(false);
      return;
    }

    if (prefsOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        closePreferences(false);
      } else if (e.code === 'Tab') {
        trapModalFocus(e);
      }
      return;
    }

    // Never intercept browser shortcuts like F5, F11, F12, Ctrl+R, Ctrl+W, Ctrl+T, Ctrl+L
    if (D.RESERVED_KEY_CODES[e.code] && e.code !== 'Tab') return;
    if (hasDisallowedModifiers(e)) return;

    if (currentView === 'menu') {
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        var next = menuSelectedIdx < 0 ? 0 : Math.min(menuItems.length - 1, menuSelectedIdx + 1);
        setMenuSelection(next, true);
        Audio.menuMove();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        var prev = menuSelectedIdx < 0 ? 0 : Math.max(0, menuSelectedIdx - 1);
        setMenuSelection(prev, true);
        Audio.menuMove();
      } else if (e.code === 'Home') {
        e.preventDefault();
        setMenuSelection(0, true);
      } else if (e.code === 'End') {
        e.preventDefault();
        setMenuSelection(menuItems.length - 1, true);
      } else if (e.code === 'Enter' && menuSelectedIdx >= 0 && menuItems[menuSelectedIdx]) {
        // Only activate keyboard-selected row if user isn't explicitly focused on another button/link
        var active = document.activeElement;
        if (!active || active === document.body || active === menuItems[menuSelectedIdx]) {
          e.preventDefault();
          menuItems[menuSelectedIdx].click();
        }
      } else if (e.key && e.key.length === 1 && /[a-z0-9]/i.test(e.key) && !e.shiftKey) {
        // Quick typeahead jump to matching section
        typeaheadBuf += e.key.toLowerCase();
        if (typeaheadTimer) clearTimeout(typeaheadTimer);
        typeaheadTimer = setTimeout(function () { typeaheadBuf = ''; }, 750);
        for (var mi = 0; mi < menuItems.length; mi++) {
          if (menuItems[mi].dataset.search.indexOf(typeaheadBuf) !== -1) {
            setMenuSelection(mi, true);
            break;
          }
        }
      }
      return;
    }

    if (currentView === 'play') {
      if (e.repeat) {
        if (codeToAction(e.code) || e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        showMenu();
        return;
      }

      var action = codeToAction(e.code);

      if (action === 'retry') {
        e.preventDefault();
        Audio.menuMove();
        restartCurrent(activeMode === 'problem' ? (engine.problem && engine.problem.useGuide) : false);
        return;
      }

      if (action === 'guide' && activeMode === 'problem') {
        e.preventDefault();
        Audio.guide();
        loadCurrentProblem(true);
        return;
      }

      // Terminal Clear/Fail state: preserve Tab and focused button clicks; accept Space/Enter directly
      if (engine.state === 'cleared' || engine.state === 'failed') {
        if (e.code === 'Tab') return;
        var focused = document.activeElement;
        if (focused && focused.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) {
          return; // Let native focused button handle activation cleanly
        }
        if (performance.now() - stateChangedAt < 140) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (engine.state === 'cleared') advanceAfterClear();
          else restartCurrent(engine.guideMode);
        }
        return;
      }

      if (action) {
        e.preventDefault();
        var stamp = eventStamp(e);
        // Sub-frame accuracy: advance engine timers up to exact DOMHighResTimeStamp before applying input
        advanceEngineTo(stamp);
        engine.pressAction(action);
        if (engine.dirty) {
          renderer.render(engine, stamp);
          engine.dirty = false;
          updateDynamicHud();
        }
        ensureLoop();
      }
    }
  }

  function onKeyUp(e) {
    if (currentView !== 'play' || prefsOpen || listeningAction) return;
    var action = codeToAction(e.code);
    if (action) {
      var stamp = eventStamp(e);
      advanceEngineTo(stamp);
      engine.releaseAction(action);
    }
  }

  function onWindowBlur() {
    if (engine) engine.resetInputTimers(true);
  }

  function onVisibilityChange() {
    var now = performance.now();
    syncBackdropPause();
    if (document.hidden) {
      if (currentView === 'play' && engine && (engine.state === 'playing' || engine.state === 'countdown')) {
        advanceEngineTo(now);
        pauseRunClock(now);
        engine.setPaused(true);
        autoPausedByVisibility = true;
      } else if (engine) {
        engine.resetInputTimers(true);
      }
      stopLoop();
    } else {
      if (autoPausedByVisibility && currentView === 'play' && !prefsOpen && engine) {
        autoPausedByVisibility = false;
        resumeRunClock(now);
        engine.setPaused(false);
        ensureLoop();
      }
    }
  }

  /*--------------------------------------------------------------------------------------
    Preferences Modal (with focus trap, live skin swatch, reserved-key checks, volume restore)
  --------------------------------------------------------------------------------------*/
  var draftSettings = null;

  function trapModalFocus(e) {
    var focusables = dom.prefsModal.querySelectorAll(
      'button:not([disabled]):not(.is-hidden):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
    );
    var visible = [];
    for (var i = 0; i < focusables.length; i++) {
      if (focusables[i].offsetParent !== null) visible.push(focusables[i]);
    }
    if (!visible.length) return;
    var first = visible[0];
    var last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function disarmResetButton() {
    resetConfirmArmed = false;
    if (resetConfirmTimer) { clearTimeout(resetConfirmTimer); resetConfirmTimer = null; }
    var resetBtn = document.getElementById('btn-reset-progress');
    if (resetBtn) {
      resetBtn.textContent = 'Reset Progress & PBs';
      resetBtn.classList.remove('is-armed');
    }
  }

  function clearReservedKeyWarning() {
    var el = document.getElementById('keybind-reserved-msg');
    if (el) {
      el.textContent = '';
      el.classList.add('is-hidden');
    }
  }

  function showReservedKeyWarning(code) {
    var el = document.getElementById('keybind-reserved-msg');
    if (el) {
      el.textContent = S.formatKeyCode(code) + ' is reserved by the browser and cannot be bound.';
      el.classList.remove('is-hidden');
    }
  }

  function openPreferences(fromPlay) {
    prefsTriggerEl = document.activeElement;
    prefsReturnToPlay = Boolean(fromPlay);
    if (prefsReturnToPlay && engine) {
      var now = performance.now();
      advanceEngineTo(now);
      pauseRunClock(now);
      engine.setPaused(true);
    }
    stopLoop();
    draftSettings = JSON.parse(JSON.stringify(settings));
    prefsOpen = true;
    syncBackdropPause();
    disarmResetButton();
    clearReservedKeyWarning();
    renderPreferencesUI();
    dom.prefsModal.classList.remove('is-hidden');
    var firstTab = dom.prefsModal.querySelector('.prefs-tab.is-active') || dom.prefsModal.querySelector('.prefs-tab');
    if (firstTab) firstTab.focus();
  }

  function closePreferences(save) {
    finishKeyRebind(null);
    disarmResetButton();
    clearReservedKeyWarning();

    if (save && draftSettings) {
      if (hasDuplicateKeys(draftSettings.keys)) {
        switchPrefsTab('controls', true);
        highlightDuplicateKeys();
        return;
      }
      settings = S.saveSettings(draftSettings);
      if (settings.visuals.sfxVolume > 0) lastNonZeroVolume = settings.visuals.sfxVolume;
      applySettingsLive();
    } else {
      // Restore committed SFX volume if slider was previewed then cancelled
      Audio.setVolume(settings.visuals.sfxVolume);
    }

    prefsOpen = false;
    syncBackdropPause();
    dom.prefsModal.classList.add('is-hidden');
    if (prefsReturnToPlay && engine) {
      resumeRunClock(performance.now());
      engine.setPaused(false);
      ensureLoop();
    }
    if (prefsTriggerEl && typeof prefsTriggerEl.focus === 'function' && prefsTriggerEl.offsetParent !== null) {
      prefsTriggerEl.focus();
    }
    prefsTriggerEl = null;
  }

  function applySettingsLive() {
    if (engine) engine.setHandling(settings.handling);
    if (renderer) renderer.setVisuals(settings.visuals);
    Audio.setVolume(settings.visuals.sfxVolume);
    updateKeyLegend();
    updateMuteButton();
    if (dom.fpsBadge) dom.fpsBadge.classList.toggle('is-hidden', !settings.visuals.showFps);
    if (currentView === 'play' && engine) {
      engine.dirty = true;
      renderer.render(engine, performance.now());
    }
  }

  function switchPrefsTab(tabName, moveFocus) {
    finishKeyRebind(null);
    disarmResetButton();
    clearReservedKeyWarning();
    var tabs = dom.prefsModal.querySelectorAll('.prefs-tab');
    var panels = dom.prefsModal.querySelectorAll('.prefs-panel');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].dataset.tab === tabName;
      tabs[i].classList.toggle('is-active', active);
      tabs[i].setAttribute('aria-selected', active ? 'true' : 'false');
      tabs[i].setAttribute('tabindex', active ? '0' : '-1');
      if (active && moveFocus) tabs[i].focus();
    }
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('is-hidden', panels[j].dataset.panel !== tabName);
    }
  }

  function hasDuplicateKeys(keysObj) {
    var seen = {};
    var actions = Object.keys(keysObj);
    for (var i = 0; i < actions.length; i++) {
      var code = keysObj[actions[i]];
      if (seen[code]) return true;
      seen[code] = true;
    }
    return false;
  }

  function highlightDuplicateKeys() {
    var counts = {};
    Object.keys(draftSettings.keys).forEach(function (a) {
      var c = draftSettings.keys[a];
      counts[c] = (counts[c] || 0) + 1;
    });
    var btns = dom.prefsModal.querySelectorAll('.keybind-btn');
    var hasDup = false;
    for (var i = 0; i < btns.length; i++) {
      var action = btns[i].dataset.action;
      var dup = counts[draftSettings.keys[action]] > 1;
      btns[i].classList.toggle('is-conflict', dup);
      if (dup) hasDup = true;
    }
    var warn = document.getElementById('keybind-conflict-msg');
    if (warn) warn.classList.toggle('is-hidden', !hasDup);
  }

  function startKeyRebind(action, btnEl) {
    finishKeyRebind(null);
    clearReservedKeyWarning();
    listeningAction = action;
    btnEl.classList.add('is-listening');
    btnEl.textContent = 'Press key...';
  }

  function finishKeyRebind(newCode) {
    if (!listeningAction) return;
    var action = listeningAction;
    listeningAction = null;
    if (newCode && draftSettings) draftSettings.keys[action] = newCode;
    var btn = dom.prefsModal.querySelector('.keybind-btn[data-action="' + action + '"]');
    if (btn && draftSettings) {
      btn.classList.remove('is-listening');
      btn.textContent = S.formatKeyCode(draftSettings.keys[action]);
    }
    if (draftSettings) {
      highlightDuplicateKeys();
      updateActivePresetButtons();
    }
  }

  function formatHandlingReadout(id, val) {
    if (id === 'arr') return val <= 0 ? '0.0F · Instant' : val.toFixed(1) + 'F · ' + Math.round(val * D.FRAME_MS) + 'ms';
    if (id === 'das') return val.toFixed(1) + 'F · ' + Math.round(val * D.FRAME_MS) + 'ms';
    if (id === 'dcd') return val.toFixed(1) + 'F · ' + Math.round(val * D.FRAME_MS) + 'ms';
    if (id === 'sdf') return val >= 41 ? '∞ · Instant' : Math.round(val) + 'x';
    return String(val);
  }

  function updateActivePresetButtons() {
    if (!draftSettings) return;
    var h = draftSettings.handling;
    var hBtns = dom.prefsModal.querySelectorAll('[data-handling-preset]');
    for (var i = 0; i < hBtns.length; i++) {
      var p = D.HANDLING_PRESETS[hBtns[i].dataset.handlingPreset];
      var match = p &&
        Math.abs(h.das - p.das) < 0.05 &&
        Math.abs(h.arr - p.arr) < 0.05 &&
        Math.abs(h.dcd - p.dcd) < 0.05 &&
        h.sdf === p.sdf;
      hBtns[i].classList.toggle('is-active', Boolean(match));
    }

    var kBtns = dom.prefsModal.querySelectorAll('[data-key-preset]');
    for (var j = 0; j < kBtns.length; j++) {
      var kp = D.KEY_PRESETS[kBtns[j].dataset.keyPreset];
      var kMatch = true;
      if (kp) {
        var acts = Object.keys(kp.keys);
        for (var a = 0; a < acts.length; a++) {
          if (draftSettings.keys[acts[a]] !== kp.keys[acts[a]]) { kMatch = false; break; }
        }
      } else {
        kMatch = false;
      }
      kBtns[j].classList.toggle('is-active', kMatch);
    }
  }

  function renderPreferencesUI() {
    var h = draftSettings.handling;
    var v = draftSettings.visuals;

    setSliderState('pref-arr', 'pref-arr-val', h.arr, formatHandlingReadout('arr', h.arr));
    setSliderState('pref-das', 'pref-das-val', h.das, formatHandlingReadout('das', h.das));
    setSliderState('pref-dcd', 'pref-dcd-val', h.dcd, formatHandlingReadout('dcd', h.dcd));
    setSliderState('pref-sdf', 'pref-sdf-val', h.sdf, formatHandlingReadout('sdf', h.sdf));

    setSelectValue('pref-irs', h.irs);
    setSelectValue('pref-ihs', h.ihs);
    setSelectValue('pref-spin-rule', h.spinRule);

    setChecked('pref-cancel-das', h.cancelDasOnDirChange);
    setChecked('pref-preserve-das', h.preserveDasOnSpawn);
    setChecked('pref-sprint-countdown', h.sprintCountdown);

    setSliderState('pref-sfx', 'pref-sfx-val', v.sfxVolume, v.sfxVolume + '%');
    setSliderState('pref-bounce', 'pref-bounce-val', v.bounce, v.bounce + '%');
    setSliderState('pref-ghost', 'pref-ghost-val', v.ghostOpacity, v.ghostOpacity + '%');
    setSliderState('pref-grid', 'pref-grid-val', v.gridOpacity, v.gridOpacity + '%');

    setSelectValue('pref-skin', v.skin);
    root.LochtrisRenderer.renderSkinPreview(document.getElementById('pref-skin-preview'), v.skin);

    setChecked('pref-particles', v.particles);
    setChecked('pref-explode', v.explodeOnFail);
    setChecked('pref-overlay', v.textOverlay);
    setChecked('pref-fps', v.showFps);

    var btns = dom.prefsModal.querySelectorAll('.keybind-btn');
    for (var i = 0; i < btns.length; i++) {
      var act = btns[i].dataset.action;
      btns[i].textContent = S.formatKeyCode(draftSettings.keys[act]);
      btns[i].classList.remove('is-listening', 'is-conflict');
    }
    highlightDuplicateKeys();
    updateActivePresetButtons();
  }

  function setSliderState(sliderId, valId, value, label) {
    var s = document.getElementById(sliderId);
    var l = document.getElementById(valId);
    if (s) s.value = String(value);
    if (l) l.textContent = label;
  }

  function setSelectValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = String(value);
  }

  function setChecked(id, checked) {
    var el = document.getElementById(id);
    if (el) el.checked = Boolean(checked);
  }

  function makeReadoutEditable(sliderId, valId, prop, min, max, step) {
    var readout = document.getElementById(valId);
    var slider = document.getElementById(sliderId);
    if (!readout || !slider) return;
    readout.title = 'Click to type exact value';
    readout.classList.add('is-editable');
    readout.addEventListener('click', function () {
      if (readout.querySelector('input')) return;
      var cur = draftSettings.handling[prop];
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'inline-num-input';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(cur);
      readout.textContent = '';
      readout.appendChild(inp);
      inp.focus();
      inp.select();

      function commit(apply) {
        if (apply) {
          var v = parseFloat(inp.value);
          if (isFinite(v)) {
            v = Math.max(min, Math.min(max, v));
            v = Math.round(v / step) * step;
            v = Math.round(v * 10) / 10;
            draftSettings.handling[prop] = v;
            slider.value = String(v);
            updateActivePresetButtons();
          }
        }
        readout.textContent = formatHandlingReadout(prop, draftSettings.handling[prop]);
      }

      inp.addEventListener('blur', function () { commit(true); });
      inp.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      });
    });
  }

  function bindPreferencesEvents() {
    var tabs = dom.prefsModal.querySelectorAll('.prefs-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (idx) {
        tabs[idx].addEventListener('click', function () { switchPrefsTab(this.dataset.tab, false); });
        tabs[idx].addEventListener('keydown', function (e) {
          var nextIdx = -1;
          if (e.code === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
          else if (e.code === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
          else if (e.code === 'Home') nextIdx = 0;
          else if (e.code === 'End') nextIdx = tabs.length - 1;
          if (nextIdx >= 0) {
            e.preventDefault();
            switchPrefsTab(tabs[nextIdx].dataset.tab, true);
          }
        });
      })(i);
    }

    bindSlider('pref-arr', 'pref-arr-val', function (val) {
      draftSettings.handling.arr = Math.round(val * 10) / 10;
      updateActivePresetButtons();
      return formatHandlingReadout('arr', draftSettings.handling.arr);
    });
    bindSlider('pref-das', 'pref-das-val', function (val) {
      draftSettings.handling.das = Math.round(val * 10) / 10;
      updateActivePresetButtons();
      return formatHandlingReadout('das', draftSettings.handling.das);
    });
    bindSlider('pref-dcd', 'pref-dcd-val', function (val) {
      draftSettings.handling.dcd = Math.round(val * 10) / 10;
      updateActivePresetButtons();
      return formatHandlingReadout('dcd', draftSettings.handling.dcd);
    });
    bindSlider('pref-sdf', 'pref-sdf-val', function (val) {
      draftSettings.handling.sdf = Math.round(val);
      updateActivePresetButtons();
      return formatHandlingReadout('sdf', draftSettings.handling.sdf);
    });

    makeReadoutEditable('pref-arr', 'pref-arr-val', 'arr', 0, 5, 0.1);
    makeReadoutEditable('pref-das', 'pref-das-val', 'das', 1, 20, 0.1);
    makeReadoutEditable('pref-dcd', 'pref-dcd-val', 'dcd', 0, 20, 0.1);
    makeReadoutEditable('pref-sdf', 'pref-sdf-val', 'sdf', 5, 41, 1);

    bindSelect('pref-irs', function (v) { draftSettings.handling.irs = v; });
    bindSelect('pref-ihs', function (v) { draftSettings.handling.ihs = v; });
    bindSelect('pref-spin-rule', function (v) { draftSettings.handling.spinRule = v; });

    var hPresets = dom.prefsModal.querySelectorAll('[data-handling-preset]');
    for (var hp = 0; hp < hPresets.length; hp++) {
      hPresets[hp].addEventListener('click', function () {
        var p = D.HANDLING_PRESETS[this.dataset.handlingPreset];
        if (!p) return;
        draftSettings.handling.das = p.das;
        draftSettings.handling.arr = p.arr;
        draftSettings.handling.dcd = p.dcd;
        draftSettings.handling.sdf = p.sdf;
        renderPreferencesUI();
      });
    }

    var kPresets = dom.prefsModal.querySelectorAll('[data-key-preset]');
    for (var kp = 0; kp < kPresets.length; kp++) {
      kPresets[kp].addEventListener('click', function () {
        var p = D.KEY_PRESETS[this.dataset.keyPreset];
        if (!p) return;
        draftSettings.keys = Object.assign({}, p.keys);
        clearReservedKeyWarning();
        renderPreferencesUI();
      });
    }

    var kBtns = dom.prefsModal.querySelectorAll('.keybind-btn');
    for (var kb = 0; kb < kBtns.length; kb++) {
      kBtns[kb].addEventListener('click', function () {
        startKeyRebind(this.dataset.action, this);
      });
    }

    bindToggle('pref-cancel-das', function (v) { draftSettings.handling.cancelDasOnDirChange = v; });
    bindToggle('pref-preserve-das', function (v) { draftSettings.handling.preserveDasOnSpawn = v; });
    bindToggle('pref-sprint-countdown', function (v) { draftSettings.handling.sprintCountdown = v; });

    bindSlider('pref-sfx', 'pref-sfx-val', function (val) {
      draftSettings.visuals.sfxVolume = Math.round(val);
      Audio.setVolume(draftSettings.visuals.sfxVolume);
      return draftSettings.visuals.sfxVolume + '%';
    });
    var sfxSlider = document.getElementById('pref-sfx');
    if (sfxSlider) {
      sfxSlider.addEventListener('change', function () {
        if (draftSettings.visuals.sfxVolume > 0) Audio.rotate(false, 'T');
      });
    }
    bindSlider('pref-bounce', 'pref-bounce-val', function (val) {
      draftSettings.visuals.bounce = Math.round(val);
      return draftSettings.visuals.bounce + '%';
    });
    bindSlider('pref-ghost', 'pref-ghost-val', function (val) {
      draftSettings.visuals.ghostOpacity = Math.round(val);
      return draftSettings.visuals.ghostOpacity + '%';
    });
    bindSlider('pref-grid', 'pref-grid-val', function (val) {
      draftSettings.visuals.gridOpacity = Math.round(val);
      return draftSettings.visuals.gridOpacity + '%';
    });

    bindSelect('pref-skin', function (v) {
      draftSettings.visuals.skin = v;
      root.LochtrisRenderer.renderSkinPreview(document.getElementById('pref-skin-preview'), v);
    });
    bindToggle('pref-particles', function (v) { draftSettings.visuals.particles = v; });
    bindToggle('pref-explode', function (v) { draftSettings.visuals.explodeOnFail = v; });
    bindToggle('pref-overlay', function (v) { draftSettings.visuals.textOverlay = v; });
    bindToggle('pref-fps', function (v) { draftSettings.visuals.showFps = v; });

    var resetBtn = document.getElementById('btn-reset-progress');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!resetConfirmArmed) {
          resetConfirmArmed = true;
          resetBtn.textContent = 'Click again to confirm reset';
          resetBtn.classList.add('is-armed');
          if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
          resetConfirmTimer = setTimeout(disarmResetButton, 3500);
        } else {
          disarmResetButton();
          S.resetAllProgress();
          refreshMenuProgress();
          if (currentView === 'play') refreshPbHud();
          resetBtn.textContent = 'Progress cleared';
        }
      });
    }

    document.getElementById('btn-prefs-save').addEventListener('click', function () { closePreferences(true); });
    document.getElementById('btn-prefs-cancel').addEventListener('click', function () { closePreferences(false); });
    dom.prefsModal.addEventListener('click', function (e) {
      if (e.target === dom.prefsModal) closePreferences(false);
    });
  }

  function bindSlider(sliderId, valId, onVal) {
    var s = document.getElementById(sliderId);
    var l = document.getElementById(valId);
    if (!s || !l) return;
    s.addEventListener('input', function () {
      l.textContent = onVal(parseFloat(this.value));
    });
  }

  function bindSelect(id, onVal) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () { onVal(this.value); });
  }

  function bindToggle(id, onVal) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () { onVal(this.checked); });
  }

  /*--------------------------------------------------------------------------------------
    Animation Frame Tick
  --------------------------------------------------------------------------------------*/
  function frame(now) {
    rafId = 0;
    if (!lastRafTime) lastRafTime = now;
    var dtMs = Math.min(50, Math.max(0, now - lastRafTime));
    lastRafTime = now;

    if (currentView === 'play' && !prefsOpen) {
      advanceEngineTo(now);
      var fx = renderer.updateEffects(dtMs);

      var needsGuidePulse = Boolean(engine.guideMode && engine.curGuide && !renderer.reducedMotion);
      if (engine.dirty || fx.canvasDirty || needsGuidePulse) {
        renderer.render(engine, now);
        engine.dirty = false;
      }

      if (engine.state === 'playing' || engine.state === 'ready' || engine.state === 'countdown') {
        updateDynamicHud();
      }

      if (settings.visuals.showFps && dom.fpsValue) {
        fpsFrames++;
        if (now - fpsLastSample >= 300) {
          var fps = Math.round((fpsFrames * 1000) / (now - fpsLastSample));
          setTextCached('fps', dom.fpsValue, String(Math.max(1, Math.min(999, fps))));
          fpsFrames = 0;
          fpsLastSample = now;
        }
      }
    }

    if (shouldKeepLoopAlive()) {
      rafId = root.requestAnimationFrame(frame);
    }
  }

  function boot() {
    initProblemsCatalog();
    cacheDom();
    buildPipsOnce();

    Audio.setVolume(settings.visuals.sfxVolume);

    engine = new root.LochtrisEngine({
      handling: settings.handling,
      onEvent: handleEngineEvent
    });

    renderer = new root.LochtrisRenderer({
      boardCanvas: dom.boardCanvas,
      holdCanvas: dom.holdCanvas,
      nextCanvas: dom.nextCanvas,
      boardColEl: dom.boardCol,
      stageEl: dom.stage,
      arenaEl: dom.playArena
    }, settings.visuals);

    buildMenu();
    bindPreferencesEvents();

    document.getElementById('btn-menu-prefs').addEventListener('click', function () {
      Audio.unlock();
      Audio.menuSelect();
      openPreferences(false);
    });
    document.getElementById('btn-mode-sprint').addEventListener('click', function () {
      Audio.unlock();
      Audio.menuSelect();
      startFreeMode('sprint');
    });
    document.getElementById('btn-mode-zen').addEventListener('click', function () {
      Audio.unlock();
      Audio.menuSelect();
      startFreeMode('zen');
    });

    dom.btnPlayBack.addEventListener('click', showMenu);
    dom.btnPlayGuide.addEventListener('click', function () {
      if (activeMode !== 'problem') return;
      Audio.guide();
      loadCurrentProblem(true);
      this.blur();
    });
    dom.btnPlayRetry.addEventListener('click', function () {
      Audio.menuMove();
      restartCurrent(activeMode === 'problem' ? (engine.problem && engine.problem.useGuide) : false);
      this.blur();
    });
    dom.btnPlayPrefs.addEventListener('click', function () {
      openPreferences(true);
    });
    dom.btnPlayMute.addEventListener('click', function () {
      if (settings.visuals.sfxVolume > 0) {
        lastNonZeroVolume = settings.visuals.sfxVolume;
        settings.visuals.sfxVolume = 0;
      } else {
        settings.visuals.sfxVolume = lastNonZeroVolume > 0 ? lastNonZeroVolume : 50;
      }
      S.saveSettings(settings);
      Audio.setVolume(settings.visuals.sfxVolume);
      updateMuteButton();
      this.blur();
    });

    // Clickable terminal overlay actions
    if (dom.btnOverlayPrimary) {
      dom.btnOverlayPrimary.addEventListener('click', function () {
        if (engine.state === 'cleared') advanceAfterClear();
        else restartCurrent(engine.guideMode);
        this.blur();
      });
    }
    if (dom.btnOverlayGuide) {
      dom.btnOverlayGuide.addEventListener('click', function () {
        if (activeMode === 'problem') {
          Audio.guide();
          loadCurrentProblem(true);
        }
        this.blur();
      });
    }
    if (dom.btnOverlayMenu) {
      dom.btnOverlayMenu.addEventListener('click', showMenu);
    }

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    root.addEventListener('storage', function () {
      settings = S.loadSettings();
      if (currentView === 'menu') refreshMenuProgress();
      else refreshPbHud();
    });

    var resizeTimer = null;
    root.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (currentView === 'play' && renderer.resize()) {
          renderer.render(engine, performance.now());
        }
      }, 60);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
