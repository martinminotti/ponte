import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// mode "single": un unico file HTML autosufficiente (anteprima, demo). Niente service worker.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: { __BUILD_SINGLE__: JSON.stringify(single) },
    build: single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 } : { target: 'es2022', sourcemap: true },
    plugins: [
      react(),
      tailwindcss(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'prompt',
            includeAssets: ['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/favicon.svg'],
            manifest: {
              id: './',
              categories: ['business', 'productivity'],
              name: 'Ponte',
              short_name: 'Ponte',
              description: 'Il registro dell\'officina: accettazione veicoli, stato lavori su WhatsApp, conto e fatture per officine, elettrauti e gommisti.',
              lang: 'it',
              start_url: './',
              scope: './',
              display: 'standalone',
              orientation: 'any',
              background_color: '#EDEDEB',
              theme_color: '#EDEDEB',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
              // dipendenze opzionali di jsPDF mai usate dall'app
              globIgnores: ['**/html2canvas*', '**/purify*', '**/index.es-*'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
            },
          }),
    ],
  };
});
