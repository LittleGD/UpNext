"use client";

/**
 * Phase 12e — 인터랙티브 미니게임 모달 wrapper.
 *
 * DungeonView 에서 `session.status === "awaitingMinigame"` + `pendingMinigame` 감지 시
 * 이 모달이 렌더. minigame id 에 따라 컴포넌트 라우팅.
 *
 * 완료 콜백: `resolveMinigame(success)` store action 호출 → 세션 effects 적용.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import type { MinigameId } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import PairMatch from "./minigames/PairMatch";
import SequenceMemo from "./minigames/SequenceMemo";
import PipeConnect from "./minigames/PipeConnect";

interface MinigameModalProps {
  minigame: MinigameId;
  difficulty: 1 | 2 | 3;
  /** 완료 콜백 — success 기반으로 resolveMinigame 호출. */
  onComplete: (success: boolean) => void;
}

// Phase 12 i18n — title 은 key 로 저장, 렌더 시점에 t() 조회.
const MINIGAME_TITLE_KEY: Record<
  MinigameId,
  "uphero.minigame.title.pair_match" | "uphero.minigame.title.sequence_memo" | "uphero.minigame.title.pipe_connect"
> = {
  pair_match: "uphero.minigame.title.pair_match",
  sequence_memo: "uphero.minigame.title.sequence_memo",
  pipe_connect: "uphero.minigame.title.pipe_connect",
};

export default function MinigameModal({
  minigame,
  difficulty,
  onComplete,
}: MinigameModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  // Phase 12 R3 — Esc 로 실수 탈출 → 즉시 실패 + damage 페널티 방지.
  //   각 미니게임 컴포넌트 내부의 "포기" 버튼만 onCancel 호출.
  useModalA11y(containerRef, () => {}, {
    noScrollLock: true,
    noEscape: true,
  });
  if (typeof window === "undefined") return null;

  const Game = (() => {
    switch (minigame) {
      case "pair_match":
        return PairMatch;
      case "sequence_memo":
        return SequenceMemo;
      case "pipe_connect":
        return PipeConnect;
    }
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}ee`,
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="minigame-title"
        className="rounded-md relative overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          outline: "none",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div
          id="minigame-title"
          className="typo-caption text-center py-2"
          style={{
            color: GB.lightest,
            background: GB.dark,
            letterSpacing: "0.08em",
          }}
        >
          {t("uphero.minigame.header", {
            title: t(MINIGAME_TITLE_KEY[minigame]),
            difficulty,
          })}
        </div>
        <Game
          difficulty={difficulty}
          onComplete={(r) => onComplete(r.success)}
          onCancel={() => onComplete(false)}
        />
        <style jsx>{`
          div[role="dialog"] {
            animation: minigame-in 220ms ${EASE_OUT} both;
          }
          @keyframes minigame-in {
            from {
              opacity: 0;
              transform: scale(0.96);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            div[role="dialog"] {
              animation: none;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
