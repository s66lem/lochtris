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

var LINE_CLEAR_DURATION = 15;        // <Frame> Line Erase Performance Time

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
var DEFAULT_SDF = 15; // Soft drop speed


var DUMP_GUIDE_DATA = true;            // For guide array dump


var SECTION_NUM = 21;            // For guide array dump


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
  this.toVanish = (id == 2);           // Blocks reserved for erasure?


  switch(id){
    case 0:  // Vacant

    this.passable = true;    // Can you slip through?

    break;
    case 1:  // Grey Block

    this.passable = false;
    break;
    case 2:  // Blocks undergoing an erasure. RemoveReservedLines is erased at once

    this.passable = true;
    break;
    // Each installed block

    case 21: case 22: case 23: case 24: case 25: case 26: case 27:
    this.passable = false;
    break;
    // Each other block

    case 11: case 12: case 13: case 14: case 15: case 16: case 17:
    case 31: case 32: case 33: case 34: case 35: case 36: case 37:
    case 41: case 42: case 43: case 44: case 45: case 46: case 47:
    case 51: case 52: case 53: case 54: case 55: case 56: case 57:
    case 511: case 512: case 513: case 514: case 515: case 516: case 517:
    case 521: case 522: case 523: case 524: case 525: case 526: case 527:
    case 531: case 532: case 533: case 534: case 535: case 536: case 537:
    case 541: case 542: case 543: case 544: case 545: case 546: case 547:
    case 551: case 552: case 553: case 554: case 555: case 556: case 557:
    case 561: case 562: case 563: case 564: case 565: case 566: case 567:
    case 571: case 572: case 573: case 574: case 575: case 576: case 577:
    this.passable = false;
    break;
    // If other numbers (non-existent blocks) do not cache images

    default:
    this.passable = false;
    return;
  }

  this.image = 'img/b' + id + '.png';  // image. 24 x 24 pixels

  this.cache = new Image();
  this.cache.src = this.image;
}
/*----------------------------------------------------------------------------------------
☆★ Access to block objects ★☆
----------------------------------------------------------------------------------------*/
var gBlocks = [];
//for(var i = 0; i <= 57; i++) gBlocks.push(new Block(i));

for(var i = 0; i <= 577; i++) gBlocks.push(new Block(i));
function BlkEmpty(){return gBlocks[0] }
function BlkVanishing(){return gBlocks[2] }
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
  this.activeBlockId = 11;
  this.placedBlockId = 21;
  this.ghostBlockId  = 31;
  this.guideBlockId  = 41;
  this.ghostGuideBlockId = 51;
  this.rotationRule = gRotationRuleI;
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
  this.placedBlockId = 22;
  this.ghostBlockId  = 32;
  this.guideBlockId  = 42;
  this.ghostGuideBlockId = 52;
  this.rotationRule = gRotationRuleGeneral;
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
  this.placedBlockId = 23;
  this.ghostBlockId  = 33;
  this.guideBlockId  = 43;
  this.ghostGuideBlockId = 53;
  this.rotationRule = gRotationRuleGeneral;
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
  this.placedBlockId = 24;
  this.ghostBlockId  = 34;
  this.guideBlockId  = 44;
  this.ghostGuideBlockId = 54;
  this.rotationRule = gRotationRuleGeneral;
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
  this.placedBlockId = 25;
  this.ghostBlockId  = 35;
  this.guideBlockId  = 45;
  this.ghostGuideBlockId = 55;
  this.rotationRule = gRotationRuleGeneral;
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
  this.placedBlockId = 26;
  this.ghostBlockId  = 36;
  this.guideBlockId  = 46;
  this.ghostGuideBlockId = 56;
  this.rotationRule = gRotationRuleGeneral;
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
  this.placedBlockId = 27;
  this.ghostBlockId  = 37;
  this.guideBlockId  = 47;
  this.ghostGuideBlockId = 57;
  this.rotationRule = gRotationRuleGeneral;  // It's not necessary but for convenience

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
