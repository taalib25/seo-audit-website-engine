import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  // Browser automation is an optional runtime dependency. Keep its dynamic import
  // out of the server bundle so deployments without browser support still build.
  ssr: { external: ["playwright-core"] },
});
