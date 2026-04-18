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

import { useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import {
  SHOP_PRICES,
  PASS_CAP_PER_CATEGORY,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { DungeonId } from "@/types/uphero";
import { useSound } from "@/hooks/useSound";
import PixelIcon from "@/components/icons/PixelIcon";
import HeroSprite from "./HeroSprite";
import { getHeroAppearanceVariant } from "@/types/uphero";
import EquipmentInventory from "./EquipmentInventory";
import HeroCodex from "./HeroCodex";
import HeroStatPanel from "./HeroStatPanel";
import BuffDrawPanel from "./BuffDrawPanel";
import NumberRoll from "./NumberRoll";

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

type View = "home" | "dungeons" | "shop" | "equipment" | "codex";

export default function CampPlaceholder() {
  const coins = useUpHeroStore((s) => s.coins);
  const passes = useUpHeroStore((s) => s.passes);
  const hero = useUpHeroStore((s) => s.hero);
  const pendingDungeon = useUpHeroStore((s) => s.pendingDungeon);
  const level = useGameStore((s) => s.progress.level);
  const tickets = useGameStore((s) => s.progress.tickets ?? 0);

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
      {/* === Header (글로벌) === */}
      <header
        className="px-4 py-3 flex items-center justify-between shrink-0 typo-caption"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: GB.lightest }}>갓생 영웅</span>
          <span className={gbClass.textDim}>Lv.{level}</span>
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
          <span className={gbClass.textDim}>|</span>
          <span className="inline-flex items-center gap-1">
            <PixelIcon name="Card" size={14} color={GB.light} />
            <NumberRoll
              value={tickets}
              format={(v) => `${v}/10`}
              style={{ color: GB.light }}
              gainColor={GB.lightest}
            />
          </span>
        </div>
      </header>

      {/* === Body — view 전환. pendingDungeon 이 최우선 (confirm/cancel 대기) === */}
      <div className="flex-1 min-h-0 flex flex-col">
        {pendingDungeon && <BuffDrawPanel />}
        {!pendingDungeon && view === "home" && (
          <HomeView
            hero={hero}
            heroLevel={level}
            totalPasses={totalPasses}
            onOpenDungeons={() => {
              if (totalPasses <= 0) {
                notify("탐험권이 없어요. 챌린지를 완료하세요");
                return;
              }
              setView("dungeons");
            }}
            onOpenShop={() => setView("shop")}
            onOpenEquipment={() => setView("equipment")}
            onOpenCodex={() => setView("codex")}
            onOpenStats={() => setStatsOpen(true)}
          />
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
          <EquipmentInventory
            onBack={() => setView("home")}
            onNotify={notify}
          />
        )}
        {!pendingDungeon && view === "codex" && (
          <HeroCodex onBack={() => setView("home")} />
        )}
      </div>

      {/* HeroStatPanel — 영웅 sprite 탭 시 overlay */}
      {statsOpen && <HeroStatPanel onClose={() => setStatsOpen(false)} />}

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
}: {
  hero: { name: string; classType: import("@/types/uphero").ClassType | null };
  heroLevel: number;
  totalPasses: number;
  onOpenDungeons: () => void;
  onOpenShop: () => void;
  onOpenEquipment: () => void;
  onOpenCodex: () => void;
  onOpenStats: () => void;
}) {
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(heroLevel) as 0 | 1 | 2;
  // Phase 4c-polish: 카테고리별 탐험권 시각화 — totalPasses 와 별도로 raw 객체 필요
  const passes = useUpHeroStore((s) => s.passes);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 영웅 캠프 공간 — 큰 hero sprite + 분위기 */}
      <section className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 relative">
        {/* 배경 별/이펙트 — subtle */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: `radial-gradient(ellipse at 50% 70%, ${GB.dark}66 0%, transparent 60%)`,
          }}
        />

        {/* 이름 태그 — typo-micro 예외: nameplate 라벨, 본문 아님 */}
        <div
          className="typo-micro mb-3 px-2.5 py-1 rounded-sm relative"
          style={{
            color: GB.darkest,
            background: GB.lightest,
            letterSpacing: "0.05em",
          }}
        >
          {hero.name}
        </div>

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

        {/* 분위기 텍스트 — Phase 8b: 실제로 타오르듯 flicker.
             opacity + warm text-shadow 를 4.2s 주기로 호흡. */}
        <div
          className="uphero-fire-flicker mt-5 typo-caption text-center"
          style={{ color: GB.light }}
        >
          — 모닥불이 조용히 타오른다 —
        </div>

        {/* Phase 4c-polish → 5a.4 redesign: 탐험권 카테고리별 시각화.
             rounded+border+fill pill 이 dot-matrix 감성과 어긋나 underline
             스타일로 치환. 숫자 위에 2px underline, 색은 던전 themeColor.
             전체 0 이면 여전히 섹션 숨김 (CTA 힌트로 위임). */}
        {totalPasses > 0 && (
          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            {DUNGEON_LIST.map((d) => {
              const count = passes[d.id] ?? 0;
              const empty = count === 0;
              return (
                <div
                  key={d.id}
                  className="flex flex-col items-center tabular-nums"
                  title={`${d.name} ×${count}`}
                  aria-label={`${d.name} 탐험권 ${count}장`}
                >
                  <span
                    className="typo-micro"
                    style={{
                      color: empty ? `${GB.light}60` : GB.lightest,
                      letterSpacing: "0.05em",
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </span>
                  <div
                    style={{
                      width: 20,
                      height: 2,
                      background: empty ? GB.dark : d.themeColor,
                      marginTop: 3,
                      opacity: empty ? 0.5 : 1,
                      transition: `background 180ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 하단 CTA 3개 (stacked) */}
      <section
        className="px-4 pt-3 pb-4 flex flex-col gap-2 shrink-0"
        style={{ borderTop: `1px solid ${GB.dark}` }}
      >
        <PrimaryCTA
          onClick={() => {
            play("select");
            onOpenDungeons();
          }}
          disabled={totalPasses <= 0}
          iconName="Target"
          label="탐험 시작"
          badge={`×${totalPasses}`}
          hint={totalPasses > 0 ? "던전 선택" : "챌린지 완료로 탐험권 획득"}
        />
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

  const onEnter = (dungeonId: DungeonId) => {
    const result = prepareBuffDraw(dungeonId);
    if (result === "no-pass") {
      onNotify("탐험권이 필요해요");
      return;
    }
    if (result === "no-cards") {
      // 보유 카드 없음 — 버프 스킵, 바로 진입
      const ok = enterDungeon(dungeonId);
      if (!ok) {
        onNotify("탐험권이 필요해요");
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
  const { play } = useSound();

  const onBuyTicket = () => {
    const ok = purchaseTicket();
    if (ok) {
      play("collect");
      onNotify(`티켓 +1 (${Math.min(10, tickets + 1)}/10)`);
    } else {
      onNotify(tickets >= 10 ? "티켓이 가득 찼어요" : "코인이 부족해요");
    }
  };

  const onBuyPack = (size: "small" | "full") => {
    const ok = purchaseCardPack(size);
    if (ok) {
      play("collect");
      onNotify(size === "full" ? "카드팩 획득" : "보너스 카드 +1");
    } else {
      onNotify("코인이 부족해요");
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SubHeader title="갓생 상점" onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        <ShopRow
          iconName="Card"
          name="미니게임 티켓"
          desc={`현재 ${tickets}/10`}
          price={SHOP_PRICES.ticket}
          onBuy={onBuyTicket}
          canAfford={coins >= SHOP_PRICES.ticket && tickets < 10}
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
          desc="팩 열기로 이동"
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
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

function SubHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <header
      className="px-3 py-2.5 flex items-center gap-3 shrink-0"
      style={{ borderBottom: `1px solid ${GB.dark}` }}
    >
      <PressButton
        onClick={onBack}
        style={{
          minHeight: 40,
          padding: "8px 12px",
          background: `${GB.dark}cc`,
          border: `1px solid ${GB.light}`,
          color: GB.light,
        }}
      >
        <span className="inline-flex items-center gap-1 typo-caption">
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
        </span>
      </PressButton>
      <div className="typo-caption" style={{ color: GB.lightest }}>
        {title}
      </div>
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
 * PressButton — CSS-first press feedback.
 * :active scale(0.97), 인터럽트 가능 (CSS transition).
 */
function PressButton({
  children,
  onClick,
  disabled,
  style,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
