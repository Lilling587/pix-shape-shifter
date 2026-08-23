import { useState } from "react";
import { Download, Loader2, Scissors, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/image-convert";
import {
  removeBackgroundLocal,
  type RemovalProgress,
} from "@/lib/background-removal";

interface BackgroundRemoverProps {
  /** The originally uploaded file. */
  file: File;
  originalUrl: string | null;
  originalName: string;
  cutout: { url: string; size: number } | null;
  onCutout: (blob: Blob) => void;
  isCutoutInUse: boolean;
  onUseForConversion: () => void;
}

const CHECKERBOARD =
  "bg-[image:linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%),linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]";

export function BackgroundRemover({
  file,
  originalUrl,
  originalName,
  cutout,
  onCutout,
  isCutoutInUse,
  onUseForConversion,
}: BackgroundRemoverProps) {
    const [busy, setBusy] = useState<null | "local">(null);
  const [progress, setProgress] = useState<RemovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLocal = async () => {
    setBusy("local");
    setError(null);
    setProgress({ ratio: null, label: "Preparing…" });
    try {
      const blob = await removeBackgroundLocal(file, setProgress);
      onCutout(blob);
    } catch (e) {
      console.error(e);
      setError(
        "Background removal failed on this device. Try the higher-quality option instead.",
      );
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  

  const downloadName = `${originalName.replace(/\.[^.]+$/, "") || "image"}-no-background.png`;

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Scissors className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Remove background</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs on your device, so the image stays private. The first run
            downloads a small model (about 25 MB) and is cached after that.
          </p>
        </div>
      </div>

            <div className="mt-4">
        <Button onClick={runLocal} disabled={busy !== null}>
          {busy === "local" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Working…
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Remove background
            </>
          )}
        </Button>
              </div>

      {busy === "local" && progress && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {progress.label}
          {progress.ratio != null && (
            <span className="tabular-nums">
              {Math.round(progress.ratio * 100)}%
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {cutout && (
        <div className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Original</p>
              <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2">
                {originalUrl && (
                  <img
                    src={originalUrl}
                    alt={originalName}
                    className="max-h-full w-auto rounded-md object-contain"
                  />
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Background removed · {formatBytes(cutout.size)}
              </p>
              <div
                className={`flex h-40 items-center justify-center overflow-hidden rounded-lg border p-2 ${CHECKERBOARD}`}
              >
                <img
                  src={cutout.url}
                  alt="Subject with the background removed"
                  className="max-h-full w-auto object-contain"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline">
              <a href={cutout.url} download={downloadName}>
                <Download className="mr-2 h-4 w-4" />
                Download PNG
              </a>
            </Button>
            <Button
              variant={isCutoutInUse ? "secondary" : "default"}
              onClick={onUseForConversion}
              disabled={isCutoutInUse}
            >
              {isCutoutInUse ? "Used for conversion" : "Use this for conversion"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
