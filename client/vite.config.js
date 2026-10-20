import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly cookie works without CORS.
    proxy: { "/api": "http://localhost:4000" },
  },
});
