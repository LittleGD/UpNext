"use client";

/**
 * Phase 12b — 육각형 radar stat chart.
 *
 * 왜: 이전 선형 바는 max 40 으로 cap 되어 Lv40+ 유저는 모두 꽉 찬 바만 봄
 *   → 성장 가시성 X. radar chart 로 레벨/클래스별 max 대비 비율로 표시.
 *
 * 설계:
 *   - 6 축 (STR, INT, VIT, DEX, AGI, CRIT) — 육각형 꼭짓점.
 *   - 배경 gridline 3 단계 (0.33 / 0.67 / 1.0) — "지금 몇% 달성" 시각화.
 *   - 2 중 다각형:
 *     (a) base stat fill — 어두운 채움 (GB.dark)
 *     (b) base + equip bonus outline — 밝은 선 (GB.lightest)
 *   - overflow (장비/버프로 max 초과) — 꼭짓점 밖으로 튀어나와 "강해짐" 시각화.
 *   - Framer Motion 이 아닌 CSS transition 으로 stat 변동 시 꼭짓점 pull 애니.
 *
 * a11y:
 *   - role="img" + aria-label 로 "STR 62 (+11) · INT 51 · VIT 57 (+6)..." 요약 제공.
 *   - 하단에 텍스트 legend 표 — SR 는 숫자 직접 읽음.
 *
 * Info popover:
 *   - 꼭짓점 label 탭 → 해당 스탯 설명만 표시
 *   - ? 버튼 탭 → 전체 스탯 설명 표시
 */

import { useMemo, useState } from "react";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  ClassType,
  HeroBaseStats,
  StatKey,
} from "@/types/uphero";
import { computeStatMax } from "@/types/uphero";

const STAT_ORDER: Array<{ key: StatKey; label: string; isCrit?: boolean }> = [
  { key: "str", label: "STR" },
  { key: "int", label: "INT" },
  { key: "vit", label: "VIT" },
  { key: "dex", label: "DEX" },
  { key: "agi", label: "AGI" },
  { key: "crit", label: "CRIT", isCrit: true },
];

interface HexStatChartProps {
  /** 레벨 기반 base stats (장비 보너스 제외) */
  base: HeroBaseStats;
  /** 장비/버프 포함 최종 effective stats */
  effective: HeroBaseStats;
  level: number;
  classType: ClassType | null;
  /** chart 크기 (px). 정사각형. 기본 240. */
  size?: number;
}

export default function HexStatChart({
  base,
  effective,
  level,
  classType,
  size = 240,
}: HexStatChartProps) {
  const { t } = useTranslation();
  const [activeInfo, setActiveInfo] = useState<StatKey | "all" | null>(null);
  const maxByKey = useMemo(
    () => computeStatMax(level, classType),
    [level, classType],
  );

  // SVG viewport 중심 + 반지름 (margin 확보)
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 32; // label 공간 확보
  const overflowCap = 1.3; // max 대비 130% 까지 밖으로 뻗는 걸 허용 (그 이상은 clip)

  // 각 축의 각도 (12시 부터 시계방향 60°씩)
  const axes = STAT_ORDER.map((s, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    return { ...s, angle };
  });

  // base / effective 각 축의 정규화 비율 (0-overflowCap)
  const ratios = axes.map((a) => {
    const maxRef = Math.max(1, maxByKey[a.key]);
    const baseVal = base[a.key];
    const effVal = effective[a.key];
    return {
      ...a,
      base: Math.min(overflowCap, baseVal / maxRef),
      eff: Math.min(overflowCap, effVal / maxRef),
      baseVal,
      effVal,
    };
  });

  const toXY = (angle: number, ratio: number) => {
    const rr = r * ratio;
    return { x: cx + rr * Math.cos(angle), y: cy + rr * Math.sin(angle) };
  };

  // 다각형 path 생성
  const pathFrom = (key: "base" | "eff") =>
    ratios
      .map((a, i) => {
        const { x, y } = toXY(a.angle, a[key]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z";

  const basePath = pathFrom("base");
  const effPath = pathFrom("eff");

  // 배경 gridline (0.33 / 0.67 / 1.0)
  const gridLevels = [0.33, 0.67, 1.0];

  // a11y label
  const ariaLabel =
    t("uphero.stat.chartAria") + ": " +
    ratios
      .map((a) => {
        const bonus = a.effVal - a.baseVal;
        return `${a.label} ${a.effVal}${a.isCrit ? "%" : ""}${
          bonus !== 0 ? ` (${bonus > 0 ? "+" : ""}${bonus})` : ""
        }`;
      })
      .join(", ");

  const statInfoKeys: StatKey[] = ["str", "int", "vit", "dex", "agi", "crit"];
  const infoLines: StatKey[] =
    activeInfo === "all"
      ? statInfoKeys
      : activeInfo
        ? [activeInfo]
        : [];

  const handleStatTap = (key: StatKey) => {
    setActiveInfo((prev) => (prev === key ? null : key));
  };

  const toggleAllInfo = () => {
    setActiveInfo((prev) => (prev === "all" ? null : "all"));
  };

  return (
    <div
      className="hex-stat-chart relative"
      role="img"
      aria-label={ariaLabel}
      style={{ width: size, margin: "0 auto" }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ display: "block" }}
      >
        {/* 배경 gridline (faint 육각형) */}
        {gridLevels.map((g) => (
          <polygon
            key={g}
            points={axes
              .map((a) => {
                const { x, y } = toXY(a.angle, g);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(" ")}
            fill="none"
            stroke={GB.dark}
            strokeWidth={1}
            opacity={0.7}
          />
        ))}
        {/* 각 축 라인 */}
        {axes.map((a, i) => {
          const { x, y } = toXY(a.angle, 1);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={GB.dark}
              strokeWidth={1}
              opacity={0.5}
            />
          );
        })}
        {/* base (장비 미적용) — 어두운 채움 */}
        <path
          d={basePath}
          fill={GB.light}
          fillOpacity={0.18}
          stroke={GB.light}
          strokeWidth={1}
          style={{
            transition: `d 240ms ${EASE_OUT}`,
          }}
        />
        {/* effective (장비 보너스 포함) — 밝은 outline */}
        <path
          d={effPath}
          fill={GB.lightest}
          fillOpacity={0.25}
          stroke={GB.lightest}
          strokeWidth={2}
          style={{
            transition: `d 240ms ${EASE_OUT}`,
          }}
        />
        {/* 꼭짓점 dot (eff) */}
        {ratios.map((a, i) => {
          const { x, y } = toXY(a.angle, a.eff);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3}
              fill={GB.lightest}
            />
          );
        })}
      </svg>
      {/* 스탯 label — HTML button overlay (탭 가능) */}
      {axes.map((a) => {
        const { x, y } = toXY(a.angle, 1.18);
        const isActive = activeInfo === a.key || activeInfo === "all";
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => handleStatTap(a.key)}
            className="absolute typo-micro"
            style={{
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              padding: "3px 6px",
              minWidth: 32,
              minHeight: 20,
              background: isActive ? GB.dark : "transparent",
              color: isActive ? GB.lightest : GB.light,
              border: "none",
              borderRadius: 3,
              letterSpacing: "0.08em",
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              transition: `background 160ms ${EASE_OUT}, color 160ms ${EASE_OUT}`,
            }}
            aria-pressed={isActive}
            aria-label={`${a.label} ${t("uphero.stat.info.buttonAria")}`}
          >
            {a.label}
          </button>
        );
      })}
      {/* ? 아이콘 버튼 — 전체 스탯 설명 토글 */}
      <button
        type="button"
        onClick={toggleAllInfo}
        className="absolute flex items-center justify-center"
        style={{
          right: 0,
          top: 0,
          width: 28,
          height: 28,
          background: activeInfo === "all" ? GB.light : "transparent",
          color: activeInfo === "all" ? GB.darkest : GB.light,
          border: `1px solid ${GB.dark}`,
          borderRadius: 999,
          cursor: "pointer",
          transition: `background 160ms ${EASE_OUT}, color 160ms ${EASE_OUT}`,
        }}
        aria-pressed={activeInfo === "all"}
        aria-label={t("uphero.stat.info.buttonAria")}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}
        >
          ?
        </span>
      </button>
      {/* 숫자 legend (SR/시각 fallback) */}
      <div
        className="grid grid-cols-3 gap-x-3 gap-y-1 tabular-nums typo-micro mt-1 px-2"
        style={{ color: GB.light }}
        aria-hidden="true"
      >
        {ratios.map((a) => {
          const bonus = a.effVal - a.baseVal;
          return (
            <div
              key={a.key}
              className="flex items-center justify-between gap-1"
            >
              <span className={gbClass.textDim}>{a.label}</span>
              <span>
                <span style={{ color: GB.lightest }}>
                  {a.effVal}
                  {a.isCrit ? "%" : ""}
                </span>
                {bonus !== 0 && (
                  <span
                    className="ml-1"
                    style={{ color: bonus > 0 ? GB.lightest : "#e88b7a" }}
                  >
                    ({bonus > 0 ? "+" : ""}
                    {bonus})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {/* 스탯 설명 popover */}
      {infoLines.length > 0 && (
        <div
          className="mt-2 px-3 py-2 typo-micro"
          role="region"
          aria-live="polite"
          style={{
            background: GB.darkest,
            border: `1px solid ${GB.dark}`,
            borderRadius: 4,
            color: GB.lightest,
            lineHeight: 1.5,
          }}
        >
          {activeInfo === "all" && (
            <div
              className="typo-micro mb-1"
              style={{ color: GB.light, fontWeight: 700 }}
            >
              {t("uphero.stat.info.title")}
            </div>
          )}
          <ul className="space-y-1 m-0 p-0" style={{ listStyle: "none" }}>
            {infoLines.map((k) => (
              <li key={k}>{t(`uphero.stat.info.${k}` as const)}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setActiveInfo(null)}
            className="typo-micro mt-2"
            style={{
              color: GB.light,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {t("uphero.stat.info.close")}
          </button>
        </div>
      )}
    </div>
  );
}
