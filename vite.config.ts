// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // Installable + offline PWA. Service worker is generated (generateSW) and registered
      // only in the published app via src/pwa/registerSW.ts — never in dev or the Lovable preview.
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null, // the wrapper is the only registrar
        filename: "sw.js",
        devOptions: { enabled: false }, // no SW emitted in dev
        workbox: {
          // HTML navigations are NetworkFirst so users always get fresh HTML online and a
          // cached shell when offline. Never cache-first for navigations.
          navigateFallbackDenylist: [/^\/~oauth/],
          // The ONNX runtime WASM (~24 MB) and its bundles are only needed for background
          // removal and are useless without the model weights (downloaded at runtime). Keep
          // them out of the precache so installs stay lean; they are runtime-cached on first use.
          globIgnores: [
            "**/ort-wasm-*.wasm",
            "**/ort.bundle.min-*.mjs",
            "**/ort.webgpu.bundle.min-*.mjs",
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "navigations",
                networkTimeoutSeconds: 8,
              },
            },
            {
              // Same-origin hashed build assets — safe to cache-first.
              urlPattern: ({ url }) =>
                url.origin === self.location.origin && url.pathname.startsWith("/assets/"),
              handler: "CacheFirst",
              options: {
                cacheName: "assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Local fonts / public assets (favicon, icons, manifest).
              urlPattern: ({ url }) =>
                url.origin === self.location.origin &&
                /\.(?:png|webp|jpg|jpeg|gif|svg|ico|webmanifest|woff2?)$/i.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Background-removal runtime: the ONNX WASM binaries and worker bundles are
              // kept out of the precache (too large), so cache them on first use instead.
              urlPattern: ({ url }) =>
                url.origin === self.location.origin &&
                /\.(?:wasm|mjs)$/i.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "bg-removal-runtime",
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
            {
              // The background-removal model weights are downloaded from the imgly CDN on
              // first use. Cache them for a year so removal keeps working offline.
              urlPattern: ({ url }) => url.hostname.endsWith("staticimgly.com"),
              handler: "CacheFirst",
              options: {
                cacheName: "bg-removal-model",
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },

          ],
        },
      }),
    ],
  },
});
