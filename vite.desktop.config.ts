import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Standalone static build used to package the desktop (Electron) app.
 * Relative base so assets resolve under file://.
 */
export default defineConfig({
  root: "desktop",
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: "." })],
  build: {
    outDir: "../dist-desktop",
    emptyOutDir: true,
  },
});
