// Minimal 24-bit BMP encoder (bottom-up, BI_RGB). Pure browser/worker safe.
// Input: RGBA bytes from canvas getImageData().data.
export function encodeBMP(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ArrayBuffer {
  // Each row is 3 bytes per pixel, padded to a multiple of 4 bytes.
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // --- BITMAPFILEHEADER (14 bytes) ---
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // pixel data offset

  // --- BITMAPINFOHEADER (40 bytes) ---
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive => bottom-up rows
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // compression = BI_RGB
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true); // x pixels/meter (~72 DPI)
  view.setInt32(42, 2835, true); // y pixels/meter
  view.setUint32(46, 0, true); // colors in palette
  view.setUint32(50, 0, true); // important colors

  // --- Pixel data: bottom-up, BGR ---
  let offset = fileHeaderSize + infoHeaderSize;
  const src = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * 4;
      view.setUint8(offset++, src[i + 2]); // B
      view.setUint8(offset++, src[i + 1]); // G
      view.setUint8(offset++, src[i]); // R
    }
    // Row padding to 4-byte boundary.
    const pad = rowSize - width * 3;
    for (let p = 0; p < pad; p++) view.setUint8(offset++, 0);
  }

  return buf;
}
