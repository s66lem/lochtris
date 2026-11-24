/*========================================================================================
  audio.js — Harmonic Web Audio synth for Lochtris.
  - D-minor / F-major pentatonic deep-loch scale with subtle per-column stereo pan
  - Shared voice budget (MAX_VOICES = 18) & stopGameplay() teardown on pause/menu
  - First-sound replay after AudioContext resume + clean 14ms clear-chord separation
========================================================================================*/
(function (root) {
  'use strict';

  var ctx = null;
  var masterGain = null;
  var limiter = null;
  var noiseBuffer = null;
  var resuming = false;
  var pendingReplay = null;
  var pendingReplayAt = 0;
  var volume = 0.5;
  var lastMoveMs = 0;
  var lastSoftDropMs = 0;

  var MAX_VOICES = 18;
  var gameplayVoices = [];

  var PENTA = [
    293.66, // D4
    349.23, // F4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    698.46, // F5
    783.99, // G5
    880.00, // A5
    1046.50, // C6
    1174.66, // D6
    1396.91, // F6
    1567.98  // G6
  ];

  function nowMs() {
    return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
  }

  function pentaNote(idx) {
    var clamped = Math.max(0, Math.min(PENTA.length - 1, Math.round(idx)));
    return PENTA[clamped];
  }

  function colToPan(col) {
    if (typeof col !== 'number' || !isFinite(col)) return 0;
    return Math.max(-0.32, Math.min(0.32, ((col - 4.5) / 4.5) * 0.30));
  }

  function registerVoice(handle) {
    while (gameplayVoices.length >= MAX_VOICES) {
      var oldest = gameplayVoices.shift();
      if (oldest) oldest.kill();
    }
    gameplayVoices.push(handle);
  }

  function unregisterVoice(handle) {
    var idx = gameplayVoices.indexOf(handle);
    if (idx !== -1) {
      gameplayVoices[idx] = gameplayVoices[gameplayVoices.length - 1];
      gameplayVoices.pop();
    }
  }

  function stopGameplay() {
    pendingReplay = null;
    while (gameplayVoices.length > 0) {
      var v = gameplayVoices.pop();
      if (v) v.kill();
    }
  }

  function ensureContext(replayFn) {
    if (volume <= 0) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
        masterGain = ctx.createGain();
        masterGain.gain.value = volume * 0.56;

        if (typeof ctx.createDynamicsCompressor === 'function') {
          limiter = ctx.createDynamicsCompressor();
          limiter.threshold.value = -6;
          limiter.knee.value = 10;
          limiter.ratio.value = 4;
          limiter.attack.value = 0.003;
          limiter.release.value = 0.08;
          masterGain.connect(limiter);
          limiter.connect(ctx.destination);
        } else {
          masterGain.connect(ctx.destination);
        }
        noiseBuffer = createNoiseBuffer(ctx);
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      if (typeof replayFn === 'function') {
        pendingReplay = replayFn;
        pendingReplayAt = nowMs();
      }
      if (!resuming) {
        resuming = true;
        ctx.resume().then(function () {
          resuming = false;
          var fn = pendingReplay;
          var age = nowMs() - pendingReplayAt;
          pendingReplay = null;
          if (fn && age < 180 && ctx && ctx.state === 'running') fn();
        }, function () {
          resuming = false;
          pendingReplay = null;
        });
      }
      return null;
    }
    return ctx;
  }

  function createNoiseBuffer(audioCtx) {
    var len = Math.floor(audioCtx.sampleRate * 0.14);
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.35);
    }
    return buf;
  }

  function setVolume(pct) {
    volume = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    if (masterGain && ctx && ctx.state === 'running') {
      masterGain.gain.setTargetAtTime(volume * 0.56, ctx.currentTime, 0.01);
    } else if (masterGain) {
      masterGain.gain.value = volume * 0.56;
    }
  }

  function connectDestination(c, node, pan) {
    if (pan && Math.abs(pan) > 0.01 && typeof c.createStereoPanner === 'function') {
      var panner = c.createStereoPanner();
      panner.pan.value = pan;
      node.connect(panner);
      panner.connect(masterGain);
      return panner;
    }
    node.connect(masterGain);
    return null;
  }

  function tone(freq, endFreq, dur, type, gainPeak, delay, attack, pan, isUi) {
    var c = ensureContext();
    if (!c || !masterGain) return;
    var t0 = c.currentTime + (delay || 0);
    var atk = attack || 0.003;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    var panner = connectDestination(c, g, pan);

    var stopped = false;
    var handle = {
      kill: function () {
        if (stopped) return;
        stopped = true;
        try {
          var nowT = c.currentTime;
          if (typeof g.gain.cancelAndHoldAtTime === 'function') {
            g.gain.cancelAndHoldAtTime(nowT);
          } else {
            var curGain = Math.max(0.0001, g.gain.value);
            g.gain.cancelScheduledValues(nowT);
            g.gain.setValueAtTime(curGain, nowT);
          }
          g.gain.setTargetAtTime(0, nowT, 0.0015);
          osc.stop(nowT + 0.012);
        } catch (e) {
          try { osc.stop(); osc.disconnect(); g.disconnect(); if (panner) panner.disconnect(); } catch (e2) {}
        }
      }
    };
    if (!isUi) registerVoice(handle);

    osc.onended = function () {
      stopped = true;
      if (!isUi) unregisterVoice(handle);
      try { osc.disconnect(); g.disconnect(); if (panner) panner.disconnect(); } catch (e) {}
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.015);
  }

  function bell(freq, dur, gainPeak, delay, pan, isUi) {
    tone(freq, freq * 1.003, dur, 'sine', gainPeak, delay, 0.004, pan, isUi);
    tone(freq * 2.004, freq * 1.998, dur * 0.60, 'triangle', gainPeak * 0.22, delay, 0.003, pan, isUi);
  }

  function noiseBurst(dur, filterFreq, gainPeak, q, delay, pan) {
    var c = ensureContext();
    if (!c || !masterGain || !noiseBuffer) return;
    var t0 = c.currentTime + (delay || 0);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.Q.value = q || 1.4;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    var panner = connectDestination(c, g, pan);

    var stopped = false;
    var handle = {
      kill: function () {
        if (stopped) return;
        stopped = true;
        try {
          var nowT = c.currentTime;
          if (typeof g.gain.cancelAndHoldAtTime === 'function') {
            g.gain.cancelAndHoldAtTime(nowT);
          } else {
            var curGain = Math.max(0.0001, g.gain.value);
            g.gain.cancelScheduledValues(nowT);
            g.gain.setValueAtTime(curGain, nowT);
          }
          g.gain.setTargetAtTime(0, nowT, 0.0015);
          src.stop(nowT + 0.012);
        } catch (e) {
          try { src.stop(); src.disconnect(); filter.disconnect(); g.disconnect(); if (panner) panner.disconnect(); } catch (e2) {}
        }
      }
    };
    registerVoice(handle);

    src.onended = function () {
      stopped = true;
      unregisterVoice(handle);
      try { src.disconnect(); filter.disconnect(); g.disconnect(); if (panner) panner.disconnect(); } catch (e) {}
    };
    src.start(t0);
    src.stop(t0 + dur + 0.015);
  }

  var api = {
    unlock: function () { ensureContext(); },
    setVolume: setVolume,
    stopGameplay: stopGameplay,

    move: function (col) {
      var t = nowMs();
      if (t - lastMoveMs < 22) return;
      lastMoveMs = t;
      var run = function () {
        var idx = typeof col === 'number' ? Math.max(0, Math.min(7, Math.round((col + 1) * 0.72))) : 3;
        var f = pentaNote(idx + 2);
        tone(f, f * 0.84, 0.022, 'triangle', 0.12, 0, 0.003, colToPan(col), false);
      };
      if (ensureContext(run)) run();
    },

    wall: function () {
      tone(148, 96, 0.032, 'sine', 0.14);
    },

    rotate: function (isSpin, pieceKey, step) {
      var run = function () {
        if (isSpin) {
          var rootFreq = pieceKey === 'T' ? 587.33 : 523.25;
          bell(rootFreq, 0.16, 0.22, 0, 0, false);
          bell(rootFreq * 1.5, 0.20, 0.16, 0.020, 0, false);
          noiseBurst(0.055, 2600, 0.075, 2.4, 0, 0);
        } else if (step === 2) {
          tone(587.33, 783.99, 0.030, 'triangle', 0.13, 0);
          tone(880.00, 1046.50, 0.034, 'sine', 0.10, 0.018);
        } else {
          var startF = step === -1 ? 523.25 : 587.33;
          var endF = step === -1 ? 698.46 : 783.99;
          tone(startF, endF, 0.025, 'triangle', 0.14);
        }
      };
      if (ensureContext(run)) run();
    },

    softDrop: function () {
      var t = nowMs();
      if (t - lastSoftDropMs < 26) return;
      lastSoftDropMs = t;
      tone(349.23, 293.66, 0.018, 'sine', 0.08);
    },

    hardDrop: function (dy, col) {
      var run = function () {
        var weight = Math.min(1, Math.max(0, (dy || 0) / 16));
        var pan = colToPan(col);
        tone(175 + weight * 28, 52, 0.072 + weight * 0.014, 'triangle', 0.30 + weight * 0.07, 0, 0.003, pan, false);
        noiseBurst(0.044, 1250 + weight * 450, 0.19 + weight * 0.05, 1.5, 0, pan);
      };
      if (ensureContext(run)) run();
    },

    lock: function () {
      tone(220, 138, 0.032, 'triangle', 0.14);
    },

    lockWarn: function () {
      tone(880, 783.99, 0.026, 'sine', 0.10);
    },

    hold: function () {
      tone(440, 587.33, 0.052, 'sine', 0.15);
      tone(698.46, 880, 0.062, 'triangle', 0.09, 0.02);
    },

    holdDenied: function () {
      tone(155, 130, 0.036, 'square', 0.07);
    },

    guideAlign: function () {
      bell(880, 0.085, 0.095, 0, 0, false);
    },

    comboBreak: function () {
      tone(392.00, 293.66, 0.085, 'sine', 0.10, 0);
    },

    countdown: function (isGo) {
      var run = function () {
        if (isGo) {
          bell(587.33, 0.22, 0.22, 0, 0, false);
          bell(880.00, 0.26, 0.20, 0.024, 0, false);
          bell(1174.66, 0.28, 0.15, 0.048, 0, false);
        } else {
          bell(440.00, 0.12, 0.17, 0, 0, false);
        }
      };
      if (ensureContext(run)) run();
    },

    // Delayed by 14ms so hard-drop thump & clear chord never fight the limiter
    lineClear: function (lines, isSpin, isB2B, combo, isPC, b2bStreak) {
      var d0 = 0.014;
      var cStep = Math.min(Math.max(0, combo || 0), 7);
      var b2bBoost = Math.min(4, Math.max(0, b2bStreak || 0));

      if (isPC) {
        var pcNotes = [587.33, 698.46, 880.00, 1046.50, 1174.66, 1396.91];
        for (var i = 0; i < pcNotes.length; i++) {
          bell(pcNotes[i], 0.34, 0.19, d0 + i * 0.040, (i - 2.5) * 0.08, false);
        }
        noiseBurst(0.13, 3200, 0.10, 2.0, d0 + 0.02, 0);
        return;
      }

      if (lines >= 4) {
        var qIdx = Math.min(4, Math.floor(cStep * 0.5));
        bell(pentaNote(qIdx), 0.28, 0.23, d0, -0.10, false);
        bell(pentaNote(qIdx + 2), 0.30, 0.20, d0 + 0.026, 0.10, false);
        bell(pentaNote(qIdx + 4), 0.34, 0.20, d0 + 0.052, 0, false);
        bell(pentaNote(qIdx + 5 + Math.min(2, b2bBoost)), 0.32, 0.14, d0 + 0.080, 0, false);
        noiseBurst(0.10, 2400, 0.09, 1.6, d0, 0);
        if (isB2B) bell(pentaNote(qIdx + 6 + Math.min(2, b2bBoost)), 0.30, 0.13, d0 + 0.105, 0, false);
        return;
      }

      var baseIdx = (isSpin ? 3 : Math.min(3, Math.max(0, lines - 1))) + Math.min(5, cStep);
      bell(pentaNote(baseIdx), 0.18, 0.21, d0, 0, false);
      if (lines >= 2 || isSpin) {
        bell(pentaNote(baseIdx + 2), 0.22, 0.17, d0 + 0.024, 0.08, false);
      }
      if (lines >= 3 || isSpin) {
        bell(pentaNote(baseIdx + 4), 0.25, 0.15, d0 + 0.048, -0.08, false);
        noiseBurst(0.075, 2800, 0.07, 2.1, d0, 0);
      }
      if (isB2B) {
        bell(pentaNote(baseIdx + 5 + Math.min(2, b2bBoost)), 0.24, 0.14, d0 + 0.074, 0, false);
      }
    },

    fail: function () {
      tone(220, 128, 0.14, 'sawtooth', 0.15);
      tone(164.81, 86, 0.20, 'triangle', 0.20, 0.065);
    },

    guide: function () {
      bell(698.46, 0.09, 0.12, 0, 0, true);
    },

    menuMove: function () {
      tone(523.25, 587.33, 0.018, 'sine', 0.08, 0, 0.003, 0, true);
    },

    menuSelect: function () {
      bell(587.33, 0.10, 0.14, 0, 0, true);
      bell(880.00, 0.11, 0.09, 0.022, 0, true);
    }
  };

  root.LochtrisAudio = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
