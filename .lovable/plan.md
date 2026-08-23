# Why re-saving a PNG makes it bigger — and how to fix it

## What's happening

Nothing is broken. When you pick PNG output, the app draws your image onto a
canvas and asks the browser to write a brand-new PNG. The browser's PNG writer
is fast but not optimised: it doesn't try the smart filtering/compression tricks
that the tool which created your original file used. Same pixels, same 1024×1024
size — bigger file (349 KB in, ~500 KB out).

This is expected for any lossless re-encode (PNG, BMP, TIFF). It also means that
right now, converting a file to the format it already is can never be smaller
than the original.

## The fix: skip the re-encode when nothing changes

When the requested output is identical to the input — same format and same
width/height — return the original file bytes untouched. Then a 1024×1024 PNG in
gives you the same 349 KB PNG out, and the estimated size shown under the format
dropdown matches.

Rules for when the passthrough applies:

```text
input format == output format   AND   requested w/h == original w/h
  -> reuse original bytes (349 KB stays 349 KB)
otherwise
  -> normal canvas re-encode as today
```

One exception: JPG input to JPG output keeps the re-encode when the quality
slider is set below 100, since that is a deliberate compression request.

## Also worth adding

- A short muted note under the format dropdown when a lossless format (PNG, BMP,
  TIFF) is selected: PNG/BMP/TIFF are lossless, so the file can grow compared to
  the original. Use WEBP or JPG for a smaller file.
- The estimated-size line already reruns the real conversion, so it will pick up
  the passthrough automatically and show the true number.

## Technical details

- `src/lib/image-convert.ts` — add an input-format detector (from MIME type plus
  filename extension) and an early return in `convertImage` that wraps the
  original `File` as the result blob, using the real decoded dimensions. Keep the
  existing `ConvertResult` shape so nothing downstream changes.
- `src/components/ConvertControls.tsx` — add the lossless-format note next to the
  existing helper text, only for `png` / `bmp` / `tiff`.
- No change to `src/routes/index.tsx` state or handlers.

## Verification

- Load a 1024×1024 PNG, keep size and format: estimated and downloaded size both
  equal the original 349 KB.
- Change the width to 512 with PNG: normal re-encode, smaller file.
- PNG to WEBP at quality 80: clearly smaller than the original.
- JPG to JPG at quality 70: still re-encodes and shrinks.
