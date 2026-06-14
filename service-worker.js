// service-worker.js — GOAT League University PWA
const CACHE_NAME = 'goat-league-v1';
const CACHE_VERSION = '0.2.0';
const FULL_CACHE_NAME = `${CACHE_NAME}-${CACHE_VERSION}`;

// Assets to cache on install
const PRECACHE = [
  'index.html',
  'collection.html',
  'vote.html',
  'leaderboard.html',
  'profile.html',
  'css/style.css',
  'css/cards.css',
  'css/animations.css',
  'js/storage.js',
  'js/fks.js',
  'js/gacha.js',
  'js/antiCheat.js',
  'js/app.js',
  'js/ui.js',
  'data/players.json',
  'data/cards.json',
  'data/trivia.json',
  'data/categories.json',
  'data/rivalries.json',
  'data/voteConfig.json',
];

// Install: cache all precache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(FULL_CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_NAME) && k !== FULL_CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for HTML
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // HTML pages: network-first (get updates), fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(FULL_CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response.ok) return response;
        const clone = response.clone();
        caches.open(FULL_CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});
