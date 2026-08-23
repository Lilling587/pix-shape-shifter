import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, Download, RefreshCw, Lock, Unlock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  convertImage,
  readImageMeta,
  formatBytes,
  FORMAT_LABELS,
  FORMAT_EXTENSIONS,
  LOSSY_FORMATS,
  type OutputFormat,
  type ConvertResult,
} from "@/lib/image-convert";

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

  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [lockAspect, setLockAspect] = useState(true);
  const [format, setFormat] = useState<OutputFormat>("webp");
  const [quality, setQuality] = useState<number>(80);

  const [result, setResult] = useState<ConvertResult | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [comparison, setComparison] = useState<
    Partial<Record<OutputFormat, ConvertResult>>
  | null>(null);
  const [comparing, setComparing] = useState(false);

  const aspectRef = useRef<number>(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const comparisonRef = useRef<Partial<Record<OutputFormat, ConvertResult>>>({});

  // Clean up object URLs on change/unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (result) URL.revokeObjectURL(result.url);
      for (const k of Object.keys(comparisonRef.current)) {
        const r = comparisonRef.current[k as OutputFormat];
        if (r) URL.revokeObjectURL(r.url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  const reset = () => {
    setFile(null);
    setOriginal(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    for (const k of Object.keys(comparisonRef.current)) {
      const r = comparisonRef.current[k as OutputFormat];
      if (r && (!result || r.url !== result.url)) URL.revokeObjectURL(r.url);
    }
    comparisonRef.current = {};
    setComparison(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const runConvert = async () => {
    const w = Number(width);
    const h = Number(height);
    if (!file || w < 1 || h < 1) return;
    setConverting(true);
    setError(null);
    try {
      const res = await convertImage(file, {
        width: w,
        height: h,
        format,
        quality,
      });
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return res;
      });
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

  const compareAll = async () => {
    const w = Number(width);
    const h = Number(height);
    if (!file || w < 1 || h < 1) return;
    setComparing(true);
    setError(null);
    // Revoke previous comparison URLs (keep the one shown as the result).
    for (const k of Object.keys(comparisonRef.current)) {
      const r = comparisonRef.current[k as OutputFormat];
      if (r && (!result || r.url !== result.url)) URL.revokeObjectURL(r.url);
    }
    comparisonRef.current = {};
    setComparison({});
    try {
      const formats = Object.keys(FORMAT_LABELS) as OutputFormat[];
      for (const f of formats) {
        try {
          const res = await convertImage(file, {
            width: w,
            height: h,
            format: f,
            quality,
          });
          comparisonRef.current[f] = res;
          setComparison({ ...comparisonRef.current });
        } catch (e) {
          // Skip a format that fails to encode.
        }
      }
    } finally {
      setComparing(false);
    }
  };

  const useComparison = (f: OutputFormat) => {
    const res = comparisonRef.current[f];
    if (!res) return;
    setFormat(f);
    setResult((prev) => {
      if (prev && prev.url !== res.url) URL.revokeObjectURL(prev.url);
      return res;
    });
  };

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
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.tif,.tiff"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <ImageUp className="h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">
              Drop an image here, or click to choose
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              PNG, JPG, WEBP, GIF, BMP or TIFF
            </p>
          </label>
        ) : (
          <div className="space-y-6">
            {/* Preview + original meta */}
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={original.name}
                      className="max-h-56 w-auto rounded-md object-contain"
                    />
                  )}
                </div>
                <div className="space-y-1 text-sm sm:w-52">
                  <p className="truncate font-medium" title={original.name}>
                    {original.name}
                  </p>
                  <p className="text-muted-foreground">
                    {original.width} × {original.height}px
                  </p>
                  <p className="text-muted-foreground">
                    {formatBytes(original.size)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="mt-2 h-7 px-2 text-muted-foreground"
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Choose another
                  </Button>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="rounded-2xl border bg-card p-4 sm:p-6">
              <div className="grid gap-5">
                {/* Dimensions */}
                <div>
                  <Label className="text-sm font-medium">Dimensions</Label>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
                    <div className="min-w-0">
                      <Label htmlFor="w" className="mb-1 block text-xs text-muted-foreground">
                        Width (px)
                      </Label>
                      <Input
                        id="w"
                        type="number"
                        min={1}
                        value={width}
                        onChange={(e) => onWidthChange(e.target.value)}
                      />
                    </div>
                    <div className="flex h-9 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => setLockAspect((v) => !v)}
                        title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                      >
                        {lockAspect ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <Unlock className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="h" className="mb-1 block text-xs text-muted-foreground">
                        Height (px)
                      </Label>
                      <Input
                        id="h"
                        type="number"
                        min={1}
                        value={height}
                        onChange={(e) => onHeightChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Locking the aspect ratio keeps the image from stretching.
                  </p>
                </div>

                <Separator />

                {/* Format */}
                <div>
                  <Label className="text-sm font-medium">Output format</Label>
                  <Select
                    value={format}
                    onValueChange={(v) => setFormat(v as OutputFormat)}
                  >
                    <SelectTrigger className="mt-3 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FORMAT_LABELS) as OutputFormat[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {FORMAT_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quality (lossy only) */}
                <div className={cn("transition-opacity", isLossy ? "opacity-100" : "opacity-40")}>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Quality</Label>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {quality}
                    </span>
                  </div>
                  <Slider
                    disabled={!isLossy}
                    value={[quality]}
                    onValueChange={(v) => setQuality(v[0] ?? 80)}
                    min={1}
                    max={100}
                    step={1}
                    className="mt-3"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isLossy
                      ? "Lower quality means smaller file size."
                      : "Quality only applies to JPG and WEBP (lossless formats ignore it)."}
                  </p>
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  onClick={runConvert}
                  disabled={converting || Number(width) < 1 || Number(height) < 1}
                >
                  {converting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Converting…
                    </>
                  ) : (
                    "Convert image"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={compareAll}
                  disabled={
                    comparing ||
                    converting ||
                    Number(width) < 1 ||
                    Number(height) < 1
                  }
                >
                  {comparing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Comparing…
                    </>
                  ) : (
                    "Compare all formats"
                  )}
                </Button>

                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* Format comparison */}
            {comparison && Object.keys(comparison).length > 0 && (
              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="border-b p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">Format comparison</h2>
                    {comparing && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimated output at {Number(width) || 0} × {Number(height) || 0}px — sorted smallest first.
                  </p>
                </div>
                <ul className="divide-y">
                  {(Object.keys(comparison) as OutputFormat[])
                    .filter((f) => comparison[f])
                    .sort((a, b) => comparison[a]!.size - comparison[b]!.size)
                    .map((f) => {
                      const r = comparison[f]!;
                      const isCurrent = result?.url === r.url;
                      return (
                        <li
                          key={f}
                          className="flex items-center gap-3 p-3 sm:p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{FORMAT_LABELS[f]}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatBytes(r.size)}
                              {original && (
                                <span className="ml-1">
                                  · {Math.round((r.size / original.size) * 100)}% of original
                                </span>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={isCurrent ? "secondary" : "outline"}
                            disabled={isCurrent}
                            onClick={() => useComparison(f)}
                            className="shrink-0"
                          >
                            {isCurrent ? "Selected" : "Use"}
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2">
                    <img
                      src={result.url}
                      alt="Converted result"
                      className="max-h-56 w-auto rounded-md object-contain"
                    />
                  </div>
                  <div className="space-y-1 text-sm sm:w-52">
                    <p className="font-medium">{FORMAT_LABELS[format]} result</p>
                    <p className="text-muted-foreground">
                      {result.width} × {result.height}px
                    </p>
                    <p className="text-muted-foreground">
                      {formatBytes(result.size)}
                      {original && (
                        <span className="ml-1 text-xs">
                          ({Math.round((result.size / original.size) * 100)}% of original)
                        </span>
                      )}
                    </p>
                    <Button asChild className="mt-2 w-full">
                      <a href={result.url} download={downloadName}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
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
