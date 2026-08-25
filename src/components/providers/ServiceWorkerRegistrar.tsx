"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { scheduleLocalReminder } from "@/lib/notifications";
import { isAndroidNative } from "@/lib/platform";
import { t } from "@/i18n";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    const rescheduleReminder = () => {
      const { notificationsEnabled, notificationTime, language } =
        useGameStore.getState().progress;
      if (notificationsEnabled && notificationTime) {
        scheduleLocalReminder(
          notificationTime,
          t("notif.daily.reminder.body", language),
          language,
        );
      }
    };

    // 안드로이드 네이티브는 SW controller 와 무관하게 즉시 네이티브 재스케줄
    // (스케줄 자체는 네이티브에 영속되지만, 언어/시간 변경 반영을 위해 갱신)
    if (isAndroidNative()) rescheduleReminder();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => {
        // SW 준비 후 알림 재스케줄 — controller가 준비될 때까지 약간 대기
        if (!isAndroidNative()) setTimeout(rescheduleReminder, 1000);
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
