"use client";

/**
 * Up Hero — ClassAwakenModal.
 *
 * Phase 5c.3: Lv 30 도달 시 주요 완료 카테고리 기반 class 분화가 일어나면
 * 풀스크린 연출. 유저는 한 번만 보는 장면이라 약간 느리고 극적인 pacing.
 *
 * 플로우:
 *  1. store.pendingClassAwaken 이 non-null 이면 mount
 *  2. 배경 fade-in → 타이틀 pop → 클래스 심볼 + 이름 → 패시브 설명 순서로 reveal
 *  3. 사용자가 "캠프로" 탭 시 acknowledge + 언마운트
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { CLASS_META, DUNGEON_BY_CLASS } from "@/types/uphero";
import { DUNGEONS } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, EASE_DRAWER } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import PixelIcon from "@/components/icons/PixelIcon";

export default function ClassAwakenModal() {
  const pending = useUpHeroStore((s) => s.pendingClassAwaken);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeClassAwaken);
  const { play } = useSound();

  // 다단계 reveal state — 0: 배경만, 1: 타이틀, 2: 아이콘, 3: 이름+설명
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!pending) {
      setStage(0);
      return;
    }
    play("impactShake");
    const t1 = window.setTimeout(() => setStage(1), 150);
    const t2 = window.setTimeout(() => setStage(2), 700);
    const t3 = window.setTimeout(() => setStage(3), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [pending, play]);

  if (!pending) return null;
  if (typeof window === "undefined") return null;

  const meta = CLASS_META[pending];
  const dungeonId = DUNGEON_BY_CLASS[pending];
  const dungeon = DUNGEONS[dungeonId];

  const onDismiss = () => {
    play("confirm");
    acknowledge();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: `radial-gradient(ellipse at center, ${dungeon.themeColor}22 0%, ${GB.darkest}ee 65%, ${GB.darkest} 100%)`,
        paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
      }}
    >
      <div className="flex flex-col items-center px-6">
        <div
          className="typo-caption mb-4"
          style={{
            color: GB.light,
            opacity: stage >= 1 ? 1 : 0,
            transform: stage >= 1 ? "translateY(0)" : "translateY(-6px)",
            transition: `opacity 320ms ${EASE_OUT}, transform 320ms ${EASE_OUT}`,
            letterSpacing: "0.1em",
          }}
        >
          클래스 분화
        </div>

        <div
          className="typo-heading mb-6"
          style={{
            color: GB.lightest,
            opacity: stage >= 1 ? 1 : 0,
            transform: `scale(${stage >= 1 ? 1 : 0.92})`,
            transition: `opacity 420ms ${EASE_DRAWER}, transform 420ms ${EASE_DRAWER}`,
            textAlign: "center",
          }}
        >
          영웅이 길을 찾았다
        </div>

        <div
          style={{
            opacity: stage >= 2 ? 1 : 0,
            transform: `scale(${stage >= 2 ? 1 : 0.6})`,
            transition: `opacity 400ms ${EASE_DRAWER}, transform 500ms ${EASE_DRAWER}`,
            marginBottom: 16,
            filter: stage >= 2 ? "drop-shadow(0 0 12px #cdf56488)" : "none",
          }}
        >
          <PixelIcon name={meta.icon} size={64} color={dungeon.themeColor} />
        </div>

        <div
          className="typo-body mb-2"
          style={{
            color: dungeon.themeColor,
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? "translateY(0)" : "translateY(6px)",
            transition: `opacity 320ms ${EASE_OUT}, transform 320ms ${EASE_OUT}`,
          }}
        >
          {meta.name}
        </div>

        <div
          className="typo-caption text-center mb-10 px-4"
          style={{
            color: GB.light,
            opacity: stage >= 3 ? 0.92 : 0,
            transform: stage >= 3 ? "translateY(0)" : "translateY(6px)",
            transition: `opacity 320ms ${EASE_OUT} 80ms, transform 320ms ${EASE_OUT} 80ms`,
            maxWidth: 280,
            lineHeight: 1.6,
          }}
        >
          {meta.passive}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="typo-caption rounded px-6"
          style={{
            minHeight: 44,
            background: GB.lightest,
            color: GB.darkest,
            border: `1px solid ${GB.lightest}`,
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? "translateY(0)" : "translateY(8px)",
            transition: `opacity 320ms ${EASE_OUT} 200ms, transform 320ms ${EASE_OUT} 200ms`,
          }}
          disabled={stage < 3}
        >
          캠프로
        </button>
      </div>
    </div>,
    document.body,
  );
}
