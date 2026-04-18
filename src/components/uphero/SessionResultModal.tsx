"use client";

/**
 * Up Hero — 세션 결산 modal.
 *
 * currentSession.status === "completed" 일 때 표시.
 * acknowledgeSessionEnd() 호출로 reward 적용 + session 초기화.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { DUNGEONS } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, gbClass, GB_ENEMY } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useCountUp } from "@/hooks/useCountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import { dungeonName, monsterNameById } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";
import DropRevealCard from "./DropRevealCard";

// Phase 9b — useCountUp 은 hooks/useCountUp.ts 로 공용화. 이전엔 이 파일 +
//   IdleRewardToast 양쪽에 같은 rAF 로직이 복붙돼 있던 걸 정리.

export default function SessionResultModal() {
  const session = useUpHeroStore((s) => s.currentSession);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeSessionEnd);
  const { t, language } = useTranslation();
  // Phase 11c R2 — F30 첫 클리어 감지: 현재 session 에 F30 보스 victory 가 있고,
  //   store dungeons 의 해당 dungeon 이 아직 F30 미기록이면 "최초 돌파" 로 간주.
  //   acknowledge() 호출 시에만 state 가 반영되므로 modal 렌더 시점엔 still "없음" 상태.
  //
  // Phase 11c R3 fix — 이전에 `session.currentFloor === 30` 을 썼지만 skipFloors
  //   ChoiceEffect 가 currentFloor 를 30 으로 밀어버리면 F10/F20 보스 처치만으로도
  //   "F30 최초 돌파" 배너가 뜸 (실제 unlock 은 정상). monster.level 은
  //   createMonsterForFloor 에서 floor 로 할당되므로 per-entry truth.
  const dungeonProgress = useUpHeroStore((s) =>
    session ? s.dungeons[session.dungeonId] : null,
  );
  const isWeeklyVariant = !!session?.isWeeklyVariant;
  const f30FirstClear =
    !!session &&
    !isWeeklyVariant &&
    !dungeonProgress?.bossesDefeated?.includes(30) &&
    session.log.some(
      (e) => e.type === "victory" && e.monster.isBoss && e.monster.level === 30,
    );

  const [mounted, setMounted] = useState(false);
  // Phase 11c R4 — reduced-motion 대응. scale 제거, opacity 만 유지.
  const reducedMotion = useReducedMotion();
  const { announce } = useAnnounce();
  // Phase 4c-polish — detail 은 타이틀 등장 후 280ms 뒤 fade-in.
  // "결과 (모험 완료) → 사유 (거인을 쓰러뜨렸다)" 두 박자 reveal.
  const [detailMounted, setDetailMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const detailTimer = window.setTimeout(() => setDetailMounted(true), 280);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(detailTimer);
    };
  }, []);

  // Phase 11c R4 R2 — F30 최초 돌파 공지를 시각 등장과 sync.
  //   기존엔 role="alert" 로 DOM insertion 즉시 (opacity 0 상태) 공지 → 시각+청각 race.
  //   이제 detailMounted 후 effect 에서 `announce(assertive)` 로 한 번만 공지.
  const didAnnounceF30Ref = useRef(false);
  useEffect(() => {
    if (!detailMounted) return;
    if (!f30FirstClear) return;
    if (didAnnounceF30Ref.current) return;
    didAnnounceF30Ref.current = true;
    // Phase 11c R4 R3 — title 이 이미 "F30 최초 돌파" 공지하므로 unlock 내용만 중계.
    announce(t("uphero.session.ngPlusUnlockedAnnounce"), "assertive");
  }, [detailMounted, f30FirstClear, announce, t]);

  // Phase 8b — count-up: detail 등장 이후 시작해서 visual hierarchy 지킴.
  //   결산 타이틀 → detail fade-in (280ms) → reward 숫자 count-up (700ms)
  //   결국 1초 이내에 모든 정보가 자리잡음.
  const rewardsXp = session?.rewards.xp ?? 0;
  const rewardsCoins = session?.rewards.coins ?? 0;
  const xpDisplay = useCountUp(rewardsXp, 700, detailMounted);
  const coinDisplay = useCountUp(rewardsCoins, 700, detailMounted);

  // Phase 9a — Esc + focus trap + body scroll lock.
  //   세션 결산 직후 자동 close 가 아니라 사용자 "캠프로 돌아가기" 탭을 기다리므로
  //   Esc 로 빠른 acknowledge 허용 (Esc === acknowledge 로 매핑).
  // Phase 11c R4 — initialFocus 를 title 에 줘 SR 가 "보스 처치 F30 최초 돌파"
  //   먼저 읽도록. 기존엔 첫 focusable = DropRevealCard 로 가 제목 놓침.
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, acknowledge, { initialFocus: titleRef });

  if (!session || session.status !== "completed") return null;
  if (typeof window === "undefined") return null;

  const dungeon = DUNGEONS[session.dungeonId];
  const lastEntry = session.log[session.log.length - 1];
  const reason =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : "heroAbandoned";
  // Phase 13a — detail 다국어. detailKey 가 있으면 t() 로 풀고, monster
  //   templateId 가 함께 저장돼 있으면 monsterName 헬퍼로 다국어 monster name 주입.
  //   legacy 세이브 (detailKey 없음) 는 한국어 detail 그대로 fallback.
  const detail = (() => {
    if (lastEntry?.type !== "sessionEnd") return undefined;
    if (lastEntry.detailKey) {
      const monsterTranslated = lastEntry.detailMonsterTemplateId
        ? monsterNameById(
            lastEntry.detailMonsterTemplateId,
            lastEntry.detailMonsterFallback ?? "",
            language,
          )
        : "";
      return t(lastEntry.detailKey as DictKey, {
        monster: monsterTranslated,
      });
    }
    return lastEntry.detail;
  })();

  // Phase 4c.1 — 사유별 구체 타이틀/아이콘/색
  // legacy reason ("victory"/"defeat"/"abandoned") 도 매핑 (이전 세션 호환).
  const { titleKey, titleColor, iconName } = resolveReasonDisplay(reason);
  const title = t(titleKey);

  // Phase 4c-balance — 사망 시 drops 절반 잃음. 표시 위해 분리 계산.
  // store 의 acknowledgeSessionEnd 와 동일한 로직을 미러링 (slice(0, floor/2)).
  const heroDied = reason === "heroDied" || reason === "defeat";
  const allDrops = session.rewards.drops;
  const keptCount = heroDied ? Math.floor(allDrops.length / 2) : allDrops.length;
  const lostCount = allDrops.length - keptCount;
  const keptDrops = allDrops.slice(0, keptCount);
  const lostDrops = allDrops.slice(keptCount);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}e0`,
        opacity: mounted ? 1 : 0,
        transition: `opacity 180ms ${EASE_OUT}`,
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-result-title"
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.light}`,
          transform: reducedMotion ? undefined : mounted ? "scale(1)" : "scale(0.96)",
          opacity: mounted ? 1 : 0,
          transition: reducedMotion
            ? `opacity 180ms ${EASE_OUT}`
            : `transform 220ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-4 text-center flex flex-col items-center gap-1.5"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div className="typo-caption" style={{ color: GB.light }}>
            {dungeonName(dungeon.id, dungeon.name, language)} — F{session.currentFloor}
          </div>
          <PixelIcon
            name={iconName}
            size={f30FirstClear ? 28 : 22}
            color={f30FirstClear ? "#e8b887" : titleColor}
          />
          <div
            id="session-result-title"
            ref={titleRef}
            tabIndex={-1}
            className="typo-heading"
            style={{ color: f30FirstClear ? "#e8b887" : titleColor, outline: "none" }}
          >
            {f30FirstClear ? t("uphero.session.f30FirstClear") : title}
          </div>
          {/* Phase 4c.1 — 사유 상세 (예: "시간이 다했다", "산악의 거인을 쓰러뜨렸다").
               Phase 4c-polish: 타이틀이 자리잡은 후 두 박자로 fade-in + y-shift. */}
          {detail && (
            <div
              className="typo-caption px-2"
              style={{
                color: GB.light,
                opacity: detailMounted ? 0.85 : 0,
                transform: detailMounted ? "translateY(0)" : "translateY(-4px)",
                transition: `opacity 240ms ${EASE_OUT}, transform 240ms ${EASE_OUT}`,
              }}
            >
              {detail}
            </div>
          )}
          {/* Phase 11c R2 — F30 최초 돌파 시 NG+ / 주간 악몽 해금 안내.
               R4 R2: role=alert 제거 + detailMounted 후에만 DOM insertion.
               SR 공지는 `announce` 훅으로 시각 등장과 sync (아래 useEffect). */}
          {f30FirstClear && detailMounted && (
            <div
              className="typo-caption px-3 py-1.5 mt-1 rounded"
              style={{
                color: "#e8b887",
                background: `${"#e8b887"}15`,
                border: `1px solid ${"#e8b887"}44`,
                transition: `opacity 300ms ${EASE_OUT}, transform 300ms ${EASE_OUT}`,
              }}
            >
              {t("uphero.session.ngPlusUnlocked")}
            </div>
          )}
        </div>

        {/* Rewards */}
        <div className="px-4 py-4 flex flex-col gap-2.5">
          <RewardRow
            iconName="Sparkle"
            label={t("uphero.session.result.xp")}
            value={`+${xpDisplay} XP`}
            accent={rewardsXp > 0}
          />
          <RewardRow
            iconName="Coins"
            label={t("uphero.session.result.coins")}
            value={`+${coinDisplay} C`}
            accent={rewardsCoins > 0}
          />
          <div>
            <div
              className="typo-caption mb-2 inline-flex items-center gap-1.5"
              style={{ color: GB.light }}
            >
              <PixelIcon name="Gift" size={14} color={GB.light} />
              {/* i18n — lost 개수에 따라 다른 key 사용 */}
              {lostCount > 0
                ? t("uphero.session.result.dropsLabelWithLost", {
                    kept: keptCount,
                    lost: lostCount,
                  })
                : t("uphero.session.result.dropsLabel", {
                    kept: keptCount,
                  })}
            </div>
            {allDrops.length === 0 ? (
              <div className={`typo-caption ${gbClass.textDim} pl-4`}>
                {t("uphero.session.result.noDrops")}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center py-2">
                {keptDrops.map((eq) => (
                  <DropRevealCard key={eq.id} equipment={eq} />
                ))}
                {/* 잃은 drops — dim + 45deg stripe texture 로 "놓쳤다" 표시 */}
                {lostDrops.map((eq) => (
                  <div
                    key={`lost-${eq.id}`}
                    className="relative"
                    style={{ opacity: 0.35, filter: "saturate(0.4)" }}
                    aria-label={t("uphero.session.result.dropLostAria", { name: eq.name })}
                  >
                    <DropRevealCard equipment={eq} />
                    <div
                      className="absolute inset-0 rounded pointer-events-none"
                      style={{
                        background: `repeating-linear-gradient(
                          45deg,
                          transparent 0 4px,
                          ${GB_ENEMY}30 4px 6px
                        )`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {keptDrops.length > 0 && (
              <div
                className={`typo-caption ${gbClass.textDim} text-center mt-1`}
              >
                {t("uphero.session.tapCardHint")}
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div
          className="px-4 py-3"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          {/* Phase 9c — inline onMouseDown/Up/Leave/TouchStart/TouchEnd 5핸들러를
                CSS :active 로 교체. 다른 uphero 버튼들과 패턴 통일. */}
          <button
            type="button"
            onClick={acknowledge}
            className="session-result-cta w-full py-3 rounded typo-caption"
            style={{
              minHeight: 44,
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
            }}
          >
            {t("uphero.session.result.cta")}
            <style jsx>{`
              .session-result-cta {
                transition: transform 120ms ${EASE_OUT};
              }
              .session-result-cta:active {
                transform: scale(0.97);
              }
            `}</style>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Phase 4c.1 — 종료 사유별 타이틀/색/아이콘 매핑.
 * legacy reason 도 알맞은 신규 reason 으로 mapping.
 */
/**
 * Phase 12 i18n — 종료 사유를 i18n key + 색/아이콘 메타로 반환.
 *   실제 제목 텍스트는 호출 측에서 `t(titleKey)` 로 현재 언어 조회.
 */
function resolveReasonDisplay(
  reason: string,
): { titleKey: DictKey; titleColor: string; iconName: string } {
  switch (reason) {
    case "bossDefeated":
    case "victory": // legacy
      return {
        titleKey: "uphero.session.result.title.bossDefeated",
        titleColor: GB.lightest,
        iconName: "Trophy",
      };
    case "heroDied":
    case "defeat": // legacy
      return {
        titleKey: "uphero.session.result.title.heroDied",
        titleColor: GB_ENEMY,
        iconName: "Skull",
      };
    case "timeExpired":
      return {
        titleKey: "uphero.session.result.title.timeExpired",
        titleColor: GB.light,
        iconName: "Clock",
      };
    case "heroAbandoned":
    case "abandoned": // legacy
    default:
      return {
        titleKey: "uphero.session.result.title.abandoned",
        titleColor: GB.light,
        iconName: "Flag",
      };
  }
}

function RewardRow({
  iconName,
  label,
  value,
  accent,
}: {
  iconName: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between typo-caption">
      <span className="inline-flex items-center gap-1.5" style={{ color: GB.light }}>
        <PixelIcon name={iconName} size={14} color={GB.light} />
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{ color: accent ? GB.lightest : GB.light }}
      >
        {value}
      </span>
    </div>
  );
}

