// stats vars
var sPieces = 0;
var sPPS = 0.00; // pieces per sec
var sPPShi = 0.00;
var sInputs = 0; // total inputs
var sIPP = 0.00; // inputs per piece
  // timer vars
  var sStartTime = 0; // start time
  var sEndTime = 0;   // end time
  var sElapsedTime = 0; // elapsed time
  var sTimer;   // timer ID
  var tsIsRunning = false; // 


/*=========================================================================================
  =========================================================================================
                                ☆★ Stats Functions ★☆
===========================================================================================                              
=========================================================================================*/
function resetStats() {
  sInputs = 0;
  sPieces = 0;
  sPPS = 0.00;
  sIPP = 0.00;
  sElapsedTime = 0;
  tsIsRunning = false;
}

/*-----------------------------------------------------------------------------------------
                        ☆★ Inputs and Inputs per Piece ★☆
-----------------------------------------------------------------------------------------*/
function updateInputs() {
  sInputs++;
  const inputsDisplay = document.getElementById('svInputs');
  inputsDisplay.textContent = `${sInputs},`;
}
function updateIPP() {
  sPieces++;

  const ipp = document.getElementById('saInputs');
  sIPP = (Math.round((sInputs / sPieces)*100)/100).toFixed(2);
  ipp.textContent = `${sIPP}`;
}

/*-----------------------------------------------------------------------------------------
                                        ☆★ PPS ★☆
-----------------------------------------------------------------------------------------*/
function updatePPS() {
  let elapsed = sElapsedTime / 1000;
  if (elapsed <= 0) {
    sPPS = "0.00";
  } else {
    sPPS = (sPieces / elapsed).toFixed(2);
  }
  const pps = document.getElementById('svPPS');
  pps.textContent = `${sPPS}`;
  if (sPPS > sPPShi) {
    sPPShi = sPPS;
    // pps record, idk if i want this later but imma leave it here for now
  }
}
/*-----------------------------------------------------------------------------------------
                                        ☆★ Timer ★☆
-----------------------------------------------------------------------------------------*/
function formatTime(ms, isMinSec) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(ms % 1000); // 3 decimal places for ms

  if (isMinSec) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `.${milliseconds.toString().padStart(3, '0')}`;
  }
}
function updateTimer() {
  const currentTime = new Date().getTime();
  const currentElapsedTime = (currentTime - sStartTime);
  sElapsedTime = currentElapsedTime;
  svTime.textContent = formatTime(currentElapsedTime, true);
  smTime.textContent = formatTime(currentElapsedTime, false);
}
function startTimer() {
  if (!tsIsRunning) {
    tsIsRunning = true;
    sStartTime = new Date().getTime() - sElapsedTime;
    sTimer = setInterval(updateTimer, 1000);
  }
}
function pauseTimer() {
  if (tsIsRunning) {
    tsIsRunning = false;
    clearInterval(sTimer);
  }
}
function resetTimer() {
 tsIsRunning = false;
 clearInterval(sTimer);
 sElapsedTime = 0;
 svTime.textContent = '0:00';
 smTime.textContent = '.000';
}


/*-----------------------------------------------------------------------------------------
                                        ☆★ PBs ★☆
-----------------------------------------------------------------------------------------*/
function savePB(elapsedTime) {
  const problem = gCurProblem;
  if (problem.personalBest === null || elapsedTime < problem.personalBest) {
    problem.personalBest = elapsedTime;
    // Save to localStorage for persistence
    localStorage.setItem('pb_' + problem.id, elapsedTime);
  }
}
function getPB() {
  const problem = gCurProblem;
  const savedPB = localStorage.getItem('pb_' + problem.id);
  if (savedPB !== null) {
    problem.personalBest = parseInt(savedPB, 10);
  }
}
function displayPB(problem) {
  const pbMinSec = document.getElementById('svPb');
  const pbMs = document.getElementById('svPbMs');
    svPb.textContent = problem.personalBest !== (null || Infinity || NaN || undefined)
      ? formatTime(problem.personalBest, true)
      : '-:--';
    smPb.textContent = problem.personalBest !== (null || Infinity || NaN || undefined)
      ? formatTime(problem.personalBest, false)
      : '.---';
}


/*========================================================================================
☆★ FPS Counter ★☆
========================================================================================*/

let fpsCounter = {
    lastTime: performance.now(),
    frameCount: 0,
    fps: 60,
    
    update: function() {
        const currentTime = performance.now();
        this.frameCount++;
        
        if (currentTime - this.lastTime >= 100) { // Update every second
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            
            const fpsElement = document.getElementById('fps_value');
            if (fpsElement) {
                fpsElement.textContent = Math.max(1, Math.min(999, this.fps));
            }
            
            // Reset
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
    }
};

