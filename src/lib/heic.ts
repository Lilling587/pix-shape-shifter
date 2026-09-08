/**
 * HEIC/HEIF input support.
 *
 * Browsers can't natively decode HEIC (the default iPhone camera format), so
 * we convert it to PNG client-side using heic2any. The library is imported
 * dynamically so it stays out of the SSR bundle.
 */

export function isHeic(file: File): boolean {
  return (
    /\.heic$/i.test(file.name) ||
    /\.heif$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

export async function convertHeicToPng(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/png" });
  const png = Array.isArray(result) ? result[0]! : result;
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([png], `${base}.png`, { type: "image/png" });
}
