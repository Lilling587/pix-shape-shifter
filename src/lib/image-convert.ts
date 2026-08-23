import pako from "pako";
import UTIF from "utif";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { encodeBMP } from "./bmp-encoder";

// `utif` resolves pako via require() under Node, or via `self.pako` in the
// browser. Make it available on the global so browser encode/decode works.
if (typeof window !== "undefined") {
  (window as unknown as { pako?: unknown }).pako ??= pako;
}

export type OutputFormat = "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WEBP",
  gif: "GIF",
  bmp: "BMP",
  tiff: "TIFF",
};

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  bmp: "bmp",
  tiff: "tiff",
};

export const FORMAT_MIME: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
};

/** Formats that support lossy quality compression. */
export const LOSSY_FORMATS: OutputFormat[] = ["jpeg", "webp"];

export interface ConvertOptions {
  width: number;
  height: number;
  format: OutputFormat;
  /** 0–100, only used for lossy formats. */
  quality: number;
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
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const ifds = UTIF.decode(bytes);
    if (!ifds.length) throw new Error("Could not read TIFF file.");
    UTIF.decodeImage(bytes, ifds[0], ifds);
    const rgba = UTIF.toRGBA8(ifds[0]);
    return {
      bitmap: null,
      rgba: new Uint8ClampedArray(rgba),
      width: ifds[0].width,
      height: ifds[0].height,
    };
  }

  const bitmap = await createImageBitmap(file);
  return {
    bitmap,
    rgba: null,
    width: bitmap.width,
    height: bitmap.height,
  };
}

function drawToCanvas(
  source: DecodedSource,
  width: number,
  height: number,
  flattenAlpha: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  if (flattenAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (source.bitmap) {
    ctx.drawImage(source.bitmap, 0, 0, canvas.width, canvas.height);
  } else if (source.rgba) {
    // TIFF path: put raw RGBA onto a temp canvas, then scale-draw to target.
    const tmp = document.createElement("canvas");
    tmp.width = source.width;
    tmp.height = source.height;
    tmp.getContext("2d")!.putImageData(
      new ImageData(source.rgba, source.width, source.height),
      0,
      0,
    );
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
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

function encodeGif(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
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
  const { width, height, format, quality } = options;
  const source = await decodeSource(file);

  // JPEG/BMP have no alpha channel — flatten transparency onto white.
  const flattenAlpha = format === "jpeg" || format === "bmp";
  const canvas = drawToCanvas(source, width, height, flattenAlpha);
  const w = canvas.width;
  const h = canvas.height;

  let blob: Blob;
  switch (format) {
    case "jpeg":
    case "png":
    case "webp": {
      const q = LOSSY_FORMATS.includes(format) ? Math.min(1, Math.max(0, quality / 100)) : undefined;
      blob = await canvasToBlob(canvas, FORMAT_MIME[format], q ?? 1);
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
      const bytes = encodeGif(rgba, w, h);
      blob = new Blob([bytes], { type: FORMAT_MIME.gif });
      break;
    }
    case "tiff": {
      const rgba = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
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
