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
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, TimeBar, StatusMessage, GiveUpButton } from "./_chrome";

type Dir = 0 | 1 | 2 | 3; // N, E, S, W
type Openings = [boolean, boolean, boolean, boolean];
type PipeKind = "straight" | "corner" | "cross" | "blank";

interface Tile {
  kind: PipeKind;
  rotation: Dir;
}

function baseOpenings(kind: PipeKind): Openings {
  switch (kind) {
    case "straight": return [true, false, true, false];
    case "corner": return [true, true, false, false];
    case "cross": return [true, true, true, true];
    case "blank": return [false, false, false, false];
  }
}

function rotateOpenings(openings: Openings, rotation: Dir): Openings {
  const result: Openings = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    result[(i + rotation) % 4] = openings[i];
  }
  return result;
}

function tileOpenings(t: Tile): Openings {
  return rotateOpenings(baseOpenings(t.kind), t.rotation);
}

function tileForDirs(d1: Dir, d2: Dir): Tile {
  const key = [d1, d2].sort((a, b) => a - b).join(",");
  switch (key) {
    case "0,2": return { kind: "straight", rotation: 0 };
    case "1,3": return { kind: "straight", rotation: 1 };
    case "0,1": return { kind: "corner", rotation: 0 };
    case "1,2": return { kind: "corner", rotation: 1 };
    case "2,3": return { kind: "corner", rotation: 2 };
    case "0,3": return { kind: "corner", rotation: 3 };
    default: return { kind: "cross", rotation: 0 };
  }
}

function dirFromTo(from: [number, number], to: [number, number]): Dir {
  const dr = to[0] - from[0];
  const dc = to[1] - from[1];
  if (dr === -1) return 0;
  if (dc === 1) return 1;
  if (dr === 1) return 2;
  return 3;
}

function genSolutionPath(size: number): [number, number][] {
  const visited: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const path: [number, number][] = [];

  function dfs(r: number, c: number): boolean {
    visited[r][c] = true;
    path.push([r, c]);
    if (r === size - 1 && c === size - 1) return true;
    const dirs: [number, number][] = [
      [0, 1], [1, 0], [0, -1], [-1, 0],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc]) {
        if (dfs(nr, nc)) return true;
      }
    }
    visited[r][c] = false;
    path.pop();
    return false;
  }

  dfs(0, 0);
  return path;
}

function makeGrid(size: number, difficulty: 1 | 2 | 3): Tile[][] {
  const path = genSolutionPath(size);
  const onPath = new Map<string, Tile>();
  for (let i = 0; i < path.length; i++) {
    const [r, c] = path[i];
    let inDir: Dir;
    let outDir: Dir;
    if (i === 0) {
      inDir = 3;
      outDir = dirFromTo([r, c], path[i + 1]);
    } else if (i === path.length - 1) {
      inDir = dirFromTo([r, c], path[i - 1]);
      outDir = 1;
    } else {
      inDir = dirFromTo([r, c], path[i - 1]);
      outDir = dirFromTo([r, c], path[i + 1]);
    }
    onPath.set(`${r},${c}`, inDir === outDir ? { kind: "cross", rotation: 0 } : tileForDirs(inDir, outDir));
  }

  const grid: Tile[][] = [];
  for (let r = 0; r < size; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < size; c++) {
      const onP = onPath.get(`${r},${c}`);
      if (onP) {
        row.push(onP);
      } else {
        const roll = Math.random();
        let kind: PipeKind;
        if (difficulty === 1) {
          kind = roll < 0.5 ? "straight" : "corner";
        } else if (difficulty === 2) {
          kind = roll < 0.4 ? "straight" : roll < 0.8 ? "corner" : "cross";
        } else {
          kind = roll < 0.3 ? "straight" : roll < 0.85 ? "corner" : "cross";
        }
        row.push({ kind, rotation: 0 });
      }
    }
    grid.push(row);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      grid[r][c] = {
        ...grid[r][c],
        rotation: Math.floor(Math.random() * 4) as Dir,
      };
    }
  }

  return grid;
}

function isConnected(grid: Tile[][]): boolean {
  const size = grid.length;
  const startOps = tileOpenings(grid[0][0]);
  const endOps = tileOpenings(grid[size - 1][size - 1]);
  if (!startOps[3]) return false;
  if (!endOps[1]) return false;

  const visited = new Set<string>();
  const stack: [number, number][] = [[0, 0]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (r === size - 1 && c === size - 1) return true;
    const openings = tileOpenings(grid[r][c]);
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
  const { t } = useTranslation();
  const { size, timeMs } = useMemo(() => {
    switch (difficulty) {
      case 1: return { size: 3, timeMs: 30000 };
      case 2: return { size: 4, timeMs: 35000 };
      case 3: return { size: 4, timeMs: 25000 };
    }
  }, [difficulty]);

  const [grid, setGrid] = useState<Tile[][]>(() => makeGrid(size, difficulty));
  // 누적 회전 (시각적 회전용 — 360→720 등 끊김 없음)
  const [rotations, setRotations] = useState<number[][]>(() =>
    Array.from({ length: size }, () => Array(size).fill(0)),
  );
  const [remainingMs, setRemainingMs] = useState(timeMs);
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const tt = window.setTimeout(() => {
      onCompleteRef.current({ success: result === "success" });
    }, 800);
    return () => window.clearTimeout(tt);
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
    setRotations((rs) => {
      const next = rs.map((row) => row.slice());
      next[r][c] = next[r][c] + 90;
      return next;
    });
  };

  const timePct = (remainingMs / timeMs) * 100;
  const cellSize = 48;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <MinigameHeader>
        {t("uphero.mini.pipe.header", { time: (remainingMs / 1000).toFixed(1) })}
      </MinigameHeader>
      <TimeBar pct={timePct} />
      <div
        className="grid gap-1 relative"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          maxWidth: size * (cellSize + 4) - 4,
        }}
      >
        <div
          aria-hidden="true"
          className="pipe-arrow"
          style={{ position: "absolute", left: -22, top: cellSize / 2 - 7 }}
        >
          ▶
        </div>
        <div
          aria-hidden="true"
          className="pipe-arrow"
          style={{ position: "absolute", right: -22, bottom: cellSize / 2 - 7 }}
        >
          ▶
        </div>
        {grid.map((row, r) =>
          row.map((tile, c) => {
            const isStart = r === 0 && c === 0;
            const isEnd = r === size - 1 && c === size - 1;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => rotate(r, c)}
                disabled={!!result}
                aria-label={t("uphero.mini.pipe.tileAria", {
                  row: r + 1,
                  col: c + 1,
                  kind: tile.kind,
                })}
                className="pipe-tile rounded relative flex items-center justify-center"
                style={{
                  width: cellSize,
                  height: cellSize,
                  background: isStart || isEnd ? `${GB.lightest}44` : GB.dark,
                  border: `1px solid ${isStart || isEnd ? GB.lightest : GB.light}`,
                  cursor: result ? "default" : "pointer",
                }}
              >
                <div
                  className="pipe-tile-rot"
                  style={{ transform: `rotate(${rotations[r][c]}deg)` }}
                >
                  <PipeShape kind={tile.kind} />
                </div>
                {isStart && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      fontWeight: 800,
                      color: GB.lightest,
                      letterSpacing: "0.05em",
                      pointerEvents: "none",
                    }}
                  >
                    S
                  </span>
                )}
                {isEnd && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      fontWeight: 800,
                      color: GB.lightest,
                      letterSpacing: "0.05em",
                      pointerEvents: "none",
                    }}
                  >
                    E
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
      {result && (
        <StatusMessage kind={result === "success" ? "success" : "fail"}>
          {result === "success"
            ? t("uphero.mini.pipe.success")
            : t("uphero.mini.pipe.timeout")}
        </StatusMessage>
      )}
      {!result && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .pipe-arrow {
          width: 18px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${GB.lightest};
          font-size: 16px;
          font-weight: 800;
          line-height: 1;
        }
        .pipe-tile {
          transition: transform 100ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .pipe-tile:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .pipe-tile:hover:not(:disabled) {
            background: ${GB.light}44;
          }
        }
        .pipe-tile:not(:disabled):active {
          transform: scale(0.97);
        }
        .pipe-tile-rot {
          width: 40px;
          height: 40px;
          transition: transform 220ms ${EASE_OUT};
        }
        @media (prefers-reduced-motion: reduce) {
          .pipe-tile,
          .pipe-tile-rot {
            transition: none;
          }
          .pipe-tile:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * 회전을 외부에서 transform 으로 처리하므로 baseOpenings 만 그리면 충분.
 */
function PipeShape({ kind }: { kind: PipeKind }) {
  const ops = baseOpenings(kind);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      {ops[0] && <rect x="17" y="0" width="6" height="20" fill={GB.lightest} />}
      {ops[1] && <rect x="20" y="17" width="20" height="6" fill={GB.lightest} />}
      {ops[2] && <rect x="17" y="20" width="6" height="20" fill={GB.lightest} />}
      {ops[3] && <rect x="0" y="17" width="20" height="6" fill={GB.lightest} />}
      <circle cx="20" cy="20" r="4" fill={GB.lightest} />
    </svg>
  );
}
