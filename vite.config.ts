import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Keep the VPS dev server reachable through an SSH tunnel, but not from
    // the public internet. The laptop forwards localhost:1420 to this port.
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        overlay: path.resolve(__dirname, "overlay.html"),
        onboarding: path.resolve(__dirname, "onboarding.html"),
      },
    },
  },
})
