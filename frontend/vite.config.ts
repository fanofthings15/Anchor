import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // manifest.json is already hand-maintained in public/ and linked from index.html,
      // with its own Traefik+app-level auth exemption (see backend's PUBLIC_ASSET_NAMES
      // and Home-Wiki's coolify-anchor-static-assets router) — letting this plugin
      // generate and inject a second one would fight that setup.
      manifest: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.json"],
      workbox: {
        // SPA routing: an offline deep-link/refresh (e.g. /notes/abc) has no matching
        // precached document, so any navigation request that isn't otherwise precached
        // falls back to the cached app shell and lets react-router take over client-side.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // GET only, deliberately — a write (POST/PATCH/DELETE) must never be served
            // from cache or have its response cached. Writes aren't queued offline in
            // this app — they're just left to fail normally, so nothing here needs to
            // special-case them.
            // A RegExp urlPattern matches against the *full* URL string (scheme and host
            // included), not just the path — an anchored `/^\/api\//` would never match a
            // real "http://host/api/..." request. A pathname-based function matcher
            // sidesteps that gotcha entirely.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            method: "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "anchor-api-cache",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5590,
    proxy: {
      "/api": "http://localhost:3320",
    },
  },
});
