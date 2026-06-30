import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://tripletalk.app",
  vite: {
    plugins: [tailwindcss()],
  },
});
