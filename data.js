/*========================================================================================
□■ data.js ■□
========================================================================================*/
/*----------------------------------------------------------------------------------------
☆★ Constant list ★☆
----------------------------------------------------------------------------------------*/
var MATRIX_WIDTH = 10;               // Number of horizontal blocks in the matrix

var DEADLINE_HEIGHT = 3;             // The height at which block information is held above the deadline

var MATRIX_HEIGHT = 23;              // Number of vertical blocks in the matrix. Includes more than deadlines

var SOFT_DROP_SPAN = 1;              // <Frame> Time to proceed to 1 square with soft drop

var NATURAL_DROP_SPAN = 50;          // <Frame> Time to advance to 1 square when natural falls

var LINE_CLEAR_DURATION = 1;        // <Frame> Line Erase Performance Time

var DISPLAY_FEATURES_DURATION = 45;  // <Frame> Display time for the triggered move

var LOCK_DELAY_DURATION = 50;      // <Frame> Time it takes from the moment mino reaches the deadline to the moment it is locked - - - - - - - - !!!!!

var LOCK_DELAY_INPUTMAX = 15;  // <Rotation> Maximum number of rotations/movements during lock delay before locked - - - - - - - - - - - - - - - !!!!!

var NEXT_MINOS = 5;                  // Next display number

var ROTATE_RULES = 5;                // Number of rotation rules

var HORIZONTAL_CHARGE_DURATION = 7;  // <Frame> Time from the start of pressing the key to the start of horizontal movement repeat

var HORIZONTAL_REPEAT_SPAN = 1;      // <Frame> Time sense of lateral movement



var INITIAL_DIR = 0;                  // Mino's orientation when it appears

var INITIAL_X = 3;                    // The X coordinate of the mino at the time of appearance

var INITIAL_Y = DEADLINE_HEIGHT - 2;  // Y coordinate of mino when it appeared


var DEFAULT_KEY_MOVE_LEFT    = 'arrowleft';
var DEFAULT_KEY_MOVE_RIGHT   = 'arrowright';
var DEFAULT_KEY_SOFTDROP     = 'arrowdown';
var DEFAULT_KEY_HARDDROP     = 'space';
var DEFAULT_KEY_ROTATE_RIGHT = 'arrowup';
var DEFAULT_KEY_ROTATE_LEFT  = 'ctrl';
var DEFAULT_KEY_HOLD         = 'c';
var DEFAULT_KEY_GUIDE        = 'r';
var DEFAULT_KEY_ROTATE_180  = 'shift'; 
var DEFAULT_DAS = 9;
var DEFAULT_ARR = 3;
var DEFAULT_SDF = 25; // Soft drop speed


var DUMP_GUIDE_DATA = false;            // For guide array dump


var SECTION_NUM = 21;            // For guide array dump

console.log('feel free to look around the code,\ni pinky promise i\'m not stealing your data, \ni hate javascript too much to even try to figure out how to do that \nsincerely,\ns6lem');

/*----------------------------------------------------------------------------------------
☆★ Matrix array [y][x] ★☆

An arrangement of installed blocks. Falling blocks etc. will be managed separately.
----------------------------------------------------------------------------------------*/
var gMatrix = [];
for(var i = 0; i < MATRIX_HEIGHT; i++){
  gMatrix.push([]);
  for(var j = 0; j < MATRIX_WIDTH; j++){
    gMatrix[i].push(0);
  }
}
/*----------------------------------------------------------------------------------------
☆★ Object: Various blocks ★☆
----------------------------------------------------------------------------------------*/
function Block(id){
  this.id = id;
  this.toVanish = (id == 2);           // blocks being erased


  switch(id){
    case 0: // Vacant (w/ grid)
    case 3: // Empty

    this.passable = true;    // Can you slip through?

    break;
    case 1:  // Grey Block

    this.passable = false;
    break;
    case 2:  // Blocks undergoing an erasure. RemoveReservedLines is erased at once

    

    this.passable = true;
    break;

    // Each other block

    case 11: case 12: case 13: case 14: case 15: case 16: case 17:
    case 31: 
    case 41: case 42: case 43: case 44: case 45: case 46: case 47:
    case 51: case 52: case 53: case 54: case 55: case 56: case 57:
    this.passable = false;
    break;
    // If other numbers (non-existent blocks) do not cache images

    default:
    this.passable = false;
    return;
  }

  this.image = 'img/b' + id + '.svg';  // image. 24 x 24 pixels

  this.cache = new Image();
  this.cache.src = this.image;
}
/*----------------------------------------------------------------------------------------
☆★ Access to block objects ★☆
----------------------------------------------------------------------------------------*/
var gBlocks = [];
//for(var i = 0; i <= 57; i++) gBlocks.push(new Block(i));

for(var i = 0; i <= 57; i++) gBlocks.push(new Block(i));
function BlkEmpty(){return gBlocks[0] }
function BlkVanishing(){return gBlocks[2] }

/*----------------------------------------------------------------------------------------
☆★ Object: Preview Images ★☆
----------------------------------------------------------------------------------------*/
function PreviewImg(id){
    switch(id){
        case 1: this.image = 'img/imino.svg'; break;
        case 2: this.image = 'img/tmino.svg'; break;
        case 3: this.image = 'img/jmino.svg'; break;
        case 4: this.image = 'img/lmino.svg'; break;
        case 5: this.image = 'img/zmino.svg'; break;
        case 6: this.image = 'img/smino.svg'; break;
        case 7: this.image = 'img/omino.svg'; break;
        default: this.image = 'img/b3.svg'; break;
    }
    
    // pre-rasterize preview imgs
    this.canvas = document.createElement('canvas');
    this.canvas.width = 80;
    this.canvas.height = 60;
    this.ctx = this.canvas.getContext('2d');
    
    this.cache = new Image();
    this.cache.onload = () => {
        // rasterize to canvas
        this.ctx.clearRect(0, 0, 80, 60);
        this.ctx.drawImage(this.cache, 0, 0, 80, 60);
    };
    this.cache.src = this.image;
}
function GetPreviewImage(mino) {
    if (!mino) return "img/b3.svg";
    
    const previewImg = gPreviewImg[mino.id];
    if (previewImg && previewImg.canvas) {
        // Return data URL of pre-rasterized canvas
        return previewImg.canvas.toDataURL();
    }
    
    // Fallback
    switch(mino.id) {
        case 1: return "img/imino.svg";
        case 2: return "img/tmino.svg";
        case 3: return "img/jmino.svg";
        case 4: return "img/lmino.svg";
        case 5: return "img/zmino.svg";
        case 6: return "img/smino.svg";
        case 7: return "img/omino.svg";
        default: return "img/b3.svg";
    }
}

var gPreviewImg = [];
for(var i = 0; i <= 7; i++) gPreviewImg.push(new PreviewImg(i));

/*----------------------------------------------------------------------------------------
☆★ Object: General Rotation Rules (ROTation RULE -GENeral) ★☆
----------------------------------------------------------------------------------------*/
function RotRuleGen(){
  // [Rotation direction (0=right, 1=left)][Mode of mino before rotation (0=on appearance, 1=right, 2=reverse, 3=left)][Rule ID]

  this.dx = 
  [[[0, -1, -1,  0, -1],    // i → r

  [0,  1,  1,  0,  1],    // r → v

  [0,  1,  1,  0,  1],    // v → l

  [0, -1, -1,  0, -1]],   // l → i

  [[0,  1,  1,  0,  1],    // i → l

  [0,  1,  1,  0,  1],    // r → i

  [0, -1, -1,  0, -1],    // v → r

  [0, -1, -1,  0, -1]]];  // l → v

  this.dy = [[[0,  0, -1,  2,  2],    // i → r

  [0,  0,  1, -2, -2],    // r → v

  [0,  0, -1,  2,  2],    // v → l

  [0,  0,  1, -2, -2]],   // l → i

  [[0,  0, -1,  2,  2],    // i → l

  [0,  0,  1, -2, -2],    // r → i

  [0,  0, -1,  2,  2],    // v → r

  [0,  0,  1, -2, -2]]];  // l → v

  this.dx180 = [
  // [from][rule#]
  // 0: spawn→rev, 1: right→left, 2: rev→spawn, 3: left→right
  [0,  1, -1,  0,  2, -2,  1, -1,  0], // 0->2
  [0,  1, -1,  0,  2, -2,  1, -1,  0], // 1->3
  [0,  1, -1,  0,  2, -2,  1, -1,  0], // 2->0
  [0,  1, -1,  0,  2, -2,  1, -1,  0], // 3->1
  ];
  this.dy180 = [
  [0,  0,  0,  1,  0,  0, -1, -1, -2], // 0->2
  [0,  0,  0, -1,  0,  0,  1,  1,  2], // 1->3
  [0,  0,  0, -1,  0,  0,  1,  1,  2], // 2->0
  [0,  0,  0,  1,  0,  0, -1, -1, -2], // 3->1
  ];


  return this;
}
/*----------------------------------------------------------------------------------------
☆★ Object: I ROTation RULE -I ★☆
----------------------------------------------------------------------------------------*/
function RotRuleI(){
  // [Rotation direction (0=right, 1=left)][Mode of mino before rotation (0=on appearance, 1=right, 2=reverse, 3=left)][Rule ID]

  this.dx = [[[0, -2,  1, -2,  1],    // i → r

  [0, -1,  2, -1,  2],    // r → v

  [0,  2, -1,  2, -1],    // v → l

  [0,  1, -2,  1, -2]],   // l → i

  [[0, -1,  2, -1,  2],    // i → l

  [0,  2, -1,  2, -1],    // r → i

  [0,  1, -2,  1, -2],    // v → r

  [0, -2,  1, -2,  1]]];  // l → v

  this.dy = [[[0,  0,  0,  1, -2],    // i → r

  [0,  0,  0, -2,  1],    // r → v

  [0,  0,  0, -1,  2],    // v → l

  [0,  0,  0,  2, -1]],   // l → i

  [[0,  0,  0, -2,  1],    // i → l

  [0,  0,  0, -1,  2],    // r → i

  [0,  0,  0,  2, -1],    // v → r

  [0,  0,  0,  1, -2]]];  // l → v

  this.dx180 = [
  [0, -2,  1, -2,  1,  0,  0,  0,  0], // 0->2
  [0,  2, -1,  2, -1,  0,  0,  0,  0], // 1->3
  [0,  2, -1,  2, -1,  0,  0,  0,  0], // 2->0
  [0, -2,  1, -2,  1,  0,  0,  0,  0], // 3->1
  ];
  this.dy180 = [
  [0,  0,  0,  1, -1,  2, -2,  3, -3], // 0->2
  [0,  0,  0, -1,  1, -2,  2, -3,  3], // 1->3
  [0,  0,  0, -1,  1, -2,  2, -3,  3], // 2->0
  [0,  0,  0,  1, -1,  2, -2,  3, -3], // 3->1
];



  return this;
}
/*----------------------------------------------------------------------------------------
☆★ Access settings for each rotation rule ★☆
----------------------------------------------------------------------------------------*/
var gRotationRuleGeneral = new RotRuleGen();
var gRotationRuleI = new RotRuleI();
/*----------------------------------------------------------------------------------------
☆★ Object: Various Minoh ★☆
----------------------------------------------------------------------------------------*/
function IMino(){
  this.id = 1;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[0, 0, 0, 0],
  [1, 1, 1, 1],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 0, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 0]],

  [[0, 0, 0, 0],
  [0, 0, 0, 0],
  [1, 1, 1, 1],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 0, 0]]];
  this.activeBlockId = 11;            // falling
  this.placedBlockId = 11;            // placed
  this.ghostBlockId  = 31;            // ghost 
  this.guideBlockId  = 41;            // guide on black bg
  this.ghostGuideBlockId = 51;        // guide on ghost bg
  this.rotationRule = gRotationRuleI;
  this.palette = '#32B484'; // I mino color
  return this;
}
//----------------------------------------------------------------------------------------
function TMino(){
  this.id = 2;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[0, 1, 0, 0],
  [1, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]],

  [[0, 0, 0, 0],
  [1, 1, 1, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 12;
  this.placedBlockId = 12;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 42;
  this.ghostGuideBlockId = 52;
  this.rotationRule = gRotationRuleGeneral;
  this.palette = '#A53E9B';
  return this;
}
//----------------------------------------------------------------------------------------
function JMino(){
  this.id = 3;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[1, 0, 0, 0],
  [1, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 1, 0],
  [0, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]],

  [[0, 0, 0, 0],
  [1, 1, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [0, 1, 0, 0],
  [1, 1, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 13;
  this.placedBlockId = 13;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 43;
  this.ghostGuideBlockId = 53;
  this.rotationRule = gRotationRuleGeneral;
  this.palette = '#6553BB';
  return this;
}
//----------------------------------------------------------------------------------------
function LMino(){
  this.id = 4;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[0, 0, 1, 0],
  [1, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0]],

  [[0, 0, 0, 0],
  [1, 1, 1, 0],
  [1, 0, 0, 0],
  [0, 0, 0, 0]],

  [[1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 14;
  this.placedBlockId = 14;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 44;
  this.ghostGuideBlockId = 54;
  this.rotationRule = gRotationRuleGeneral;
  this.palette = '#C3AC49';
  return this;
}
//----------------------------------------------------------------------------------------
function ZMino(){
  this.id = 5;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[1, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 0, 1, 0],
  [0, 1, 1, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]],

  [[0, 0, 0, 0],
  [1, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [1, 1, 0, 0],
  [1, 0, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 15;
  this.placedBlockId = 15;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 45;
  this.ghostGuideBlockId = 55;
  this.rotationRule = gRotationRuleGeneral;
  this.palette = '#C24047';
  return this;
}
//----------------------------------------------------------------------------------------
function SMino(){
  this.id = 6;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[0, 1, 1, 0],
  [1, 1, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 0]],

  [[0, 0, 0, 0],
  [0, 1, 1, 0],
  [1, 1, 0, 0],
  [0, 0, 0, 0]],

  [[1, 0, 0, 0],
  [1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 16;
  this.placedBlockId = 16;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 46;
  this.ghostGuideBlockId = 56;
  this.rotationRule = gRotationRuleGeneral;
  this.palette = '#92C044';
  return this;
}
//----------------------------------------------------------------------------------------
function OMino(){
  this.id = 7;
  // [Mino orientation (0=on occurrence, 1=right, 2=reverse, 3=left)][ Y coordinate][ X coordinate]

  this.shape = [[[0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]],

  [[0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]]];
  this.activeBlockId = 17;
  this.placedBlockId = 17;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 47;
  this.ghostGuideBlockId = 57;
  this.rotationRule = gRotationRuleGeneral;  // It's not necessary but for convenience
  this.palette = '#C3AC49';

  return this;
}
/*----------------------------------------------------------------------------------------
★☆ Block position used for T-SPIN judgment ☆★

Called from within TsType in ttt.js. [dir][y][x]
If more than three of the 1 locations (4 locations each) cannot pass, it is judged as T-SPIN.
----------------------------------------------------------------------------------------*/
var gTsTiles = [[[1, 0, 1, 0],
[0, 0, 0, 0],
[1, 0, 1, 0],
[0, 0, 0, 0]],
[[1, 0, 1, 0],
[0, 0, 0, 0],
[1, 0, 1, 0],
[0, 0, 0, 0]],
[[1, 0, 1, 0],
[0, 0, 0, 0],
[1, 0, 1, 0],
[0, 0, 0, 0]],
[[1, 0, 1, 0],
[0, 0, 0, 0],
[1, 0, 1, 0],
[0, 0, 0, 0]]];
/*----------------------------------------------------------------------------------------
★☆ Block position used for T-SPIN MINI judgment ☆★

Called from within TsType in ttt.js. [dir][y][x]
//-------------------------
If T-SPIN is true, it is determined whether it is a normal T-SPIN or a T-SPIN MINI.
If two locations marked 1 (two locations each) cannot pass through, then the T-SPIN is placed, otherwise the T-SPIN
It is judged as MINI. Exceptionally, if you rotate the fifth candidate just before, it will not become a T-SPIN MINI.
(TST wind rotation, "T-SPIN FIN" etc.).
----------------------------------------------------------------------------------------*/
var gTssTiles = [[[1, 0, 1, 0],
[0, 0, 0, 0],
[0, 0, 0, 0],
[0, 0, 0, 0]],
[[0, 0, 1, 0],
[0, 0, 0, 0],
[0, 0, 1, 0],
[0, 0, 0, 0]],
[[0, 0, 0, 0],
[0, 0, 0, 0],
[1, 0, 1, 0],
[0, 0, 0, 0]],
[[1, 0, 0, 0],
[0, 0, 0, 0],
[1, 0, 0, 0],
[0, 0, 0, 0]]];
/*----------------------------------------------------------------------------------------
☆★ Access settings for each mino ★☆
----------------------------------------------------------------------------------------*/
var I = new IMino();
var T = new TMino();
var J = new JMino();
var L = new LMino();
var Z = new ZMino();
var S = new SMino();
var O = new OMino();
var gMino = [null, I, T, J, L, Z, S, O];
/*----------------------------------------------------------------------------------------
☆★ Object: Guide ★☆

Mino will automatically choose what you are currently running.
----------------------------------------------------------------------------------------*/
function Guide(mino, dir, x, y){
  this.mino = mino;
  this.dir = dir;
  this.x = x;
  this.y = y;  // Do not include deadlines

}
/*----------------------------------------------------------------------------------------
☆★ Simplified description of guide object generation ★☆
----------------------------------------------------------------------------------------*/
function G(mino, dir, x, y){
  return new Guide(mino, dir, x, y);
}
/*----------------------------------------------------------------------------------------
☆★ Get section name ★☆

Gets the <id>th section name. If you edit this, don't forget to reflect it in index.html.
----------------------------------------------------------------------------------------*/
function SectionTitle(id){
  switch(id){
    case  0: return '[1] Creating the Template (w/ Guide)'; break;
    case  1: return '[2] Vertical I-Mino, 14 patterns (w/ Guide)'; break;
    case  2: return '[3] Vertical I-Mino, 20q'; break;
    case  3: return '[4] I-Mino 1st Layer, 6 patterns (w/ Guide)'; break;
    case  4: return '[5] I-Mino 1st Layer, 20q'; break;
    case  5: return '[6] I-Mino 3rd Layer, Flat Placement, 4 patterns (w/ Guide)'; break;
    case  6: return '[7] I-Mino 3rd Layer, Flat Placement, 20q'; break;
    case  7: return '[8] IILO, 2 patterns (w/ Guide)'; break;
    case  8: return '[9] IILO, 10q'; break;
    case  9: return '[10] 3rd Layer I-Mino, 3 patterns (w/ Guide)'; break;
    case 10: return '[11] 3rd Layer I-Mino, 20q'; break;
    case 11: return '[12] Midterm Test 20q'; break;
    case 12: return '[13] LSIO type 1 pattern (w/ Guide)'; break;
    case 13: return '[14] LSIO type 12q'; break;
    case 14: return '[15] Final Exam, 30q'; break;
    case 15: return '[16] Graduation test (+mirror q\'s) 100q'; break;
    case 16: return '[17] Skimming Patterns'; break;
    case 17: return '[18] Vertical I-Mino, 514q'; break;
    case 18: return '[19] Horizontal I-Mino, 196q'; break;
    case 19: return '[20] All 711q'; break;
    case 20: return '[21] 711q mirror (Not Checked)'; break;
  }
  return "?";
}
