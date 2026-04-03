"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // SW 등록 실패는 무시 — PWA 기능만 비활성화
      });
    }
  }, []);

  return null;
}
