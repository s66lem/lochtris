/*----------------------------------------------------------------------------------------
 Block Explosions
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
    if (img.src && img.src.includes('b0.png')) {
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
    
    if (src.includes('b0.png')) {
      return;
    }
    
    explodedCount++;

    const backup = document.createElement('img');
    backup.src = 'img/b0.png';
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