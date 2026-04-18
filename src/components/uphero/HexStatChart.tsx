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
 */

import { useMemo } from "react";
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

  return (
    <div
      className="hex-stat-chart"
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
        {/* 스탯 label (꼭짓점 밖) */}
        {axes.map((a, i) => {
          const { x, y } = toXY(a.angle, 1.18);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fontSize={11}
              fill={GB.light}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ letterSpacing: "0.08em" }}
            >
              {a.label}
            </text>
          );
        })}
      </svg>
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
    </div>
  );
}
