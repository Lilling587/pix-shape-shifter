/**
 * Entry point for the downloadable desktop app.
 *
 * The converter is entirely client-side, so the desktop build skips the router
 * and server rendering and mounts the shared page component directly.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../src/styles.css";
import { ConverterApp } from "../src/components/ConverterApp";

const el = document.getElementById("root")!;
createRoot(el).render(
  <StrictMode>
    <ConverterApp />
  </StrictMode>,
);
