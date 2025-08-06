/*========================================================================================
□■ jsgmod.js (JavaScript Game MODule) ■□
 
This module supports frame management, key input, etc.
==========================================================================================
/*----------------------------------------------------------------------------------------
☆★ Constant list ★☆
----------------------------------------------------------------------------------------*/
var FPS = 30; //Frames Per Second; Frames per second

var LOOP_INTERVAL = 17; //<milliseconds> Main loop startup interval. (1000 /<FPS>) to be smaller

var KEY_CHARGE_DURATION = 7; //<frame> Number of frames until key repeat starts

var KEY_REPEAT_SPAN = 2; //<frame> Number of frames up to the next key repeat
/*
● Key repeat
When a key is pressed and held down, the keys are input continuously is called "key repeat." for example
If KEY_CHARGE_DURATION = 20, KEY_REPEAT_SPAN = 4, then the frame where you started pressing the key and the
Counting from 20, 24, 28, 32, … Send input when pressed for a frame (IsInputting is true
) returns
*/
/*----------------------------------------------------------------------------------------
☆★ How to use ★☆

This is a module that controls frames using Javascript. Setup() (at startup) to load this module
Define the initialization process that is processed only once () and Main() (process executed every frame).
Also, call Execute() from the onLoad event of the body tag.

◎ Example of HTML file source
<html>
<head>
<script type="text/javascript" src="jsgmod.js"></script>
<script type="text/javascript" src="my_sccript.js"></script>
</head>
<body onLoad="Execute()">
This article
</body>
</html>

------------------------------------------------------------------------------------------
● Key control
 PressedDuration(keyName) How many frames is the key pressed?
 Is the key input started?
 Is the IsHolded(keyName) key pressed?
 Is the IsInputting(keyName) key gives input?

● Script creation and debugging
 p(value, variableName) Display in console
 InitArg(variable, defaultValue) Gets the defined value or default value

● Display
 Say(textBoxName, text) Display text
 SetImage(imageId, src) Display image

● Time
 EHour() Gets the "time" of elapsed time
 EMin() Gets "min" of elapsed time
 ESec() Gets "seconds" of elapsed time
 EMSec() Gets "milliseconds" of elapsed time
 ETime() Get the elapsed time in seconds
 EtStr(hLength=2, hDelim=':', mDelim=':', sDelim='', msLength=0)
                                  Converting elapsed time to a string to get

● Numerical processing
 Round(n, place=0) Round to the nearest decimal point
 Floor(n, place=0) Truncate at the specified decimal point
 Ceil(n, place=0) round up to the specified decimal point
 Justify(n) Rounding error correction
 Rand(n=0, times=0) Generate random numbers

● Cookies
 Save(name, value, expireDays) Save to cookie
 Load(name) Load from cookie

● Startup
 Execute() launch (call from the onLoad event in the body tag)

● Object
 Layer
   Show()
   Hide() Hide
   MoveTo(x, y) Move to the specified position
   MoveBy(dX, dY) Move by the specified amount
   ResizeTo(width, height) Resize
   ResizeBy(dWidth, dHeight) Resize by specifying a relative value
   Write(text, overwrites=true) Fill in text (HTML source)

========================================================================================*/
/*----------------------------------------------------------------------------------------
 ☆★ Global variable list ★☆

 For convenience, all public variables are used, but please do not change the value from outside this module.
----------------------------------------------------------------------------------------*/
var gTimer;         // Main loop control timer

var gStartTime;     // Start moment

var gFrames;        // Number of frames passed

var gInputs;        // [~255] Number of frames to hold each key

var gConsole;       // Console window
/*----------------------------------------------------------------------------------------
 ☆★ Processing when pressing a key ★☆
----------------------------------------------------------------------------------------*/
document.onkeydown = function(e){
  // Mozilla, work

  if(e != null){
    keyCode = e.which;
    // Prevent event execution

    e.preventDefault();
    e.stopPropagation();
  // Internet Explorer

  } else {
    keyCode = event.keyCode;
    // Prevent event execution

    event.returnValue = false;
    event.cancelBubble = true;
  }
  //Reflecting "starting pressing key"

  if(gInputs[keyCode] <= 0) gInputs[keyCode] = 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ Processing when you release the key ★☆
----------------------------------------------------------------------------------------*/
document.onkeyup = function(e){
  // Mozilla, work

  if(e != null){
    keyCode = e.which;
    // Prevent event execution

    e.preventDefault();
    e.stopPropagation();
  // Internet Explorer

  } else {
    keyCode = event.keyCode;
    // Prevent event execution

    event.returnValue = false;
    event.cancelBubble = true;
  }
  //Reflecting "released the key"

  gInputs[keyCode] = -1;
}
/*----------------------------------------------------------------------------------------
 ☆★ What to do when the window loses focus ★☆

 Clears key inputs (as the onkeyup event will not occur).
----------------------------------------------------------------------------------------*/
window.onblur = function(){
  gInputs = []; for(var i = 0; i < 256; i++) gInputs.push(-1);
}
/*----------------------------------------------------------------------------------------
 ☆★ How many frames are the keys pressed ★☆

 Returns how many frames the key specified by <keyName> is pressed. When you release it, it becomes -1 and is pressed
 When you start, it counts from 0 again.
----------------------------------------------------------------------------------------*/
function PressedDuration(keyName){
  return gInputs[ToKc(keyName)];
}
/*----------------------------------------------------------------------------------------
 ☆★ Is the key input start state? ★☆

 Gets whether the key specified by <keyName> has begun to be pressed. Returns true only when frames start to be pressed
 I will. If you specify a negative number (if omitted) for <keyName>, it will react to any key.
----------------------------------------------------------------------------------------*/
function IsPressed(keyName){
  keyName = InitArg(keyName, -1);
  if(keyName < 0){
    for(i = 0; i < gInputs.length; i++){
      if(gInputs[i] == 1) return true;
    }
    return false;
  }
  return gInputs[ToKc(keyName)] == 1;
}
/*----------------------------------------------------------------------------------------
 ☆★ Is the key pressed? ★☆

 Gets whether the key specified by <keyName> is pressed. Returns true from pressed until released.
 Masu. If you specify a negative number (if omitted) for <keyName>, it will react to any key.
----------------------------------------------------------------------------------------*/
function IsHolded(keyName){
  keyName = InitArg(keyName, -1);
  if(keyName < 0){
    for(i = 0; i < gInputs.length; i++){
      if(gInputs[i] > 0) return true;
    }
    return false;
  }
  return gInputs[ToKc(keyName)] > 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ Does the key give input? ★☆

 Gets whether the key specified by <keyName> gives input. When you start pressing a key and when you repeat the key
 If it is inside, it is considered to be "giving input". If you specify a negative number (if omitted), which
 It also responds to keys.
----------------------------------------------------------------------------------------*/
function IsInputting(keyName){
  keyName = InitArg(keyName, -1);
  if(keyName < 0){
    for(i = 0; i < gInputs.length; i++){
      if(gInputs[i] == 1) return true;
      if((gInputs[i] - KEY_CHARGE_DURATION - 1) % KEY_REPEAT_SPAN == 0) return true;
    }
    return false;
  }
  var keyCode = ToKc(keyName);
  if(gInputs[keyCode] <= KEY_CHARGE_DURATION) return gInputs[keyCode] == 1;
  return (gInputs[keyCode] - KEY_CHARGE_DURATION - 1) % KEY_REPEAT_SPAN == 0;
}
/*----------------------------------------------------------------------------------------
 ☆★ Convert a string to a keycode (TO KeyCode) ★☆

 Returns the code for the key specified by <keyString>. Returns 0 if no corresponding key is found for <keyString>
 I will. Keys with multiple key codes (for example, the number '0' key codes are 48 and 96 (number pad))
 If so, it returns one representative code.
----------------------------------------------------------------------------------------*/
function ToKc(keyString){
  switch(keyString){
  case 'Break':      return   3; break;
  case 'BackSpace':  return   8; break;
  case 'Tab':        return   9; break;
  case 'Enter':      return  13; break;
  case 'Shift':      return  16; break;
  case 'Ctrl':       return  17; break;
  case 'Alt':        return  18; break;
  case 'Pause':      return  19; break;
  case 'Esc':        return  27; break;
  case 'Space':      return  32; break;
  case 'PageUp':     return  33; break;
  case 'PageDown':   return  34; break;
  case 'End':        return  35; break;
  case 'Home':       return  36; break;
  case 'Left':       return  37; break;
  case 'Up':         return  38; break;
  case 'Right':      return  39; break;
  case 'Down':       return  40; break;
  case 'Insert':     return  45; break;
  case 'Delete':     return  46; break;
  case '0':          return  48; break;
  case '1':          return  49; break;
  case '2':          return  50; break;
  case '3':          return  51; break;
  case '4':          return  52; break;
  case '5':          return  53; break;
  case '6':          return  54; break;
  case '7':          return  55; break;
  case '8':          return  56; break;
  case '9':          return  57; break;
  case 'A':          return  65; break;
  case 'B':          return  66; break;
  case 'C':          return  67; break;
  case 'D':          return  68; break;
  case 'E':          return  69; break;
  case 'F':          return  70; break;
  case 'G':          return  71; break;
  case 'H':          return  72; break;
  case 'I':          return  73; break;
  case 'J':          return  74; break;
  case 'K':          return  75; break;
  case 'L':          return  76; break;
  case 'M':          return  77; break;
  case 'N':          return  78; break;
  case 'O':          return  79; break;
  case 'P':          return  80; break;
  case 'Q':          return  81; break;
  case 'R':          return  82; break;
  case 'S':          return  83; break;
  case 'T':          return  84; break;
  case 'U':          return  85; break;
  case 'V':          return  86; break;
  case 'W':          return  87; break;
  case 'X':          return  88; break;
  case 'Y':          return  89; break;
  case 'Z':          return  90; break;
  case 'Windows':    return  91; break;
  case 'Menu':       return  93; break;
  case '*':          return 106; break;
  case '+':          return 107; break;
  case 'F1':         return 112; break;
  case 'F2':         return 113; break;
  case 'F3':         return 114; break;
  case 'F4':         return 115; break;
  case 'F5':         return 116; break;
  case 'F6':         return 117; break;
  case 'F7':         return 118; break;
  case 'F8':         return 119; break;
  case 'F9':         return 120; break;
  case 'F10':        return 121; break;
  case 'F11':        return 122; break;
  case 'F12':        return 123; break;
  case 'NumLock':    return 144; break;
  case 'ScrollLock': return 145; break;
  case ':':          return 186; break;
  case ';':          return 187; break;
  case ',':          return 188; break;
  case '-':          return 189; break;
  case '.':          return 190; break;
  case '/':          return 191; break;
  case '@':          return 192; break;
  case '[':          return 219; break;
  case '¥¥':         return 220; break;
  case ']':          return 221; break;
  case '^':          return 222; break;
  default:           return   0; break;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Display on console ★☆

 Displays the <value> contents in the console. If you specify a variable name as a string in <variableName>, the variable name is
 is clearly stated, making it easier to see.

 var a = [1, 2, 3];
 p(a); //=> 1,2,3
 p(a, "a"); //=> <a> = 1,2,3
----------------------------------------------------------------------------------------*/
function p(value, variableName){
  // If the console is not open, open

  if(typeof gConsole === 'undefined') openConsole();
  else if(gConsole.closed) openConsole();
  // Conversion of strings

  value = "" + value;  // String

  value = value.replace(/</g, '&lt;');
  value = value.replace(/>/g, '&gt;');
  if(typeof variableName !== 'undefined'){
    variableName = "" + variableName;  // String

    variableName = variableName.replace(/</g, '&lt;');
    variableName = variableName.replace(/>/g, '&gt;');
  }
  // Show on console

  if(typeof variableName !== 'undefined'){
    gConsole.document.write('&lt;' + variableName + '&gt; = ');
  }
  gConsole.document.write(value + '<br>');
  // Scroll to the bottom

  gConsole.scroll(0, 16777215);
}
/*----------------------------------------------------------------------------------------
 ☆★ Start of console window ★☆

 Open the console window. It will open automatically within p if necessary.
----------------------------------------------------------------------------------------*/
function openConsole(){
  var cwOptions = 'width=480, height=160, menubar=no, toolbar=no, scrollbars=yes';
  var cwStyle = '<span style="font-size:8pt;font-family:ＭＳ ゴシック,monospace">';
  gConsole = window.open('about:blank', 'console', cwOptions);
  gConsole.document.write(cwStyle);
}
/*----------------------------------------------------------------------------------------
 ☆★ Get defined or default value ( INITialize ARGument ) ★☆

 If no value is defined for <variable>, return <defaultValue> as the default value.
----------------------------------------------------------------------------------------*/
function InitArg(variable, defaultValue){
  return (typeof variable === 'undefined') ? defaultValue : variable;
}
/*----------------------------------------------------------------------------------------
 ☆★ Display text ★☆

 Displays the character <text> in the text box with the ID specified by <textBoxId>.
----------------------------------------------------------------------------------------*/
function Say(textBoxId, text){
  document.getElementById(textBoxId).value = text;
}
/*----------------------------------------------------------------------------------------
 ☆★ Express ★☆
----------------------------------------------------------------------------------------*/
function ShowImage(imageId){
  document.getElementById(imageId).style.display = "inline";
}
/*----------------------------------------------------------------------------------------
 ☆★ Display image ★☆

 The address of the image specified by <imageId> is set to <src>. If the address does not change, then nothing will be done.
----------------------------------------------------------------------------------------*/
function SetImage(imageId, src){
  if(document.getElementById(imageId).src != src){
    document.getElementById(imageId).src = src;
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Get the specified part of the elapsed time (Elapsed HOURs/MINutes/SEConds/MilliSEConds) ★☆

 Returns the value for the hour/minute/second/millisecond portion of the time since startup. Elapsed time is the number of frames elapsed
 Since this is a value calculated from, there may be some errors in actual time.

 ◎ If 1 hour, 23 minutes, 45.678 seconds have passed since startup
 p(EHour()); //=> 1
 p(EMin()); //=> 23
 p(ESec()); //=> 45
 p(EMSec()); //=> 678
----------------------------------------------------------------------------------------*/
function EHour(){return Math.floor(gFrames / FPS / 3600); }
function EMin() {return Math.floor(gFrames / FPS / 60) % 60; }
function ESec() {return Math.floor(gFrames / FPS) % 60; }
function EMSec(){return Math.floor(gFrames / FPS * 1000) % 1000; }
/*----------------------------------------------------------------------------------------
 ☆★ Get elapsed time in seconds (Elapsed TIME) ★☆

 Returns the time since startup in seconds. The decimal part is also returned. Like EHour() etc., the actual
 There may be some errors over time.
----------------------------------------------------------------------------------------*/
function ETime(){
  return gFrames / FPS;
}
/*----------------------------------------------------------------------------------------
 ☆★ Convert and retrieve elapsed time to a string (Elapsed Time STRing) ★☆

 Returns the time elapsed since launching in a general time expression. Like EHour() etc, it is more than actual time.
 There is a small error.

 ◎ If 1 hour, 23 minutes, and 45 seconds have passed since startup
 p(EtStr()); //=> '01:23:45'
------------------------------------------------------------------------------------------
 Specify the number of digits of time with <hLength> (default 2). If the number of digits is not enough, set the empty part to 0.
 I'll fill it up. If it is greater than the number of digits, leave the time portion as is.

 ◎ If 10 hours have passed since startup
 p(EtStr(4)); //=> '0010:00:00'
 p(EtStr(3)); //=> '010:00:00'
 p(EtStr(2)); //=> '10:00:00'
 p(EtStr(1)); //=> '10:00:00'
------------------------------------------------------------------------------------------
 <hDelim>(default ':' ), <mDelim>(default ':' ), and <sDelim>(default '' ) are hours, minutes, and seconds respectively
 The delimiter (Hour/Minute/Second DELIMiter).

 ◎ If 1 hour, 23 minutes, and 45 seconds have passed since startup
 p(EtStr(1, 'hour', 'min', 'second')); //=> '1 hour 23 minutes 45 seconds'
------------------------------------------------------------------------------------------
 <msLength> (default 0) allows you to specify how many decimal places the seconds are to be strings.

 ◎ If 1 hour, 23 minutes, 45.666 seconds have passed since startup
 p(EtStr(undefined, undefined, undefined, undefined, undefined, 0)); //=> '01:23:45'
 p(EtStr(undefined, undefined, undefined, '.', 1)); //=> '01:23:45.6'
 p(EtStr(undefined, undefined, undefined, undefined, '.', 2)); //=> '01:23:45.66'
 p(EtStr(undefined, undefined, undefined, '.', 3));        //=> '01:23:45.666'
----------------------------------------------------------------------------------------*/
function EtStr(hLength, hDelim, mDelim, sDelim, msLength){
  hLength = InitArg(hLength, 2);
  hDelim = InitArg(hDelim, ':');
  mDelim = InitArg(mDelim, ':');
  sDelim = InitArg(sDelim, '');
  msLength = InitArg(msLength, 0);

  var result = '';
  for(var i = hLength - 1; i >= 1; i--){
    if(EHour() < Math.pow(10, i)) result += '0'
  }
  result += EHour() + hDelim;
  result += ('0' + EMin()).slice(-2) + mDelim;
  result += ('0' + ESec()).slice(-2) + sDelim;
  result += (('00' + EMSec()).slice(-3)).slice(0, msLength);
  return result;
}
/*----------------------------------------------------------------------------------------
 ☆★ Round/Truncate/Run up at the specified decimal point ★☆

 Round/Truncate/Run up the number <n>.
------------------------------------------------------------------------------------------
 If <place> is 0 (default), then it becomes an integer, and if it is a positive number, it becomes a <place> digit.
 I will. A negative number is specified to process the integer part of the -<place> column.

 p(Round(1234.5678)) //=> 1235
 p(Round(1234.5678, 2)) //=> 1234.57
 p(Round(1234.5678, -2)) //=> 1200
------------------------------------------------------------------------------------------
 Rounding errors are automatically corrected by Justify.
----------------------------------------------------------------------------------------*/
function Round(n, place){
  place = InitArg(place, 0);
  return Justify(Math.round(n * Math.pow(10, place)) / Math.pow(10, place));
}
//----------------------------------------------------------------------------------------
function Floor(n, place){
  place = InitArg(place, 0);
  return Justify(Math.floor(n * Math.pow(10, place)) / Math.pow(10, place));
}
//----------------------------------------------------------------------------------------
function Ceil(n, place){
  place = InitArg(place, 0);
  return Justify(Math.ceil(n * Math.pow(10, place)) / Math.pow(10, place));
}
/*----------------------------------------------------------------------------------------
 ☆★ Correcting rounding errors ★☆

 Correct the rounding error for <n> and return it. Rounding error is the smallest possible occurrence of a computer when calculating decimals.
 It refers to error.

 p(0.01 + 0.05); //=> 0.0600000000005
 p(Justify(0.01 + 0.05)); //=> 0.06
------------------------------------------------------------------------------------------
 Specifically, the significant numbers are rounded to 15 digits. Originally, significant numbers are 16 or more digits
 In the case of this, an unintended change in value may occur.
----------------------------------------------------------------------------------------*/
function Justify(n){
  // If it is exactly 0, it will return as is (because log(0) is not defined)

  if(n == 0) return 0;
  // Convert to positive numbers

  var pn = Math.abs(n);
  // Corrected to 15 digit integers

  var cl = Math.floor(Math.log(pn) / Math.LN10);  // Common Logarithm

  pn = Math.round(pn * Math.pow(10, 14 - cl));
  // String

  var result = "" + pn;
  var zeros = "";
  // Add decimal points to the appropriate position

  if(0 <= cl && cl <= 14){
    result = result.slice(0, cl + 1) + "." + result.slice(cl + 1);
  }else if(cl < 0){
    // Add "0.000..." to the beginning

    for(var i = 0; i < Math.abs(cl) - 1; i++) zeros += "0";
    result = "0." + zeros + result;
  }else{
    // Add "000..." to the end

    for(var i = 15; i < cl; i++) zeros += "0";
    result = result + zeros;
  }
  // Return to the number again

  return parseFloat(result) * (n > 0 ? 1 : -1);
}
/*----------------------------------------------------------------------------------------
 ☆★ Generation of RANDom number ★☆

 Returns random numbers that are greater than or equal to 0 <n> as integers. If <n> is specified as 0 (default), then 0 or more and less than 1
 Returns a random number as a real number.
------------------------------------------------------------------------------------------
 If an integer greater than 1 is specified for <times>, create and return <times> random number arrays to avoid duplicates.
 Masu. If <times> is greater than <n>, a non-overlapping random array is repeatedly generated.

 p(Rand(5, 2)) //=> 4,2
 p(Rand(5, 5)) //=> 2,0,3,1,4
 p(Rand(5, 15)) //=> 1,2,0,3,4,2,1,0,4,3,0,1,4,3,2

 *The result changes with each call.
----------------------------------------------------------------------------------------*/
function Rand(n, times){
  n = InitArg(n, 0);
  times = InitArg(times, 0);

  if(times <= 0){
    // Return as value

    if(n <= 0) return Math.random();
    return Math.floor(Math.random() * n);
  }else{
    // Return as an array

    var result = [];
    var sequence;
    var choice;
    while(true){
      sequence = [];
      // Create a sequential array

      for(var i = 0; i < n; i++) sequence.push(i);
      // Randomly extract from a sequence number array

      for(var i = 0; i < n; i++){
        choice = Math.floor(Math.random() * sequence.length);
        result.push(sequence[choice]);
        // Finish when the number is required

        if(result.length == times) return result;
        // Delete extracted elements

        sequence = sequence.slice(0, choice).concat(sequence.slice(choice + 1));
      }
    }
  }
}
/*----------------------------------------------------------------------------------------
 ☆★ Save to cookies ★☆

 Write information in a cookie. Name in <name>, value in <value>, and expireDays>
 Specify the number of days until (default is 7305 (approximately 20 years). The data to be written is
 It will be formatted like "Name=value; expires=expire;".
------------------------------------------------------------------------------------------
 If your browser specifies that cookie deadlines or disallows it, that will take priority.
----------------------------------------------------------------------------------------*/
function Save(name, value, expireDays){
  expireDays = InitArg(expireDays, 7305);

  // Creating a saved string

  var s = encodeURIComponent(name) + "="
  s += encodeURIComponent(value) + "; expires=";
  // Setting expiration date

  var xpDate = new Date().getTime();  // eXPire DATE

  xpDate -= 60000 * new Date().getTimezoneOffset();
  xpDate += expireDays * 86400000;
  s += new Date(xpDate).toUTCString();
  // keep

  document.cookie = s;
}
/*----------------------------------------------------------------------------------------
 ☆★ Load from cookies ★☆

 Loads the cookie and returns the value corresponding to the name <name>. If the specified name does not exist
 Returns <defaultValue>.
----------------------------------------------------------------------------------------*/
function Load(name, defaultValue){
  var cookieStr = document.cookie;  // COOKIE STRing

  var namePos = cookieStr.indexOf(name);  // NAME POSition

  if(namePos == -1) return defaultValue;

  var si = namePos + name.length + 1;   // Start Index

  var ei = cookieStr.indexOf(';', si);  // End Index

  ei = (ei == -1) ? cookieStr.length : ei;
  return decodeURIComponent(cookieStr.substring(si, ei));
}
/*----------------------------------------------------------------------------------------
 ☆★ Main loop ★☆

 After a time equivalent to one frame (1/<FPS> seconds) has passed, in-frame processing is performed. Initialization and distribution
 As a general rule, all other than insertions (key input, etc.) are processed within this loop.
----------------------------------------------------------------------------------------*/
function MainLoop(){
  // Frame progress determination
  // Since setInterval is low in accuracy, frame progression is determined separately to manage time.

  if(new Date() - gStartTime < 1000 / FPS * gFrames) return;
  gFrames++;
  // Manage pressed keys

  for(var i = 0; i < 256; i++) if(gInputs[i] >= 0) gInputs[i]++;
  // Intra-frame processing. Please define it on the caller

  Main();
}
/*----------------------------------------------------------------------------------------
 ☆★ End processing ★☆

 This is the process that is automatically executed when you move to another page or close it.
----------------------------------------------------------------------------------------*/
window.onbeforeunload = function(){
  // Close if the console is open

  if(typeof gConsole !== 'undefined') if(!gConsole.closed) gConsole.close();
}
/*----------------------------------------------------------------------------------------
 ☆★ Start ★☆

 It is called first. It initializes and starts the main loop.
----------------------------------------------------------------------------------------*/
function Execute(){
  // Initialization processing within the module

  gStartTime = new Date();
  gFrames = 0;
  gInputs = []; for(var i = 0; i < 256; i++) gInputs.push(-1);
  // Initialization process. Please define it on the caller

  Setup();
  // Start the timer

  gTimer = setInterval('MainLoop()', LOOP_INTERVAL)
}
/*----------------------------------------------------------------------------------------
 ☆★ Object: Layer ★☆

 The blocks specified using div tags, etc. are treated as layers. When initializing, <id> is the block id
 (the my_layer part of <div id="my_layer">).
----------------------------------------------------------------------------------------*/
function Layer(id){
  this.layer = document.getElementById(id);
  /*
  I've specified absolute coordinates here, but I'll specify absolute coordinates as soon as possible using a style sheet
  Good job. Example: <div id="my_layer" style="position: absolute;"></div>
  */
  this.layer.style.position = "absolute";
}
/*----------------------------------------------------------------------------------------
 ☆★ Express ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.Show = function(){
  this.layer.style.visibility = "visible";
};
/*----------------------------------------------------------------------------------------
 ☆★ Hide ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.Hide = function(){
  this.layer.style.visibility = "hidden";
};
/*----------------------------------------------------------------------------------------
 ☆★ Move to the specified position ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.MoveTo = function(x, y){
  this.layer.style.left = x;
  this.layer.style.top = y;
};
/*----------------------------------------------------------------------------------------
 ☆★ Move by the specified amount ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.MoveBy = function(dX, dY){
  this.layer.style.left = parseFloat(this.layer.style.left) + dX;
  this.layer.style.top = parseFloat(this.layer.style.top) + dY;
};
/*----------------------------------------------------------------------------------------
 ☆★ Size change ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.ResizeTo = function(width, height){
  this.layer.style.width = width;
  this.layer.style.height = height;
};
/*----------------------------------------------------------------------------------------
 ☆★ Resize by specifying relative values ★☆
----------------------------------------------------------------------------------------*/
Layer.prototype.ResizeBy = function(dWidth, dHeight){
  this.layer.style.width = parseFloat(this.layer.style.width) + dWidth;
  this.layer.style.height = parseFloat(this.layer.style.height) + dHeight;
};
/*----------------------------------------------------------------------------------------
 ☆★ Fill in text (HTML source) ★☆

 Enter the <text> in the layer. If <overwrites>=true, overwrite, if false, add.
----------------------------------------------------------------------------------------*/
Layer.prototype.Write = function(text, overwrites){
  overwrites = InitArg(overwrites, true);

  if(overwrites) this.layer.innerHTML = text;
  else this.layer.innerHTML += text;
};

/*

// Initialize variables for the lock timer
let lockTimerDuration = 3000; // Lock time in milliseconds (3 seconds)
let lockTimerInterval;
let lockTimerStartTime;

// Function to start the lock timer
function startLockTimer() {
  lockTimerStartTime = Date.now();
  lockTimerInterval = setInterval(updateLockTimer, 16); // Update every ~16ms (60 FPS)
}

// Function to update the progress bar
function updateLockTimer() {
  const elapsedTime = Date.now() - lockTimerStartTime;
  const progress = Math.min((elapsedTime / lockTimerDuration) * 100, 100); // Calculate percentage
  document.getElementById("lock_timer_bar").style.width = progress + "%";

  // Stop the timer when it reaches 100%
  if (progress >= 100) {
    clearInterval(lockTimerInterval);
    lockPiece(); // Call the function to lock the piece
  }
}

// Function to stop the lock timer (e.g., if the piece moves or rotates)
function stopLockTimer() {
  clearInterval(lockTimerInterval);
  document.getElementById("lock_timer_bar").style.width = "0%"; // Reset the progress bar
}

// Example: Call startLockTimer() when the piece lands */