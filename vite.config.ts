import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // garante que os assets do public entram no build e no precache
      includeAssets: ["favicon.svg", "pwa-192.png", "pwa-512.png"],

      manifest: {
        name: "RioAutocom Tech",
        short_name: "RioAutocom",
        description: "Chamados técnicos - RioAutocom Tech",
        theme_color: "#0B5FFF",
        background_color: "#0B5FFF",

        start_url: "/",
        scope: "/",
        id: "/",

        display: "standalone",
        display_override: ["standalone", "minimal-ui", "browser"],
        orientation: "portrait",

        categories: ["business", "productivity"],

        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },

      // ✅ opcional — mas correto e sem risco de quebrar build
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      }
    })
  ],
  server: { port: 5173 }
});
