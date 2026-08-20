import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

// A new service worker activating (skipWaiting + clientsClaim, both on by
// default) does NOT mean this already-open tab is running its code — the tab
// keeps executing whatever JS bundle it already loaded until it reloads. If
// that stale bundle then calls the current API and hits a shape it doesn't
// expect, it can crash the render tree with nothing telling the user to
// reload (see ErrorBoundary). Reloading the instant a new worker takes
// control closes that gap.
//
// Browsers only check for a new service worker on navigation (or roughly
// once every 24h on their own) — a tab left open across a deploy would
// otherwise never notice a new version exists. Polling registration.update()
// explicitly is what actually surfaces it while the tab just sits open.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.oncontrollerchange = () => {
    window.location.reload();
  };

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });
}
