import { defineConfig } from "vite"
import injectCss from "vite-plugin-css-injected-by-js"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
export default defineConfig({
  root: "plugins/feed",
  plugins: [react(), tailwindcss(), injectCss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: { entry: "entry.tsx", formats: ["iife"], name: "Widget", fileName: () => "feed-widget.js" },
    outDir: "/mnt/5TB/Projects/Flux/build/plugins",
    emptyOutDir: false,
  }
})