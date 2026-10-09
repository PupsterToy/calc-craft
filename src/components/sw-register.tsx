"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => void r.unregister()))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {
    });
  }, []);
  return null;
}
