import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    proxy: {
      // Backend (Hono + tRPC) - see server/. xfwd forwards the browser's
      // host/proto so the API can rebuild the public origin (OAuth
      // redirect_uri) instead of seeing the internal :8787 target.
      "/trpc": { target: "http://localhost:8787", xfwd: true },
      "/oauth": { target: "http://localhost:8787", xfwd: true },
      "/api": { target: "http://localhost:8787", xfwd: true },
      "/admin/api": { target: "http://localhost:8787", xfwd: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
