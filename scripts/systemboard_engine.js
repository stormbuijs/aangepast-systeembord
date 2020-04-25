// Mixed analog / digital
var low = 0.0, high = 5.0, loThreshold = 0.8, hiThreshold = 1.4; // from Systeembord manual
function isHigh(x) {return x > hiThreshold; };
function isLow(x) {return x < loThreshold; }; 
function invert(x) {return isHigh(x) ? low : high; };

var clockPeriod = 50; // time between evaluate-calls (speed of the engine)

// Sizes of the elements
var boxWidth = 150, boxHeight=100, boxHeightSmall = 50;
  
// Create canvas
var canvas = this.__canvas = new fabric.Canvas('c', { selection: false, 
                                                     /*backgroundColor: 'lightgrey',*/ });
fabric.Object.prototype.originX = fabric.Object.prototype.originY = 'center';



// Make movable circle for wire
function makeCircle(left, top, line1, node, color){
    var c = new fabric.Circle({left: left, top: top, radius: 5, fill: color});
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
  var color = isHV ? 'black' : '#dd0000';
  var circ = new fabric.Circle({left: x1, top: y1, strokeWidth: 1, stroke: 'black' , radius: 6, 
                                fill: color, selectable: false, evented: false});
  canvas.add(circ);
  var line = makeLine([ x1, y1, x1, y1 ],color);
  canvas.add( line );
  canvas.add( makeCircle(x1, y1, line, node, color) );
}
  
// Set nice-looking gradients for buttons
var gradientButtonUp = { x1: -10, y1: -10, x2: 20, y2: 20,
                         colorStops: { 0: 'white', 1: '#333333' }};
var gradientButtonDw = { x1: -10, y1: -10, x2: 22, y2: 22,
                         colorStops: { 0: '#333333', 1: 'white' }};

// Make a push button
function makeButton(left, top, node){
    var c = new fabric.Circle({left: left, top: top, strokeWidth: 3, stroke: 'grey', radius: 10,
                               fill: '#222222', selectable: false });
    c.setGradient('stroke', gradientButtonUp );
    c.name = "button";
    c.node = node;
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
    makeWire(x1,y1,this,isHV);
}

// Generic output node (has a state=voltage)
function OutputNode(x1,y1) { 
    this.x1 = x1;
    this.y1 = y1;
    this.state = low;
    this.eval = function() { return this.state; };      
    this.isInput = false;     
    this.isHV = false;
    makeWire(x1,y1,this);
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
    makeWire(x1,y1,this);
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
    
    makeWire(x1,y1,this);
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
    makeWire(x1,y1,this);
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
        this.state = (this.child1.eval() > this.compare) ? high : low ;
        return this.state;
      }
    };

    makeWire(x1,y1,this);
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

    makeWire(x1,y1,this);
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

    makeWire(x1,y1,this);
}    

// Relais node 
function RelaisNode(x1,y1,input) { 
    this.x1 = x1;
    this.y1 = y1;
    this.child = input;
    this.isHV = true;
    this.eval = function() { return this.child.eval(); };      
    this.isInput = false;
    makeWire(x1,y1,this,this.isHV);
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

// Draw the board plus text
function Board(x1,y1) {
  function drawHeader(x1,y1,text) {
    // Draw text in box
    var textbox = new fabric.Textbox(text, { left: x1, top: y1, width: 150,
                                           fontSize: 16, textAlign: 'center', fontFamily:'Arial',
                                           selectable: false, evented: false });
    canvas.setBackgroundImage(textbox);
  }

  // Draw the headers
  drawHeader(x1+85, y1+16,"INVOER");
  drawHeader(x1+320, y1+16,"VERWERKING");
  drawHeader(x1+555, y1+16,"UITVOER");
  
  // Draw box
  var r = new fabric.Rect({left: x1+320, top: y1+242, width: 640, height: 474, 
                           fill: 'lightgrey', selectable: false, evented: false,
                           stroke: 'black', strokeWidth: 2   });
  canvas.setBackgroundImage(r);
  // Dummy functions
  this.nodes = [];
  this.output = function() { };
  this.remove = function() { };
}

// Create AND port with its nodes
function ANDPort(x1,y1) {
  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "&");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawElementBox(x1,y1,boxWidth,boxHeight,'EN-poort');
    
  this.output = function() {return true;};
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new ANDNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
  this.nodes = [ node1, node2 , node3 ] ;
  this.remove = function() { };
}

// Create OR port with its nodes
function ORPort(x1,y1) {
  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1+0.5*boxHeight, "\u22651");
  drawConnection([x1+0.5*boxWidth, y1+0.5*boxHeight, x1+boxWidth-25, y1+0.5*boxHeight]);
  drawConnection([x1+25, y1+25, x1+25, y1+40]);
  drawConnection([x1+25, y1+40, x1+0.5*boxWidth, y1+40]);
  drawConnection([x1+25, y1+boxHeight-25, x1+25, y1+boxHeight-40]);
  drawConnection([x1+25, y1+boxHeight-40, x1+0.5*boxWidth, y1+boxHeight-40]);
  drawElementBox(x1,y1,boxWidth,boxHeight,'OF-poort');
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new ORNode(x1+boxWidth-25, y1+0.5*boxHeight, node1, node2);
  this.output = function() { return true; };
  this.nodes = [ node1, node2 , node3 ] ;
  this.remove = function() { };
}

// Create NOT port with its nodes
function NOTPort(x1,y1) {
  // Draw symbols and wires
  drawSymbolBox(x1+0.5*boxWidth, y1-7+0.5*boxHeightSmall, "1");
  drawConnection([x1+25, y1+0.5*boxHeightSmall, x1+boxWidth-25, y1+0.5*boxHeightSmall]);
  drawConnection([x1+15+0.5*boxWidth, y1-5+0.5*boxHeightSmall, 
                  x1+20+0.5*boxWidth, y1+0.5*boxHeightSmall]);
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'invertor');
  this.output = function() { return true; };
  let node1 = new InputNode(x1+25, y1+0.5*boxHeightSmall );
  let node2 = new NOTNode(x1+boxWidth-25, y1+0.5*boxHeightSmall, node1);
  this.nodes = [ node1, node2 ] ;     
  this.remove = function() { };
}

// Create memory cell with its nodes
function Memory(x1,y1) {
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
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new InputNode(x1+25, y1+boxHeight-25 );
  let node3 = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeight);
  this.nodes = [ node1, node2, node3 ] ;     
  this.output = function() { 
    if( isHigh(node2.eval()) ) this.nodes[2].state = low;
    if( isHigh(node1.eval()) ) this.nodes[2].state = high; // set always wins
    return true;
  }
  this.remove = function() { };
}
    
// Create LED with node
function LED(x1,y1) {
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'LED');
    
  // Draw LED
  var c = new fabric.Circle({left: x1+boxWidth-25, top: y1+20, radius: 5, 
                             fill: 'darkred', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 2   });
  c.setGradient('stroke', gradientButtonDw );
  canvas.add(c);

  this.nodes = [ new InputNode(x1+25, y1+20 ) ] ;    

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
function Sound(x1,y1) {
  
  // Draw speaker
  var c1 = new fabric.Path('M '+(x1+130).toString()+' '+(y1+15).toString()+' Q '+
                           (x1+135).toString()+', '+(y1+25).toString()+', '+
                           (x1+130).toString()+', '+(y1+35).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 1 });
  canvas.add(c1); c1.sendToBack();    
  var c2 = new fabric.Path('M '+(x1+135).toString()+' '+(y1+10).toString()+' Q '+
                           (x1+145).toString()+', '+(y1+25).toString()+', '+
                           (x1+135).toString()+', '+(y1+40).toString(), 
                             { fill: '', stroke: 'black',
                               selectable: false, evented: false, strokeWidth: 1 });
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

  this.nodes = [ new InputNode(x1+25, y1+0.5*boxHeightSmall) ] ;    
  this.audio = document.getElementById("myAudio"); 
  // Control LED behaviour
  this.output = function() {  
    var result = this.nodes[0].eval();
      if( isHigh(result) ) {    
        this.audio.play();
        c1.set({strokeWidth: 1});
        c2.set({strokeWidth: 1});        
      } else {
        this.audio.pause(); 	
        c1.set({strokeWidth: 0});
        c2.set({strokeWidth: 0});        
      }
      return result;
  };

  this.remove = function() { };

}    
    
// Create switch
function Switch(x1,y1) {
  drawElementBox(x1,y1,boxWidth,boxHeightSmall,'drukschakelaar');
  this.output = function() { return true;};
  let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
  this.nodes = [ node ] ;
  // Draw the push button
  canvas.add( makeButton(x1+25, y1+0.5*boxHeightSmall, node) );
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
  
    drawText(x1+70,y1+30,"Hz",12);
    drawElementBox(x1,y1,boxWidth,boxHeightSmall,'pulsgenerator');

    // Create unique element ID
    var elementName = "frequency"+x1.toString()+y1.toString();
    
    // Create an input DOM element
    var input = inputDOM(x1+20,y1+10,elementName,"1","0.1","0.5","10");

    let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
    this.nodes = [ node ] ; 
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
  
    drawText(x1+70,y1+30,"V",12);
    drawElementBox(x1,y1,boxWidth,boxHeightSmall,'variabele spanning');
 
    // Create unique element ID
    var elementName = "voltage"+x1.toString()+y1.toString();

    // Create an input DOM element
    var input = inputDOM(x1+20,y1+10,elementName,"5","0.1","0.1","5");

    // Create an ouput node and set voltage from the DOM element
    let node = new OutputNode(x1+boxWidth-25, y1+0.5*boxHeightSmall );
    node.state = input.value;
    this.nodes = [ node ] ;     
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
  
  drawText(x1+120,y1+80,"V",12);
  drawText(x1+57,y1+31,"+");
  drawText(x1+57,y1+53,"\u2212");
  var r = new fabric.Triangle({left: x1+0.5*boxWidth, top: y1+35, height: 40, width: 40, 
                           fill: 'lightgrey', selectable: false, evented: false, angle:90,
                           stroke: 'black', strokeWidth: 1 });
  canvas.add(r);
  r.sendToBack();  
  
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
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new ComparatorNode(x1+boxWidth-25, y1+35, node1);
  node2.compare = input.value; // set compare value
  this.nodes = [ node1, node2 ] ;     
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

    drawText(x1+22,y1+36,"in");
    drawText(x1+boxWidth-60,y1+36,"uit");
    drawText(x1+boxWidth-88,y1+12,"8");
    drawText(x1+boxWidth-68,y1+12,"4");
    drawText(x1+boxWidth-48,y1+12,"2");
    drawText(x1+boxWidth-28,y1+12,"1");
    drawConnection([x1+boxWidth-92, y1+30, x1+boxWidth-62, y1+30]);
    drawConnection([x1+boxWidth-46, y1+30, x1+boxWidth-18, y1+30]);

    drawElementBox(x1,y1,boxWidth,boxHeightSmall,'AD omzetter');
    this.output = function() { return true;};
    let node4 = new InputNode( x1+25, y1+17 );
    let node3 = new BinaryNode(x1+boxWidth-85, y1+17, node4, 3 );
    let node2 = new BinaryNode(x1+boxWidth-65, y1+17, node4, 2 );
    let node1 = new BinaryNode(x1+boxWidth-45, y1+17, node4, 1 );
    let node0 = new BinaryNode(x1+boxWidth-25, y1+17, node4, 0 );
    this.nodes = [ node4,node3,node2,node1,node0 ] ;

    this.remove = function() {};
}

// Create Counter
function Counter(x1,y1) {
  
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

    drawElementBox(x1,y1,2*boxWidth,boxHeight,'pulsenteller');

    this.counter = 0;
    this.state = low;
    
    let node4 = new InputNode( x1+25, y1+20 ); // count pulses
    let node5 = new InputNode( x1+25, y1+50 ); // inhibit 
    let node6 = new InputNode( x1+25, y1+80 ); // reset

    // Create the binary output nodes
    let node3 = new BinaryNodeS(x1+2*boxWidth-100, y1+20, 3 );
    let node2 = new BinaryNodeS(x1+2*boxWidth-75, y1+20, 2 );
    let node1 = new BinaryNodeS(x1+2*boxWidth-50, y1+20, 1 );
    let node0 = new BinaryNodeS(x1+2*boxWidth-25, y1+20, 0 );

    // Draw the push button
    canvas.add( makeButton(x1+100, y1+boxHeight-20, node6) );
    
    this.textbox = new fabric.Textbox((this.counter).toString(), {
        left: x1+2*boxWidth-50, top: y1+70, width: 60, fontSize: 44, textAlign: 'right',
        fill: 'red', backgroundColor: '#330000', fontFamily: 'Courier New',
        selectable: false, evented: false });
    canvas.add(this.textbox);

    this.nodes = [ node6,node5,node4,node3,node2,node1,node0 ] ;
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



// Create light bulb 
function Lightbulb(x1,y1) {

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
            
  //canvas.remove(this.imgBulbOff);
  //canvas.add(this.imgBulbOn);
  //this.imgBulbOn.sendToBack();

  //var image;// = new Image();
  //var myImg = [];//null;

  /*var img = new fabric.Image(image, {left: x1, top: y1,});
  image.src = 'img/pic_bulbon.gif';
  canvas.add(img);
  img.sendToBack;
*/
  
  /*fabric.Image.fromURL('img/pic_bulboff.gif', function(img) {
    img.scale(0.5).set({ left: x1, top: y1,});
    //img.setSrc('img/pic_bulbon.gif');

    img.getElement().id = "bla";
    img.getElement().name = "bla";

    //canvas.setActiveObject(img);
    //myImg= canvas.getActiveObject();
    //myImg.push( canvas.getActiveObject());
    //image = new fabric.Image(img.getElement());
    canvas.add(img);
    img.sendToBack;
  });

  canvas.renderAll();


  image = document.getElementById("bla");
  //image = document.getElementsByTagName("IMG")[0];

  image.src = 'img/pic_bulbon.gif';
*/
  
  /*var imgObj = new Image();
  imgObj.src = "img/pic_bulboff.gif";
  imgObj.onload = function () 
  {
    var image = new fabric.Image(imgObj);
    image.set({ left: x1, top: y1,
    });
  }*/
  //canvas.add(imgObj);

  //myImg[0].set = {left: 100};
  /*var objs = canvas.getObjects();
  if (objs.length) {
       objs.forEach(function(e) {
         if (e && e.type === 'image') {         
           e._element.src = 'img/pic_bulbon.gif';
           canvas.renderAll();
         }
       });
  }*/
  //this.changeSrc();
  //image.src = 'img/pic_bulbon.gif';
  //img.setSrc('img/pic_bulbon.gif');
  //image.getElement().setSrc('img/pic_bulbon.gif');

  this.state = false;
  var isHV = true;
  let node1 = new InputNode(x1-17, y1+35, isHV );
  let node2 = new InputNode(x1, y1+65, isHV );
  this.nodes = [ node1, node2 ] ;
  
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
    }
    return;
  };

  this.remove = function() {};

}


// Create relais with its nodes
function Relais(x1,y1) {
  // Draw symbols and wires
  drawConnection([x1+30, y1+0.5*boxHeight-5, x1+20, y1+0.5*boxHeight+5]);
  var r = new fabric.Rect({left: x1+25, top: y1+0.5*boxHeight, width: 20, height: 10, 
                             fill: 'lightgrey', selectable: false, evented: false,
                             stroke: 'black', strokeWidth: 1   });   
  canvas.add(r); r.sendToBack();
  var textbox = new fabric.Textbox("~", { left: x1+boxWidth-50, top: y1+25, width: 20,
                                          fontSize: 20, textAlign: 'center', fontFamily:'Arial',
                                          selectable: false, evented: false });
  canvas.add(textbox)
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
  this.output = function() {return true;};
  let node1 = new InputNode(x1+25, y1+25 );
  let node2 = new RelaisNode(x1+boxWidth-75, y1+boxHeight-25, node1);
  let node3 = new RelaisNode(x1+boxWidth-25, y1+boxHeight-25, node1);
  this.nodes = [ node1, node2, node3 ] ;

  this.remove = function() {};

}

function removeElements() {
  canvas.clear();
  for (i = 0; i < elements.length; i++) { 
    elements[i].remove();
  } 
}




var elements = [];  

// Main engine: evaluate all elements (elements evaluate the nodes)
function evaluateBoard() {
    //var t0 = performance.now()

    for (i = 0; i < elements.length; i++) { 
       elements[i].output();
    } 
    canvas.renderAll();
  
  //evaluateBoard();
    //var t1 = performance.now()
    //console.log("Call to doSomething took " + (t1 - t0) + " milliseconds.")

}

  //alert("Your name is ");

// Make sure that the engine is run every clockPeriod  
setInterval(evaluateBoard, clockPeriod);

//evaluateBoard();


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
  if( p.name != "wire" ) return;
  p.line1.set({ 'x2': p.left, 'y2': p.top });
  // Snap to any node
  for (i = 0; i < elements.length; i++) {
    for (j = 0; j < elements[i].nodes.length; j++) {
      var snapNode = elements[i].nodes[j];
      // Check if wire and node are the same type 
      if( (p.node.isHV && snapNode.isHV) || (!p.node.isHV && !snapNode.isHV) ) {
        var x1 = snapNode.x1;
        var y1 = snapNode.y1;
        if( Math.abs(p.left - x1 ) < 20 && Math.abs(p.top - y1 ) < 20 ) {
          p.left = x1;
          p.top = y1;
          p.line1.set({ 'x2': x1, 'y2': y1 });
        }
      }
    }
  }
});
    
// After moving wire: destroy create new links
canvas.on('object:moved', function(e) {
    var p = e.target;
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

