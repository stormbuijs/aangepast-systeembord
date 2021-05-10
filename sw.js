var CACHE_NAME = 'systeembord-cache-v1';
var CURRENT_CACHES = CACHE_NAME;
var urlsToCache = [
  './',
  'index.html',
  'style.css',
  'favicon.ico',
  'site.webmanifest',
  'sw.js',
  'scripts/systemboard_engine.js',
  'scripts/registerSW.js',
  'scripts/fabric-patch-touch.js',
  'scripts/fabric.min.js',
  'scripts/jquery-3.5.0.min.js',
  'scripts/warningIE.js',
  'xml/systeembord.xml',
  'xml/voorbeelden/SRANDORLatch.xml',
  'xml/voorbeelden/geheugencel.xml',
  'xml/voorbeelden/sb_thermostaatMinMax.xml',
  'xml/voorbeelden/SRNORLatch.xml',   
  'xml/voorbeelden/lichtsluisTeller.xml',
  'xml/voorbeelden/analoogDigitaal.xml',
  'xml/voorbeelden/sb_thermostaat.xml',
  'xml/Newton/Fig23_huiskamerverwarming.xml',
  'xml/Newton/Fig33_autogordels.xml',
  'xml/Newton/Fig30_knipperlicht.xml',
  'xml/Newton/Fig34_schakelklok.xml',
  'img/pic_bulboff.gif',
  'img/pic_bulbon.gif',
  'img/ldr.png',
  'img/radiator.jpg',
  'apple-touch-icon.png',
  'mstile-70x70.png'
];

self.addEventListener('install', function(event) {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  // Return without calling event.respondWith()
  // if this is a range request.
  if (event.request.headers.has('range')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

