// Set a warning messsage when using Internet Explorer
function isIE() {
  // IE 10 and IE 11
  return /Trident\/|MSIE/.test(window.navigator.userAgent);
}

let showBrowserAlert = (function () {
  if( isIE() ) {
    $(".unsupported-browser" ).html("<b>Deze browser wordt niet ondersteund!</b></br>" +
                                    "Deze webapplicatie werkt niet in Internet Explorer.</br>" + 
                                    "Gebruik een moderne browser zoals Chrome, Edge, Firefox of Safari.");
  }
});

$(document).ready( showBrowserAlert ); 
