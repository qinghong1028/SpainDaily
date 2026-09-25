const CACHE = 'spaindaily-shell-v6'
const rootUrl = new URL('./', self.location.href)

function shellAssets(html) {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], rootUrl).href)
    .filter((url) => new URL(url).origin === self.location.origin && /\.(?:js|css)$/.test(new URL(url).pathname))
}

async function cacheCompleteShell() {
  const cache = await caches.open(CACHE)
  const response = await fetch(rootUrl)
  if (!response.ok) throw new Error('Unable to download app shell')
  await cache.addAll([...new Set(shellAssets(await response.clone().text()))])
  await cache.put(rootUrl, response)
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCompleteShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('spaindaily-shell-') && key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(event.request)
        if (!response.ok) throw new Error('Unable to download page')
        await cache.addAll([...new Set(shellAssets(await response.clone().text()))])
        await cache.put(rootUrl, response.clone())
        return response
      } catch {
        return (await cache.match(rootUrl, { ignoreVary: true })) || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(event.request, { ignoreVary: true })
    if (cached) return cached
    try {
      const response = await fetch(event.request)
      if (response.ok) event.waitUntil(cache.put(event.request, response.clone()))
      return response
    } catch {
      return Response.error()
    }
  })())
})
