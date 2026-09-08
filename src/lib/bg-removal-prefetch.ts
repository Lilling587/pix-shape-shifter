/**
 * Idle-time warmup for the on-device background remover.
 *
 * The removal library downloads its ONNX runtime and model weights on first
 * use. To make the tool usable offline, we quietly run it once on a 1x1 pixel
 * while the device is online and idle, which populates the service worker's
 * `bg-removal-runtime` / `bg-removal-model` caches (one year, CacheFirst).
 *
 * Never runs in dev or the Lovable preview, never blocks the UI, and never
 * surfaces an error — a failure is simply retried on a later visit.
 */

const DONE_KEY = "bg-removal-offline-ready";

export function isBackgroundRemovalOfflineReady(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBackgroundRemovalOfflineReady() {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // storage unavailable — warmup still happened for this session
  }
}

function shouldWarmup(): boolean {
  if (!import.meta.env.PROD) return false;
  if (typeof window === "undefined") return false;
  if (!navigator.onLine) return false;
  if (isBackgroundRemovalOfflineReady()) return false;
  try {
    if (window.self !== window.top) return false; // inside an iframe
  } catch {
    return false;
  }
  const { hostname, search } = window.location;
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return false;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return false;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com")) return false;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return false;
  if (new URLSearchParams(search).has("sw")) return false;

  // Respect metered / data-saver connections.
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return false;

  return true;
}

async function tinyPng(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no blob"))), "image/png");
  });
}

let started = false;

/** Schedules the warmup when the browser is idle. Safe to call repeatedly. */
export function scheduleBackgroundRemovalWarmup() {
  if (started) return;
  if (!shouldWarmup()) return;
  started = true;

  const run = () => {
    void (async () => {
      try {
        const { removeBackgroundLocal } = await import("@/lib/background-removal");
        await removeBackgroundLocal(await tinyPng());
        markBackgroundRemovalOfflineReady();
      } catch {
        // Silent by design; a later visit retries.
        started = false;
      }
    })();
  };

  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  }).requestIdleCallback;

  if (idle) idle(run, { timeout: 10_000 });
  else window.setTimeout(run, 4_000);
}
