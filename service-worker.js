const CACHE_NAME = 'curators-cache-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './admin.html',
  './student.html',
  './chat.html',
  './style.css',
  './admin.css',
  './admin.js',
  './manifest.json',
  './logo.png',
  './icon-192.png',
  './icon-512.png'
];

// Установка Service Worker (кэшируем файлы)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Кэшируем файлы...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Активируем сразу
});

// Активация (удаляем старые кэши, если версия изменилась)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Удаляем старый кэш:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Берем контроль над страницами
});

// Перехват запросов (сначала ищем в кэше, потом в сети)
self.addEventListener('fetch', (event) => {
  // Не кэшируем запросы к Supabase и внешним API
  if (event.request.url.includes('supabase.co') || event.request.url.includes('googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
