const CACHE = 'spaindaily-shell-v2'
const STATIC_SHELL = ['./manifest.webmanifest', './icon.svg']

async function cacheCompleteShell() {
  const cache = await caches.open(CACHE)
  await cache.addAll(STATIC_SHELL)
  const rootUrl = new URL('./', self.location.href)
  const response = await fetch(rootUrl)
  const html = await response.clone().text()
  await cache.put(rootUrl, response)
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], rootUrl).href)
    .filter((url) => new URL(url).origin === self.location.origin)
  await cache.addAll([...new Set(assets)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCompleteShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match(new URL('./', self.location.href))))
  )
})
