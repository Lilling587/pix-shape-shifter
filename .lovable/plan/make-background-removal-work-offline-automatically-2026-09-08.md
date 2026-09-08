# Make background removal work offline automatically

Today the background remover downloads its model the first time you use it. If your first use happens without internet, it fails. This change makes the app fetch and store that model quietly in the background after you open it online, so the tool is ready even when you go offline later.

## What you'll notice

- Shortly after opening the installed app online, the model is fetched silently in the background (no button, no spinner blocking anything).
- Once stored, on-device background removal works offline and stays available for a year.
- If you start a removal before the background fetch is done, nothing breaks — it just continues normally and reuses whatever is already stored.
- A small line in the background remover card shows "Ready to use offline" once everything is stored, so you know where you stand.
- The higher-quality cloud option still needs internet; it stays clearly marked as unavailable offline.

## Behaviour rules

- Only runs when online, in the installed/published app (never in preview or development).
- Runs once per device; skipped if already stored.
- Waits until the page is idle and after first paint so it never slows down loading or a conversion.
- Skipped on metered connections or when the browser reports data-saver mode.

## Technical notes

- New `src/lib/bg-removal-prefetch.ts`: an idle-time, once-per-device warmup that calls the same dynamic `@imgly/background-removal` entry used by `removeBackgroundLocal`, running it on a tiny generated 1x1 canvas blob so the library downloads the ONNX runtime WASM and model weights through its normal fetch path. Guarded by `navigator.onLine`, `import.meta.env.PROD`, non-iframe/non-preview host check (reuse the guards in `src/pwa/registerSW.ts`), `navigator.connection.saveData`/`effectiveType` check, and a `localStorage` completion flag.
- Trigger it from the same place the service worker is registered (or a small effect in `src/routes/__root.tsx`) via `requestIdleCallback` with a `setTimeout` fallback.
- No `vite.config.ts` changes needed: the existing `bg-removal-runtime` and `bg-removal-model` CacheFirst runtime caches already store these files for a year, so the warmup populates them.
- Expose a readiness signal (cache-based check via `caches.match` on a known model URL, or the stored flag) to `src/components/BackgroundRemover.tsx` for the "Ready to use offline" label.
- Failures are swallowed silently and retried on a later visit; never surface an error toast for the warmup.
- Verification: typecheck, production build, confirm `dist/sw.js` still contains the two bg-removal cache names, and a Playwright run confirming the app loads with no console errors and background removal still works.
