import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ImageTransformProps {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  onRotate: (direction: "left" | "right") => void;
  onFlip: (axis: "H" | "V") => void;
}

export function ImageTransform({
  rotate,
  flipH,
  flipV,
  onRotate,
  onFlip,
}: ImageTransformProps) {
  const hasTransform = rotate || flipH || flipV;

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <p className="text-sm font-medium">Rotate & flip</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onRotate("left")}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Rotate left
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRotate("right")}>
          <RotateCw className="mr-2 h-4 w-4" />
          Rotate right
        </Button>
        <Button
          variant={flipH ? "secondary" : "outline"}
          size="sm"
          onClick={() => onFlip("H")}
        >
          <FlipHorizontal className="mr-2 h-4 w-4" />
          Flip horizontal
        </Button>
        <Button
          variant={flipV ? "secondary" : "outline"}
          size="sm"
          onClick={() => onFlip("V")}
        >
          <FlipVertical className="mr-2 h-4 w-4" />
          Flip vertical
        </Button>
      </div>
      {hasTransform ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {rotate ? `Rotated ${rotate}°` : ""}
          {flipH ? " · Flipped horizontally" : ""}
          {flipV ? " · Flipped vertically" : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Rotation and flips are applied to the converted image.
        </p>
      )}
    </div>
  );
}
