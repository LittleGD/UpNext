"use client";

import { useMemo, useEffect, useState } from "react";
import { useMinigameStore } from "@/store/useMinigameStore";
import { ROUND_CONFIGS } from "@/types/minigame";
import MinigameTile from "./MinigameTile";

/**
 * 3×4 / 4×4 / 5×4 그리드 — 한 화면에 스크롤 없이 피트.
 * 타일 크기는 CSS min()으로 뷰포트 기반 계산.
 */
export default function MinigameBoard() {
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

  // 뷰포트 기반 tileSize 계산 — 아이콘 크기 힌트용
  const [tileSize, setTileSize] = useState(80);
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 가용 영역: 상단 HUD ~80, 하단 네비 ~80, 패딩 ~40
      const availW = vw - 24;
      const availH = vh - 200;
      const gap = rows * cols >= 20 ? 6 : 10;
      const maxByW = (availW - gap * (cols - 1)) / cols;
      const maxByH = (availH - gap * (rows - 1)) / rows;
      setTileSize(Math.max(48, Math.floor(Math.min(maxByW, maxByH))));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
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
  const gap = rows * cols >= 20 ? 6 : 10;

  return (
    <div className="flex-1 flex items-center justify-center px-3 overflow-hidden">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${tileSize}px)`,
          gap: `${gap}px`,
        }}
      >
        {board.map((tile, idx) => (
          <MinigameTile
            key={tile.tileId}
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
        ))}
      </div>
    </div>
  );
}
