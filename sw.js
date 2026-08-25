// Jednoduchý service worker jen kvůli splnění podmínek instalovatelnosti na
// Androidu — Chrome appku nabídne k plné instalaci (ne jen jako záložku)
// jen když appka má manifest.json a zaregistrovaný service worker
// s 'fetch' listenerem.
//
// Záměrně NIC necachuje. Appka Směny dřív používala cache-first service
// worker a blokovalo to aktualizace (musel se přepsat na network-first) —
// aby se tahle appka nedostala do stejné pasti, sw.js tu jen nechává každý
// požadavek projít přímo na síť, beze změny chování appky.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
