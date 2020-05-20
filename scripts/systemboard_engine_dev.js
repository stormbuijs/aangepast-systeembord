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

// Create canvas
var canvas = this.__canvas = new fabric.Canvas('c', { selection: false, preserveObjectStacking: true  });
fabric.Object.prototype.originX = fabric.Object.prototype.originY = 'center';

// Create less blurry text
fabric.Textbox.prototype.objectCaching = false;
fabric.Text.prototype.objectCaching = false;

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


// Make movable circle for wire
function makeCircle(left, top, line1, node, color){
    var c = new fabric.Circle({left: left, top: top, radius: 3, fill: color, padding: 7});
    c.hasControls = c.hasBorders = false;
    c.name = "wire";
    c.line1 = line1;
    c.node = node;
    c.connection = null;
    return c;
}

// Make line for wire
function makeLine(coords, color) {
    return new fabric.Line(coords, {stroke: color, strokeWidth: 3, //stroke: 'black',
                                    selectable: false, evented: false });
}

// Make wire (= movable circle + line + fixed circle)
function makeWire(x1,y1,node,isHV=false) { 
  var color = isHV ? '#444444' : '#dd0000';
  //var circ = new fabric.Circle({left: x1, top: y1, radius: 3, fill: color, 
  //                              selectable: false, evented: false});
  //canvas.add(circ);
  var line = makeLine([ x1, y1, x1, y1 ],color);
  canvas.add( line );
  let endCircle = makeCircle(x1, y1, line, node, color);
  canvas.add( endCircle );
  return endCircle;
}

/*function drawConnectors(nodes,color) {
  for(var i=0; i<nodes.length; ++i) {
    if( !(nodes[i].isInput) ) {
      var color2 = nodes[i].isHV ? '#444444' : '#dd0000';
      var circRed = new fabric.Circle({left: nodes[i].x1, top: nodes[i].y1, radius: 3, fill: color2, 
                                       selectable: false, evented: false});
      canvas.add(circRed);
      circRed.sendToBack();
    }
    var circ = new fabric.Circle({left: nodes[i].x1, top: nodes[i].y1, strokeWidth: 4, 
                                  stroke: color , radius: 5, 
                                  fill: "darkgrey", selectable: false, evented: false});
    canvas.add(circ);
    circ.sendToBack();
  }
}*/

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
  //canvas.add(c);
  //c.sendToBack();
  return c;
}    
  
// Generic input node (has a child to follow)
function InputNode(x1,y1, isHV=false) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child = null;
    this.state = low; // only used by reset button of pulse counter
    this.eval = function() { return (this.child) ? this.child.eval() : false ; };
    this.isInput = true;
    this.isHV = isHV;
    //this.wire = makeWire(x1,y1,this,isHV);
}

// Generic output node (has a state=voltage)
function OutputNode(x1,y1) { 
    this.x1 = x1;
    this.y1 = y1;
    this.state = low;
    this.eval = function() { return this.state; };      
    this.isInput = false;     
    this.isHV = false;
    this.wires = [ makeWire(x1,y1,this) ];
}    

// AND node
function ANDNode(x1,y1,input1,input2, color) { 
  this.x1 = x1;
  this.y1 = y1;
  this.child1 = input1;
  this.child2 = input2;
  this.isInput = false;
  this.isHV = false;
  this.state = low;
  var lastEvent = 0;
  this.eval = function() {
    // loop protection
    if( lastEvent != eventCounter ) {
      lastEvent = eventCounter;
      this.state = (isHigh(this.child1.eval()) && isHigh(this.child2.eval()) ) ? high : low;
    }
    //lastEvent = eventCounter;
    return this.state;
  };      
  this.wires = [ makeWire(x1,y1,this) ];
}

// OR node
function ORNode(x1,y1,input1,input2) { 
  this.x1 = x1;
  this.y1 = y1;
  this.child1 = input1;
  this.child2 = input2;
  this.isInput = false;
  this.isHV = false;
  this.state = low;
  var lastEvent = 0;
  this.eval = function() {
    // loop protection
    if( lastEvent != eventCounter ) {
      lastEvent = eventCounter;
      this.state = (isHigh(this.child1.eval()) || isHigh(this.child2.eval()) ) ? high : low;
    }
    //lastEvent = eventCounter;
    return this.state;
  };  
  this.wires = [ makeWire(x1,y1,this) ];
}

// NOT node
function NOTNode(x1,y1,input1) { 
  this.x1 = x1;
  this.y1 = y1;
  this.child1 = input1;
  this.isInput = false;     
  this.isHV = false;
  this.state = low;
  var lastEvent = 0;
  this.eval = function() {
    // loop protection
    if( lastEvent != eventCounter ) {
      lastEvent = eventCounter;
      this.state = (isHigh(this.child1.eval()) ) ? low : high ;
    }
    //lastEvent = eventCounter;
    return this.state; 
  }

  this.wires = [ makeWire(x1,y1,this) ];
}    
  
// Comparator node
function ComparatorNode(x1,y1,input1) { 
  this.x1 = x1;
  this.y1 = y1;
  this.child1 = input1;
  this.compare = low;
  this.isInput = false;     
  this.isHV = false;
  this.state = low;
  var lastEvent = 0;
  this.eval = function() {
    // loop protection
    if( lastEvent != eventCounter ) {
      lastEvent = eventCounter;
      this.state = (this.child1.eval() < this.compare) ? low : high ;
    }
    //lastEvent = eventCounter;
    return this.state;
  }
  this.wires = [ makeWire(x1,y1,this) ];
}  
    
// Binary node
function BinaryNode(x1,y1,input1,bin) { 
  this.x1 = x1;
  this.y1 = y1;
  this.child1 = input1;
  this.isInput = false;     
  this.isHV = false;
  this.state = low;
  var lastEvent = 0;
  this.eval = function() {
    // loop protection
    if( lastEvent != eventCounter ) {
      lastEvent = eventCounter;
      var binary = (this.child1.eval() / high ) * 15;
      var bit = (binary & (1<<bin)) >> bin;
      this.state = ( bit == 1 ) ? high : low ;
    }
    //lastEvent = eventCounter;
    return this.state;
  }
  this.wires = [ makeWire(x1,y1,this) ];
}    

// Binary node with stored counter
function BinaryNodeS(x1,y1,bin) { 
    this.x1 = x1;
    this.y1 = y1;
    this.isInput = false;     
    this.isHV = false;
    this.counter = 0;
    this.eval = function() {
      var binary = this.counter ;
      var bit = (binary & (1<<bin)) >> bin;
      return ( bit == 1 ) ? high : low ;
    }
    this.wires = [ makeWire(x1,y1,this) ];
}    

// Relais node 
function RelaisNode(x1,y1,input) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child = input;
    this.isHV = true;
    this.eval = function() { return this.child.eval(); };      
    this.isInput = false;
    this.wires = [ makeWire(x1,y1,this,this.isHV) ];
}

// Light sensor node
function LightSensorNode(x1,y1,x2,y2) { 
    this.x1 = x1;
    this.y1 = y1;
    this.xLDR = x2;
    this.yLDR = y2;
    this.state = low;
    this.eval = function() { return this.state; };      
    this.isInput = false;     
    this.isHV = false;
    this.wires = [ makeWire(x1,y1,this) ];
}    

// output node for sound sensor
function SoundSensorNode(x1,y1,element) { 
  this.x1 = x1;
  this.y1 = y1;
  this.state = low;
  this.isInput = false;     
  this.isHV = false;
  this.wires = [ makeWire(x1,y1,this) ];
  this.element = element

  var micStarted = false;
  var analyser = null, microphone = null, javascriptNode = null;
  this.eval = function() { 
    // Initialize the microphone
    if( audioCtx ) {
      if( !micStarted ) {      
        micStarted = true;
        var _this = this;
        // Start the audio stream
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
          analyser = audioCtx.createAnalyser();
          microphone = audioCtx.createMediaStreamSource(stream);
          javascriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
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
            _this.state = Math.min(0.05 * soundLevel, 5.0) ;
          }
        })
        .catch(function(err) {
          element.textbox.setColor('darkgrey');
          renderNeeded = true;
          console.log("The following error occured: " + err.name);
        });
      } else if (audioCtx.state == 'suspended') {
        audioCtx.resume();
      }
    } else { // no audioCtx
      element.textbox.setColor('darkgrey');
      renderNeeded = true;
    }
    return this.state; 
  }
}    




// Draw the box plus text
/*function drawElementBox(x1,y1,width,height,text) {
    // Draw text in box
    //var textbox = new fabric.Textbox(text, { left: x1+0.5*width, top: y1+(height-10), width: width,

    var textbox = new fabric.Textbox(text, { left: 0.5*width, top: height-10, width: width,
                                            fontSize: 12, textAlign: 'center', fontFamily:'Arial',
                                            selectable: false, evented: false });
    //canvas.add(textbox)
    //textbox.sendToBack();
    // Draw box
    //var r = new fabric.Rect({left: x1+0.5*width, top: y1+0.5*height, height: height, width: width, 

    var r = new fabric.Rect({left: 0.5*width, top: 0.5*height, height: height, width: width, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });
    //canvas.add(r);
    //r.sendToBack();
  
  var group = new fabric.Group([ r, textbox ], { left: x1+0.5*width, top: y1+0.5*height, 
                                                selectable: false, evented: false});
  canvas.add(group);
  group.sendToBack();

  return group;
}




function drawSymbolBox(x1,y1,text){
  // Draw text in box
  //var txt = new fabric.Textbox(text, { left: x1, top: y1, fontSize: 16, textAlign: 'center',

  var txt = new fabric.Textbox(text, { left: 0, top: 0, fontSize: 16, textAlign: 'center',
                                       fontFamily: 'Arial', selectable: false, evented: false });
  //canvas.add(txt)
  //txt.sendToBack();
  var r = new fabric.Rect({left: 0, top: 0, height: 30, width: 30, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1 });
  //canvas.add(r);
  //r.sendToBack();

  var group = new fabric.Group([ r, txt ], { left: x1, top: y1, 
                                             selectable: false, evented: false});
  canvas.add(group);
  group.sendToBack();
  return group;
}
*/

function drawText(x1,y1,text,fontsize=10){
  // Draw text
  var txt = new fabric.Text(text, {left: x1, top: y1, originX: 'left', originY: 'bottom', 
                                    /*width: 5,*/ fontSize: fontsize, fontFamily: 'Arial', 
                                    selectable: false, evented: false });
  //canvas.add(txt)
  //txt.sendToBack();
  return txt;
}

/*function drawConnection(coords){
  var line = new fabric.Line(coords, {stroke: 'black', strokeWidth: 1,
                              selectable: false, evented: false });
  canvas.add(line);
  line.sendToBack();
}*/


// Draw the box plus text
function drawBoxAndText(x1,y1,width,height,text) {
  // Draw text and box
  var textbox = new fabric.Textbox(text, { left: 0.5*width, top: height-10, width: width,
                                            fontSize: 12, textAlign: 'center', fontFamily:'Arial',
                                            selectable: false, evented: false });
  var r = new fabric.Rect({left: 0.5*width, top: 0.5*height, height: height, width: width, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1   });  
  var group = new fabric.Group([ r, textbox ], { left: x1+0.5*width, top: y1+0.5*height, 
                                                selectable: false, evented: false});
  return group;
}

function drawBoxWithSymbol(x1,y1,text){
  // Draw text and box
  var txt = new fabric.Textbox(text, { left: 0, top: 0, fontSize: 16, textAlign: 'center',
                                       fontFamily: 'Arial', selectable: false, evented: false });
  var r = new fabric.Rect({left: 0, top: 0, height: 30, width: 30, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1 });
  var group = new fabric.Group([ r, txt ], { left: x1, top: y1, 
                                             selectable: false, evented: false});
  return group;
}

function drawLine(coords){
  var line = new fabric.Line(coords, {stroke: 'black', strokeWidth: 1,
                              selectable: false, evented: false });
  return line;
}

/*function drawHeader(x1,y1,text) {
  // Draw text in box
  var textbox = new fabric.Text(text, { left: x1, top: y1, 
                                        fontSize: 16, textAlign: 'center', fontFamily:'Arial',
                                        selectable: false, evented: false });

  //canvas.setBackgroundImage(textbox);
  return textbox;
}*/

function drawCircles(x1,y1,nodes,color) {
  var circles = [];
  for(var i=0; i<nodes.length; ++i) {
    var circ = new fabric.Circle({left: nodes[i].x1-x1, top: nodes[i].y1-y1, strokeWidth: 4, 
                                  stroke: color , radius: 5, 
                                  fill: "darkgrey", selectable: false, evented: false});
    circles.push(circ);
    //console.log("circle pos " + circ.left + " " + circ.top);
    // Add red dot for output nodes
    if( !(nodes[i].isInput) ) {
      var color2 = nodes[i].isHV ? '#444444' : '#dd0000';
      var circRed = new fabric.Circle({left: nodes[i].x1-x1, top: nodes[i].y1-y1, radius: 3, fill: color2, 
                                       selectable: false, evented: false});
      circles.push(circRed);
    }
  }
  return circles;
}




// Draw the board plus text
function Board(x1,y1) {
  this.x = x1;
  this.y = y1;

  var r = new fabric.Rect({left: 0, top: 0, width: 640, height: 474, 
                           originX: 'left', originY: 'top',
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 2   });
  /*this.group = new fabric.Group([ r, drawHeader(80, 11,"INVOER"),
                                 drawHeader(316, 11,"VERWERKING"),
                                 drawHeader(550, 11, "UITVOER") ], 
  */
  this.group = new fabric.Group([ r, drawText(60, 21,"INVOER",16),
                                 drawText(265, 21,"VERWERKING",16),
                                 drawText(520, 21, "UITVOER",16) ], 
                               {left: x1, top: y1+5, originX: 'left', originY: 'top',
                                hasControls: false, hasBorders: false,
                                selectable: false, evented: false });
  this.group.name = "element";
  this.group.element = this;
  canvas.sendToBack(this.group); //settBackgroundImage(group);
  
  // Dummy functions
  this.nodes = [];
  this.output = function() { };
  this.remove = function() { };
}

// Create AND port with its nodes
function ANDPort(x1,y1) {
  this.x = x1;
  this.y = y1;
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new ANDNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
  this.nodes = [ node1, node2 , node3 ] ;
  /*drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "&");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);

  drawElementBox(x1,y1,boxWidth,boxHeight,'EN-poort');
*/
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeight,'EN-poort'),
                                 drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                                 drawLine([25, 25, 25, 40]),
                                 drawLine([25, 40, 0.5*boxWidth, 40]),
                                 drawLine([25, boxHeight-25, 25, boxHeight-40]),
                                 drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                                 drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "&")]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  //this.group.sendToBack(); // get rid of this....
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });

  this.output = function() {return true;};
  this.remove = function() { 
  }
}

// Create OR port with its nodes
function ORPort(x1,y1) {
  this.x = x1;
  this.y = y1;
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new ORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
  this.output = function() { return true; };
  this.nodes = [ node1, node2 , node3 ] ;
  /*drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "\u22651");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawElementBox(x1,y1,boxWidth,boxHeight,'OF-poort');
  */
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeight,'OF-poort'),
                                 drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                                 drawLine([25, 25, 25, 40]),
                                 drawLine([25, 40, 0.5*boxWidth, 40]),
                                 drawLine([25, boxHeight-25, 25, boxHeight-40]),
                                 drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                                 drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "\u22651")]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  this.remove = function() { };
}

// Create NOT port with its nodes
function NOTPort(x1,y1) {
  this.x = x1;
  this.y = y1;
  let node1 = new InputNode(x1+25, y1+0.5*boxHeightSmall );
  let node2 = new NOTNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, node1);
  this.nodes = [ node1, node2 ] ;     
  /*drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1-7+0.5*boxHeightSmall, "1");
  drawConnection([x1+25, y1+0.5*boxHeightSmall, x1+boxWidth-25, y1+0.5*boxHeightSmall]);
  drawConnection([x1+15+0.5*boxWidth, y1-5+0.5*boxHeightSmall, 
                  x1+20+0.5*boxWidth, y1+0.5*boxHeightSmall]);
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'invertor');
  */
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'invertor'),
                                 drawLine([25, 0.5*boxHeightSmall, boxWidth-25, 0.5*boxHeightSmall]),
                                 drawLine([15+0.5*boxWidth, -5+0.5*boxHeightSmall, 
                                           20+0.5*boxWidth, 0.5*boxHeightSmall]),
                                 drawBoxWithSymbol(0.5*boxWidth, -7+0.5*boxHeightSmall, "1")]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  this.output = function() { return true; };
  this.remove = function() { };
}

// Create memory cell with its nodes
function Memory(x1,y1) {
  this.x = x1;
  this.y = y1;
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeight);
  this.nodes = [ node1, node2, node3 ] ;     
  /*drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "M");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawText(x1+35,y1+31,"set");
  drawText(x1+35,y1+boxHeight-19,"reset");
  drawElementBox(x1,y1,boxWidth,boxHeight,'geheugencel');*/
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeight,'geheugencel'),
                                 drawLine([0.5*boxWidth, 0.5*boxHeight, boxWidth-25, 0.5*boxHeight]),
                                 drawLine([25, 25, 25, 40]),
                                 drawLine([25, 40, 0.5*boxWidth, 40]),
                                 drawLine([25, boxHeight-25, 25, boxHeight-40]),
                                 drawLine([25, boxHeight-40, 0.5*boxWidth, boxHeight-40]),
                                 drawText(35,31,"set"),
                                 drawText(35,boxHeight-19,"reset"),
                                 drawBoxWithSymbol(0.5*boxWidth, 0.5*boxHeight, "M")]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  this.output = function() { 
    if( isHigh(node2.eval()) ) this.nodes[2].state = low;
    if( isHigh(node1.eval()) ) this.nodes[2].state = high; // set always wins
    return true;
  }
  this.remove = function() { };
}
    
// Create LED with node
function LED(x1,y1) {
  this.x = x1;
  this.y = y1;
    
  this.nodes = [ new InputNode(x1+25, y1+20 ) ] ;    
  //drawConnectors(this.nodes, "white");

  // Draw LED
  var c = new fabric.Circle({left: boxWidth-25, top: 20, radius: 5, 
                             fill: 'darkred', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 2   });
  c.setGradient('stroke', gradientButtonDw );
  //canvas.add(c);
  //c.sendToBack();
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'LED');
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'LED'), c]
                                 .concat(drawCircles(x1,y1,this.nodes, "white")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  
  var lastResult = 0.0;
  // Control LED behaviour
  this.output = function() {
    var result = this.nodes[0].eval();
    if( isHigh(result) && !isHigh(lastResult) ) {
      c.set({fill : 'red'});
      renderNeeded = true;
    } else if( !isHigh(result) && isHigh(lastResult) ) {
      c.set({fill : 'darkred'});            
      renderNeeded = true;
    }
    lastResult = result;
    return result;
  };

  this.remove = function() { };
}

// Create sound output
function Buzzer(x1,y1) {
  this.x = x1;
  this.y = y1;
  this.nodes = [ new InputNode(x1+25, y1+0.5*boxHeightSmall) ] ;    

  //drawConnectors(this.nodes, "white");

  // Draw speaker
  var c1 = new fabric.Path('M 130 15 Q 135, 25, 130, 35', 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });

  /*var c1 = new fabric.Path('M '+(130).toString()+' '+(15).toString()+' Q '+
                           (135).toString()+', '+(25).toString()+', '+
                           (130).toString()+', '+(35).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });*/
  //canvas.add(c1); c1.sendToBack();    
  var c2 = new fabric.Path('M 135 10 Q 145, 25, 135, 40', 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });

  /*var c2 = new fabric.Path('M '+(x1+135).toString()+' '+(y1+10).toString()+' Q '+
                           (x1+145).toString()+', '+(y1+25).toString()+', '+
                           (x1+135).toString()+', '+(y1+40).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });*/
  //canvas.add(c2); c2.sendToBack();    

  var r = new fabric.Rect({left: 117, top: 25, height: 20, width: 10, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });   
  //canvas.add(r); r.sendToBack();

  var t = new fabric.Triangle({left: 120, top: 25, height: 15, width: 30, 
                           fill: 'lightgrey', selectable: false, evented: false, angle:-90,
                           stroke: 'black', strokeWidth: 1 });
  //canvas.add(t); t.sendToBack();     
  
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'zoemer');

  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'zoemer'), c1,c2,t,r]
                                 .concat(drawCircles(x1,y1,this.nodes, "white")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group); 

  this.state = false;
  
  // Control buzzer behaviour
  this.output = function() {  
    var result = this.nodes[0].eval();
      if( isHigh(result) && !this.state) {    
        this.state = true;
        startBuzzer();
        c1.set({strokeWidth: 1});
        c2.set({strokeWidth: 1});
        renderNeeded = true;
      } else if(!isHigh(result) && this.state) {
        this.state = false;
        stopBuzzer();
        c1.set({strokeWidth: 0});
        c2.set({strokeWidth: 0});        
        renderNeeded = true;
      }
      return result;
  };

  this.remove = function() { };

}    
    
// Create switch
function Switch(x1,y1) {
  this.x = x1;
  this.y = y1;
  this.output = function() { return true;};
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ;
  //drawConnectors(this.nodes, "yellow");
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'drukschakelaar');
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'drukschakelaar'), 
                                 /*drawButton(25, 0.5*boxHeightSmall, node)*/]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);  
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  // Draw the push button
  this.button = drawButton(x1+25, y1+0.5*boxHeightSmall, node);
  canvas.add(this.button);
  //this.button.sendToBack();

  this.remove = function() { };
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
    //body = document.getElementsByTagName("BODY")[0];
    body = document.getElementById("canvas1");
    body.appendChild(input); // put it into the DOM
    return input ;
}
    
// Create a pulse generator
function Pulse(x1,y1,inputValue="1") {
  this.x = x1;
  this.y = y1; 
  //drawText(x1+70,y1+30,"Hz",12);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ; 

  //drawConnectors(this.nodes, "yellow");
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'pulsgenerator');

  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'pulsgenerator'), 
                                 drawText(70,30,"Hz",12) ]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  // Create unique element ID
  var nPulse = 0;
  elements.forEach((element) => {
    if( element.constructor.name == "Pulse") ++nPulse;
  });
  //var elementName = "frequency"+x1.toString()+y1.toString(); // This does not work anymore .....
  var elementName = "frequency"+nPulse.toString(); 
  
  // Create an input DOM element
  inputValue = (inputValue == "" ) ? "1" : inputValue;
  this.input = inputDOM(x1+20,y1+10,elementName,inputValue,"0.1","0.1","10");

  this.pulseStarted = false;
  this.output = function() { return true; };
         
  // Start the pulse generator
  var timer;
  this.startPulse = function() {
    node.state = invert(node.state);
    //var myElement = document.getElementById(elementName);
    var _this = this;
    //timer = setTimeout(function() { _this.startPulse(); }, 500/(myElement.value));
    timer = setTimeout(function() { _this.startPulse(); }, 500/(_this.input.value));

  }
  this.startPulse();
  
  // Delete the dom element and stop the pulsing
  this.remove = function() {
    // Stop the pulse generator
    clearTimeout(timer);
    // Remove the DOM element
    //var myElement = document.getElementById(elementName);
    //myElement.remove();
    //body = document.getElementById("canvas1");
    //body.removeChild(this.input);
    this.input.remove();
  }
  
}    

// Variable voltage power
function VarVoltage(x1,y1,inputValue="0") {
  this.x = x1;
  this.y = y1;
  
  //drawText(x1+70,y1+30,"V",12);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ; 
  
  //drawConnectors(this.nodes, "yellow");
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'variabele spanning');
 
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'variabele spanning'), 
                                 drawText(70,30,"V",12) ]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
  // Create unique element ID
  var nVarVoltage = 0;
  elements.forEach((element) => {
    if( element.constructor.name == "VarVoltage") ++nVarVoltage;
  });
  var elementName = "voltage"+nVarVoltage.toString();

  // Create an input DOM element
  inputValue = (inputValue == "") ? "0" : inputValue;
  this.input = inputDOM(x1+20,y1+10,elementName,inputValue,"0.1","0","5");

  // Create an ouput node and set voltage from the DOM element
  node.state = this.input.value;
  this.output = function() {
    this.nodes[0].state = this.input.value;
    return true;
  };

  // Delete the dom element
  this.remove = function() {
    // Remove the DOM element
    //var myElement = document.getElementById(elementName);
    //myElement.remove();
    this.input.remove();
  }


}    

// Comparator
function Comparator(x1,y1,inputValue="2.5") {
  this.x = x1;
  this.y = y1;
  //drawText(x1+120,y1+80,"V",12);
  //drawText(x1+57,y1+31,"+");
  //drawText(x1+57,y1+53,"\u2212");
  var r = new fabric.Triangle({left: 0.5*boxWidth, top: 35, height: 40, width: 40, 
                               fill: 'lightgrey', selectable: false, evented: false, angle:90,
                               stroke: 'black', strokeWidth: 1 });
  //canvas.add(r);
  //r.sendToBack();  
  
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new ComparatorNode(x1+boxWidth-25, y1+35, node1);
  this.nodes = [ node1, node2 ] ;     

  //drawConnectors(this.nodes, "blue");

  /*drawConnection([x1+25, y1+25, x1+60, y1+25]);
  drawConnection([x1+60, y1+35, x1+boxWidth-25, y1+35]);
  drawConnection([x1+40, y1+45, x1+60, y1+45]);
  drawConnection([x1+40, y1+45, x1+40, y1+70]);
  drawConnection([x1+40, y1+70, x1+70, y1+70]);
  drawElementBox(x1,y1,boxWidth,boxHeight,'comparator');
  */
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeight,'comparator'),
                                 drawLine([25, 25, 60, 25]),
                                 drawLine([60, 35, boxWidth-25, 35]),
                                 drawLine([40, 45, 60, 45]),
                                 drawLine([40, 45, 40, 70]),
                                 drawLine([40, 70, 70, 70]), r,
                                 drawText(120, 80,"V",12),
                                 drawText(57, 31,"+"),
                                 drawText(57, 53,"\u2212")
                                ]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });

  // Create unique element ID
  var nComparator = 0;
  elements.forEach((element) => {
    if( element.constructor.name == "Comparator") ++nComparator;
  });
  var elementName = "comparator"+nComparator.toString();
  //console.log(elementName);
      
  // Create an input DOM element
  inputValue = (inputValue == "") ? "2.5" : inputValue;
  this.input = inputDOM(x1+70,y1+60,elementName,inputValue,"0.1","0","5");
    
  // Create the node
  node2.compare = this.input.value; // set compare value
  this.output = function() {
      this.nodes[1].compare = this.input.value;
      return true;
  };
  
  // Delete the dom element
  this.remove = function() {
    // Remove the DOM element
    //var myElement = document.getElementById(elementName);
    //myElement.remove();
    this.input.remove();
  }
  
}
    
// Create ADC
function ADC(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.output = function() { return true;};
  let node4 = new InputNode( x1+25, y1+17 );
  let node3 = new BinaryNode(x1+boxWidth-85, y1+17, node4, 3 );
  let node2 = new BinaryNode(x1+boxWidth-65, y1+17, node4, 2 );
  let node1 = new BinaryNode(x1+boxWidth-45, y1+17, node4, 1 );
  let node0 = new BinaryNode(x1+boxWidth-25, y1+17, node4, 0 );
  this.nodes = [ node4,node3,node2,node1,node0 ] ;
  //drawConnectors(this.nodes.slice(1,5), "yellow");
  //drawConnectors([this.nodes[0]], "white");

  /*drawText(x1+22,y1+36,"in");
  drawText(x1+boxWidth-60,y1+36,"uit");
  drawText(x1+boxWidth-88,y1+12,"8");
  drawText(x1+boxWidth-68,y1+12,"4");
  drawText(x1+boxWidth-48,y1+12,"2");
  drawText(x1+boxWidth-28,y1+12,"1");*/
  //drawConnection([x1+boxWidth-92, y1+30, x1+boxWidth-62, y1+30]);
  //drawConnection([x1+boxWidth-46, y1+30, x1+boxWidth-18, y1+30]);

  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'AD omzetter');
  
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'AD omzetter'),
                                 drawLine([boxWidth-92, 30, boxWidth-62, 30]),
                                 drawLine([boxWidth-46, 30, boxWidth-18, 30]),
                                 drawText(22,36,"in"),
                                 drawText(boxWidth-60,36,"uit"),
                                 drawText(boxWidth-88,12,"8"),
                                 drawText(boxWidth-68,12,"4"),
                                 drawText(boxWidth-48,12,"2"),
                                 drawText(boxWidth-28,12,"1")]
                                 .concat(drawCircles(x1,y1,this.nodes.slice(1,5), "yellow"),
                                         drawCircles(x1,y1,[this.nodes[0]], "white")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });

  this.remove = function() {};
}

// Create Counter
function Counter(x1,y1) {
  this.x = x1;
  this.y = y1;
  
  let node4 = new InputNode( x1+25, y1+20 ); // count pulses
  let node5 = new InputNode( x1+25, y1+50 ); // inhibit 
  let node6 = new InputNode( x1+25, y1+80 ); // reset

  // Create the binary output nodes
  let node3 = new BinaryNodeS(x1+2*boxWidth-100, y1+20, 3 );
  let node2 = new BinaryNodeS(x1+2*boxWidth-75, y1+20, 2 );
  let node1 = new BinaryNodeS(x1+2*boxWidth-50, y1+20, 1 );
  let node0 = new BinaryNodeS(x1+2*boxWidth-25, y1+20, 0 );
  this.nodes = [ node6,node5,node4,node3,node2,node1,node0 ] ;
  // Draw the push button
  //drawButton(x1+100, y1+boxHeight-20, node6) ;
 
  //drawConnectors(this.nodes, "blue");

  var r = new fabric.Rect({left: 120, top: 35, height: 50, width: 50, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1 });
  //canvas.add(r); r.sendToBack();  

  /*drawText(x1+10,y1+14,"tel pulsen");
  drawText(x1+10,y1+44,"tellen aan/uit");
  drawText(x1+10,y1+74,"reset");
  drawText(x1+2*boxWidth-103,y1+14,"8");
  drawText(x1+2*boxWidth-78,y1+14,"4");
  drawText(x1+2*boxWidth-53,y1+14,"2");
  drawText(x1+2*boxWidth-28,y1+14,"1");
  */
  /*drawConnection([x1+25, y1+20, x1+120, y1+20]);
  drawConnection([x1+25, y1+50, x1+120, y1+50]);
  drawConnection([x1+25, y1+80, x1+100, y1+80]);
  drawConnection([x1+100, y1+80, x1+100, y1+50]);

  drawConnection([x1+120, y1+30, x1+2*boxWidth-100, y1+30]);
  drawConnection([x1+120, y1+33, x1+2*boxWidth-75, y1+33]);
  drawConnection([x1+120, y1+36, x1+2*boxWidth-50, y1+36]);
  drawConnection([x1+120, y1+39, x1+2*boxWidth-25, y1+39]);
  drawConnection([x1+2*boxWidth-100, y1+30,x1+2*boxWidth-100, y1+20]);
  drawConnection([x1+2*boxWidth-75, y1+33,x1+2*boxWidth-75, y1+20]);
  drawConnection([x1+2*boxWidth-50, y1+36,x1+2*boxWidth-50, y1+20]);
  drawConnection([x1+2*boxWidth-25, y1+39,x1+2*boxWidth-25, y1+20]);  
  drawConnection([x1+85, y1+50, x1+2*boxWidth-75, y1+50]);
  */
  this.counter = 0;
  this.state = low;
  
  this.textbox = new fabric.Textbox((this.counter).toString(), {
        left: 2*boxWidth-50, top: 70, width: 60, fontSize: 44, textAlign: 'right',
        fill: 'red', backgroundColor: '#330000', fontFamily: 'Courier New',
        selectable: false, evented: false });
  //canvas.add(this.textbox);
  //this.textbox.sendToBack();

  //drawElementBox(x1,y1,2*boxWidth,boxHeight,'pulsenteller');

  this.group = new fabric.Group([drawBoxAndText(0,0,2*boxWidth,boxHeight,'pulsenteller'),
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
                                 r, this.textbox,
                                 drawText(10,14,"tel pulsen"),
                                 drawText(10,44,"tellen aan/uit"),
                                 drawText(10,74,"reset"),
                                 drawText(2*boxWidth-103,14,"8"),
                                 drawText(2*boxWidth-78,14,"4"),
                                 drawText(2*boxWidth-53,14,"2"),
                                 drawText(2*boxWidth-28,14,"1"),
                                 /*drawButton(100, boxHeight-20, node6)*/ ]
                                 .concat(drawCircles(x1,y1,this.nodes, "blue")),
                                 {left: x1+boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });
  
    // Draw the push button
  this.button = drawButton(x1+100, y1+boxHeight-20, node6) ;
  canvas.add(this.button);
  
  this.output = function() {
    // reset counter (check button or reset node)
    if( isHigh(node6.state) || isHigh(node6.eval())) { 
      if( this.counter != 0 ) {
        this.counter = 0;
        //this.textbox.text = (this.counter).toString();
        this.textbox.set( {'text' : this.counter.toString() });
        renderNeeded = true;
      }
    } else {
      // inhibit counter
      if( node5.child && !isHigh(node5.eval()) ) {
        this.state = low;
        return true; 
      }
      var currentState = node4.eval();
      if( isHigh(currentState) && isLow(this.state) ) {
        this.state = high;
        ++this.counter; // only count rising edge
        if( this.counter == 16) this.counter = 0; // reset counter
        this.textbox.set( {'text' : this.counter.toString() });
        renderNeeded = true;
        //this.textbox.dirty = true;
        //this.group.dirty = true;
        //console.log( this.textbox.text );
      }
      if( isLow(currentState) && isHigh(this.state) ) { this.state = low;}
    }
    // update counters
    this.nodes[3].counter = this.counter;
    this.nodes[4].counter = this.counter;
    this.nodes[5].counter = this.counter;
    this.nodes[6].counter = this.counter;
    return true;
  };
  
  this.remove = function() {};
}


// Create relais with its nodes
function Relais(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.output = function() {return true;};
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new RelaisNode(x1+boxWidth-75, y1+boxHeight-25, node1);
  let node3 = new RelaisNode(x1+boxWidth-25, y1+boxHeight-25, node1);
  this.nodes = [ node1, node2, node3 ] ;
  //drawConnectors([this.nodes[0]], "white");

  //drawConnectors(this.nodes.slice(1,3), "black");

  // Draw symbols and wires
  //drawConnection([x1+30, y1+0.5*boxHeight-5, x1+20, y1+0.5*boxHeight+5]);
  var r = new fabric.Rect({left: 25, top: 0.5*boxHeight, width: 20, height: 10, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });   
  //canvas.add(r); r.sendToBack();
  var textbox = new fabric.Textbox("~", { left: boxWidth-50, top: 25, width: 20,
                                          fontSize: 20, textAlign: 'center', fontFamily:'Arial',
                                          selectable: false, evented: false });
  //canvas.add(textbox);
  //textbox.sendToBack();
  var circ = new fabric.Circle({left: boxWidth-50, top: 25, strokeWidth: 1, stroke: 'black' ,
                                radius: 10, fill: 'lightgrey', selectable: false, evented: false});
  //canvas.add(circ);
  //circ.sendToBack();
  /*drawConnection([x1+25, y1+25, x1+25, y1+boxHeight-25]);
  drawConnection([x1+20, y1+boxHeight-25, x1+30, y1+boxHeight-25]);
  drawConnection([x1+25, y1+0.5*boxHeight, x1+boxWidth-70, y1+0.5*boxHeight]);  
  drawConnection([x1+boxWidth-25, y1+25, x1+boxWidth-25, y1+boxHeight-25]);
  drawConnection([x1+boxWidth-75, y1+25, x1+boxWidth-75, y1+40]);
  drawConnection([x1+boxWidth-65, y1+40, x1+boxWidth-75, y1+60]);
  drawConnection([x1+boxWidth-75, y1+60, x1+boxWidth-75, y1+boxHeight-25]);
  drawConnection([x1+boxWidth-75, y1+25, x1+boxWidth-25, y1+25]);

  drawElementBox(x1,y1,boxWidth,boxHeight,'Relais');
  */
  
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeight,'Relais'),
                                 drawLine([25, 25, 25, boxHeight-25]),
                                 drawLine([20, boxHeight-25, 30, boxHeight-25]),
                                 drawLine([25, 0.5*boxHeight, boxWidth-70, 0.5*boxHeight]),
                                 drawLine([boxWidth-25, 25, boxWidth-25, boxHeight-25]),
                                 drawLine([boxWidth-75, 25, boxWidth-75, 40]),
                                 drawLine([boxWidth-65, 40, boxWidth-75, 60]),
                                 drawLine([boxWidth-75, 60, boxWidth-75, boxHeight-25]),
                                 drawLine([boxWidth-75, 25, boxWidth-25, 25]),
                                 circ, textbox,r,
                                 drawLine([30, 0.5*boxHeight-5, 20, 0.5*boxHeight+5])]
                                 .concat(drawCircles(x1,y1,[this.nodes[0]], "white"),
                                         drawCircles(x1,y1,this.nodes.slice(1,3), "black")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeight,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });



  this.remove = function() {};

}


// Create light bulb 
function Lightbulb(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.state = false;
  var isHV = true;
  let node1 = new InputNode(x1+18, y1+96, isHV );
  let node2 = new InputNode(x1+35, y1+129, isHV );
  this.nodes = [ node1, node2 ] ;

  var imgElementOn = document.getElementById('lighton');
  this.imgBulbOn = new fabric.Image(imgElementOn, {
    left: 0, 
    top: 0, selectable: false, evented: false,
  });
  this.imgBulbOn.scale(0.7);
  
  var imgElementOff = document.getElementById('lightoff');
  this.imgBulbOff = new fabric.Image(imgElementOff, {
    left: 0,
    top: 0, selectable: false, evented: false,
  });
  this.imgBulbOff.scale(0.7);
    
  this.group = new fabric.Group([ this.imgBulbOff ],
                                 {hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });

  this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });  
  var circles = drawCircles(0,0,this.nodes, "black");  
  for( var i=0; i<circles.length; ++i ) {
    this.group.addWithUpdate( circles[i] ); 
  }

  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  this.imgBulbOn.set({left: this.imgBulbOff.left, top: this.imgBulbOff.top });  // update to same pos
  
  this.output = function() {
    var newState = this.nodes[0].child && this.nodes[1].child && // nodes should be connected
                   this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
                   isHigh( this.nodes[1].eval() ) ;// check node2
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
    return;
  };

  this.remove = function() {};

}


// Make movable image for LDR
function makeLDR(left, top, node){
  var domLDR = document.getElementById('ldr');
  var imgLDR = new fabric.Image(domLDR, { left: left, top: top });
  imgLDR.scale(0.15);
  //canvas.add(imgLDR);  
  //imgLDR.sendToBack();
  imgLDR.hasControls = c.hasBorders = false;
  imgLDR.name = "LDR";
  imgLDR.node = node;
  return imgLDR;
}

// Make display for sensor
/*function makeDisplay(x1, y1){

  var l = new fabric.Line([x1+75,y1+30,x1+75,y1+12], {strokeWidth: 2, stroke: 'red' ,
                           selectable: false, evented: false});
  canvas.add(l); l.sendToBack();

  var r = new fabric.Rect({left: x1+75, top: y1+20, height: 20, width: 40, 
                           fill: 'white', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();

  return l;
}*/

// Light sensor
function LightSensor(x1,y1) {
  this.x = x1;
  this.y = y1;

  /*this.textbox = new fabric.Textbox("0.00", {
        left: x1+boxWidth-60, top: y1-20, width: 30, fontSize: 10, textAlign: 'right',
        fill: 'red', fontFamily: 'Arial',
        selectable: false, evented: false });
  canvas.add(this.textbox);*/

  //drawText(x1+57,y1+19,"0",8);
  //drawText(x1+88,y1+19,"5",8);
  //this.display = makeDisplay(x1,y1);
  
  let node = new LightSensorNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, x1+25, y1+25 );
  this.nodes = [ node ] ; 
  
  //drawConnectors(this.nodes, "yellow");
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'lichtsensor');
  
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'lichtsensor')]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });  

  this.ldr = makeLDR(node.xLDR, node.yLDR, this.nodes[0]);
  canvas.add(this.ldr);
 
  // Set voltage 
  this.output = function() { 
    //this.textbox.text = this.nodes[0].state.toFixed(2);
    /*var angle = Math.PI*(0.25+0.5*(this.nodes[0].state/5.0));
    var x2 = x1+75 - 18*Math.cos(angle);
    var y2 = y1+30 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });*/
    return true; 
  };
  this.remove = function() { canvas.remove( this.ldr ); };
}    



// Create heater 
function Heater(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.state = false;
  var isHV = true;
  let node1 = new InputNode(x1+10, y1+85, isHV );
  let node2 = new InputNode(x1+10, y1+110, isHV );
  this.nodes = [ node1, node2 ] ;
  //drawConnectors(this.nodes, "black");

  this.textbox = new fabric.Textbox(temperatureInside.toFixed(1)+" \u2103", {
        left: 25, top: -55, width: 50, fontSize: 12, textAlign: 'right',
        fill: 'red', backgroundColor: '#330000', fontFamily: 'Arial',
        selectable: false, evented: false });
  //canvas.add(this.textbox);

  var imgElement = document.getElementById('radiator');
  this.imgRadiator = new fabric.Image(imgElement, {
    left: 0, top: 0, selectable: false, evented: false, });
  this.imgRadiator.scale(0.35);  
  //canvas.add(this.imgRadiator);  
  //this.imgRadiator.sendToBack();
  
  this.group = new fabric.Group([ this.imgRadiator, this.textbox ],
                                 //.concat(drawCircles(x1,y1+2,this.nodes, "black")),
                                 {hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  //console.log("group: "+this.group.width + ", " + this.group.height );
  
  this.group.set({left: x1+0.5*this.group.width-0.5, top: y1+0.5*this.group.height-0.5 });
  
  var circles = drawCircles(this.group.left,this.group.top,this.nodes, "black");
  //var circles = drawCircles(0,0,this.nodes, "black");
  for( var i=0; i<circles.length; ++i ) {
    //this.group.addWithUpdate( circles[i] );
    this.group.add( circles[i] );
    //console.log("circle2 pos " + (circles[i].left+this.group.left) + " " +
    //            (circles[i].top+this.group.top));
    //console.log("node  2 pos " + this.nodes[i].x1 + " " + this.nodes[i].y1);
  }

  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  
  var oldTemperature = temperatureInside;
  this.output = function() {
    var heatLoss = heatTransfer * (temperatureInside - temperatureOutside);
    temperatureInside += -heatLoss * clockPeriod*0.001 / heatCapacity;

    if( this.nodes[0].child && this.nodes[1].child && // nodes should be connected
        this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
        isHigh( this.nodes[1].eval() ) ) { // check node2
      temperatureInside += powerHeater * clockPeriod*0.001 / heatCapacity;
    }
    
    var newTemperature = temperatureInside.toFixed(1);
    if( Math.abs(oldTemperature-newTemperature) > 0.05 ) {
      this.textbox.set({ text : temperatureInside.toFixed(1)+" \u2103"});
      oldTemperature = newTemperature;
      renderNeeded = true;
    }

    return;
  }

  this.remove = function() {};

}

// Temperature sensor
function TemperatureSensor(x1,y1) {
  this.x = x1;
  this.y = y1;

  //drawText(x1+57,y1+19,"0",8);
  //drawText(x1+88,y1+19,"5",8);
  //this.display = makeDisplay(x1,y1);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ;   
  //drawConnectors(this.nodes, "yellow");
  //drawElementBox(x1,y1,boxWidth,boxHeightSmall,'temperatuursensor');
 
  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'temperatuursensor')]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });  
  
  // Set voltage 
  this.output = function() { 
    var voltage = (temperatureInside - 15.0) * 0.2;
    voltage = Math.min(Math.max(0.0,voltage),5.0); // Range between 0.0 and 5.0 V
    this.nodes[0].state = voltage;
    /*var angle = Math.PI*(0.25+0.5*(this.nodes[0].state/5.0));
    var x2 = x1+75 - 18*Math.cos(angle);
    var y2 = y1+30 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });*/
    return true; 
  };
  this.remove = function() { };
}    


// Sound sensor
function SoundSensor(x1,y1) {
  this.x = x1;
  this.y = y1;
  
  // Draw circle for input hole microphone
  var circ = new fabric.Circle({left: 25, top: 0.5*boxHeightSmall, radius: 2, 
                                  fill: "black", selectable: false, evented: false});
  //canvas.add(circ);
  //circ.sendToBack();
    
  let node = new SoundSensorNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, this );
  this.nodes = [ node ] ;   
  //drawConnectors(this.nodes, "yellow");
  //this.textbox = drawElementBox(x1,y1,boxWidth,boxHeightSmall,'geluidsensor').item(1);

  this.group = new fabric.Group([drawBoxAndText(0,0,boxWidth,boxHeightSmall,'geluidsensor'), circ]
                                 .concat(drawCircles(x1,y1,this.nodes, "yellow")),
                                 {left: x1+0.5*boxWidth, top: y1+0.5*boxHeightSmall,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
    // Move output wires back to front
  this.nodes.forEach(function (node) { if( !node.isInput ) node.wires[0].bringToFront(); });  
  
  this.textbox = this.group.item(0).item(1);
  
  // Default functions
  this.output = function() { return true; }
  this.remove = function() { };
}    

// Voltmeter
function Voltmeter(x1,y1) {
  this.x = x1;
  this.y = y1;

  //drawText(x1+4,y1+11,"0",8);
  //drawText(x1+35,y1+11,"5",8);
  
  this.display = new fabric.Line([22,22,9,9], {strokeWidth: 2, stroke: 'red' ,
                           selectable: false, evented: false});

  var r = new fabric.Rect({left: 22, top: 12, height: 20, width: 40, 
                           fill: 'white', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1   });   
  //canvas.add(r); r.sendToBack();

  //this.display = makeDisplay(x1-50,y1);
  
  let node = new InputNode(x1+35, y1+35 );
  this.nodes = [ node ] ;   
  //drawConnectors(this.nodes, "white");

  //drawText(x1+1,y1+45,"volt-",12);
  //drawElementBox(x1,y1,44,boxHeightSmall+10,'meter');

  
  this.group = new fabric.Group([drawBoxAndText(0,0,44,60,'meter'), 
                                 drawText(1,45,"volt-",12),
                                 r, this.display,
                                 drawText(4,11,"0",8),
                                 drawText(35,11,"5",8) ]
                                 .concat(drawCircles(x1,y1,this.nodes, "white")),
                                 {left: x1+22, top: y1+30,
                                  hasControls: false, hasBorders: false, 
                                  selectable: moveComponents, 
                                  evented: (moveComponents||deleteComponents) });
  this.group.name = "element";
  this.group.element = this;
  canvas.add(this.group);
  this.display.set({ 'x1': 0, 'y1': -8, 'x2': -13, 'y2': -22 });

  var lastState = 0.0;
  // Set voltage 
  this.output = function() { 
    var newState = this.nodes[0].eval();
    if( Math.abs(newState-lastState) < 0.1) return true; 
    var angle = Math.PI*(0.25+0.5*(newState/5.0));
    var x2 = -18*Math.cos(angle);
    var y2 = -8 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });
    renderNeeded = true;
    lastState = newState;
    return true; 
  };
  this.remove = function() { };
}    

function requestRemoveElements() {
  if ( confirm("Weet je zeker dat je alles wilt verwijderen?") ) removeElements();
}

function removeElements() {
  /*for (i = 0; i < elements.length; i++) { 
    //elements[i].remove();
    removeElement(elements[i]);
  }*/
  elements.forEach(function(element) { removeElement(element);});
  elements = [];
  
  //console.log(elements);
  //canvas.clear();
}


var elements = [];  

// Main engine: evaluate all elements (elements evaluate the nodes)
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
  //if( moveComponents ) checkbox.innerHTML = "Verplaatsen... &#10003;";
  //else checkbox.innerHTML = "Verplaatsen...&nbsp;&nbsp;&nbsp;&nbsp;";    
  if( moveComponents ) addCheckMark(checkbox);
  else removeCheckMark(checkbox);
}


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
  //if( deleteComponents ) checkbox.innerHTML = "Verwijderen... &#10003;";
  //else checkbox.innerHTML = "Verwijderen...&nbsp;&nbsp;&nbsp;&nbsp;";    
  if( deleteComponents ) addCheckMark(checkbox);
  else removeCheckMark(checkbox);
}


function toggleText(name,button) {
  var text = document.getElementById(name);
  //var buttonText = button.innerHTML;
  if (text.style.display === "none") {
    text.style.display = "block";
    addCheckMark(button);
    //button.innerHTML = buttonText.substr(0,buttonText.length-24).concat("&#10003;");
  } else {
    text.style.display = "none";
    removeCheckMark(button);
    //button.innerHTML = buttonText.substr(0,buttonText.length-1).concat("&nbsp;&nbsp;&nbsp;&nbsp;");
  }
}

function addCheckMark(button) {
  var buttonText = button.innerHTML;
  button.innerHTML = buttonText.substr(0,buttonText.length-24).concat("&nbsp;&#10003;");
}

function removeCheckMark(button) {
  var buttonText = button.innerHTML;
  button.innerHTML = buttonText.substr(0,buttonText.length-7).concat("&nbsp;&nbsp;&nbsp;&nbsp;");
}



// Change button color and state of OutputNode when pushed
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
    
// Change button color and state of OutputNode to low when mouse is up
canvas.on('mouse:up', function(e) {
  var p = e.target;
  if( deleteComponents && p && p.name == "element") {
    removeElement(p.element);
    // Delete the element from the list of elements
    var index = elements.indexOf(p.element);
    if (index > -1) elements.splice(index, 1);
  }
  if( p && p.name == "button") {
    // a mouse-click can be too short for the engine to evaluate itself
    timeOutButton = setTimeout(function(){ p.node.state = low; renderNeeded = true}, 
                               clockPeriod+5); // add small delay
    p.set({ fill: '#222222', strokeWidth: 3, radius: 10});
    p.setGradient('stroke', gradientButtonUp );
  }
});

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
    
// Control behaviour when moving wire
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


function moveElement(p){
  
  // Bring the component in front of rest
  var element = p.element;
  if( element.constructor.name != "Board" ) canvas.bringToFront(p);
  if( element.button ) canvas.bringToFront(element.button);
  if( element.ldr ) canvas.bringToFront(element.ldr);

  if( element.constructor.name != "Board" &&
      element.constructor.name != "Heater" &&
      element.constructor.name != "Lightbulb" && 
      element.constructor.name != "Voltmeter" ) {  
    p.setCoords(); //Sets corner position coordinates based on current angle, width and height
    elements.forEach(function (element) {    
      var targ = element.group;
      if ( !targ || targ === p ||
           element.constructor.name == "Board" ||
           element.constructor.name == "Heater" ||
           element.constructor.name == "Lightbulb" ||
           element.constructor.name == "Voltmeter"    ) return;
      
      // Snap horizontally
      if (Math.abs(p.oCoords.tr.x - targ.oCoords.tl.x) < edgedetection) {
        //p.left += targ.oCoords.tl.x - p.oCoords.tr.x + 1;
        //p.setCoords();
        p.set({left: targ.oCoords.tl.x - 0.5*p.width + 1} );
      }
      else if (Math.abs(p.oCoords.tl.x - targ.oCoords.tr.x) < edgedetection) {
        //p.left += targ.oCoords.tr.x - p.oCoords.tl.x - 1;
        //p.setCoords();
        p.set({left: targ.oCoords.tr.x + 0.5*p.width - 1} );
      }
      else if (Math.abs(p.oCoords.tl.x - targ.oCoords.tl.x) < edgedetection ) {
        //p.left += targ.oCoords.tl.x - p.oCoords.tl.x ;
        //p.setCoords();
        p.set({left: targ.oCoords.tl.x + 0.5*p.width});
      }
      else if (Math.abs(p.oCoords.tr.x - targ.oCoords.tr.x) < edgedetection) {
        //p.left += targ.oCoords.tr.x - p.oCoords.tr.x ;
        //p.setCoords();
        p.set({left: targ.oCoords.tr.x - 0.5*p.width});
      }

      // Snap vertically
      if (Math.abs(p.oCoords.br.y - targ.oCoords.tr.y) < edgedetection) {
        //p.top += targ.oCoords.tr.y - p.oCoords.br.y + 1;
        //p.setCoords();
        p.set({top: targ.oCoords.tr.y - 0.5*p.height + 1} );
      }
      else if (Math.abs(targ.oCoords.br.y - p.oCoords.tr.y) < edgedetection) {
        //p.top += targ.oCoords.br.y - p.oCoords.tr.y - 1;
        //p.setCoords();
        p.set({top: targ.oCoords.br.y + 0.5*p.height - 1} );
      } 
      else if (Math.abs(targ.oCoords.br.y - p.oCoords.br.y) < edgedetection) {
        //p.top += targ.oCoords.br.y - p.oCoords.br.y;
        //p.setCoords();
        p.set({top: targ.oCoords.br.y - 0.5*p.height} );
      } 
      else if (Math.abs(targ.oCoords.tr.y - p.oCoords.tr.y) < edgedetection) {
        //p.top += targ.oCoords.br.y - p.oCoords.br.y;
        //p.setCoords();
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
    //console.log( "node left  " + nodes[i].x1 + " " + diffX);
    //console.log( "node top   " + nodes[i].y1 + " " + diffY);
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
    //console.log( "top " + input.offsetTop +" " + diffY + " " + (input.offsetTop + diffY));
    //const rect = input.getBoundingClientRect();
    //console.log("rect top " + (rect.top + window.scrollY)) ;
    input.style.left = (parseFloat(input.style.left.slice(0,-2)) + diffX) + 'px';
    input.style.top = (parseFloat(input.style.top.slice(0,-2)) + diffY) + 'px';
    //console.log( "top " + input.style.top);
  }
  
  // Update the wire
  for( var i = 0; i < nodes.length; i++) {
    // Connected input node 
    if( nodes[i].isInput && nodes[i].child ) {
      var wires = nodes[i].child.wires;
      for( var j = 0; j< wires.length; j++ ) {
        var wire = wires[j];
        if( wire.connection == nodes[i] ) {
          //console.log( "wire left " + wire.left + " " + diffX);
          //console.log( "wire top " + wire.top + " " + diffY);
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
        //wire.line1.bringToFront();
        //wire.bringToFront();
        canvas.bringToFront(wire.line1);
        canvas.bringToFront(wire);
        //console.log( "zIndex wire " + canvas.getObjects().indexOf(wire));
        //console.log( "zIndex p    " + canvas.getObjects().indexOf(p));


        //canvas.renderAll();
      }
    }
  }
}



// After moving wire: destroy and create new links
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
        if( p.left == node2.x1 && p.top == node2.y1 ) { // Not such a good check...
          if( node1.isInput && !(node2.isInput) && !(node1.child) ) {
            console.log("Deze code kan weg. Hier zou je nooit mogen komen.");
            node1.child = node2;
            p.connection = node1;
            p.bringToFront();
            snapped = true;
          }
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
        //console.log( "Number of wires ="+wires.length.toString() );
      } else {
        // Set back to original position
        p.set({ 'left': p.line1.x1, 'top' : p.line1.y1 } );
        p.setCoords();
        p.line1.set({ 'x2': p.line1.x1, 'y2': p.line1.y1 });
      }
    } 
  
});

// Add listener for uploading files
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
  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      //document.getElementById("bla").innerHTML = this.responseText;
      parseFile(this);
    }
  };
  xhttp.open("GET", url, true);
  xhttp.send();
}

function parseFile(xml) {
  removeElements();
  var i,j;
  var xmlDoc = xml.responseXML;
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
  switch( className ) {
    case "Board" :
      elements.push(new Board(x1,y1));
    break;
    case "Switch" :
      elements.push(new Switch(x1,y1));
    break;
    case "Pulse" :
      elements.push(new Pulse(x1,y1,inputValue));
    break;
    case "VarVoltage" :
      elements.push(new VarVoltage(x1,y1,inputValue));
    break;
    case "Comparator" :
      elements.push(new Comparator(x1,y1,inputValue));
    break;
    case "ANDPort" :
      elements.push(new ANDPort(x1,y1));
    break;
    case "ORPort" :
      elements.push(new ORPort(x1,y1));
    break;
    case "NOTPort" :
      elements.push(new NOTPort(x1,y1));
    break;
    case "Memory" :
      elements.push(new Memory(x1,y1));
    break;
    case "Counter" :
      elements.push(new Counter(x1,y1));
    break;
    case "ADC" :
      elements.push(new ADC(x1,y1));
    break;
    case "LED" :
      elements.push(new LED(x1,y1));
    break;
    case "Buzzer" :
      elements.push(new Buzzer(x1,y1));
    break;
    case "Relais" :
      elements.push(new Relais(x1,y1));
    break;
    case "Lightbulb" :
      elements.push(new Lightbulb(x1,y1));
    break;
    case "LightSensor" :
      elements.push(new LightSensor(x1,y1));
    break;
    case "Heater" :
      elements.push(new Heater(x1,y1));
    break;
    case "TemperatureSensor" :
      elements.push(new TemperatureSensor(x1,y1));
    break;
    case "SoundSensor" :
      elements.push(new SoundSensor(x1,y1));
    break;
    case "Voltmeter" :
      elements.push(new Voltmeter(x1,y1));
    break;

  } 
  document.getElementById('addElement').selectedIndex = 0;
}

// Add listener for download button
document.getElementById("download_xml").addEventListener("click", function(){
  var filename = prompt("Sla op als...", "systeembord.xml");
  if (filename != null && filename != "") {
    download( filename, createXmlFile());
  }  
  //download( document.getElementById("xml_filename").value, createXmlFile());
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
    attPosX.nodeValue = elements[i].x.toString();
    newElement.setAttributeNode(attPosX);

    var attPosY = xmlDoc.createAttribute("y");
    attPosY.nodeValue = elements[i].y.toString();
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

function findLink(thisNode) {
  for (var i = 0; i < elements.length; i++) { 
    for (var j = 0; j < elements[i].nodes.length; j++) {
      if( thisNode == elements[i].nodes[j] ) return [i,j];
    }
  }
  return [-1,-1];
}


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



