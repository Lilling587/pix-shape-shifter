import { useRef, useState, useCallback } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CropToolProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  onApply: (crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onReset: () => void;
  /** Whether a crop has been applied (disables the tool). */
  applied: boolean;
}

type DragMode =
  | "create"
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-se"
  | "resize-sw"
  | "resize-n"
  | "resize-e"
  | "resize-s"
  | "resize-w"
  | null;

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = 10;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

const HANDLE_STYLES: Record<string, React.CSSProperties> = {
  nw: { left: "-6px", top: "-6px", cursor: "nwse-resize" },
  n: {
    left: "50%",
    top: "-6px",
    transform: "translateX(-50%)",
    cursor: "ns-resize",
  },
  ne: { right: "-6px", top: "-6px", cursor: "nesw-resize" },
  e: {
    right: "-6px",
    top: "50%",
    transform: "translateY(-50%)",
    cursor: "ew-resize",
  },
  se: { right: "-6px", bottom: "-6px", cursor: "nwse-resize" },
  s: {
    left: "50%",
    bottom: "-6px",
    transform: "translateX(-50%)",
    cursor: "ns-resize",
  },
  sw: { left: "-6px", bottom: "-6px", cursor: "nesw-resize" },
  w: {
    left: "-6px",
    top: "50%",
    transform: "translateY(-50%)",
    cursor: "ew-resize",
  },
};

export function CropTool({
  imageUrl,
  imageWidth,
  imageHeight,
  onApply,
  onReset,
  applied,
}: CropToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const dragMode = useRef<DragMode>(null);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartSelection = useRef<Selection | null>(null);

  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    if (applied) return;
    e.stopPropagation();
    const pos = getRelativePos(e.clientX, e.clientY);
    dragMode.current = mode;
    dragStart.current = pos;
    containerRef.current?.setPointerCapture(e.pointerId);

    if (mode === "create") {
      dragStartSelection.current = null;
      setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 });
    } else if (selection) {
      dragStartSelection.current = { ...selection };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode.current) return;
    const pos = getRelativePos(e.clientX, e.clientY);
    const dx = pos.x - dragStart.current.x;
    const dy = pos.y - dragStart.current.y;
    const start = dragStartSelection.current;

    if (dragMode.current === "create") {
      setSelection({
        x: Math.min(dragStart.current.x, pos.x),
        y: Math.min(dragStart.current.y, pos.y),
        w: Math.abs(pos.x - dragStart.current.x),
        h: Math.abs(pos.y - dragStart.current.y),
      });
    } else if (dragMode.current === "move" && start) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setSelection({
        ...start,
        x: Math.max(0, Math.min(rect.width - start.w, start.x + dx)),
        y: Math.max(0, Math.min(rect.height - start.h, start.y + dy)),
      });
    } else if (dragMode.current?.startsWith("resize-") && start) {
      const handle = dragMode.current.replace("resize-", "");
      let { x, y, w, h } = start;
      const right = x + w;
      const bottom = y + h;

      if (handle.includes("w")) {
        x = Math.min(pos.x, right - MIN_SIZE);
        w = right - x;
      }
      if (handle.includes("e")) {
        w = Math.max(MIN_SIZE, pos.x - x);
      }
      if (handle.includes("n")) {
        y = Math.min(pos.y, bottom - MIN_SIZE);
        h = bottom - y;
      }
      if (handle.includes("s")) {
        h = Math.max(MIN_SIZE, pos.y - y);
      }
      setSelection({ x, y, w, h });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragMode.current) {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
    dragMode.current = null;
    setSelection((s) =>
      s && s.w < MIN_SIZE && s.h < MIN_SIZE ? null : s,
    );
  };

  const handleApply = () => {
    if (!selection || selection.w < MIN_SIZE || selection.h < MIN_SIZE) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scaleX = imageWidth / rect.width;
    const scaleY = imageHeight / rect.height;
    onApply({
      x: Math.round(selection.x * scaleX),
      y: Math.round(selection.y * scaleY),
      width: Math.round(selection.w * scaleX),
      height: Math.round(selection.h * scaleY),
    });
  };

  const handleClear = () => {
    setSelection(null);
    onReset();
  };

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Crop</p>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "relative mt-3 w-full overflow-hidden rounded-lg bg-muted/40",
          applied ? "pointer-events-none" : "cursor-crosshair",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => handlePointerDown(e, "create")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={imageUrl}
          alt="Crop target"
          className="block max-h-64 w-full object-contain"
          draggable={false}
        />

        {selection && !applied && (
          <div
            className="absolute border-2 border-primary"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.w,
              height: selection.h,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            }}
          >
            {/* Move area */}
            <div
              className="absolute inset-0 cursor-move"
              onPointerDown={(e) => handlePointerDown(e, "move")}
            />
            {/* Resize handles */}
            {HANDLES.map((handle) => (
              <div
                key={handle}
                className="absolute h-3 w-3 rounded-full border-2 border-primary bg-white"
                style={HANDLE_STYLES[handle]}
                onPointerDown={(e) =>
                  handlePointerDown(
                    e,
                    `resize-${handle}` as DragMode,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {!applied && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={handleApply}
            disabled={
              !selection || selection.w < MIN_SIZE || selection.h < MIN_SIZE
            }
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Apply crop
          </Button>
          {selection && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelection(null)}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {applied && (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Reset crop
          </Button>
          <p className="text-xs text-muted-foreground">
            Crop applied — dimensions updated to the selected region.
          </p>
        </div>
      )}
    </div>
  );
}
