import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://tripletalk.app",
  // Legal and guide texts are rendered 1:1 from the app repo, so keep their straight quotes.
  markdown: {
    smartypants: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
