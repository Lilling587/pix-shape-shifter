import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp } from "lucide-react";

import {
  convertImage,
  readImageMeta,
  FORMAT_EXTENSIONS,
  LOSSY_FORMATS,
  type OutputFormat,
  type ConvertResult,
} from "@/lib/image-convert";
import { DropZone } from "@/components/DropZone";
import { ImagePreview } from "@/components/ImagePreview";
import { ConvertControls } from "@/components/ConvertControls";
import { ConvertResultCard } from "@/components/ConvertResult";
import { BackgroundRemover } from "@/components/BackgroundRemover";

/** Output formats that keep an alpha channel. */
const ALPHA_FORMATS: OutputFormat[] = ["png", "webp", "tiff"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Image size & format converter" },
      {
        name: "description",
        content:
          "Resize an image and convert it to JPG, PNG, WEBP, GIF, BMP or TIFF — right in your browser. Free, private, no upload.",
      },
      { property: "og:title", content: "Image size & format converter" },
      {
        property: "og:description",
        content:
          "Resize and convert images to JPG, PNG, WEBP, GIF, BMP or TIFF in your browser. Private, no upload.",
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
        const res = await convertImage(workingFile, {
          width: w,
          height: h,
          format,
          quality,
        });
        URL.revokeObjectURL(res.url);
        if (seq !== estimateSeq.current) return; // a newer estimate is running
        setEstimatedSize(res.size);
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
  }, [workingFile, width, height, format, quality]);

  const handleFile = useCallback(
    async (selected: File) => {
      setError(null);
      setResult(null);
      if (!selected.type.startsWith("image/") && !/\.tiff?$/i.test(selected.name)) {
        setError("Please choose an image file (PNG, JPG, WEBP, GIF, BMP, TIFF).");
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
      } catch (e) {
        console.error(e);
        setError("Could not read that image. Try a different file.");
      }
    },
    [],
  );

  const onWidthChange = (value: string) => {
    setWidth(value);
    const w = Number(value);
    if (lockAspect && aspectRef.current > 0 && w > 0) {
      setHeight(String(Math.max(1, Math.round(w / aspectRef.current))));
    }
  };

  const onHeightChange = (value: string) => {
    setHeight(value);
    const h = Number(value);
    if (lockAspect && aspectRef.current > 0 && h > 0) {
      setWidth(String(Math.max(1, Math.round(h * aspectRef.current))));
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
  };

  const handleCutout = (blob: Blob) => {
    const base = (original?.name ?? "image").replace(/\.[^.]+$/, "") || "image";
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
    // Only PNG, WEBP and TIFF keep an alpha channel.
    if (!ALPHA_FORMATS.includes(format)) setFormat("png");
  };

  const runConvert = async () => {
    const w = Number(width);
    const h = Number(height);
    if (!workingFile || w < 1 || h < 1) return;
    setConverting(true);
    setError(null);
    try {
      const res = await convertImage(workingFile, {
        width: w,
        height: h,
        format,
        quality,
      });
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return res;
      });
      setEstimatedSize(res.size);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Conversion failed. Try another format.",
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
            Resize and convert an image to JPG, PNG, WEBP, GIF, BMP or TIFF —
            processed privately in your browser, nothing uploaded.
          </p>
        </header>

        {!original ? (
          <DropZone onFile={handleFile} />
        ) : (
          <div className="space-y-6">
            {/* Preview + original meta */}
            <ImagePreview
              original={original}
              previewUrl={previewUrl}
              onReset={reset}
            />

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
            />

            {/* Result */}
            {result && (
              <ConvertResultCard
                result={result}
                format={format}
                original={original}
                downloadName={downloadName}
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
