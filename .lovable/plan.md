# Plan: App improvements — rotate/flip, crop, AVIF, strip EXIF, before/after slider, HEIC input

## Overview

Six new features, all client-side (no server changes needed except HEIC needs a new dependency):

1. **Rotate & flip** — transform controls applied before conversion
2. **Crop tool** — visual drag-to-select crop region on the image
3. **AVIF output** — modern high-compression format, feature-detected
4. **Strip EXIF toggle** — remove all metadata for privacy
5. **Before/after slider** — draggable comparison of original vs. converted
6. **HEIC input** — upload iPhone HEIC/HEIF photos and convert them

## 1. Rotate & flip

**New file:** `src/components/ImageTransform.tsx`
- Four buttons: rotate left 90°, rotate right 90°, flip horizontal, flip vertical
- Uses lucide icons (`RotateCcw`, `RotateCw`, `FlipHorizontal`, `FlipVertical`)

**State in `index.tsx`:**
```ts
const [transform, setTransform] = useState<{
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}>({ rotate: 0, flipH: false, flipV: false });
```

**Changes to `src/lib/image-convert.ts`:**
- Add `transform?: { rotate: number; flipH: boolean; flipV: boolean }` to `ConvertOptions`
- In `drawToCanvas`, after drawing the source to the canvas, apply ctx transforms:
  - Translate to center, rotate, flip via `ctx.scale(-1, 1)` / `ctx.scale(1, -1)`, translate back
  - For 90°/270°, swap the canvas dimensions before drawing
- Reset transform state in the `reset()` function

**Dimension/aspect handling in `index.tsx`:**
- When rotation is 90° or 270°, the effective width/height swap
- `aspectRef.current` is inverted when rotation is 90°/270°
- The width/height inputs update to reflect the swapped dimensions when rotate changes
- Add `transform` to the estimate effect dependency array so estimates account for rotation

## 2. Crop tool

**New file:** `src/components/CropTool.tsx`
- Shows the original image with a draggable, resizable selection rectangle overlaid
- Selection box has 8 resize handles (corners + edges) plus drag-to-move
- Outputs crop coordinates in **original image pixel space** (scaled from display size)
- Buttons: "Apply crop" and "Reset crop"
- Touch-friendly (pointer events, not just mouse)

**State in `index.tsx`:**
```ts
const [crop, setCrop] = useState<{
  x: number; y: number; width: number; height: number;
} | null>(null);
```

**Changes to `src/lib/image-convert.ts`:**
- Add `crop?: { x: number; y: number; width: number; height: number }` to `ConvertOptions`
- In `drawToCanvas`, if `crop` is set, use `ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)` instead of drawing the full source

**Flow in `index.tsx`:**
- When crop is applied, update `width`/`height` to the crop dimensions and set `aspectRef.current` to the crop aspect ratio
- The crop region is extracted first, then rotation/flip is applied, then resize to target
- Reset crop in the `reset()` function
- Add `crop` to the estimate effect dependency array

**Order of operations in conversion pipeline:**
```
decode source → apply EXIF orientation → extract crop region → apply rotate/flip → scale to target → encode
```

## 3. AVIF output

**Changes to `src/lib/image-convert.ts`:**
- Add `'avif'` to the `OutputFormat` union type
- Add to lookup tables:
  - `FORMAT_LABELS.avif = "AVIF"`
  - `FORMAT_EXTENSIONS.avif = "avif"`
  - `FORMAT_MIME.avif = "image/avif"`
  - Add `'avif'` to `LOSSY_FORMATS` (AVIF is lossy)
- The existing `canvasToBlob` already handles any MIME type, so the encoding path works as-is

**Feature detection:**
- At module load (browser-only), test `canvas.toBlob(cb, 'image/avif', 0.5)` on a 1×1 canvas
- Export a `SUPPORTED_FORMATS` array that excludes AVIF when encoding isn't supported (Safari)
- `ConvertControls.tsx` iterates `SUPPORTED_FORMATS` instead of all `FORMAT_LABELS` keys

**Changes to `src/routes/index.tsx`:**
- Add `'avif'` to `ALPHA_FORMATS` (AVIF supports alpha channel)

## 4. Strip EXIF toggle

**State in `index.tsx`:**
```ts
const [stripExif, setStripExif] = useState(false);
```

**Changes to `src/lib/image-convert.ts`:**
- Add `stripExif?: boolean` to `ConvertOptions`
- In `convertImage`, change the JPEG EXIF injection:
  ```ts
  if (format === "jpeg" && !options.stripExif) {
    const exif = await readExifSegment(file);
    if (exif) blob = await injectExifIntoJpeg(blob, exif);
  }
  ```
- For non-JPEG formats, EXIF is already dropped by canvas re-encoding — no change needed

**UI in `ConvertControls.tsx`:**
- Add a `stripExif` prop and `setStripExif` callback
- Add a checkbox/toggle below the format dropdown, next to the existing metadata note:
  - Label: "Strip all metadata (EXIF, GPS, camera data)"
  - When checked, the metadata note text changes to indicate metadata will be removed
  - When unchecked (default), existing behavior is preserved

## 5. Before/after slider

**New file:** `src/components/BeforeAfterSlider.tsx`
- Takes `originalUrl`, `resultUrl`, and optional `originalSize`/`resultSize` for labels
- Both images rendered in the same container at `object-contain`
- A vertical divider line the user drags left/right
- Left side shows original, right side shows converted
- Uses `clip-path: inset(0 calc(100% - Xpx) 0 0)` on the top image to reveal based on slider position
- Pointer events for drag (works on touch + mouse)
- Label badges: "Original" (left) and "Converted" (right)

**Changes to `src/components/ConvertResult.tsx`:**
- Import and render `BeforeAfterSlider` above the metadata/download section
- Pass `originalUrl` (from a new prop) and `result.url`
- Keep the existing download button and metadata below the slider

**Changes to `src/routes/index.tsx`:**
- Pass `originalUrl={previewUrl}` to `ConvertResultCard`

## 6. HEIC input support

**New dependency:** `heic2any` (dynamically imported, browser-only — same pattern as other encoders)
```
bun add heic2any
```

**New file:** `src/lib/heic.ts`
```ts
export function isHeic(file: File): boolean {
  return /\.heic$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.heif$/i.test(file.name);
}

export async function convertHeicToPng(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/png" });
  const png = Array.isArray(blob) ? blob[0] : blob;
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([png], `${base}.png`, { type: "image/png" });
}
```

**Changes to `src/routes/index.tsx`:**
- In `handleFile`, after the image-type validation, check `isHeic(selected)`
- If HEIC, call `convertHeicToPng(selected)` to get a PNG File, then proceed with `readImageMeta` on the PNG
- Show a brief "Converting HEIC…" loading state during conversion

**Changes to `src/components/DropZone.tsx`:**
- Update `accept` attribute: `image/*,.tif,.tiff,.heic,.heif`
- Update supported-formats text: "PNG, JPG, WEBP, GIF, BMP, TIFF or HEIC"

**PWA impact:** `heic2any` is ~1.5 MB (WASM). Add it to the Workbox runtime caching for assets so it's cached after first use and available offline.

## Files created

| File | Purpose |
|------|---------|
| `src/components/ImageTransform.tsx` | Rotate & flip controls |
| `src/components/CropTool.tsx` | Visual crop selection overlay |
| `src/components/BeforeAfterSlider.tsx` | Draggable original vs. result comparison |
| `src/lib/heic.ts` | HEIC detection and conversion helpers |

## Files modified

| File | Changes |
|------|---------|
| `src/lib/image-convert.ts` | Add `transform`, `crop`, `stripExif` to `ConvertOptions`; add AVIF format; export `SUPPORTED_FORMATS`; apply transforms/crop in `drawToCanvas` |
| `src/routes/index.tsx` | Add transform/crop/stripExif state; wire up new components; HEIC handling in `handleFile`; pass `originalUrl` to result card; update `ALPHA_FORMATS` |
| `src/components/ConvertControls.tsx` | Strip EXIF toggle; use `SUPPORTED_FORMATS`; accept `stripExif`/`setStripExif` props |
| `src/components/ConvertResult.tsx` | Integrate `BeforeAfterSlider`; accept `originalUrl` prop |
| `src/components/DropZone.tsx` | Update accept attribute and format list text |
| `vite.config.ts` | No change expected (heic2any is small enough for precache, but may need runtime cache entry if >4MB) |

## Implementation order

1. AVIF support (smallest change — format tables + feature detection)
2. Strip EXIF toggle (small — one option + one toggle)
3. HEIC input (new file + handleFile change)
4. Rotate & flip (new component + drawToCanvas transforms + dimension handling)
5. Crop tool (most complex — new component with drag interaction + drawToCanvas crop)
6. Before/after slider (new component + result card integration)

## Testing

- Playwright: upload a test image, verify rotate/flip produces correct output dimensions
- Playwright: apply crop, verify output matches cropped region
- Playwright: verify AVIF appears in dropdown only in supporting browsers (Chromium)
- Playwright: verify strip EXIF toggle produces a JPEG without EXIF markers
- Playwright: verify before/after slider renders both images and divider is draggable
- Playwright: upload a HEIC file, verify it converts and processes normally
- Verify build is clean and PWA still works offline
