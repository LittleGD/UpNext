"use client";

/**
 * Phase 12e — PipeConnect 미니게임.
 *
 * 작은 그리드 (3x3 / 4x4) 에 파이프 타일이 무작위 회전 상태로 배치.
 * 플레이어는 타일을 탭해 90° 회전. 좌상 START → 우하 END 까지 파이프가
 * 연결되면 성공.
 *
 * 타일 종류 (simplified):
 *   - "straight": 양방향 (가로 또는 세로)
 *   - "corner": L-자형
 *   - "cross": 4 방향
 *
 * 각 타일의 `openings` 는 4 방향 boolean array [N, E, S, W].
 * 회전: 우측 shift (N→E→S→W→N).
 *
 * 성공 판정: BFS with START(row=0,col=0) → END(last row,last col), 인접 타일의
 *   마주보는 opening 이 모두 true 면 통과.
 *
 * difficulty:
 *   - 1: 3x3, 30s, straight+corner
 *   - 2: 4x4, 35s, + cross
 *   - 3: 4x4, 25s, + 추가 장애물 (corner 위주)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";

type Dir = 0 | 1 | 2 | 3; // N, E, S, W
type Openings = [boolean, boolean, boolean, boolean];
type PipeKind = "straight" | "corner" | "cross" | "blank";

interface Tile {
  kind: PipeKind;
  rotation: Dir; // 0-3 = 90° * n
}

function baseOpenings(kind: PipeKind): Openings {
  switch (kind) {
    case "straight": return [true, false, true, false]; // N+S
    case "corner": return [true, true, false, false]; // N+E
    case "cross": return [true, true, true, true];
    case "blank": return [false, false, false, false];
  }
}

function rotateOpenings(openings: Openings, rotation: Dir): Openings {
  // rotation=1 (90° CW): N→E→S→W. each open shifts idx +rotation mod 4.
  const result: Openings = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    result[(i + rotation) % 4] = openings[i];
  }
  return result;
}

function tileOpenings(t: Tile): Openings {
  return rotateOpenings(baseOpenings(t.kind), t.rotation);
}

function makeGrid(size: number, difficulty: 1 | 2 | 3): Tile[][] {
  const grid: Tile[][] = [];
  for (let r = 0; r < size; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < size; c++) {
      // kind 무작위
      const roll = Math.random();
      let kind: PipeKind;
      if (difficulty === 1) {
        kind = roll < 0.5 ? "straight" : "corner";
      } else if (difficulty === 2) {
        kind = roll < 0.4 ? "straight" : roll < 0.8 ? "corner" : "cross";
      } else {
        kind = roll < 0.3 ? "straight" : roll < 0.85 ? "corner" : "cross";
      }
      row.push({ kind, rotation: Math.floor(Math.random() * 4) as Dir });
    }
    grid.push(row);
  }
  // START(0,0) / END(last,last) 은 반드시 연결 가능한 kind 로
  grid[0][0] = { kind: "corner", rotation: Math.floor(Math.random() * 4) as Dir };
  grid[size - 1][size - 1] = {
    kind: "corner",
    rotation: Math.floor(Math.random() * 4) as Dir,
  };
  return grid;
}

function isConnected(grid: Tile[][]): boolean {
  const size = grid.length;
  const visited = new Set<string>();
  const stack: [number, number][] = [[0, 0]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (r === size - 1 && c === size - 1) return true;
    const openings = tileOpenings(grid[r][c]);
    // 각 방향 체크
    // N (opening[0]): move r-1. adjacent's S (opening[2]) must open.
    if (openings[0] && r > 0) {
      const adj = tileOpenings(grid[r - 1][c]);
      if (adj[2]) stack.push([r - 1, c]);
    }
    if (openings[1] && c < size - 1) {
      const adj = tileOpenings(grid[r][c + 1]);
      if (adj[3]) stack.push([r, c + 1]);
    }
    if (openings[2] && r < size - 1) {
      const adj = tileOpenings(grid[r + 1][c]);
      if (adj[0]) stack.push([r + 1, c]);
    }
    if (openings[3] && c > 0) {
      const adj = tileOpenings(grid[r][c - 1]);
      if (adj[1]) stack.push([r, c - 1]);
    }
  }
  return false;
}

export default function PipeConnect({
  difficulty,
  onComplete,
  onCancel,
}: MinigameProps) {
  const { size, timeMs } = useMemo(() => {
    switch (difficulty) {
      case 1: return { size: 3, timeMs: 30000 };
      case 2: return { size: 4, timeMs: 35000 };
      case 3: return { size: 4, timeMs: 25000 };
    }
  }, [difficulty]);

  const [grid, setGrid] = useState<Tile[][]>(() => makeGrid(size, difficulty));
  const [remainingMs, setRemainingMs] = useState(timeMs);
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timer
  useEffect(() => {
    if (result) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const left = Math.max(0, timeMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        setResult("fail");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeMs, result]);

  // onComplete
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const t = window.setTimeout(() => {
      onCompleteRef.current({ success: result === "success" });
    }, 800);
    return () => window.clearTimeout(t);
  }, [result]);

  const rotate = (r: number, c: number) => {
    if (result) return;
    setGrid((g) => {
      const next = g.map((row) => row.slice());
      next[r][c] = {
        ...next[r][c],
        rotation: ((next[r][c].rotation + 1) % 4) as Dir,
      };
      if (isConnected(next)) {
        setResult("success");
      }
      return next;
    });
  };

  const timePct = (remainingMs / timeMs) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-3">
      <div
        className="typo-caption tabular-nums"
        style={{ color: GB.lightest }}
      >
        파이프 연결 · {(remainingMs / 1000).toFixed(1)}s
      </div>
      <div
        className="w-full max-w-xs h-1 rounded-full overflow-hidden"
        style={{ background: GB.dark }}
        aria-hidden="true"
      >
        <div
          style={{
            width: `${timePct}%`,
            height: "100%",
            background:
              timePct > 50 ? GB.light : timePct > 20 ? "#e8d88b" : "#e88b7a",
          }}
        />
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          maxWidth: size * 52 + (size - 1) * 4,
        }}
      >
        {grid.map((row, r) =>
          row.map((t, c) => {
            const isStart = r === 0 && c === 0;
            const isEnd = r === size - 1 && c === size - 1;
            const ops = tileOpenings(t);
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => rotate(r, c)}
                disabled={!!result}
                aria-label={`타일 (${r + 1}, ${c + 1}) · ${t.kind} · 탭해서 회전`}
                className="pipe-tile rounded relative flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  background: isStart
                    ? `${GB.lightest}44`
                    : isEnd
                      ? `${GB.lightest}44`
                      : GB.dark,
                  border: `1px solid ${
                    isStart || isEnd ? GB.lightest : GB.light
                  }`,
                  cursor: result ? "default" : "pointer",
                }}
              >
                {/* SVG 으로 파이프 그리기 */}
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  aria-hidden="true"
                >
                  {/* 각 방향 open 시 중심에서 가장자리로 bar */}
                  {ops[0] && (
                    <rect x="17" y="0" width="6" height="20" fill={GB.lightest} />
                  )}
                  {ops[1] && (
                    <rect x="20" y="17" width="20" height="6" fill={GB.lightest} />
                  )}
                  {ops[2] && (
                    <rect x="17" y="20" width="6" height="20" fill={GB.lightest} />
                  )}
                  {ops[3] && (
                    <rect x="0" y="17" width="20" height="6" fill={GB.lightest} />
                  )}
                  {/* 중앙 노드 */}
                  <circle cx="20" cy="20" r="4" fill={GB.lightest} />
                  {/* start/end 마커 */}
                  {isStart && (
                    <text
                      x="20"
                      y="10"
                      fontSize="8"
                      fill={GB.darkest}
                      textAnchor="middle"
                      fontWeight="700"
                    >
                      S
                    </text>
                  )}
                  {isEnd && (
                    <text
                      x="20"
                      y="35"
                      fontSize="8"
                      fill={GB.darkest}
                      textAnchor="middle"
                      fontWeight="700"
                    >
                      E
                    </text>
                  )}
                </svg>
              </button>
            );
          }),
        )}
      </div>
      {result && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{
            color: result === "success" ? GB.lightest : "#e88b7a",
            fontWeight: 600,
          }}
        >
          {result === "success" ? "연결 성공!" : "시간 초과"}
        </div>
      )}
      {!result && (
        <button
          type="button"
          onClick={onCancel}
          className="typo-caption mt-1 rounded px-3 py-1"
          style={{
            background: "transparent",
            color: GB.light,
            border: `1px solid ${GB.dark}`,
          }}
          aria-label="미니게임 포기"
        >
          포기
        </button>
      )}
      <style jsx>{`
        .pipe-tile {
          transition: transform 120ms ${EASE_OUT};
        }
        .pipe-tile:not(:disabled):active {
          /* Emil — press feedback 0.97 통일 (0.94 는 너무 강함) */
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}
