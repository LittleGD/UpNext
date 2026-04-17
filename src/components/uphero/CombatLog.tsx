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

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/types/uphero";
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_LEGEND, GB_UNIQUE, GB_RARE } from "@/lib/upHeroPalette";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";

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
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-3 py-3 font-mono typo-caption leading-relaxed"
      style={{
        background: GB.darkest,
        color: GB.light,
        scrollbarWidth: "thin",
        scrollbarColor: `${GB.dark} transparent`,
      }}
    >
      {log.map((entry, i) => (
        <LogLine key={i} entry={entry} isLatest={i === log.length - 1} />
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

function LogLine({ entry, isLatest }: { entry: LogEntry; isLatest: boolean }) {
  const style: React.CSSProperties = {
    animation: isLatest ? `uphero-log-enter 200ms ${EASE_OUT} both` : undefined,
  };

  switch (entry.type) {
    case "narrative":
      return (
        <div style={{ ...style, color: GB.light }} className="opacity-80">
          {entry.text}
        </div>
      );

    case "floor":
      return (
        <div
          style={{ ...style, color: GB.lightest }}
          className="my-2 flex items-center gap-2"
        >
          <span style={{ color: GB.dark }}>━━━</span>
          <span>Floor {entry.to}</span>
          <span style={{ color: GB.dark }} className="flex-1">
            ━━━━━━━━━━━━━━━━━━
          </span>
        </div>
      );

    case "encounter":
      return (
        <div
          style={{ ...style, color: GB.lightest }}
          className="flex items-center gap-1.5"
        >
          <MonsterSprite kind={entry.monster.kind} size={14} color={GB.lightest} />
          <span>{entry.monster.name}</span>
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
          <span>보스 등장 — {entry.monster.name}</span>
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
            {entry.narrative}
          </div>
        );
      }

      // Fallback: narrative 없는 일반 hit (67%) 또는 legacy 엔트리
      // "공격자 → 방어자 −N" 형식 — 누가 때리고 누가 맞았는지 명확하게
      const attackerLabel = isHero ? "영웅" : "적";
      const defenderLabel = isHero ? "적" : "영웅";
      const dmgColor = isHero ? GB.lightest : GB_ENEMY;
      return (
        <div style={{ ...style, color: GB.light }} className="pl-3">
          <span style={{ color: GB.lightest }}>{attackerLabel}</span>
          <span className={gbClass.textDim}> → </span>
          <span>{defenderLabel}</span>{" "}
          <span style={{ color: dmgColor }}>−{entry.damage}</span>
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
          <span>{entry.monster.name} 처치</span>
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
          <span>장비 획득: {entry.equipment.name}</span>
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

    case "choice":
      return (
        <div
          style={{
            ...style,
            color: GB.lightest,
            borderLeft: `2px solid ${GB.lightest}`,
          }}
          className="pl-2 my-1 flex items-start gap-1.5"
        >
          <PixelIcon name="Zap" size={14} color={GB.lightest} />
          <div className="flex-1">
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

    case "sessionEnd": {
      const label =
        entry.reason === "victory"
          ? "모험 완료"
          : entry.reason === "defeat"
            ? "영웅 쓰러짐"
            : "캠프로 복귀";
      const color =
        entry.reason === "victory"
          ? GB.lightest
          : entry.reason === "defeat"
            ? GB_ENEMY
            : GB.light;
      const iconName =
        entry.reason === "victory"
          ? "Trophy"
          : entry.reason === "defeat"
            ? "Skull"
            : "Flag";
      return (
        <div
          style={{ ...style, color, borderTop: `1px dashed ${GB.dark}` }}
          className="mt-2 pt-2 flex items-center gap-1.5"
        >
          <PixelIcon name={iconName} size={14} color={color} />
          <span>{label}</span>
        </div>
      );
    }
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
