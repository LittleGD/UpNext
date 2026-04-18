"use client";

/**
 * Up Hero — 전투 로그 피드.
 *
 * 설계:
 *  - 최신 entry 가 하단에, auto-scroll
 *  - entry type 별 색/아이콘 구분 (GB 4색 내에서 변주)
 *  - 신규 entry 는 subtle fade-in
 *  - 로그 본문은 로그라이크 감성 유지 위해 monospace (게임 예외)
 *    크기는 app 타이포 시스템 typo-caption (14px 모바일) 기준
 *  - 이모지 사용 없음 — MonsterSprite / PixelIcon 사용
 */

import { memo, useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/types/uphero";
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_LEGEND, GB_UNIQUE, GB_RARE, GB_WARN } from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { monsterName } from "@/lib/upHeroI18n";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";

/**
 * Phase 8b — Typewriter 효과.
 * 텍스트 로그라이크에서 긴 narrative 가 한 글자씩 타이핑되는 느낌.
 * isLatest (== 새로 들어온 로그) 일 때만 재생 — 과거 로그는 이미 pre-rendered.
 *
 * 설계:
 *  - 글자 기준 18ms (≈55 char/s) — 빠른 편이지만 2×/4× 속도에서도 답답하지 않음
 *  - 40 글자 이상이면 12ms 로 빨라짐 (scan 가능하게)
 *  - 완료 전에 다음 entry 가 들어와서 스크롤 되어도 CSS 애니메이션 유지
 *  - caret 은 진행 중에만 표시
 */
function useTypewriter(text: string, enabled: boolean): {
  visible: string;
  done: boolean;
} {
  // Phase 9a — reduced-motion 사용자에겐 타이핑 건너뛰고 즉시 전체 표시.
  //   CSS 레벨 가드로는 JS setTimeout 체인을 막을 수 없으므로 hook 에서 처리.
  const reducedMotion = useReducedMotion();
  const [chars, setChars] = useState(enabled && !reducedMotion ? 0 : text.length);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setChars(text.length);
      return;
    }
    setChars(0);
    const perChar = text.length > 40 ? 12 : 18;
    let i = 0;
    const tick = () => {
      i += 1;
      setChars(i);
      if (i >= text.length) {
        timerRef.current = null;
        return;
      }
      timerRef.current = window.setTimeout(tick, perChar);
    };
    timerRef.current = window.setTimeout(tick, perChar);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [text, enabled, reducedMotion]);

  return { visible: text.slice(0, chars), done: chars >= text.length };
}

interface CombatLogProps {
  log: LogEntry[];
}

export default function CombatLog({ log }: CombatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll when new entries arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [log.length]);

  return (
    // Phase 9a — a11y:
    //   role="log" + aria-live="polite" → 스크린리더 에 새 로그 entry announce.
    //   aria-atomic="false" → 매번 전체 로그가 아닌 신규 부분만 읊음.
    //   typewriter 진행 중엔 글자 하나씩 DOM 추가돼 VoiceOver 가 과하게 말할 수 있으므로
    //   컨테이너 레벨에서 aria-live 에 맡기고 child 에 aria-hidden 붙이는 대신,
    //   typewriter 적용된 LogLine 은 `aria-busy="true"` 로 typing 중엔 silence → 완료 시 해제.
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="h-full overflow-y-auto px-3 py-3 font-mono typo-caption leading-relaxed"
      style={{
        // Phase 10 — 반투명 배경으로 뒤의 던전 ambient 가 비침. 텍스트 가독성은
        //   여전히 충분 (GB.darkest + alpha 0.7).
        background: `${GB.darkest}b3`,
        color: GB.light,
        scrollbarWidth: "thin",
        scrollbarColor: `${GB.dark} transparent`,
      }}
    >
      {/* Phase 9b — key 를 idx 가 아닌 timestamp 로.
            이전 key={i} 는 로그 추가될 때마다 마지막 라인의 key 가 달라지며
            React 가 기존 LogLine 까지 reconcile. timestamp 는 entry 단위 고유값이라
            rearrange 불가능 + memo 효과 극대화.
            Phase 11a-fix — 같은 tick 에 여러 entry 가 push 되면 Date.now() 가 ms
            해상도 한계로 동일 → key 중복으로 React warning. idx 를 합쳐 고유성 보장.
            log 는 append-only 라 idx 도 entry 에 stable → memo 효과 그대로 유지. */}
      {log.map((entry, i) => (
        <LogLine
          key={`${entry.timestamp ?? 0}_${i}`}
          entry={entry}
          isLatest={i === log.length - 1}
        />
      ))}

      <style jsx>{`
        @keyframes uphero-log-enter {
          from {
            opacity: 0.4;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

// Phase 9b — memo 로 감싸서 과거 log entry 는 재렌더 skip.
//   parent 에 새 entry 가 push 되면 isLatest 가 바뀌는 마지막 두 라인만 리렌더.
//   30F 세션 log 200+ 에서 reconciliation 비용 ↓.
const LogLine = memo(function LogLine({
  entry,
  isLatest,
}: {
  entry: LogEntry;
  isLatest: boolean;
}) {
  const { t, language } = useTranslation();
  const style: React.CSSProperties = {
    animation: isLatest ? `uphero-log-enter 200ms ${EASE_OUT} both` : undefined,
  };

  switch (entry.type) {
    case "narrative":
      return (
        <div style={{ ...style, color: GB.light }} className="opacity-80">
          <TypewriterText text={entry.text} enabled={isLatest} />
        </div>
      );

    case "choiceResult":
      // Phase 11c R1 — event choice 결과. narrative 와 유사 스타일, 약간 밝게 강조.
      // Phase 11c R4 — effectSummary 있으면 " · " 로 inline 추가 (로그 기록용).
      return (
        <div style={{ ...style, color: GB.lightest }} className="opacity-90">
          <TypewriterText
            text={entry.effectSummary ? `${entry.text} · ${entry.effectSummary}` : entry.text}
            enabled={isLatest}
          />
        </div>
      );

    case "floor":
      // Phase 8b — 새 floor 진입 시 divider 에 한 번 sweep.
      // isLatest 일 때만 sweep 재생 (과거 floor 라인까지 반복 재생되면 어지러움).
      return (
        <div
          style={{ ...style, color: GB.lightest }}
          className="my-2 flex items-center gap-2 relative overflow-hidden"
        >
          <span style={{ color: GB.dark }}>━━━</span>
          <span>Floor {entry.to}</span>
          <span style={{ color: GB.dark }} className="flex-1">
            ━━━━━━━━━━━━━━━━━━
          </span>
          {isLatest && (
            <span
              aria-hidden="true"
              className="uphero-floor-sweep absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${GB.lightest}66 50%, transparent 100%)`,
                mixBlendMode: "screen",
              }}
            />
          )}
        </div>
      );

    case "encounter":
      return (
        <div
          style={{ ...style, color: GB.lightest }}
          className="flex items-center gap-1.5"
        >
          <MonsterSprite kind={entry.monster.kind} size={14} color={GB.lightest} />
          <span>{monsterName(entry.monster, language)}</span>
          <span className={gbClass.textDim}>
            (HP {entry.monster.hp} · ATK {entry.monster.atk})
          </span>
        </div>
      );

    case "boss":
      return (
        <div
          style={{
            ...style,
            color: GB_ENEMY,
            textShadow: `0 0 8px color-mix(in srgb, ${GB_ENEMY} 25%, transparent)`,
          }}
          className="my-1 flex items-center gap-1.5"
        >
          <PixelIcon name="WarningDiamond" size={14} color={GB_ENEMY} />
          <span>{t("uphero.log.bossAppear", { name: monsterName(entry.monster, language) })}</span>
        </div>
      );

    case "combat": {
      const isHero = entry.attacker === "hero";

      // Phase 3 — narrative 가 있으면 단문 렌더 (outcome + attacker 별 컬러)
      if (entry.narrative) {
        // crit 색: 영웅 crit = 금색(유리), 적 crit = 빨강(위기)
        //         → 플레이어가 위기 상황 한눈에 식별
        const narrativeColor =
          entry.outcome === "crit"
            ? isHero
              ? GB_LEGEND // 영웅 crit → 금색 (승리의 순간)
              : GB_ENEMY // 적 crit → 빨강 (위기 경고)
            : entry.outcome === "miss" || entry.outcome === "dodge"
              ? GB.light // 허탕/회피 → 은은
              : isHero
                ? GB.lightest // 영웅 hit → 밝은 녹
                : GB_ENEMY; // 적 hit → 붉은 톤
        const dim = entry.outcome === "miss" || entry.outcome === "dodge";
        return (
          <div
            style={{ ...style, color: narrativeColor }}
            className={`pl-3 ${dim ? "opacity-75" : ""}`}
          >
            <TypewriterText text={entry.narrative} enabled={isLatest} />
          </div>
        );
      }

      // Fallback: narrative 없는 일반 hit (67%) 또는 legacy 엔트리.
      //   Phase 12 R2 — TypewriterText 적용해 narrative 와 일관된 타이핑 리듬.
      //   기존 punch-in 방식 (즉시 표시) 은 narrative (타이핑) 와 속도 불일치.
      if (entry.damage <= 0) return null; // 방어: 0 fallback 렌더 금지
      const fallbackText = isHero
        ? t("uphero.log.heroAttackFallback", { damage: entry.damage })
        : t("uphero.log.heroHitFallback", { damage: entry.damage });
      return (
        <div style={{ ...style, color: GB.light }} className="pl-3">
          <TypewriterText text={fallbackText} enabled={isLatest} />
        </div>
      );
    }

    case "victory":
      return (
        <div
          style={{ ...style, color: GB.lightest }}
          className="flex items-center gap-1.5"
        >
          <PixelIcon name="Check" size={14} color={GB.lightest} />
          <span>{t("uphero.log.victory", { name: monsterName(entry.monster, language) })}</span>
          <span className={gbClass.textDim}>
            +{entry.xp} XP / +{entry.coins} C
          </span>
        </div>
      );

    case "drop":
      return (
        <div
          style={{ ...style, color: rarityColor(entry.equipment.rarity) }}
          className="flex items-center gap-1.5"
        >
          <PixelIcon name="Gift" size={14} color={rarityColor(entry.equipment.rarity)} />
          <span>{t("uphero.log.dropGained", { name: entry.equipment.name })}</span>
        </div>
      );

    case "treasure":
      return (
        <div
          style={{ ...style, color: GB_LEGEND }}
          className="flex items-center gap-1.5"
        >
          <PixelIcon name="Coins" size={14} color={GB_LEGEND} />
          <span>
            {entry.description} — +{entry.coins} C
          </span>
        </div>
      );

    case "choice": {
      // Phase 12 — mystery event 는 GB_WARN (amber) 강조. 일반 choice 는 GB.lightest.
      const accent = entry.isMystery ? GB_WARN : GB.lightest;
      return (
        <div
          style={{
            ...style,
            color: GB.lightest,
            borderLeft: `2px solid ${accent}`,
          }}
          className="pl-2 my-1 flex items-start gap-1.5"
        >
          <PixelIcon name="Zap" size={14} color={accent} />
          <div className="flex-1">
            {entry.isMystery && (
              <span
                className="typo-micro tabular-nums mr-1.5"
                style={{
                  color: GB_WARN,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                }}
                aria-label={t("uphero.log.mystery")}
              >
                ?
              </span>
            )}
            {entry.prompt}
            {entry.resolvedIndex != null && (
              <span className={gbClass.textDim}>
                {" "}
                → [{entry.options[entry.resolvedIndex]?.label}]
              </span>
            )}
          </div>
        </div>
      );
    }

    case "sessionEnd": {
      // Phase 4c.1 — 사유별 구체 레이블/색/아이콘. legacy reason 도 매핑.
      const { label, color, iconName } = resolveSessionEndDisplay(entry.reason);
      return (
        <div
          style={{ ...style, color, borderTop: `1px dashed ${GB.dark}` }}
          className="mt-2 pt-2 flex items-start gap-1.5"
        >
          <PixelIcon name={iconName} size={14} color={color} />
          <div className="flex-1">
            <div>{label}</div>
            {entry.detail && (
              <div className={gbClass.textDim}>— {entry.detail}</div>
            )}
          </div>
        </div>
      );
    }

    case "skill":
      // Phase 6b — class 액티브 스킬 발동. Boss banner 수준의 prominence.
      return (
        <div
          style={{
            ...style,
            color: GB.lightest,
            background: `${GB.dark}66`,
            borderLeft: `2px solid ${GB.lightest}`,
            padding: "4px 8px",
          }}
          className="my-1.5 flex items-start gap-1.5 rounded-sm"
        >
          <PixelIcon name="Zap" size={14} color={GB.lightest} />
          <div className="flex-1">
            <div style={{ color: GB.lightest }}>
              <span style={{ fontWeight: 700 }}>{entry.skillName}</span>
            </div>
            <div className={gbClass.textDim}>{entry.narrative}</div>
          </div>
        </div>
      );
  }
});

/**
 * Phase 4c.1 — 세션 종료 사유별 CombatLog 렌더.
 * legacy reason 도 신규 reason 으로 매핑.
 */
function resolveSessionEndDisplay(reason: string): {
  label: string;
  color: string;
  iconName: string;
} {
  switch (reason) {
    case "bossDefeated":
    case "victory":
      return { label: "보스 처치 — 모험 종료", color: GB.lightest, iconName: "Trophy" };
    case "heroDied":
    case "defeat":
      return { label: "영웅 쓰러짐", color: GB_ENEMY, iconName: "Skull" };
    case "timeExpired":
      return { label: "탐험 시간 소진", color: GB.light, iconName: "Clock" };
    case "heroAbandoned":
    case "abandoned":
    default:
      return { label: "캠프로 복귀", color: GB.light, iconName: "Flag" };
  }
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case "legend":
      return GB_LEGEND;
    case "unique":
      return GB_UNIQUE;
    case "rare":
      return GB_RARE;
    default:
      return GB.light;
  }
}

/**
 * Phase 8b — 로그 narrative 를 한 글자씩 타이핑 + 진행 중 blinking caret.
 * isLatest 일 때만 타이핑, 과거 entry 는 전체 텍스트 즉시 표시.
 */
function TypewriterText({
  text,
  enabled,
}: {
  text: string;
  enabled: boolean;
}) {
  const { visible, done } = useTypewriter(text, enabled);
  return (
    <>
      {visible}
      {enabled && !done && (
        <span className="uphero-typewriter-caret" aria-hidden="true">
          ▍
        </span>
      )}
    </>
  );
}
