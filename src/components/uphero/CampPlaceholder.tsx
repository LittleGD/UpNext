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

import { Suspense, lazy, useEffect, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore, getTodayString } from "@/store/useGameStore";
import { DAILY_CARDMATCH_TICKET_CAP, getXPProgress } from "@/types/game";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { pickCampAmbience } from "@/data/upHeroFlavor";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import {
  SHOP_PRICES,
  PASS_CAP_PER_CATEGORY,
  DAILY_PASS_PURCHASE_CAP,
  CLASS_THEME_COLOR,
  getEffectiveHeroLevel,
} from "@/types/uphero";
import type { DungeonId } from "@/types/uphero";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
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
  // Phase 12a — header 에 hero.name 노출. 하드코딩 "갓생 영웅" 대체.
  const heroName = hero.name?.trim() || "갓생 영웅";
  const pendingDungeon = useUpHeroStore((s) => s.pendingDungeon);
  // Phase 12 — XP 진행도 (상단바 표시용). progress.xp 는 챌린지/영웅 공유 pool.
  const totalXp = useGameStore((s) => s.progress.xp ?? 0);
  // Phase 9d — 영웅 전용 레벨 사용 (챌린지 Lv 와 분리).
  //   신규 영웅 유저는 heroStartLevel=gameLevel 로 seed → 영웅 Lv 1.
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const level = getEffectiveHeroLevel(gameLevel, heroStartLevel);
  // Phase 12 — 현재 레벨 내 XP 진행도. gameLevel 의 current-within-level 값이
  //   heroLv 진행도와 동일 (heroLv 는 gameLv 의 1:1 오프셋이라 레벨 내 %는 같음).
  const xpInfo = getXPProgress(totalXp, gameLevel);
  const tickets = useGameStore((s) => s.progress.tickets ?? 0);
  // Phase 12 — header 에 NG+ badge 노출. 홈 view 의 nameplate 를 제거하면서
  //   NG+ 정보를 header 로 승격 (정보가 사라지지 않도록). ngPlusLevel > 0 일
  //   때만 렌더.
  const ngPlusLevel = useUpHeroStore((s) => s.ngPlusLevel ?? 0);
  const { t } = useTranslation();

  const [view, setView] = useState<View>("home");
  const [toast, setToast] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const totalPasses = Object.values(passes).reduce(
    (a, b) => (a ?? 0) + (b ?? 0),
    0,
  ) as number;

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
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
          <span className={gbClass.textDim}>Lv.{level}</span>
          {/* Phase 12 — XP 진행도 수치 표시. 유저 피드백: "레벨 시스템은 따로 가되
               경험치는 공유, 상단바 레벨 옆에 수치 표시".
               XP pool 은 챌린지/영웅 세션 공유 (progress.xp), Lv 진행도는
               영웅 Lv 와 챌린지 Lv 가 같은 진행률 (heroLv = gameLv - heroStartLv + 1).
               따라서 getXPProgress(progress.xp, gameLevel) 값을 그대로 사용 가능. */}
          <span
            className={`tabular-nums ${gbClass.textDim}`}
            style={{ fontSize: 11 }}
            aria-label={`경험치 ${xpInfo.current} / ${xpInfo.needed}`}
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
              title="F30 보스 클리어 반복 횟수"
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
  const variant = getHeroAppearanceVariant(heroLevel) as 0 | 1 | 2;
  // Phase 11c — NG+ / 주간 악몽 정보
  const ngPlusLevel = useUpHeroStore((s) => s.ngPlusLevel ?? 0);
  const weeklyVariant = useUpHeroStore((s) => s.weeklyVariant);
  const dungeons = useUpHeroStore((s) => s.dungeons);
  const f30Unlocked =
    ngPlusLevel > 0 ||
    Object.values(dungeons).some((d) => d?.bossesDefeated?.includes(30));

  // Phase 12 — 캠프 분위기 텍스트 로테이션.
  //   초기값은 "모닥불이 조용히 타오른다" 고정 (SSR hydration 안정 — 서버/첫
  //   CSR 렌더 동일). mount 직후 랜덤 전환 + 20s 주기 교체. 직전 문구는
  //   pickCampAmbience(prev) 로 연속 회피. state/effect 를 HomeView 에 두어
  //   다른 view (상점/장비 등) 로 이동 시 interval 이 자동 정리되도록 수명 제한.
  const [ambienceLine, setAmbienceLine] = useState(
    "모닥불이 조용히 타오른다",
  );
  useEffect(() => {
    setAmbienceLine((prev) => pickCampAmbience(prev));
    const id = window.setInterval(() => {
      setAmbienceLine((prev) => pickCampAmbience(prev));
    }, 20000);
    return () => window.clearInterval(id);
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
          aria-label="영웅 스탯 보기"
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
          aria-label="영웅 스탯 · 스킬트리 열기"
        >
          <PixelIcon name="User" size={10} color={GB.lightest} />
          {hero.classType ? "스탯 · 스킬트리" : "스탯 보기"}
        </button>

        {/* 분위기 텍스트 — Phase 8b: 실제로 타오르듯 flicker.
             opacity + warm text-shadow 를 4.2s 주기로 호흡.
             Phase 12 — 15 줄 pool 에서 랜덤 선택 + 20s 주기 교체. outer 에
             key 기반 crossfade (blur 2.5px → 0, Y -3px → 0, 520ms) / inner 에
             infinite fire-flicker 분리. 두 애니가 같은 opacity 를 건드리지
             않도록 outer=fade/blur/transform, inner=opacity/text-shadow 로
             역할 나눔 → compositing 상에서 두 효과가 곱으로 자연스럽게 합쳐짐. */}
        <div className="mt-5 text-center">
          <div key={ambienceLine} className="uphero-ambience-in inline-block">
            <div
              className="uphero-fire-flicker typo-caption"
              style={{ color: GB.light }}
              aria-live="off"
            >
              — {ambienceLine} —
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
          label={totalPasses > 0 ? "탐험 시작" : "탐험권 구매"}
          badge={totalPasses > 0 ? `×${totalPasses}` : undefined}
          hint={
            totalPasses > 0
              ? "던전 선택"
              : "챌린지 완료 또는 상점에서 구매"
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
          label="갓생 상점"
          hint="티켓 / 카드팩"
        />
        <SecondaryCTA
          onClick={() => {
            play("select");
            onOpenEquipment();
          }}
          iconName="Shield"
          label="장비"
          hint="장착 · 판매 · 강화"
        />
        <SecondaryCTA
          onClick={() => {
            play("select");
            onOpenCodex();
          }}
          iconName="BookOpen"
          label="도감"
          hint="만난 몬스터 기록"
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
  const { t } = useTranslation();

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

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title="던전 선택" onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          {DUNGEON_LIST.map((d) => {
            const count = passes[d.id] ?? 0;
            const progress = dungeons[d.id];
            const floor = progress?.floorReached ?? 0;
            const disabled = count === 0;
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
                  {/* typo-micro 예외: 작은 수량 배지 */}
                  <span
                    className="typo-micro px-1.5 py-0.5 rounded tabular-nums"
                    style={{
                      color: GB.lightest,
                      background: count > 0 ? `${d.themeColor}30` : "transparent",
                      border: count > 0 ? `1px solid ${d.themeColor}` : "none",
                    }}
                  >
                    ×{count}
                  </span>
                </div>
                <div
                  className="typo-caption leading-tight truncate"
                  style={{ color: disabled ? GB.light : GB.lightest }}
                >
                  {d.name}
                </div>
                <div
                  className="typo-caption mt-1 tabular-nums"
                  style={{
                    color: GB.light,
                    opacity: count >= PASS_CAP_PER_CATEGORY ? 1 : 0.75,
                  }}
                >
                  {floor > 0 ? `F${floor} 도달` : "미탐험"}
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
  const shopDaily = useUpHeroStore((s) => s.shopDaily);
  const passes = useUpHeroStore((s) => s.passes);
  // Phase 12a — 카드매치 티켓 하루 구매 현황.
  const cardmatchShopDaily = useGameStore((s) => s.progress.cardmatchShopDaily);
  const cardmatchBoughtToday =
    cardmatchShopDaily?.date === getTodayString()
      ? cardmatchShopDaily.bought
      : 0;
  const { play } = useSound();
  const { t } = useTranslation();

  const passesBoughtToday = shopDaily?.passesBought ?? 0;
  const dailyCapReached = passesBoughtToday >= DAILY_PASS_PURCHASE_CAP;

  // Phase 12 R6 — 800 coin 풀 카드팩 safeguard. 실수 탭으로 800 코인 날림
  //   방지. small (200 coin) 은 부담 낮아 스킵.
  const [confirmFullPack, setConfirmFullPack] = useState(false);

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
      onNotify(t("uphero.shop.insufficient"));
    }
  };

  const confirmFullPackPurchase = () => {
    setConfirmFullPack(false);
    const ok = purchaseCardPack("full");
    if (ok) {
      play("collect");
      onNotify(t("uphero.shop.packFull"));
    } else {
      onNotify(t("uphero.shop.insufficient"));
    }
  };

  const onBuyPass = (dungeonId: DungeonId) => {
    const result = purchasePass(dungeonId);
    if (result === "ok") {
      play("collect");
      const dName = DUNGEON_LIST.find((d) => d.id === dungeonId)?.name ?? "";
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

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title="갓생 상점" onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
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
              탐험권 구매
            </div>
            <div
              className={`typo-micro tabular-nums ${
                dailyCapReached ? gbClass.textDim : ""
              }`}
              style={{
                color: dailyCapReached ? undefined : GB.light,
                letterSpacing: "0.05em",
              }}
              aria-label={`오늘 구매 ${passesBoughtToday} 중 ${DAILY_PASS_PURCHASE_CAP} 한도`}
            >
              오늘 {passesBoughtToday}/{DAILY_PASS_PURCHASE_CAP}
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
                  aria-label={`${d.name} 탐험권 구매 (${SHOP_PRICES.expeditionPass} 코인)`}
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
            {SHOP_PRICES.expeditionPass} 코인 / 장 · 하루 {DAILY_PASS_PURCHASE_CAP}장 한정
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
        <ShopRow
          iconName="Card"
          name="카드매치 티켓"
          desc={`현재 ${tickets}/10 · 오늘 ${cardmatchBoughtToday}/${DAILY_CARDMATCH_TICKET_CAP}`}
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
          name="보너스 카드 (1장)"
          desc="다음 뽑기에 +1"
          price={SHOP_PRICES.cardPackSmall}
          onBuy={() => onBuyPack("small")}
          canAfford={coins >= SHOP_PRICES.cardPackSmall}
        />
        <ShopRow
          iconName="Package"
          name="풀 카드팩 (5장)"
          desc="5장 뽑기 · 희귀 카드 확률 ↑"
          price={SHOP_PRICES.cardPackFull}
          onBuy={() => onBuyPack("full")}
          canAfford={coins >= SHOP_PRICES.cardPackFull}
        />

        <div
          className="mt-2 p-3 typo-caption text-center rounded"
          style={{
            color: GB.light,
            background: `${GB.dark}40`,
            border: `1px dashed ${GB.dark}`,
          }}
        >
          갓생 코인은 던전에서 획득합니다
        </div>
      </div>
      {/* Phase 12 R6 — 풀 카드팩 (800 코인) 실수 구매 safeguard. */}
      <GbConfirm
        open={confirmFullPack}
        title="풀 카드팩을 구매할까요?"
        body={
          <>
            <div className="typo-caption" style={{ color: GB.light }}>
              카드 5 장을 한 번에 뽑습니다.
            </div>
            <div
              className="typo-caption mt-1 tabular-nums"
              style={{ color: GB.light }}
            >
              비용 {SHOP_PRICES.cardPackFull} 코인 · 잔액 {coins} 코인
            </div>
          </>
        }
        confirmLabel="구매"
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
        aria-label="뒤로"
      >
        <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
        뒤로
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
  return (
    <div
      className="flex-1 min-h-0 flex items-center justify-center"
      style={{ color: GB.light }}
    >
      <div className="typo-caption font-mono" style={{ letterSpacing: "0.1em" }}>
        LOADING...
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
  const affix = getWeeklyAffixById(affixId);
  const SAND = "#e8b887";
  // Phase 11c R4 — SR 전용 label. 기존 innerText 는 맥락 없이 조각으로 읽힘.
  const srLabel = [
    "이번 주 악몽",
    affix?.name ?? "",
    weekId,
    clearedCount > 0 ? `던전 ${clearedCount}/8 클리어` : null,
    bestScore > 0 ? `최고 ${bestScore.toLocaleString()}점` : null,
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
            이번 주 악몽 · {affix?.name ?? "—"}
          </div>
          <div
            className="typo-micro truncate tabular-nums"
            style={{ color: GB.light, opacity: 0.7 }}
          >
            {weekId}
            {clearedCount > 0 && ` · ${clearedCount}/8`}
            {bestScore > 0 && ` · 최고 ${bestScore.toLocaleString()}`}
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

/** ms → "N 일 M 시간" / "M 시간 S 분" / "S 분" 포맷. */
function formatWeeklyCountdown(ms: number): string {
  if (ms <= 0) return "리셋 중";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

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
  const { t } = useTranslation();
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
      <SubHeader title="이번 주 악몽" onBack={onBack} />

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
                aria-label="리더보드 보기"
              >
                <PixelIcon name="Trophy" size={12} color={GB.lightest} />
                순위
              </button>
            </div>
            <div className="typo-body mb-1" style={{ color: GB.lightest, fontWeight: 500 }}>
              {affix.name}
            </div>
            <div className="typo-caption leading-relaxed" style={{ color: GB.light }}>
              {affix.description}
            </div>
            {weeklyVariant.bestScore > 0 && (
              <div
                className="typo-micro tabular-nums mt-2"
                style={{ color: GB.lightest, opacity: 0.8 }}
              >
                내 최고 점수: {weeklyVariant.bestScore.toLocaleString()}
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
                  {d.name}
                </div>
                <div
                  className="typo-micro tabular-nums mt-0.5"
                  style={{ color: eligible ? "#e8b887" : GB.light, opacity: 0.8 }}
                >
                  {eligible ? "F30 변이" : "F30 미도달"}
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
          다음 악몽까지 {formatWeeklyCountdown(resetMs)}
        </div>
        <div
          className="typo-micro mt-0.5 text-center"
          style={{ color: GB.light, opacity: 0.5, letterSpacing: "0.05em" }}
        >
          탐험권 소모 없음 · KST 월요일 오전 9시 리셋
        </div>
      </div>

      {leaderboardOpen && weeklyVariant && (
        <Suspense fallback={null}>
          <WeeklyLeaderboardLazy
            weekId={weeklyVariant.week}
            affixName={affix?.name ?? "이번 주 악몽"}
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
