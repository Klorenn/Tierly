import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El Admin es una ISLA dentro de la app vanilla, no un sitio aparte.
//
// `tierly/index.html` lo sigue sirviendo el dev-server de `scripts/dev-server.mjs`
// (y Vercel en estatico, sin buildCommand). Vite solo compila `admin/` y deja el
// bundle dentro de `tierly/admin-app/`, que ya cae bajo el allowlist `/tierly/`
// del dev-server. Por eso no hay `index.html` de entrada ni dev server de Vite:
// `app.js`, `chess.js` y `discover.js` siguen intactos en vanilla.
//
// Nombres FIJOS a proposito (no hash): el proyecto ya versiona con `?v=` en los
// script tags y esa convencion se mantiene en un solo lugar.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "tierly/admin-app",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    // Un solo chunk: el script tag de `index.html` es uno y no hay import map
    // ni base configurable del lado vanilla.
    codeSplitting: false,
    rollupOptions: {
      input: "admin/main.tsx",
      output: {
        entryFileNames: "admin.js",
        assetFileNames: "admin[extname]",
      },
    },
  },
});
