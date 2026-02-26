"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // In dev, stale SW caches can cause hydration mismatches and old UI snapshots.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          void reg.unregister();
        });
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((k) => {
            void caches.delete(k);
          });
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent fail: app works without SW.
    });
  }, []);

  return null;
}
