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

document.addEventListener("DOMContentLoaded", showBrowserAlert);


