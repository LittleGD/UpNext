"use client";

/**
 * Up Hero — HeroSprite.
 *
 * MonsterSprite 와 동일한 구조 (12×12 dot-matrix + 2-프레임 swap 애니메이션) 로
 * 영웅을 그린다. 이렇게 해야 캠프의 영웅과 던전의 몬스터가 같은 "세계관" 에
 * 속해 보인다 (브랜드/무드 일관).
 *
 * idle 모션: 2 프레임 swap
 *  - frame1: 가만히 선 자세
 *  - frame2: 살짝 들썩 (양팔이 살짝 바깥으로 / 허리가 한 픽셀 낮음)
 *
 * appearanceVariant: 레벨별 외형 변화 — Phase 3+ 에서 확장
 *  - 0: 견습 (작은 체형)
 *  - 1: 도전자 (투구 추가)
 *  - 2: 실천가 (갑옷)
 */

import type { CSSProperties } from "react";
import type { ClassType } from "@/types/uphero";

/** Phase 4c-polish — 전투 중 영웅 상태. parent 가 전환 타이밍 제어. */
export type HeroSpriteState = "idle" | "attack" | "hurt";

interface HeroSpriteProps {
  variant?: 0 | 1 | 2;
  /**
   * Phase 6a — class 분화 이후 영웅 외형. 제공되면 VARIANTS 대신
   * CLASS_VARIANTS[classType] 사용. null/undefined 면 variant (level 기반).
   */
  classType?: ClassType | null;
  size?: number;
  color?: string;
  animationMs?: number;
  /** 전투 상태 — idle 기본. attack/hurt 는 240ms one-shot 효과 */
  state?: HeroSpriteState;
  /**
   * Phase 6c — sprite 위 짧은 심볼 pulse.
   * - "dodge": ✦ 파랑 (monk 회피 성공)
   * - "crit": ◇ 보라 (illusionist crit 발동)
   * parent 가 감지해서 값을 설정하고, 애니메이션 끝나면 null 로 reset.
   */
  pulseOverlay?: "dodge" | "crit" | null;
  style?: CSSProperties;
}

/** 12×12 frames — '#' filled, '.' transparent */
const VARIANTS: Record<0 | 1 | 2, [string[], string[]]> = {
  // 견습생 — 머리+몸통+팔다리. frame2 는 팔 바깥으로, 허리 한줄 낮게.
  0: [
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "...######...",
      "..########..",
      ".##########.",
      "..########..",
      "...##..##...",
      "...##..##...",
      "..##....##..",
    ],
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "...######...",
      ".##########.",
      "############",
      "..########..",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // 도전자 — Lv 10+ : 투구/뿔 디테일
  1: [
    [
      "...#....#...",
      "...##..##...",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "...######...",
      "..########..",
      ".##########.",
      "..########..",
      "...##..##...",
      "..##....##..",
    ],
    [
      "...#....#...",
      "...##..##...",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "...######...",
      ".##########.",
      "############",
      "..########..",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // 실천가 — Lv 30+ : 큰 갑옷, 어깨 뿔
  2: [
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      ".##.####.##.",
      "############",
      "##.######.##",
      "..########..",
      "...##..##...",
      "..##....##..",
    ],
    [
      "............",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      "##.####.####",
      "############",
      "##.######.##",
      "..########..",
      "..##....##..",
      ".##......##.",
    ],
  ],
};

/**
 * Phase 6a — 클래스별 sprite variant.
 * Lv30+ 분화 이후 외형이 class 로 교체. 이전은 기존 level variant 유지.
 *
 * 디자인 기준:
 * - 기본 body silhouette (12×12) 는 유지하되 class 별 실루엣 요소 1-2개
 * - 머리: 모자/관/헬멧으로 차별
 * - 손/옆: 무기/도구 silhouette
 * - frame2 는 frame1 대비 살짝 움직임 (어깨 up/down, 팔 흔들림)
 */
const CLASS_VARIANTS: Record<ClassType, [string[], string[]]> = {
  // Warrior — 왼쪽 방패 + 오른쪽 검, 뿔 달린 헬멧
  warrior: [
    [
      ".....##.....",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########.#", // 오른쪽 검 시작
      "#.########.#",
      "#.########.#", // 왼쪽 방패 + 오른쪽 검날
      "#.########.#",
      "..########..",
      "...##..##...",
      "..##....##..",
    ],
    [
      ".....##.....",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########.#",
      "#.##########",
      "#.##########",
      "#.########.#",
      "..########..",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // Mage — 뾰족한 모자 + 오른쪽 지팡이 끝에 구슬
  mage: [
    [
      "....#......#", // 모자 첨단 + 지팡이 구슬
      "...###.....#",
      "..#####....#",
      ".#######...#",
      "...##..##..#", // 머리 + 지팡이
      "..######..##",
      "..########.#",
      ".##########.",
      "..########..",
      "...##..##...",
      "...##..##...",
      "..##....##..",
    ],
    [
      "....#......#",
      "...###.....#",
      "..#####....#",
      ".#######...#",
      "...##..##..#",
      "..########.#",
      ".##########.",
      "############",
      "..########..",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // Monk — 좌선 자세 (다리 교차, 넓은 하체). 이마에 점.
  monk: [
    [
      "............",
      "....####....",
      "...######...",
      "...##.#.##..", // 이마 점
      "...######...",
      "...######...",
      "..########..",
      ".##########.",
      "############",
      ".##########.",
      "###########.", // 넓은 교차 다리
      "############",
    ],
    [
      "............",
      "....####....",
      "...######...",
      "...##.#.##..",
      "...######...",
      "..########..",
      ".##########.",
      "############",
      "############",
      "############",
      "###########.",
      "############",
    ],
  ],
  // Druid — 잎사귀 관 + 양손 작은 새싹
  druid: [
    [
      "..#.#..#.#..", // 잎 끝단
      ".###.##.###.",
      ".##########.",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      "#.########.#", // 양손 새싹
      "#.########.#",
      "..########..",
      "...##..##...",
      "..##....##..",
    ],
    [
      "..#.#..#.#..",
      ".###.##.###.",
      ".##########.",
      "...######...",
      "...##..##...",
      "...######...",
      "#.########.#",
      "############",
      "..########..",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // Bard — 깃털 모자 + 오른쪽 류트
  bard: [
    [
      ".......#....", // 깃털
      "...####.#...",
      "..######.#..",
      "..######.##.", // 류트 body 위
      "...##..##.#.",
      "...######.#.",
      "..########.#",
      ".##########.",
      "..########..",
      "...##..##...",
      "...##..##...",
      "..##....##..",
    ],
    [
      ".......#....",
      "...####.#...",
      "..######.#..",
      "..######.##.",
      "...##..##.#.",
      "..########.#",
      ".##########.",
      "############",
      "..########..",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // Chronomancer — 시계 톱니 관 + 좌우 대칭
  chronomancer: [
    [
      ".#.#..#.#...", // 기어 이빨
      "##.######.##",
      ".##########.", // 기어 바닥
      "...######...",
      "...##..##...",
      "...######...",
      "#.########.#", // 양쪽 팔
      ".##########.",
      "..########..",
      "...##..##...",
      "...##..##...",
      "..##....##..",
    ],
    [
      ".#.#..#.#...",
      "##.######.##",
      ".##########.",
      "...######...",
      "...##..##...",
      "..########..",
      ".##########.",
      "############",
      "..########..",
      "...##..##...",
      "..##....##..",
      ".##......##.",
    ],
  ],
  // Priest — 머리 위 후광 + 길고 넓은 로브
  priest: [
    [
      "...######...", // 후광
      "..########..",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      ".##########.",
      ".##########.",
      "############", // 긴 로브
      ".##########.",
      ".##########.",
    ],
    [
      "...######...",
      "..########..",
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      ".##########.",
      "############",
      "############",
      ".##########.",
      ".##########.",
      "############",
    ],
  ],
  // Illusionist — 머리 뒤 구체 + 뒤로 흘러내리는 망토
  illusionist: [
    [
      "............",
      ".##.####.##.", // 망토 어깨
      "###.####.###", // 머리 뒤 구체 좌우
      "....####....",
      "...######...",
      "...##..##...",
      "...######...",
      "..########..",
      ".##########.", // 망토 아래
      "############",
      "...##..##...",
      "..##....##..",
    ],
    [
      "............",
      ".##.####.##.",
      "###.####.###",
      "....####....",
      "...######...",
      "...##..##...",
      "..########..",
      ".##########.",
      "############",
      ".##########.",
      "..##....##..",
      ".##......##.",
    ],
  ],
};

function renderGrid(grid: string[], color: string): React.ReactNode {
  return grid.map((row, y) =>
    row.split("").map((cell, x) =>
      cell === "#" ? (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ) : null,
    ),
  );
}

export default function HeroSprite({
  variant = 0,
  classType = null,
  size = 64,
  color = "currentColor",
  animationMs = 900,
  state = "idle",
  pulseOverlay = null,
  style,
}: HeroSpriteProps) {
  // Phase 6a: classType 제공되면 CLASS_VARIANTS, 없으면 기존 level VARIANTS.
  const [frame1, frame2] = classType
    ? CLASS_VARIANTS[classType]
    : VARIANTS[variant];

  // attack/hurt 는 transform/filter 로 구현 — 별도 frame 매트릭스 필요 없음.
  // attack: 살짝 오른쪽 앞으로 뛰쳐나가는 기울기
  // hurt: 왼쪽으로 밀리며 brightness 살짝 낮춤 (피격 충격)
  const stateClass =
    state === "attack"
      ? "hs-attack"
      : state === "hurt"
        ? "hs-hurt"
        : "";

  return (
    <div
      className={stateClass}
      style={{
        display: "inline-block",
        position: "relative",
        width: size,
        height: size,
        lineHeight: 0,
        transformOrigin: "50% 100%",
        ...style,
      }}
      role="img"
      aria-hidden="true"
    >
      <svg
        className="hs-frame hs-frame-1"
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0 }}
      >
        {renderGrid(frame1, color)}
      </svg>
      <svg
        className="hs-frame hs-frame-2"
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0 }}
      >
        {renderGrid(frame2, color)}
      </svg>
      {/* Phase 6c — pulse overlay (monk dodge / illusionist crit) */}
      {pulseOverlay === "dodge" && (
        <div
          className="uphero-dodge-pulse absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            color: "#6bb1e5",
            fontSize: size * 0.55,
            textShadow: "0 0 8px #6bb1e5cc",
            fontWeight: 700,
          }}
        >
          ✦
        </div>
      )}
      {pulseOverlay === "crit" && (
        <div
          className="uphero-crit-pulse absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            color: "#c9b8e8",
            fontSize: size * 0.5,
            textShadow: "0 0 10px #c9b8e8cc",
            fontWeight: 700,
          }}
        >
          ◇
        </div>
      )}
      <style jsx>{`
        .hs-frame {
          animation-duration: ${animationMs}ms;
          animation-iteration-count: infinite;
          animation-timing-function: steps(2, end);
        }
        .hs-frame-1 {
          animation-name: hs-flip-1;
        }
        .hs-frame-2 {
          animation-name: hs-flip-2;
        }
        @keyframes hs-flip-1 {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }
        @keyframes hs-flip-2 {
          0%,
          49% {
            opacity: 0;
          }
          50%,
          100% {
            opacity: 1;
          }
        }

        /* attack 상태: 오른쪽으로 튀어나갔다 제자리 */
        :global(.hs-attack) {
          animation: hs-attack 240ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        @keyframes hs-attack {
          0%   { transform: translateX(0) rotate(0); }
          40%  { transform: translateX(5px) rotate(-8deg); }
          100% { transform: translateX(0) rotate(0); }
        }

        /* hurt 상태: 왼쪽 피격 반동 + brightness 낮춤 */
        :global(.hs-hurt) {
          animation: hs-hurt 260ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        @keyframes hs-hurt {
          0%   { transform: translateX(0); filter: brightness(1); }
          25%  { transform: translateX(-4px); filter: brightness(0.55) saturate(0.6); }
          55%  { transform: translateX(1px); filter: brightness(1.1); }
          100% { transform: translateX(0); filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
