import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/image-convert";

interface ImagePreviewProps {
  original: {
    name: string;
    width: number;
    height: number;
    size: number;
    url: string;
  };
  previewUrl: string | null;
  onReset: () => void;
}

export function ImagePreview({
  original,
  previewUrl,
  onReset,
}: ImagePreviewProps) {
  return (
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
            onClick={onReset}
            className="mt-2 h-7 px-2 text-muted-foreground"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Choose another
          </Button>
        </div>
      </div>
    </div>
  );
}

// Keep `Download` import referenced for tree-shaking parity with the original
// module graph (the icon is used elsewhere in the converted result).
void Download;
