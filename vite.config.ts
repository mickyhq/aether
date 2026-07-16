import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import {
  getCacheNamespace
} from './shared/cacheVersion.js'
import { SOURCE_REFRESH_SECONDS } from './shared/cachePolicy.js'
import { createLocalApiMiddleware } from './server/localApiMiddleware.js'

const packageVersion = (
  JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  ) as { version: string }
).version
const buildVersion = `v${packageVersion}`

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (!process.env.METEOGATE_KEY && env.METEOGATE_KEY) {
    process.env.METEOGATE_KEY = env.METEOGATE_KEY
  }

  if (!process.env.ECMWF_KEY && env.ECMWF_KEY) {
    process.env.ECMWF_KEY = env.ECMWF_KEY
  }

  if (!process.env.FIRMS_MAP_KEY && env.FIRMS_MAP_KEY) {
    process.env.FIRMS_MAP_KEY = env.FIRMS_MAP_KEY
  }

  if (!process.env.WINDY_KEY && env.WINDY_KEY) {
    process.env.WINDY_KEY = env.WINDY_KEY
  }

  if (!process.env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_URL) {
    process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL
  }

  if (!process.env.UPSTASH_REDIS_REST_TOKEN && env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN
  }

  return {
    define: {
      'import.meta.env.VITE_AETHER_BUILD_VERSION': JSON.stringify(buildVersion)
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Aether Weather Map',
          short_name: 'Aether',
          description: 'Interactive live weather map with wind, radar, air quality, and Jet Stream layers.',
          categories: ['weather', 'utilities'],
          theme_color: '#071014',
          background_color: '#071014',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          globIgnores: ['**/example.png'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => (
                url.origin === 'https://tilecache.rainviewer.com' &&
                url.pathname.startsWith('/v2/radar/')
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: getCacheNamespace('rainviewer-radar-tiles'),
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 384,
                  maxAgeSeconds: 24 * 60 * 60
                }
              }
            },
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                [
                  '/api/fire-tile',
                  '/api/effis-fire-tile'
                ].includes(url.pathname)
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: getCacheNamespace('source-tiles'),
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 384,
                  maxAgeSeconds: SOURCE_REFRESH_SECONDS
                }
              }
            },
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                url.pathname === '/api/radar' &&
                (
                  url.searchParams.has('path') ||
                  url.searchParams.has('coverage')
                )
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: getCacheNamespace('radar-tiles'),
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 256,
                  maxAgeSeconds: 24 * 60 * 60
                }
              }
            },
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                url.pathname.startsWith('/api/') &&
                ![
                  '/api/fire-tile',
                  '/api/effis-fire-tile'
                ].includes(url.pathname) &&
                !(
                  url.pathname === '/api/radar' &&
                  (
                    url.searchParams.has('path') ||
                    url.searchParams.has('coverage')
                  )
                )
              ),
              handler: 'NetworkFirst',
              options: {
                cacheName: getCacheNamespace('api'),
                networkTimeoutSeconds: 4,
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 24 * 60 * 60
                }
              }
            }
          ]
        }
      }),
      localApi()
    ]
  }
})

function localApi(): Plugin {
  const handleApiRequest = createLocalApiMiddleware()

  return {
    name: 'aether-local-api',
    configureServer(server) {
      server.middlewares.use(handleApiRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApiRequest)
    }
  }
}
