/*
 * Slatebase service worker: offline fallback for page loads, nothing more.
 *
 * It caches ONE static page (offline.html) and answers a failed navigation with it. It never
 * caches or serves API responses, notes, assets or anything else: the app holds signed-in
 * content, and a worker that kept copies would show stale data and leak it to the next user
 * of the device. Bump CACHE when offline.html changes.
 */
const CACHE = 'slatebase-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Only top-level page loads. API calls, assets and the event stream go straight to the network.
  if (request.mode !== 'navigate' || request.method !== 'GET') return
  event.respondWith(
    fetch(request).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL)).then((r) => r ?? Response.error())),
  )
})
