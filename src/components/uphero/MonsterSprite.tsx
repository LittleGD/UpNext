"use client";

/**
 * Up Hero — MonsterSprite.
 *
 * pixelarticons 라이브러리에는 동물/몬스터 픽셀 아이콘이 없어,
 * 같은 무드 (dot-matrix, 얇은 단일 색선) 로 직접 그림.
 *
 * 해상도: 12×12 grid — 8×8 대비 세부 실루엣 구분 가능.
 *
 * 각 kind 는 2개 frame 을 가지며 `steps(2)` CSS 로 교체됨 →
 * 옛날 게임보이 스프라이트 애니메이션 느낌 (smooth animation 이 아닌 frame swap).
 *
 * kind 별 실루엣 + idle 동작:
 *  - beast (4족 짐승) — 걷는 동작 (다리 교차)
 *  - goblin (인간형) — 팔 흔듦
 *  - spirit (떠다니는 영혼) — 위아래 부유
 *  - construct (기계/골렘) — 눈 점멸
 *  - book (떠다니는 책) — 페이지 넘김
 *  - creature (새/비정형) — 날개 펄럭
 *  - large (보스) — pulsate
 */

import { memo, type CSSProperties } from "react";

export type MonsterKind =
  | "beast"
  | "goblin"
  | "spirit"
  | "construct"
  | "book"
  | "creature"
  | "large";

interface MonsterSpriteProps {
  kind: MonsterKind;
  size?: number;
  color?: string;
  /** 보스용 글로우 */
  glow?: boolean;
  /** idle 애니메이션 속도 — 빠를수록 움직임 ↑ */
  animationMs?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Frames: 각 kind 는 [frame1, frame2] — 12×12 grid.
 * '#' = filled, '.' = transparent.
 *
 * 실루엣 설계:
 *  - beast: 머리/귀 + 4다리 명확. frame2 는 다리 위치 바뀜 (걷기).
 *  - goblin: 머리/몸통/2팔2다리. frame2 는 팔 위쪽으로.
 *  - spirit: 구름+꼬리. frame 간 y축 진동.
 *  - construct: 각진 머리+몸통, 볼트. frame2 는 눈 감은 픽셀.
 *  - book: 펼친 책. frame2 는 페이지 넘김 (중앙선 시프트).
 *  - creature: 날개 달린 생물체. frame2 는 날개 접힘.
 *  - large: 뿔+큰 몸통. frame2 는 pulsate (몸통 한 줄 확장).
 */
const FRAMES: Record<MonsterKind, [string[], string[]]> = {
  beast: [
    [
      "............",
      "............",
      "...##....##.",
      "..####.####.",
      ".####.####..",
      ".##########.",
      ".##.####.##.",
      ".##########.",
      ".##......##.",
      ".##......##.",
      ".##......##.",
      "............",
    ],
    [
      "............",
      "............",
      "...##....##.",
      "..####.####.",
      ".####.####..",
      ".##########.",
      ".##.####.##.",
      ".##########.",
      "..##....##..",
      ".##......##.",
      "##........##",
      "............",
    ],
  ],
  goblin: [
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      ".##########.",
      "##.######.##",
      "...######...",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "###########.",
      "..########..",
      "##.######.##",
      "...######...",
      "...##..##...",
      "...##..##...",
      "..##....##..",
    ],
  ],
  spirit: [
    [
      "............",
      "....####....",
      "..########..",
      ".#..####..#.",
      ".##########.",
      ".##.##.##.##",
      ".##########.",
      ".##########.",
      "..#..##..#..",
      "...#.##.#...",
      "....####....",
      "............",
    ],
    [
      "............",
      "............",
      "....####....",
      "..########..",
      ".#..####..#.",
      ".##########.",
      ".##.##.##.##",
      ".##########.",
      ".##########.",
      "..#..##..#..",
      "...#.##.#...",
      "....####....",
    ],
  ],
  construct: [
    [
      "............",
      ".#........#.",
      ".##########.",
      ".##.####.##.",
      ".####..####.",
      ".####..####.",
      ".##########.",
      ".##########.",
      ".##.####.##.",
      ".##.####.##.",
      ".#........#.",
      "............",
    ],
    [
      "............",
      ".#........#.",
      ".##########.",
      ".##.####.##.",
      ".##########.",
      ".##########.",
      ".##########.",
      ".##########.",
      ".##.####.##.",
      ".##.####.##.",
      ".#........#.",
      "............",
    ],
  ],
  book: [
    [
      "............",
      "............",
      ".##.####.##.",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      ".##########.",
    ],
    [
      "............",
      "............",
      "##.####.##..",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      "##.######.##",
      ".##########.",
    ],
  ],
  creature: [
    [
      "............",
      ".##......##.",
      "####....####",
      "############",
      ".##########.",
      ".##.####.##.",
      ".##########.",
      "..########..",
      "...######...",
      "....####....",
      "....####....",
      ".....##.....",
    ],
    [
      "............",
      "............",
      "...######...",
      "..########..",
      ".##########.",
      "############",
      ".##.####.##.",
      ".##########.",
      "..########..",
      "...######...",
      "....####....",
      ".....##.....",
    ],
  ],
  large: [
    [
      ".#........#.",
      "##........##",
      "############",
      "##.######.##",
      "##..####..##",
      "############",
      "############",
      "##..####..##",
      ".##########.",
      ".##.####.##.",
      ".##......##.",
      "............",
    ],
    [
      ".##......##.",
      "###......###",
      "############",
      "##.######.##",
      "##..####..##",
      "############",
      "############",
      "##########.",
      ".##########.",
      ".##.####.##.",
      "##........##",
      "............",
    ],
  ],
};

/**
 * 데이터 URL 로 인코드된 1-frame SVG 를 만든다.
 * CSS background-image 로 쓰고 `background-position` 또는 `content: url()` 교체로
 * animation 없이도 "frame swap" 을 구현.
 *
 * 여기서는 simpler: 두 SVG 모두 DOM 에 렌더하고 `steps(2)` animation 으로
 * 하나씩만 opacity 1 / 0 번갈아 보이게 해 frame swap 감성을 만든다.
 */
function renderGrid(grid: string[], color: string): React.ReactNode {
  return grid.map((row, y) =>
    row.split("").map((cell, x) =>
      cell === "#" ? (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ) : null,
    ),
  );
}

// Phase 12 R14 — 부모 (DungeonView, HeroCodex 등) 가 상위 상태 변동으로
//   리렌더될 때 props 가 동일하면 skip. kind/size/color/glow 가 안정적이라
//   ref equality 로 충분.
function MonsterSpriteInner({
  kind,
  size = 32,
  color = "currentColor",
  glow = false,
  animationMs = 700,
  style,
  className,
}: MonsterSpriteProps) {
  const [frame1, frame2] = FRAMES[kind];

  // glow 효과는 color 가 hex 든 var() 든 모두 커버하도록 color-mix 사용.
  // color-mix 는 Safari 16.2+, Chrome 111+ 지원 — 현재 웹 기준 OK.
  const glowFilter = glow
    ? `drop-shadow(0 0 4px color-mix(in srgb, ${color} 50%, transparent))`
    : undefined;

  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        position: "relative",
        width: size,
        height: size,
        lineHeight: 0,
        filter: glowFilter,
        ...style,
      }}
      role="img"
      aria-hidden="true"
    >
      <svg
        className="ms-frame ms-frame-1"
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0 }}
      >
        {renderGrid(frame1, color)}
      </svg>
      <svg
        className="ms-frame ms-frame-2"
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0 }}
      >
        {renderGrid(frame2, color)}
      </svg>
      <style jsx>{`
        .ms-frame {
          animation-duration: ${animationMs}ms;
          animation-iteration-count: infinite;
          animation-timing-function: steps(2, end);
        }
        .ms-frame-1 {
          animation-name: ms-flip-1;
        }
        .ms-frame-2 {
          animation-name: ms-flip-2;
        }
        @keyframes ms-flip-1 {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }
        @keyframes ms-flip-2 {
          0%,
          49% {
            opacity: 0;
          }
          50%,
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

const MonsterSprite = memo(MonsterSpriteInner);
export default MonsterSprite;
