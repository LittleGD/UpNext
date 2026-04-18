"use client";

/**
 * Up Hero — 보스 등장 연출.
 *
 * 구조:
 *  - 풀스크린 오버레이 (DungeonView 내부 absolute inset-0)
 *  - 2.4s 동안 표시 후 자동 dismiss → onDone 콜백으로 부모에게 알림
 *  - 연출 타임라인:
 *    0~200ms   : 빨간 flash (화면 전체)
 *    200~600ms : 보스 이모지 + 이름 엔터 (scale 0.9→1, opacity 0→1)
 *    600~1600ms: hold (사용자가 읽을 시간)
 *    1600~2400ms: exit (opacity 1→0)
 *
 * 디자인 노트:
 *  - 앱 디자인 규칙: "보더 금지" → 보스 네임 타이포그래피로만 강조
 *  - accent-secondary (var(--accent-secondary)) = 앱의 "경고/위험" 토큰 → 보스 프레이밍에 재활용
 *  - 레트로 예외 허용: Game Boy 픽셀 느낌은 유지하되 보스 순간만 앱 토큰 활용
 */

import { useEffect, useRef } from "react";
import type { Monster } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import MonsterSprite from "./MonsterSprite";

interface BossBannerProps {
  monster: Monster;
  floor: number;
  onDone: () => void;
}

const BANNER_DURATION = 2400;

export default function BossBanner({ monster, floor, onDone }: BossBannerProps) {
  // onDone reference 가 매 render 마다 변해도 effect 재실행 막기 — ref 패턴
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = window.setTimeout(() => {
      onDoneRef.current();
    }, BANNER_DURATION);
    return () => window.clearTimeout(id);
  }, []); // mount 시 1회만

  // Phase 11c R2 — tap-to-skip. 30-run/day 유저가 매번 2.4s 대기 안 하도록.
  //   첫 etc 유저도 화면 대기 부담 없이 자연스럽게 탭하면 skip.
  const handleSkip = () => {
    onDoneRef.current();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center font-mono cursor-pointer"
      onClick={handleSkip}
      role="button"
      tabIndex={0}
      aria-label="보스 등장 — 탭해서 건너뛰기"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSkip();
        }
      }}
      style={{ animation: `boss-fade ${BANNER_DURATION}ms ${EASE_OUT} forwards` }}
    >
      {/* 빨간 flash 레이어 */}
      <div
        className="absolute inset-0"
        style={{
          background: "var(--accent-secondary)",
          animation: "boss-flash 520ms ease-out forwards",
        }}
      />

      {/* 다크 배경 레이어 (flash 이후 그림 지워지는 대신 어두운 정지) */}
      <div
        className="absolute inset-0"
        style={{
          background: `${GB.darkest}ee`,
          opacity: 0,
          animation: "boss-bg-in 520ms 180ms ease-out forwards",
        }}
      />

      {/* 콘텐츠 */}
      <div
        className="relative flex flex-col items-center gap-4 px-8"
        style={{
          animation: "boss-content 600ms 320ms cubic-bezier(0.23, 1, 0.32, 1) both",
        }}
      >
        {/* typo-micro 예외: wide-tracking accent 라벨 (본문 아님, letter-spacing 0.3em 으로 tiny label 감성) */}
        <div
          className="typo-micro"
          style={{ color: "var(--accent-secondary)", letterSpacing: "0.3em" }}
        >
          BOSS APPEARED
        </div>

        {/* 보스 픽셀 스프라이트 — 크게. tremor 로 살짝 떨림 */}
        <div
          style={{
            animation: "boss-tremor 180ms steps(2, end) 6",
            lineHeight: 0,
          }}
        >
          <MonsterSprite
            kind={monster.kind}
            size={96}
            color="var(--accent-secondary)"
            glow
          />
        </div>

        {/* 이름 — typo-title 로 크게, 대비 강한 타이포 */}
        <div
          className="typo-title text-center"
          style={{
            letterSpacing: "0.06em",
            color: GB.lightest,
            // color-mix 로 토큰 알파 블렌드 (50% alpha)
            textShadow: "0 0 12px color-mix(in srgb, var(--accent-secondary) 50%, transparent)",
          }}
        >
          {monster.name}
        </div>

        {/* 층 / 스탯 */}
        <div
          className="flex items-center gap-3 typo-caption tabular-nums"
          style={{ color: GB.light }}
        >
          <span style={{ color: "var(--accent-secondary)" }}>F{floor}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>HP {monster.hp}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>ATK {monster.atk}</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes boss-fade {
          0%,
          85% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes boss-flash {
          0% {
            opacity: 0;
          }
          25% {
            opacity: 0.7;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes boss-bg-in {
          to {
            opacity: 1;
          }
        }
        @keyframes boss-content {
          from {
            opacity: 0;
            transform: scale(0.92);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes boss-tremor {
          0%,
          100% {
            transform: translate(0, 0);
          }
          25% {
            transform: translate(-1px, -1px);
          }
          50% {
            transform: translate(1px, 0);
          }
          75% {
            transform: translate(-1px, 1px);
          }
        }
      `}</style>
    </div>
  );
}
