# Make the app installable & offline (PWA)

The app already does almost all processing in the browser (resize/format conversion and on-device background removal), so it's a strong fit for an installable offline web app. We'll add a service-worker-cached app shell so it opens with no connection, plus a manifest + icons so it can be installed to desktop/home screen.

Offline applies to the **published** app only — it never registers in the Lovable editor preview or dev, so previews stay unaffected.

## What stays offline vs. not
- **Works offline:** all resize/format conversion, EXIF carry-over, and the on-device background remover (after its one-time ~25 MB model download, which needs the internet once and is then cached).
- **Needs the internet:** the optional "Try higher quality" cloud background removal — it will simply be unavailable offline (no error, just won't fetch).

## Changes

### 1. Install the plugin
- `bun add -d vite-plugin-pwa`

### 2. Configure `vite-plugin-pwa` in `vite.config.ts`
Add the plugin with `generateSW`, applying the PWA skill's required constraints:
- `registerType: "autoUpdate"`, `injectRegister: null` (the wrapper is the only registrar)
- `strategies: "generateSW"`, `filename: "sw.js"`
- `devOptions: { enabled: false }` (no SW emitted in dev)
- `manifest`: name "Image size & format converter", short_name "Image converter", `display: "standalone"`, `start_url: "/"`, theme color and background color from the app palette (dark slate primary `#1b1f24`, white background `#ffffff`), icon entries (192/512 + maskable)
- `workbox` runtime rules: **NetworkFirst** for navigations (with `/~oauth` excluded from the navigation fallback), **CacheFirst** only for same-origin hashed assets (`/assets/**`), and a reasonable `maximumFileSizeToCacheInBytes` so the WASM libs don't bloat the precache (assets are fetched on demand by the app already)

### 3. Add a guarded registration wrapper — `src/pwa/registerSW.ts`
A single module that imports `virtual:pwa-register` and registers the SW **only** in the published app. It refuses registration when any of these are true, and unregisters any matching `/sw.js` registration before returning:
- `!import.meta.env.PROD`
- running inside an iframe
- hostname starts with `id-preview--` or `preview--`
- hostname is/ends with `lovableproject.com`, `lovableproject-dev.com`, or `.beta.lovable.dev`
- the URL has `?sw=off`

This keeps the Lovable preview/dev clean and gives a manual kill switch (`?sw=off`).

### 4. Call the wrapper once, client-only
- Import `registerSW.ts` dynamically from a `useEffect` in `src/routes/__root.tsx` `RootComponent`. `useEffect` only runs in the browser, so SSR is unaffected. Keep everything else in `__root.tsx` unchanged.

### 5. Add manifest + icons + head tags
- Create `public/manifest.webmanifest` (name, short_name, theme/bg color, `display: "standalone"`, icon entries).
- Generate app icons under `public/`: `icon-192.png`, `icon-512.png`, and a maskable `icon-512-maskable.png` (created via imagegen, matching the app's `ImageUp`/image-converter theme).
- Add head `links` in `__root.tsx`: `manifest`, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable`, plus keep the existing favicon.

### 6. UX note for offline background removal
- No code change needed for the cloud button (it already fails gracefully with a message), but I'll confirm the on-device path stays fully offline and the cloud button's error text reads sensibly when offline.

## Verification
- `bun run build` succeeds; a `/sw.js` is emitted only in the production build.
- Typecheck (`tsgo`) passes.
- In the published app: load once online, then go offline and reload — the app shell + conversion still works; on-device background removal works (after the one-time model download); the cloud button shows a clear "unavailable offline"-style message.
- Confirm the Lovable preview does **not** register a SW (checked via `navigator.serviceWorker.getRegistrations()` in the preview).

## Notes for you
- Install the app from the published URL (browser install prompt or "Add to Home Screen"). The Lovable preview itself will not be installable/offline — that's intentional and correct.
- iOS has some PWA limitations (no true background SW eviction semantics), but install + offline open + local conversion all work.
