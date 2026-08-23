/**
 * Minimal EXIF helpers used to preserve metadata across conversions.
 *
 * Canvas-based encoding always drops metadata, so for JPEG output we lift the
 * original APP1/Exif segment out of the source file and splice it back into the
 * encoded JPEG. Orientation is rewritten to 1 because the pixels are already
 * drawn upright (createImageBitmap bakes the rotation in).
 */

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** Returns the full APP1/Exif segment (marker + length + payload), or null. */
export function findExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (!isJpegBytes(bytes)) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    // SOS / EOI: no more metadata segments beyond this point.
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) break;
    if (marker === 0xe1) {
      const payloadStart = offset + 4;
      const isExif = EXIF_HEADER.every(
        (b, i) => bytes[payloadStart + i] === b,
      );
      if (isExif) return bytes.slice(offset, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Rewrites the Orientation tag (0x0112) to 1 in place, since the converted
 * pixels are already upright. Prevents viewers rotating the image twice.
 */
function normalizeOrientation(segment: Uint8Array): void {
  // segment: FF E1 <len hi> <len lo> "Exif\0\0" <TIFF header ...>
  const tiff = 10;
  if (segment.length < tiff + 8) return;
  const little = segment[tiff] === 0x49 && segment[tiff + 1] === 0x49;
  const view = new DataView(
    segment.buffer,
    segment.byteOffset,
    segment.byteLength,
  );
  const magic = view.getUint16(tiff + 2, little);
  if (magic !== 0x2a) return;
  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  if (ifd0 + 2 > segment.length) return;
  const count = view.getUint16(ifd0, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > segment.length) return;
    if (view.getUint16(entry, little) === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      return;
    }
  }
}

/** Splices an APP1/Exif segment into an encoded JPEG blob. */
export async function injectExifIntoJpeg(
  blob: Blob,
  segment: Uint8Array,
): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isJpegBytes(bytes)) return blob;

  const patched = segment.slice();
  normalizeOrientation(patched);

  // Insert after SOI, skipping an existing APP0 (JFIF) segment if present.
  let insertAt = 2;
  if (
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes.length > 5
  ) {
    insertAt = 4 + ((bytes[4]! << 8) | bytes[5]!);
  }

  const out = new Uint8Array(bytes.length + patched.length);
  out.set(bytes.subarray(0, insertAt), 0);
  out.set(patched, insertAt);
  out.set(bytes.subarray(insertAt), insertAt + patched.length);
  return new Blob([out.buffer as ArrayBuffer], { type: "image/jpeg" });
}

/** Reads the source file's EXIF segment when it is a JPEG, else null. */
export async function readExifSegment(file: File): Promise<Uint8Array | null> {
  const looksJpeg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  if (!looksJpeg) return null;
  try {
    const head = new Uint8Array(
      await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer(),
    );
    return findExifSegment(head);
  } catch {
    return null;
  }
}
