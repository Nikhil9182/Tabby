/**
 * Tabby Service Worker
 * Provides offline-first caching for application shell and immutable static assets.
 * 
 * STRICT RULES:
 * - NEVER cache Google OAuth tokens or authenticated API responses (Drive, Sheets, Identity).
 * - Cache-first for immutable static bundles (/assets/*).
 * - Network-first for dynamic queries & navigation with offline fallback to app shell.
 * - Clean old cache versions on activate.
 */

const CACHE_VERSION = 'v1.0.1';
const APP_BASE = new URL('./', self.location.href);
const appUrl = (path) => new URL(path, APP_BASE).href;
const STATIC_CACHE_NAME = `tabby-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `tabby-runtime-${CACHE_VERSION}`;

// Pre-cached App Shell resources
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
].map(appUrl);

// Domains and endpoints that MUST NEVER be cached
function isForbiddenCache(request, url) {
  // Never cache non-GET requests
  if (request.method !== 'GET') {
    return true;
  }

  // Never cache requests with Authorization header
  if (request.headers.has('Authorization')) {
    return true;
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  // Explicitly block Google OAuth, Identity, Google Drive, Google Sheets, and Google APIs
  if (
    hostname.includes('googleapis.com') ||
    hostname.includes('accounts.google.com') ||
    hostname.includes('googleusercontent.com') ||
    hostname.includes('gstatic.com') ||
    hostname.endsWith('.google.com') ||
    pathname.includes('oauth') ||
    pathname.includes('token')
  ) {
    return true;
  }

  return false;
}

// Check if request is for immutable static bundle (/assets/* or fingerprinted static files)
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }
  return (
    url.pathname.startsWith(new URL('assets/', APP_BASE).pathname) ||
    /\.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname)
  );
}

// Install Event: pre-cache application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.warn('[SW] Pre-caching app shell failed:', error);
      })
  );
});

// Activate Event: clean up outdated caches
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE_NAME, RUNTIME_CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              return caches.delete(cacheName);
            }
            return null;
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Message listener (e.g. SKIP_WAITING from app)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip unsupported schemes (chrome-extension, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Security & Privacy rule: bypass service worker cache entirely for Google/OAuth/Auth APIs
  if (isForbiddenCache(request, url)) {
    return;
  }

  // 1. Navigation requests (SPA page loads) -> Network-First, fall back to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, update runtime cache copy of index.html
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(appUrl('index.html'), clone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback to app shell
          const cached = await caches.match(appUrl('index.html'));
          if (cached) {
            return cached;
          }
          const rootCached = await caches.match(appUrl('./'));
          if (rootCached) {
            return rootCached;
          }
          return new Response('Offline - Tabby is unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 2. Immutable static bundles (Vite hashed JS/CSS, images, icons) -> Cache-First
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Nothing in cache and network failed
            return new Response('', { status: 408, statusText: 'Request Timed Out' });
          });
      })
    );
    return;
  }

  // 3. Dynamic / API queries (e.g. public Frankfurter exchange rate API) -> Network-First
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Cache successful responses in runtime cache
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          !isForbiddenCache(request, url)
        ) {
          const clone = networkResponse.clone();
          caches.open(RUNTIME_CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback to runtime cache if available
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
  );
});
