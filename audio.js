/*========================================================================================
  audio.js — Low-latency Web Audio synth with crisp percussive feedback.
  Interactive latencyHint, coalesced resume, onended node cleanup, and voice rate limits.
========================================================================================*/
(function (root) {
  'use strict';

  var ctx = null;
  var masterGain = null;
  var noiseBuffer = null;
  var resuming = false;
  var volume = 0.5;
  var lastMoveMs = 0;
  var lastSoftDropMs = 0;

  function nowMs() {
    return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
  }

  function ensureContext() {
    if (volume <= 0) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
        masterGain = ctx.createGain();
        masterGain.gain.value = volume * 0.55;
        masterGain.connect(ctx.destination);
        noiseBuffer = createNoiseBuffer(ctx);
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      if (!resuming) {
        resuming = true;
        ctx.resume().then(function () { resuming = false; }, function () { resuming = false; });
      }
      return null; // Don't queue backlog of stale sounds while suspended
    }
    return ctx;
  }

  function createNoiseBuffer(audioCtx) {
    var len = Math.floor(audioCtx.sampleRate * 0.08);
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return buf;
  }

  function setVolume(pct) {
    volume = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    if (masterGain && ctx && ctx.state === 'running') {
      masterGain.gain.setTargetAtTime(volume * 0.55, ctx.currentTime, 0.01);
    } else if (masterGain) {
      masterGain.gain.value = volume * 0.55;
    }
  }

  function tone(freq, endFreq, dur, type, gainPeak, delay) {
    var c = ensureContext();
    if (!c || !masterGain) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.onended = function () {
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.012);
  }

  function noiseBurst(dur, filterFreq, gainPeak) {
    var c = ensureContext();
    if (!c || !masterGain || !noiseBuffer) return;
    var t0 = c.currentTime;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.Q.value = 1.4;
    var g = c.createGain();
    g.gain.setValueAtTime(gainPeak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.onended = function () {
      try { src.disconnect(); filter.disconnect(); g.disconnect(); } catch (e) {}
    };
    src.start(t0);
    src.stop(t0 + dur + 0.012);
  }

  var api = {
    unlock: function () { ensureContext(); },
    setVolume: setVolume,

    move: function () {
      var t = nowMs();
      if (t - lastMoveMs < 26) return;
      lastMoveMs = t;
      tone(520, 410, 0.022, 'triangle', 0.14);
    },

    wall: function () {
      tone(160, 110, 0.032, 'sine', 0.16);
    },

    rotate: function (isSpin, pieceKey) {
      if (isSpin) {
        var base = pieceKey === 'T' ? 680 : 590;
        tone(base, base * 1.58, 0.09, 'triangle', 0.28);
        tone(base * 1.5, base * 2.25, 0.11, 'sine', 0.2, 0.02);
      } else {
        tone(620, 790, 0.028, 'triangle', 0.18);
      }
    },

    softDrop: function () {
      var t = nowMs();
      if (t - lastSoftDropMs < 28) return;
      lastSoftDropMs = t;
      tone(340, 280, 0.018, 'sine', 0.09);
    },

    hardDrop: function () {
      tone(190, 62, 0.075, 'triangle', 0.42);
      noiseBurst(0.045, 1100, 0.26);
    },

    lock: function () {
      tone(240, 140, 0.035, 'triangle', 0.18);
    },

    lockWarn: function () {
      tone(880, 740, 0.025, 'sine', 0.12);
    },

    hold: function () {
      tone(420, 660, 0.055, 'sine', 0.2);
    },

    holdDenied: function () {
      tone(150, 125, 0.04, 'square', 0.09);
    },

    countdown: function (isGo) {
      if (isGo) {
        tone(880, 880, 0.16, 'triangle', 0.28);
        tone(1320, 1320, 0.18, 'sine', 0.2, 0.02);
      } else {
        tone(440, 440, 0.09, 'triangle', 0.2);
      }
    },

    lineClear: function (lines, isSpin, isB2B, combo, isPC) {
      var pitchBoost = Math.pow(1.06, Math.min(Math.max(0, combo || 0), 12));
      if (isPC) {
        var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (var i = 0; i < notes.length; i++) {
          tone(notes[i], notes[i] * 1.005, 0.22, 'triangle', 0.24, i * 0.045);
        }
        return;
      }
      if (lines >= 4) {
        var qBase = 392 * pitchBoost;
        tone(qBase, qBase * 1.01, 0.18, 'triangle', 0.3);
        tone(qBase * 1.25, qBase * 1.26, 0.2, 'triangle', 0.24, 0.03);
        tone(qBase * 1.5, qBase * 1.52, 0.24, 'sine', 0.26, 0.06);
        if (isB2B) tone(qBase * 2.0, qBase * 2.02, 0.22, 'sine', 0.18, 0.09);
        return;
      }
      var base = isSpin ? 440 : (330 + lines * 45);
      base *= pitchBoost;
      tone(base, base * 1.01, 0.14, 'triangle', 0.28);
      tone(base * 1.25, base * 1.26, 0.16, 'sine', 0.2, 0.025);
      if (isSpin || isB2B) {
        tone(base * 1.5, base * 1.52, 0.2, 'triangle', 0.22, 0.05);
      }
      if (isB2B) {
        tone(base * 2.0, base * 2.01, 0.18, 'sine', 0.16, 0.075);
      }
    },

    fail: function () {
      tone(210, 120, 0.14, 'sawtooth', 0.2);
      tone(155, 82, 0.2, 'triangle', 0.24, 0.07);
    },

    guide: function () {
      tone(580, 740, 0.06, 'sine', 0.16);
    },

    menuMove: function () {
      tone(480, 520, 0.018, 'sine', 0.09);
    },

    menuSelect: function () {
      tone(520, 780, 0.055, 'triangle', 0.18);
    }
  };

  root.LochtrisAudio = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
