import { createFileRoute } from "@tanstack/react-router";

import { ConverterApp } from "@/components/ConverterApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Image size & format converter" },
      {
        name: "description",
        content:
          "Resize an image and convert it to JPG, PNG, WEBP, AVIF, GIF, BMP or TIFF — right in your browser. Free, private, no upload.",
      },
      { property: "og:title", content: "Image size & format converter" },
      {
        property: "og:description",
        content:
          "Resize and convert images to JPG, PNG, WEBP, AVIF, GIF, BMP or TIFF in your browser. Private, no upload.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConverterApp,
});

