/*----------------------------------------------------------------------------------------
  ui pushing
-----------------------------------------------------------------------------------------*/
var _uiPushRAF = null;
var _uiPushState = null;
var _uiHoldOffset = 0; // persistent horizontal offset while holding against wall

function UISetHoldOffset(px, durationMs = 200){
  easing = 'cubic-bezier(0.2,0.8,0.2,1)'
  _uiHoldOffset = px || 0;
  var el = document.getElementById('gb_total') || document.getElementById('perform') || document.body;
  if(!el) return;
  // combine with any transient translateY from UIPush (use 0 if not present)
  var curY = (_uiPushState && typeof _uiPushState._currentY !== 'undefined') ? _uiPushState._currentY : 0;

  // apply a smooth transform transition for the requested duration
  // set transition only for transform and remove it after the duration to avoid interfering with other animations
  el.style.transition = 'transform ' + Math.max(0, durationMs) + 'ms ' + easing;
  el.style.transform = 'translateX(' + _uiHoldOffset + 'px) translateY(' + curY.toFixed(2) + 'px)';

  // clear the transition after it's finished (small buffer)
  clearTimeout(el._uiHoldOffsetTimeout);
  el._uiHoldOffsetTimeout = setTimeout(function(){
    // only clear if this function set the transition (avoid stomping other code)
    try {
      if (el && el.style && el._uiHoldOffsetTimeout) {
        el.style.transition = '';
        el._uiHoldOffsetTimeout = null;
      }
    } catch(e){}
  }, Math.max(0, durationMs) + 20);
}

function UIClearHoldOffset(){
  _uiHoldOffset = 0;
  var el = document.getElementById('gb_total') || document.getElementById('perform') || document.body;
  if(!el) return;
  var curY = (_uiPushState && _uiPushState._currentY) ? _uiPushState._currentY : 0;
  el.style.transform = curY ? 'translateY(' + curY.toFixed(2) + 'px)' : '';
}

var _uiPushRAF = null;
var _uiPushState = null;
function UIPush(amplitudePx, durationMs){
  var el = document.getElementById('gb_total') || document.getElementById('perform') || document.body;
  if(!el) return;
  // cancel existing
  if(_uiPushRAF){
    cancelAnimationFrame(_uiPushRAF);
    _uiPushRAF = null;
  }
  var start = performance.now();
  _uiPushState = { el: el, amp: amplitudePx || 8, dur: durationMs || 200, start: start };
  function loop(now){
    var s = _uiPushState;
    if(!s) return;
    var t = (now - s.start) / s.dur;
    if(t >= 1){
      s.el.style.transform = '';
      _uiPushState = null;
      _uiPushRAF = null;
      return;
    }
    // single smooth down-and-up using sine (0->1)
    var ease = Math.sin(Math.PI * t); // 0..1..0
    var y = s.amp * ease;
    s.el.style.transform = 'translateY(' + y.toFixed(2) + 'px)';
    _uiPushRAF = requestAnimationFrame(loop);
  }
  _uiPushRAF = requestAnimationFrame(loop);
}


/*----------------------------------------------------------------------------------------
  harddrop particles
-----------------------------------------------------------------------------------------*/
_hdParticles = [];
_hdParticlesRAF = null;

function spawnHarddropParticles(cells, color = '#fff', opts = {}) {
  // cells: {col,row} or [{col,row}, ...] in grid coords (0..9, 0..19)
  // opts: {count, life, spread, force, cluster}
  color = gCurMino.palette;
  const cfg = Object.assign({ count: 6, life: 400, spread: 80, force: 220, sizeMin: 2, sizeMax: 4, cluster: 1 }, opts);
  if (!cells) return;
  if (!Array.isArray(cells)) cells = [cells];

  const canvas = document.getElementById('gameboard-canvas');
  const container = document.getElementById('gb') || (canvas && canvas.parentElement);
  if (!canvas || !container) return;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const crect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const cols = 10, rows = 20;
  const cellW = crect.width / cols;
  const cellH = crect.height / rows;

  // Prefer runtime hidden rows detection if available
  const hiddenRows = (Array.isArray(window.gField) && window.gField.length > 0)
    ? Math.max(0, window.gField.length - rows)
    : (typeof window.HIDDEN_ROW_COUNT !== 'undefined' ? window.HIDDEN_ROW_COUNT : 4);


  const candidates = [];
  for (const c of cells) {
    if (typeof c.col !== 'number' || typeof c.row !== 'number') continue;
    // convert to visible row
    let visRow = c.row - hiddenRows;
    if (visRow < 0) visRow = 0;
    // clamp to visible matrix rows
    if (visRow >= rows) visRow = rows - 1;
    candidates.push({ col: c.col, row: visRow });
  }
  if (candidates.length === 0) return;

  // choose up to cfg.count distinct candidate slots (sample without replacement)
  const picks = [];
  const available = candidates.slice();
  const totalToSpawn = Math.max(1, Math.min(cfg.count, Math.max(1, Math.floor(cfg.count))));
  for (let i = 0; i < totalToSpawn; i++) {
    if (available.length === 0) {
      // if we exhausted all cells, allow reusing random ones
      picks.push(candidates[Math.floor(Math.random() * candidates.length)]);
    } else {
      const idx = Math.floor(Math.random() * available.length);
      picks.push(available.splice(idx, 1)[0]);
    }
  }

  // helper to create a single particle at a (px,py) where px/py are relative to container
  function createParticleAt(px, py) {
    const el = document.createElement('div');
    el.className = 'hd-particle';
    const size = Math.round(cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin));
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.background = color || '#fff';
    el.style.opacity = '1';
    el.style.pointerEvents = 'none';
    el.style.position = 'absolute';
    // place center at px,py
    el.style.left = (px - size / 2) + 'px';
    el.style.top = (py - size / 2) + 'px';
    container.appendChild(el);

    const vx = (Math.random() * 2 - 1) * (cfg.spread / 120);
    const vy = - (Math.random() * 0.9 + 0.6) * (cfg.force / 60);
    _hdParticles.push({
      el,
      vx,
      vy,
      life: cfg.life,
      age: 0,
      start: performance.now(),
      size
    });
  }

  // For each picked cell, spawn cluster (usually 1) and offset from center by random angle+radius
  for (const p of picks) {
    const baseCx = crect.left - containerRect.left + (p.col + 0.5) * cellW;
    const baseCy = crect.top - containerRect.top + (p.row + 1) * cellH; // bottom of cell

    for (let k = 0; k < cfg.cluster; k++) {
      // offset so particle is NOT at exact center - radial offset inside cell
      const angle = Math.random() * Math.PI * 2;
      const minR = Math.min(cellW, cellH) * 0.12; // avoid dead center
      const maxR = Math.min(cellW, cellH) * 0.42;
      const radius = minR + Math.random() * (maxR - minR);
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius * 0.6; // slight vertical bias
      createParticleAt(baseCx + dx, baseCy + dy);
    }
  }

  if (!_hdParticlesRAF) _hdStartLoop();
}

function _hdStartLoop() {
  const gravity = 0.5; // px per frame^2 approx
  function loop(now) {
    for (let i = _hdParticles.length - 1; i >= 0; i--) {
      const p = _hdParticles[i];
      const dt = 16.67; // approx ms per frame
      p.age = now - p.start;
      if (p.age >= p.life) {
        p.el.remove();
        _hdParticles.splice(i, 1);
        continue;
      }
      // euler integration
      p.vy += gravity * (dt / 16.67);
      const dx = p.vx * (dt / 16.67);
      const dy = p.vy * (dt / 16.67);
      // update pos using transform for better perf
      const prev = p._pos || { x: parseFloat(p.el.style.left), y: parseFloat(p.el.style.top) };
      const nx = prev.x + dx;
      const ny = prev.y + dy;
      p._pos = { x: nx, y: ny };
      p.el.style.transform = `translate(${nx - parseFloat(p.el.style.left)}px, ${ny - parseFloat(p.el.style.top)}px)`;
      // fade out near end
      const t = p.age / p.life;
      p.el.style.opacity = String(1 - t);
      // slight scale pop
      p.el.style.transform += ` scale(${1 - t * 0.25})`;
    }

    if (_hdParticles.length > 0) {
      _hdParticlesRAF = requestAnimationFrame(loop);
    } else {
      _hdParticlesRAF = null;
    }
  }
  _hdParticlesRAF = requestAnimationFrame(loop);
}










/*----------------------------------------------------------------------------------------
 block explosions
 copyright below
-----------------------------------------------------------------------------------------*/

//implementation of explosion functions 

function cleanExplosion() {
  const gb = document.getElementById('gb');
  if (!gb) return;
  
  const hiddenWrappers = gb.querySelectorAll('div[style*="visibility: hidden"]');
  hiddenWrappers.forEach(wrapper => {
    wrapper.remove();
  });
  
  // clean up any leftover pixellate elements
  const pixelElements = gb.querySelectorAll('.pixellate-pixel');
  pixelElements.forEach(pixel => pixel.remove());
  
  const allImages = gb.querySelectorAll('img');
  allImages.forEach(img => {
    if (img.src && img.src.includes('b0.svg')) {
      // if it has a matrix id (m0_0, m1_5, etc), reset  styling
      if (img.id && img.id.match(/^m\d+_\d+$/)) {
        img.style.position = '';
        img.style.width = '';
        img.style.height = '';
        img.style.zIndex = '';
      } else {
        // remove orphaned backup images without proper IDs
        img.remove();
      }
    }
  });
}

function setExplodeOnFail(enabled) {
  if (!usExplodeOnFail) return;
  try { localStorage.setItem('opt_explode_on_fail', usExplodeOnFail ? '1' : '0'); } catch (e) {}
}
function ensureAnimReady(callback, tries = 40) {
  if (window.jQuery && typeof jQuery.fn.pixellate === 'function') return callback();
  if (tries <= 0) {
    console.warn('anim.js not ready (missing jQuery or pixellate plugin)');
    return;
  }
  setTimeout(() => ensureAnimReady(callback, tries - 1), 50);
}

function explodePlacedCells(options = {}) {
  if (!usExplodeOnFail) return;
  if (!window.jQuery || typeof jQuery.fn.pixellate !== 'function') {
    console.log('jQuery or pixellate not available');
    return;
  }

  const $ = window.jQuery;
  const cfg = Object.assign({ columns: 10, rows: 10, duration: 800, scale: true, direction: 'out' }, options);

  const gb = document.getElementById('gb');

  const imgs = gb.querySelectorAll('img[id^="m"]');
  
  let explodedCount = 0;
  
  imgs.forEach((img, index) => {
    const src = img.getAttribute('src') || '';
    
    if (src.includes('b0.svg')) {
      return;
    }
    
    explodedCount++;

    const backup = document.createElement('img');
    backup.src = 'img/b0.svg';
    backup.id = img.id; // Keep the original ID
    backup.style.position = 'absolute';
    backup.style.width = '24px';
    backup.style.height = '24px';
    backup.style.zIndex = '1';
    
    const originalId = img.id;
    img.removeAttribute('id');
    
    img.parentNode.insertBefore(backup, img);

    // wrap original img so plugin can build pixels over it
    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-block';
    wrapper.style.position = 'relative';
    wrapper.style.width = '24px';
    wrapper.style.height = '24px';
    wrapper.style.zIndex = '2'; 

    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    const $wrapper = $(wrapper);
    
    $wrapper.one('pixellate-exploded', function () {
      wrapper.style.visibility = 'hidden';
      $wrapper.find('.pixellate-pixel').remove();
    });

    $wrapper.pixellate(cfg);
  });
  
  console.log(`Total exploded: ${explodedCount}`);
}


// animation functions


$(function() {
  // Bind events and initialize plugin
  $('.explode')
    .on('pixellate-exploded', function() {
      var self = this;
      setTimeout(function() {
        $(self).pixellate('in');
      }, 500);
    })
    .on('pixellate-imploded', function() {
      var self = this;
      setTimeout(function() {
       $(self).pixellate('out');
      }, 500);
    })
    .pixellate()
});


var pluginName = 'pixellate',
    defaults = {
      // Grid divisions
      columns: 20,
      rows: 20,
      
      // Duration of explosion animation
      duration: 1500,
      
      // Direction of explosion animation ('out', 'in', or 'none')
      direction: 'out',
      
      // Resize pixels during animation
      scale: true,
      
      // Coordinates representing the source of the explosion force
      //(e.g. [-1, 1] makes the explodey bits go up and to the right)
      explosionOrigin: [0,1]
    };

function Plugin(el, options) {
  this.$el = $(el);
  this.options = $.extend({}, defaults, options);
  this._defaults = defaults;
  this._name = pluginName;

  this.init();
};

Plugin.prototype = {
  init: function() {
    if(!this.$el.find('.pixellate-pixel').length) {
      var $img = this.$el.find('img:first-child'),
          img = new Image();
      
      this.$el
        .data('pixellate-image', $img.attr('src'))
        .addClass('pixellate-lock');
      $img.css('visibility', 'hidden');
    
      $(img).one('load', $.proxy(this.createPixels, this));
      img.src = $img.attr('src');
      
      img.src = this.$el.data('pixellate-image');
      if(img.complete) $(img).trigger('load');
    } else {
      this.stylePixels();
    }
  },
  
  createPixels: function() {
    this.$el.append(new Array((this.options.rows * this.options.columns) + 1).join('<span class="pixellate-pixel"></span>'));
    
    this.stylePixels(true);
  },
  
  stylePixels: function(initializeStyles) {
    var self = this,
        w = this.$el.width(),
        h = this.$el.height(),
        columns = this.options.columns,
        rows = this.options.rows,
        $pixels = this.$el.find('.pixellate-pixel');
    
    var styles = initializeStyles ? {
      'position': 'absolute',
      'width': (w / columns),
      'height': (h / rows),
      'background-image': 'url('+this.$el.data('pixellate-image')+')',
      'background-size': w,
      'backface-visibility': 'hidden'
    } : {};
    
    for(var idx = 0; idx < $pixels.length; idx++) {
      var pixelStyles = {};
      
      if(initializeStyles) {
        var x = (idx % columns) * styles.width,
            y = (Math.floor(idx / rows)) * styles.height;
        
        $.extend(pixelStyles, styles, {
          'left': x,
          'top': y,
          'background-position': (-x)+'px '+(-y)+'px'
        });
      }
        
      if(self.options.direction == 'out') {
        var randX = (Math.random() * 300) - 150 - (self.options.explosionOrigin[0] * 150),
            randY = (Math.random() * 300) - 150 - (self.options.explosionOrigin[1] * 150);
        
        var transformString = 'translate('+randX+'px, '+randY+'px)';
        if(self.options.scale) {
          transformString += ' scale('+(Math.random() * 1.5 + 0.5)+')';
        }
        
        $.extend(pixelStyles, {
          'transform': transformString,
          'opacity': 0,
          'transition': self.options.duration+'ms ease-out'
        });
      } else if(self.options.direction == 'in') {
        $.extend(pixelStyles, {
          'transform': 'none',
          'opacity': 1,
          'transition': self.options.duration+'ms ease-in-out'
        });
      }

      $pixels.eq(idx).css(pixelStyles);
    }

    // Use rAF to ensure styles are set before class is modified
    requestAnimationFrame(function() {
      if(self.options.direction == 'out') {
        self.$el.removeClass('pixellate-lock');
      } else if(self.options.direction == 'in') {
        self.$el.one('pixellate-imploded', function() {
          self.$el.addClass('pixellate-lock');
        });
      }
    });
    
    // Fire plugin events after animation completes
    // TODO: Use transition events when supported
    
    setTimeout(function() {
      if(self.options.direction == 'out') {
        // Hide the original image after explosion
        self.$el.find('img').css('visibility', 'hidden');
        self.$el.trigger('pixellate-exploded');
      } else if(self.options.direction == 'in') {
        self.$el.trigger('pixellate-imploded');
      }
    }, this.options.duration);
  }
};

$.fn[ pluginName ] = function ( options ) {
  return this.each(function() {
    if ( !$.data( this, "plugin_" + pluginName ) ) {
      $.data( this, "plugin_" + pluginName, new Plugin( this, options ) );
    } else if(typeof options === 'string') {
      $.data( this, "plugin_" + pluginName ).options.direction = options;
      $.data( this, "plugin_" + pluginName ).init();
    }
  });
};


// requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
// MIT license
var lastTime = 0;
var vendors = ['ms', 'moz', 'webkit', 'o'];
for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
  window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
  window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
}

if (!window.requestAnimationFrame)
  window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
        timeToCall);
      lastTime = currTime + timeToCall;
      return id;
  };

if (!window.cancelAnimationFrame)
  window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
  };


/*----------------------------------------------------------------------------------------
Copyright (c) 2025 by ahron (https://codepen.io/ahronmoshe/pen/ZKWPBb)
Fork of an original work Image Explosion (https://codepen.io/ScottPolhemus/pen/DvpYaL

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO 
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF, 
OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

----------------------------------------------------------------------------------------*/