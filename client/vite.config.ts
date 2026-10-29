import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { uiSkala } from './uiSkala.ts';

const backend = 'http://localhost:8080';

export default defineConfig({
  // Einstellung «Bediengrösse»: px in den eigenen Stilen skalieren mit --ui/--schrift (siehe uiSkala.ts)
  css: { postcss: { plugins: [uiSkala()] } },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt', // Hinweis «Neu laden» in lib/update.svelte.ts
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Lagebild',
        short_name: 'Lagebild',
        description: 'Lagebild mit Blue Force Tracking – Ausbildungs- und Testmittel',
        lang: 'de-CH',
        theme_color: '#161b1f',
        background_color: '#161b1f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // App-Hülle inkl. MapLibre/milsymbol offline
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/wmts\.geo\.admin\.ch\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'swisstopo-kacheln',
              expiration: { maxEntries: 30000, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true },
    },
  },
  // MapLibre + milsymbol: bewusst ein Bundle, wird vom Service Worker vorab gecacht
  build: { chunkSizeWarningLimit: 2500 },
});
