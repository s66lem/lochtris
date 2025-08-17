/*========================================================================================
 □■ ttt.js ■□
========================================================================================*/
// user settings
var usExplodeOnFail; // explode pieces on fail
var usTextOverlay; // show text overlay
/*----------------------------------------------------------------------------------------
 ☆★ Global variable list ★☆
----------------------------------------------------------------------------------------*/
var gButton;          // The name of the button that was pressed. Initialized (empty string assigned) at the end of the frame

var gLyrSections;     // Section selection layer (LaYeR)

var gLyrPerform;      // Game Layer

var gLyrPreferences;  // Settings Layer

var gScene;           // Scene name

var gPrevScene;       // Scene name in the previous frame ( PREVious SCENE )
/*
● Scene structure
 select_sections ⇔ preferences
   ↓↑
 Perform
*/
var gKeys;            // Key name

var gSelectForms = ['key_left', 'key_right', 'key_softdrop', 'key_harddrop',
                    'key_rot_right', 'key_rot_left' , 'key_hold' , 'key_guide', 'key_rot_180'];  // Key Selection Box Name
/*
 When adding keys, you can add them to LoadData() and SavePreferences() and also to Key**() (the key name
 Don't forget to add the get method) and the setting select box。
*/

var gCurSectionId;    // Section ID for Selected (CURrent)

var gCurProblemId;    // Selecting Issue ID

var gCurProblem;      // Selected Problem Object

var gCurProblemReq;   // Problem quota

var gQueue;           // Next row

var gCurMino;
var gCurHold;
var gCurUseGuideFlg   // Whether to use the guide

var gCurX;
var gCurY;
var gCurDir;
var gNdCount;         // ( Natural Drop COUNT )

var gDfCount;         // ( Display Features COUNT )

var gCurGuide;        // Current Guide

var gGuidesQueue;     // Guide array


var gLineClearCount;  // Counting the line erasure performance

var gTSpinType;       // 0= T No spin, 1= T spin mini, 2= T spin

var gRens;            // Ongoing REN (Combo) number

var gIsReadyToB2b;    // Could the next be BACK to BACK?

var gIsEditingSlider = false;

// lock delay vars 2 cause i fucking HATE JAVASCRIPT FUCK YOU JAVASCRIPT DIE
var lockDelay = 0;                              // frames since piece landed
var lockDelayLimit = LOCK_DELAY_DURATION;       // max frames before locking
var manipulations = 0;                          // number of inputs after reaching lowestY
var manipulationLimit = LOCK_DELAY_INPUTMAX;    // max inputs before locking
var lowestY = 0;                              // tracks lowest y pos the mino has reached



var sClearedProblems = []; // for loading cleared % and avg time to complete



/*----------------------------------------------------------------------------------------
 ☆★ Access settings for each problem ★☆

 Problem data is listed in problem.js etc.
----------------------------------------------------------------------------------------*/
var gProblems = getProblems();
var gCurProgmeIdList = [];
var gProblemsCleared = [];
for(var i = 0; i < SECTION_NUM; i++){
  gProblemsCleared[i] = false;
}

/*----------------------------------------------------------------------------------------
 ☆★ Initialization ★☆

 It is called only once at startup. The number of frames that have passed is treated as 0.
----------------------------------------------------------------------------------------*/
function Setup(){
  SetupLayers();
  
  // Initialize canvas gameboard with a longer delay to ensure DOM is ready
  setTimeout(() => {
    if (typeof InitializeCanvas === 'function') {
      console.log("Starting canvas initialization from Setup...");
      InitializeCanvas();
    } else {
      console.error("InitializeCanvas function not available");
    }
  }, 500);
  
  gButton = '';
  gPrevScene = '';
  gScene = 'select_section';
  LoadData();
  loadClearedProblems();
  updateSectionTitles();
}


/*----------------------------------------------------------------------------------------
 ☆★ Layer initialization ★☆

 Layer sizes etc. are defined in a css file, and the contents are defined in HTML.
----------------------------------------------------------------------------------------*/
function SetupLayers(){
  gLyrSections = new Layer('list_sections');
  gLyrPerform = new Layer('perform');
  gLyrPreferences = new Layer('preferences');
}
/*----------------------------------------------------------------------------------------
 ☆★ Prefs Page ★☆

 uhhh its got the buttons to listen for keybinds and shii
----------------------------------------------------------------------------------------*/

function KeyDisplayer(arr) {
    switch(arr.toLowerCase()){
      case 'control':
        return 'CTRL';
      case 'space':
      case ' ':
        return 'SPACE';
      default:
        return arr.toUpperCase();
    }
  }

function normalizeKeyName(key) {
  // Normalize key names to match ToKc expectations
  switch (key.toLowerCase()) {
    case " ": case "Space": return "space";
    // Add more as needed
    default:
      return key.toLowerCase();
  }
}

function setupKeyButtons() {
  const keyMap = [
    { id: 'key_left_btn', idx: 0 },
    { id: 'key_right_btn', idx: 1 },
    { id: 'key_softdrop_btn', idx: 2 },
    { id: 'key_harddrop_btn', idx: 3 },
    { id: 'key_rot_left_btn', idx: 4 },
    { id: 'key_rot_right_btn', idx: 5 },
    { id: 'key_hold_btn', idx: 6 },
    { id: 'key_guide_btn', idx: 7 },
    { id: 'key_rot_180_btn', idx: 8 }
  ];
  keyMap.forEach(({ id, idx }) => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.textContent = KeyDisplayer(gKeys[idx]);
    btn.onclick = () => {
      btn.textContent = "PRESS KEY";
      const onKeyDown = (e) => {
        e.preventDefault();
        let key = e.key
        let normalizedKey = normalizeKeyName(key);
        gKeys[idx] = normalizedKey;
        let keyDisplay = KeyDisplayer(key);
        btn.textContent = keyDisplay;
        document.removeEventListener("keydown", onKeyDown);
      };
      document.addEventListener("keydown", onKeyDown);
    };
  });
}
// sliders

function SetupSliderDisplays() {
  const dasSlider = document.getElementById('das_slider');
  const arrSlider = document.getElementById('arr_slider');
  const sdfSlider = document.getElementById('sdf_slider');
  const dasValue = document.getElementById('das_value');
  const arrValue = document.getElementById('arr_value');
  const sdfValue = document.getElementById('sdf_value');


  if (dasSlider) {
    const invertedDas = parseFloat(dasSlider.max) - window.KEY_CHARGE_DURATION + parseFloat(dasSlider.min);
    dasSlider.value = invertedDas;
  }
  if (arrSlider) {
    const invertedArr = parseFloat(arrSlider.max) - window.KEY_REPEAT_SPAN + parseFloat(arrSlider.min);
    arrSlider.value = invertedArr;
  }
  if (sdfSlider) {
    sdfSlider.value = window.SOFT_DROP_FACTOR;
  }

  if (dasSlider && dasValue) {
    dasSlider.oninput = function() {
      const invertedValue = parseFloat(this.max) - parseFloat(this.value) + parseFloat(this.min);
      dasValue.innerHTML = `<span class="slider-value-number">${invertedValue.toFixed(1)}</span>`;
    };
    dasValue.innerHTML = `<span class="slider-value-number">${window.KEY_CHARGE_DURATION.toFixed(1)}</span>`;
  }

  if (arrSlider && arrValue) {
    arrSlider.oninput = function() {
      const invertedValue = parseFloat(this.max) - parseFloat(this.value) + parseFloat(this.min);
      arrValue.innerHTML = `<span class="slider-value-number">${invertedValue.toFixed(1)}</span>`;
    };
    arrValue.innerHTML = `<span class="slider-value-number">${window.KEY_REPEAT_SPAN.toFixed(1)}</span>`;
  }

  if (sdfSlider && sdfValue) {
    sdfSlider.oninput = function() {
      sdfValue.innerHTML = `<span class="slider-value-number">${this.value}</span>`;
    };
    sdfValue.innerHTML = `<span class="slider-value-number">${window.SOFT_DROP_FACTOR}</span>`;
  }
  
  makeSliderValueEditable('arr_slider', 'arr_value', 0.0, 5.0, 0.1);
  makeSliderValueEditable('das_slider', 'das_value', 1.0, 20.0, 0.1);
  makeSliderValueEditable('sdf_slider', 'sdf_value', 5, 40, 1);
}

function makeSliderValueEditable(sliderId, valueId, min, max, step) {
  const slider = document.getElementById(sliderId);
  const valueSpan = document.getElementById(valueId);

  if (!slider || !valueSpan) return;

  valueSpan.addEventListener('click', function() {
    if (valueSpan.querySelector('input')) return;
    
    gIsEditingSlider = true;
    
    const currentValue = valueSpan.querySelector('.slider-value-number').textContent.trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = min;
    input.max = max;
    input.step = step;
    input.className = 'slider-value-edit-input';
    input.style.width = '50px';
    
    const originalContent = valueSpan.innerHTML;
  
    valueSpan.innerHTML = '';
    valueSpan.appendChild(input);
    
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    const originalHandler = slider.oninput;
    slider.oninput = null;
    
    function finishEdit(apply) {
      gIsEditingSlider = false;
      slider.oninput = originalHandler;
      
      if (apply && !isNaN(input.value)) {
        let v = Math.max(min, Math.min(max, parseFloat(input.value)));
        v = Math.round(v / step) * step;
        if (sliderId === 'arr_slider' || sliderId === 'das_slider') {
          slider.value = (parseFloat(slider.max) - v + parseFloat(slider.min)).toFixed(1);
        } else {
          slider.value = v;
        }
        slider.dispatchEvent(new Event('input'));
      } else {
        valueSpan.innerHTML = originalContent;
      }
    }
    
    // Handle events
    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', function(e) {
      e.stopPropagation(); // Prevent game handlers from catching keys
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEdit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(false);
      }
    });
    input.addEventListener('click', e => e.stopPropagation());
  });
}

function setupCheckboxes() {
  const explosionCheckbox = document.getElementById('cb_explosion_effects');
    if (explosionCheckbox) {
      explosionCheckbox.checked = usExplodeOnFail;
      explosionCheckbox.addEventListener('change', function() {
        usExplodeOnFail = this.checked;
        Save('Explosions', usExplodeOnFail ? '1' : '0'); 
      });
    }
  const textOverlayCheckbox = document.getElementById('cb_text_overlay');
  if (textOverlayCheckbox) {
    textOverlayCheckbox.checked = usTextOverlay;
    textOverlayCheckbox.addEventListener('change', function() {
      usTextOverlay = this.checked;
      Save('TextOverlay', usTextOverlay ? '1' : '0');
    });
  }
}

/*----------------------------------------------------------------------------------------
 ☆★ Load ★☆

 Load settings and progress from cookies.
----------------------------------------------------------------------------------------*/
function LoadData(){
  // Loading Key Settings

  gKeys = [];
  gKeys.push(Load('MoveLeft', DEFAULT_KEY_MOVE_LEFT));
  gKeys.push(Load('MoveRight', DEFAULT_KEY_MOVE_RIGHT));
  gKeys.push(Load('SoftDrop', DEFAULT_KEY_SOFTDROP));
  gKeys.push(Load('HardDrop', DEFAULT_KEY_HARDDROP));
  gKeys.push(Load('RotateRight', DEFAULT_KEY_ROTATE_RIGHT));
  gKeys.push(Load('RotateLeft', DEFAULT_KEY_ROTATE_LEFT));
  gKeys.push(Load('Hold', DEFAULT_KEY_HOLD));
  gKeys.push(Load('Guide', DEFAULT_KEY_GUIDE));
  gKeys.push(Load('Rotate180', DEFAULT_KEY_ROTATE_180));
  // Loading progress

  for(var i = 0; i < SECTION_NUM; i++){
    gProblemsCleared[i] = (Load('Prg' + i, '0') == '1');
  }
  RefreshHeaderClearedStatus();

  window.KEY_CHARGE_DURATION = parseFloat(Load('DAS', 9.0));
  window.KEY_REPEAT_SPAN = parseFloat(Load('ARR', 3.0));
  window.SOFT_DROP_FACTOR = parseFloat(Load('SDF', 25));
  usExplodeOnFail = Load('Explosions', '0') === '1';
  usTextOverlay = Load('TextOverlay', '1');
  
}
/*----------------------------------------------------------------------------------------
 ☆★ Intra-frame processing ★☆

 This is a process that is called once per frame. Frame management is done using jsmod.js.
----------------------------------------------------------------------------------------*/
function Main(){
  // If the scene changes, switch

  if(gPrevScene != gScene){
    TerminateScene(gPrevScene);
    SetupScene(gScene);
    //Updated "Previous Scene"

    gPrevScene = gScene;
  }
  PerformScene(gScene);
  gButton = '';
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene begins ★☆
----------------------------------------------------------------------------------------*/
function SetupScene(scene){
  switch(scene){
  case 'select_section':
    resetStats();
    gLyrSections.Show();
    RefreshProblemButtons();
    gCurUseGuideFlg = false;
    break;
  case 'perform':
    UpdateManipulationIndicators();
    gCurMino = null;
    gCurHold = null;
    PrepareProblem();
    Refresh();
    gLyrPerform.Show();
    displayPB(gCurProblem);
    window.scroll(0, 0);    // Scroll to the top
    setOverlay('', '', false);

    break;
  case 'perform_falling':
    setOverlay('', '', false);
    break;
  case 'perform_failed':
    pauseTimer();
    Refresh();
    Say('perform_hint', 'Press Any Key to Retry');
    Say('perform_caption', 'Fail…');
    setOverlay('Fail', 'press any key to retry', true);
    if (usExplodeOnFail) {
      requestAnimationFrame(() => ensureAnimReady(() => explodePlacedCells()));
    }
    break;
  case 'perform_cleared':
    pauseTimer();
    savePB(sElapsedTime);
    Refresh();
    gCurUseGuideFlg = false;
    var curProblemId = gCurProgmeIdList[gCurProblemId];
    Say('perform_caption', 'Clear!');
    setOverlay('Clear!', 'press any key to continue', true);
    break;
  case 'perform_guide':
    Refresh();
    gCurUseGuideFlg = true;
    Say('perform_hint', 'press any key to start');
    Say('perform_caption', 'Guide Mode');
    break;
  case 'preferences':
    // key settings display
    setupKeyButtons();
    SetupSliderDisplays();
    setupCheckboxes();
    gLyrPreferences.Show();
    window.scroll(0, 0);    // scroll to the top

    break;
  default:
    gScene = 'select_section';
    break;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene ends ★☆
----------------------------------------------------------------------------------------*/
function TerminateScene(scene){
  switch(scene){
  case 'select_section':
    gLyrSections.Hide();
    break;
  case 'perform':
    if(gScene == 'select_section') gLyrPerform.Hide();
    break;
  case 'perform_falling':
    if(gScene == 'select_section') gLyrPerform.Hide();
    break;
  case 'perform_failed':
    if(gScene == 'select_section') gLyrPerform.Hide();
    break;
  case 'perform_cleared':
    if(gScene == 'select_section' || gScene == 'select_section') gLyrPerform.Hide();
    break;
  case 'perform_guide':
    if(gScene == 'select_section') gLyrPerform.Hide();
    break;
  case 'preferences':
    gLyrPreferences.Hide();
    break;
  }
}

/*----------------------------------------------------------------------------------------------
 ☆★ fun caption overlay thing while i procrastinate implementing the section overall stats ★☆
----------------------------------------------------------------------------------------------*/
  function setOverlay(title, subtitle, show = true) {
  if (!usTextOverlay) return;
  const el = document.getElementById('gb-overlay');
  if (!el) return;
  el.textContent = title;
  el.style.display = show ? 'flex' : 'none';
  if (title.includes('Fail')) {
  el.style.color = '#ff3232';
  }

  const subEl = document.getElementById('gb-overlaysub');
  if (subEl) {
    subEl.textContent = subtitle;
    subEl.style.display = show ? 'block' : 'none';
  }
}


/*----------------------------------------------------------------------------------------
 ☆★ Scene processing ★☆
----------------------------------------------------------------------------------------*/
function PerformScene(scene){
  switch(scene){
  case 'select_section':
    SceneSelectSection();
    break;
  case 'perform':
    ScenePerform();
    break;
  case 'perform_falling':
    ScenePerformFalling();
    break;
  case 'perform_failed':
    ScenePerformFailed();
    break;
  case 'perform_guide':
    ScenePerformGuideMode();
    break;
  case 'perform_cleared':
    ScenePerformCleared();
    break;
  case 'preferences':
    ScenePreferences();
    break;
  default:
    gScene = 'select_section';
    break;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Problem preparation ★☆
----------------------------------------------------------------------------------------*/
function PrepareProblem(){

  var curProblemId = gCurProgmeIdList[gCurProblemId];
  gCurProblem = gProblems[curProblemId];

  // Deep copy of quota sequence

  gCurProblemReq = [];
  for(var i = 0; i < gCurProblem.req.length; i++){
    gCurProblemReq.push(gCurProblem.req[i]);
  }

  // Intelligence statement

  DisplayCaption();
  RefreshHint();
  getPB();
  
  // Matrix preparation

  for(var i = 0; i < DEADLINE_HEIGHT; i++){
    for(var j = 0; j < MATRIX_WIDTH; j++){
      gMatrix[i][j] = 0;
    }
  }
  for(var i = DEADLINE_HEIGHT; i < MATRIX_HEIGHT; i++){
    for(var j = 0; j < MATRIX_WIDTH; j++){
      gMatrix[i][j] = gCurProblem.initialBlocks[i - DEADLINE_HEIGHT][j];
    }
  }
  // Next Preparation

  gQueue = [];
  gGuidesQueue = [];
  gCurHold = gCurProblem.ingredients[0][0];
  for(var i = 1; i < gCurProblem.ingredients.length; i++){
    gQueue.push(gCurProblem.ingredients[i]);
  }
  for(var i = 0; i < gCurProblem.guides.length; i++){
    gGuidesQueue.push(gCurProblem.guides[i]);
  }
  // Various flag initialization

  gLineClearCount = -1;
  gTSpinType = 0;
  gRens = -1;
  gIsReadyToB2b = false;
  displayPB(gCurProblem);
}
/*----------------------------------------------------------------------------------------
 ☆★ Display problem title ★☆
----------------------------------------------------------------------------------------*/
function DisplayCaption(){
  var curProblemId = gCurProgmeIdList[gCurProblemId];
//  var caption = " " + String(Number(gCurProblemId) + 1) + "/" + gCurProgmeIdList.length + "  ";

  var caption = SectionTitle(gCurSectionId);
  // caption += gCurProblem.caption;
  Say("perform_caption", caption);
  DisplayProbInfo();



}

function DisplayProbInfo(){
  var curProblemId = gCurProgmeIdList[gCurProblemId];

  // displaying question #
  const questionnum = document.getElementById("svQuestions");
  questionnum.textContent = `${gCurProblemId + 1}/${gCurProgmeIdList.length}`;


  // displaying pattern #
  const patternnum = document.getElementById("svPatterns");
  patternnum.textContent = gCurProblem.caption;
}

/*----------------------------------------------------------------------------------------
 ☆★ Send the next ★☆

 Returns whether the next existed.
----------------------------------------------------------------------------------------*/
function Dequeue(){
  if(gQueue.length == 0 && !gCurHold) return false;

  if(gQueue.length > 0){
    gCurMino = gQueue.shift();
  }else{
    gCurMino = gCurHold;
    gCurHold = null;
  }
  gCurGuide = gGuidesQueue.shift();
  gCurDir = INITIAL_DIR;
  gCurX = INITIAL_X;
  gCurY = INITIAL_Y;
  
  gNdCount = NATURAL_DROP_SPAN;
  ResetLockDelay();
  RefreshHint();
  lowestY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
  return true;
}
/*----------------------------------------------------------------------------------------
 ☆★ Reflects hint display ★☆
----------------------------------------------------------------------------------------*/
function RefreshHint(){
  var hint = gCurProblem.hint;
  if(gCurGuide && (gCurProblem.useGuide || gCurUseGuideFlg)){
    hint += '\n (Please follow the guide)';
  }
  Say('perform_hint', hint);
}
/*----------------------------------------------------------------------------------------
 ☆★ Description of section name ★☆
----------------------------------------------------------------------------------------*/
function RefreshSectionTitle(){
  Say('section_title', SectionTitle(gCurSectionId));
}
/*----------------------------------------------------------------------------------------
 ☆★ Reflects clear status on buttons ★☆
----------------------------------------------------------------------------------------*/
function RefreshProblemButtons(){
  for(var i = 0; i < SECTION_NUM; i++){
    // if(gProblemsCleared[i])  ShowImage('clear'+ i);
    var btn = document.getElementById('section' + (i + 1));
    //if(!btn) continue;
    if(gProblemsCleared[i]){
      btn.classList.add('section-btn-cleared');
    }else{
      
      //btn.classList.remove('section-btn-cleared');
    }
  }
  
}
function RefreshHeaderClearedStatus() {
  const groups = [
    //problems in each section
    { headerId: 'group1', sectionIds: [1] },
    { headerId: 'group2', sectionIds: [2, 3] },
    { headerId: 'group3', sectionIds: [4, 5, 6, 7, 8, 9, 10, 11] },
    { headerId: 'group4', sectionIds: [12] },
    { headerId: 'group5', sectionIds: [13, 14] },
    { headerId: 'group6', sectionIds: [15, 16] },
    { headerId: 'group7', sectionIds: [17, 18, 19, 20, 21] }
  ];

  for (const group of groups) {
    const allCleared = group.sectionIds.every(idx => gProblemsCleared[idx - 1]);
    const header = document.getElementById(group.headerId);
    if (header) {
      if (allCleared) {
        header.classList.add('header-all-cleared');
      } else {
        header.classList.remove('header-all-cleared');
      }
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ I HATE JAVASCRIPT DUMB STUPID PIECE OF SHIT ★☆
----------------------------------------------------------------------------------------*/

function getSectionPlaylist(sectionID) {
  return;
  switch(sectionID) {
    case 1: return    getProblemIdList(WARMING_UP);
    case 2: return    getProblemIdList(GUIDANCE_VERTICAL);
    case 3: return    getProblemIdList(PROB840_VERTICAL);
    case 4: return    getProblemIdList(GUIDANCE_HORIZONTAL_1);
    case 5: return    getProblemIdList(PROB840_HORIZONTAL_1);
    case 6: return    getProblemIdList(GUIDANCE_HORIZONTAL_LAYDOWN);
    case 7: return    getProblemIdList(PROB840_HORIZONTAL_LAYDOWN);
    case 8: return    getProblemIdList(GUIDANCE_HORIZONTAL_IILO);
    case 9: return    getProblemIdList(PROB840_HORIZONTAL_IILO);
    case 10: return   getProblemIdList(GUIDANCE_HORIZONTAL_3);
    case 11: return   getProblemIdList(PROB840_HORIZONTAL_3);
    case 12: return   getProblemIdList(PROB840_HORIZONTAL_1)
                      .concat(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN))
                      .concat(getProblemIdList(PROB840_HORIZONTAL_IILO))
                      .concat(getProblemIdList(PROB840_HORIZONTAL_3));
    case 13: return   getProblemIdList(GUIDANCE_LSIO);
    case 14: return   getProblemIdList(PROB840_LSIO);
    case 15: return   getProblemIdList(PROB840);
    case 16: return   getProblemIdList(PROB840)
                      .concat(getProblemIdList(PROB840_MIRROR));
    case 17: return   getProblemIdList(GUIDANCE_OTHER_WISE);
    case 18: return   getProblemIdList(PROB840_VERTICAL);
    case 19: return   getProblemIdList(PROB840_HORIZONTAL_1)
                      .concat(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN))
                      .concat(getProblemIdList(PROB840_HORIZONTAL_IILO))
                      .concat(getProblemIdList(PROB840_HORIZONTAL_3));
    case 20: return   getProblemIdList(PROB840);
    case 21: return   getProblemIdList(PROB840_MIRROR);
    default: return [];
  }
}



function normalizeProblemId(id) {
  return; // fuck you javascript
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  if (typeof id === 'object' && id) return getProblemStorageId(id);
  if (typeof id === 'string') {
    // Extract first number (handles "G42", "42", etc.)
    const m = id.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}


function getProblemById(id) {
  return; // stupid dumb piece of shit
  const key = normalizeProblemId(id);
  if (key == null) return null;

  const direct = gProblems[key];
  if (direct) return direct;

  if (Array.isArray(gProblems)) {
    for (const prob of gProblems) {
      if (!prob) continue;
      const sid = getProblemStorageId(prob);
      if (sid === key || prob.id === key) return prob;
    }
  } else {
    for (const k in gProblems) {
      const prob = gProblems[k];
      if (!prob) continue;
      const sid = getProblemStorageId(prob);
      if (sid === key || prob.id === key) return prob;
    }
  }
  return null;
}

function getProblemStorageId(p) {
  if (typeof p === 'object') {
    // Prefer a numeric/source id if present, else fallback to id
    return (p.storageId);
  }
  return p.storageId;
}
 
function markCleared(problem) {
  return; // this is a fucking mess and i hate it
  const storageId = getProblemStorageId(problem);
  problem.cleared = true;
  localStorage.setItem('cleared_' + storageId, 'true');
}

function loadClearedProblems() {
  return; // this is a fucking mess and i hate it2
  for (let sectionID = 1; sectionID <= SECTION_NUM; sectionID++) {
    const playlist = getSectionPlaylist(sectionID);
    for (let i = 0; i < playlist.length; i++) {
      const problem = playlist[i];
      if (problem) {
        const isCleared = localStorage.getItem('cleared_' + getProblemStorageId(problem)) === 'true';
        if (isCleared) {
          problem.cleared = true;
        }
      }
    }
  }
  updateSectionTitles(); 
}

function getClearedProblems(sectionID) {
  return;
  const playlist = getSectionPlaylist(sectionID);
  if (!playlist || playlist.length === 0) return 'Nonexistant';

  const cleared = [];
  for (const p of playlist) {
    const storageId = getProblemStorageId(p);
    console.log(`${getProblemById(storageId)}: ${localStorage.getItem('cleared_' + storageId)} storage: ${storageId}`);
    if (localStorage.getItem('cleared_' + storageId) === 'true' || p.cleared) {
      cleared.push(storageId);
    }
  }
  return cleared.join(', ');
}

function updateSectionTitles() {
  return; // OH MY GOD I HATE JAVASCRIPT IT SHOULD NOT BE THIS FUCKING HARD TO RETURN ALL THE FUCKING CLEARED PROBLEMS IN A SECTION
  for (let i = 1; i <= SECTION_NUM; i++) {
    const section = document.getElementById(`section${i}`);
    if (section) {
      section.title = `Cleared Problems: ${getClearedProblems(i)}`;
    }
  }
}

// M updateSectionTitles();

/*----------------------------------------------------------------------------------------
 ☆★ Scene: Select section ★☆
----------------------------------------------------------------------------------------*/
function SceneSelectSection(){
  switch(gButton){
  case 'preferences':
    gScene = 'preferences';
    return;
  }
  if(gButton.match(/^section[0-9]+$/)){
    gCurSectionId = parseInt(gButton.substring(7)) - 1;
    gCurProblemId = 0;

    switch(gButton){
    case 'section1':  /* Let's create a template */
      gCurProgmeIdList = getProblemIdList(WARMING_UP);
      break;
    case 'section2':  /* I Vertical placement (with guide)*/
      gCurProgmeIdList = getProblemIdList(GUIDANCE_VERTICAL);
      break;
    case 'section3':  /* I vertically positioned random 30 questions */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840_VERTICAL))).slice(0,20);
      break;
    case 'section4':  /* First move I Minno 1st stage (with guide) */
      gCurProgmeIdList = getProblemIdList(GUIDANCE_HORIZONTAL_1);
      break;
    case 'section5':  /* First move I Minno first stage */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840_HORIZONTAL_1))).slice(0,20);
      break;
    case 'section6':  /* All set aside (with guide) */
      gCurProgmeIdList = getProblemIdList(GUIDANCE_HORIZONTAL_LAYDOWN);
      break;
    case 'section7':  /* Let it all go to sleep */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN))).slice(0,20);
      break;
    case 'section8':  /* I I L O (with guide) */
      gCurProgmeIdList = getProblemIdList(GUIDANCE_HORIZONTAL_IILO);
      break;
    case 'section9':  /* I l o */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840_HORIZONTAL_IILO))).slice(0,10);
      break;
    case 'section10':  /* First move I, 3rd stage of mino (with guide) */
      gCurProgmeIdList = getProblemIdList(GUIDANCE_HORIZONTAL_3);
      break;
    case 'section11':  /* First move I Minno 3rd stage */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840_HORIZONTAL_3))).slice(0,20);
      break;
    case 'section12':  /* Midterm Test 20 Questions */
      var array1 = shuffle(getProblemIdList(PROB840_HORIZONTAL_1));
      var array2 = shuffle(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN));
      var array3 = shuffle(getProblemIdList(PROB840_HORIZONTAL_IILO));
      var array4 = shuffle(getProblemIdList(PROB840_HORIZONTAL_3));
      gCurProgmeIdList = (shuffle(((array1.concat(array2)).concat(array3)).concat(array4))).slice(0,20);
      break;
    case 'section13':  /* LSIO (with guide)*/
      gCurProgmeIdList = getProblemIdList(GUIDANCE_LSIO);
      break;
    case 'section14':  /* Lsio  */
      gCurProgmeIdList = shuffle(getProblemIdList(PROB840_LSIO));
      break;
    case 'section15':  /* Final exam 30 questions */
      gCurProgmeIdList = (shuffle(getProblemIdList(PROB840))).slice(0,30);
      break;
    case 'section16':  /* Graduation test */
      var array1 = (shuffle(getProblemIdList(PROB840))).slice(0,50);
      var array2 = (shuffle(getProblemIdList(PROB840_MIRROR))).slice(0,50);
      gCurProgmeIdList = shuffle(array1.concat(array2));
      break;
    case 'section17':  /* Other ways to erase */
      gCurProgmeIdList = getProblemIdList(GUIDANCE_OTHER_WISE);
      break;
    case 'section18':  /* I Vertical Random 514 Questions */
      gCurProgmeIdList = shuffle(getProblemIdList(PROB840_VERTICAL));
      break;
    case 'section19':  /* I Laying horizontally Random 196 questions */
      var array1 = shuffle(getProblemIdList(PROB840_HORIZONTAL_1));
      var array2 = shuffle(getProblemIdList(PROB840_HORIZONTAL_LAYDOWN));
      var array3 = shuffle(getProblemIdList(PROB840_HORIZONTAL_IILO));
      var array4 = shuffle(getProblemIdList(PROB840_HORIZONTAL_3));
      gCurProgmeIdList = shuffle(((array1.concat(array2)).concat(array3)).concat(array4));
      break;
    case 'section20':  /* All 711 questions */
      gCurProgmeIdList = shuffle(getProblemIdList(PROB840));
      break;
    case 'section21':  /* All Questions Mirror */
      gCurProgmeIdList = shuffle(getProblemIdList(PROB840_MIRROR));
      break;
    default:
      gCurProgmeIdList = [];/* Once you enter this, the screen should turn white and appear to fall off */
      break;
    }

    gScene = 'perform';
  }
}

/*----------------------------------------------------------------------------------------
 ☆★ Scene: Lesson starts ★☆
----------------------------------------------------------------------------------------*/
function ScenePerform(){
  cleanExplosion();
  switch(gButton){
  case 'back':
    gScene = 'select_section';
    return;
  }
  if(IsPressed()) {
    gScene = 'perform_falling';
    resetStats();
    startTimer();
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene: Lessons ★☆
----------------------------------------------------------------------------------------*/

function ScenePerformFalling() {
updateTimer();
updatePPS();
fpsCounter.update();
  if (gIsEditingSlider) return false;
  switch (gButton) {
    case 'back':
      gScene = 'select_section';
      return;
  }

  // Tech name displayed
  if (gDfCount > 0) {
    gDfCount--;
    if (gDfCount == 0) DisplayCaption();
  }

  // Line erasing
  if (gLineClearCount > 0) {
    gLineClearCount--;
    if (gLineClearCount == 0) {
      var caption = (gCurSectionId + 1) + "-" + (gCurProblemId + 1) + " ";
      caption += gCurProblem.caption;
      RemoveReservedLines();
    }
    return;
  }

  // If you are not operating the mino
  if (!gCurMino) {
    // Clear confirmation
    if (ReqIsCleared()) gScene = 'perform_cleared';
    // Send the next one. Fail without the next
    else if (!Dequeue()) {
      gCurMino = null;
      gScene = 'perform_failed';
    }
    // Lockout determination
    if (AppearsToLockout()) {
      Lockout();
      return;
    }
  } else {
    // Handle lock delay
    if (!CanMoveDown(gCurMino, gCurX, gCurY, gCurDir)) {
      let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
      if (curLowestBlockY > lowestY) {
      // Reset lock delay and manipulations if the piece drops below its previous lowest position
      lockDelay = 0;
      manipulations = 0;
      lowestY = curLowestBlockY;
    } else {
      // Increment lock delay
      lockDelay++;
      UpdateLockTimerBar(); // Update progress bar
      if (lockDelay >= lockDelayLimit || manipulations >= manipulationLimit) {
        // Lock the piece if delay or manipulations exceed limits
        Land();
        ResetLockDelay();
        Refresh();
        return;
      }
    }
  } else {
  }

    // Key input forks
    if (InputsHorizontalMove(true)) {
      if (PlaceTest(gCurDir, gCurMino, gCurX + 1, gCurY)) {
        gCurX++;
        let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
        if (curLowestBlockY >= lowestY) {
          manipulations++;
          lockDelay = 0;
          lowestY = curLowestBlockY;
          UpdateManipulationIndicators();
        }
        if (IsLanding()) gNdCount = NATURAL_DROP_SPAN;
      }
    } else if (InputsHorizontalMove(false)) {
      if (PlaceTest(gCurDir, gCurMino, gCurX - 1, gCurY)) {
        gCurX--;
        let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
        if (curLowestBlockY >= lowestY) {
          manipulations++;
          lockDelay = 0;
          lowestY = curLowestBlockY;
          UpdateManipulationIndicators();
        }
        if (IsLanding()) gNdCount = NATURAL_DROP_SPAN;
      }
    }
    if (InputsSoftDrop()) {
      SoftDrop();
      
    }
    if (IsPressed(KeyRR())) {
      RotateRight();
      let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
      if (curLowestBlockY >= lowestY) {
        manipulations++;
        lockDelay = 0;
        lowestY = curLowestBlockY;
        UpdateManipulationIndicators();
      } 
    }
    if (IsPressed(KeyRL())) {
      RotateLeft();
      let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);;
      if (curLowestBlockY >= lowestY) {
        manipulations++;
        lockDelay = 0;
        lowestY = curLowestBlockY;
        UpdateManipulationIndicators();
      }
    }
    if (IsPressed(KeyR180())) {
      Rotate180();
      let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);

      if (curLowestBlockY >= lowestY) {
        manipulations++;
        lockDelay = 0;
        lowestY = curLowestBlockY;
        UpdateManipulationIndicators();
      }
    }
    if (IsPressed(KeyG()) && !(gCurProblem.useGuide || gCurUseGuideFlg)) {
      gScene = 'perform_guide';
    }
    if (IsPressed(KeyH())) {
      Hold();
      ResetLockDelay(); // Reset both timer and inputs
      
    }
    if (IsPressed(KeyHD())) {
      updateInputs();
      HardDrop(); // Hard drop input should be checked at the end
    }

    // Fall/landing treatment
    if (--gNdCount <= 0) {
      gNdCount = NATURAL_DROP_SPAN;
      if (!IsLanding()) {
        gCurY++;
        let curLowestBlockY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
        if (curLowestBlockY > lowestY) {
          // Reset lock delay and manipulations if piece drops further
          lockDelay = 0;
          manipulations = 0;
          lowestY = curLowestBlockY;
        }
        gTSpinType = 0;
        gLandingCount = NATURAL_DROP_SPAN;
      } else {
        // Guide array dump
        if (DUMP_GUIDE_DATA) {
          console.log("G(%s, %d, %d, %d)", gCurMino, gCurDir, gCurX, gCurY - 3);
        }
        // Landing
        Land();
      }
    }
  }

  Refresh();
}

/*----------------------------------------------------------------------------------------
 ☆★ Give horizontal movement? ★☆

 When the horizontal movement key is pressed and the next step is determined whether the moment when the horizontal movement is applied is applied. The moment when I started pushing
 Returns true at intervals or specified repeat intervals.
----------------------------------------------------------------------------------------*/
function InputsHorizontalMove(toRight){
  if (gIsEditingSlider) return false;
  keyName = toRight ? KeyR() : KeyL();
  
  // 1st frame after pressing, always move
  if(PressedDuration(keyName) == 1) {
    updateInputs();
    return true;
  }
  
  // b4 das
  if(PressedDuration(keyName) < window.KEY_CHARGE_DURATION) return false;
  
  // Special handling for very low ARR values
  if (window.KEY_REPEAT_SPAN <= 1) {
    return true; // Move every frame when ARR is 1 or less
  }
  
  // after das, move every arr frames (use Math.round for more consistent behavior)
  let framesAfterDAS = PressedDuration(keyName) - window.KEY_CHARGE_DURATION;
  return framesAfterDAS % Math.round(window.KEY_REPEAT_SPAN) === 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ Soft Drop Run? ★☆

 Returns true the moment you press it and every time the soft drop interval has elapsed thereafter.
----------------------------------------------------------------------------------------*/
function InputsSoftDrop(){
  if (gIsEditingSlider) return false;
  if(IsPressed(KeySD())) {
    updateInputs();
    return true;
  }
  if(!IsHolded(KeySD())) return false;

  var softDropInterval = Math.max(1, Math.floor(NATURAL_DROP_SPAN / window.SOFT_DROP_FACTOR));
  return PressedDuration(KeySD()) % softDropInterval == 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ If there are any lines that are all set, make an appointment ★☆

 Returns the achieved move IDs as an array.
----------------------------------------------------------------------------------------*/
function EraseLine(){
  // Inspection of the line that is in place

  var eraseLines = [];
  var lineErases;
  for(var i = 0; i < MATRIX_HEIGHT; i++){
    lineErases = true;
    for(var j = 0; j < MATRIX_WIDTH; j++){
      if(gBlocks[gMatrix[i][j]].passable){
        lineErases = false;
        break;
      }
    }
    if(lineErases){
      eraseLines.push(i);
      // Reserve to delete line

      ReserveCutLine(i);
    }
  }
  var numEls = eraseLines.length;
  // REN Number Management

  if(numEls == 0) gRens = -1;
  else gRens++;
  // Create an array of accomplished move IDs

  var features = [];
  switch(numEls){
  case 0:
    if(gTSpinType > 0) features.push(gTSpinType == 1 ? 4 : 5);
    break;
  case 1: features.push([0, 6, 7][gTSpinType]); break;
  case 2: features.push(gTSpinType == 0 ? 1 : 8); break;
  case 3: features.push(gTSpinType == 0 ? 2 : 9); break;
  case 4: features.push(3); break;
  }
  if(numEls >= 1){
    if(gRens >= 1) features.push(100 + gRens);
    if(gIsReadyToB2b && (numEls >= 4 || gTSpinType > 0)) features.push(11);
    if(IsEmptyMatrix()) features.push(10);
  }
  // B2B flag management

  if(numEls >= 1) gIsReadyToB2b = (numEls >= 4 || (gTSpinType > 0 && numEls >= 1));

  return features;
}

/*----------------------------------------------------------------------------------------
 ☆★ Is the matrix empty? ★☆
----------------------------------------------------------------------------------------*/
function IsEmptyMatrix(){
  for(var i = 0; i < MATRIX_HEIGHT; i++){
    for(var j = 0; j < MATRIX_WIDTH; j++){
      if(!gBlocks[gMatrix[i][j]].passable) return false;
    }
  }
  return true;
}
/*----------------------------------------------------------------------------------------
 ☆★ Line Erase Reservation ★☆

 Reserve to delete the block in line <line>. These are removed with RemoveReservedLines().
----------------------------------------------------------------------------------------*/
function ReserveCutLine(line){
  for(var i = 0; i < MATRIX_WIDTH; i++){
    gMatrix[line][i] = BlkVanishing().id;
  }
  gLineClearCount = LINE_CLEAR_DURATION;
}
/*----------------------------------------------------------------------------------------
 ☆★ Erase of lines that have been cancelled ★☆

 Erase Erase the blocks that have been reserved for removal and fill in the space you have created from above.
----------------------------------------------------------------------------------------*/
function RemoveReservedLines(){
  for(var i = 0; i < MATRIX_HEIGHT; i++){
    for(var j = 0; j < MATRIX_WIDTH; j++){
      if(gBlocks[gMatrix[i][j]].toVanish){
        for(var k = i; k >= 1; k--){
          gMatrix[k][j] = gMatrix[k - 1][j];
        }
        gMatrix[0][j] = 0;
      }
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Get the technique name ★☆

 If multiple moves are achieved, they will be returned together as a single string.
----------------------------------------------------------------------------------------*/
function FeatureName(features){
  var result = "☆ ";
  for(var i = 0; i < features.length; i++){
    if(i > 0) result += "　";
    switch(features[i]){
    case  0: result += "SINGLE"; break;
    case  1: result += "DOUBLE"; break;
    case  2: result += "TRIPLE"; break;
    case  3: result += "TETRiS"; break;
    case  4: result += "T-SPIN MINI"; break;
    case  5: result += "T-SPIN"; break;
    case  6: result += "T-SPIN SINGLE MINI"; break;
    case  7: result += "T-SPIN SINGLE"; break;
    case  8: result += "T-SPIN DOUBLE"; break;
    case  9: result += "T-SPIN TRIPLE"; break;
    case 10: result += "PERFECT CLEAR"; break;
    case 11: result += "BACK to BACK"; break;
    default: result += (features[i] - 100 + 1) + "x Combo"; break;  // 100 + n: n REN

    }
  }
  result += " ☆";
  return result;
}
/*----------------------------------------------------------------------------------------
 ☆★ Underground? ★☆
----------------------------------------------------------------------------------------*/
function IsLanding(){
  return !PlaceTest(gCurDir, gCurMino, gCurX, gCurY + 1);
}
/*----------------------------------------------------------------------------------------
 ☆★ Landing ★☆
----------------------------------------------------------------------------------------*/
function Land(){
  updateIPP();
  ResetLockDelay(); // reset lock delay state
  // Reflected in the field
  
  for(var i = 0; i < 4; i++){
    for(var j = 0; j < 4; j++){
      if(IsValidPos(j + gCurX, i + gCurY)){
        if(gCurMino.shape[gCurDir][i][j] == 1){
          gMatrix[i + gCurY][j + gCurX] = gCurMino.placedBlockId;
        }
      }
    }
  }
  // If you don't follow a strict guide, you'll fail.

  if(gCurGuide){
    if((gCurProblem.useGuide || gCurUseGuideFlg) && GuideBlocksPos().join() != CurMinoBlocksPos().join()){
      gScene = 'perform_failed';
      gCurMino = null;
      return;
    }
  }
  // Lockout determination

  if(LandsToLockout()){
    Lockout();
    return;
  }
  // Display and process if the move is activated

  var features = EraseLine();
  if(features.length > 0){
    // Indicates management

    Say('perform_caption', FeatureName(features));
    gDfCount = DISPLAY_FEATURES_DURATION;
    // Reflected in quotas

    RemoveReq(features);
    // If the lines are all together, then the lines are erased

    if(IsErased(features)) gLineClearCount = LINE_CLEAR_DURATION;
  }
  // Active Minno unlocked

  gCurMino = null;
}
/*----------------------------------------------------------------------------------------
 ★☆ Lock out as a result of landing? ☆★

 Returns true if all blocks of Mino are above the deadline.
----------------------------------------------------------------------------------------*/
function LandsToLockout(){
  var minoPos = MinoToBlockPositions(gCurDir, gCurMino, gCurX, gCurY);
  for(var i = 0; i < minoPos.length; i++){
    if(minoPos[i][1] >= DEADLINE_HEIGHT) return false;
  }
  return true;
}
/*----------------------------------------------------------------------------------------
 ★☆ As a result of Minho appearing, it becomes a lockout? ☆★

 Returns true if even one existing block overlaps with one existing block.
----------------------------------------------------------------------------------------*/
function AppearsToLockout(){
  if(!gCurMino) return;
  return !PlaceTest(INITIAL_DIR, gCurMino, INITIAL_X, INITIAL_Y);
}
/*----------------------------------------------------------------------------------------
 ★☆ Lockout processing ☆★
----------------------------------------------------------------------------------------*/
function Lockout(){
  gScene = 'perform_failed';
  gCurMino = null;
}
/*----------------------------------------------------------------------------------------
 ☆★ Did you delete the line? ★☆
----------------------------------------------------------------------------------------*/
function IsErased(features){
  for(var i = 0; i < features.length; i++){
    switch(features[i]){
    case  0:
    case  1:
    case  2:
    case  3:
    case  6:
    case  7:
    case  8:
    case  9:
    case 10:
    case 11:
      return true;
    }
  }
  return false;
}
/*----------------------------------------------------------------------------------------
 ☆★ Get a list of coordinates with guide blocks ★☆
----------------------------------------------------------------------------------------*/
function GuideBlocksPos(){
  var g = gCurGuide;
//  return MinoToBlockPositions(g.dir, gCurMino, g.x, g.y + DEADLINE_HEIGHT);

  return MinoToBlockPositions(g.dir, g.mino, g.x, g.y + DEADLINE_HEIGHT);
}
/*----------------------------------------------------------------------------------------
 ☆★ Get a list of coordinates where the mino block is currently being operated ★☆
----------------------------------------------------------------------------------------*/
function CurMinoBlocksPos(){
  return MinoToBlockPositions(gCurDir, gCurMino, gCurX, gCurY);
}
/*----------------------------------------------------------------------------------------
 ☆★ Get a list of block coordinates when placing mino at the specified position ★☆

 Returns an array of size 2 [x coordinates, y coordinates] as an additional array (effectively a two-dimensional array).
----------------------------------------------------------------------------------------*/
function MinoToBlockPositions(dir, mino, x, y){
  var result = [];
  for(var i = 0; i < 4; i++){
    for(var j = 0; j < 4; j++){
      if(mino.shape[dir][i][j] == 1) result.push([x + j, y + i]);
    }
  }
  return result;
}
/*----------------------------------------------------------------------------------------
 ☆★ Get how much DIFFerence of Y increases when you make a hard drop ★☆
----------------------------------------------------------------------------------------*/
function HarddropDiffY(){
  var i = 0;
  while(PlaceTest(gCurDir, gCurMino, gCurX, gCurY + i)){
    i++;
  }
  // Returns the amount of increase to the point just before it becomes unpassable.

  return i - 1;
}
/*----------------------------------------------------------------------------------------
 ☆★ Hard Drop ★☆
----------------------------------------------------------------------------------------*/
function HardDrop(){
  var dY = HarddropDiffY();
  if(dY > 0) gTSpinType = 0;
  gCurY += dY;
  gNdCount = 0;
  gLandingCount = 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ Soft Drop ★☆
----------------------------------------------------------------------------------------*/
function SoftDrop(){
  var softDropInterval = Math.max(1, Math.floor(NATURAL_DROP_SPAN / window.SOFT_DROP_FACTOR));
  
  if (PressedDuration(KeySD()) % softDropInterval == 0) {
    if (!IsLanding()) {
      gCurY++;
      gTSpinType = 0;
    }
  }
  
  if (!IsLanding()) {
    gNdCount = NATURAL_DROP_SPAN;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Hold ★☆
----------------------------------------------------------------------------------------*/
function Hold(){
  if(gQueue.length == 0 && !gCurHold) return;

  if(!gCurHold){
    gCurHold = gCurMino;
    gCurMino = gQueue.shift();
  }else{
    var mino = gCurHold;
    gCurHold = gCurMino;
    gCurMino = mino;
  }

  gCurDir = INITIAL_DIR;
  gCurX = INITIAL_X;
  gCurY = INITIAL_Y;
  
  gTSpinType = 0;
  gNdCount = NATURAL_DROP_SPAN;
  lowestY = GetLowestBlockY(gCurMino, gCurDir, gCurY);
}
/*----------------------------------------------------------------------------------------
 ☆★ Reduce the quota (REQuireed features) according to the technique achieved ★☆
----------------------------------------------------------------------------------------*/
function RemoveReq(features){
  var index;
  for(var i = 0; i < features.length; i++){
    index = (features[i] > 100) ? 12 : features[i];
    gCurProblemReq[index]--;
    // If you use T spin, the normal elimination quota will also be reduced. For example, TST reduces the triple quota.

    switch(index){
    case 6:
    case 7:
      gCurProblemReq[0]--;
      break;
    case 8:
      gCurProblemReq[1]--;
      break;
    case 9:
      gCurProblemReq[2]--;
      break;
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Clear the quota? ★☆
----------------------------------------------------------------------------------------*/
function ReqIsCleared(){
  for(var i = 0; i < gCurProblemReq.length; i++){
    if(gCurProblemReq[i] > 0) return false;
  }
  return true;
}
/*----------------------------------------------------------------------------------------
 ☆★ Can you place mino at specified coordinates? ★☆
----------------------------------------------------------------------------------------*/
function PlaceTest(dir, mino, x, y){
  var block;
  for(var i = 0; i < 4; i++){
    for(var j = 0; j < 4; j++){
      if(IsValidPos(x + j, y + i)){
        block = gBlocks[gMatrix[y + i][x + j]];
        if(mino.shape[dir][i][j] == 1 && !block.passable) return false;
      }else{
        // Cannot be placed in an invalid location unless above the deadline

        if(mino.shape[dir][i][j] == 1 &&
                (x + j < 0 || MATRIX_WIDTH <= x + j || MATRIX_HEIGHT <= y + i)){
          return false;
        }
      }
    }
  }
  return true;
}
/*----------------------------------------------------------------------------------------
 ☆★ The specified coordinates are within the range of the array? ★☆
----------------------------------------------------------------------------------------*/
function IsValidPos(x, y){
  return (0 <= x && x < MATRIX_WIDTH && 0 <= y && y < MATRIX_HEIGHT);
}
/*----------------------------------------------------------------------------------------
 ☆★ Draw mino on the screen ★☆
----------------------------------------------------------------------------------------*/
function DisplayMino(dir, mino, x, y, blockId){
  var block;  // 0=available, 1=available


  for(var i = 0; i < 4; i++){
    for(var j = 0; j < 4; j++){
      DisplayBlock(x + j, y + i, mino.shape[dir][i][j] * blockId, true);
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Lock Delay Helper Functions ★☆
----------------------------------------------------------------------------------------*/
function CanMoveDown(mino, x, y, dir) {
  return PlaceTest(dir, mino, x, y + 1);
}

function ResetLockDelay() {
  lockDelay = 0;
  manipulations = 0;
  UpdateLockTimerBar(); // Reset progress bar
  UpdateManipulationIndicators(); // Reset manipulation indicators
}

function UpdateLockTimerBar() {
  // lockDelay and lockDelayLimit should be global or accessible here
  const bar = document.getElementById('lock_timer_bar');
  if (!bar) return;
  // Clamp progress between 0 and 1
  let progress = Math.min(lockDelay / lockDelayLimit, 1);
  bar.style.width = (progress * 241.99) + "px"; // 241.99px is the full width
}

function UpdateManipulationIndicators() {
  const grid = document.getElementById('pip-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = manipulationLimit; i > manipulations; i--) {
    const pip = document.createElement('div');
    pip.classList.add('manip-pip');
    pip.id = `pip-${i}`;
    grid.appendChild(pip);
  }
  
}

function GetLowestBlockY(mino, dir, y) {
  let lowest = y;
    for (let i = 0; i < 4; i++) { // rows
      for (let j = 0; j < 4; j++) { // cols
        if (mino.shape[dir][i][j]) {
          if (y + i > lowest) lowest = y + i;
        }
      }
    }
  return lowest;
}



/* function UpdateLockTimerBar() {
  const lockTimerBar = document.getElementById('lock_timer_bar');
  if (gIsLockDelayActive) {
    // calcs the percentage of time elapsed
    const progress = (gLockDelayTimer / LOCK_DELAY_DURATION) * 100;
    lockTimerBar.style.width = `${progress}%`;
  } else {
    // reset bar when lock delay is not active
    lockTimerBar.style.width = '0%';
  }
} */

/*----------------------------------------------------------------------------------------
 ☆★ Drawing blocks ★☆

 Draws a block with ID <blockId> at coordinates (<x>, <y>) on the matrix. In <ignoresZero>
 If true, blocks with ID 0 will not be drawn (treated as transparent).
----------------------------------------------------------------------------------------*/
function DisplayBlock(x, y, blockId, ignoresZero){
  if(ignoresZero && blockId == 0) return;
  if(CanDisplayPos(x, y)){
     SetImage("m" + (y - DEADLINE_HEIGHT) + "_" + x, gBlocks[blockId].cache.src);
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Is it accessible? ★☆
----------------------------------------------------------------------------------------*/
function IsPassable(x, y){
  if(x < 0 || MATRIX_WIDTH <= x || MATRIX_HEIGHT <= y) return false;
  if(y < 0) return true;
  return gBlocks[gMatrix[y][x]].passable;
}
/*----------------------------------------------------------------------------------------
 ☆★ Indicates within the area? ★☆
----------------------------------------------------------------------------------------*/
function CanDisplayPos(x, y){
  return (0 <= x && x < MATRIX_WIDTH && DEADLINE_HEIGHT <= y && y < MATRIX_HEIGHT);
}
/*----------------------------------------------------------------------------------------
 ☆★ Rotate right ★☆
----------------------------------------------------------------------------------------*/
function RotateRight(){
  Rotate(true);
}
/*----------------------------------------------------------------------------------------
 ☆★ Rotate left ★☆
----------------------------------------------------------------------------------------*/
function RotateLeft(){
  Rotate(false);
}

function Rotate180() {
  updateInputs();
  var from = gCurDir;
  var to = (gCurDir + 2) % 4;
  var rotRule = gCurMino.rotationRule;
  var dx180 = rotRule.dx180[from];
  var dy180 = rotRule.dy180[from];
  var canRotate = false;
  var rotateRuleId;

  for (var i = 0; i < dx180.length; i++) {
    var newX = gCurX + dx180[i];
    var newY = gCurY + dy180[i];
    if (PlaceTest(to, gCurMino, newX, newY)) {
      gCurX = newX;
      gCurY = newY;
      gCurDir = to;
      canRotate = true;
      rotateRuleId = i;
      break;
    }
  }
  if (canRotate) {
    SetTSpinType(rotateRuleId);
    if (IsLanding()) gNdCount = NATURAL_DROP_SPAN;
  }
}


/*----------------------------------------------------------------------------------------
 ☆★ Rotation ★☆

 If <toRight> is true, it rotates right, and if false, it rotates left.
----------------------------------------------------------------------------------------*/
function Rotate(toRight) {
  updateInputs();
  var newDir = (gCurDir + (toRight ? 1 : 3)) % 4;
  var rotRule = gCurMino.rotationRule;
  var newX, newY;
  var rotateRuleId;

  // Test rotation rules
  var canRotate = false;
  for (var i = 0; i < ROTATE_RULES; i++) {
    newX = gCurX + rotRule.dx[toRight ? 0 : 1][gCurDir][i];
    newY = gCurY + rotRule.dy[toRight ? 0 : 1][gCurDir][i];
    if (PlaceTest(newDir, gCurMino, newX, newY)) {
      gCurX = newX;
      gCurY = newY;
      gCurDir = newDir;
      canRotate = true;
      rotateRuleId = i;

      break;
    }
  }

  if (canRotate) {
    SetTSpinType(rotateRuleId);
    if (IsLanding()) gNdCount = NATURAL_DROP_SPAN;

    }
  }

/*----------------------------------------------------------------------------------------
 ★☆ T-SPIN success judgment ☆★

 Returns 0 if T-SPIN is not satisfied, 1 if T-SPIN MINI, and 2 if T-SPIN.
//-------------------------
 Please obtain it during the rotation process.
 If the following conditions are met, the T-SPIN will be created.
 ・ Being T Minho
 ・The last successful operation is rotation (assuming that this function is called)
 ・There are more than three blocks (*and × parts) around the convex part.

 Furthermore, if one of the following conditions is satisfied, it becomes T-SPIN, and if not, it becomes T-SPIN MINI.
 ・There are blocks on both sides of the convex portion (part ※).
 -The previous rotation is the fifth candidate (TST wind rotation, "T-SPIN FIN", etc.).

 *■※ ×■※ ×　×　※■×
 ■■■■■■■■■■■■■■■■
 × ×■※※※※※■×

 If an operation other than rotation is successful, set the T-SPIN flag gTSpinType to 0.
//-------------------------
 The detailed conditions seem to vary depending on the software. For now, the wall kick and slipping T-SPIN is MINI.
 It would be fine if it was determined.
----------------------------------------------------------------------------------------*/
function SetTSpinType(rotateRuleId){
  if(gCurMino != T) return 0;

  var tsCnt = 0;
  var tssCnt = 0;
  var isBlock = false;
  // How many TS and TSS conditions are there non-passing blocks?

  for(var i = 0; i < T.shape[gCurDir].length; i++){
    for(var j = 0; j < T.shape[gCurDir][i].length; j++){
      if(IsValidPos(j + gCurX, i + gCurY)){
        isBlock = !gBlocks[gMatrix[i + gCurY][j + gCurX]].passable;
      }else{
        isBlock = true;
      }
      if(isBlock){
        if(gTsTiles[gCurDir][i][j] > 0) tsCnt++;
        if(gTssTiles[gCurDir][i][j] > 0) tssCnt++;
      }
    }
  }
  // Determining whether TSS or TSM

  if(tsCnt >= 3){
    gTSpinType = (tssCnt >= 2 || rotateRuleId == 4) ? 2 : 1;
  }else{
    gTSpinType = 0;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Reflects the display ★☆
----------------------------------------------------------------------------------------*/
function Refresh(){
  RefreshMatrix();
  RefreshQueue();
  RefreshHold();
}
/*----------------------------------------------------------------------------------------
 ☆★ Matrix Reflection ★☆
----------------------------------------------------------------------------------------*/
function RefreshMatrix(){
  RefreshPlacedMino();
  RefreshGhostAndGuide();
  RefreshActiveMino();
}
/*----------------------------------------------------------------------------------------
 ☆★ Reflected blocks installed ★☆
----------------------------------------------------------------------------------------*/
function RefreshPlacedMino(){
  cleanExplosion();
  for(var i = DEADLINE_HEIGHT; i < MATRIX_HEIGHT; i++){
    for(var j = 0; j < MATRIX_WIDTH; j++){
      SetImage("m" + (i - DEADLINE_HEIGHT) + "_" + j, gBlocks[gMatrix[i][j]].image);
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Mino reflects falling ★☆
----------------------------------------------------------------------------------------*/
function RefreshActiveMino(){
  if(gCurMino) DisplayMino(gCurDir, gCurMino, gCurX, gCurY, gCurMino.activeBlockId);
}
/*----------------------------------------------------------------------------------------
 ☆★ Ghost Mino and Guide Mino Reflection ★☆
----------------------------------------------------------------------------------------*/
function RefreshGhostAndGuide(){
  if(!gCurMino) return;
  var ghostBlks = MinoToBlockPositions(gCurDir, gCurMino, gCurX, gCurY + HarddropDiffY());
  // Ghost Mino drawing

  for(var i = 0; i < ghostBlks.length; i++){
    DisplayBlock(ghostBlks[i][0], ghostBlks[i][1], gCurMino.ghostBlockId, true);
  }

  var g = gCurGuide;
  if(!g) return;
  var guideBlks = MinoToBlockPositions(g.dir, g.mino, g.x, g.y + DEADLINE_HEIGHT);
  // Exploring common parts

  var ghostGuideBlks = [];
  for(var i = 0; i < ghostBlks.length; i++){
    for(var j = 0; j < guideBlks.length; j++){
      if(ghostBlks[i][0] == guideBlks[j][0] && ghostBlks[i][1] == guideBlks[j][1]){
        ghostGuideBlks.push([ghostBlks[i][0], ghostBlks[i][1]]);
      }
    }
  }

  // Guide mino drawing

  if(gCurProblem.useGuide || gCurUseGuideFlg){
    for(var i = 0; i < guideBlks.length; i++){
      DisplayBlock(guideBlks[i][0], guideBlks[i][1], 40 + g.mino.id, true);
    }

    // Drawing of common parts (ghost + guide overlaps)
    for(var i = 0; i < ghostGuideBlks.length; i++){
      DisplayBlock(ghostGuideBlks[i][0], ghostGuideBlks[i][1], 50 + g.mino.id, true);
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Next reflect ★☆

 Displays images of blank spaces (0) or moving blocks (11 to 17). 1 Slide it down the square.
----------------------------------------------------------------------------------------*/
function RefreshQueue(){
  var mino;
  var i = 0;
  
  // Display preview images for actual pieces in queue
  while(i < Math.min(gQueue.length, NEXT_MINOS)){
    mino = gQueue[i];
    var nextDisplay = document.getElementById("next_display_" + i);
    
    if(nextDisplay && mino && mino.id >= 1 && mino.id <= 7){
      nextDisplay.src = GetPreviewImage(mino);
    } else if(nextDisplay) {
      nextDisplay.src = "img/b3.svg";
    }
    i++;
  }

  // Fill remaining empty next slots with b3.svg
  while(i < NEXT_MINOS){
    var nextDisplay = document.getElementById("next_display_" + i);
    if(nextDisplay) {
      nextDisplay.src = "img/b3.svg";
    }
    i++;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Hold reflection ★☆

 Displays images of blank spaces (0) or moving blocks (11 to 17). 1 Slide it down the square.
----------------------------------------------------------------------------------------*/
function RefreshHold(){
  
  var mino = gCurHold;
  var holdDisplay = document.getElementById("hold_display");
  if(!holdDisplay) return;
  
  if(mino){
    holdDisplay.src = GetPreviewImage(mino);
  } else {
    holdDisplay.src = "img/b3.svg";
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene: Lesson failure ★☆
----------------------------------------------------------------------------------------*/
function ScenePerformFailed(){
  switch(gButton){
  case 'back':
    gScene = 'select_section';
    return;
  }
  if(IsPressed()) {
    gScene = 'perform';
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene: Guide mode ★☆
----------------------------------------------------------------------------------------*/
function ScenePerformGuideMode(){
  switch(gButton){
  case 'back':
    gScene = 'select_section';
    return;
  }
  if(IsPressed()) gScene = 'perform';
}
/*----------------------------------------------------------------------------------------
 ☆★ Scene: Clear ★☆
----------------------------------------------------------------------------------------*/
function ScenePerformCleared(){
  switch(gButton){
  case 'back':
    gScene = 'select_section';
    return;
  }
  displayPB(gCurProblem);
  markCleared(gCurProblem);
  if(IsPressed()) AfterClear();
}
/*----------------------------------------------------------------------------------------
 ☆★ Key operations after clearing ★☆

 If you are "Question 10", go to the section list, otherwise proceed to the next question.
----------------------------------------------------------------------------------------*/
function AfterClear(){
  if(gCurProblemId >= gCurProgmeIdList.length - 1){
    gScene = 'select_section';
    gProblemsCleared[gCurSectionId] = true;
    Save('Prg' + gCurSectionId, '1');
    RefreshProblemButtons();
    RefreshHeaderClearedStatus();
    updateSectionTitles();
  }
  else{
    gCurProblemId++;
    gScene = 'perform';
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Get each key name ★☆
----------------------------------------------------------------------------------------*/
function KeyL() {return gKeys[0]; }  // move Left

function KeyR() {return gKeys[1]; }  // move Right

function KeySD(){return gKeys[2]; }  // Soft drop

function KeyHD(){return gKeys[3]; }  // Hard drop

function KeyRR(){return gKeys[4]; }  // Rotate Right

function KeyRL(){return gKeys[5]; }  // Rotate Left

function KeyH() {return gKeys[6]; }  // Hold

function KeyG() {return gKeys[7]; }  // Guide

function KeyR180() {return gKeys[8]; }  // 180 degree rotation
/*----------------------------------------------------------------------------------------
 ☆★ Scene: Settings ★☆
----------------------------------------------------------------------------------------*/
function ScenePreferences(){
  switch(gButton){
  case 'ok':
    if(SavePreferences()) gScene = 'select_section';
    break;
  case 'cancel':
    gScene = 'select_section';
    break;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Saving settings ★☆

 Returns whether the save was successful.
----------------------------------------------------------------------------------------*/
function SavePreferences() {
  // Check for duplicates
  if (KeyDuplicates()) {
    alert("Duplicate keys.");
    return false;
  }
  const explosionCheckbox = document.getElementById('cb_explosion_effects');
  if (explosionCheckbox) usExplodeOnFail = explosionCheckbox.checked;
  const textOverlayCheckbox = document.getElementById('cb_text_overlay');
  if (textOverlayCheckbox) usTextOverlay = textOverlayCheckbox.checked;
  // Save keys from buttons
  const buttonIds = [
    'key_left_btn', 'key_right_btn', 'key_softdrop_btn', 'key_harddrop_btn',
    'key_rot_left_btn', 'key_rot_right_btn', 'key_hold_btn', 'key_guide_btn', 'key_rot_180_btn'
  ];

  for (let i = 0; i < gKeys.length; i++) {
    gKeys[i] = document.getElementById(buttonIds[i]).textContent.toLowerCase();
  }
  // handling preferences
  const dasSlider = document.getElementById('das_slider');
  const arrSlider = document.getElementById('arr_slider');

  window.KEY_CHARGE_DURATION = parseFloat(dasSlider.max) - parseFloat(dasSlider.value) + parseFloat(dasSlider.min);
  window.KEY_REPEAT_SPAN = parseFloat(arrSlider.max) - parseFloat(arrSlider.value) + parseFloat(arrSlider.min);
  window.SOFT_DROP_FACTOR = parseFloat(document.getElementById('sdf_slider').value);

  // Store in cookies
  Save('MoveLeft', gKeys[0]);
  Save('MoveRight', gKeys[1]);
  Save('SoftDrop', gKeys[2]);
  Save('HardDrop', gKeys[3]);
  Save('RotateRight', gKeys[4]);
  Save('RotateLeft', gKeys[5]);
  Save('Hold', gKeys[6]);
  Save('Guide', gKeys[7]);
  Save('Rotate180', gKeys[8]);
  Save('DAS', window.KEY_CHARGE_DURATION);
  Save('ARR', window.KEY_REPEAT_SPAN);
  Save('SDF', window.SOFT_DROP_FACTOR);
  Save('Explosions', usExplodeOnFail ? '1' : '0');
  Save('TextOverlay', usTextOverlay ? '1' : '0');

  return true;
}
/*----------------------------------------------------------------------------------------
 ☆★ Duplicate keys? ★☆

 Check each select box to determine if there are any duplicates and return it.
----------------------------------------------------------------------------------------*/

function KeyDuplicates() {
  const buttonIds = [
    'key_left_btn', 'key_right_btn', 'key_softdrop_btn', 'key_harddrop_btn',
    'key_rot_left_btn', 'key_rot_right_btn', 'key_hold_btn', 'key_guide_btn', 'key_rot_180_btn'
  ];
  for (let i = 0; i < buttonIds.length; i++) {
    const key1 = document.getElementById(buttonIds[i]).textContent;
    for (let j = i + 1; j < buttonIds.length; j++) {
      const key2 = document.getElementById(buttonIds[j]).textContent;
      if (key1 === key2) return true;
    }
  }
  return false;
}

/* function KeyDuplicates(){
  var target1, target2;
  for(var i = 0; i < gSelectForms.length; i++){
    target1 = document.getElementById(gSelectForms[i]).value;
    for(var j = i + 1; j < gSelectForms.length; j++){
      target2 = document.getElementById(gSelectForms[j]).value;
      if(target1 == target2) return true;
    }
  }
  return false;
}
*/
// making this comment so i can push changes to the site lmfao