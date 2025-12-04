
const CACHE_NAME = 'fintrack-pro-v6.6';
const DYNAMIC_CACHE_NAME = 'fintrack-dynamic-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  // CDN Libraries still used in index.html (optional tools)
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/recharts/umd/Recharts.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  // Icons
  'https://cdn-icons-png.flaticon.com/512/2755/2755444.png'
];

// Install Event: Cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // console.log('[Service Worker] Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            // console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event: Cache-First Strategy for Static Assets, Network-First for others
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle CDN and Static Assets (Cache First)
  if (ASSETS_TO_CACHE.includes(url.pathname) || ASSETS_TO_CACHE.includes(event.request.url) || url.hostname.includes('unpkg.com') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchRes) => {
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request.url, fetchRes.clone());
                return fetchRes;
            });
        });
      })
    );
  } 
  // Ignore Supabase API calls for SW Caching (handled by application state/logic)
  else if (url.hostname.includes('supabase.co')) {
      return; 
  }
  // Default: Network First, Fallback to Cache (if applicable)
  else {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
