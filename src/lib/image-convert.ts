import { encodeBMP } from "./bmp-encoder";
import { injectExifIntoJpeg, readExifSegment } from "./exif";

// `utif` resolves pako via require() under Node, or via `self.pako` in the
// browser. These packages are imported dynamically so they stay out of the
// server-side render bundle (they only ever run in browser event handlers).
async function loadUTIF() {
  if (typeof window !== "undefined") {
    const w = window as unknown as { pako?: unknown };
    if (!w.pako) w.pako = (await import("pako")).default;
  }
  return (await import("utif")).default;
}

async function loadGifenc() {
  return await import("gifenc");
}

export type OutputFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "tiff"
  | "avif";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WEBP",
  gif: "GIF",
  bmp: "BMP",
  tiff: "TIFF",
  avif: "AVIF",
};

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  bmp: "bmp",
  tiff: "tiff",
  avif: "avif",
};

export const FORMAT_MIME: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  avif: "image/avif",
};

/** Formats that support lossy quality compression. */
export const LOSSY_FORMATS: OutputFormat[] = ["jpeg", "webp", "avif"];

/** All known output formats, in dropdown order. */
export const ALL_FORMATS = Object.keys(FORMAT_LABELS) as OutputFormat[];

/**
 * Synchronously checks whether the browser can encode AVIF via canvas.toDataURL.
 * Returns false during SSR (no document) and on browsers without AVIF encoding
 * (e.g. Safari), so the format dropdown can hide AVIF when unsupported.
 */
export function isAvifSupported(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/avif").startsWith("data:image/avif");
  } catch {
    return false;
  }
}

/** Maximum allowed width or height in pixels. Beyond this, browsers crash trying to allocate canvas memory. */
export const MAX_DIMENSION = 10000;

export interface TransformOptions {
  /** Rotation in degrees: 0, 90, 180, or 270. */
  rotate: number;
  flipH: boolean;
  flipV: boolean;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConvertOptions {
  width: number;
  height: number;
  format: OutputFormat;
  /** 0–100, only used for lossy formats. */
  quality: number;
  /** Crop region in original image pixel coordinates, applied before transform. */
  crop?: CropRegion;
  /** Rotation and flip, applied after crop and before resize. */
  transform?: TransformOptions;
  /** When true, EXIF metadata is not spliced into JPEG output. */
  stripExif?: boolean;
}

export interface ConvertResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  size: number;
}

interface DecodedSource {
  /** Bitmap for natively-decodable formats (png/jpg/webp/gif/bmp/svg). */
  bitmap: ImageBitmap | null;
  /** Pre-decoded RGBA for TIFF (browsers can't decode TIFF). */
  rgba: Uint8ClampedArray | null;
  /** Raw (pre-rotation) size of the RGBA buffer, TIFF only. */
  rawWidth: number;
  rawHeight: number;
  /** EXIF/TIFF orientation (1–8) still to be applied to `rgba`. */
  orientation: number;
  /** Upright dimensions. */
  width: number;
  height: number;
}

function isTiff(file: File): boolean {
  return (
    /\.tiff?$/i.test(file.name) ||
    file.type === "image/tiff" ||
    file.type === "image/tif"
  );
}

async function decodeSource(file: File): Promise<DecodedSource> {
  if (isTiff(file)) {
    const UTIF = await loadUTIF();
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const ifds = UTIF.decode(bytes);
    const ifd = ifds[0];
    if (!ifd) throw new Error("Could not read TIFF file.");
    UTIF.decodeImage(bytes, ifd, ifds);
    const rgba = UTIF.toRGBA8(ifd);
    // TIFF tag 274 = Orientation; utif does not apply it when decoding.
    const tag = (ifd as unknown as Record<string, number[] | undefined>)["t274"];
    const orientation = tag && tag[0] ? tag[0] : 1;
    const swap = orientation >= 5 && orientation <= 8;
    return {
      bitmap: null,
      rgba: new Uint8ClampedArray(rgba),
      rawWidth: ifd.width,
      rawHeight: ifd.height,
      orientation,
      width: swap ? ifd.height : ifd.width,
      height: swap ? ifd.width : ifd.height,
    };
  }

  // `from-image` bakes the EXIF orientation into the decoded pixels, so the
  // output always displays the right way up in every viewer.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  return {
    bitmap,
    rgba: null,
    rawWidth: bitmap.width,
    rawHeight: bitmap.height,
    orientation: 1,
    width: bitmap.width,
    height: bitmap.height,
  };
}

/** Draws a source canvas onto a new upright canvas per EXIF orientation. */
function applyOrientation(
  src: HTMLCanvasElement,
  orientation: number,
): HTMLCanvasElement {
  if (orientation <= 1 || orientation > 8) return src;
  const swap = orientation >= 5;
  const out = document.createElement("canvas");
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext("2d")!;
  const { width: w, height: h } = src;
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, w, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, w, h);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, h);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, h, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, h, w);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, w);
      break;
  }
  ctx.drawImage(src, 0, 0);
  return out;
}


/**
 * Draws a source (bitmap or RGBA) onto a target canvas, with optional crop and
 * transform applied before the final scale.
 *
 * Pipeline: decode → EXIF orientation → crop → rotate/flip → scale to target.
 */
function drawToCanvas(
  source: DecodedSource,
  width: number,
  height: number,
  flattenAlpha: boolean,
  crop?: CropRegion,
  transform?: TransformOptions,
): HTMLCanvasElement {
  // Step 1: Get source pixels onto a full-resolution canvas (with optional crop).
  let sourceCanvas: HTMLCanvasElement;

  if (source.bitmap) {
    if (crop) {
      sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = crop.width;
      sourceCanvas.height = crop.height;
      sourceCanvas
        .getContext("2d")!
        .drawImage(
          source.bitmap,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        );
    } else {
      sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = source.width;
      sourceCanvas.height = source.height;
      sourceCanvas.getContext("2d")!.drawImage(source.bitmap, 0, 0);
    }
  } else if (source.rgba) {
    // TIFF path: put raw RGBA onto a temp canvas, apply orientation tag.
    const tmp = document.createElement("canvas");
    tmp.width = source.rawWidth;
    tmp.height = source.rawHeight;
    const tmpCtx = tmp.getContext("2d")!;
    const imageData = tmpCtx.createImageData(source.rawWidth, source.rawHeight);
    imageData.data.set(source.rgba);
    tmpCtx.putImageData(imageData, 0, 0);
    const upright = applyOrientation(tmp, source.orientation);

    if (crop) {
      sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = crop.width;
      sourceCanvas.height = crop.height;
      sourceCanvas
        .getContext("2d")!
        .drawImage(
          upright,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        );
    } else {
      sourceCanvas = upright;
    }
  } else {
    throw new Error("No image data available.");
  }

  // Step 2: Create target canvas and draw with optional transform.
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  if (flattenAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const hasTransform =
    transform && (transform.rotate || transform.flipH || transform.flipV);

  if (hasTransform) {
    const { rotate, flipH, flipV } = transform!;
    const cw = canvas.width;
    const ch = canvas.height;
    // For 90°/270°, the drawing dimensions swap because the coordinate
    // system is rotated.
    const swapped = rotate === 90 || rotate === 270;
    const drawW = swapped ? ch : cw;
    const drawH = swapped ? cw : ch;

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    if (rotate) ctx.rotate((rotate * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(sourceCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to encode ${mime}.`));
      },
      mime,
      quality,
    );
  });
}

async function encodeGif(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
  const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  const gif = GIFEncoder();
  gif.writeHeader();
  gif.writeFrame(index, width, height, { palette });
  gif.finish();
  return gif.bytes();
}

export async function convertImage(
  file: File,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const { width, height, format, quality, crop, transform, stripExif } =
    options;
  const source = await decodeSource(file);

  // JPEG/BMP have no alpha channel — flatten transparency onto white.
  const flattenAlpha = format === "jpeg" || format === "bmp";
  const canvas = drawToCanvas(
    source,
    width,
    height,
    flattenAlpha,
    crop,
    transform,
  );
  const w = canvas.width;
  const h = canvas.height;

  let blob: Blob;
  switch (format) {
    case "jpeg":
    case "png":
    case "webp":
    case "avif": {
      const q = LOSSY_FORMATS.includes(format) ? Math.min(1, Math.max(0, quality / 100)) : undefined;
      blob = await canvasToBlob(canvas, FORMAT_MIME[format], q ?? 1);
      if (format === "jpeg" && !stripExif) {
        // Carry the original EXIF block (camera, date, GPS, colour info) over
        // to the new JPEG, with orientation reset since pixels are upright.
        const exif = await readExifSegment(file);
        if (exif) blob = await injectExifIntoJpeg(blob, exif);
      }
      break;

    }
    case "bmp": {
      const rgba = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const ab = encodeBMP(rgba, w, h);
      blob = new Blob([ab], { type: FORMAT_MIME.bmp });
      break;
    }
    case "gif": {
      const rgba = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const bytes = await encodeGif(rgba, w, h);
      blob = new Blob([bytes.buffer as ArrayBuffer], { type: FORMAT_MIME.gif });
      break;
    }
    case "tiff": {
      const rgba = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      const UTIF = await loadUTIF();
      const ab = UTIF.encodeImage(data, w, h);
      blob = new Blob([ab], { type: FORMAT_MIME.tiff });
      break;
    }
  }

  const url = URL.createObjectURL(blob);
  return { blob, url, width: w, height: h, size: blob.size };
}

/** Reads an image file's natural dimensions + size without converting. */
export async function readImageMeta(file: File): Promise<{
  width: number;
  height: number;
  size: number;
  name: string;
}> {
  const source = await decodeSource(file);
  return {
    width: source.width,
    height: source.height,
    size: file.size,
    name: file.name,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
