import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Base path is configurable so GitHub Pages builds can use "/notehybrid/"
// (VITE_BASE=/notehybrid/) while local builds and other hosts stay at "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
});
