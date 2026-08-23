import { Loader2, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  FORMAT_LABELS,
  MAX_DIMENSION,
  formatBytes,
  type OutputFormat,
} from "@/lib/image-convert";

interface ConvertControlsProps {
  width: string;
  height: string;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  lockAspect: boolean;
  setLockAspect: React.Dispatch<React.SetStateAction<boolean>>;
  format: OutputFormat;
  setFormat: (format: OutputFormat) => void;
  quality: number;
  setQuality: (quality: number) => void;
  onConvert: () => void;
  converting: boolean;
  error: string | null;
  isLossy: boolean;
  estimatedSize: number | null;
  estimating: boolean;
  /** True when a background-removed image is in use but the format has no alpha. */
  flattensTransparency?: boolean;
}

export function ConvertControls({
  width,
  height,
  onWidthChange,
  onHeightChange,
  lockAspect,
  setLockAspect,
  format,
  setFormat,
  quality,
  setQuality,
  onConvert,
  converting,
  error,
  isLossy,
  estimatedSize,
  estimating,
  flattensTransparency = false,
}: ConvertControlsProps) {
  return (
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
                max={MAX_DIMENSION}
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
                max={MAX_DIMENSION}
                value={height}
                onChange={(e) => onHeightChange(e.target.value)}
              />
            </div>
          </div>
                    <p className="mt-2 text-xs text-muted-foreground">
            Locking the aspect ratio keeps the image from stretching.
          </p>
          {(Number(width) > MAX_DIMENSION || Number(height) > MAX_DIMENSION) && (
            <p className="mt-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Maximum dimension is {MAX_DIMENSION.toLocaleString()}px. Larger values may crash your browser.
            </p>
          )}
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

          {/* Estimated output size, right below the dropdown */}
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {estimating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Estimating size…
              </>
            ) : estimatedSize != null ? (
              <>
                Estimated size: ~
                <span className="tabular-nums text-foreground">
                  {formatBytes(estimatedSize)}
                </span>
              </>
            ) : (
              "Estimated size will appear here."
            )}
          </p>

          {format === "gif" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Note: Animated GIFs will be converted as a single still frame.
            </p>
          )}
          {flattensTransparency && (
            <p className="mt-2 text-xs text-muted-foreground">
              Note: {FORMAT_LABELS[format]} has no transparency, so the removed
              background will be filled with white. Choose PNG, WEBP or TIFF to
              keep it transparent.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {format === "jpeg"
              ? "Photo metadata (EXIF: camera, date, GPS) is copied from the original, and rotation is applied to the pixels."
              : "Rotation from the original is applied to the pixels. EXIF metadata can only be carried over when the output is JPG."}
          </p>
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
          onClick={onConvert}
                    disabled={converting || Number(width) < 1 || Number(height) < 1 || Number(width) > MAX_DIMENSION || Number(height) > MAX_DIMENSION}
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

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
