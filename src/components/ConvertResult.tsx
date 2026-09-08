import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import {
  formatBytes,
  FORMAT_LABELS,
  type ConvertResult,
  type OutputFormat,
} from "@/lib/image-convert";

interface ConvertResultCardProps {
  result: ConvertResult;
  format: OutputFormat;
  original: { size: number } | null;
  downloadName: string;
  originalUrl: string | null;
}

export function ConvertResultCard({
  result,
  format,
  original,
  downloadName,
  originalUrl,
}: ConvertResultCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {originalUrl && (
        <div className="border-b p-4">
          <BeforeAfterSlider
            originalUrl={originalUrl}
            resultUrl={result.url}
          />
        </div>
      )}
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
  );
}
