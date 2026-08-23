import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatBytes,
  FORMAT_LABELS,
  type ConvertResult,
  type OutputFormat,
} from "@/lib/image-convert";

interface FormatComparisonProps {
  comparison: Partial<Record<OutputFormat, ConvertResult>>;
  comparing: boolean;
  width: string;
  height: string;
  original: { size: number } | null;
  result: ConvertResult | null;
  onUseFormat: (format: OutputFormat) => void;
}

export function FormatComparison({
  comparison,
  comparing,
  width,
  height,
  original,
  result,
  onUseFormat,
}: FormatComparisonProps) {
  if (!comparison || Object.keys(comparison).length === 0) return null;

  return (
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
                  onClick={() => onUseFormat(f)}
                  className="shrink-0"
                >
                  {isCurrent ? "Selected" : "Use"}
                </Button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
