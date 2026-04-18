"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useUIStore } from "@/store/useUIStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { getXPProgress, getTitleForLevel } from "@/types/game";
import { ALL_TITLES } from "@/data/titles";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { titleName } from "@/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, useAnimationControls } from "framer-motion";

// XP 바 애니메이션 phase:
//  - "idle":  현재 진짜 % 에 머무름 (평시)
//  - "full":  레벨업 축하 — 100% 로 채우고 카운트 롤링이 끝날 때까지 유지
//  - "snap":  리셋 순간 — 0% 로 즉시 점프 (transition duration:0)
// full → snap → idle 3단 시퀀스로 "100% 에서 새 레벨 % 로 줄어드는 느낌" 을 없애고
// 전통적인 JRPG 식 "가득 채움 → 리셋 → 새로 차오름" 을 구현.
type BarPhase = "idle" | "full" | "snap";

export default function Header() {
  const progress = useGameStore((s) => s.progress);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const minigamePhase = useMinigameStore((s) => s.phase);
  // 스플래시 오버레이(z-[60])가 위를 덮지만, 헤더도 함께 unmount 시켜
  // splash 종료 순간 fade-in 으로 자연스럽게 등장.
  const splashActive = useUIStore((s) => s.splashActive);
  const capturePhase = useGrowthStore((s) => s.capturePhase);
  const pathname = usePathname();

  const { language } = useTranslation();

  const level = progress.level;
  // null = 아직 "실제 레벨값" 을 seed 받지 않음. isLoaded=true 가 된 후의
  // 첫 level 값을 기준점으로 삼아, store 기본값(0) → 실제값 전환이
  // 거짓 레벨업 애니메이션을 트리거하는 버그를 원천 차단한다.
  const prevLevelRef = useRef<number | null>(null);
  // 롤링 중에만 non-null — 평시에는 실제 level 을 그대로 표시해 setState-in-effect
  // 동기화를 피한다 (react-hooks/set-state-in-effect 규칙 준수).
  const [rollingLevel, setRollingLevel] = useState<number | null>(null);
  const [barPhase, setBarPhase] = useState<BarPhase>("idle");
  const pulseControls = useAnimationControls();

  // 평시에는 실제 level, 롤링 중에는 중간값. seed 단계나 store 기본값 0 이 잠깐
  // 보일 위험은 isLoaded 가드로 렌더 자체를 막음.
  const displayLevel = rollingLevel ?? level;

  // 레벨업 시 카운트업 + 펄스 애니메이션
  useEffect(() => {
    // 데이터 로드 전까지는 level 변화를 관찰하지 않음.
    // (초기 렌더: {level:0, isLoaded:false} → {level:realLevel, isLoaded:true} 순서로
    //  오는데, 앞 렌더에서 prevLevelRef 을 seed 하면 뒷 전환이 레벨업으로 오감지됨)
    if (!isLoaded || !hasCompletedOnboarding) return;

    // 첫 seed — 실제 레벨값을 조용히 기준점으로 확정. ref 만 갱신해서 setState 없음.
    if (prevLevelRef.current === null) {
      prevLevelRef.current = level;
      return;
    }

    if (level > prevLevelRef.current) {
      const start = prevLevelRef.current;
      const end = level;
      prevLevelRef.current = level;
      pulseControls.start({
        scale: [1, 1.25, 1],
        transition: { duration: 0.6, ease: "easeOut" },
      });

      // 단일 레벨업(예: 1→2)도 정수 한 단계가 보이도록 약간의 duration 부여
      const delta = end - start;
      const duration = delta <= 1 ? 600 : Math.min(800 + (delta - 1) * 120, 1400);

      // 모든 setState 를 rAF 콜백 안에서 호출 — react-hooks/set-state-in-effect
      // 규칙을 준수하면서 효과적으로 동일한 연출을 유지한다.
      let raf = 0;
      let snapRaf1 = 0;
      let snapRaf2 = 0;
      let startTime = 0;
      let primed = false;

      const tick = (now: number) => {
        if (!primed) {
          // 첫 프레임: (1) 바를 100% 로 채움, (2) 카운터를 start 로 리셋. 이후 롤링 시작.
          primed = true;
          startTime = now;
          setBarPhase("full");
          setRollingLevel(start);
          raf = requestAnimationFrame(tick);
          return;
        }
        const p = Math.min((now - startTime) / duration, 1);
        // easeOutQuad — 끝부분에서 부드럽게 정착
        const eased = 1 - (1 - p) * (1 - p);
        const next = Math.round(start + (end - start) * eased);
        if (p < 1) {
          setRollingLevel(next);
          raf = requestAnimationFrame(tick);
        } else {
          // 롤링 완료: rollingLevel 해제 → displayLevel 이 실제 level 로 즉시 반영
          setRollingLevel(null);
          // (3) 바를 0% 로 순간 점프 (transition duration:0)
          setBarPhase("snap");
          // (4) 다음 프레임에 idle 로 → 실제 새 레벨 % 로 부드럽게 차오름.
          // 이중 rAF: framer-motion 이 snap(width:0) 상태를 확정 처리할 시간을 확보.
          snapRaf1 = requestAnimationFrame(() => {
            snapRaf2 = requestAnimationFrame(() => setBarPhase("idle"));
          });
        }
      };
      raf = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(raf);
        if (snapRaf1) cancelAnimationFrame(snapRaf1);
        if (snapRaf2) cancelAnimationFrame(snapRaf2);
      };
    }

    // 레벨 동일/하향(서버 보정 등): ref 만 조용히 맞춤
    prevLevelRef.current = level;
  }, [level, isLoaded, hasCompletedOnboarding, pulseControls]);

  if (!isLoaded || !hasCompletedOnboarding || splashActive) return null;

  // 미니게임 런 중에는 몰입 모드: idle이 아닌 모든 phase에서 헤더 숨김
  // /minigame 직접 진입과 /playground 내 game 탭 양쪽 모두 커버
  const inMinigameRun =
    (pathname === "/minigame" || pathname === "/playground") && minigamePhase !== "idle";
  if (inMinigameRun) return null;

  // 사진 캡처 중에는 풀스크린 몰입 — 헤더 숨김
  if (capturePhase !== "idle") return null;

  const equippedTitle = progress.equippedTitleId
    ? ALL_TITLES.find((t) => t.id === progress.equippedTitleId)
    : null;
  // 레벨 롤링 애니메이션 중에는 displayLevel 기준으로 타이틀/XP 를 렌더해야
  // "Lv.4 에 Lv.5 타이틀/XP" 같은 모순 상태가 노출되지 않는다.
  const isLevelAnimating = displayLevel < progress.level;
  const title = equippedTitle
    ? titleName(equippedTitle, language)
    : getTitleForLevel(displayLevel, language);
  const titleColor = equippedTitle ? RARITY_CONFIG[equippedTitle.rarity].color : undefined;
  const { current, needed } = getXPProgress(progress.xp || 0, progress.level);
  const progressPercent = needed > 0 ? Math.min((current / needed) * 100, 100) : 0;

  // barPhase 에 따라 바 너비 결정
  const displayedPercent =
    barPhase === "full" ? 100 : barPhase === "snap" ? 0 : progressPercent;

  // Phase 9d-ⅰ — 페이지별 Header 분기.
  //   챌린지 (/ 루트) 에서만 풀 헤더 (Lv + 타이틀 + XP 숫자 + bar) — 여기가 진행 허브니까.
  //   그 외 페이지 (playground/collection/minigame/settings) 에서는 compact —
  //   Lv + 타이틀만 작게, XP 숫자/바 생략.
  //   이전: 모든 페이지에서 풀 헤더 → XP 바와 다음 탭 사이 여백이 너무 커 답답했음.
  const isFullHeader = pathname === "/";

  return (
    <motion.header
      // 스플래시 종료 직후 첫 mount 시 위에서 살짝 내려오며 fade-in — 하단 nav 의
      // rise 와 대칭 연출로 커튼이 열리는 듯한 리빌.
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      // Phase 9d-fix — 하단 요소 (IdleRewardToast 등) 가 Header 아래에 배치될 때
      //   참조할 수 있도록 `data-header-mode` 속성 부여. 실제 높이 계산은 DOM 측정이
      //   정확하지만 "full vs compact" 두 케이스만 있으므로 속성으로 충분.
      data-header-mode={isFullHeader ? "full" : "compact"}
      className={`sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-md border-b border-white/5 px-4 ${
        isFullHeader ? "py-3" : "py-2"
      } pt-[max(env(safe-area-inset-top),12px)]`}
    >
      <div className="max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.span
              animate={pulseControls}
              className={`font-display ${
                isFullHeader ? "typo-heading" : "typo-body"
              } text-accent inline-block origin-center`}
            >
              Lv.{displayLevel}
            </motion.span>
            <span
              className={isFullHeader ? "typo-body" : "typo-caption"}
              style={{ color: titleColor || "var(--text-primary)" }}
            >
              {title}
            </span>
          </div>
          {/* XP 숫자는 챌린지 페이지에서만 */}
          {isFullHeader && (
            <span
              className="typo-caption text-text-tertiary"
              style={{ visibility: isLevelAnimating ? "hidden" : "visible" }}
            >
              {current}/{needed} XP
            </span>
          )}
        </div>
        {/* XP Progress Bar — 챌린지 페이지에서만.
            compact 모드에서는 숨겨서 탭 ↔ 헤더 사이 여백이 자연스럽게 짧아짐.
            initial={false}: 첫 마운트 시 0→realPercent 로 차오르는 "오토 인트로" 를 비활성.
            초기 로드에서 0 → 100% → 줄어들기 처럼 보이던 현상의 1차 원인이었음.
            대신 정확한 % 로 즉시 표시되고, 이후 legit level-up 때만 full→snap→idle 시퀀스로 연출. */}
        {isFullHeader && (
          <div className="mt-1.5 h-1.5 bg-bg-elevated rounded-sm overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-sm"
              initial={false}
              animate={{ width: `${displayedPercent}%` }}
              transition={
                barPhase === "snap"
                  ? { duration: 0 }
                  : { duration: 0.6, ease: [0.23, 1, 0.32, 1] }
              }
            />
          </div>
        )}
      </div>
    </motion.header>
  );
}
