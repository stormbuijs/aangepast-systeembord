// All code runs in this anonymous function
// to avoid cluttering the global variables
//(function() { 

/* ========== GLOBAL SECTION =================
   Global variables are defined here
   =========================================== */

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

// Globals for the temperature and heater
var heatTransfer = 100;        // Means that Tmax=40
var heatCapacity = 5000;       // Determines speed of heating
var temperatureInside = 15.0;  // Celcius
var temperatureOutside = 15.0; // Celcius
var powerHeater = 2500;        // Watt

// Global event counter for loop protection
var eventCounter = 0;

// Global flag for rendering
var renderNeeded = true;

// Global flag to fix position of components
var moveComponents = false;

// Global flag to delete components on mouse click
var deleteComponents = false;

// Global list with all elements (components of the systemboard)
var elements = [];  

// Create canvas
var canvas = this.__canvas = new fabric.Canvas('c', { selection: false,
                                                      preserveObjectStacking: true });
fabric.Object.prototype.originX = fabric.Object.prototype.originY = 'center';
fabric.Object.prototype.hasControls = false;
fabric.Object.prototype.hasBorders = false;
fabric.Text.prototype.objectCaching = false; // Create less blurry text
fabric.Text.prototype.fontFamily = "Arial";


/* ========== SHARED FUNCTIONS ===============
   
   =========================================== */

// Set a warning messsage when using Internet Explorer
function isIE() {
  // IE 10 and IE 11
  return /Trident\/|MSIE/.test(window.navigator.userAgent);
}

let showBrowserAlert = (function () {
    if (document.querySelector('.unsupported-browser')) {
        let d = document.getElementsByClassName('unsupported-browser');

        if( isIE() ) {
            d[0].innerHTML = '<b>Deze browser wordt niet ondersteund!</b></br>Deze webapplicatie werkt niet in Internet Explorer.</br>Gebruik een moderne browser zoals Chrome, Edge, Firefox of Safari.';
            d[0].style.display = 'block';
        }
    }
});

document.addEventListener('DOMContentLoaded', showBrowserAlert);


/* ========== AUDIO SECTION ====================
   Start the audioContext and set the microphone
   ============================================= */

// Set empty AudioContext, etc
var audioCtx = null, oscillator = null, gainNode = null;

// audioContext starts always in suspended mode in iOS/Safari. 
// Requires user interaction (event) to resume.
function unlockAudioContext(context) {
  if (context.state !== "suspended") return;
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

// Connect a volume from the microphone to the external function updateVolume 
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
function makeLine(coords, color) {
  return new fabric.Line(coords, {stroke: color, strokeWidth: 3});
}

// Make wire (= movable circle + line + fixed circle)
function makeWire(x1,y1,node,isHV=false) { 
  var color = isHV ? '#444444' : '#dd0000';
  var line = makeLine([ x1, y1, x1, y1 ],color);
  canvas.add( line );
  let endCircle = makeCircle(x1, y1, line, node, color);
  canvas.add( endCircle );
  return endCircle;
}

// Set nice-looking gradients for buttons
var gradientButtonUp = { x1: -10, y1: -10, x2: 20, y2: 20,
                         colorStops: { 0: 'white', 1: '#333333' }};
var gradientButtonDw = { x1: -10, y1: -10, x2: 22, y2: 22,
                         colorStops: { 0: '#333333', 1: 'white' }};

// Draw a push button
function drawButton(left, top, node){
  var c = new fabric.Circle({left: left, top: top, strokeWidth: 3, stroke: 'grey', radius: 10,
                             fill: '#222222', selectable: false });
  c.setGradient('stroke', gradientButtonUp );
  c.name = "button";
  c.node = node;
  return c;
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
  constructor(x1=0,y1=0, isHV=false) { 
    this.x1 = x1;
    this.y1 = y1;
    this.isHV = isHV;
    this.state = low; // only used by reset button of pulse counter
    this.isInput = true;
    this.child = null;
  }
  eval() { return (this.child) ? this.child.eval() : false ; };
}

// Generic output node (base class)
class OutputNode { 
  constructor(x1=0,y1=0, isHV=false) {
    this.x1 = x1;
    this.y1 = y1;
    this.isHV = isHV;
    this.state = low;
    this.isInput = true;
    this.isInput = false;     
    this.wires = [ makeWire(x1,y1,this,isHV) ];
    this.lastEvent = 0;
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
    super(x1,y1);
    this.child1 = input1;
    this.bin = bin;
  }
  evalState() {
    var binary = (this.child1.eval() / high ) * 15; // convert analog to 16b
    return getBit(binary,this.bin);
  }
}    

// Binary node with stored counter
class BinaryNodeS extends OutputNode { 
  constructor(x1,y1,bin) { 
    super(x1,y1);
    this.bin = bin;
    this.counter = 0;
  }
  evalState() { return getBit(this.counter,this.bin); };
}    

// Relais node 
class RelaisNode extends OutputNode { 
  constructor(x1,y1,input) {
    super(x1,y1,true);
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
    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new InputNode(x1+25, y1+boxHeight-25 );
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
    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new InputNode(x1+25, y1+boxHeight-25 );
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

// Create memory cell with its nodes
class Memory extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new InputNode(x1+25, y1+boxHeight-25 );
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

// Create LED with node
class LED extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new InputNode(x1+25, y1+20 ) ] ;
    this.lastResult = 0.0;
    
    // Draw LED
    this.led = new fabric.Circle({left: boxWidth-25, top: 20, radius: 5, 
                                  fill: 'darkred', stroke: 'black', strokeWidth: 2   });
    this.led.setGradient('stroke', gradientButtonDw );
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'LED'), this.led]
                    .concat(drawCircles(x1,y1,this.nodes, "white"));
    
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
  
  // Control LED behaviour
  output() {
    var result = this.nodes[0].eval();
    if( isHigh(result) && !isHigh(this.lastResult) ) {
      this.led.set({fill : 'red'});
      renderNeeded = true;
    } else if( !isHigh(result) && isHigh(this.lastResult) ) {
      this.led.set({fill : 'darkred'});            
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


// Create a pulse generator
class Pulse extends Element {
  constructor(x1,y1,inputValue="1") {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ; 
    
    // Create an input DOM element
    inputValue = (inputValue == "" ) ? "1" : inputValue;
    this.input = inputDOM(x1+20,y1+10,this.uniqueName,inputValue,"0.1","0.1","10");

    // Start the pulsgenerator
    this.timer = null;
    this.startPulse();
    
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'pulsgenerator'), 
                     drawText(70,30,"Hz",12) ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow"));   
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
           
  // Start the pulse generator
  startPulse() {
    (this.nodes[0]).state = invert( (this.nodes[0]).state );
    var _this = this;
    this.timer = setTimeout(function() { _this.startPulse(); }, 500/(_this.input.value));
  }
  
  // Delete the dom element and stop the pulsing
  remove() {
    clearTimeout(this.timer);   // Stop the pulse generator
    this.input.remove();        // Remove the DOM element
  }
}

// Variable voltage power
class VarVoltage extends Element {
  constructor(x1,y1,inputValue="0") {
    super(x1,y1);
    this.nodes = [ new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall ) ] ; 
    
    // Create an input DOM element
    inputValue = (inputValue == "") ? "0" : inputValue;
    this.input = inputDOM(x1+20,y1+10,this.uniqueName,inputValue,"0.1","0","5");

    // set voltage from the DOM element
    this.nodes[0].state = this.input.value;
    
    var groupList = [ drawBoxAndText(0,0,boxWidth,boxHeightSmall,'variabele spanning'), 
                      drawText(70,30,"V",12) ]
                     .concat(drawCircles(x1,y1,this.nodes, "yellow")); 
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList);
  }
  
  // Update voltage from the DOM element
  output() { this.nodes[0].state = this.input.value; };
  
  // Delete the dom element 
  remove() { this.input.remove(); }
}


// Comparator
class Comparator extends Element {
  constructor(x1,y1,inputValue="0") {
    super(x1,y1);
    let node1 = new InputNode(x1+25, y1+25 );
    let node2 = new ComparatorNode(x1+boxWidth-25, y1+35, node1);
    this.nodes = [ node1, node2 ] ;     

    // Create an input DOM element
    inputValue = (inputValue == "") ? "2.5" : inputValue;
    this.input = inputDOM(x1+70,y1+60,this.uniqueName,inputValue,"0.1","0","5");

    // set reference voltage from the DOM element
    this.nodes[1].state = this.input.value;
    
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
  }
  
  // Update reference voltage from the DOM element
  output() { this.nodes[1].compare = this.input.value; };

  // Delete the dom element 
  remove() { this.input.remove(); }
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

// Create Counter
class Counter extends Element {
  constructor(x1,y1){
    super(x1,y1);
    this.counter = 0;
    this.state = low;

    // Create the nodes
    this.nodes = [ new InputNode( x1+25, y1+80 ), // reset
                   new InputNode( x1+25, y1+50 ), // inhibit 
                   new InputNode( x1+25, y1+20 ), // count pulses
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
    let node2 = new RelaisNode(x1+boxWidth-75, y1+boxHeight-25, node1);
    let node3 = new RelaisNode(x1+boxWidth-25, y1+boxHeight-25, node1);
    this.nodes = [ node1, node2, node3 ] ;

    // Draw symbols and wires
    var rect = new fabric.Rect({left: 25, top: 0.5*boxHeight, width: 20, height: 10, 
                                fill: 'lightgrey', stroke: 'black', strokeWidth: 1 });   
    var textbox = new fabric.Textbox("~", { left: boxWidth-50, top: 25, width: 20,
                                            fontSize: 20, textAlign: 'center' });
    var circ = new fabric.Circle({left: boxWidth-50, top: 25, strokeWidth: 1, stroke: 'black' ,
                                  radius: 10, fill: 'lightgrey'});
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeight,'Relais'),
                     drawLine([25, 25, 25, boxHeight-25]),
                     drawLine([20, boxHeight-25, 30, boxHeight-25]),
                     drawLine([25, 0.5*boxHeight, boxWidth-70, 0.5*boxHeight]),
                     drawLine([boxWidth-25, 25, boxWidth-25, boxHeight-25]),
                     drawLine([boxWidth-75, 25, boxWidth-75, 40]),
                     drawLine([boxWidth-65, 40, boxWidth-75, 60]),
                     drawLine([boxWidth-75, 60, boxWidth-75, boxHeight-25]),
                     drawLine([boxWidth-75, 25, boxWidth-25, 25]),
                     circ, textbox, rect,
                     drawLine([30, 0.5*boxHeight-5, 20, 0.5*boxHeight+5])]
                     .concat(drawCircles(x1,y1,[this.nodes[0]], "white"),
                             drawCircles(x1,y1,this.nodes.slice(1,3), "black"));
    this.drawGroup(x1+0.5*boxWidth, y1+0.5*boxHeight, groupList);
  }
}


// Create light bulb 
class Lightbulb extends Element {
  constructor(x1,y1){
    super(x1,y1);
    this.allowSnap = false;
    this.state = false;
    var isHV = true;
    this.nodes = [ new InputNode(x1+18, y1+96, isHV ), 
                   new InputNode(x1+35, y1+129, isHV ) ] ;
    
    // Get the images of the lightbulb from the document
    var imgElementOn = document.getElementById('lighton');
    this.imgBulbOn = new fabric.Image(imgElementOn, {left: 0, top: 0 });
    this.imgBulbOn.scale(0.7);
    var imgElementOff = document.getElementById('lightoff');
    this.imgBulbOff = new fabric.Image(imgElementOff, {left: 0, top: 0 });
    this.imgBulbOff.scale(0.7);
    
    // Draw the group and set the correct positions afterwards
    var groupList = [ this.imgBulbOff ];
    this.drawGroup(0, 0, groupList);
    this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });
    this.group.setCoords();
    var circles = drawCircles(0,0,this.nodes, "black");  
    for( var i=0; i<circles.length; ++i ) {
      this.group.addWithUpdate( circles[i] ); 
    }
    this.imgBulbOn.set({left: this.imgBulbOff.left, top: this.imgBulbOff.top });  // update to same pos
  }  
  
  output() {
    var newState = this.nodes[0].child && this.nodes[1].child && // nodes should be connected
                   this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
                   isHigh( this.nodes[1].eval() ) ; // check node2
    if( (newState && !this.state) || (!newState && this.state) ) {
      this.state = newState;
      renderNeeded = true;
      if( this.state ) { 
        this.group.remove(this.imgBulbOff);
	      this.group.add(this.imgBulbOn);
        this.imgBulbOn.moveTo(0);
      } else {
        this.group.remove(this.imgBulbOn);
        this.group.add(this.imgBulbOff);
        this.imgBulbOff.moveTo(0);
      }
      // also update all light sensors
      for (var i = 0; i < elements.length; i++) { 
        if( elements[i].constructor.name == "LightSensor" ) {
          var lightsensor = elements[i];
          updateLDR( lightsensor.nodes[0] );
        }
      }
    }
  }
}


// Make movable image for LDR
function makeLDR(left, top, node){
  var domLDR = document.getElementById('ldr');
  var imgLDR = new fabric.Image(domLDR, { left: left, top: top });
  imgLDR.scale(0.15);
  imgLDR.name = "LDR";
  imgLDR.node = node;
  return imgLDR;
}

// Create a light sensor
class LightSensor extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.nodes = [ new LightSensorNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, x1+25, y1+25 ) ] ; 
  
    var groupList = [drawBoxAndText(0,0,boxWidth,boxHeightSmall,'lichtsensor')]
                    .concat(drawCircles(x1,y1,this.nodes, "yellow"));
    this.drawGroup( x1+0.5*boxWidth, y1+0.5*boxHeightSmall, groupList );

    // Make movable image for LDR
    this.ldr = makeLDR(this.nodes[0].xLDR, this.nodes[0].yLDR, this.nodes[0]);
    canvas.add(this.ldr);
  }
 
  remove() { canvas.remove( this.ldr ); };
}    


// Create heater 
class Heater extends Element {
  constructor(x1,y1) {
    super(x1,y1);
    this.allowSnap = false;
    this.oldTemperature = temperatureInside;

    var isHV = true;
    this.nodes = [ new InputNode(x1+10, y1+85, isHV ), 
                   new InputNode(x1+10, y1+110, isHV ) ] ;

    // Temperature display
    this.textbox = new fabric.Textbox(temperatureInside.toFixed(1)+" \u2103", {
          left: 25, top: -55, width: 50, fontSize: 12, textAlign: 'right',
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
    var heatLoss = heatTransfer * (temperatureInside - temperatureOutside);
    temperatureInside += -heatLoss * clockPeriod*0.001 / heatCapacity;

    if( this.nodes[0].child && this.nodes[1].child && // nodes should be connected
        this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
        isHigh( this.nodes[1].eval() ) ) { // check node2
      temperatureInside += powerHeater * clockPeriod*0.001 / heatCapacity;
    }
    
    var newTemperature = temperatureInside.toFixed(1);
    if( Math.abs(this.oldTemperature-newTemperature) > 0.05 ) {
      this.textbox.set({ text : temperatureInside.toFixed(1)+" \u2103"});
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
    var voltage = (temperatureInside - 15.0) * 0.2;
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

// Voltmeter
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
    if( Math.abs(newState-this.lastState) < 0.1) return true; 
    var angle = Math.PI*(0.25+0.5*(newState/5.0));
    var x2 = -18*Math.cos(angle);
    var y2 = -8 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });
    renderNeeded = true;
    this.lastState = newState;
  }
}    


/* === USER INTWERACTION AND EVENT LISTENERS ===
   - Save/load file
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
        wire.node = null; // better to remove wire object itself ....
      }
    }
  }
    
  // remove element object itself
  // ...
  element.remove();
}

function requestRemoveElements() {
  if ( confirm("Weet je zeker dat je alles wilt verwijderen?") ) removeElements();
}

function removeElements() {
  elements.forEach(function(element) { removeElement(element);});
  elements = [];  
}


// Event listener: Change button color and state of OutputNode when pushed
canvas.on({'mouse:down':mouseClick});
function mouseClick(e) {
  var p = e.target;
  if( p && p.name == "button") {
    p.node.state = invert(p.node.state);
    p.node.state = high;
    p.set({ fill: '#333333', strokeWidth: 3, radius: 10});
    p.setGradient('stroke', gradientButtonDw );
  }
}
    
// Event listener: either remove the element of update button
canvas.on('mouse:up', function(e) {
  var p = e.target;
  if( deleteComponents && p && p.name == "element") {
    removeElement(p.element);
    // Delete the element from the list of elements
    var index = elements.indexOf(p.element);
    if (index > -1) elements.splice(index, 1);
  }
  // Change button color and state of OutputNode to low when mouse is up
  if( p && p.name == "button") {
    // a mouse-click can be too short for the engine to evaluate itself
    timeOutButton = setTimeout(function(){ p.node.state = low; renderNeeded = true}, 
                               clockPeriod+5); // add small delay
    p.set({ fill: '#222222', strokeWidth: 3, radius: 10});
    p.setGradient('stroke', gradientButtonUp );
  }
});


// Event listener: Moving wire, ldr or element
canvas.on('object:moving', function(e) {
  var p = e.target;
  if( p.name == "wire" ) moveWire(p);
  if( p.name == "LDR" ) {
    canvas.bringToFront(p);
    p.node.xLDR = p.left;
    p.node.yLDR = p.top;
    updateLDR(p.node);
  }
  if( p.name == "element" ) moveElement(p);
});

// Update LDR (voltage to light sensor) when moving
function updateLDR(node){
  // Find all lightbulbs and calculate distance
  node.state = low;    
  var lightbulb = null;
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].constructor.name == "Lightbulb" ) {
	    lightbulb = elements[i];
      if( lightbulb && lightbulb.state ) {
        var xPosLight = lightbulb.x + 0.5*lightbulb.group.width;
        var yPosLight = lightbulb.y + 0.5*lightbulb.group.height;
        var dist = Math.pow(node.xLDR-xPosLight,2)+Math.pow(node.yLDR-yPosLight,2);
        var voltage = 5.0/(1.0+dist/20000.0);
        // Normalize distance (maximum is around 1000) to 5 V
        node.state += voltage;
      }
    }
  }
  node.state = Math.min(node.state, 5); // Set maximum to 5 volt
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
  if( element.button ) canvas.bringToFront(element.button);
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
  }
  if( element.input ) {
    var input = element.input;
    input.style.left = (parseFloat(input.style.left.slice(0,-2)) + diffX) + 'px';
    input.style.top = (parseFloat(input.style.top.slice(0,-2)) + diffY) + 'px';
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
    if( p.name != "wire" ) return;
    var snapped = false;
    // reset connection wire
    if( p.connection ) p.connection.child = null;
    for (i = 0; i < elements.length; i++) {
      for (j = 0; j < elements[i].nodes.length; j++) {
        var node1 = p.node;
        var node2 = elements[i].nodes[j];
        if( p.left == node2.x1 && p.top == node2.y1 ) { // Not such a good check for floats ...
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

// Event listener for uploading files
var control = document.getElementById("fileinput");
control.addEventListener("change", function(event) {
  let files = control.files;
  //Use createObjectURL, this should address any CORS issues.
  let filePath = URL.createObjectURL(files[0]);
  readFile(filePath);
  // Reset the file input such that it triggers next change
  control.value = '';
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
  var domElements = x[0].getElementsByTagName("element");

  for (i = 0; i < domElements.length; i++) { 
    var className = domElements[i].getAttribute('name');
     
    var x = parseInt( domElements[i].getAttribute('x')); 
    var y = parseInt( domElements[i].getAttribute('y'));
    var inputValue = "";
    if( className == "Comparator" || 
        className == "VarVoltage" ||
        className == "Pulse" ) {
      inputValue = domElements[i].getAttribute('inputValue');
      if( !inputValue ) inputValue = "";
    }
    addElement(className,x,y,inputValue); 
  }    
  
  // Second loop to add the links
  for (i = 0; i < domElements.length; i++) { 
    var domLinks = domElements[i].getElementsByTagName("link");
    for (j = 0; j < domLinks.length; j++) { 
      var iNode = parseInt( domLinks[j].getAttribute('id')); 
      var iToElement = parseInt( domLinks[j].getAttribute('toElement')); 
      var iToNode = parseInt( domLinks[j].getAttribute('toNode')); 
      
      // Update drawing of wire
      var node = elements[i].nodes[iNode];
      var toNode = elements[iToElement].nodes[iToNode];
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
  
}

function addElement(className,x1=0,y1=0,inputValue=""){
  // Dirty trick. Maybe use a Map (dictionary) instead.
  var myElement = eval(className);
  elements.push(new myElement(x1,y1,inputValue));
  //elements.push(new window[className](x1,y1,inputValue));
  document.getElementById('addElement').selectedIndex = 0;
}

// Event listener for download button
document.getElementById("download_xml").addEventListener("click", function(){
  var filename = prompt("Sla op als...", "systeembord.xml");
  if (filename != null && filename != "") {
    download( filename, createXmlFile());
  }  
}, false);

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

    var attPosX = xmlDoc.createAttribute("x");
    attPosX.nodeValue = Math.round(elements[i].x).toString();
    newElement.setAttributeNode(attPosX);

    var attPosY = xmlDoc.createAttribute("y");
    attPosY.nodeValue = Math.round(elements[i].y).toString();
    newElement.setAttributeNode(attPosY);
    
    //console.log("Node name="+attName.nodeValue);
    if( attName.nodeValue == "Comparator" || 
        attName.nodeValue == "VarVoltage" ||
        attName.nodeValue == "Pulse" ) {
      var attInput = xmlDoc.createAttribute("inputValue");
      attInput.nodeValue = elements[i].input.value.toString();
      newElement.setAttributeNode(attInput);
    }

    x.appendChild(newElement);
    for (var j = 0; j < elements[i].nodes.length; j++) {

      var thisNode = elements[i].nodes[j];
      if( thisNode.isInput && thisNode.child ) {
        var newLink = xmlDoc.createElement("link");

        var attLinkID = xmlDoc.createAttribute("id");
        attLinkID.nodeValue = j.toString();
        newLink.setAttributeNode(attLinkID);

        // find to which link this node points
        var toElementNode = findLink( thisNode.child );
        
        var attToElement = xmlDoc.createAttribute("toElement");
        attToElement.nodeValue = toElementNode[0].toString();
        newLink.setAttributeNode(attToElement);

        var attToElement = xmlDoc.createAttribute("toNode");
        attToElement.nodeValue = toElementNode[1].toString();
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
      if( thisNode == elements[i].nodes[j] ) return [i,j];
    }
  }
  return [-1,-1];
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


/* ============= MAIN ENGINE ==================
   Evaluate the board (all elements) using
   output() function of each element. The
   elements delegate this mostly to the nodes.
   This is repeated every clockPeriod (default: 50 ms)
   ============================================= */

// load all code after the document
$("document").ready(function(){
  var xmlFile = window.location.hash.substr(1);
  // If hash is empty read the default file
  if( xmlFile == "") xmlFile = "systeembord_dev.xml";
  // Read the xml file
  readFile("xml/"+xmlFile);  
});

// Evaluate all elements (elements evaluate the nodes)
function evaluateBoard() {
  //var t0 = performance.now()
  eventCounter++;
  for (var i = 0; i < elements.length; i++) { 
     elements[i].output();
  } 
  if( renderNeeded) {
    canvas.requestRenderAll();
    renderNeeded = false;
  }
  //var t1 = performance.now()
  //console.log("Call to doSomething took " + (t1 - t0) + " milliseconds.")
}

// Make sure that the engine is run every clockPeriod  
setInterval(evaluateBoard, clockPeriod);

//})();



