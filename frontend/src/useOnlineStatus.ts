import { useEffect, useState } from "react";

// navigator.onLine only reflects whether the device has a network interface at all, not
// whether it can actually reach the internet (a gym with a live wifi connection but a
// dead upstream link would still report true) — good enough for the common case this is
// built for (airplane mode, no signal at all), not a substitute for checking real fetch
// failures where that distinction actually matters.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
