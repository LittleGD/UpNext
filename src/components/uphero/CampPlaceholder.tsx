"use client";

/**
 * Up Hero — 캠프.
 *
 * 구조:
 *  - view="home": 영웅 (이름 + idle 모션) + 3 CTA (탐험 시작 / 상점 / 장비)
 *  - view="dungeons": 뒤로 + 8 던전 그리드
 *  - view="shop": 뒤로 + 상점 품목
 *
 * 디자인 규칙:
 *  - 이모지 사용 금지 → `PixelIcon` (pixelarticons) 로 통일
 *  - 타이포그래피는 앱 디자인 시스템의 typo-* 클래스 사용 (font-family=April16th)
 *  - GB 팔레트/보더는 게임 예외로 유지 (레트로 UI 본질)
 *  - 터치 영역 ≥ 40px (모바일 접근성)
 *
 * 크기: `calc(100dvh - 208px)` — tab/BottomNav/헤더 제외한 window 형태
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore, getTodayString } from "@/store/useGameStore";
import { DAILY_CARDMATCH_TICKET_CAP } from "@/types/game";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { ALL_CARDS } from "@/data/cards";
import { pickCampAmbience } from "@/data/upHeroFlavor";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import {
  SHOP_PRICES,
  ENHANCE_GUARD_MAX,
  PASS_CAP_PER_CATEGORY,
  DAILY_PASS_PURCHASE_CAP,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import { useHeroLevel, useHeroXpProgress } from "./useHeroLevel";
import type { DungeonId } from "@/types/uphero";
import { isAdAvailable, showRewardedAd } from "@/lib/ads";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import {
  dungeonName,
  weeklyAffixName,
  weeklyAffixDescription,
} from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "./GbConfirm";
import HeroSprite from "./HeroSprite";
import { getHeroAppearanceVariant } from "@/types/uphero";
import BuffDrawPanel from "./BuffDrawPanel";
import NumberRoll from "./NumberRoll";

// Phase 9b — view === "home" 일 땐 필요 없는 대형 컴포넌트 (합계 ~2250줄) 를
//   lazy 로 내려 초기 번들에서 제외. Suspense fallback 으로 skeleton 제공.
//   EquipmentInventory 는 EquipmentCard + 템플릿 데이터까지 끌고 오므로 특히 무거움.
const EquipmentInventory = lazy(() => import("./EquipmentInventory"));
const HeroCodex = lazy(() => import("./HeroCodex"));
const HeroStatPanel = lazy(() => import("./HeroStatPanel"));
// 아지트 첫 진입 튜토리얼 — 1회용 리소스라 lazy 로 내려 초기 번들 제외.
const CampTutorialOverlay = lazy(() => import("./CampTutorialOverlay"));

/** 카테고리 → pixelarticons 이름 (라이브러리에서 고른 무드 매칭) */
const CATEGORY_ICON: Record<DungeonId, string> = {
  fitness: "Human",
  learning: "BookOpen",
  mindfulness: "Moon",
  nutrition: "Coffee",
  social: "Message",
  productivity: "Clock",
  wellness: "Heart",
  trending: "Sparkle",
};

type View = "home" | "dungeons" | "shop" | "equipment" | "codex" | "weekly";

export default function CampPlaceholder() {
  const coins = useUpHeroStore((s) => s.coins);
  const passes = useUpHeroStore((s) => s.passes);
  const hero = useUpHeroStore((s) => s.hero);
  // Phase 12a — header 에 hero.name 노출. 기본값은 i18n 에서 조회 (언어별).
  const { t } = useTranslation();
  const heroName = hero.name?.trim() || t("uphero.home.heroDefault");
  const pendingDungeon = useUpHeroStore((s) => s.pendingDungeon);
  // Phase 2-A (Track A) — 영웅 레벨과 XP 진행도는 영웅 전용 풀(heroXp) 기준.
  //   계정 XP(progress.xp)와 완전히 분리됐다 — 상단바 수치는 영웅 곡선 안의 진행도.
  const level = useHeroLevel();
  const xpInfo = useHeroXpProgress();
  const tickets = useGameStore((s) => s.progress.tickets ?? 0);
  // Phase 12 — header 에 NG+ badge 노출. 홈 view 의 nameplate 를 제거하면서
  //   NG+ 정보를 header 로 승격 (정보가 사라지지 않도록). ngPlusLevel > 0 일
  //   때만 렌더.
  const ngPlusLevel = useUpHeroStore((s) => s.ngPlusLevel ?? 0);

  const [view, setView] = useState<View>("home");
  const [toast, setToast] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  // 아지트 첫 진입 튜토리얼 — 유저가 완료/Skip 누르면 persist 되어 재등장 안 함.
  const hasSeenCampTutorial = useUpHeroStore((s) => s.hasSeenCampTutorial ?? false);
  const [tutorialOpen, setTutorialOpen] = useState(() => !hasSeenCampTutorial);

  const totalPasses = Object.values(passes).reduce(
    (a, b) => (a ?? 0) + (b ?? 0),
    0,
  ) as number;

  // Phase 13 review #10 — toast dismiss timer cleanup.
  //   이전엔 `setTimeout(() => setToast(null), 2000)` 가 unmount 이후에도 fire →
  //   dev console 의 "state update on unmounted component" warning. 이제 ref 로
  //   timer id 추적 + unmount cleanup + 중복 호출 시 이전 timer clear.
  const toastTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);
  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2000);
  };

  return (
    <div
      className="overflow-hidden flex flex-col relative rounded-md"
      style={{
        background: GB.darkest,
        color: GB.light,
        // 캠프 = tab + bottomnav 위쪽 공간 전체 점유 (대략 100dvh - 앱 chrome)
        height: "calc(100dvh - 208px)",
        minHeight: 480,
      }}
    >
      {/* === Header (글로벌) ===
           Phase 12a — "갓생 영웅" 하드코딩 → hero.name 표시. 카드매치 티켓 표기
           제거 (탐험권과 혼동 방지). 티켓은 상점/카드매치 진입 시에만 표시. */}
      <header
        className="px-4 py-3 flex items-center justify-between shrink-0 typo-caption"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ color: GB.lightest }}
            className="truncate"
            title={heroName}
          >
            {heroName}
          </span>
          <span className={gbClass.textDim}>{t("common.levelShort", { level })}</span>
          {/* Phase 12 — XP 진행도 수치 표시. Phase 2-A: 영웅 XP 풀(heroXp) 안의
               현재 레벨 진행도 (getHeroXPProgress). 계정 XP 와는 무관하다. */}
          <span
            className={`tabular-nums ${gbClass.textDim}`}
            style={{ fontSize: 11 }}
            aria-label={t("uphero.camp.xpAria", {
              current: xpInfo.current,
              needed: xpInfo.needed,
            })}
          >
            {xpInfo.current}/{xpInfo.needed} XP
          </span>
          {/* Phase 12 — NG+ badge (F30 최초 클리어 이후). 기존엔 HomeView 의
               nameplate 옆에 있었으나 nameplate 제거 (유저: "왼쪽 위 이름과
               중복") 되면서 header 로 승격. ngPlusLevel > 0 일 때만 렌더. */}
          {ngPlusLevel > 0 && (
            <span
              className="typo-micro px-1.5 py-0.5 rounded-sm tabular-nums"
              style={{
                color: "#e8b887",
                background: `${"#e8b887"}22`,
                border: `1px solid #e8b887`,
                letterSpacing: "0.05em",
                fontSize: 10,
              }}
              aria-label={`NG+ ${ngPlusLevel}`}
              title={t("uphero.camp.ngPlusTitle")}
            >
              NG+{ngPlusLevel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <PixelIcon name="Coins" size={14} color={GB.light} />
            {/* Phase 8b — coin 변화 시 slot-roll 로 "획득/소모" 감각 전달 */}
            <NumberRoll
              value={coins}
              style={{ color: GB.lightest }}
              gainColor="#e8c76b"
              lossColor="#e88b7a"
            />
          </span>
        </div>
      </header>

      {/* === Body — view 전환. pendingDungeon 이 최우선 (confirm/cancel 대기) ===
             Phase 12 bugfix — 유저 제보: "캐릭터가 상단바를 침범". 짧은 뷰포트
             (iPhone SE 등) 에서 HomeView 의 `justify-center` 콘텐츠가 수직
             overflow → header 영역까지 bleed. body wrapper 에 overflow-hidden
             을 걸어 header/CTA 경계에서 콘텐츠 clip. 다른 view 에도 안전 적용. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {pendingDungeon && <BuffDrawPanel />}
        {!pendingDungeon && view === "home" && (
          <HomeView
            hero={hero}
            heroLevel={level}
            totalPasses={totalPasses}
            onOpenDungeons={() => {
              if (totalPasses <= 0) {
                notify(t("uphero.camp.passRequired.withHint"));
                return;
              }
              setView("dungeons");
            }}
            onOpenShop={() => setView("shop")}
            onOpenEquipment={() => setView("equipment")}
            onOpenCodex={() => setView("codex")}
            onOpenStats={() => setStatsOpen(true)}
            onOpenWeekly={() => setView("weekly")}
          />
        )}
        {!pendingDungeon && view === "weekly" && (
          <WeeklyView onBack={() => setView("home")} onNotify={notify} />
        )}
        {!pendingDungeon && view === "dungeons" && (
          <DungeonsView
            onBack={() => setView("home")}
            onNotify={notify}
          />
        )}
        {!pendingDungeon && view === "shop" && (
          <ShopView
            onBack={() => setView("home")}
            coins={coins}
            tickets={tickets}
            onNotify={notify}
          />
        )}
        {!pendingDungeon && view === "equipment" && (
          <Suspense fallback={<LazyViewFallback />}>
            <EquipmentInventory
              onBack={() => setView("home")}
              onNotify={notify}
            />
          </Suspense>
        )}
        {!pendingDungeon && view === "codex" && (
          <Suspense fallback={<LazyViewFallback />}>
            <HeroCodex onBack={() => setView("home")} />
          </Suspense>
        )}
      </div>

      {/* HeroStatPanel — 영웅 sprite 탭 시 overlay.
           Portal 기반이라 null fallback 으로 두고 로딩 시엔 아무것도 안 뜸 (fast open). */}
      {statsOpen && (
        <Suspense fallback={null}>
          <HeroStatPanel onClose={() => setStatsOpen(false)} />
        </Suspense>
      )}

      {/* 아지트 첫 진입 튜토리얼 — home view 에서만, 1회 노출. */}
      {tutorialOpen && view === "home" && !pendingDungeon && (
        <Suspense fallback={null}>
          <CampTutorialOverlay onClose={() => setTutorialOpen(false)} />
        </Suspense>
      )}

      {/* === Toast === */}
      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-4 px-3 py-1.5 typo-caption rounded pointer-events-none z-20"
          style={{
            background: GB.darkest,
            color: GB.lightest,
            border: `1px solid ${GB.light}`,
            animation: `uphero-toast 200ms ${EASE_OUT} both`,
          }}
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        @keyframes uphero-toast {
          from {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

function HomeView({
  hero,
  heroLevel,
  totalPasses,
  onOpenDungeons,
  onOpenShop,
  onOpenEquipment,
  onOpenCodex,
  onOpenStats,
  onOpenWeekly,
}: {
  hero: { name: string; classType: import("@/types/uphero").ClassType | null };
  heroLevel: number;
  totalPasses: number;
  onOpenDungeons: () => void;
  onOpenShop: () => void;
  onOpenEquipment: () => void;
  onOpenCodex: () => void;
  onOpenStats: () => void;
  onOpenWeekly: () => void;
}) {
  const { play } = useSound();
  const { t } = useTranslation();
  const variant = getHeroAppearanceVariant(heroLevel) as 0 | 1 | 2;
  // Phase 11c — NG+ / 주간 악몽 정보
  const ngPlusLevel = useUpHeroStore((s) => s.ngPlusLevel ?? 0);
  const weeklyVariant = useUpHeroStore((s) => s.weeklyVariant);
  const dungeons = useUpHeroStore((s) => s.dungeons);
  const f30Unlocked =
    ngPlusLevel > 0 ||
    Object.values(dungeons).some((d) => d?.bossesDefeated?.includes(30));

  // Phase 12 — 캠프 분위기 텍스트 로테이션.
  //   이제 ambience 는 i18n **key** (예: `uphero.camp.ambience.7`) 를 저장.
  //   표시 시점에 t() 로 현재 언어 조회. 초기값은 .1 (고정 — SSR 안정).
  const [ambienceKey, setAmbienceKey] = useState(
    "uphero.camp.ambience.1",
  );
  useEffect(() => {
    // 첫 로테이션도 rAF 콜백에서 — effect 내 동기 setState 금지 규칙 준수 (1프레임 차이, 시각 차 없음)
    const raf = requestAnimationFrame(() => {
      setAmbienceKey((prev) => pickCampAmbience(prev));
    });
    const id = window.setInterval(() => {
      setAmbienceKey((prev) => pickCampAmbience(prev));
    }, 20000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 영웅 캠프 공간 — 큰 hero sprite + 분위기.
           Phase 12 bugfix — 짧은 뷰포트 대응 `py-4` 로 section 내부 상하
           breathing room 확보. justify-center 유지 (콘텐츠 센터 정렬),
           content 가 section 보다 크면 overflow-hidden (parent 상속) 으로 clip. */}
      <section className="flex-1 min-h-0 flex flex-col items-center justify-center py-4 px-6 relative">
        {/* 배경 별/이펙트 — subtle */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: `radial-gradient(ellipse at 50% 70%, ${GB.dark}66 0%, transparent 60%)`,
          }}
        />

        {/* Phase 12 — 이름 태그 + NG+ badge 제거.
             유저 피드백: "캐릭터 위 이름은 왼쪽 위 header 와 중복이라
             이제 없어도 될 거 같아." nameplate 제거로 수직 공간 ~40px
             확보 → 짧은 뷰포트에서 상/하 crop 해소. NG+ 정보는 header
             Lv 옆으로 승격 (CampPlaceholder 에서 렌더). */}

        {/* 픽셀 영웅 sprite — 탭하면 HeroStatPanel 오버레이. */}
        <button
          type="button"
          onClick={() => {
            play("select");
            onOpenStats();
          }}
          className="uphero-hero-tap relative"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-label={t("uphero.home.statButton.ariaSprite")}
        >
          <HeroSprite
            variant={variant}
            classType={hero.classType}
            size={80}
            color={
              hero.classType
                ? CLASS_THEME_COLOR[hero.classType]
                : GB.lightest
            }
          />
          {/* 그림자 — 발 밑에 작은 타원 */}
          <div
            className="absolute left-1/2 -bottom-1 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              width: 40,
              height: 4,
              background: GB.dark,
              opacity: 0.6,
            }}
          />
          <style jsx>{`
            .uphero-hero-tap {
              transition: transform 120ms ${EASE_OUT};
            }
            .uphero-hero-tap:active {
              transform: scale(0.97);
            }
          `}</style>
        </button>

        {/* Phase 12f — 영웅 탭 안내 chip. 스탯/스킬트리 접근 CTA 가시화.
             영웅 sprite 가 클릭 가능한지 한눈에 보이지 않던 문제 해결. */}
        <button
          type="button"
          onClick={() => {
            play("select");
            onOpenStats();
          }}
          className="uphero-stats-hint typo-micro mt-2 px-2 py-1 rounded inline-flex items-center gap-1"
          style={{
            background: `${GB.dark}aa`,
            color: GB.lightest,
            border: `1px solid ${GB.light}66`,
            letterSpacing: "0.05em",
          }}
          aria-label={t("uphero.home.statButton.ariaChip")}
        >
          <PixelIcon name="User" size={10} color={GB.lightest} />
          {hero.classType
            ? t("uphero.home.statButton.withClass")
            : t("uphero.home.statButton.default")}
        </button>

        {/* 분위기 텍스트 — Phase 8b: 실제로 타오르듯 flicker.
             opacity + warm text-shadow 를 4.2s 주기로 호흡.
             Phase 12 — 15 줄 pool 에서 랜덤 선택 + 20s 주기 교체. outer 에
             key 기반 crossfade (blur 2.5px → 0, Y -3px → 0, 520ms) / inner 에
             infinite fire-flicker 분리. 두 애니가 같은 opacity 를 건드리지
             않도록 outer=fade/blur/transform, inner=opacity/text-shadow 로
             역할 나눔 → compositing 상에서 두 효과가 곱으로 자연스럽게 합쳐짐. */}
        <div className="mt-5 text-center">
          <div key={ambienceKey} className="uphero-ambience-in inline-block">
            <div
              className="uphero-fire-flicker typo-caption"
              style={{ color: GB.light }}
              aria-live="off"
            >
              {/* Phase 12 i18n — key → 현재 언어 조회. DictKey 제약상 cast. */}
              — {t(ambienceKey as import("@/i18n").DictKey)} —
            </div>
          </div>
        </div>

        {/* Phase 12 — 카테고리별 탐험권 indicator 제거.
             유저 피드백: "티켓 인디케이터는 없어도 될 거 같아."
             PrimaryCTA 의 `×N` 총합 badge 가 이미 "얼마나 있는지" 전달하고,
             카테고리별 breakdown 은 Dungeons view 에 들어가면 각 던전 카드
             에서 볼 수 있어 홈 화면에는 중복. 빈 화면이 한층 차분해져 영웅
             sprite + 분위기 텍스트의 주목도가 올라감. */}
      </section>

      {/* 하단 CTA 3개 (stacked).
           Phase 12 bugfix — pt-3 → pt-4. 위 indicator 행과의 시각적 분리 강화. */}
      <section
        className="px-4 pt-4 pb-4 flex flex-col gap-2 shrink-0"
        style={{ borderTop: `1px solid ${GB.dark}` }}
      >
        {/* Primary CTA — "탐험 시작" 이 홈의 명확한 주 행동. 최상단 고정.
             Phase 11c R2 — passes=0 시 "챌린지 완료" hint 만 남기면 dead-end.
             동일 배치에 "상점에서 구매" 로 route. */}
        <PrimaryCTA
          onClick={() => {
            play("select");
            if (totalPasses <= 0) onOpenShop();
            else onOpenDungeons();
          }}
          iconName="Target"
          label={
            totalPasses > 0
              ? t("uphero.home.cta.startExpedition")
              : t("uphero.home.cta.buyPass")
          }
          badge={totalPasses > 0 ? `×${totalPasses}` : undefined}
          hint={
            totalPasses > 0
              ? t("uphero.home.cta.pickDungeon")
              : t("uphero.home.cta.completeOrBuy")
          }
        />
        {/* Phase 11c R1 — 주간 악몽 compact ribbon. PrimaryCTA 아래로 이동, 시각 가중치 ↓. */}
        {f30Unlocked && weeklyVariant && (
          <WeeklyNightmareRibbon
            weekId={weeklyVariant.week}
            affixId={weeklyVariant.affixId}
            clearedCount={weeklyVariant.clearedDungeons.length}
            bestScore={weeklyVariant.bestScore}
            onOpen={onOpenWeekly}
          />
        )}
        <SecondaryCTA
          onClick={() => {
            play("select");
            onOpenShop();
          }}
          iconName="ShoppingBag"
          label={t("uphero.home.shop.label")}
          hint={t("uphero.home.shop.hint")}
        />
        <SecondaryCTA
          onClick={() => {
            play("select");
            onOpenEquipment();
          }}
          iconName="Shield"
          label={t("uphero.home.equipment.label")}
          hint={t("uphero.home.equipment.hint")}
        />
        <SecondaryCTA
          onClick={() => {
            play("select");
            onOpenCodex();
          }}
          iconName="BookOpen"
          label={t("uphero.home.codex.label")}
          hint={t("uphero.home.codex.hint")}
        />
      </section>

    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

function DungeonsView({
  onBack,
  onNotify,
}: {
  onBack: () => void;
  onNotify: (msg: string) => void;
}) {
  const passes = useUpHeroStore((s) => s.passes);
  const dungeons = useUpHeroStore((s) => s.dungeons);
  const prepareBuffDraw = useUpHeroStore((s) => s.prepareBuffDraw);
  const enterDungeon = useUpHeroStore((s) => s.enterDungeon);
  const { play } = useSound();
  const { t, language } = useTranslation();

  const onEnter = (dungeonId: DungeonId) => {
    const result = prepareBuffDraw(dungeonId);
    if (result === "no-pass") {
      onNotify(t("uphero.camp.pass.required"));
      return;
    }
    if (result === "no-cards") {
      // 보유 카드 없음 — 버프 스킵, 바로 진입
      const ok = enterDungeon(dungeonId);
      if (!ok) {
        onNotify(t("uphero.camp.pass.required"));
        return;
      }
      play("select");
      return;
    }
    // "ready" — pendingDungeon 설정됨, CampPlaceholder 상위가 BuffDrawPanel 로 전환
    play("select");
  };

  const total = Object.values(passes).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  const disabled = total === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title={t("uphero.subheader.dungeons")} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {/* Phase 15d — 통합 탐험권 표기.
             탐험권은 카테고리 호환 소비 (consumeAnyPass) 이므로 각 카드에 per-
             category 배지를 두면 ×0 카드가 실제로는 입장 가능한 모순이 발생.
             총합 하나만 상단에 표기하여 일치시킴. */}
        <div
          className="mb-3 flex items-center justify-between px-1"
          aria-live="polite"
        >
          <span className="typo-caption" style={{ color: GB.light }}>
            {t("uphero.camp.passes.heading")}
          </span>
          <span
            className="typo-caption tabular-nums px-2 py-0.5 rounded"
            style={{
              color: total > 0 ? GB.lightest : GB.light,
              background: total > 0 ? `${GB.light}22` : "transparent",
              border: `1px solid ${total > 0 ? GB.light : GB.dark}`,
            }}
          >
            ×{total}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DUNGEON_LIST.map((d) => {
            const progress = dungeons[d.id];
            // 표시는 역대 최고 도달 (사망/체크포인트와 무관). 재진입 시작점은
            // floorReached(체크포인트). 둘이 다르면 best 가 더 큼.
            const bestFloor =
              progress?.bestFloorReached ?? progress?.floorReached ?? 0;
            return (
              <PressButton
                key={d.id}
                onClick={() => onEnter(d.id)}
                disabled={disabled}
                style={{
                  background: disabled ? "transparent" : `${GB.dark}99`,
                  border: `1px solid ${disabled ? GB.dark : d.themeColor}`,
                  opacity: disabled ? 0.45 : 1,
                  minHeight: 76,
                  padding: "14px 12px",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <PixelIcon
                    name={CATEGORY_ICON[d.id]}
                    size={22}
                    color={disabled ? GB.light : d.themeColor}
                  />
                </div>
                <div
                  className="typo-caption leading-tight truncate"
                  style={{ color: disabled ? GB.light : GB.lightest }}
                >
                  {dungeonName(d.id, d.name, language)}
                </div>
                <div
                  className="typo-caption mt-1 tabular-nums"
                  style={{ color: GB.light, opacity: 0.75 }}
                >
                  {bestFloor > 0
                    ? t("uphero.dungeons.bestRecord", { floor: bestFloor })
                    : t("uphero.dungeons.unexplored")}
                </div>
              </PressButton>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

function ShopView({
  onBack,
  coins,
  tickets,
  onNotify,
}: {
  onBack: () => void;
  coins: number;
  tickets: number;
  onNotify: (msg: string) => void;
}) {
  const purchaseTicket = useUpHeroStore((s) => s.purchaseTicket);
  const purchaseCardPack = useUpHeroStore((s) => s.purchaseCardPack);
  // Phase 11a — 탐험권 상점 구매.
  const purchasePass = useUpHeroStore((s) => s.purchasePass);
  const claimCoinPouch = useUpHeroStore((s) => s.claimCoinPouch);
  // Phase 15 — 하락방지권. 소실방지권은 상점 품목이 아니다 (드롭 전용).
  const purchaseDownGuard = useUpHeroStore((s) => s.purchaseDownGuard);
  const downGuards = useUpHeroStore((s) => s.downGuards ?? 0);
  const shopDaily = useUpHeroStore((s) => s.shopDaily);
  const passes = useUpHeroStore((s) => s.passes);
  // Phase 12a — 카드매치 티켓 하루 구매 현황.
  const cardmatchShopDaily = useGameStore((s) => s.progress.cardmatchShopDaily);
  // 컬렉션 100% — 카드팩 매진 (purchaseCardPack 도 false 를 돌려준다).
  const collectionComplete = useGameStore(
    (s) => s.progress.unlockedCardIds.length >= ALL_CARDS.length,
  );
  const cardmatchBoughtToday =
    cardmatchShopDaily?.date === getTodayString()
      ? cardmatchShopDaily.bought
      : 0;
  const { play } = useSound();
  const { t, language } = useTranslation();

  const passesBoughtToday = shopDaily?.passesBought ?? 0;
  const dailyCapReached = passesBoughtToday >= DAILY_PASS_PURCHASE_CAP;
  // 오늘 기준 주머니 수령 여부 — shopDaily 의 date 가 바뀌면 자동으로 false 취급.
  const pouchClaimedToday =
    shopDaily?.date === getTodayString() && !!shopDaily?.coinPouchClaimed;

  // Phase 12 R6 — 800 coin 풀 카드팩 safeguard. 실수 탭으로 800 코인 날림
  //   방지. small (200 coin) 은 부담 낮아 스킵.
  const [confirmFullPack, setConfirmFullPack] = useState(false);

  // 코인 주머니 2배 수령 — 리워드 광고 재생 중 상태. 중복 탭 방지 + 로딩 문구.
  const [pouchAdLoading, setPouchAdLoading] = useState(false);

  const onBuyDownGuard = () => {
    const ok = purchaseDownGuard();
    if (ok) {
      play("collect");
      onNotify(
        t("uphero.shop.guard.bought", {
          name: t("uphero.guard.down.name"),
          n: Math.min(ENHANCE_GUARD_MAX, downGuards + 1),
        }),
      );
    } else if (downGuards >= ENHANCE_GUARD_MAX) {
      onNotify(t("uphero.shop.guard.full", { max: ENHANCE_GUARD_MAX }));
    } else {
      onNotify(t("uphero.shop.insufficient"));
    }
  };

  const onBuyTicket = () => {
    const ok = purchaseTicket();
    if (ok) {
      play("collect");
      onNotify(
        t("uphero.shop.boughtTicket", {
          current: Math.min(10, tickets + 1),
          max: 10,
        }),
      );
    } else if (tickets >= 10) {
      onNotify(t("uphero.shop.ticket.full"));
    } else if (cardmatchBoughtToday >= DAILY_CARDMATCH_TICKET_CAP) {
      onNotify(
        t("uphero.shop.ticketDailyCap", { cap: DAILY_CARDMATCH_TICKET_CAP }),
      );
    } else {
      onNotify(t("uphero.shop.insufficient"));
    }
  };

  const onBuyPack = (size: "small" | "full") => {
    // 풀 팩은 확인 모달 경유. small 은 바로 구매.
    if (size === "full") {
      setConfirmFullPack(true);
      return;
    }
    const ok = purchaseCardPack(size);
    if (ok) {
      play("collect");
      onNotify(t("uphero.shop.packSmall"));
    } else {
      onNotify(
        coins < SHOP_PRICES.cardPackSmall
          ? t("uphero.shop.insufficient")
          : t("uphero.shop.packSoldOut"),
      );
    }
  };

  const confirmFullPackPurchase = () => {
    setConfirmFullPack(false);
    const ok = purchaseCardPack("full");
    if (ok) {
      play("collect");
      onNotify(t("uphero.shop.packFull"));
    } else {
      onNotify(
        coins < SHOP_PRICES.cardPackFull
          ? t("uphero.shop.insufficient")
          : t("uphero.shop.packSoldOut"),
      );
    }
  };

  const onBuyPass = (dungeonId: DungeonId) => {
    const result = purchasePass(dungeonId);
    if (result === "ok") {
      play("collect");
      const d = DUNGEON_LIST.find((d) => d.id === dungeonId);
      const dName = d ? dungeonName(d.id, d.name, language) : "";
      onNotify(t("uphero.shop.passGranted", { dungeonName: dName }));
    } else if (result === "no-coin") {
      play("cancel");
      onNotify(t("uphero.shop.insufficient"));
    } else if (result === "daily-cap") {
      play("cancel");
      onNotify(t("uphero.shop.passDailyCap", { cap: DAILY_PASS_PURCHASE_CAP }));
    } else {
      play("cancel");
      onNotify(t("uphero.shop.passFull"));
    }
  };

  const onClaimPouch = () => {
    const result = claimCoinPouch(1);
    if (result.ok) {
      play("collect");
      onNotify(t("uphero.shop.coinPouch.rolled", { coins: result.coins }));
    }
  };

  // 2배 수령 — 리워드 광고를 끝까지 본 경우에만 배수 2 로 수령한다.
  //   중도 이탈/광고 없음 이면 수령 자체를 하지 않아 무료 수령 기회가 남는다.
  //   무료 수령 버튼은 그대로 두므로 광고가 유일한 경로가 되지 않는다.
  const onClaimPouchDoubled = async () => {
    if (pouchAdLoading || pouchClaimedToday) return;
    play("select");
    setPouchAdLoading(true);
    const adResult = await showRewardedAd("coinPouch");
    setPouchAdLoading(false);
    if (adResult !== "rewarded") return;
    const result = claimCoinPouch(2);
    if (result.ok) {
      play("collect");
      // 토스트는 한 번만 — 배수 적용 사실과 실제 지급액을 한 줄로 붙여 보여준다.
      onNotify(
        `${t("shop.pouch.doubled")} · ${t("uphero.shop.coinPouch.rolled", { coins: result.coins })}`,
      );
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title={t("uphero.subheader.shop")} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {/* 데일리 코인 주머니 — 하루 1회 무료, 랜덤 코인 보상.
             레이아웃: heading 단독 상단 → 버튼 → 하단 hint (탐험권 섹션과 동일 패턴).
             번역 길이가 긴 일본어/중국어에서도 heading 과 hint 가 서로 침범하지 않음. */}
        <section
          className="rounded-md p-3"
          style={{
            background: `${GB.dark}40`,
            border: `1px solid ${GB.dark}`,
          }}
        >
          <div className="mb-2">
            <div
              className="typo-caption inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Gift" size={14} color={GB.lightest} />
              {t("uphero.shop.coinPouch.heading")}
            </div>
          </div>
          <PressButton
            onClick={onClaimPouch}
            disabled={pouchClaimedToday}
            style={{
              width: "100%",
              minHeight: 42,
              background: pouchClaimedToday ? `${GB.dark}55` : GB.lightest,
              color: pouchClaimedToday ? GB.light : GB.darkest,
              border: `1px solid ${pouchClaimedToday ? GB.dark : GB.lightest}`,
              opacity: pouchClaimedToday ? 0.55 : 1,
            }}
            aria-label={
              pouchClaimedToday
                ? t("uphero.shop.coinPouch.claimed")
                : t("uphero.shop.coinPouch.claim")
            }
          >
            <div className="flex items-center justify-center gap-1.5">
              <PixelIcon
                name="Coins"
                size={14}
                color={pouchClaimedToday ? GB.light : GB.darkest}
              />
              <span
                className="typo-caption"
                style={{ fontWeight: pouchClaimedToday ? 400 : 600 }}
              >
                {pouchClaimedToday
                  ? t("uphero.shop.coinPouch.claimed")
                  : t("uphero.shop.coinPouch.claim")}
              </span>
            </div>
          </PressButton>

          {/* 2배 수령 — 광고를 쓸 수 없는 환경(순수 웹 브라우저)에서는 숨긴다.
              이미 오늘 수령했으면 노출 자체가 의미 없으므로 함께 숨김. */}
          {isAdAvailable() && !pouchClaimedToday && (
            <PressButton
              onClick={onClaimPouchDoubled}
              disabled={pouchAdLoading}
              className="mt-2"
              style={{
                width: "100%",
                minHeight: 42,
                background: "transparent",
                color: GB.lightest,
                border: `1px solid ${GB.light}`,
                opacity: pouchAdLoading ? 0.6 : 1,
              }}
              aria-label={t("shop.pouch.double")}
            >
              <div className="flex items-center justify-center gap-1.5">
                <PixelIcon name="Play" size={14} color={GB.lightest} />
                <span className="typo-caption">
                  {pouchAdLoading
                    ? t("shop.pouch.adLoading")
                    : t("shop.pouch.double")}
                </span>
              </div>
            </PressButton>
          )}

          <div
            className={`typo-micro mt-2 ${gbClass.textDim} text-center`}
            style={{ letterSpacing: "0.05em" }}
          >
            {t("uphero.shop.coinPouch.hint")}
          </div>
        </section>

        {/* Phase 11a — 탐험권 상점. 8 던전 선택 구매 + 일 2장 cap.
             Phase 12 — 유저 피드백: "탐험권 구매를 위로, 나머지는 아래로."
             상점의 primary action 은 탐험권 (영웅 진행의 연료) — 최상단
             우선순위. 카드매치/보너스/풀 팩 은 보조 구매라 아래로. */}
        <section
          className="rounded-md p-3"
          style={{
            background: `${GB.dark}40`,
            border: `1px solid ${GB.dark}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div
              className="typo-caption inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Target" size={14} color={GB.lightest} />
              {t("uphero.shop.expeditionHeading")}
            </div>
            <div
              className={`typo-micro tabular-nums ${
                dailyCapReached ? gbClass.textDim : ""
              }`}
              style={{
                color: dailyCapReached ? undefined : GB.light,
                letterSpacing: "0.05em",
              }}
              aria-label={t("uphero.shop.todayBought", {
                bought: passesBoughtToday,
                cap: DAILY_PASS_PURCHASE_CAP,
              })}
            >
              {t("uphero.shop.todayBought", {
                bought: passesBoughtToday,
                cap: DAILY_PASS_PURCHASE_CAP,
              })}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DUNGEON_LIST.map((d) => {
              const dungeonPasses = passes[d.id] ?? 0;
              const isFull = dungeonPasses >= PASS_CAP_PER_CATEGORY;
              const canBuy =
                !dailyCapReached && !isFull && coins >= SHOP_PRICES.expeditionPass;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onBuyPass(d.id)}
                  disabled={!canBuy}
                  className="shop-pass-btn flex flex-col items-center rounded px-1 py-1.5"
                  style={{
                    minHeight: 56,
                    background: canBuy
                      ? `${GB.dark}88`
                      : `${GB.dark}44`,
                    border: `1px solid ${canBuy ? d.themeColor : GB.dark}`,
                    color: canBuy ? GB.lightest : GB.light,
                    opacity: canBuy ? 1 : 0.55,
                    cursor: canBuy ? "pointer" : "not-allowed",
                  }}
                  aria-label={t("uphero.shop.passAria", {
                    name: dungeonName(d.id, d.name, language),
                    price: SHOP_PRICES.expeditionPass,
                  })}
                >
                  <PixelIcon
                    name={CATEGORY_ICON[d.id]}
                    size={16}
                    color={canBuy ? d.themeColor : GB.light}
                  />
                  <span
                    className="typo-micro mt-0.5 leading-none tabular-nums"
                    style={{ fontSize: 9 }}
                  >
                    {dungeonPasses}/{PASS_CAP_PER_CATEGORY}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className={`typo-micro mt-2 ${gbClass.textDim} text-center`}
            style={{ letterSpacing: "0.05em" }}
          >
            {t("uphero.shop.priceHint", {
              price: SHOP_PRICES.expeditionPass,
              cap: DAILY_PASS_PURCHASE_CAP,
            })}
          </div>
          <style jsx>{`
            .shop-pass-btn {
              transition: transform 120ms ${EASE_OUT},
                background 160ms ${EASE_OUT};
            }
            .shop-pass-btn:not(:disabled):active {
              transform: scale(0.96);
            }
          `}</style>
        </section>

        {/* Phase 12 — 카드매치 / 보조 구매. 탐험권 이후 secondary. */}
        {/* Phase 15 — 하락방지권. 강화가 아지트의 주요 코인 소비처라
            카드매치·카드팩 같은 보조 품목보다 위에 둔다.
            소실방지권은 여기 없다 — 보스·이벤트·슬롯으로만 나오는 물건이라
            상점 경로를 만들지 않는 것이 그 규칙의 유일한 집행 방법이다. */}
        <ShopRow
          iconName="Shield"
          name={t("uphero.guard.down.name")}
          desc={t("uphero.shop.guard.downDesc", { held: downGuards })}
          price={SHOP_PRICES.downGuard}
          onBuy={onBuyDownGuard}
          canAfford={
            coins >= SHOP_PRICES.downGuard && downGuards < ENHANCE_GUARD_MAX
          }
        />
        <ShopRow
          iconName="Card"
          name={t("uphero.shop.cardmatchTicket.name")}
          desc={t("uphero.shop.cardmatchTicket.desc", {
            current: tickets,
            max: 10,
            today: cardmatchBoughtToday,
            cap: DAILY_CARDMATCH_TICKET_CAP,
          })}
          price={SHOP_PRICES.ticket}
          onBuy={onBuyTicket}
          canAfford={
            coins >= SHOP_PRICES.ticket &&
            tickets < 10 &&
            cardmatchBoughtToday < DAILY_CARDMATCH_TICKET_CAP
          }
        />
        <ShopRow
          iconName="CardText"
          name={t("uphero.shop.bonusCard.name")}
          desc={t("uphero.shop.bonusCard.desc")}
          price={SHOP_PRICES.cardPackSmall}
          onBuy={() => onBuyPack("small")}
          canAfford={coins >= SHOP_PRICES.cardPackSmall && !collectionComplete}
        />
        <ShopRow
          iconName="Package"
          name={t("uphero.shop.fullPack.name")}
          desc={t("uphero.shop.fullPack.desc")}
          price={SHOP_PRICES.cardPackFull}
          onBuy={() => onBuyPack("full")}
          canAfford={coins >= SHOP_PRICES.cardPackFull && !collectionComplete}
        />

        <div
          className="mt-2 p-3 typo-caption text-center rounded"
          style={{
            color: GB.light,
            background: `${GB.dark}40`,
            border: `1px dashed ${GB.dark}`,
          }}
        >
          {t("uphero.shop.coinsNote")}
        </div>
      </div>
      {/* Phase 12 R6 — 풀 카드팩 (800 코인) 실수 구매 safeguard. */}
      <GbConfirm
        open={confirmFullPack}
        title={t("uphero.shop.confirmFullPackTitle")}
        body={
          <>
            <div className="typo-caption" style={{ color: GB.light }}>
              {t("uphero.shop.confirmFullPackBody")}
            </div>
            <div
              className="typo-caption mt-1 tabular-nums"
              style={{ color: GB.light }}
            >
              {t("uphero.shop.confirmFullPackPrice", {
                price: SHOP_PRICES.cardPackFull,
                coins,
              })}
            </div>
          </>
        }
        confirmLabel={t("uphero.shop.buy")}
        onConfirm={confirmFullPackPurchase}
        onCancel={() => setConfirmFullPack(false)}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

// Phase 11b-fix — SubHeader 균형 조정.
//   이전: 뒤로 버튼이 border + solid bg 로 묵직한 박스, 제목은 작은 typo-caption
//     → 시각 무게 역전 (보조 action 이 메인 제목보다 dominant).
//   수정: 버튼을 ghost (no border, subtle bg, typo-caption) + 제목을 typo-body
//     (크고 밝게) → 정보 우선순위 일치. tap target 은 여전히 min-height 40.
function SubHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const backAriaLabel = t("uphero.subheader.back.aria");
  return (
    <header
      className="px-3 py-2 flex items-center gap-1 shrink-0"
      style={{ borderBottom: `1px solid ${GB.dark}` }}
    >
      <button
        type="button"
        onClick={onBack}
        className="uphero-subheader-back typo-caption inline-flex items-center gap-0.5 rounded"
        style={{
          minHeight: 40,
          padding: "6px 8px",
          background: "transparent",
          color: GB.light,
          border: "none",
        }}
        aria-label={backAriaLabel}
      >
        <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
        {t("uphero.subheader.back")}
      </button>
      <div
        className="typo-body ml-1"
        style={{ color: GB.lightest, fontWeight: 500 }}
      >
        {title}
      </div>
      <style jsx>{`
        .uphero-subheader-back {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .uphero-subheader-back:active {
          transform: scale(0.96);
          background: ${GB.dark}66;
        }
      `}</style>
    </header>
  );
}

function PrimaryCTA({
  onClick,
  disabled,
  iconName,
  label,
  badge,
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  iconName: string;
  label: string;
  badge?: string;
  hint?: string;
}) {
  return (
    <PressButton
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? `${GB.dark}66` : GB.lightest,
        color: disabled ? GB.light : GB.darkest,
        border: `1px solid ${disabled ? GB.dark : GB.lightest}`,
        padding: "12px 14px",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PixelIcon
            name={iconName}
            size={20}
            color={disabled ? GB.light : GB.darkest}
          />
          <div className="text-left leading-tight">
            <div className="typo-body">{label}</div>
            {hint && (
              <div className="typo-caption opacity-75">{hint}</div>
            )}
          </div>
        </div>
        {badge && (
          /* typo-micro 예외: 작은 수량 배지 */
          <span
            className="typo-micro px-2 py-0.5 rounded tabular-nums"
            style={{
              background: disabled ? GB.dark : GB.darkest,
              color: disabled ? GB.light : GB.lightest,
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </PressButton>
  );
}

function SecondaryCTA({
  onClick,
  disabled,
  iconName,
  label,
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  iconName: string;
  label: string;
  hint?: string;
}) {
  return (
    <PressButton
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `${GB.dark}cc`,
        color: GB.light,
        border: `1px solid ${GB.dark}`,
        padding: "10px 12px",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        <PixelIcon name={iconName} size={16} color={GB.light} />
        <div className="text-left leading-tight flex-1">
          <div className="typo-caption" style={{ color: GB.lightest }}>
            {label}
          </div>
          {hint && <div className="typo-caption">{hint}</div>}
        </div>
      </div>
    </PressButton>
  );
}

function ShopRow({
  iconName,
  name,
  desc,
  price,
  onBuy,
  canAfford,
}: {
  iconName: string;
  name: string;
  desc: string;
  price: number;
  onBuy: () => void;
  canAfford: boolean;
}) {
  return (
    <PressButton
      onClick={onBuy}
      disabled={!canAfford}
      style={{
        background: `${GB.dark}80`,
        color: GB.light,
        border: `1px solid ${GB.dark}`,
        padding: "12px 12px",
        opacity: canAfford ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PixelIcon name={iconName} size={16} color={GB.light} />
          <div className="text-left leading-tight">
            <div className="typo-caption" style={{ color: GB.lightest }}>
              {name}
            </div>
            <div className="typo-caption">{desc}</div>
          </div>
        </div>
        {/* typo-micro 예외: 작은 가격 배지 */}
        <div
          className="typo-micro px-2 py-0.5 rounded tabular-nums inline-flex items-center gap-1"
          style={{ border: `1px solid ${GB.light}`, color: GB.lightest }}
        >
          <PixelIcon name="Coins" size={12} color={GB.lightest} />
          {price}
        </div>
      </div>
    </PressButton>
  );
}

/**
 * Phase 9b — lazy view 가 로드되는 동안 쓰는 공용 skeleton.
 *   EquipmentInventory / HeroCodex 는 첫 진입에만 짧게 표시 (이후 캐시).
 */
function LazyViewFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center"
      style={{ color: GB.light }}
    >
      <div className="typo-caption font-mono" style={{ letterSpacing: "0.1em" }}>
        {t("common.loading")}
      </div>
    </div>
  );
}

/**
 * PressButton — CSS-first press feedback.
 * :active scale(0.97), 인터럽트 가능 (CSS transition).
 */
function PressButton({
  children,
  onClick,
  disabled,
  style,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`uphero-press-btn text-left rounded-md ${className}`}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-press-btn {
          transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .uphero-press-btn:not(:disabled):active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * Phase 11c — 주간 악몽 던전
 * ══════════════════════════════════════════════════════════════════════ */

import { getWeeklyAffixById } from "@/data/weeklyAffixes";
import {
  WEEKLY_ALL_CLEAR_COINS,
  WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
  WEEKLY_ALL_CLEAR_DOWN_GUARDS,
  WEEKLY_DUNGEON_COUNT,
  WEEKLY_FIRST_CLEAR_COINS,
  WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
} from "@/lib/sessionReward";

/**
 * 홈 CTA 스택 내에서 PrimaryCTA 아래 표시되는 compact ribbon.
 *
 * Phase 11c R1 — 이전 버전은 gradient 큰 카드로 PrimaryCTA ("탐험 시작") 위에 위치해
 * 주 시선을 빼앗았음. 이제 상단 accent line + 1-line 형태로 축약, SecondaryCTA 와
 * 비슷한 높이 ·  따뜻한 색 accent 만 유지.
 */
function WeeklyNightmareRibbon({
  weekId,
  affixId,
  clearedCount,
  bestScore,
  onOpen,
}: {
  weekId: string;
  affixId: string;
  clearedCount: number;
  bestScore: number;
  onOpen: () => void;
}) {
  const { t, language } = useTranslation();
  const affix = getWeeklyAffixById(affixId);
  const affixDisplayName = affix
    ? weeklyAffixName(affix.id, affix.name, language)
    : "";
  const SAND = "#e8b887";
  // Phase 16 (Track C, 피드백 30) — 주간 보상 안내. 0~6 클리어: 던전당 첫 클리어
  //   보상, 7 클리어: 마지막 한 곳이 올클리어 보너스임을 예고, 8: 완료.
  //   상수는 sessionReward 의 단일 출처. 카피에 em-dash 없음.
  const rewardHint =
    clearedCount >= WEEKLY_DUNGEON_COUNT
      ? t("uphero.weekly.allClearDone")
      : clearedCount === WEEKLY_DUNGEON_COUNT - 1
        ? t("uphero.weekly.allClearHint", {
            coins: WEEKLY_ALL_CLEAR_COINS,
            wards: WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
            downs: WEEKLY_ALL_CLEAR_DOWN_GUARDS,
          })
        : t("uphero.weekly.rewardHint", {
            coins: WEEKLY_FIRST_CLEAR_COINS,
            wards: WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
          });
  // Phase 11c R4 — SR 전용 label. 기존 innerText 는 맥락 없이 조각으로 읽힘.
  const srLabel = [
    t("uphero.ribbon.weeklyTitle"),
    affixDisplayName,
    weekId,
    clearedCount > 0
      ? t("uphero.weekly.clearedCount", { count: clearedCount })
      : null,
    bestScore > 0
      ? t("uphero.weekly.bestScore", { score: bestScore.toLocaleString() })
      : null,
    rewardHint,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <PressButton
      onClick={onOpen}
      aria-label={srLabel}
      style={{
        // 왼쪽에 sand accent bar 로 "주간 악몽" 임을 표시, 메인 배경은 어두운 톤 유지
        background: `${GB.dark}cc`,
        color: GB.light,
        border: `1px solid ${GB.dark}`,
        borderLeft: `3px solid ${SAND}`,
        padding: "10px 12px",
      }}
    >
      <div className="flex items-center gap-2.5">
        <PixelIcon name="WarningDiamond" size={14} color={SAND} />
        <div className="flex-1 min-w-0 text-left">
          <div
            className="typo-caption truncate"
            style={{ color: GB.lightest }}
          >
            {t("uphero.ribbon.weeklyTitle")} · {affixDisplayName || "—"}
          </div>
          <div
            className="typo-micro truncate tabular-nums"
            style={{ color: GB.light, opacity: 0.7 }}
          >
            {weekId}
            {clearedCount > 0 && ` · ${t("uphero.ribbon.weeklyProgress", { cleared: clearedCount, total: 8 })}`}
            {bestScore > 0 &&
              ` · ${t("uphero.weekly.bestScore", { score: bestScore.toLocaleString() })}`}
          </div>
          <div
            className="typo-micro truncate"
            style={{ color: SAND, opacity: 0.85 }}
          >
            {rewardHint}
          </div>
        </div>
        <PixelIcon name="ChevronRight" size={12} color={GB.light} />
      </div>
    </PressButton>
  );
}

/** 주간 악몽 진입 view — 8 던전 선택 + 리더보드 모달. */
/**
 * Phase 12 R11 — 다음 ISO 주간 리셋까지 남은 ms 계산.
 *   ISO 주는 월요일 00:00 UTC 에 시작. 현재 UTC 기준 다음 월요일까지의 시차 반환.
 *   KST 기준 월요일 오전 9시 = UTC 월요일 00시와 같은 순간. 시간대 오해 방지 위해
 *   UI 에도 명시.
 */
function getNextWeeklyResetMs(now = new Date()): number {
  const dayOfWeek = now.getUTCDay(); // 0 Sun ~ 6 Sat
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilMonday,
      0,
      0,
      0,
      0,
    ),
  );
  return nextMonday.getTime() - now.getTime();
}

/** ms → "N 일 M 시간" / "M 시간 S 분" / "S 분" 포맷. i18n 적용.
 *   Note: hook 밖이므로 `t` 함수를 인자로 받음 (closure).
 */
function formatWeeklyCountdown(
  ms: number,
  t: (key: import("@/i18n").DictKey, params?: Record<string, string | number>) => string,
): string {
  if (ms <= 0) return t("uphero.weekly.duration.resetting");
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return t("uphero.weekly.duration.dayHour", { d, h });
  if (h > 0) return t("uphero.weekly.duration.hourMin", { h, m });
  return t("uphero.weekly.duration.min", { m });
}

/* WeeklyView — 주간 악몽 진입 view */
function WeeklyView({
  onBack,
  onNotify,
}: {
  onBack: () => void;
  onNotify: (msg: string) => void;
}) {
  const weeklyVariant = useUpHeroStore((s) => s.weeklyVariant);
  const enterWeeklyVariant = useUpHeroStore((s) => s.enterWeeklyVariant);
  const dungeons = useUpHeroStore((s) => s.dungeons);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Phase 12 R11 — 다음 리셋까지 카운트다운. 분 단위 갱신 (60s interval).
  //   유저가 오래 머물지 않으므로 초 단위 표시는 불필요. 시간 단위는 60초
  //   한 번씩만 업데이트.
  const [resetMs, setResetMs] = useState(() => getNextWeeklyResetMs());
  useEffect(() => {
    const id = window.setInterval(() => {
      setResetMs(getNextWeeklyResetMs());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const affix = weeklyVariant ? getWeeklyAffixById(weeklyVariant.affixId) : null;
  // 주간 악몽 진입 가능한 던전 — F30 을 **적어도 한 번** 클리어한 것만 (NG+ 가 ≥1이면 모두).
  const isDungeonEligible = (d: DungeonId) => {
    const progress = dungeons[d];
    return !!progress?.bossesDefeated?.includes(30);
  };

  const onEnter = (d: DungeonId) => {
    const result = enterWeeklyVariant(d);
    if (result === "ok") {
      play("select");
    } else if (result === "not-unlocked") {
      onNotify(t("uphero.weekly.beatF30First"));
    } else {
      onNotify(t("uphero.weekly.loading"));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title={t("uphero.subheader.weekly")} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {/* Affix 설명 카드 */}
        {weeklyVariant && affix && (
          <div
            className="mb-3 rounded-md p-3"
            style={{
              background: `linear-gradient(135deg, ${"#e8b887"}22 0%, ${GB.dark}cc 100%)`,
              border: `1px solid ${"#e8b887"}66`,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="inline-flex items-center gap-1.5">
                <PixelIcon name="WarningDiamond" size={14} color="#e8b887" />
                <span
                  className="typo-caption tabular-nums"
                  style={{ color: "#e8b887", letterSpacing: "0.05em" }}
                >
                  {weeklyVariant.week}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLeaderboardOpen(true)}
                className="weekly-leader-btn typo-caption rounded inline-flex items-center gap-1"
                style={{
                  minHeight: 32,
                  padding: "4px 10px",
                  background: `${GB.darkest}88`,
                  border: `1px solid ${GB.lightest}66`,
                  color: GB.lightest,
                }}
                aria-label={t("uphero.weekly.leaderboardAria")}
              >
                <PixelIcon name="Trophy" size={12} color={GB.lightest} />
                {t("uphero.weekly.leaderboardBtn")}
              </button>
            </div>
            <div className="typo-body mb-1" style={{ color: GB.lightest, fontWeight: 500 }}>
              {weeklyAffixName(affix.id, affix.name, language)}
            </div>
            <div className="typo-caption leading-relaxed" style={{ color: GB.light }}>
              {weeklyAffixDescription(affix.id, affix.description, language)}
            </div>
            {weeklyVariant.bestScore > 0 && (
              <div
                className="typo-micro tabular-nums mt-2"
                style={{ color: GB.lightest, opacity: 0.8 }}
              >
                {t("uphero.weekly.myBestScore", {
                  score: weeklyVariant.bestScore.toLocaleString(),
                })}
              </div>
            )}
            <style jsx>{`
              .weekly-leader-btn {
                transition: transform 120ms ${EASE_OUT};
              }
              .weekly-leader-btn:active {
                transform: scale(0.96);
              }
            `}</style>
          </div>
        )}

        {/* 던전 그리드 — F30 클리어한 것만 enable */}
        <div className="grid grid-cols-2 gap-2">
          {DUNGEON_LIST.map((d) => {
            const eligible = isDungeonEligible(d.id);
            const alreadyCleared = weeklyVariant?.clearedDungeons.includes(d.id);
            return (
              <PressButton
                key={d.id}
                // Phase 11c R2 — ineligible 던전도 tap 가능하게 하여 dead-end 방지.
                //   onEnter 가 `"not-unlocked"` 반환 → onNotify 로 진행 방법 안내.
                onClick={() => onEnter(d.id)}
                style={{
                  background: eligible ? `${GB.dark}99` : "transparent",
                  border: `1px solid ${
                    alreadyCleared ? GB_LEGEND_COLOR : eligible ? d.themeColor : GB.dark
                  }`,
                  opacity: eligible ? 1 : 0.55,
                  minHeight: 76,
                  padding: "12px 10px",
                }}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <PixelIcon
                    name={CATEGORY_ICON[d.id]}
                    size={18}
                    color={eligible ? d.themeColor : GB.light}
                  />
                  {alreadyCleared && (
                    <PixelIcon name="Check" size={12} color={GB_LEGEND_COLOR} />
                  )}
                </div>
                <div
                  className="typo-caption truncate"
                  style={{ color: eligible ? GB.lightest : GB.light }}
                >
                  {dungeonName(d.id, d.name, language)}
                </div>
                <div
                  className="typo-micro tabular-nums mt-0.5"
                  style={{ color: eligible ? "#e8b887" : GB.light, opacity: 0.8 }}
                >
                  {eligible
                    ? t("uphero.weekly.f30Badge")
                    : t("uphero.weekly.f30Locked")}
                </div>
              </PressButton>
            );
          })}
        </div>

        {/* Phase 12 R11 — 리셋 카운트다운 + 시간대 명시.
             KST 월요일 오전 9시 = UTC 월요일 00시. "매주 월요일" 만 있으면
             UTC / 현지 시간 오해 가능. 카운트다운은 유저가 "언제 다시 와야
             하나" 즉시 판단 가능. */}
        <div
          className="typo-micro mt-3 text-center"
          style={{ color: GB.light, opacity: 0.75, letterSpacing: "0.05em" }}
        >
          {t("uphero.weekly.nextReset", {
            duration: formatWeeklyCountdown(resetMs, t),
          })}
        </div>
        <div
          className="typo-micro mt-0.5 text-center"
          style={{ color: GB.light, opacity: 0.5, letterSpacing: "0.05em" }}
        >
          {t("uphero.weekly.noExpeditionCost")}
        </div>
      </div>

      {leaderboardOpen && weeklyVariant && (
        <Suspense fallback={null}>
          <WeeklyLeaderboardLazy
            weekId={weeklyVariant.week}
            affixName={
              affix
                ? weeklyAffixName(affix.id, affix.name, language)
                : t("uphero.weekly.defaultName")
            }
            onClose={() => setLeaderboardOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/** GB_LEGEND color — "클리어 완료" 뱃지 톤. upHeroPalette 의 GB_LEGEND 재사용. */
const GB_LEGEND_COLOR = "#e8b887";

/** WeeklyLeaderboard 를 lazy 로 — 초기 탭 번들 영향 최소화. */
const WeeklyLeaderboardLazy = lazy(() => import("./WeeklyLeaderboard"));
