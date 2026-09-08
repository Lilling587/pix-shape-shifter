import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";

import {
  convertImage,
  readImageMeta,
  FORMAT_EXTENSIONS,
  LOSSY_FORMATS,
  MAX_DIMENSION,
  type OutputFormat,
  type ConvertResult,
  type CropRegion,
  type TransformOptions,
} from "@/lib/image-convert";
import { isHeic, convertHeicToPng } from "@/lib/heic";
import { DropZone } from "@/components/DropZone";
import { ImagePreview } from "@/components/ImagePreview";
import { ConvertControls } from "@/components/ConvertControls";
import { ConvertResultCard } from "@/components/ConvertResult";
import { BackgroundRemover } from "@/components/BackgroundRemover";
import { ImageTransform } from "@/components/ImageTransform";
import { CropTool } from "@/components/CropTool";

/** Output formats that keep an alpha channel. */
const ALPHA_FORMATS: OutputFormat[] = ["png", "webp", "tiff", "avif"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Image size & format converter" },
      {
        name: "description",
        content:
          "Resize an image and convert it to JPG, PNG, WEBP, AVIF, GIF, BMP or TIFF — right in your browser. Free, private, no upload.",
      },
      { property: "og:title", content: "Image size & format converter" },
      {
        property: "og:description",
        content:
          "Resize and convert images to JPG, PNG, WEBP, AVIF, GIF, BMP or TIFF in your browser. Private, no upload.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

interface OriginalMeta {
  width: number;
  height: number;
  size: number;
  name: string;
  url: string;
}

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<OriginalMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [heicConverting, setHeicConverting] = useState(false);

  // Background-removal result, and whether it feeds the conversion pipeline.
  const [cutout, setCutout] = useState<{
    file: File;
    url: string;
    size: number;
  } | null>(null);
  const [useCutout, setUseCutout] = useState(false);

  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [lockAspect, setLockAspect] = useState(true);
  const [format, setFormat] = useState<OutputFormat>("webp");
  const [quality, setQuality] = useState<number>(80);

  // Transform (rotate & flip) and crop state.
  const [transform, setTransform] = useState<TransformOptions>({
    rotate: 0,
    flipH: false,
    flipV: false,
  });
  const [crop, setCrop] = useState<CropRegion | null>(null);
  const [stripExif, setStripExif] = useState(false);

  const [result, setResult] = useState<ConvertResult | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live estimated output size for the currently selected format/settings.
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);

  const aspectRef = useRef<number>(1);
  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimateSeq = useRef(0);

  // The image the converter actually reads: the cut-out when it's in use.
  const workingFile = useCutout && cutout ? cutout.file : file;
  // The preview URL for the working image (used by the crop tool).
  const workingUrl = useCutout && cutout ? cutout.url : previewUrl;

  // Clean up object URLs on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (result) URL.revokeObjectURL(result.url);
      if (estimateTimer.current) clearTimeout(estimateTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced background conversion to estimate the output file size.
  useEffect(() => {
    if (!workingFile) {
      setEstimatedSize(null);
      setEstimating(false);
      return;
    }
    const w = Number(width);
    const h = Number(height);
    if (w < 1 || h < 1) {
      setEstimatedSize(null);
      setEstimating(false);
      return;
    }
    if (estimateTimer.current) clearTimeout(estimateTimer.current);
    setEstimating(true);
    const seq = ++estimateSeq.current;
    estimateTimer.current = setTimeout(async () => {
      try {
        // Estimate at reduced resolution to avoid heavy encoding on large images.
        const targetPixels = w * h;
        const MAX_SAMPLE_PIXELS = 250_000;
        let sampleW = w;
        let sampleH = h;
        if (targetPixels > MAX_SAMPLE_PIXELS) {
          const scale = Math.sqrt(MAX_SAMPLE_PIXELS / targetPixels);
          sampleW = Math.max(1, Math.round(w * scale));
          sampleH = Math.max(1, Math.round(h * scale));
        }
        const samplePixels = sampleW * sampleH;

        const activeTransform =
          transform.rotate || transform.flipH || transform.flipV
            ? transform
            : undefined;

        const res = await convertImage(workingFile, {
          width: sampleW,
          height: sampleH,
          format,
          quality,
          ...(crop ? { crop } : {}),
          ...(activeTransform ? { transform: activeTransform } : {}),
          stripExif,
        });
        URL.revokeObjectURL(res.url);
        if (seq !== estimateSeq.current) return; // a newer estimate is running

        // Scale the sample size up proportionally to the full target dimensions.
        const estimated =
          targetPixels > MAX_SAMPLE_PIXELS
            ? Math.round((res.size / samplePixels) * targetPixels)
            : res.size;
        setEstimatedSize(estimated);
      } catch {
        if (seq !== estimateSeq.current) return;
        setEstimatedSize(null);
      } finally {
        if (seq === estimateSeq.current) setEstimating(false);
      }
    }, 350);
    return () => {
      if (estimateTimer.current) clearTimeout(estimateTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workingFile,
    width,
    height,
    format,
    quality,
    crop,
    transform,
    stripExif,
  ]);

  const handleFile = useCallback(async (selected: File) => {
    setError(null);
    setResult(null);

    // Convert HEIC/HEIF (iPhone) to PNG before processing.
    if (isHeic(selected)) {
      setHeicConverting(true);
      try {
        selected = await convertHeicToPng(selected);
      } catch (e) {
        console.error(e);
        setError(
          "Could not convert this HEIC file. Try converting it to JPG or PNG first.",
        );
        setHeicConverting(false);
        return;
      }
      setHeicConverting(false);
    }

    if (
      !selected.type.startsWith("image/") &&
      !/\.tiff?$/i.test(selected.name)
    ) {
      setError(
        "Please choose an image file (PNG, JPG, WEBP, GIF, BMP, TIFF, HEIC).",
      );
      return;
    }
    try {
      const meta = await readImageMeta(selected);
      const url = URL.createObjectURL(selected);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setFile(selected);
      setOriginal({ ...meta, url });
      setWidth(String(meta.width));
      setHeight(String(meta.height));
      aspectRef.current = meta.width / meta.height;
      // Reset transform and crop for the new image.
      setTransform({ rotate: 0, flipH: false, flipV: false });
      setCrop(null);
    } catch (e) {
      console.error(e);
      setError("Could not read that image. Try a different file.");
    }
  }, []);

  const onWidthChange = (value: string) => {
    setWidth(value);
    const w = Number(value);
    if (lockAspect && aspectRef.current > 0 && w > 0) {
      setHeight(
        String(
          Math.min(
            MAX_DIMENSION,
            Math.max(1, Math.round(w / aspectRef.current)),
          ),
        ),
      );
    }
  };

  const onHeightChange = (value: string) => {
    setHeight(value);
    const h = Number(value);
    if (lockAspect && aspectRef.current > 0 && h > 0) {
      setWidth(
        String(
          Math.min(
            MAX_DIMENSION,
            Math.max(1, Math.round(h * aspectRef.current)),
          ),
        ),
      );
    }
  };

  const handleRotate = (direction: "left" | "right") => {
    const delta = direction === "right" ? 90 : -90;
    const newRotate = ((transform.rotate + delta + 360) % 360) as
      | 0
      | 90
      | 180
      | 270;
    const wasSwapped = transform.rotate === 90 || transform.rotate === 270;
    const isSwapped = newRotate === 90 || newRotate === 270;
    setTransform((prev) => ({ ...prev, rotate: newRotate }));
    if (wasSwapped !== isSwapped) {
      // Rotation crossed the 90°/270° boundary — swap width and height.
      const w = width;
      const h = height;
      setWidth(h);
      setHeight(w);
      aspectRef.current = 1 / aspectRef.current;
    }
  };

  const handleFlip = (axis: "H" | "V") => {
    setTransform((prev) => ({
      ...prev,
      flipH: axis === "H" ? !prev.flipH : prev.flipH,
      flipV: axis === "V" ? !prev.flipV : prev.flipV,
    }));
  };

  const handleCropApply = (region: CropRegion) => {
    setCrop(region);
    const swapped = transform.rotate === 90 || transform.rotate === 270;
    if (swapped) {
      setWidth(String(region.height));
      setHeight(String(region.width));
    } else {
      setWidth(String(region.width));
      setHeight(String(region.height));
    }
    aspectRef.current = region.width / region.height;
  };

  const handleCropReset = () => {
    setCrop(null);
    if (original) {
      const swapped =
        transform.rotate === 90 || transform.rotate === 270;
      const baseW = swapped ? original.height : original.width;
      const baseH = swapped ? original.width : original.height;
      setWidth(String(baseW));
      setHeight(String(baseH));
      aspectRef.current = original.width / original.height;
    }
  };

  const reset = () => {
    setFile(null);
    setOriginal(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    if (cutout) URL.revokeObjectURL(cutout.url);
    setCutout(null);
    setUseCutout(false);
    setEstimatedSize(null);
    setEstimating(false);
    setError(null);
    setTransform({ rotate: 0, flipH: false, flipV: false });
    setCrop(null);
    setStripExif(false);
  };

  const handleCutout = (blob: Blob) => {
    const base =
      (original?.name ?? "image").replace(/\.[^.]+$/, "") || "image";
    const cutFile = new File([blob], `${base}-no-background.png`, {
      type: "image/png",
    });
    const url = URL.createObjectURL(blob);
    setCutout((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file: cutFile, url, size: blob.size };
    });
  };

  const useCutoutForConversion = () => {
    setUseCutout(true);
    // Only formats with an alpha channel keep transparency.
    if (!ALPHA_FORMATS.includes(format)) setFormat("png");
  };

  const runConvert = async () => {
    const w = Number(width);
    const h = Number(height);
    if (!workingFile || w < 1 || h < 1) return;
    setConverting(true);
    setError(null);
    try {
      const activeTransform =
        transform.rotate || transform.flipH || transform.flipV
          ? transform
          : undefined;

      const res = await convertImage(workingFile, {
        width: w,
        height: h,
        format,
        quality,
        ...(crop ? { crop } : {}),
        ...(activeTransform ? { transform: activeTransform } : {}),
        stripExif,
      });
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return res;
      });
      setEstimatedSize(res.size);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Conversion failed. Try another format.",
      );
    } finally {
      setConverting(false);
    }
  };

  const downloadName = (() => {
    if (!original) return "image";
    const base = original.name.replace(/\.[^.]+$/, "") || "image";
    return `${base}.${FORMAT_EXTENSIONS[format]}`;
  })();

  const isLossy = LOSSY_FORMATS.includes(format);
  const flattensTransparency = useCutout && !ALPHA_FORMATS.includes(format);
  const activeTransform =
    transform.rotate || transform.flipH || transform.flipV
      ? transform
      : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ImageUp className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Image size & format converter
          </h1>
          <p className="mt-3 text-muted-foreground">
            Resize, crop, rotate and convert an image to JPG, PNG, WEBP, AVIF,
            GIF, BMP or TIFF — processed privately in your browser, nothing
            uploaded.
          </p>
        </header>

        {heicConverting && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Converting HEIC to PNG…
          </div>
        )}

        {!original ? (
          <DropZone onFile={handleFile} />
        ) : (
          <div className="space-y-6">
            {/* Preview + original meta */}
            <ImagePreview
              original={original}
              previewUrl={previewUrl}
              onReset={reset}
              transform={transform}
            />

            {/* Rotate & flip */}
            <ImageTransform
              rotate={transform.rotate}
              flipH={transform.flipH}
              flipV={transform.flipV}
              onRotate={handleRotate}
              onFlip={handleFlip}
            />

            {/* Background removal */}
            {file && (
              <BackgroundRemover
                file={file}
                originalUrl={previewUrl}
                originalName={original.name}
                cutout={cutout}
                onCutout={handleCutout}
                isCutoutInUse={useCutout}
                onUseForConversion={useCutoutForConversion}
              />
            )}

            {/* Crop tool */}
            {workingUrl && original && (
              <CropTool
                imageUrl={workingUrl}
                imageWidth={original.width}
                imageHeight={original.height}
                onApply={handleCropApply}
                onReset={handleCropReset}
                applied={crop !== null}
              />
            )}

            {/* Controls */}
            <ConvertControls
              width={width}
              height={height}
              onWidthChange={onWidthChange}
              onHeightChange={onHeightChange}
              lockAspect={lockAspect}
              setLockAspect={setLockAspect}
              format={format}
              setFormat={setFormat}
              quality={quality}
              setQuality={setQuality}
              onConvert={runConvert}
              converting={converting}
              error={error}
              isLossy={isLossy}
              estimatedSize={estimatedSize}
              estimating={estimating}
              flattensTransparency={flattensTransparency}
              stripExif={stripExif}
              setStripExif={setStripExif}
            />

            {/* Result */}
            {result && (
              <ConvertResultCard
                result={result}
                format={format}
                original={original}
                downloadName={downloadName}
                originalUrl={workingUrl}
              />
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          All processing happens locally in your browser. Your image is never
          uploaded to a server.
        </footer>
      </div>
    </div>
  );
}
