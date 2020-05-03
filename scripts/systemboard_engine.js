// Mixed analog / digital
var low = 0.0, high = 5.0, loThreshold = 0.8, hiThreshold = 1.4; // from Systeembord manual
function isHigh(x) {return x >= hiThreshold; };
function isLow(x) {return x < loThreshold; }; 
function invert(x) {return isHigh(x) ? low : high; };

var clockPeriod = 50; // time between evaluate-calls (speed of the engine)

var snapTolerance = 12;

// Sizes of the elements
var boxWidth = 150, boxHeight=100, boxHeightSmall = 50;

// Globals for the temperature and heater
var heatTransfer = 100; // Means that Tmax=40
var heatCapacity = 5000; // Determines speed of heating
var temperatureInside = 15.0; // Celcius
var temperatureOutside = 15.0; // Celcius
var powerHeater = 2500; // Watt

// Create canvas
var canvas = this.__canvas = new fabric.Canvas('c', { selection: false, });
fabric.Object.prototype.originX = fabric.Object.prototype.originY = 'center';

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
  var circ = new fabric.Circle({left: x1, top: y1, radius: 3, fill: color, 
                                selectable: false, evented: false});
  canvas.add(circ);
  var line = makeLine([ x1, y1, x1, y1 ],color);
  canvas.add( line );
  let endCircle = makeCircle(x1, y1, line, node, color);
  canvas.add( endCircle );
  return endCircle;
}

function drawConnectors(nodes,color) {
  for(var i=0; i<nodes.length; ++i) {
    var circ = new fabric.Circle({left: nodes[i].x1, top: nodes[i].y1, strokeWidth: 4, 
                                  stroke: color , radius: 5, 
                                  fill: "darkgrey", selectable: false, evented: false});
    canvas.add(circ);
    circ.sendToBack();
  }
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
  canvas.add(c);
  c.sendToBack();
  //  return c;
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
    this.wire = makeWire(x1,y1,this);
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
    this.isSet = false;
    this.eval = function() {
    // loop protection
      if( this.isSet ) {
          this.isSet = false;
          return this.state;
	} else {
          this.isSet = true;
          this.state = (isHigh(this.child1.eval()) && isHigh(this.child2.eval()) ) ? high : low ;
          return this.state;
	}
    };      
    this.wire = makeWire(x1,y1,this);
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
    this.isSet = false;
    this.eval = function() {
      // loop protection
      if( this.isSet ) {
        this.isSet = false;
        return this.state;
      } else {
        this.isSet = true;
        this.state = (isHigh(this.child1.eval()) || isHigh(this.child2.eval()) ) ? high : low ;
        return this.state;
      }
    };      
    
    this.wire = makeWire(x1,y1,this);
}

// NOT node
function NOTNode(x1,y1,input1) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child1 = input1;
    this.isInput = false;     
    this.isHV = false;
    this.state = low;
    this.isSet = false;
    this.eval = function() {
      // loop protection
      if( this.isSet ) {
        this.isSet = false;
        return this.state;
      } else {
        this.isSet = true;
        this.state = (isHigh(this.child1.eval()) ) ? low : high ;
        return this.state;
      }
    };
    this.wire = makeWire(x1,y1,this);
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
    this.isSet = false;
    this.eval = function() {
      // loop protection
      if( this.isSet ) {
        this.isSet = false;
        return this.state;
      } else {
        this.isSet = true;
        this.state = (this.child1.eval() < this.compare) ? low : high ;
        return this.state;
      }
    };

    this.wire = makeWire(x1,y1,this);
}  
    
// Binary node
function BinaryNode(x1,y1,input1,bin) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child1 = input1;
    this.isInput = false;     
    this.isHV = false;
    this.state = low;
    this.isSet = false;
    this.eval = function() {
      // loop protection
      if( this.isSet ) {
        this.isSet = false;
        return this.state;
      } else {
        this.isSet = true;
        var binary = (this.child1.eval() / high ) * 15;
        var bit = (binary & (1<<bin)) >> bin;
        this.state = ( bit == 1 ) ? high : low ;
        return this.state;
      }
    };

    this.wire = makeWire(x1,y1,this);
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

    this.wire = makeWire(x1,y1,this);
}    

// Relais node 
function RelaisNode(x1,y1,input) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child = input;
    this.isHV = true;
    this.eval = function() { return this.child.eval(); };      
    this.isInput = false;
    this.wire = makeWire(x1,y1,this,this.isHV);
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
    this.wire = makeWire(x1,y1,this);
}    



// Draw the box plus text
function drawElementBox(x1,y1,width,height,text) {
    // Draw text in box
    var textbox = new fabric.Textbox(text, { left: x1+0.5*width, top: y1+(height-10), width: width,
                                            fontSize: 12, textAlign: 'center', fontFamily:'Arial',
                                            selectable: false, evented: false });
    canvas.add(textbox)
    textbox.sendToBack();
    // Draw box
    var r = new fabric.Rect({left: x1+0.5*width, top: y1+0.5*height, height: height, width: width, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });
    canvas.add(r);
    r.sendToBack();

    return textbox;
}


function drawSymbolBox(x1,y1,text){
  // Draw text in box
  var txt = new fabric.Textbox(text, { left: x1, top: y1, fontSize: 16, textAlign: 'center',
                                       fontFamily: 'Arial', selectable: false, evented: false });
  canvas.add(txt)
  txt.sendToBack();
  var r = new fabric.Rect({left: x1, top: y1, height: 30, width: 30, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1 });
  canvas.add(r);
  r.sendToBack();  
}

function drawText(x1,y1,text,fontsize=10){
  // Draw text
  var txt = new fabric.Textbox(text, {left: x1, top: y1, originX: 'left', originY: 'bottom', 
                                      width: 100, fontSize: fontsize, fontFamily: 'Arial', 
                                      selectable: false, evented: false });
  canvas.add(txt)
  txt.sendToBack();
}

function drawConnection(coords){
  var line = new fabric.Line(coords, {stroke: 'black', strokeWidth: 1,
                              selectable: false, evented: false });
  canvas.add(line);
  line.sendToBack();
}

  function drawHeader(x1,y1,text) {
    // Draw text in box
    var textbox = new fabric.Textbox(text, { left: x1, top: y1, width: 150,
                                           fontSize: 16, textAlign: 'center', fontFamily:'Arial',
                                           selectable: false, evented: false });
    //canvas.setBackgroundImage(textbox);
    return textbox;
  }

// Draw the board plus text
function Board(x1,y1) {
  this.x = x1;
  this.y = y1;

  var r = new fabric.Rect({left: 0, top: 0, width: 640, height: 474, 
                           originX: 'left', originY: 'top',
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 2   });
  var group = new fabric.Group([ r, drawHeader(80, 11,"INVOER"),
                                 drawHeader(316, 11,"VERWERKING"),
                                 drawHeader(550, 11, "UITVOER") ], 
                               {left: x1, top: y1+5, originX: 'left', originY: 'top'});
  canvas.setBackgroundImage(group);
  
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
  drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "&");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);

  drawElementBox(x1,y1,boxWidth,boxHeight,'EN-poort');
    
  this.output = function() {return true;};
  this.remove = function() { };
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
  drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "\u22651");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawElementBox(x1,y1,boxWidth,boxHeight,'OF-poort');
  this.remove = function() { };
}

// Create NOT port with its nodes
function NOTPort(x1,y1) {
  this.x = x1;
  this.y = y1;
  let node1 = new InputNode(x1+25, y1+0.5*boxHeightSmall );
  let node2 = new NOTNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, node1);
  this.nodes = [ node1, node2 ] ;     
  drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1-7+0.5*boxHeightSmall, "1");
  drawConnection([x1+25, y1+0.5*boxHeightSmall, x1+boxWidth-25, y1+0.5*boxHeightSmall]);
  drawConnection([x1+15+0.5*boxWidth, y1-5+0.5*boxHeightSmall, 
                  x1+20+0.5*boxWidth, y1+0.5*boxHeightSmall]);
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'invertor');
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
  drawConnectors(this.nodes, "blue");

  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "M");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawText(x1+35,y1+31,"set");
  drawText(x1+35,y1+boxHeight-19,"reset");
  drawElementBox(x1,y1,boxWidth,boxHeight,'geheugencel');
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
  drawConnectors(this.nodes, "white");

  // Draw LED
  var c = new fabric.Circle({left: x1+boxWidth-25, top: y1+20, radius: 5, 
                             fill: 'darkred', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 2   });
  c.setGradient('stroke', gradientButtonDw );
  canvas.add(c);
  c.sendToBack();

  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'LED');

  // Control LED behaviour
  this.output = function() {
    var result = this.nodes[0].eval();
    if( isHigh(result) ) {
      c.set({fill : 'red'});
    } else {
      c.set({fill : 'darkred'});            
    }
    return result;
  };

  this.remove = function() { };
}

// Create sound output
function Buzzer(x1,y1) {
  this.x = x1;
  this.y = y1;
  this.nodes = [ new InputNode(x1+25, y1+0.5*boxHeightSmall) ] ;    

  drawConnectors(this.nodes, "white");

  // Draw speaker
  var c1 = new fabric.Path('M '+(x1+130).toString()+' '+(y1+15).toString()+' Q '+
                           (x1+135).toString()+', '+(y1+25).toString()+', '+
                           (x1+130).toString()+', '+(y1+35).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });
  canvas.add(c1); c1.sendToBack();    
  var c2 = new fabric.Path('M '+(x1+135).toString()+' '+(y1+10).toString()+' Q '+
                           (x1+145).toString()+', '+(y1+25).toString()+', '+
                           (x1+135).toString()+', '+(y1+40).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 0 });
  canvas.add(c2); c2.sendToBack();    

  var r = new fabric.Rect({left: x1+117, top: y1+25, height: 20, width: 10, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();

  var t = new fabric.Triangle({left: x1+120, top: y1+25, height: 15, width: 30, 
                           fill: 'lightgrey', selectable: false, evented: false, angle:-90,
                           stroke: 'black', strokeWidth: 1 });
  canvas.add(t); t.sendToBack();     
  
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'zoemer');

  // Create the AudioContext
  var audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext );
  } catch (e) {
    alert('Web Audio API not supported by your browser. Please, consider upgrading to '+
         'the latest version or downloading Google Chrome or Mozilla Firefox');
  }

  // Create the oscillator node for the buzzer sound
  var oscillator = gainNode = null;
  if( audioCtx ) {
    var gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  this.state = false;
  
  // Control buzzer behaviour
  this.output = function() {  
    var result = this.nodes[0].eval();
      if( isHigh(result) && !this.state) {    
        this.state = true;
        if( audioCtx ) {
          oscillator = audioCtx.createOscillator();      
          oscillator.connect(gainNode);
          oscillator.start();
        }
        c1.set({strokeWidth: 1});
        c2.set({strokeWidth: 1});        
      } else if(!isHigh(result) && this.state) {
        this.state = false;
        if( audioCtx ) oscillator.stop();
        c1.set({strokeWidth: 0});
        c2.set({strokeWidth: 0});        
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
  drawConnectors(this.nodes, "yellow");
  // Draw the push button
  drawButton(x1+25, y1+0.5*boxHeightSmall, node);
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'drukschakelaar');
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
function Pulse(x1,y1) {
  this.x = x1;
  this.y = y1; 
  drawText(x1+70,y1+30,"Hz",12);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ; 

  drawConnectors(this.nodes, "yellow");
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'pulsgenerator');

  // Create unique element ID
  var elementName = "frequency"+x1.toString()+y1.toString();
    
  // Create an input DOM element
  var input = inputDOM(x1+20,y1+10,elementName,"1","0.1","0.5","10");

  this.pulseStarted = false;
  this.output = function() { return true; };
         
  // Start the pulse generator
  var timer;
  this.startPulse = function() {
    node.state = invert(node.state);
    var myElement = document.getElementById(elementName);
    var _this = this;
    timer = setTimeout(function() { _this.startPulse(); }, 500/(myElement.value));
  }
  this.startPulse();
  
  // Delete the dom element and stop the pulsing
  this.remove = function() {
    // Stop the pulse generator
    clearTimeout(timer);
    // Remove the DOM element
    var myElement = document.getElementById(elementName);
    myElement.remove();
  }
  
}    

// Variable voltage power
function VarVoltage(x1,y1) {
  this.x = x1;
  this.y = y1;
  
  drawText(x1+70,y1+30,"V",12);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ; 
  
  drawConnectors(this.nodes, "yellow");
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'variabele spanning');
 
  // Create unique element ID
  var elementName = "voltage"+x1.toString()+y1.toString();

  // Create an input DOM element
  var input = inputDOM(x1+20,y1+10,elementName,"0","0.1","0","5");

  // Create an ouput node and set voltage from the DOM element
  node.state = input.value;
  this.output = function() {
    this.nodes[0].state = input.value;
    return true;
  };

  // Delete the dom element
    this.remove = function() {
      // Remove the DOM element
      var myElement = document.getElementById(elementName);
      myElement.remove();
    }


}    

// Comparator
function Comparator(x1,y1) {
  this.x = x1;
  this.y = y1;
  drawText(x1+120,y1+80,"V",12);
  drawText(x1+57,y1+31,"+");
  drawText(x1+57,y1+53,"\u2212");
  var r = new fabric.Triangle({left: x1+0.5*boxWidth, top: y1+35, height: 40, width: 40, 
                           fill: 'lightgrey', selectable: false, evented: false, angle:90,
                           stroke: 'black', strokeWidth: 1 });
  canvas.add(r);
  r.sendToBack();  
  
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new ComparatorNode(x1+boxWidth-25, y1+35, node1);
  this.nodes = [ node1, node2 ] ;     

  drawConnectors(this.nodes, "blue");

  drawConnection([x1+25, y1+25, x1+60, y1+25]);
  drawConnection([x1+60, y1+35, x1+boxWidth-25, y1+35]);
  drawConnection([x1+40, y1+45, x1+60, y1+45]);
  drawConnection([x1+40, y1+45, x1+40, y1+70]);
  drawConnection([x1+40, y1+70, x1+70, y1+70]);

  drawElementBox(x1,y1,boxWidth,boxHeight,'comparator');
    
  // Create unique element ID
  var elementName = "voltage"+x1.toString()+y1.toString();
      
  // Create an input DOM element
  var input = inputDOM(x1+70,y1+60,elementName,"2.5","0.1","0.1","5");
    
  // Create the node
  node2.compare = input.value; // set compare value
  this.output = function() {
      this.nodes[1].compare = input.value;
      return true;
  };
  
  // Delete the dom element
  this.remove = function() {
  // Remove the DOM element
  var myElement = document.getElementById(elementName);
    myElement.remove();
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
  drawConnectors(this.nodes.slice(1,5), "yellow");
  drawConnectors([this.nodes[0]], "white");

  drawText(x1+22,y1+36,"in");
  drawText(x1+boxWidth-60,y1+36,"uit");
  drawText(x1+boxWidth-88,y1+12,"8");
  drawText(x1+boxWidth-68,y1+12,"4");
  drawText(x1+boxWidth-48,y1+12,"2");
  drawText(x1+boxWidth-28,y1+12,"1");
  drawConnection([x1+boxWidth-92, y1+30, x1+boxWidth-62, y1+30]);
  drawConnection([x1+boxWidth-46, y1+30, x1+boxWidth-18, y1+30]);

  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'AD omzetter');
  
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
  drawButton(x1+100, y1+boxHeight-20, node6) ;
 
  drawConnectors(this.nodes, "blue");

  var r = new fabric.Rect({left: x1+120, top: y1+35, height: 50, width: 50, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1 });
  canvas.add(r); r.sendToBack();  

  drawText(x1+10,y1+14,"tel pulsen");
  drawText(x1+10,y1+44,"tellen aan/uit");
  drawText(x1+10,y1+74,"reset");
  drawText(x1+2*boxWidth-103,y1+14,"8");
  drawText(x1+2*boxWidth-78,y1+14,"4");
  drawText(x1+2*boxWidth-53,y1+14,"2");
  drawText(x1+2*boxWidth-28,y1+14,"1");

  drawConnection([x1+25, y1+20, x1+120, y1+20]);
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

  this.counter = 0;
  this.state = low;
  
  this.textbox = new fabric.Textbox((this.counter).toString(), {
        left: x1+2*boxWidth-50, top: y1+70, width: 60, fontSize: 44, textAlign: 'right',
        fill: 'red', backgroundColor: '#330000', fontFamily: 'Courier New',
        selectable: false, evented: false });
  canvas.add(this.textbox);
  this.textbox.sendToBack();

  drawElementBox(x1,y1,2*boxWidth,boxHeight,'pulsenteller');

  this.output = function() {
    // reset counter (check button or reset node)
    if( isHigh(node6.state) || isHigh(node6.eval()) ) { 
      this.counter = 0;
      this.textbox.text = (this.counter).toString();
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
        this.textbox.text = (this.counter).toString();
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
  drawConnectors([this.nodes[0]], "white");

  drawConnectors(this.nodes.slice(1,3), "black");

  // Draw symbols and wires
  drawConnection([x1+30, y1+0.5*boxHeight-5, x1+20, y1+0.5*boxHeight+5]);
  var r = new fabric.Rect({left: x1+25, top: y1+0.5*boxHeight, width: 20, height: 10, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();
  var textbox = new fabric.Textbox("~", { left: x1+boxWidth-50, top: y1+25, width: 20,
                                          fontSize: 20, textAlign: 'center', fontFamily:'Arial',
                                          selectable: false, evented: false });
  canvas.add(textbox);
  textbox.sendToBack();
  var circ = new fabric.Circle({left: x1+boxWidth-50, top: y1+25, strokeWidth: 1, stroke: 'black' ,
                                radius: 10, fill: 'lightgrey', selectable: false, evented: false});
  canvas.add(circ);
  circ.sendToBack();
  drawConnection([x1+25, y1+25, x1+25, y1+boxHeight-25]);
  drawConnection([x1+20, y1+boxHeight-25, x1+30, y1+boxHeight-25]);
  drawConnection([x1+25, y1+0.5*boxHeight, x1+boxWidth-70, y1+0.5*boxHeight]);  
  drawConnection([x1+boxWidth-25, y1+25, x1+boxWidth-25, y1+boxHeight-25]);
  drawConnection([x1+boxWidth-75, y1+25, x1+boxWidth-75, y1+40]);
  drawConnection([x1+boxWidth-65, y1+40, x1+boxWidth-75, y1+60]);
  drawConnection([x1+boxWidth-75, y1+60, x1+boxWidth-75, y1+boxHeight-25]);
  drawConnection([x1+boxWidth-75, y1+25, x1+boxWidth-25, y1+25]);

  drawElementBox(x1,y1,boxWidth,boxHeight,'Relais');

  this.remove = function() {};

}


// Create light bulb 
function Lightbulb(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.state = false;
  var isHV = true;
  let node1 = new InputNode(x1-17, y1+35, isHV );
  let node2 = new InputNode(x1, y1+65, isHV );
  this.nodes = [ node1, node2 ] ;
  drawConnectors(this.nodes, "black");

  var imgElementOn = document.getElementById('lighton');
  this.imgBulbOn = new fabric.Image(imgElementOn, {
    left: x1, 
    top: y1, selectable: false, evented: false,
  });
  this.imgBulbOn.scale(0.7);
  
  var imgElementOff = document.getElementById('lightoff');
  this.imgBulbOff = new fabric.Image(imgElementOff, {
    left: x1,
    top: y1, selectable: false, evented: false,
  });
  this.imgBulbOff.scale(0.7);
  canvas.add(this.imgBulbOff);  
  this.imgBulbOff.sendToBack();
  
  this.output = function() {
    var newState = this.nodes[0].child && this.nodes[1].child && // nodes should be connected
                   this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
                   isHigh( this.nodes[1].eval() ) ;// check node2
    if( (newState && !this.state) || (!newState && this.state) ) {
      this.state = newState;
      if( this.state ) { 
        canvas.remove(this.imgBulbOff);
	      canvas.add(this.imgBulbOn);
        this.imgBulbOn.sendToBack();
      } else {
        canvas.remove(this.imgBulbOn);
	      canvas.add(this.imgBulbOff);
        this.imgBulbOff.sendToBack();
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
  imgLDR.sendToBack();
  imgLDR.hasControls = c.hasBorders = false;
  imgLDR.name = "LDR";
  imgLDR.node = node;
  return imgLDR;
}

// Make display for sensor
function makeDisplay(x1, y1){

  var l = new fabric.Line([x1+75,y1+30,x1+75,y1+12], {strokeWidth: 2, stroke: 'red' ,
                           selectable: false, evented: false});
  canvas.add(l); l.sendToBack();

  var r = new fabric.Rect({left: x1+75, top: y1+20, height: 20, width: 40, 
                           fill: 'white', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();

  return l;
}

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
  var ldr = makeLDR(node.xLDR, node.yLDR, this.nodes[0]);
  canvas.add(ldr);
  
  drawConnectors(this.nodes, "yellow");
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'lichtsensor');
 
  // Set voltage 
  this.output = function() { 
    //this.textbox.text = this.nodes[0].state.toFixed(2);
    /*var angle = Math.PI*(0.25+0.5*(this.nodes[0].state/5.0));
    var x2 = x1+75 - 18*Math.cos(angle);
    var y2 = y1+30 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });*/
    return true; 
  };
  this.remove = function() { };
}    



// Create heater 
function Heater(x1,y1) {
  this.x = x1;
  this.y = y1;

  this.state = false;
  var isHV = true;
  let node1 = new InputNode(x1-48, y1+25, isHV );
  let node2 = new InputNode(x1-48, y1+50, isHV );
  this.nodes = [ node1, node2 ] ;
  drawConnectors(this.nodes, "black");

  this.textbox = new fabric.Textbox(temperatureInside.toFixed(1)+" \u2103", {
        left: x1+25, top: y1-55, width: 50, fontSize: 12, textAlign: 'right',
        fill: 'red', backgroundColor: '#330000', fontFamily: 'Arial',
        selectable: false, evented: false });
  canvas.add(this.textbox);

  var imgElement = document.getElementById('radiator');
  this.imgRadiator = new fabric.Image(imgElement, {
    left: x1, top: y1, selectable: false, evented: false, });
  this.imgRadiator.scale(0.35);  
  canvas.add(this.imgRadiator);  
  this.imgRadiator.sendToBack();
  
  this.output = function() {
    var heatLoss = heatTransfer * (temperatureInside - temperatureOutside);
    temperatureInside += -heatLoss * clockPeriod*0.001 / heatCapacity;

    if( this.nodes[0].child && this.nodes[1].child && // nodes should be connected
        this.nodes[0].child.child == this.nodes[1].child.child && // from the same relais
        isHigh( this.nodes[1].eval() ) ) { // check node2
      temperatureInside += powerHeater * clockPeriod*0.001 / heatCapacity;
    }
    
    this.textbox.text = temperatureInside.toFixed(1)+" \u2103";


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
  drawConnectors(this.nodes, "yellow");
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'temperatuursensor');
 
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

  /*this.tbox = new fabric.Textbox("0", {
        left: x1+boxWidth-60, top: y1+5, width: 30, fontSize: 10, textAlign: 'right',
        fill: 'red', fontFamily: 'Arial',
        selectable: false, evented: false });
  canvas.add(this.tbox);*/
  
  // Draw circle for input hole microphone
  var circ = new fabric.Circle({left: x1+25, top: y1+0.5*boxHeightSmall, radius: 2, 
                                  fill: "black", selectable: false, evented: false});
  canvas.add(circ);
  circ.sendToBack();
  
  //drawText(x1+57,y1+19,"0",8);
  //drawText(x1+88,y1+19,"5",8);
  //this.display = makeDisplay(x1,y1);
  
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ;   
  drawConnectors(this.nodes, "yellow");
  this.textbox = drawElementBox(x1,y1,boxWidth,boxHeightSmall,'geluidsensor');

    
  // Initialize the audio context
  var audioContext = null;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext );
  } catch (e) {
    alert('Web Audio API not supported by your browser. Please, consider upgrading to '+
         'the latest version or downloading Google Chrome or Mozilla Firefox');
  }

  // Set voltage 
  this.output = function() {
    // AudioContext may still be in suspended state. Resume to get mic working.
    if( audioContext ) audioContext.resume();
    /*var angle = Math.PI*(0.25+0.5*(this.nodes[0].state/5.0));
    var x2 = x1+75 - 18*Math.cos(angle);
    var y2 = y1+30 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });*/
    return true; 
  };
  this.remove = function() { };


  // Start the audio stream
  var _this = this;
  if( audioContext ) {
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  .then(function(stream) {
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);
      javascriptNode.onaudioprocess = function() {
        var array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        var values = 0;
        var length = array.length;
        for (var i = 0; i < length; i++) { values += array[i]; };
        var soundLevel = values / length;
        _this.nodes[0].state = Math.min(0.05 * soundLevel, 5.0) ;
        ///_this.tbox.text = soundLevel.toFixed(0);
      }
  })
  .catch(function(err) {
      _this.textbox.setColor('darkgrey');
      canvas.remove(_this.nodes[0].wire);
      console.log("The following error occured: " + err.name);
  });
  } else {
      _this.textbox.setColor('darkgrey');
      canvas.remove(_this.nodes[0].wire);    
  }
   
}    

// Voltmeter
function Voltmeter(x1,y1) {
  this.x = x1;
  this.y = y1;

  drawText(x1+4,y1+11,"0",8);
  drawText(x1+35,y1+11,"5",8);
  
  this.display = new fabric.Line([x1+22,y1+22,x1+22,y1+4], {strokeWidth: 2, stroke: 'red' ,
                           selectable: false, evented: false});
  canvas.add(this.display); this.display.sendToBack();

  var r = new fabric.Rect({left: x1+22, top: y1+12, height: 20, width: 40, 
                           fill: 'white', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();

  //this.display = makeDisplay(x1-50,y1);
  
  let node = new InputNode(x1+35, y1+35 );
  this.nodes = [ node ] ;   
  drawConnectors(this.nodes, "white");

  drawText(x1+1,y1+45,"volt-",12);
  drawElementBox(x1,y1,44,boxHeightSmall+10,'meter');
 
  // Set voltage 
  this.output = function() { 
    var angle = Math.PI*(0.25+0.5*(this.nodes[0].eval()/5.0));
    var x2 = x1+22 - 18*Math.cos(angle);
    var y2 = y1+22 - 18*Math.sin(angle);
    this.display.set({ 'x2': x2, 'y2': y2 });
    return true; 
  };
  this.remove = function() { };
}    




function removeElements() {
  canvas.clear();
  for (i = 0; i < elements.length; i++) { 
    elements[i].remove();
  }
  elements = [];
}


var elements = [];  

// Main engine: evaluate all elements (elements evaluate the nodes)
function evaluateBoard() {
    //var t0 = performance.now()
    for (i = 0; i < elements.length; i++) { 
       elements[i].output();
    } 
    canvas.renderAll();
    //var t1 = performance.now()
    //console.log("Call to doSomething took " + (t1 - t0) + " milliseconds.")
}

// Make sure that the engine is run every clockPeriod  
setInterval(evaluateBoard, clockPeriod);


// Change button color and state of OutputNode when pushed
canvas.on({'mouse:down':mouseClick});
function mouseClick(e) {
    var p = e.target;
    if( !p || p.name != "button") return;
    p.node.state = invert(p.node.state);
    p.node.state = high;
    p.set({ fill: '#333333', strokeWidth: 3, radius: 10});
    p.setGradient('stroke', gradientButtonDw );  
}
    
// Change button color and state of OutputNode to low when mouse is up
canvas.on('mouse:up', function(e) {
    var p = e.target;
    if( !p || p.name != "button") return;
    // a mouse-click can be too short for the engine to evaluate itself
    timeOutButton = setTimeout(function(){ p.node.state = low; }, clockPeriod+5); // add small delay
    p.set({ fill: '#222222', strokeWidth: 3, radius: 10});
    p.setGradient('stroke', gradientButtonUp );
});     
    
// Control behaviour when moving wire
canvas.on('object:moving', function(e) {
  var p = e.target;
  if( p.name == "wire" ) moveWire(p);
  if( p.name == "LDR" ) {
    p.node.xLDR = p.left;
    p.node.yLDR = p.top;
    updateLDR(p.node);
  }
});

function updateLDR(node){
  
  // Find all lightbulbs and calculate distance
  node.state = low;    
  var lightbulb = null;
  for (var i = 0; i < elements.length; i++) { 
    if( elements[i].constructor.name == "Lightbulb" ) {
	    lightbulb = elements[i];
      if( lightbulb && lightbulb.state ) {
        var dist = Math.pow(node.xLDR-lightbulb.x,2)+Math.pow(node.yLDR-lightbulb.y,2);
        var voltage = 5.0/(1.0+dist/20000.0);
        // Normalize distance (maximum is around 1000) to 5 V
        node.state += voltage;
      }
    }
  }
  node.state = Math.min(node.state, 5); // Set maximum to 5 volt
}

function moveWire(p){
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
    
// After moving wire: destroy create new links
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
        if( p.left == node2.x1 && p.top == node2.y1 ) {
          if( node1.isInput && !(node2.isInput) && !(node1.child) ) {
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
            makeWire(node1.x1,node1.y1,node1,node1.isHV);
          } 
                        
        }
      }
    }
    if( snapped == false ) {
        p.set({ 'left': p.line1.x1, 'top' : p.line1.y1 } );
        p.setCoords();
        p.line1.set({ 'x2': p.line1.x1, 'y2': p.line1.y1 });
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
    addElement(className,x,y); 
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
      var wire = toNode.wire; 
      wire.connection = node;
      wire.bringToFront();
      wire.set({ 'left': node.x1, 'top' : node.y1 } );
      wire.setCoords();
      wire.line1.set({ 'x2': node.x1, 'y2': node.y1 });

      // Create extra wire for output node
      toNode.wire = makeWire(toNode.x1,toNode.y1,toNode,toNode.isHV);

      // Set the link in the right element
      node.child = toNode;
    }
  }
  
}


function addElement(className,x1,y1){
  switch( className ) {
    case "Board" :
      elements.push(new Board(x1,y1));
    break;
    case "Switch" :
      elements.push(new Switch(x1,y1));
    break;
    case "Pulse" :
      elements.push(new Pulse(x1,y1));
    break;
    case "VarVoltage" :
      elements.push(new VarVoltage(x1,y1));
    break;
    case "Comparator" :
      elements.push(new Comparator(x1,y1));
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
}

// Add listener for download button
document.getElementById("download_xml").addEventListener("click", function(){
   download( document.getElementById("xml_filename").value, createXmlFile());
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



