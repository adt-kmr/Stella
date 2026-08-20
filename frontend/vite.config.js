import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: /api and /ws forward to the FastAPI backend so the
// dashboard can run with zero CORS configuration in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});