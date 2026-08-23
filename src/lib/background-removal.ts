/**
 * Background removal helpers.
 *
 * Local removal runs entirely in the browser via a WASM model, so the library is
 * imported dynamically inside the function (same pattern as the image encoders)
 * and never reaches the server-render bundle.
 */

export interface RemovalProgress {
  /** 0–1 when known, otherwise null (indeterminate). */
  ratio: number | null;
  label: string;
}

export async function removeBackgroundLocal(
  file: File | Blob,
  onProgress?: (progress: RemovalProgress) => void,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return await removeBackground(file, {
    output: { format: "image/png" },
    progress: (key: string, current: number, total: number) => {
      const downloading = key.startsWith("fetch");
      onProgress?.({
        ratio: total > 0 ? current / total : null,
        label: downloading
          ? "Downloading the model (one time only)…"
          : "Removing the background…",
      });
    },
  });
}

export async function removeBackgroundCloud(file: File | Blob): Promise<Blob> {
  const form = new FormData();
  form.append(
    "image",
    file,
    file instanceof File ? file.name : "image.png",
  );

  const res = await fetch("/api/remove-background", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(
      message.trim() ||
        "The higher-quality background removal is unavailable right now.",
    );
  }
  return await res.blob();
}
