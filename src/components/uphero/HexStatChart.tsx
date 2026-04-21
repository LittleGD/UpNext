"use client";

/**
 * Phase 12b — 육각형 radar stat chart.
 *
 * 왜: 이전 선형 바는 max 40 으로 cap 되어 Lv40+ 유저는 모두 꽉 찬 바만 봄
 *   → 성장 가시성 X. radar chart 로 레벨/클래스별 max 대비 비율로 표시.
 *
 * 설계:
 *   - 6 축 (STR, INT, VIT, DEX, AGI, CRIT) — 육각형 꼭짓점.
 *   - 배경 gridline 5 단계 (50% / 100%★ / 150% / 200% / 250%) — 100% 링은
 *     "Lv 자연 성장 기준" 으로 강조 (GB.light 굵은 stroke). 그 바깥은 장비/버프
 *     로 초과한 영역 (대시 stroke) 으로 축마다 얼마나 초과했는지가 시각적으로 드러남.
 *   - 2 중 다각형:
 *     (a) base stat fill — 어두운 채움 (GB.dark) — Lv 자연 성장만
 *     (b) base + equip bonus outline — 밝은 선 (GB.lightest)
 *   - overflowCap 2.5 — 장비/버프가 Lv 기준 대비 최대 250% 까지 시각화. 기존 1.3
 *     캡은 고렙 장비 착용 시 모든 축이 캡에 붙어 "전부 맥스" 처럼 보이는 피드백
 *     (2026-04-20) 반영해 상향. 250% 초과분은 클립 (R4 극단 outlier 에서만 발생).
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
  // overflowCap: 레벨 기준의 250% 까지 시각화. 예) Lv45 bard INT max 63 →
  //   eff 117 이면 ratio 1.86 (기준선 바깥, 차트 내부). 250% 초과는 clip.
  //   기존 1.3 캡은 Lv35+ 장비 착용 유저는 대부분 캡에 닿아 "전부 맥스" 느낌 (피드백 반영).
  const overflowCap = 2.5;
  // 100% 기준 링 — "Lv 자연 성장" 경계. toXY 스케일상 r 의 1/overflowCap 지점.
  const baseRingRatio = 1.0;

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
      maxRef,
    };
  });

  // ratio (0..overflowCap) → 차트 내 픽셀 반지름. ratio=overflowCap 이 r (차트 edge).
  const toXY = (angle: number, ratio: number) => {
    const clipped = Math.max(0, Math.min(overflowCap, ratio));
    const rr = r * (clipped / overflowCap);
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

  // 배경 gridline — 100% (base) 링은 굵게 강조. 그 바깥(150/200/250)은 dashed
  //   "초과 영역" 표시로 장비/버프 강화 정도를 시각화.
  const gridLevels: Array<{ ratio: number; emphasis: "base" | "normal" | "over" }> = [
    { ratio: 0.5, emphasis: "normal" },
    { ratio: 1.0, emphasis: "base" },
    { ratio: 1.5, emphasis: "over" },
    { ratio: 2.0, emphasis: "over" },
    { ratio: 2.5, emphasis: "over" },
  ];

  // a11y label — eff / bonus / Lv 기준 대비 % 까지 포함 (시각 legend 와 parity).
  //   SR 유저도 "INT 117 은 기준의 186%" 라는 편차 감각을 얻을 수 있도록.
  const ariaLabel =
    t("uphero.stat.chartAria") + ": " +
    ratios
      .map((a) => {
        const bonus = a.effVal - a.baseVal;
        const pct = Math.round((a.effVal / a.maxRef) * 100);
        return `${a.label} ${a.effVal}${a.isCrit ? "%" : ""}${
          bonus !== 0 ? ` (${bonus > 0 ? "+" : ""}${bonus})` : ""
        } · ${pct}%`;
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
        {/* 배경 gridline — 100% 기준 링은 GB.light 굵은 stroke, 초과 영역은 dashed */}
        {gridLevels.map((g) => {
          const points = axes
            .map((a) => {
              const { x, y } = toXY(a.angle, g.ratio);
              return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ");
          const isBase = g.emphasis === "base";
          const isOver = g.emphasis === "over";
          return (
            <polygon
              key={g.ratio}
              points={points}
              fill="none"
              stroke={isBase ? GB.light : GB.dark}
              strokeWidth={isBase ? 1.5 : 1}
              strokeDasharray={isOver ? "2 3" : undefined}
              opacity={isBase ? 0.9 : isOver ? 0.4 : 0.6}
            />
          );
        })}
        {/* 각 축 라인 — 0~100% 는 solid, 100%~cap 은 dashed (초과 영역 구분) */}
        {axes.map((a, i) => {
          const inner = toXY(a.angle, baseRingRatio);
          const outer = toXY(a.angle, overflowCap);
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={inner.x}
                y2={inner.y}
                stroke={GB.dark}
                strokeWidth={1}
                opacity={0.55}
              />
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={GB.dark}
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.35}
              />
            </g>
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
      {/* 스탯 label — HTML button overlay (탭 가능). 가장 바깥 gridline 보다 살짝
           바깥에 배치 — 스케일 상승 전 1.18×r 은 이제 100% 링 안쪽이라 라벨이 차트
           안에 파묻히는 버그가 있었음. toXY 는 cap 으로 clamp 되므로 여기선 raw
           반지름 (r × 1.12) 으로 직접 계산. */}
      {axes.map((a) => {
        const labelR = r * 1.12;
        const x = cx + labelR * Math.cos(a.angle);
        const y = cy + labelR * Math.sin(a.angle);
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
      {/* 스케일 legend — 100% 링의 의미 설명. 유저 피드백 (2026-04) 반영: 이전엔
           기준선이 뭘 의미하는지 안 드러나서 "다 맥스 처럼 보인다" 는 감각을 줬음. */}
      <div
        className="mt-1.5 flex items-center justify-center gap-3 typo-micro tabular-nums"
        style={{ color: GB.light, opacity: 0.85 }}
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              border: `1.5px solid ${GB.light}`,
              borderRadius: 1,
            }}
          />
          {t("uphero.stat.scaleBase", { level })}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.5 }}>
          ·
        </span>
        <span>{t("uphero.stat.scaleOver")}</span>
      </div>
      {/* 숫자 legend (SR/시각 fallback) — 각 스탯의 eff 값 + 장비 보너스 + Lv
           기준 대비 비율. 이전엔 eff 값만 표시해 "내 INT 117 이 얼마나 강한가" 가
           감이 안 왔는데, 기준 대비 % 를 병기하면 숫자만 봐도 편차 파악 가능.
           grid-cols-3 (ko/ja/zh 에서 typo-micro 11-12px × "127 (+75) 235%" 14 char
           → 셀 폭 72px 초과) → grid-cols-2 로 완화. 행 수는 2→3 으로 늘지만
           "잘리거나 wrap 되는 숫자" 가 훨씬 더 큰 UX 부채. */}
      <div
        className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums typo-micro mt-1 px-2"
        style={{ color: GB.light }}
        aria-hidden="true"
      >
        {ratios.map((a) => {
          const bonus = a.effVal - a.baseVal;
          const pct = Math.round((a.effVal / a.maxRef) * 100);
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
                <span
                  className="ml-1"
                  style={{ color: GB.light, opacity: 0.7 }}
                >
                  {pct}%
                </span>
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
