import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/images/edits";
const PROMPT =
  "Remove the background completely, keeping only the main subject with clean, precise edges. Output a transparent background.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const Route = createFileRoute("/api/remove-background")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response(
            "Higher-quality removal is not configured on this site.",
            { status: 500 },
          );
        }

        const incoming = await request.formData();
        const image = incoming.get("image");
        if (!image || typeof image === "string") {
          return new Response("No image was received.", { status: 400 });
        }

        const form = new FormData();
        form.append("model", "openai/gpt-image-2");
        form.append("image", image, "image.png");
        form.append("prompt", PROMPT);
        form.append("background", "transparent");
        form.append("output_format", "png");
        form.append("quality", "low");

        // Only 429/5xx are retryable, with bounded backoff.
        let upstream: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          upstream = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: form,
          });
          if (upstream.ok) break;
          const retryable = upstream.status === 429 || upstream.status >= 500;
          if (!retryable || attempt === 2) break;
          const retryAfter = Number(upstream.headers.get("Retry-After"));
          await sleep(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 1500 * (attempt + 1),
          );
        }

        if (!upstream || !upstream.ok) {
          const raw = (await upstream?.text().catch(() => "")) ?? "";
          let message = raw;
          try {
            const parsed = JSON.parse(raw) as {
              error?: { message?: string };
              message?: string;
            };
            message = parsed.error?.message ?? parsed.message ?? raw;
          } catch {
            // keep the raw text
          }
          const status = upstream?.status ?? 502;
          if (status === 402) {
            message =
              message ||
              "The workspace is out of AI credits. Add credits to use higher-quality removal.";
          } else if (status === 403) {
            message =
              message ||
              "Higher-quality removal is blocked by this workspace's AI settings.";
          } else if (status === 429) {
            message =
              message || "Too many requests right now — please try again shortly.";
          }
          return new Response(
            message || "Higher-quality removal failed. Please try again.",
            { status },
          );
        }

        const payload = (await upstream.json()) as {
          data?: { b64_json?: string; url?: string }[];
        };
        const b64 = payload.data?.[0]?.b64_json;
        if (!b64) {
          const url = payload.data?.[0]?.url;
          if (url) {
            const img = await fetch(url);
            if (img.ok) {
              return new Response(await img.arrayBuffer(), {
                headers: { "Content-Type": "image/png" },
              });
            }
          }
          return new Response("The AI service returned no image.", {
            status: 502,
          });
        }

        const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new Response(binary, {
          headers: { "Content-Type": "image/png" },
        });
      },
    },
  },
});
