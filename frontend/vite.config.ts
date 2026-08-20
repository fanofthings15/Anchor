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
            // Note *images* are excluded below (the more specific rule wins by being
            // registered first) — the client-side guard on note text (enforceNoteLock in
            // api/client.ts) stops a cached response from ever rendering past its current
            // lock state, but an <img src="..."> is a raw browser fetch the service worker
            // intercepts directly, with no equivalent JS gate. Since enforceNoteLock
            // already keeps the image gallery from rendering at all once a note re-locks,
            // this exclusion is defense-in-depth rather than load-bearing — but it means
            // even a bug in that guard couldn't leak actual image bytes, only the fact
            // that some cached bytes exist.
            // Inlined rather than calling a shared helper: vite-plugin-pwa stringifies
            // this function and runs it inside the generated service worker, a completely
            // separate execution context with no access to this config file's own module
            // scope — a reference to an outer helper here would throw ReferenceError at
            // runtime and silently break routing (confirmed: this exact mistake made every
            // rule below match nothing, so *nothing* was ever cached, while looking like
            // working code at build time).
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") &&
              !(url.pathname.startsWith("/api/notes/images/") || (url.pathname.startsWith("/api/notes/") && url.pathname.endsWith("/images"))),
            method: "GET",
            handler: "NetworkFirst",
            options: {
              // Renamed from the first cut of this feature (anchor-api-cache), which had
              // no client-side re-validation on notes and could have kept serving an
              // unlocked note's full content past its lock — this abandons that cache
              // outright rather than risk anything still resolving from it.
              cacheName: "anchor-api-cache-v2",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Note images: never cached — see the exclusion note above.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/notes/images/") || (url.pathname.startsWith("/api/notes/") && url.pathname.endsWith("/images")),
            method: "GET",
            handler: "NetworkOnly",
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
