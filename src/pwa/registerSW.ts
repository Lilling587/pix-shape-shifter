/**
 * Single guarded registration wrapper for the PWA service worker.
 *
 * The SW is only ever registered from here, and only in the published app —
 * never in dev or the Lovable preview (which are online-only by design).
 * `?sw=off` manually unregisters the SW for one visit (kill switch).
 *
 * Follows the built-in PWA skill constraints.
 */

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => r.scope.startsWith(window.location.origin + "/sw.js") || r.scope === window.location.origin + "/")
        .map((r) => r.unregister()),
    );
  } catch {
    // ignore
  }
}

function shouldRegister(): boolean {
  if (!import.meta.env.PROD) return false;
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return false; // inside an iframe
  } catch {
    return false; // cross-origin iframe
  }
  const { hostname, search } = window.location;
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return false;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return false;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com")) return false;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return false;
  if (new URLSearchParams(search).has("sw")) return false; // ?sw=off (or any sw)
  return true;
}

export async function registerPWA() {
  if (!shouldRegister()) {
    await unregisterAppSW();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onRegisterError(error) {
        // Non-fatal: the app still works online; SW caching is an enhancement.
        console.warn("Service worker registration failed:", error);
      },
    });
  } catch (error) {
    console.warn("PWA registration unavailable:", error);
  }
}
