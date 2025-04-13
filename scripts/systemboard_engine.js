/*
MIT License

Copyright (c) 2020 Jeroen van Tilburg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// All code runs in this anonymous function
// to avoid cluttering the global variables
//(function() { 

/* ========== GLOBAL SECTION =================
   Global variables are defined here
   =========================================== */

// Set the version
var version     = "2.4";
var versionType = "standaard"; // prev, standaard, dev

// Mixed analog / digital
var low = 0.0, high = 5.0, loThreshold = 0.8, hiThreshold = 1.4; // from Systeembord manual
function isHigh(x) {return x >= hiThreshold; };
function isLow(x) {return x < loThreshold; }; 
function invert(x) {return isHigh(x) ? low : high; };

var clockPeriod   = 50; // time between evaluate-calls (speed of the engine)
var snapTolerance = 12; // snap wire to node
var edgedetection = 10; // snap components

// Sizes of the elements
var boxWidth = 150, boxHeight=100, boxHeightSmall = 50;

// Colors of the wires
var wireColor = '#dd0000';
var activeWireColor = '#ffff00';

var HVColor = '#444444';

// Globals for the temperature and heater
var heatTransfer = 100;        // Means that Tmax=40
var heatCapacity = 5000;       // Determines speed of heating
var temperatureInside = [15.0, 15.0, 15.0, 15.0, 15.0];  // Celcius
var temperatureOutside = 15.0; // Celcius
var powerHeater = 2500;        // Watt

// Global event counter for loop protection
var eventCounter = 0;

// Global flag for rendering
var renderNeeded = true;

// Global flag to color wires when high
var wireColors = false;

// Global flag to fix position of components
var moveComponents = false;

// Global flag to delete components on mouse click
var deleteComponents = false;

// Global list with all elements (components of the systemboard)
var elements = [];  

// Create canvas
var canvas = this.__canvas = new fabric.Canvas('c', { selection: false, backgroundColor: 'white',
                                                      allowTouchScrolling: true,
                                                      preserveObjectStacking: true });
fabric.Object.prototype.originX = fabric.Object.prototype.originY = 'center';
fabric.Object.prototype.hasControls = false;
fabric.Object.prototype.hasBorders = false;
fabric.Text.prototype.objectCaching = false; // Create less blurry text
fabric.Text.prototype.fontFamily = "Arial";


/* ========== SHARED FUNCTIONS ===============
   
   =========================================== */


/* ========== AUDIO SECTION ====================
   Start the audioContext and set the microphone
   ============================================= */

// Set empty AudioContext, etc
var audioCtx = null, oscillator = null, gainNode = null;

// audioContext starts always in suspended mode in iOS/Safari. 
// Requires user interaction (event) to resume.
function unlockAudioContext(context) {
  //console.log("AudioContext. State="+context.state);
  if (context.state === "running") return;
  const b = document.body;
  const events = ["touchstart", "touchend", "mousedown", "keydown"];
  events.forEach(e => b.addEventListener(e, unlock, false));
  function unlock() {context.resume().then(clean);}
  function clean() {
    events.forEach(e => b.removeEventListener(e, unlock));
    console.log("AudioContext unlocked. State="+context.state);
  }
}

// Initialize AudioContext for buzzer and microphone
try {
  audioCtx = new (window.AudioContext || window.webkitAudioContext );
} catch (e) {
  alert('Web Audio API not supported by your browser. Please, consider upgrading to '+
        'the latest version or downloading Google Chrome or Mozilla Firefox');
}
    
// Create the gain node for the buzzer sound
if( audioCtx ) {
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  unlockAudioContext( audioCtx );
}

// Play a buzzing sound (until stopBuzzer is called)
function startBuzzer() {
  if( audioCtx && gainNode ) {
    if (audioCtx.state == 'suspended') {
      audioCtx.resume().then( function() {
        oscillator = audioCtx.createOscillator();      
        oscillator.connect(gainNode);
        oscillator.start();
      });
    } else {
      oscillator = audioCtx.createOscillator();      
      oscillator.connect(gainNode);
      oscillator.start();
    }
  }
}

// Stop the buzzer
function stopBuzzer() {
  if( oscillator ) oscillator.stop();
}

// Connect volume from the microphone to the external function updateVolume 
function startMicrophone( updateVolume ) {
  let tmp = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(function(stream) {
      var analyser = audioCtx.createAnalyser();
      var microphone = audioCtx.createMediaStreamSource(stream);
      var javascriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioCtx.destination);
      javascriptNode.onaudioprocess = function() {
        var array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        var values = 0;
        var length = array.length;
        for (var i = 0; i < length; i++) { values += array[i]; };
        var soundLevel = values / length;
        updateVolume( Math.min(0.05 * soundLevel, 5.0)) ;
      }
    });
  return tmp;
}


/* ========== VIDEO SECTION ====================
   Start the webcam
   ============================================= */

const canvas2 = document.createElement('canvas');
const video = document.querySelector('video');

function startVideo() {
  let tmp = navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    .then(function(stream) {
      video.srcObject = stream;
      return new Promise(resolve => video.onloadedmetadata = resolve);
    });
  return tmp;
}

function calculateBrightness() {

  // Start the video (needed by Safari when video not visible on screen)
  video.play();
  
  canvas2.width = video.videoWidth;
  canvas2.height = video.videoHeight;
  var ctx = canvas2.getContext('2d');

  ctx.drawImage(video, 0, 0);
  var colorSum = 0;
  
  // get image data from top left to bottom right                
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var data = imageData.data;
  
  // read rgb values         
  for (var i = 0, len = data.length; i < len; i += 4) {
    // give R, G and B different weights due to human eye sensitivity
    colorSum += Math.floor((3*data[i] + 10*data[i+1] + data[i+3]));
  }
  // Divide by number of pixels and set between 0 and 5V
  var brightness = colorSum * 5.0 / (18*canvas2.width * canvas2.height*255);
  return brightness;
}


/* ========== DRAWING SECTION ==================
   General functions to draw wires, buttons, etc
   ============================================= */

// Make movable circle for wire
function makeCircle(left, top, line1, node, color){
  var c = new fabric.Circle({left: left, top: top, radius: 3, fill: color, padding: 7});
  c.name = "wire";
  c.line1 = line1;
  c.node = node;
  c.connection = null;
  return c;
}

// Make line for wire
function makeLine(coords, color, node) {
  var line = new fabric.Line(coords, {
    stroke: color,
    strokeWidth: 3,
    node: node // Store the node for later use
  });

  return line
}

// Make wire (= movable circle + line + fixed circle)
function makeWire(x1,y1,node,isHV=false) { 
  var color = isHV ? HVColor : wireColor;

  var line = makeLine([x1, y1, x1, y1], color, node); // Pass the node
  canvas.add(line);

  let endCircle = makeCircle(x1, y1, line, node, color);
  canvas.add(endCircle);

  return endCircle;
}

// Helperfunction to change the wrire color
function updateWireColor(wire) {
  var line = wire.line1;
  var isActive = isHigh(wire.node.eval()) && wireColors; // Update only when wireColors is enabled
  var isHV = wire.node.isHV;

  // Only if the color needs to change
  if ((isActive && line.stroke !== activeWireColor) || (!isActive && line.stroke === activeWireColor)) {
    line.set({
      stroke: isHV ? HVColor : (isActive ? activeWireColor : wireColor)
    });
    renderNeeded = true;
  }
}

// Set nice-looking gradients for buttons
var gradientButtonUp = { x1: -10, y1: -10, x2: 20, y2: 20,
                         colorStops: { 0: 'white', 1: '#333333' }};
var gradientButtonDw = { x1: -10, y1: -10, x2: 22, y2: 22,
                         colorStops: { 0: '#333333', 1: 'white' }};

// Draw a push button
function drawButton(left, top, node){
  let c = new fabric.Circle({left: left, top: top, strokeWidth: 3, stroke: 'grey', radius: 10,
                             fill: '#222222', selectable: false });
  c.setGradient('stroke', gradientButtonUp );
  c.name = "button";
  c.node = node;
  
  let longPressTimer = 0;
  
  // Event listener: Change button color and state of OutputNode when pushed
  c.on('mousedown', function() {
    c.node.state = high;
    c.set({ fill: '#333333'});
    c.setGradient('stroke', gradientButtonDw );
    const d = new Date();
    longPressTimer = d.getTime();
  });
  
  // Event listener: Change button color and state of OutputNode to low when mouse is up
  c.on('mouseup', function() {
    // Only update the button if it was a short press
    const d = new Date();
    if( d.getTime()-longPressTimer < 500 ) {
      // a mouse-click can be too short for the engine to evaluate itself
      setTimeout(function(){ c.node.state = low; renderNeeded = true}, clockPeriod+5); // add small delay
      c.set({ fill: '#222222'});
      c.setGradient('stroke', gradientButtonUp );
    }
  });
  
  return c;
}    

// Draw a toggle button
function drawToggle(left, top, node){
  let c = new fabric.Circle({left: -10, top: 0, strokeWidth: 1, stroke: 'darkgrey', radius: 8 });
  c.setGradient('fill', gradientButtonDw );
  let r = new fabric.Rect( {left: 0, top: 0, strokeWidth: 2, rx: 10, ry: 10,
                            width: 40, height: 20, fill: '#aa0000' } );
  r.setGradient('stroke', gradientButtonUp );
  let g = new fabric.Group([ r, c ], { left: left, top: top, selectable: false });
  g.name = "toggle";
  g.node = node;
  
  // Event listener: Change position/color of switch and state of OutputNode when pushed
  g.on('mousedown', function() {
    g.node.state = invert(g.node.state);
    // console.log( g.node.state );
    if( isHigh( g.node.state ) ) {
      g.item(0).set({ fill: 'green'});
      g.item(1).set({left: 10} );
    } else {
      g.item(0).set({ fill: '#aa0000'});
      g.item(1).set({ left: -10});
    }
    renderNeeded = true;
  });
    
  return g;
}

function drawText(x1,y1,text,fontsize=10){
  // Draw text
  var txt = new fabric.Text(text, {left: x1, top: y1, originX: 'left', originY: 'bottom', 
                                   fontSize: fontsize });
  return txt;
}


// Draw the box plus text
function drawBoxAndText(x1,y1,width,height,text) {
  // Draw text and box
  var textbox = new fabric.Textbox(text, { left: 0.5*width, top: height-10, width: width,
                                            fontSize: 12, textAlign: 'center' });
  var r = new fabric.Rect({left: 0.5*width, top: 0.5*height, height: height, width: width, 
                           fill: 'lightgrey', stroke: 'black', strokeWidth: 1   });  
  var group = new fabric.Group([ r, textbox ], { left: x1+0.5*width, top: y1+0.5*height });
  return group;
}

function drawBoxWithSymbol(x1,y1,text){
  // Draw text and box
  var txt = new fabric.Textbox(text, { left: 0, top: 0, fontSize: 16, textAlign: 'center' });
  var r = new fabric.Rect({left: 0, top: 0, height: 30, width: 30, 
                           fill: 'lightgrey', stroke: 'black', strokeWidth: 1 });
  var group = new fabric.Group([ r, txt ], { left: x1, top: y1 });
  return group;
}

function drawLine(coords){
  var line = new fabric.Line(coords, {stroke: 'black', strokeWidth: 1 });
  return line;
}

function drawCircles(x1,y1,nodes,color) {
  var circles = [];
  for(var i=0; i<nodes.length; ++i) {
    var circ = new fabric.Circle({left: nodes[i].x1-x1, top: nodes[i].y1-y1, strokeWidth: 4, 
                                  stroke: color , radius: 5, fill: "darkgrey"});
    circles.push(circ);
    // Add red/grey dot for output nodes
    if( !(nodes[i].isInput) ) {
      var color2 = nodes[i].isHV ? '#444444' : '#dd0000';
      var circRed = new fabric.Circle({left: nodes[i].x1-x1, top: nodes[i].y1-y1, radius: 3, 
                                       fill: color2});
      circles.push(circRed);
    }
  }
  return circles;
}


/* ============ NODE SECTION ==================
   Nodes are the terminals where the wires are 
   connected. 
   Two main types: input and output nodes.
   They have an x,y position.
   ============================================= */

// Generic input node
class InputNode {
  constructor(x1=0,y1=0, name="input", isHV=false) { 
    this.x1 = x1;
    this.y1 = y1;
    this.isHV = isHV;
    this.state = low; // only used by reset button of pulse counter
    this.isInput = true;
    this.child = null;
    this.uniqueName = name;
  }
  eval() { return (this.child) ? this.child.eval() : low ; };
}

// Generic output node (base class)
class OutputNode { 
  constructor(x1=0,y1=0, name="output", isHV=false) {
    this.x1 = x1;
    this.y1 = y1;
    this.isHV = isHV;
    this.state = low;
    this.isInput = false;     
    this.wires = [ makeWire(x1,y1,this,isHV) ];
    this.lastEvent = 0;
    this.uniqueName = name;
  }
  evalState() { return this.state; };
  eval() {
    // loop protection
    if( this.lastEvent != eventCounter ) {
      this.lastEvent = eventCounter;
      this.state = this.evalState();
    }
    return this.state;
  };
}

// AND node
class ANDNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) && isHigh(this.child2.eval()) ) ? high : low;
  };
}

// OR node
class ORNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) || isHigh(this.child2.eval()) ) ? high : low;
  };
}

// NOT node
class NOTNode extends OutputNode {
  constructor(x1,y1,input1) { 
    super(x1,y1);
    this.child1 = input1;
  }
  evalState() { return (isHigh(this.child1.eval()) ) ? low : high ; };
}    

// NAND node
class NANDNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) && isHigh(this.child2.eval()) ) ? low : high;
  };
}

// NOR node
class NORNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) || isHigh(this.child2.eval()) ) ? low : high;
  };
}

// XOR node
class XORNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) === isHigh(this.child2.eval()) ) ? low : high;
  };
}

// XNOR node
class XNORNode extends OutputNode {
  constructor(x1,y1,input1,input2) { 
    super(x1,y1);
    this.child1 = input1;
    this.child2 = input2;
  }
  evalState() {
    return (isHigh(this.child1.eval()) === isHigh(this.child2.eval()) ) ? high : low;
  };
}


// Comparator node
class ComparatorNode extends OutputNode {
  constructor(x1,y1,input1) { 
    super(x1,y1);
    this.child1 = input1;
  }
  evalState() { return (this.child1.eval() < this.compare) ? low : high ;};
}

// get bit from a decimal number
function getBit(number,bin) {
  var bit = (number & (1<<bin)) >> bin;
  return ( bit == 1 ) ? high : low ;
}

// Binary node from ADC
class BinaryNode extends OutputNode {
  constructor(x1,y1,input1,bin) {
    super(x1,y1,"output"+Math.pow(2,bin));
    this.child1 = input1;
    this.bin = bin;
  }
  evalState() {
    var binary = (this.child1.eval() / (high+0.01) ) * 16; // convert analog to 4b
    return getBit(binary,this.bin);
  }
}    

// Binary node with stored counter
class BinaryNodeS extends OutputNode { 
  constructor(x1,y1,bin) { 
    super(x1,y1, "output"+Math.pow(2,bin));
    this.bin = bin;
    this.counter = 0;
  }
  evalState() { return getBit(this.counter,this.bin); };
}    

// DAC node 
class DACNode extends OutputNode { 
  constructor(x1,y1,input0,input1,input2,input3) {
    super(x1,y1);
    this.child0 = input0;
    this.child1 = input1;
    this.child2 = input2;
    this.child3 = input3;
  }
  evalState() {
    var state = (isHigh(this.child0.eval()) ? 1 : 0) +
                (isHigh(this.child1.eval()) ? 2 : 0) +
                (isHigh(this.child2.eval()) ? 4 : 0) +
                (isHigh(this.child3.eval()) ? 8 : 0);
    return state*0.3125; 
  }; 
}

// Relais node 
class RelaisNode extends OutputNode { 
  constructor(x1,y1,input,name) {
    super(x1,y1,name,true);
    this.child = input;
  }
  evalState() { return this.child.eval(); }; 
}

// Light sensor node
class LightSensorNode extends OutputNode { 
  constructor(x1,y1,x2,y2) {
    super(x1,y1);
    this.xLDR = x2;
    this.yLDR = y2;
  }
}    


// output node for sound sensor
class SoundSensorNode extends OutputNode { 
  constructor(x1,y1,element) { 
    super(x1,y1);
    this.element = element;
    this.micStarted = false;
  }
  eval() { 
    // Initialize the microphone
    if( audioCtx ) {
      if( !this.micStarted ) {      
        this.micStarted = true;
        var _this = this;
        // Start the audio stream
        startMicrophone( function(vol) { _this.state=vol; } )
        .catch(function(err) {
          _this.element.textbox.setColor('darkgrey');
          renderNeeded = true;
          console.log("The following error occured: " + err.name);
        });
      } else if (audioCtx.state == 'suspended') {
        audioCtx.resume();
      }
    } else { // no audioCtx
      this.element.textbox.setColor('darkgrey');
      renderNeeded = true;
    }
    return this.state; 
  };
}    


// output node for webcam sensor
class WebcamNode extends OutputNode { 
  constructor(x1,y1,element) { 
    super(x1,y1);
    this.element = element;
    this.videoStarted = false;
    this.videoReady   = false;
  }
  eval() { 
    // Video is ready: calculate the brightness 
    if( this.videoReady ) {
      this.state = calculateBrightness();
    } else if( !this.videoStarted ) { // Initialize the video
      this.videoStarted = true;
      var _this = this;
      // Start the video stream
      startVideo().then(function(){ _this.videoReady = true; })      
      .catch(function(err) {
        _this.element.textbox.setColor('darkgrey');
        renderNeeded = true;
        console.log("The following error occured: " + err.name);
      });
    }
    return this.state; 
  };
}    


/* ============ ELEMENT SECTION ==================
   Elements are the building blocks (components)of 
   the systemboard.
   They have an x,y position.
   ============================================= */

// Create unique element name
function uniqueElementID(name, id=0) {
  var i = 0;
  while( i < elements.length && elements[i].uniqueName != name+id ) ++i;
  // When element is not unique, try again with higher id
  if( i != elements.length ) id = uniqueElementID(name,++id);
  return id;
}

// Base class for all elements
class Element { 
  constructor(x1,y1) {
    this.x = x1;
    this.y = y1;
    this.allowSnap = true;
    this.nodes = [];
    
    // Create unique element ID
    this.uniqueName = this.constructor.name + uniqueElementID( this.constructor.name );
  }
  output() { };
  remove() { };
  getXMLAttributes() { };
  
  drawGroup(x,y,groupList){
    this.group = new fabric.Group( groupList,
                                 {left: x, top: y,
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
    this.group.name = "element";
    this.group.element = this;
    canvas.add(this.group);
    // Move output wires back to front
    this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  };  
}


// Create empty board plus text
class Board extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.allowSnap = false;
    var r = new fabric.Rect({left: 0, top: 0, width: 640, height: 474, 
                             originX: 'left', originY: 'top',
                             fill: 'lightgrey', stroke: 'black', strokeWidth: 2   });
    var groupList = [ r, drawText(60, 21,"INVOER",16),
                         drawText(265, 21,"VERWERKING",16),
                         drawText(520, 21, "UITVOER",16) ];
    this.drawGroup(x1+320,y1+5+237, groupList);
    this.group.sendToBack();
  }  
}

// Create AND port with its nodes
class ANDPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new ANDNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'EN-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "&")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create OR port with its nodes
class ORPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new ORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'OF-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "\u22651")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create NOT port with its nodes
class NOTPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+0.5*boxHeightSmall );
    let node2 = new NOTNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, node1);
    this.nodes = [ node1, node2 ] ;     
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'invertor'),
                     drawLine([25, 0.5*boxHeightSmall, boxWidth-25, 0.5*boxHeightSmall]),
                     drawLine([15+0.5*boxWidth, -5+0.5*boxHeightSmall, 20+0.5*boxWidth, 0.5*boxHeightSmall]),
                     drawBoxWithSymbol(0.5*boxWidth, -7+0.5*boxHeightSmall, "1")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
}

// Create NAND port with its nodes
class NANDPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new NANDNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'NEN-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawLine([15+0.5*boxWidth, -5+0.5*boxHeight, 20+0.5*boxWidth, 0.5*boxHeight]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "&")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create NOR port with its nodes
class NORPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new NORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'NOF-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawLine([15+0.5*boxWidth, -5+0.5*boxHeight, 20+0.5*boxWidth, 0.5*boxHeight]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "\u22651")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create XOR port with its nodes
class XORPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new XORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'XOF-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "=1")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create XNOR port with its nodes
class XNORPort extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "input1" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "input2" );
    let node3 = new XNORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
    this.nodes = [ node1, node2 , node3 ] ;
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'XNOF-poort'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawLine([15+0.5*boxWidth, -5+0.5*boxHeight, 20+0.5*boxWidth, 0.5*boxHeight]),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "=1")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}

// Create memory cell with its nodes
class Memory extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25, "set" );
    let node2 = new InputNode(x1+25, y1+boxHeight-25, "reset" );
    let node3 = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeight);
    this.nodes = [ node1, node2, node3 ] ;     
  
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'geheugencel'),
                     drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                     drawLine([25, 25, 25, 40]),
                     drawLine([25, 40, 0.5*boxWidth, 40]),
                     drawLine([25, boxHeight-25, 25, boxHeight-40]),
                     drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                     drawText(35,31,"set"),
                     drawText(35,boxHeight-19,"reset"),
                     drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "M")]
                     .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
  
  output() { 
    if( isHigh(this.nodes[1].eval()) ) this.nodes[2].state = low;
    if( isHigh(this.nodes[0].eval()) ) this.nodes[2].state = high; // set always wins
  }
}

// Create flip flop with its nodes
class FlipFlop extends Element {
  constructor (x1, y1) {
    super(x1, y1);
    let node1 = new InputNode(x1 + 25, y1 + 0.5 * boxHeight);
    let node2 = new OutputNode(x1 + boxWidth - 25, y1 + 0.5 * boxHeight, node1);
    this.nodes = [node1, node2];
    this.previousFlip = false;

    var groupList = [
      drawBoxAndText(0, 0, boxWidth, boxHeight, 'flip flop'),
      drawLine([0.5 * boxWidth, 0.5 * boxHeight, boxWidth - 25, 0.5 * boxHeight]),
      drawLine([0.5 * boxWidth, 0.5 * boxHeight, 25, 0.5 * boxHeight]),
      drawText(18, 44, 'flip'),
      drawBoxWithSymbol(0.5 * boxWidth, 0.5 * boxHeight, 'FF')
    ].concat(drawCircles(x1, y1, this.nodes, 'blue'));

    this.drawGroup(x1 + 0.5 * boxWidth, y1 + 0.5 * boxHeight, groupList);
  }

  output() {
    let flip = isHigh(this.nodes[0].eval());
    let previousFlip = this.previousFlip;
    let output = this.nodes[1].state;

    this.previousFlip = flip;

    // Only when going from low to high
    if (flip === previousFlip || (flip === false && previousFlip === true)) return;

    // Flip the output node
    this.nodes[1].state = output === low ? high : low;
  }
}

// Create JK flip flop 
class JKFlipFlop extends Element {
  constructor(x1, y1) {
    super(x1, y1);
    let node1 = new InputNode(x1 + 25, y1 + 25);
    let node2 = new InputNode(x1 + 25, y1 + boxHeight - 25);
    let node3 = new OutputNode(x1 + boxWidth - 25, y1 + 0.5 * boxHeight);
    this.nodes = [node1, node2, node3];

    this.previousSet = false;
    this.previousReset = false;

    var groupList = [
      drawBoxAndText(0, 0, boxWidth, boxHeight, 'JK-flip flop'),
      drawLine([0.5 * boxWidth, 0.5 * boxHeight, boxWidth - 25, 0.5 * boxHeight]),
      drawLine([25, 25, 25, 40]),
      drawLine([25, 40, 0.5 * boxWidth, 40]),
      drawLine([25, boxHeight - 25, 25, boxHeight - 40]),
      drawLine([25, boxHeight - 40, 0.5 * boxWidth, boxHeight - 40]),
      drawText(35, 31, 'set'),
      drawText(35, boxHeight - 19, 'reset'),
      drawBoxWithSymbol(0.5 * boxWidth, 0.5 * boxHeight, 'JK')
    ].concat(drawCircles(x1, y1, this.nodes, 'blue'));

    this.drawGroup(x1 + 0.5 * boxWidth, y1 + 0.5 * boxHeight, groupList);
  }

  output() {
    const set = isHigh(this.nodes[0].eval());
    const reset = isHigh(this.nodes[1].eval());
    const currentOutput = this.nodes[2].state;

    // Only if set or reset has changed
    if (set === this.previousSet && reset === this.previousReset) return;

    let nextOutput = currentOutput;

    if (set && reset) {
      nextOutput = currentOutput === low ? high : low;
    } else if (set && !reset) {
      nextOutput = high;
    } else if (!set && reset) {
      nextOutput = low;
    }

    if (nextOutput !== currentOutput) this.nodes[2].state = nextOutput;

    this.previousSet = set;
    this.previousReset = reset;
  }
}

// Create random element
class Random extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1 + 25, y1 + 0.5 * boxHeightSmall);
    let node2 = new OutputNode(x1 + boxWidth - 25, y1 + 0.5 * boxHeightSmall, node1);
    this.nodes = [node1, node2];
    this.previousInput = false;

    var groupList = [
      drawBoxAndText(0, 0, boxWidth, boxHeightSmall, 'willekeurig'),
      drawLine([25, 0.5 * boxHeightSmall, boxWidth - 25, 0.5 * boxHeightSmall]),
      drawBoxWithSymbol(0.5 * boxWidth, -7 + 0.5 * boxHeightSmall, "W")
    ].concat(drawCircles(x1, y1, this.nodes,"blue"));

    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }

  output() {
    let input = isHigh(this.nodes[0].eval());
    let previousInput = this.previousInput;

    this.previousInput = input;

    // Only when going from low to high
    if (input === previousInput || (input === false && previousInput === true)) return;

    // Set the output node to a random state
    this.nodes[1].state = Math.random() < 0.50 ? high : low;
  }
}

// Create LED with node
class LED extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new InputNode(x1+25, y1+20 ) ] ;
    this.lastResult = 0.0;
    
    // Draw LED
    this.led = new fabric.Circle({left: boxWidth-25, top: 20, radius: 5, 
                                  fill: '#600000', stroke: 'black', strokeWidth: 2   });
    this.led.setGradient('stroke', gradientButtonDw );
    
    this.ledShine = new fabric.Circle({left: boxWidth-25, top: 20, radius: 19, opacity: 0.0 });
    this.ledShine.setGradient('fill', { type: 'radial', r1: this.ledShine.radius, r2: this.led.radius,
                                        x1: this.ledShine.radius, y1: this.ledShine.radius, 
                                        x2: this.ledShine.radius, y2: this.ledShine.radius,
                                        colorStops: { 1: 'rgba(255,0,0,0.3)', 0: 'rgba(0, 0, 0, 0)'} });
    
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'LED'), this.led, this.ledShine]
                    .concat(drawCircles(x1,y1,this.nodes, "white"));
    
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
  
  // Control LED behaviour
  output() {
    var result = this.nodes[0].eval();
    if( isHigh(result) && !isHigh(this.lastResult) ) {
      this.led.set({fill : 'red'});
      this.ledShine.set({opacity: 1.0 });
      renderNeeded = true;
    } else if( !isHigh(result) && isHigh(this.lastResult) ) {
      this.led.set({fill : '#600000'});            
      this.ledShine.set({opacity: 0.0 });
      renderNeeded = true;
    }
    this.lastResult = result;
  };

}

// Create sound output
class Buzzer extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new InputNode(x1+25, y1+0.5*boxHeightSmall) ] ;    
    this.lastResult = false; // Speaker is off

    // Draw speaker
    this.c1 = new fabric.Path('M 130 15 Q 135, 25, 130, 35', 
                             { fill: '', stroke: 'black', strokeWidth: 0 });
    this.c2 = new fabric.Path('M 135 10 Q 145, 25, 135, 40', 
                             { fill: '', stroke: 'black', strokeWidth: 0 });
    var r = new fabric.Rect({left: 117, top: 25, height: 20, width: 10, 
                             fill: 'lightgrey', stroke: 'black', strokeWidth: 1   });   
    var t = new fabric.Triangle({left: 120, top: 25, height: 15, width: 30, 
                           fill: 'lightgrey', angle:-90, stroke: 'black', strokeWidth: 1 });
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'zoemer'), this.c1,this.c2,t,r]
                     .concat(drawCircles(x1,y1,this.nodes, "white"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
  
  // Control buzzer behaviour
  output() {  
    var result = this.nodes[0].eval();
      if( isHigh(result) && !this.lastResult) {    
        this.lastResult = true;
        startBuzzer();
        this.c1.set({strokeWidth: 1});
        this.c2.set({strokeWidth: 1});
        renderNeeded = true;
      } else if(!isHigh(result) && this.lastResult) {
        this.lastResult = false;
        stopBuzzer();
        this.c1.set({strokeWidth: 0});
        this.c2.set({strokeWidth: 0});        
        renderNeeded = true;
      }
  };
}    

// Create switch
class Switch extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ;
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'drukschakelaar') ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);

    // Draw the push button
    this.button = drawButton(x1+25, y1+0.5*boxHeightSmall, this.nodes[0]);
    canvas.add(this.button);
  }
}

// Create toggle-switch
class ToggleSwitch extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ;
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'tuimelschakelaar') ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);

    // Draw the push button
    this.button = drawToggle(x1+30, y1+0.5*boxHeightSmall-3, this.nodes[0]);
    canvas.add(this.button);
  }
}

// Create an number-input DOM element
function inputDOM(x1,y1,name,value,step,min,max){
  var input = document.createElement("input"); input.type = "number"; 
  input.id = name; 
  input.name = name;
  input.value = value; input.step = step; input.min= min; input.max= max;
  input.style = "position:absolute;width:40px";
  input.style.left = (x1).toString()+"px";
  input.style.top = (y1).toString()+"px";
  input.className = "css-class-name"; // set the CSS class
  body = document.getElementById("canvas1");
  body.appendChild(input); // put it into the DOM  
  return input ;
}

// Create a placeholder for the input DOM element
function inputPlaceholder(x1,y1,input){

  // Draw the placeholder
  var rect = new fabric.Rect({left: 0, top: 0, height:18, width: 45, fill: 'white', 
                             originX: 'left', originY: 'top' });    
  var text = new fabric.Text(input.value, {left: 2, top: 4, fontSize: 11, 
                             originX: 'left', originY: 'top', fontFamily: 'system-ui, Arial' });    
  var placeholder = new fabric.Group([rect,text], {left: x1-1, top: y1+0.5, padding: -3, 
                             originX: 'left', originY: 'top', selectable: false, evented: true  });
  canvas.add(placeholder);
  
  // Show the placeholder on mouse click (touchscreen) or hover (mouse)
  placeholder.on({'mousedown':setInputVisible, 'mouseover':setInputVisible});
  function setInputVisible() {
    input.style.visibility = "visible";
    input.focus();      
  }

  // Hide the input DOM when not hovering (mouse) or after focus (touchscreen)
  input.style.visibility = "hidden";
  input.addEventListener("mouseleave", setInputHidden);
  input.addEventListener("focusout", setInputHidden); // after pressing enter
  function setInputHidden() {
    input.style.visibility = "hidden";
    // Make sure that input value is in the range with one decimal
    input.value = Math.max(input.min,Math.min(input.value, input.max)).toFixed(1);
    // Update placeholder text when changing the input DOM 
    text.set( {'text' : input.value.replace('.',',') });
    renderNeeded = true;
  }

  return placeholder;
}


// Create a pulse generator
class Pulse extends Element {
  constructor(x1,y1,params) {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ; 
        
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'pulsgenerator'), 
                     drawText(70,30,"Hz",12) ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow"));   
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
    
    // Create an input DOM element and placeholder
    var min = 0.1, max = 10, step = 0.1;
    var inputValue = params.hasOwnProperty("inputValue") ? params.inputValue : "1.0";
    this.input = inputDOM(x1+20,y1+10,this.uniqueName,inputValue,step,min,max);
    this.placeholder = inputPlaceholder(x1+20,y1+10,this.input);
    
    // Start the pulsgenerator
    this.timer = null;
    this.startPulse();  
  }
           
  // Start the pulse generator
  startPulse() {
    (this.nodes[0]).state = invert( (this.nodes[0]).state );
    var _this = this;
    this.timer = setTimeout(function() { _this.startPulse(); }, 500/(_this.input.value));
  }
  
  // Delete the dom element and stop the pulsing
  remove() {
    clearTimeout(this.timer);        // Stop the pulse generator
    this.input.remove();             // Remove the DOM element
    canvas.remove(this.placeholder); // Remove the placeholder
  }
  
  // Store additional XML attributes: the frequency
  getXMLAttributes() { return { inputValue : this.input.value.toString() }; }

}


// Variable voltage power
class VarVoltage extends Element {
  constructor(x1,y1,params) {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ; 
        
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'variabele spanning'), 
                      drawText(70,30,"V",12) ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow")); 
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);

    // Create an input DOM element and placeholder
    var inputValue = params.hasOwnProperty("inputValue") ? params.inputValue : "0.0";
    this.input = inputDOM(x1+20,y1+10,this.uniqueName,inputValue,"0.1","0","5");
    this.placeholder = inputPlaceholder(x1+20,y1+10,this.input);

    // set voltage from the DOM element
    this.nodes[0].state = this.input.value;
  }
  
  // Update voltage from the DOM element
  output() { this.nodes[0].state = parseFloat(this.input.value); };
  
  remove() { 
    this.input.remove();             // Delete the dom element 
    canvas.remove(this.placeholder); // Remove the placeholder
  }
  
  // Store additional XML attributes: the output voltage
  getXMLAttributes() { return { inputValue : this.input.value.toString() }; }

}


// Comparator
class Comparator extends Element {
  constructor(x1,y1,params) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new ComparatorNode(x1+boxWidth-25, y1+35, node1);
    this.nodes = [ node1, node2 ] ;     
    
    var r = new fabric.Triangle({left: 0.5*boxWidth, top: 35, height: 40, width: 40, 
                                 fill: 'lightgrey', angle:90, stroke: 'black', strokeWidth: 1 });
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeight,'comparator'),
                      drawLine([25, 25, 60, 25]),
                      drawLine([60, 35, boxWidth-25, 35]),
                      drawLine([40, 45, 60, 45]),
                      drawLine([40, 45, 40, 70]),
                      drawLine([40, 70, 70, 70]), r,
                      drawText(120, 80,"V",12),
                      drawText(57, 31,"+"),
                      drawText(57, 53,"\u2212") ]
                      .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
    
    // Create an input DOM element and placeholder
    var inputValue = params.hasOwnProperty("inputValue") ? params.inputValue : "2.5";
    this.input = inputDOM(x1+70,y1+60,this.uniqueName,inputValue,"0.1","0","5");
    this.placeholder = inputPlaceholder(x1+70,y1+60,this.input);

    // set reference voltage from the DOM element
    this.nodes[1].state = this.input.value;
  }
  
  // Update reference voltage from the DOM element
  output() { this.nodes[1].compare = this.input.value; };

  remove() { 
    this.input.remove();             // Delete the dom element 
    canvas.remove(this.placeholder); // Remove the placeholder
  }
  
  // Store additional XML attributes: the reference voltage
  getXMLAttributes() { return { inputValue : this.input.value.toString() }; }

}


// Create ADC
class ADC extends Element {
  constructor(x1,y1){
    super(x1,y1);
    let node4 = new InputNode( x1+25, y1+17 );
    let node3 = new BinaryNode(x1+boxWidth-85, y1+17, node4, 3 );
    let node2 = new BinaryNode(x1+boxWidth-65, y1+17, node4, 2 );
    let node1 = new BinaryNode(x1+boxWidth-45, y1+17, node4, 1 );
    let node0 = new BinaryNode(x1+boxWidth-25, y1+17, node4, 0 );
    this.nodes = [ node4,node3,node2,node1,node0 ] ;
    
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'AD omzetter'),
                     drawLine([boxWidth-92, 30, boxWidth-62, 30]),
                     drawLine([boxWidth-46, 30, boxWidth-18, 30]),
                     drawText(22,36,"in"),
                     drawText(boxWidth-60,36,"uit"),
                     drawText(boxWidth-88,12,"8"),
                     drawText(boxWidth-68,12,"4"),
                     drawText(boxWidth-48,12,"2"),
                     drawText(boxWidth-28,12,"1")]
                     .concat(drawCircles(x1,y1,this.nodes.slice(1,5), "yellow"),
                             drawCircles(x1,y1,[this.nodes[0]], "white"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
}

class DAC extends Element {
  constructor(x1,y1){
    super(x1,y1);
    let node3 = new InputNode( x1+25, y1+17, "input8" );
    let node2 = new InputNode( x1+45, y1+17, "input4" );
    let node1 = new InputNode( x1+65, y1+17, "input2" );
    let node0 = new InputNode( x1+85, y1+17, "input1" );
    let node4 = new DACNode(x1+boxWidth-25, y1+17, node0,node1,node2,node3 );
    this.nodes = [ node0,node1,node2,node3,node4 ] ;
    
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'DA omzetter'),
                     drawLine([18, 30, 46, 30]),
                     drawLine([62, 30, 92, 30]),
                     drawText(boxWidth-30,36,"uit"),
                     drawText(50,36,"in"),
                     drawText(22,12,"8"),
                     drawText(42,12,"4"),
                     drawText(62,12,"2"),
                     drawText(82,12,"1")]
                     .concat(drawCircles(x1,y1,this.nodes.slice(0,4), "white"),
                             drawCircles(x1,y1,[this.nodes[4]], "yellow"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
}


// Create Counter
class Counter extends Element {
  constructor(x1,y1){
    super(x1,y1);
    this.counter = 0;
    this.state = low;

    // Create the nodes
    this.nodes = [ new InputNode( x1+25, y1+80, "reset" ), // reset
                   new InputNode( x1+25, y1+50, "inhibit" ), // inhibit 
                   new InputNode( x1+25, y1+20, "count" ), // count pulses
                   new BinaryNodeS(x1+2*boxWidth-100, y1+20, 3 ),
                   new BinaryNodeS(x1+2*boxWidth-75, y1+20, 2 ),
                   new BinaryNodeS(x1+2*boxWidth-50, y1+20, 1 ),
                   new BinaryNodeS(x1+2*boxWidth-25, y1+20, 0 )];

    // Draw the counter
    var rect = new fabric.Rect({left: 120, top: 35, height: 50, width: 50, 
                                fill: 'lightgrey', stroke: 'black', strokeWidth: 1 });
    this.textBox = new fabric.Textbox((this.counter).toString(), {
                                      left: 2*boxWidth-50, top: 70, width: 60, fontSize: 44, textAlign: 'right',
                                       fill: 'red', backgroundColor: '#330000', fontFamily: 'Courier New' });
    var groupList = [ drawBoxAndText(0,0,2*boxWidth,boxHeight,'pulsenteller'),
                      drawLine([25, 20, 120, 20]),
                      drawLine([25, 50, 120, 50]),
                      drawLine([25, 80, 100, 80]),
                      drawLine([100, 80, 100, 50]),
                      drawLine([120, 30, 2*boxWidth-100, 30]),
                      drawLine([120, 33, 2*boxWidth-75, 33]),
                      drawLine([120, 36, 2*boxWidth-50, 36]),
                      drawLine([120, 39, 2*boxWidth-25, 39]),
                      drawLine([2*boxWidth-100, 30, 2*boxWidth-100, 20]),
                      drawLine([2*boxWidth-75, 33, 2*boxWidth-75, 20]),
                      drawLine([2*boxWidth-50, 36, 2*boxWidth-50, 20]),
                      drawLine([2*boxWidth-25, 39, 2*boxWidth-25, 20]),
                      drawLine([85, 50, 2*boxWidth-75, 50]),
                      rect, this.textBox,
                      drawText(10,14,"tel pulsen"),
                      drawText(10,44,"tellen aan/uit"),
                      drawText(10,74,"reset"),
                      drawText(2*boxWidth-103,14,"8"),
                      drawText(2*boxWidth-78,14,"4"),
                      drawText(2*boxWidth-53,14,"2"),
                      drawText(2*boxWidth-28,14,"1") ]
                      .concat(drawCircles(x1,y1,this.nodes, "blue"));
    this.drawGroup(x1+boxWidth, y1+0.5*boxHeight, groupList);

    // Draw the push button (reset)
    this.button = drawButton(x1+100, y1+boxHeight-20, this.nodes[0]) ;
    canvas.add(this.button);
  }
  
  output() {
    // Check the input count pulses
    var currentState = this.nodes[2].eval();
    var addCounter = false; // temporary flag to indicate whether to increment counter
    if( isHigh(currentState) && isLow(this.state) ) {
      this.state = high;
      // Only count rising edge when inhibit is off
      if( !(this.nodes[1]).child || isHigh(this.nodes[1].eval()) ) addCounter = true;
    }
    if( isLow(currentState) && isHigh(this.state) ) { this.state = low;}

    // Reset counter if button is pressed or reset input is high
    if( isHigh(this.nodes[0].state) || isHigh(this.nodes[0].eval())) { 
      if( this.counter != 0 ) {
        this.counter = 0;
        this.textBox.set( {'text' : this.counter.toString() });
        renderNeeded = true;
      }
    } else if( addCounter ) {
        ++this.counter; 
        if( this.counter == 16) this.counter = 0; // reset counter
        this.textBox.set( {'text' : this.counter.toString() });
        renderNeeded = true;
    }
    if( renderNeeded ) { // update counters
      this.nodes[3].counter = this.counter;
      this.nodes[4].counter = this.counter;
      this.nodes[5].counter = this.counter;
      this.nodes[6].counter = this.counter;
    }
  }
  
}



// Create relais with its nodes
class Relais extends Element {
  constructor(x1,y1){
    super(x1,y1);

    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new RelaisNode(x1+boxWidth-75, y1+boxHeight-25, node1, "output1");
    let node3 = new RelaisNode(x1+boxWidth-25, y1+boxHeight-25, node1, "output2");
    this.nodes = [ node1, node2, node3 ] ;

    // Draw symbols and wires
    var rect = new fabric.Rect({left: 25, top: 0.5*boxHeight, width: 20, height: 10, 
                                fill: 'lightgrey', stroke: 'black', strokeWidth: 1 });   
    var textbox = new fabric.Textbox("~", { left: boxWidth-50, top: 25, width: 20,
                                            fontSize: 20, textAlign: 'center' });
    var circ = new fabric.Circle({left: boxWidth-50, top: 25, strokeWidth: 1, stroke: 'black' ,
                                  radius: 10, fill: 'lightgrey'});
    this.switchLine1 = drawLine([25, 0.5*boxHeight, boxWidth-70, 0.5*boxHeight]);
    this.switchLine2 = drawLine([boxWidth-65, 40, boxWidth-75, 60]);
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'relais'),
                     drawLine([25, 25, 25, boxHeight-25]),
                     drawLine([20, boxHeight-25, 30, boxHeight-25]),
                     this.switchLine1,
                     drawLine([boxWidth-25, 25, boxWidth-25, boxHeight-25]),
                     drawLine([boxWidth-75, 25, boxWidth-75, 40]),
                     this.switchLine2,
                     drawLine([boxWidth-75, 60, boxWidth-75, boxHeight-25]),
                     drawLine([boxWidth-75, 25, boxWidth-25, 25]),
                     circ, textbox, rect,
                     drawLine([30, 0.5*boxHeight-5, 20, 0.5*boxHeight+5])]
                     .concat(drawCircles(x1,y1,[this.nodes[0]], "white"),
                             drawCircles(x1,y1,this.nodes.slice(1,3), "black"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
    this.switchLine1.set({'x1': -50, 'y1': 0, 'x2': 5, 'y2': 0 });
    this.switchLine2.set({'x1': 10, 'y1': -10, 'x2': 0, 'y2': 10 });
  }
  
  // Control Relais behaviour
  output() {
    var result = this.nodes[0].eval();
    if( isHigh(result) && !isHigh(this.lastResult) ) {
      this.switchLine1.set({'x2': 0 });
      this.switchLine2.set({'x1': 0 });
      renderNeeded = true;
    } else if( !isHigh(result) && isHigh(this.lastResult) ) {
      this.switchLine1.set({'x2': 5 });
      this.switchLine2.set({'x1': 10 });
      renderNeeded = true;
    }
    this.lastResult = result;
  };
}


// Create light bulb 
class Lightbulb extends Element {
  constructor(x1,y1){
    super(x1,y1);
    this.allowSnap = false;
    this.state = false;
    var isHV = true;
    this.nodes = [ new InputNode(x1+44, y1+110, "input1", isHV ), 
                   new InputNode(x1+60, y1+135, "input2", isHV ) ] ;
    
    // Get the image of the lightbulb from the document
    var imgElementOff = document.getElementById('lightbulb');
    this.imgBulbOff = new fabric.Image(imgElementOff, {left: 0, top: 0 });
    this.imgBulbOff.scale(0.6);

    this.shine = new fabric.Circle({left: 0, top: -15, radius: 60, opacity: 0.0 });
    this.shine.setGradient('fill', { type: 'radial', r1: this.shine.radius, r2: 20,
                                        x1: this.shine.radius, y1: this.shine.radius, 
                                        x2: this.shine.radius, y2: this.shine.radius,
                                        colorStops: { 1: 'rgba(255,200,0,0.7)', 0: 'rgba(0, 0, 0, 0)'} });
    
    // Draw the group and set the correct positions afterwards
    var groupList = [ this.imgBulbOff, this.shine ];
    this.drawGroup(0, 0, groupList);
    this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });
    this.group.setCoords();
    var circles = drawCircles(0,0,this.nodes, "black");  
    for( var i=0; i<circles.length; ++i ) {
      this.group.addWithUpdate( circles[i] ); 
    }

    // Event listener: Moving light bulb
    this.group.on('moving', updateLDRs );
  }  
  
  output() {
    var newState = this.nodes[0].child && this.nodes[1].child && // nodes should be connected
                   this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
                   isHigh( this.nodes[1].eval() ) ; // check node2
    if( (newState && !this.state) || (!newState && this.state) ) {
      this.state = newState;
      renderNeeded = true;
      if( this.state ) { 
        this.shine.set({opacity: 1.0 });
      } else {
        this.shine.set({opacity: 0.0 });
      }
      // also update all light sensors
      updateLDRs();
    }
  }
}


// Create flash light
class Flashlight extends Element {
  constructor(x1,y1){
    super(x1,y1);
    this.allowSnap = false;
    this.state = false;
    
    // Get the image of the flashlight from the document
    var imgElement = document.getElementById('flashlight');
    this.imgFlashLight = new fabric.Image(imgElement, {left: 0, top: 0 });
    this.imgFlashLight.scale(0.25);
    
    this.shine = new fabric.Circle({left: -10, top: 10, radius: 30, opacity: 0.0 });
    this.shine.setGradient('fill', { type: 'radial', r1: this.shine.radius, r2: 10,
                                        x1: this.shine.radius, y1: this.shine.radius, 
                                        x2: this.shine.radius, y2: this.shine.radius,
                                        colorStops: { 1: 'rgba(255,200,0,0.7)', 0: 'rgba(0, 0, 0, 0)'} });
    
    // Draw the group and set the correct positions afterwards
    var groupList = [ this.imgFlashLight, this.shine ];

    this.group = new fabric.Group( groupList,
                                 {left: x1, top: y1 });
    this.group.name = "element";
    this.group.element = this;
    canvas.add(this.group);
    this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });
    this.group.setCoords();
    
    // Event listener: Change light shining and state when clicking on flash light
    let that = this;
    let wasMoved = false;
    this.group.on('mousedown', function() { wasMoved = false; });
    this.group.on('mouseup', function() {
      if( !wasMoved ) {
        that.state = !that.state;
        if( that.state ) {
          that.shine.set({opacity: 1.0 });
          renderNeeded = true;        
        } else {
          that.shine.set({opacity: 0.0 });
          renderNeeded = true; 
        }
      }
      updateLDRs();
    });
    
    // Event listener: Moving flash light
    this.group.on('moving', function() {
      wasMoved = true;
      updateLDRs();
    });
  }   
}


// Make movable image for LDR
function makeLDR(left, top, node){
  var domLDR = document.getElementById('ldr');
  var imgLDR = new fabric.Image(domLDR, { left: left, top: top });
  imgLDR.scale(0.15);
  
  // Event listener: Moving ldr
  imgLDR.on('moving', function() {
    canvas.bringToFront(imgLDR);
    node.xLDR = imgLDR.left;
    node.yLDR = imgLDR.top;
    updateLDR(node);
  });

  return imgLDR;
}

// Create a light sensor
class LightSensor extends Element {
  constructor(x1,y1,params) {
    super(x1,y1);
    var xLDR = params.hasOwnProperty("xLDR") ? parseFloat(params.xLDR) : x1+25;
    var yLDR = params.hasOwnProperty("yLDR") ? parseFloat(params.yLDR) : y1+25;
    this.nodes = [ new LightSensorNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, xLDR, yLDR ) ] ; 
  
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'lichtsensor')]
                    .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup( x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList );

    // Make movable image for LDR
    this.ldr = makeLDR(this.nodes[0].xLDR, this.nodes[0].yLDR, this.nodes[0]);
    canvas.add(this.ldr);
  }
  
  remove() { canvas.remove( this.ldr ); };

  // Store additional XML attributes: the reference voltage
  getXMLAttributes() { return { xLDR : this.nodes[0].xLDR.toString(),
                                yLDR : this.nodes[0].yLDR.toString()}; } 
}    


// Create heater 
class Heater extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.allowSnap = false;
    this.oldTemperature = temperatureInside[0];

    var isHV = true;
    this.nodes = [ new InputNode(x1+10, y1+85, "input1", isHV ), 
                   new InputNode(x1+10, y1+110, "input2", isHV ) ] ;

    // Temperature display
    this.textbox = new fabric.Textbox(temperatureInside[0].toFixed(1)+" \u2103", {
          left: 25, top: -55, width: 50, fontWeight: 'bold', fontSize: 12, textAlign: 'right',
          fill: 'red', backgroundColor: '#330000' });

    // Radiator
    var imgElement = document.getElementById('radiator');
    this.imgRadiator = new fabric.Image(imgElement, {left: 0, top: 0});
    this.imgRadiator.scale(0.35);  

    // Draw group
    var groupList = [ this.imgRadiator, this.textbox ];
    this.drawGroup(0,0,groupList); 
    this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });
    this.group.setCoords();
    var circles = drawCircles(this.group.left,this.group.top,this.nodes, "black");
    for( var i=0; i<circles.length; ++i ) {
      this.group.add( circles[i] );
    }
  }
  
  output() {
    var heatLoss = heatTransfer * (temperatureInside[0] - temperatureOutside);
    temperatureInside.unshift( temperatureInside[0] + -heatLoss * clockPeriod*0.001 / heatCapacity);
    temperatureInside.pop();

    if( this.nodes[0].child && this.nodes[1].child && // nodes should be connected
        this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
        isHigh( this.nodes[1].eval() ) ) { // check node2
      temperatureInside[0] += powerHeater * clockPeriod*0.001 / heatCapacity;
    }
    
    var newTemperature = temperatureInside[0].toFixed(1);
    if( Math.abs(this.oldTemperature-newTemperature) > 0.05 ) {
      this.textbox.set({ text : temperatureInside[0].toFixed(1)+" \u2103"});
      this.oldTemperature = newTemperature;
      renderNeeded = true;
    }
  }

}


// Temperature sensor
class TemperatureSensor extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ;   
 
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'temperatuursensor')]
                    .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup( x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList );
  }
  
  // Set voltage from temperature inside
  output() { 
    // Use last value of array to add small delay to temperature sensor
    var voltage = (temperatureInside.at(-1) - 15.0) * 0.2;
    voltage = Math.min(Math.max(0.0,voltage),5.0); // Range between 0.0 and 5.0 V
    this.nodes[0].state = voltage;
  }
}    

// Sound sensor
class SoundSensor extends Element { 
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new SoundSensorNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, this ) ] ;
  
    // Draw circle for input hole microphone
    var circ = new fabric.Circle({left: 25, top: 0.5*boxHeightSmall, radius: 2, fill: "black" });
    

    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'geluidsensor'), circ]
                    .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup( x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList );
    
    // Add a member for the textbox such that is can be greyed out when needed
    this.textbox = this.group.item(0).item(1);
  }  
}

// Sound sensor
class WebcamSensor extends Element { 
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new WebcamNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, this ) ] ;
  
    // Draw circle for input hole microphone
    var rect = new fabric.Rect({left: 25, top: 0.5*boxHeightSmall, 
                                width: 6, height: 5, /*stroke: "black",*/ fill: "#f9f9f9" });
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'webcamsensor'), rect]
                    .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup( x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList );
    
    // Add a member for the textbox such that is can be greyed out when needed
    this.textbox = this.group.item(0).item(1);
  }  
}


// Voltmeter (analog)
class Voltmeter extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.allowSnap = false;
    this.nodes = [ new InputNode(x1+35, y1+35 ) ] ;   
    this.lastState = 0.0;

    // Draw the display and the rest
    this.display = new fabric.Line([22,22,9,9], {strokeWidth: 2, stroke: 'red' });
    var rect = new fabric.Rect({left: 22, top: 12, height: 20, width: 40, 
                                fill: 'white', stroke: 'black', strokeWidth: 1   });   
    var groupList = [ drawBoxAndText(0,0,44,60,'meter'), 
                      drawText(1,45,"volt-",12),
                      rect, this.display,
                      drawText(4,11,"0",8),
                      drawText(35,11,"5",8) ]
                      .concat(drawCircles(x1,y1,this.nodes, "white"));
    this.drawGroup(x1+22, y1+30, groupList);
    this.display.set({ 'x1': 0, 'y1': -8, 'x2': -13, 'y2': -22 });
  }
  // Set voltage 
  output() { 
    var newState = this.nodes[0].eval();
    if( Math.abs(newState-this.lastState) < 0.1) return; 
    var angle = Math.PI*(0.25+0.5*(newState/5.0));
    var x2 = -18*Math.cos(angle);
    var y2 = -8 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });
    renderNeeded = true;
    this.lastState = newState;
  }
}    

// Digital voltmeter
class DigitalVoltmeter extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.allowSnap = false;
    this.nodes = [ new InputNode(x1+35, y1+35 ) ] ;   
    this.lastState = 0.0;

    // Draw the display and the rest
    this.display = new fabric.Textbox(this.lastState.toFixed(2)+" V", {
          left: 22, top: 12, width: 37, fontWeight: 'bold', fontSize: 12, textAlign: 'right',
          fill: 'red', backgroundColor: '#330000' });
    var groupList = [ drawBoxAndText(0,0,44,60,'meter'), 
                      drawText(1,45,"volt-",12),
                      this.display ]
                      .concat(drawCircles(x1,y1,this.nodes, "white"));
    this.drawGroup(x1+22, y1+30, groupList);
  }
  // Set voltage 
  output() { 
    var newState = this.nodes[0].eval();
    if( Math.abs(newState-this.lastState) < 0.05) return; 
    this.display.set({ text : newState.toFixed(2)+" V"});
    this.lastState = newState;
    renderNeeded = true;
  }
}    

// Text element
class TextElement extends Element {
  constructor(x1,y1, params ) {
    super(x1,y1);
    this.allowSnap = false;
    var text   = params.hasOwnProperty("text")   ? params.text : "Nieuwe tekst";
    var scaleX = params.hasOwnProperty("scaleX") ? parseFloat(params.scaleX) : 1.0;
    var scaleY = params.hasOwnProperty("scaleY") ? parseFloat(params.scaleY) : 1.0;
    var width  = params.hasOwnProperty("width")  ? parseInt(params.width)    : 150;

    // Draw the text
    this.group = new fabric.Textbox(text, {left: x1, top: y1, fontSize: 20, width: width,
                                           scaleX: scaleX, scaleY: scaleY, originX: 'left', originY: 'top',
                                           selectable: moveComponents, 
                                           evented: (moveComponents||deleteComponents) });
    this.group.name = "element";
    this.group.element = this;
    this.group.hasControls = true;
    this.group.hasBorders = true;
    this.group.lockRotation = true; 
    canvas.add(this.group);    
    
    // Event listener for scaling the group
    var that = this;
    this.group.on('scaling', function() {
      that.x = this.left;
      that.y = this.top;
    });
    
  }
  
  getXMLAttributes() {
    return { text   : this.group.text,
             scaleX : this.group.scaleX.toFixed(2).toString(),
             scaleY : this.group.scaleY.toFixed(2).toString(), 
             width  : Math.round(this.group.width).toString() } ;
  }


}    


/* === USER INTERACTION AND EVENT LISTENERS ===
   - Add move, remove elements
   ============================================= */

function addCheckMark(button) {
  var buttonText = button.innerHTML;
  button.innerHTML = buttonText.substr(0,buttonText.length-24).concat("&nbsp;&#10003;");
}

function removeCheckMark(button) {
  var buttonText = button.innerHTML;
  button.innerHTML = buttonText.substr(0,buttonText.length-7).concat("&nbsp;&nbsp;&nbsp;&nbsp;");
}

// Make the wires change color when high
function toggleWireColors () {
  wireColors = !wireColors

  var checkbox = document.getElementById('toggleWireColors');
  if (wireColors) addCheckMark(checkbox);
  else removeCheckMark(checkbox);
}

// Make the group of each element moveable
function toggleMoving() {
  // Toggle 
  moveComponents = !moveComponents;

  if( deleteComponents && moveComponents ) toggleDelete();

  // Make the components evented
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].group ){
      if( moveComponents ) elements[i].group.set({selectable: true, evented: true});
      else elements[i].group.set({selectable: false, evented: false});
    }
  }
  
  // Change button text
  var checkbox = document.getElementById("toggleMoving");
  if( moveComponents ) addCheckMark(checkbox);
  else removeCheckMark(checkbox);
}

// Make that clicking on an element (its group) remove the element
function toggleDelete() {
  // Toggle 
  deleteComponents = !deleteComponents;
  
  if( deleteComponents && moveComponents ) toggleMoving();

  // Make the components evented
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].group ){
      if( deleteComponents ) elements[i].group.set({selectable: false, evented: true});
      else elements[i].group.set({selectable: false, evented: false});
    }
  }
  
  // Change button text
  var checkbox = document.getElementById("toggleDelete");
  if( deleteComponents ) addCheckMark(checkbox);
  else removeCheckMark(checkbox);
}

// Toggle for hiding / showing text block
function toggleText(name,button) {
  var text = document.getElementById(name);
  if (text.style.display === "none") {
    text.style.display = "block";
    addCheckMark(button);
  } else {
    text.style.display = "none";
    removeCheckMark(button);
  }
}


// Remove the element from the board
function removeElement( element ) {
  // Remove the group from the canvas
  canvas.remove( element.group );

  // Remove possible buttons from the canvas
  if( element.button ) canvas.remove( element.button );

  // loop over nodes and remove wires
  for( var i=0; i<element.nodes.length; ++i) {
    var node = element.nodes[i];
    // Remove input node
    if( node.isInput ) {
      if( node.child ) {
        for( var j=0; j<node.child.wires.length; ++j) {
          var wire = node.child.wires[j];
          if( wire.connection == node  ) {
            // remove wire
            wire.connection = null;
            canvas.remove( wire.line1 );
            canvas.remove( wire );
            node.child.wires.splice(j, 1); // safe because there is only one connection
          }
        }
      }
      node.child = null;
    }
    // Remove output node
    if( !node.isInput ) {
      for( var j=0; j<node.wires.length; ++j) {
        var wire = node.wires[j];
        canvas.remove( wire.line1 );
        canvas.remove( wire );
        if( wire.connection ) {
          wire.connection.child = null;
        }
        wire.connection = null; 
        wire.node = null;
      }
    }
  }
    
  // remove any other stuff from element
  element.remove();
}

function requestRemoveElements() {
  if ( confirm("Weet je zeker dat je alles wilt verwijderen?") ) {
    removeElements();
    unlockAudioContext( audioCtx );
  }
}

function removeElements() {
  elements.forEach(function(element) { removeElement(element);});  
  elements = [];  
}

// Event listener: remove the element
canvas.on('mouse:up', function(e) {
  var p = e.target;
  if( deleteComponents && p && p.name == "element") {
    removeElement(p.element);
    // Delete the element from the list of elements
    var index = elements.indexOf(p.element);
    if (index > -1) elements.splice(index, 1);  
  }
});


// Event listener: Moving wire, ldr or element
canvas.on('object:moving', function(e) {
  var p = e.target;
  if( p.name == "wire" ) moveWire(p);
  if( p.name == "element" ) moveElement(p);
});


// Update LDR (voltage to light sensor) when moving
function updateLDR(node){
  // Find all lightbulbs and calculate distance
  node.state = low;    
  var light = null;
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].constructor.name == "Lightbulb" ||
        elements[i].constructor.name == "Flashlight") {
	  light = elements[i];
      if( light && light.state ) {
        var xPosLight = light.x + 0.5*light.group.width;
        var yPosLight = light.y + 0.5*light.group.height;
        var dist = Math.pow(node.xLDR-xPosLight,2)+Math.pow(node.yLDR-yPosLight,2);
        var voltage = 5.0/(1.0+dist/20000.0);
        // Normalize distance (maximum is around 1000) to 5 V
        node.state += voltage;
      }
    }
  }
  node.state = Math.min(node.state, 5); // Set maximum to 5 volt
}

// Update all LDRs (voltage to light sensor) 
function updateLDRs() {
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].constructor.name == "LightSensor" ) {
      var lightsensor = elements[i];
      updateLDR( lightsensor.nodes[0] );
    }
  }
}

// Update the wire when moving
function moveWire(p){
  canvas.bringToFront(p);
  canvas.bringToFront(p.line1);
  p.line1.set({ 'x2': p.left, 'y2': p.top });
  // Snap to any node
  for (i = 0; i < elements.length; i++) {
    for (j = 0; j < elements[i].nodes.length; j++) {
      var snapNode = elements[i].nodes[j];
      // Check if wire and node are the same type 
      if( (p.node.isHV && snapNode.isHV) || (!p.node.isHV && !snapNode.isHV) ) {
        var x1 = snapNode.x1;
        var y1 = snapNode.y1;
        if( Math.abs(p.left - x1 ) < snapTolerance && Math.abs(p.top - y1 ) < snapTolerance ) {
          p.left = x1;
          p.top = y1;
          p.line1.set({ 'x2': x1, 'y2': y1 });
        }
      }
    }
  }
}

// Update the element when moving. Snap to other components
function moveElement(p){
  
  // Bring the component in front of rest (except empty board)
  var element = p.element;
  if( element.constructor.name != "Board" ) canvas.bringToFront(p);
  if( element.ldr ) canvas.bringToFront(element.ldr);

  if( element.allowSnap ) {
    p.setCoords(); //Sets corner position coordinates based on current angle, width and height
    elements.forEach(function (element) {    
      var targ = element.group;
      if ( !targ || targ === p || !element.allowSnap ) return;
      
      // Snap horizontally
      if (Math.abs(p.oCoords.tr.x - targ.oCoords.tl.x) < edgedetection) {
        p.set({left: targ.oCoords.tl.x - 0.5*p.width + 1} );
      }
      else if (Math.abs(p.oCoords.tl.x - targ.oCoords.tr.x) < edgedetection) {
        p.set({left: targ.oCoords.tr.x + 0.5*p.width - 1} );
      }
      else if (Math.abs(p.oCoords.tl.x - targ.oCoords.tl.x) < edgedetection ) {
        p.set({left: targ.oCoords.tl.x + 0.5*p.width});
      }
      else if (Math.abs(p.oCoords.tr.x - targ.oCoords.tr.x) < edgedetection) {
        p.set({left: targ.oCoords.tr.x - 0.5*p.width});
      }

      // Snap vertically
      if (Math.abs(p.oCoords.br.y - targ.oCoords.tr.y) < edgedetection) {
        p.set({top: targ.oCoords.tr.y - 0.5*p.height + 1} );
      }
      else if (Math.abs(targ.oCoords.br.y - p.oCoords.tr.y) < edgedetection) {
        p.set({top: targ.oCoords.br.y + 0.5*p.height - 1} );
      } 
      else if (Math.abs(targ.oCoords.br.y - p.oCoords.br.y) < edgedetection) {
        p.set({top: targ.oCoords.br.y - 0.5*p.height} );
      } 
      else if (Math.abs(targ.oCoords.tr.y - p.oCoords.tr.y) < edgedetection) {
        p.set({top: targ.oCoords.tr.y + 0.5*p.height} );
      }    
    });
  }
  
  // Update x and y for element and its nodes
  var nodes = element.nodes;

  var newX = p.left-0.5*p.width+0.5;
  var newY = p.top-0.5*p.height+0.5;
  if( p.originX == "left" && p.originY == "top" ) {
    newX = p.left;
    newY = p.top;
  }
  var diffX = newX - element.x;
  var diffY = newY - element.y;  
  element.x = newX;
  element.y = newY;
  for (i = 0; i < nodes.length; i++) {
    nodes[i].x1 += diffX;
    nodes[i].y1 += diffY;
  }
  if( element.button ) {
    var button = element.button;
    button.set({ 'left': button.left+diffX, 'top': button.top+diffY }) ;
    button.setCoords();
    canvas.bringToFront(button);
  }
  if( element.input ) {
    var input = element.input;
    input.style.left = (parseFloat(input.style.left.slice(0,-2)) + diffX) + 'px';
    input.style.top = (parseFloat(input.style.top.slice(0,-2)) + diffY) + 'px';
    var placeholder = element.placeholder;
    placeholder.set({ 'left': placeholder.left+diffX, 'top': placeholder.top+diffY }) ;
    placeholder.setCoords();
    canvas.bringToFront(placeholder);
  }
  
  // Update the wire
  for( var i = 0; i < nodes.length; i++) {
    // Connected input node 
    if( nodes[i].isInput && nodes[i].child ) {
      var wires = nodes[i].child.wires;
      for( var j = 0; j< wires.length; j++ ) {
        var wire = wires[j];
        if( wire.connection == nodes[i] ) {
          wire.set({ 'left': wire.left+diffX, 'top': wire.top+diffY });
          wire.setCoords();
          wire.line1.set({ 'x2': wire.left, 'y2': wire.top });
          canvas.bringToFront(wire.line1);
          canvas.bringToFront(wire);
        }
      }
    }
    // Output node
    if( !(nodes[i].isInput) ) {
      var wires = nodes[i].wires;
      for( var j = 0; j< wires.length; j++ ) {
        var wire = wires[j];
        wire.line1.set({ 'x1': wire.line1.x1+diffX, 'y1': wire.line1.y1+diffY });
        if( !wire.connection ) {
          wire.set({ 'left': wire.left+diffX, 'top': wire.top+diffY });
          wire.setCoords();
          wire.line1.set({ 'x2': wire.line1.x2+diffX, 'y2': wire.line1.y2+diffY });
        }
        canvas.bringToFront(wire.line1);
        canvas.bringToFront(wire);
      }
    }
  }
}

// Event listener: After moving wire destroy and create new links
canvas.on('object:moved', function(e) {
    var p = e.target;
    if( p.name == "element") resizeCanvas();
    if( p.name != "wire" ) return;
    var snapped = false;
    // reset connection wire
    if( p.connection ) p.connection.child = null;
    for (i = 0; i < elements.length; i++) {
      for (j = 0; j < elements[i].nodes.length; j++) {
        var node1 = p.node;
        var node2 = elements[i].nodes[j];
        // Check if wire-end is on same position as the node
        if( Math.abs(p.left - node2.x1)<1.0 && Math.abs(p.top - node2.y1)<1.0 ) { 
          if( node2.isInput && !(node1.isInput) && !(node2.child) ) {
            node2.child = node1;
            p.connection = node2;
            p.bringToFront();
            snapped = true;
            // Create extra wire for output node
            node1.wires.push( makeWire(node1.x1,node1.y1,node1,node1.isHV) );
          }                         
        }
      }
    }
    if( snapped == false ) {
      if( p.connection ) { // wire can be removed from list and canvas
        var wires = p.node.wires;
        var index = wires.indexOf(p);
        if (index > -1) wires.splice(index, 1);
        canvas.remove(p.line1);
        canvas.remove(p);
      } else {
        // Set back to original position
        p.set({ 'left': p.line1.x1, 'top' : p.line1.y1 } );
        p.setCoords();
        p.line1.set({ 'x2': p.line1.x1, 'y2': p.line1.y1 });
      }
    } 
  
});

/* === USER INTERACTION AND EVENT LISTENERS ===
   - Save/load file
   ============================================= */

// Make a screenshot
function screenshot(htmlElement) {
  var image = canvas.toDataURL({format: 'png', multiplier: 2});  
  htmlElement.setAttribute("download","screenshot.png");
  htmlElement.setAttribute("href", image);
}


// Event listener for uploading files
$("#fileinput").change(function() {
  let files = this.files;
  // Use createObjectURL, this should address any CORS issues.
  let filePath = URL.createObjectURL(files[0]);
  readFile(filePath);
  // Reset the file input such that it triggers next change
  this.value = '';
});

function readFile(url) {
  // Get the xml file using jQuery get method
  $.get(url, function(xmlDoc) {
      parseFile( xmlDoc );
  });
}

function parseFile(xml) {
  removeElements();
  var i,j;
  var xmlDoc = xml;
  if( typeof xml === "string" ) {
    var parser = new DOMParser();
    xmlDoc = parser.parseFromString(xml,"text/xml");
  }
  var x = xmlDoc.getElementsByTagName("systeembord");
  if( x.length == 0 ) { 
    alert("The input xml-file does not have the proper format.");
    return;
  }
  var domElements = x[0].getElementsByTagName("element");

  for (i = 0; i < domElements.length; i++) { 
    var className = domElements[i].getAttribute('name');
     
    var x = parseInt( domElements[i].getAttribute('x')); 
    var y = parseInt( domElements[i].getAttribute('y'));
    var params = {};
    var attrs = domElements[i].attributes;
    for( var j=0; j< attrs.length; ++j ) {
      params[ attrs[j].name ] = attrs[j].value;
    }
    addElement(className,x,y,params);
    
    // Update the uniqueName if exists
    if( domElements[i].hasAttribute('id') ) {
      elements[elements.length-1].uniqueName = domElements[i].getAttribute('id');
    }
  }    
  
  // Second loop to add the links
  for (i = 0; i < domElements.length; i++) { 
    var domLinks = domElements[i].getElementsByTagName("link");
    for (j = 0; j < domLinks.length; j++) { 
      
      var node = null;
      var toNode = null;
      // old format: uses indices to express the links
      if( /^\d+$/.test(domLinks[j].getAttribute('toElement')) ) {
        var iNode = parseInt( domLinks[j].getAttribute('id')); 
        var iToElement = parseInt( domLinks[j].getAttribute('toElement')); 
        var iToNode = parseInt( domLinks[j].getAttribute('toNode')); 
        node = elements[i].nodes[iNode];
        toNode = elements[iToElement].nodes[iToNode];
      } else { // new format with uniqueNames
        var nodeID = domLinks[j].getAttribute('id');
        var toElementID = domLinks[j].getAttribute('toElement'); 
        var toNodeID = domLinks[j].getAttribute('toNode'); 
        for(var l=0; l<elements[i].nodes.length; ++l ){
          if( elements[i].nodes[l].uniqueName == nodeID ) {
            node = elements[i].nodes[l];
          }
        }
        for(var k=0; k<elements.length; ++k ) {
          if( elements[k].uniqueName == toElementID ) {
            for( var m=0; m<elements[k].nodes.length; ++m ) {
              if( elements[k].nodes[m].uniqueName == toNodeID ) {
                toNode = elements[k].nodes[m];
              }
            }
          }
        }
      }
      
      // Update drawing of wire
      var wire = toNode.wires[toNode.wires.length-1]; // last wire
      wire.connection = node;
      wire.set({ 'left': node.x1, 'top' : node.y1 } );
      wire.setCoords();
      wire.line1.set({ 'x2': node.x1, 'y2': node.y1 });
      wire.bringToFront();
      wire.line1.bringToFront();

      // Create extra wire for output node
      toNode.wires.push( makeWire(toNode.x1,toNode.y1,toNode,toNode.isHV) );

      // Set the link in the right element
      node.child = toNode;
    }
  }
  // Resize canvas in case elements are out of bounds
  resizeCanvas();
}

function addElement(className,x1=0,y1=0,params={}){
  // Convert string to class name
  var myElement = eval(className);
  elements.push(new myElement(x1,y1,params));
}

// Event listener for setting back the index after select
$("select").change( function(){
  $("select").val(0);
});


// Event listener for download button
$("#download_xml").click( function(){
  var filename = prompt("Sla op als...", "systeembord.xml");
  if (filename != null && filename != "") {
    download( filename, createXmlFile());
  }
  unlockAudioContext( audioCtx );
});

// Create an invisible download element
function download(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// Write the xml file
function createXmlFile(){
  var xmlDoc = document.implementation.createDocument(null,"systeembord");
  x = xmlDoc.getElementsByTagName("systeembord")[0];
  for (var i = 0; i < elements.length; i++) { 
    var newElement = xmlDoc.createElement("element");

    var attName = xmlDoc.createAttribute("name");
    attName.nodeValue = elements[i].constructor.name;
    newElement.setAttributeNode(attName);

    var attID = xmlDoc.createAttribute("id");
    attID.nodeValue = elements[i].uniqueName;
    newElement.setAttributeNode(attID);

    var attPosX = xmlDoc.createAttribute("x");
    attPosX.nodeValue = Math.round(elements[i].x).toString();
    newElement.setAttributeNode(attPosX);

    var attPosY = xmlDoc.createAttribute("y");
    attPosY.nodeValue = Math.round(elements[i].y).toString();
    newElement.setAttributeNode(attPosY);
    
    // Store the additional XML attributes
    var attrs = elements[i].getXMLAttributes();
    for( var key in attrs ) {
      var attribute = xmlDoc.createAttribute( key );
      attribute.nodeValue = attrs[key];
      newElement.setAttributeNode(attribute);
    }
    
    x.appendChild(newElement);
    for (var j = 0; j < elements[i].nodes.length; j++) {

      var thisNode = elements[i].nodes[j];
      if( thisNode.isInput && thisNode.child ) {
        var newLink = xmlDoc.createElement("link");

        var attLinkID = xmlDoc.createAttribute("id");
        attLinkID.nodeValue = thisNode.uniqueName ;//j.toString();
        newLink.setAttributeNode(attLinkID);

        // find to which link this node points
        var toElementNode = findLink( thisNode.child );
        
        var attToElement = xmlDoc.createAttribute("toElement");
        attToElement.nodeValue = toElementNode[0];//.toString();
        newLink.setAttributeNode(attToElement);

        var attToElement = xmlDoc.createAttribute("toNode");
        attToElement.nodeValue = toElementNode[1];//.toString();
        newLink.setAttributeNode(attToElement);

        newElement.appendChild(newLink);
      }
    }
    
  } 

  var serializer = new XMLSerializer();
  var xmlString = serializer.serializeToString(xmlDoc);
  return formatXml( xmlString );

}  

// Find the link number in list of elements
function findLink(thisNode) {
  for (var i = 0; i < elements.length; i++) { 
    for (var j = 0; j < elements[i].nodes.length; j++) {
      if( thisNode == elements[i].nodes[j] ) {
        return [elements[i].uniqueName, elements[i].nodes[j].uniqueName]; //return [i,j];
      }
    }
  }
  //return [-1,-1];
  return ["",""];
}

// Make the xml pretty
function formatXml(xml) {
  var formatted = '';
  var reg = /(>)(<)(\/*)/g;
  xml = xml.replace(reg, '$1\r\n$2$3');
  var pad = 0;
  jQuery.each(xml.split('\r\n'), function(index, node) {
    var indent = 0;
    if (node.match( /.+<\/\w[^>]*>$/ )) {
      indent = 0;
    } else if (node.match( /^<\/\w/ )) {
      if (pad != 0) {
        pad -= 1;
      }
    } else if (node.match( /^<\w[^>]*[^\/]>.*$/ )) {
      indent = 1;
    } else {
      indent = 0;
    }

    var padding = '';
    for (var i = 0; i < pad; i++) {
      padding += '  ';
    }

    formatted += padding + node + '\r\n';
    pad += indent;
  });
  
  return formatted;
}

/* ============= DISPLAY FUNCTIONS =============
   Functions to:
   - dynamically resize the canvas width and height
   - Showing modal boxes
   ============================================= */

// Event listener for resizing the window
$(window).resize( resizeCanvas );
function resizeCanvas() {    
  var minimumSize = getMinimumCanvasSize();
  var divCanvas = document.getElementById("canvas1");
  let newWidth = Math.max( minimumSize.x, window.innerWidth-20 );
  let newHeight = Math.max( minimumSize.y, window.innerHeight-90 );
  divCanvas.style.width = newWidth;
  divCanvas.style.height = newHeight;
  canvas.setWidth(newWidth);
  canvas.setHeight(newHeight);
  canvas.renderAll();
}

function getMinimumCanvasSize( ) {
  var minWidth = 0, minHeight = 0;
  elements.forEach(function(element) {
    minWidth  = Math.max( getMinimumCanvasWidth(  element ), minWidth );
    minHeight = Math.max( getMinimumCanvasHeight( element ), minHeight );    
  });
  return {x: minWidth, y: minHeight};
}

function getMinimumCanvasWidth( element ) {
  let minWidth = 900;   // minimum size needs to stay at 900px
  if( element.group ) minWidth = Math.max( element.x + element.group.width+10, minWidth );
  return minWidth;
}

function getMinimumCanvasHeight( element ) {
  let minHeight = 500;   // minimum size needs to stay at 500px
  if( element.group ) minHeight = Math.max( element.y + element.group.height+10, minHeight );
  return minHeight;
}

/* Define functions for the modal box */
// Showing modal box
function showModal(name) { $("#"+name).show(); }

// When the user clicks on <span> (x), close the current modal
$(".close").on("click", function() { $(this).parent().parent().toggle(); });
  
// When the user clicks anywhere outside of the modal, close it
$(window).on("click", function(event) {
  if( event.target.className === "modal" ) event.target.style.display = "none";
});

/* ============= MAIN ENGINE ==================
   Evaluate the board (all elements) using
   output() function of each element. The
   elements delegate this mostly to the nodes.
   This is repeated every clockPeriod (default: 50 ms)
   ============================================= */


// Read the xml file from the hash of the web address
function readFileFromHash() {
  var xmlFile = window.location.hash.substr(1);
  
  if( xmlFile == "") { // If hash is empty read the default file
    xmlFile = "xml/systeembord.xml";
  }
  else if ( xmlFile.includes("https") ) {
    $.get(xmlFile, function(data) {
      console.log("Trying to load external xml file");
      console.log(xmlFile);
      console.log(data);
    });
  } else {
    xmlFile = "xml/"+xmlFile;
  }
  
  // Read the xml file
  readFile( xmlFile );  
}

// Trigger reload when hash has changed 
window.addEventListener('hashchange', function() {
  readFileFromHash();
}, false);

// Call function from select menu
function loadHash( hash ) {
  // Force a reload when hash did not change
  if( hash == window.location.hash ) {
    readFileFromHash();
  } else { // Hash will change: will trigger a reload
    window.location = hash;
  }
}


// Evaluate all elements (elements evaluate the nodes)
function evaluateBoard() {
  eventCounter++;

  // First, evaluate all nodes
  for (var i = 0; i < elements.length; i++) { 
     elements[i].output();
  }

  // Then, update lines
  canvas.forEachObject(function (obj) {
    if (obj.name === 'wire') {
      updateWireColor(obj)
    }
  });


  if (renderNeeded) {
    canvas.requestRenderAll();
    renderNeeded = false;
  }
}

// set the feedback tag
function setFeedback() {
  var name = "smackjvantilburgsmack"; // add salt
  name = name.substr(5,11); // remove salt
  $("feedback").html(name+"@gmail.com");
}

// set the version tags
function setVersion() {
  if( versionType == "prev" || versionType == "dev" ) 
    $("versionType").html(versionType);
  $("version").html(version + " ("+versionType+")");
}

// load all code after the document
$("document").ready(function(){
  
  // resize on init
  resizeCanvas();

  // set the version tags
  setVersion();
  
  // Read the xml file from the hash of the web address
  readFileFromHash();
  
  // Make sure that the engine is run every clockPeriod  
  setInterval(evaluateBoard, clockPeriod);
  
  // Set the feedback tag
  setFeedback();

});



//})();



