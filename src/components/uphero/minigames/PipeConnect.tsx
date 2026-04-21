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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import {
  MinigameHeader,
  TimeBar,
  StatusMessage,
  GiveUpButton,
  MinigameShell,
  MinigameLiveText,
  FlowArrow,
  EndpointBadge,
} from "./_chrome";

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
  /** Phase 16 R5 — roving tabindex. 포커스된 셀만 `tabIndex=0`, 나머지는 -1.
   *   ArrowKeys 로 그리드 내 이동, Enter/Space 로 회전. 25s 안에 16 탭 Tab 순회
   *   불가능하던 키보드 사용성 문제 해결. 시작값 `[0,0]` (START 타일). */
  const [focusedCell, setFocusedCell] = useState<[number, number]>([0, 0]);
  const tileRefs = useRef<(HTMLButtonElement | null)[][]>([]);

  const onCompleteRef = useRef(onComplete);
  // Phase 16 design review 범위 밖 — TapBurst/ReactionTap 과 동일한 established
  // "ref 최신화" 패턴. Unmount race 방지 목적이라 effect 로 옮기지 않고 유지.
  // eslint-disable-next-line react-hooks/refs
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

  const rotate = useCallback(
    (r: number, c: number) => {
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
    },
    [result],
  );

  /** Phase 16 R5 — 그리드 키보드 내비.
   *   ArrowKeys 이동, Enter/Space 회전. 방향 이동 시 실제 DOM focus 도 이동해야
   *   스크린리더가 셀 aria-label 을 읽는다. */
  const moveFocus = useCallback(
    (dr: number, dc: number) => {
      setFocusedCell(([r, c]) => {
        const nr = Math.max(0, Math.min(size - 1, r + dr));
        const nc = Math.max(0, Math.min(size - 1, c + dc));
        // 다음 tick 에서 DOM ref 에 focus() — tabIndex 업데이트가 선행돼야
        requestAnimationFrame(() => {
          tileRefs.current[nr]?.[nc]?.focus();
        });
        return [nr, nc];
      });
    },
    [size],
  );

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (result) return;
      switch (e.key) {
        case "ArrowUp":    e.preventDefault(); moveFocus(-1, 0); break;
        case "ArrowDown":  e.preventDefault(); moveFocus(1, 0);  break;
        case "ArrowLeft":  e.preventDefault(); moveFocus(0, -1); break;
        case "ArrowRight": e.preventDefault(); moveFocus(0, 1);  break;
        case "Enter":
        case " ":
          e.preventDefault();
          rotate(focusedCell[0], focusedCell[1]);
          break;
      }
    },
    [result, moveFocus, rotate, focusedCell],
  );

  const timePct = (remainingMs / timeMs) * 100;

  /** Phase 16 R6 — 플레이 중 live region 안내.
   *   aria-live="polite" 는 텍스트가 바뀔 때마다 읽으므로, 임계 구간 동안 같은
   *   문구를 유지해도 스크린리더는 최초 진입 시 한 번만 공지한다. "한 번만
   *   발화" 를 위한 ref 트래킹은 필요 없음 — React refs-during-render 위반만
   *   초래한다. 임계를 넘어 다시 높아지면 재공지되는 것도 자연스러움.
   *   TODO(i18n): 추후 `uphero.mini.pipe.liveLow/Half/Connected` 키를 4개 언어에
   *     추가. 지금은 silence 해결이 우선이라 간단한 한글 문자열로 시작. */
  const liveText =
    result === "success"
      ? t("uphero.mini.pipe.success")
      : timePct <= 20
        ? "시간이 얼마 남지 않았습니다"
        : timePct <= 50
          ? "절반 지났습니다"
          : "";

  return (
    <MinigameShell>
      <MinigameHeader>
        {t("uphero.mini.pipe.header", { time: (remainingMs / 1000).toFixed(1) })}
      </MinigameHeader>
      <TimeBar pct={timePct} />
      {/* Phase 16 R6 — 플레이 중 live region (결과 발표 전 silence 방지) */}
      {liveText && <MinigameLiveText>{liveText}</MinigameLiveText>}
      <div
        role="grid"
        aria-label={t("uphero.mini.pipe.header", { time: (remainingMs / 1000).toFixed(1) })}
        className="grid relative"
        onKeyDown={onGridKeyDown}
        style={{
          /* Phase 16 R1/R8 — 반응형 사이즈 토큰 + HIG 8pt 간격 */
          gridTemplateColumns: `repeat(${size}, var(--mg-tile-size))`,
          gap: "var(--mg-tile-gap)",
        }}
      >
        {/* Phase 16 U1 — ▶ 유니코드 글리프를 FlowArrow SVG 로 교체.
             폰트 의존 제거 + 크기/정렬 일관. 시작 화살표는 그리드 왼쪽에서
             첫 타일을 향해, 끝 화살표는 마지막 타일에서 그리드 오른쪽으로. */}
        <div
          aria-hidden="true"
          className="pipe-arrow pipe-arrow-start"
        >
          <FlowArrow direction="right" size={14} color={GB.lightest} />
        </div>
        <div
          aria-hidden="true"
          className="pipe-arrow pipe-arrow-end"
        >
          <FlowArrow direction="right" size={14} color={GB.lightest} />
        </div>
        {grid.map((row, r) =>
          row.map((tile, c) => {
            const isStart = r === 0 && c === 0;
            const isEnd = r === size - 1 && c === size - 1;
            const isFocused = focusedCell[0] === r && focusedCell[1] === c;
            return (
              <button
                key={`${r}-${c}`}
                ref={(el) => {
                  if (!tileRefs.current[r]) tileRefs.current[r] = [];
                  tileRefs.current[r][c] = el;
                }}
                type="button"
                role="gridcell"
                /* Phase 16 R5 — roving tabindex. 포커스된 셀만 tab 진입 가능. */
                tabIndex={isFocused ? 0 : -1}
                onClick={() => {
                  setFocusedCell([r, c]);
                  rotate(r, c);
                }}
                onFocus={() => setFocusedCell([r, c])}
                disabled={!!result}
                aria-label={t("uphero.mini.pipe.tileAria", {
                  row: r + 1,
                  col: c + 1,
                  kind: tile.kind,
                })}
                className={`pipe-tile rounded relative flex items-center justify-center ${result ? "mg-disabled" : ""}`}
                style={{
                  /* Phase 16 R1 — 토큰 기반 사이즈 */
                  width: "var(--mg-tile-size)",
                  height: "var(--mg-tile-size)",
                  /* Phase 16 R2 — 문자열 concat alpha 제거, surface 토큰 사용 */
                  background: isStart || isEnd ? "var(--surface-minigame-active)" : GB.dark,
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
                {/* Phase 16 U1 — S/E 텍스트 라벨을 EndpointBadge SVG 로 교체.
                     1글자 텍스트는 letter-spacing 이 무효고 폰트 weight 가
                     불안정 → 삼각(play) / 동심원(target) 으로 시각 대비 확보.
                     aria-hidden — 타일의 aria-label 이 이미 기능을 전달. */}
                {isStart && (
                  <span className="pipe-endpoint-label pipe-endpoint-start">
                    <EndpointBadge kind="start" size={12} color={GB.lightest} />
                  </span>
                )}
                {isEnd && (
                  <span className="pipe-endpoint-label pipe-endpoint-end">
                    <EndpointBadge kind="end" size={12} color={GB.lightest} />
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
        /* Phase 16 U1 — FlowArrow SVG 로 교체됨. font-size/color/font-weight
           는 더 이상 필요 없음 (SVG 자체 색 상속). 위치 + 크기만 담당. */
        .pipe-arrow {
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: absolute;
        }
        .pipe-arrow-start {
          left: -24px;
          top: calc(var(--mg-tile-size) / 2 - 7px);
        }
        .pipe-arrow-end {
          right: -24px;
          bottom: calc(var(--mg-tile-size) / 2 - 7px);
        }
        /* Phase 16 U1 — EndpointBadge SVG 로 교체됨. text 스타일(font-size/
           weight/color) 제거 — SVG 컴포넌트가 자체 색/크기 관리. 포지션만 담당. */
        .pipe-endpoint-label {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .pipe-endpoint-start { top: 4px; }
        .pipe-endpoint-end   { bottom: 4px; }

        .pipe-tile {
          transition:
            transform 100ms ${EASE_OUT},
            background 160ms ${EASE_OUT},
            border-color 160ms ${EASE_OUT};
          /* Phase 16 R1 — 탭 지연 제거 + 핀치-줌 제스처 방해 없음 */
          touch-action: manipulation;
        }
        .pipe-tile:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .pipe-tile:hover:not(:disabled) {
            background: var(--surface-minigame-hover);
          }
        }
        .pipe-tile:not(:disabled):active {
          transform: scale(0.97);
        }
        .pipe-tile-rot {
          width: var(--mg-tile-inner);
          height: var(--mg-tile-inner);
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
    </MinigameShell>
  );
}

/**
 * 회전을 외부에서 transform 으로 처리하므로 baseOpenings 만 그리면 충분.
 */
function PipeShape({ kind }: { kind: PipeKind }) {
  const ops = baseOpenings(kind);
  /* Phase 16 — width/height 100% 로 부모 pipe-tile-rot(--mg-tile-inner) 에 맞춤.
     반응형 토큰 변경만으로 tile/shape 이 함께 스케일. */
  return (
    <svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">
      {ops[0] && <rect x="17" y="0" width="6" height="20" fill={GB.lightest} />}
      {ops[1] && <rect x="20" y="17" width="20" height="6" fill={GB.lightest} />}
      {ops[2] && <rect x="17" y="20" width="6" height="20" fill={GB.lightest} />}
      {ops[3] && <rect x="0" y="17" width="20" height="6" fill={GB.lightest} />}
      <circle cx="20" cy="20" r="4" fill={GB.lightest} />
    </svg>
  );
}
