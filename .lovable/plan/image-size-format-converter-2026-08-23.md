# Image size & format converter

A single-page web tool where you upload one image, set a new size (dimensions
and/or quality), pick an output format, and download the converted file. All
processing happens in the browser — no upload to a server, no account needed.

## What it does

- **Upload** one image via drag-and-drop or click-to-browse.
- **Change size two ways:**
  - **Dimensions (px):** set width and/or height, with a "lock aspect ratio"
    toggle so the image isn't stretched.
  - **Quality / compression:** a 1–100 slider that reduces file size for the
    lossy formats (JPG, WEBP). PNG/GIF/BMP/TIFF ignore the slider (lossless).
- **Change format** to one of six: **JPG, PNG, WEBP, GIF, BMP, TIFF**.
- **Preview** the result live and see original vs. new file size.
- **Download** the converted image with the chosen extension.

## Why it runs fully in the browser (no Python/Pillow)

This Lovable project builds web apps (React on TanStack Start), and its server
side runs in a serverless Worker where Python/Pillow is not available. Doing
everything client-side is faster and keeps the image private (it never leaves
the browser). The formats the browser Canvas can't export natively are covered
by small pure-JavaScript encoders that run in the browser:

```text
Output format   |  Encoder used
----------------|------------------------------------------
JPG / PNG / WEBP|  Canvas toBlob()        (native browser API)
GIF             |  gifenc                (pure JS, npm)
BMP             |  hand-written encoder  (~60 lines, simple format)
TIFF            |  utif                  (pure JS, npm, also decodes input)
```

Input decoding: the browser's `<img>`/`createImageBitmap` decodes PNG, JPEG,
WEBP, GIF, BMP, SVG natively. TIFF input (browsers can't decode) is handled by
`utif`'s decoder, which yields RGBA pixels drawn to a canvas first.

## Files to add / change

- **`src/routes/index.tsx`** — replace the placeholder with the converter UI.
  Rendered behind `<ClientOnly>` because it uses Canvas and browser-only libs.
- **`src/lib/image-convert.ts`** — the conversion engine (pure functions, no
  React): `convertImage(file, options) -> { blob, url, width, height }`.
  Branches per output format using the encoders above.
- **`src/lib/bmp-encoder.ts`** — minimal RGBA → BMP encoder.
- **New deps:** `gifenc`, `utif` (both pure JS, browser-safe). Install via bun.
- **`src/routes/index.tsx` head()** — set a real title/description for SEO
  (e.g. "Image size & format converter").

## UI layout (single page, centered, max-width ~720px)

1. **Upload zone** — dashed drop area + "Choose image" button. Accepts
   `image/*,.tif,.tiff`.
2. Once uploaded, a two-column layout (stacks on mobile):
   - **Left: original preview** + original filename / dimensions / size.
   - **Right: controls** — width, height, lock-aspect toggle, format dropdown,
     quality slider (disabled unless JPG/WEBP), "Convert" button.
3. **Result** — converted preview, new dimensions/size, "Download" button
   (filename = original name + chosen extension).

## Notes / edge cases

- Aspect-ratio lock: editing width auto-fills height (and vice versa).
- If target dimensions exceed original, the image is upscaled (browsers warn
  nothing — fine, but quality drops). Shown as-is.
- JPG has no alpha channel; transparent areas become white background.
- GIF output is a single static frame (not animated) from the resized image.
- Very large images are still processed client-side; no hard size limit beyond
  the browser's canvas memory.

## Verification

- Build passes (`bun run build` / typecheck) — the harness runs this.
- Manual check via the preview: upload a PNG, resize to 50%, export as WEBP at
  quality 70 — confirms dimensions, format, and download all work.
- Confirm GIF, BMP, TIFF each produce a valid downloadable file.
