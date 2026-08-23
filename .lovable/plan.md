# Add a background remover

A new "Remove background" step on the converter page. It runs on your device by
default, with an optional higher-quality cloud version when the local result
isn't clean enough.

## How it works for you

1. Upload an image as usual.
2. Below the preview, a new "Remove background" card appears with a
   "Remove background" button.
3. First use downloads a small AI model (~25 MB, cached afterwards) and shows a
   progress state; after that it takes a few seconds per image.
4. The result is shown side by side with the original, on a checkerboard
   backdrop so transparency is visible, plus a "Download PNG" button.
5. A secondary "Try higher quality" button sends the image to a cloud AI model
   for a cleaner cutout (better on hair and fine edges). This one uses AI credits
   and does leave the browser, and the button says so.
6. A "Use this for conversion" button feeds the cut-out image back into the
   resize/convert controls, and auto-switches the output format to PNG (or WEBP)
   since JPG, BMP and GIF can't keep transparency.

## Behaviour notes

- Transparency-safe formats are PNG, WEBP and TIFF. If a cut-out is active and a
  format without alpha is selected, a short note warns that transparency will be
  flattened to white.
- The cut-out replaces the working image, not the original upload; "Start over"
  still clears everything.
- Errors (model download blocked, cloud AI out of credits or rate limited) show a
  plain message in the card and leave the original image untouched.

## Technical details

- New dependency: `@imgly/background-removal` (browser WASM, runs fully
  client-side). Loaded with a dynamic `import()` inside the click handler so it
  never enters the server-render bundle, matching how `utif`/`gifenc` are loaded
  in `src/lib/image-convert.ts`.
- New `src/lib/background-removal.ts`:
  - `removeBackgroundLocal(file, onProgress) -> Blob` (PNG with alpha).
  - `removeBackgroundCloud(file) -> Blob` — posts the file to the server route
    below and returns the returned PNG.
- New server route `src/routes/api/remove-background.ts` — accepts multipart
  `FormData` (image + prompt), forwards it to the Lovable AI Gateway image-edit
  endpoint with `transparent_background` behaviour (solid white background then
  alpha), reads `LOVABLE_API_KEY` from `process.env` inside the handler, and
  returns the resulting PNG bytes. Gateway 402/403 are passed through as terminal
  errors with their message; 429/5xx get one bounded retry.
- New `src/components/BackgroundRemover.tsx` — the card: buttons, progress,
  before/after preview with a CSS checkerboard, download, and "Use this for
  conversion".
- `src/routes/index.tsx` — add `workingFile` state (defaults to the uploaded
  file) that the convert pipeline reads, plus handlers to accept a cut-out and to
  nudge `format` to PNG when transparency is present. Render
  `<BackgroundRemover />` between `ImagePreview` and `ConvertControls`.
- `src/components/ConvertControls.tsx` — add the "transparency will be flattened"
  note for alpha-less formats when a cut-out is active.
- Object URLs for cut-out previews are revoked on replace and on reset, following
  the existing cleanup pattern.

## Verification

- Upload a photo with a clear subject: local removal produces a PNG with a
  transparent background, visible against the checkerboard.
- "Try higher quality" returns a cleaner cutout and reports credit/rate-limit
  errors clearly instead of failing silently.
- "Use this for conversion" + PNG output downloads a file that still has
  transparency; selecting JPG shows the flatten warning and produces a white
  background.
- Existing resize/convert/estimate flows still work when background removal is
  never used.
