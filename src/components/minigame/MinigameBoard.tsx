"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import { useMinigameStore } from "@/store/useMinigameStore";
import { ROUND_CONFIGS } from "@/types/minigame";
import MinigameTile from "./MinigameTile";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 4×4 / 4×5 / 6×4 그리드 — 한 화면에 스크롤 없이 피트.
 *
 * Phase 14 design review 변경:
 * - 과거엔 `window.innerWidth/Height` 로 tileSize 를 JS 로 계산해 고정 px 를
 *   grid-template 에 주입했음. resize listener, orientation 회전, SSR 플래시
 *   3종 리스크. CSS `minmax(0, 1fr)` + `aspect-ratio: 1` + 컨테이너 max-size
 *   로 해결.
 * - gap 은 6px → 8px(작은 보드) / 10px → 12px(큰 보드) 로 확대 — 인접 오터치
 *   방지 (WCAG 2.5.5 8px spacing).
 * - role="grid" + aria-rowcount/colcount 부여해 스크린리더가 "메모리 그리드"
 *   임을 인지. 타일별 `role="gridcell"` 은 MinigameTile 에서 처리.
 * - `sm:/md:` 반응형으로 보드 최대폭 증가 — 태블릿에서 공간 낭비 축소.
 *
 * tileSize state 는 Echo Ghost 아이콘 크기 힌트용으로만 유지하되, CSS 그리드
 * 가 계산한 실제 픽셀을 측정 (ResizeObserver) 해서 사용 — grid 와 icon 이
 * 다른 근거로 계산되는 불일치 제거.
 */
export default function MinigameBoard() {
  const { t } = useTranslation();
  const board = useMinigameStore((s) => s.board);
  const currentRound = useMinigameStore((s) => s.currentRound);
  const phase = useMinigameStore((s) => s.phase);
  const flipCard = useMinigameStore((s) => s.flipCard);
  const categoryHintActive = useMinigameStore((s) => s.categoryHintActive);
  const compassHintIdxs = useMinigameStore((s) => s.compassHintIdxs);
  const peekHintIdxs = useMinigameStore((s) => s.peekHintIdxs);
  const appraisalBorderActive = useMinigameStore((s) => s.appraisalBorderActive);
  const echoGhosts = useMinigameStore((s) => s.echoGhosts);

  const config = ROUND_CONFIGS[currentRound];
  const { rows, cols } = config;

  // 실제 타일 크기를 ResizeObserver 로 관찰 — 아이콘 sizePx 힌트용.
  // CSS 가 주도하므로 이 값은 "반응형으로 따라가는" 읽기 전용.
  const firstTileRef = useRef<HTMLDivElement | null>(null);
  const [tileSize, setTileSize] = useState(80);
  useEffect(() => {
    const el = firstTileRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      if (w > 0) setTileSize(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, cols]);

  // Echo ghost 활성 인덱스 — 짧은 폴링
  const [now, setNow] = useState(() =>
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  useEffect(() => {
    if (echoGhosts.length === 0) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [echoGhosts.length]);

  const activeGhostIdxs = useMemo(() => {
    const s = new Set<number>();
    for (const g of echoGhosts) {
      if (g.expiresAt > now) s.add(g.idx);
    }
    return s;
  }, [echoGhosts, now]);

  const compassSet = useMemo(() => new Set(compassHintIdxs), [compassHintIdxs]);
  const peekSet = useMemo(() => new Set(peekHintIdxs), [peekHintIdxs]);

  const disabled = phase !== "playing";
  // 큰 보드(≥20 tiles)는 gap 을 조금 좁게 — 화면에 들어맞도록.
  const gapRem = rows * cols >= 20 ? "0.5rem" : "0.75rem"; // 8 / 12

  return (
    <div
      className="flex-1 flex items-center justify-center px-3 sm:px-4 md:px-6 overflow-hidden"
      role="grid"
      aria-rowcount={rows}
      aria-colcount={cols}
      aria-label={t("a11y.minigame.board") || "Memory grid"}
    >
      <div
        className="grid w-full"
        style={{
          maxWidth:
            rows * cols >= 20
              ? "min(100%, 34rem)" // ~544px — 6×4 / 4×5 도 여유
              : "min(100%, 28rem)", // ~448px — 4×4 집중
          aspectRatio: `${cols} / ${rows}`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: gapRem,
        }}
      >
        {board.map((tile, idx) => (
          <div
            key={tile.tileId}
            ref={idx === 0 ? firstTileRef : undefined}
            className="relative"
            role="gridcell"
            aria-rowindex={Math.floor(idx / cols) + 1}
            aria-colindex={(idx % cols) + 1}
          >
            <MinigameTile
              tile={tile}
              sizePx={tileSize}
              onTap={() => flipCard(idx)}
              categoryHintActive={categoryHintActive}
              compassHinted={compassSet.has(idx)}
              peekHinted={peekSet.has(idx)}
              rarityBorder={appraisalBorderActive}
              echoGhostActive={activeGhostIdxs.has(idx)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
