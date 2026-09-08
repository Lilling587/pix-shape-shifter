import { useState } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFile: (file: File) => void;
}

export function DropZone({ onFile }: DropZoneProps) {
    const [dragging, setDragging] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
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
        type="file"
        accept="image/*,.tif,.tiff,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <ImageUp className="h-10 w-10 text-muted-foreground" />
      <p className="mt-4 text-lg font-medium">
        Drop an image here, or click to choose
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        PNG, JPG, WEBP, GIF, BMP, TIFF or HEIC
      </p>
    </label>
  );
}
