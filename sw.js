const CACHE_NAME = 'vocab-learner-v2';
const ASSETS = [
  './',
  './index.html',
  './vocab-learner.css',
  './manifest.json',
  './js/state.js',
  './js/settings.js',
  './js/speech.js',
  './js/core.js',
  './js/flashcards.js',
  './js/list.js',
  './js/quiz.js',
  './js/story.js',
  './js/data.js',
  './js/reader.js',
  './js/dictionary.js',
  './js/features.js',
  './js/boot.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
