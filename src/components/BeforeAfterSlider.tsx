import { useRef, useState, useCallback } from "react";
import { ChevronsLeftRight } from "lucide-react";

interface BeforeAfterSliderProps {
  originalUrl: string;
  resultUrl: string;
}

export function BeforeAfterSlider({
  originalUrl,
  resultUrl,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-ew-resize select-none overflow-hidden rounded-lg bg-muted/40"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      {/* Result (bottom layer, full width) */}
      <img
        src={resultUrl}
        alt="Converted"
        className="block max-h-64 w-full object-contain"
        draggable={false}
      />
      {/* Original (top layer, clipped from the right) */}
      <img
        src={originalUrl}
        alt="Original"
        className="absolute inset-0 h-full max-h-64 w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      {/* Divider line + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white"
        style={{ left: `${position}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/40">
          <ChevronsLeftRight className="h-4 w-4 text-white" />
        </div>
      </div>
      {/* Labels */}
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        Original
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        Converted
      </span>
    </div>
  );
}
