/*========================================================================================
  storage.js — Persistent settings, keybinds, per-problem PBs, and progress tracking.
  Honors in-memory overrides/tombstones when disk writes fail (quota/private mode),
  safely snapshots legacy cookies once, and stays synced across browser tabs.
========================================================================================*/
(function (root) {
  'use strict';

  var SETTINGS_KEY = 'lochtris_v2_settings';
  var PROGRESS_KEY = 'lochtris_v2_progress';
  var PBS_KEY = 'lochtris_v2_pbs';
  var MIGRATED_KEY = 'lochtris_v2_migrated';

  var memOverrides = Object.create(null); // string value or null (tombstone)

  function safeGet(key) {
    if (Object.prototype.hasOwnProperty.call(memOverrides, key)) {
      return memOverrides[key];
    }
    try {
      return root.localStorage ? root.localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    var str = String(value);
    memOverrides[key] = str;
    try {
      if (root.localStorage) {
        root.localStorage.setItem(key, str);
        delete memOverrides[key];
      }
    } catch (e) {
      // Keep in-memory override active when disk write fails
    }
  }

  function safeRemove(key) {
    memOverrides[key] = null;
    try {
      if (root.localStorage) {
        root.localStorage.removeItem(key);
        delete memOverrides[key];
      }
    } catch (e) {
      // Keep tombstone active when disk remove fails
    }
  }

  function snapshotCookies() {
    var map = Object.create(null);
    var raw = '';
    try {
      if (typeof document !== 'undefined' && document.cookie) raw = String(document.cookie);
    } catch (e) {
      return map;
    }
    if (!raw) return map;
    var parts = raw.split(';');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq <= 0) continue;
      var k = parts[i].slice(0, eq).trim();
      var v = parts[i].slice(eq + 1);
      try { k = decodeURIComponent(k); } catch (e1) {}
      try { v = decodeURIComponent(v); } catch (e2) {}
      if (!Object.prototype.hasOwnProperty.call(map, k)) map[k] = v;
    }
    return map;
  }

  // Recognize literal ' ' BEFORE trimming so legacy Space cookies migrate cleanly
  function legacyKeyToCode(legacy) {
    if (typeof legacy !== 'string' || legacy.length === 0) return null;
    if (legacy === ' ') return 'Space';
    var k = legacy.trim().toLowerCase();
    var map = {
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      space: 'Space',
      ctrl: 'ControlLeft',
      control: 'ControlLeft',
      shift: 'ShiftLeft',
      alt: 'AltLeft',
      enter: 'Enter',
      backspace: 'Backspace',
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      ';': 'Semicolon',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '-': 'Minus',
      '=': 'Equal'
    };
    if (map[k]) return map[k];
    if (k.length === 1 && k >= 'a' && k <= 'z') return 'Key' + k.toUpperCase();
    if (k.length === 1 && k >= '0' && k <= '9') return 'Digit' + k;
    if (/^f([1-9]|1[0-2])$/.test(k)) {
      var fCode = k.toUpperCase();
      var reserved = root.LochtrisData && root.LochtrisData.RESERVED_KEY_CODES;
      return (reserved && reserved[fCode]) ? null : fCode;
    }
    return null;
  }

  function formatKeyCode(code) {
    if (!code) return '---';
    var map = {
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      Space: 'SPACE',
      ControlLeft: 'L-CTRL',
      ControlRight: 'R-CTRL',
      ShiftLeft: 'L-SHIFT',
      ShiftRight: 'R-SHIFT',
      AltLeft: 'L-ALT',
      AltRight: 'R-ALT',
      MetaLeft: 'L-META',
      MetaRight: 'R-META',
      Backspace: 'BKSP',
      Escape: 'ESC',
      Enter: 'ENTER',
      Tab: 'TAB',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backslash: '\\',
      BracketLeft: '[',
      BracketRight: ']',
      Minus: '-',
      Equal: '=',
      Backquote: '`'
    };
    if (map[code]) return map[code];
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Numpad') === 0) return 'NUM ' + code.slice(6);
    return code.toUpperCase();
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function getDefaults() {
    var D = root.LochtrisData;
    return {
      keys: Object.assign({}, D.DEFAULT_KEYS),
      handling: Object.assign({}, D.DEFAULT_HANDLING),
      visuals: Object.assign({}, D.DEFAULT_VISUALS)
    };
  }

  function sanitizeSettings(raw) {
    var D = root.LochtrisData;
    var def = getDefaults();
    var out = {
      keys: Object.assign({}, def.keys),
      handling: Object.assign({}, def.handling),
      visuals: Object.assign({}, def.visuals)
    };
    if (!raw || typeof raw !== 'object') return out;

    if (raw.keys && typeof raw.keys === 'object') {
      var used = Object.create(null);
      var actions = Object.keys(def.keys);
      var candidate = Object.assign({}, def.keys);
      var allValid = true;
      for (var i = 0; i < actions.length; i++) {
        var act = actions[i];
        var val = raw.keys[act];
        if (typeof val === 'string' && val.length > 0 && !D.RESERVED_KEY_CODES[val]) {
          candidate[act] = val;
        }
      }
      for (var j = 0; j < actions.length; j++) {
        var c = candidate[actions[j]];
        if (used[c]) { allValid = false; break; }
        used[c] = true;
      }
      if (allValid) out.keys = candidate;
    }

    if (raw.handling && typeof raw.handling === 'object') {
      var h = raw.handling;
      if (isFinite(Number(h.das))) out.handling.das = Math.round(clamp(Number(h.das), 1, 20) * 10) / 10;
      if (isFinite(Number(h.arr))) out.handling.arr = Math.round(clamp(Number(h.arr), 0, 5) * 10) / 10;
      if (isFinite(Number(h.dcd))) out.handling.dcd = Math.round(clamp(Number(h.dcd), 0, 20) * 10) / 10;
      if (isFinite(Number(h.sdf))) out.handling.sdf = Math.round(clamp(Number(h.sdf), 5, 41));
      if (h.irs === 'off' || h.irs === 'tap' || h.irs === 'hold') out.handling.irs = h.irs;
      if (h.ihs === 'off' || h.ihs === 'tap' || h.ihs === 'hold') out.handling.ihs = h.ihs;
      if (h.spinRule === 't-spins' || h.spinRule === 'all-mini+' || h.spinRule === 'all') out.handling.spinRule = h.spinRule;
      if (typeof h.sprintCountdown === 'boolean') out.handling.sprintCountdown = h.sprintCountdown;
      if (typeof h.cancelDasOnDirChange === 'boolean') out.handling.cancelDasOnDirChange = h.cancelDasOnDirChange;
      if (typeof h.preserveDasOnSpawn === 'boolean') out.handling.preserveDasOnSpawn = h.preserveDasOnSpawn;
    }

    if (raw.visuals && typeof raw.visuals === 'object') {
      var v = raw.visuals;
      if (v.skin === 'modern' || v.skin === 'flat' || v.skin === 'neon') out.visuals.skin = v.skin;
      if (isFinite(Number(v.bounce))) out.visuals.bounce = Math.round(clamp(Number(v.bounce), 0, 100));
      if (typeof v.particles === 'boolean') out.visuals.particles = v.particles;
      if (typeof v.explodeOnFail === 'boolean') out.visuals.explodeOnFail = v.explodeOnFail;
      if (isFinite(Number(v.ghostOpacity))) out.visuals.ghostOpacity = Math.round(clamp(Number(v.ghostOpacity), 0, 100));
      if (isFinite(Number(v.gridOpacity))) out.visuals.gridOpacity = Math.round(clamp(Number(v.gridOpacity), 0, 100));
      if (typeof v.textOverlay === 'boolean') out.visuals.textOverlay = v.textOverlay;
      if (typeof v.showFps === 'boolean') out.visuals.showFps = v.showFps;
      if (isFinite(Number(v.sfxVolume))) out.visuals.sfxVolume = Math.round(clamp(Number(v.sfxVolume), 0, 100));
    }

    return out;
  }

  function migrateLegacyIfNeeded() {
    if (safeGet(MIGRATED_KEY) === '1') return;

    var cookies = snapshotCookies();
    var settings = getDefaults();
    var hadLegacySettings = false;

    var keyMap = [
      ['MoveLeft', 'left'],
      ['MoveRight', 'right'],
      ['SoftDrop', 'softDrop'],
      ['HardDrop', 'hardDrop'],
      ['RotateRight', 'rotCW'],
      ['RotateLeft', 'rotCCW'],
      ['Hold', 'hold'],
      ['Guide', 'guide'],
      ['Rotate180', 'rot180']
    ];
    for (var i = 0; i < keyMap.length; i++) {
      var code = legacyKeyToCode(cookies[keyMap[i][0]]);
      if (code) {
        settings.keys[keyMap[i][1]] = code;
        hadLegacySettings = true;
      }
    }

    if (cookies.DAS !== undefined && isFinite(parseFloat(cookies.DAS))) { settings.handling.das = parseFloat(cookies.DAS); hadLegacySettings = true; }
    if (cookies.ARR !== undefined && isFinite(parseFloat(cookies.ARR))) { settings.handling.arr = parseFloat(cookies.ARR); hadLegacySettings = true; }
    if (cookies.SDF !== undefined && isFinite(parseFloat(cookies.SDF))) { settings.handling.sdf = parseFloat(cookies.SDF); hadLegacySettings = true; }
    if (cookies.Explosions !== undefined) { settings.visuals.explodeOnFail = cookies.Explosions === '1'; hadLegacySettings = true; }
    if (cookies.TextOverlay !== undefined) { settings.visuals.textOverlay = cookies.TextOverlay === '1'; hadLegacySettings = true; }

    if (hadLegacySettings && !safeGet(SETTINGS_KEY)) {
      safeSet(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
    }

    var progress = { sections: {}, problems: {} };
    var hadProgress = false;
    var secCount = (root.LochtrisData && root.LochtrisData.SECTION_NUM) || 24;
    for (var s = 0; s < secCount; s++) {
      if (cookies['Prg' + s] === '1') {
        progress.sections[String(s)] = true;
        hadProgress = true;
      }
    }
    if (hadProgress && !safeGet(PROGRESS_KEY)) {
      safeSet(PROGRESS_KEY, JSON.stringify(progress));
    }

    safeSet(MIGRATED_KEY, '1');
  }

  function loadSettings() {
    migrateLegacyIfNeeded();
    var raw = safeGet(SETTINGS_KEY);
    if (!raw) return getDefaults();
    try {
      return sanitizeSettings(JSON.parse(raw));
    } catch (e) {
      return getDefaults();
    }
  }

  function saveSettings(settings) {
    var clean = sanitizeSettings(settings);
    safeSet(SETTINGS_KEY, JSON.stringify(clean));
    return clean;
  }

  function loadProgress() {
    migrateLegacyIfNeeded();
    var raw = safeGet(PROGRESS_KEY);
    if (!raw) return { sections: {}, problems: {} };
    try {
      var parsed = JSON.parse(raw);
      return {
        sections: (parsed && parsed.sections && typeof parsed.sections === 'object') ? parsed.sections : {},
        problems: (parsed && parsed.problems && typeof parsed.problems === 'object') ? parsed.problems : {}
      };
    } catch (e) {
      return { sections: {}, problems: {} };
    }
  }

  function loadPBs() {
    var raw = safeGet(PBS_KEY);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  var _progressCache = null;
  var _pbsCache = null;

  function invalidateCaches() {
    _progressCache = null;
    _pbsCache = null;
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', function (ev) {
      if (!ev || !ev.key || ev.key === PROGRESS_KEY || ev.key === PBS_KEY || ev.key === SETTINGS_KEY) {
        invalidateCaches();
      }
    });
  }

  function ensureCaches() {
    if (!_progressCache) _progressCache = loadProgress();
    if (!_pbsCache) _pbsCache = loadPBs();
  }

  function isSectionCleared(sectionId) {
    ensureCaches();
    return Boolean(_progressCache.sections[String(sectionId)]);
  }

  function markSectionCleared(sectionId) {
    ensureCaches();
    if (!_progressCache.sections[String(sectionId)]) {
      _progressCache.sections[String(sectionId)] = true;
      safeSet(PROGRESS_KEY, JSON.stringify(_progressCache));
    }
  }

  function isProblemCleared(storageId) {
    ensureCaches();
    return Boolean(_progressCache.problems[String(storageId)]);
  }

  function markProblemCleared(storageId) {
    ensureCaches();
    var k = String(storageId);
    if (!_progressCache.problems[k]) {
      _progressCache.problems[k] = true;
      safeSet(PROGRESS_KEY, JSON.stringify(_progressCache));
    }
  }

  function getPB(storageId) {
    ensureCaches();
    var v = _pbsCache[String(storageId)];
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  }

  function recordPB(storageId, timeMs) {
    if (!isFinite(timeMs) || timeMs <= 0) return { isNewPB: false, pb: getPB(storageId), delta: null };
    ensureCaches();
    var k = String(storageId);
    var prev = getPB(k);
    var rounded = Math.round(timeMs);
    if (prev === null || rounded < prev) {
      _pbsCache[k] = rounded;
      safeSet(PBS_KEY, JSON.stringify(_pbsCache));
      return { isNewPB: true, pb: rounded, prev: prev, delta: prev !== null ? rounded - prev : null };
    }
    return { isNewPB: false, pb: prev, prev: prev, delta: rounded - prev };
  }

  function resetAllProgress() {
    _progressCache = { sections: {}, problems: {} };
    _pbsCache = {};
    safeRemove(PROGRESS_KEY);
    safeRemove(PBS_KEY);
  }

  root.LochtrisStorage = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getDefaults: getDefaults,
    sanitizeSettings: sanitizeSettings,
    formatKeyCode: formatKeyCode,
    isSectionCleared: isSectionCleared,
    markSectionCleared: markSectionCleared,
    isProblemCleared: isProblemCleared,
    markProblemCleared: markProblemCleared,
    getPB: getPB,
    recordPB: recordPB,
    resetAllProgress: resetAllProgress,
    invalidateCaches: invalidateCaches
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.LochtrisStorage;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
