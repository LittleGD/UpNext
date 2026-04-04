"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { scheduleLocalReminder } from "@/lib/notifications";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => {
        // SW 준비 후 알림 재스케줄
        const { notificationsEnabled, notificationTime } = useGameStore.getState().progress;
        if (notificationsEnabled && notificationTime) {
          // controller가 준비될 때까지 약간 대기
          setTimeout(() => scheduleLocalReminder(notificationTime), 1000);
        }
      }).catch(() => {
        // SW 등록 실패는 무시 — PWA 기능만 비활성화
      });
    }

    // 핀치줌 안전장치 — CSS touch-action: manipulation 보완
    const blockPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchstart", blockPinch, { passive: false });
    return () => document.removeEventListener("touchstart", blockPinch);
  }, []);

  return null;
}
