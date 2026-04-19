"use client";

/**
 * Phase 12d — 클래스 자원 bar.
 *
 * 왜: 각 클래스가 고유 자원 (분노/마나/기/자연력 등) 으로 스킬 발동.
 *   HP/TIME bar 와 같은 형식의 3 번째 bar.
 *
 * 표시:
 *   - 클래스 color 채움 (warrior 붉은색, mage 푸른색 등 CLASS_RESOURCE.color).
 *   - "RAGE 45/100" 처럼 약어 + 수치.
 *   - role=progressbar + aria-valuetext.
 */

import type { ClassType } from "@/types/uphero";
import { CLASS_RESOURCE, CLASS_RESOURCE_MAX } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { resourceName } from "@/lib/upHeroI18n";

interface ClassResourceBarProps {
  classType: ClassType | null;
  value: number;
}

export default function ClassResourceBar({
  classType,
  value,
}: ClassResourceBarProps) {
  const { language } = useTranslation();
  if (!classType) return null;
  const spec = CLASS_RESOURCE[classType];
  const pct = Math.min(100, (value / CLASS_RESOURCE_MAX) * 100);
  const localizedName = resourceName(classType, language) || spec.name;

  return (
    <div className="flex items-center gap-2">
      <span
        className="typo-caption tabular-nums"
        style={{ color: spec.color, minWidth: 38, letterSpacing: "0.05em" }}
      >
        {spec.short}
      </span>
      <div
        className="flex-1 h-1.5 rounded-sm relative overflow-hidden"
        role="progressbar"
        aria-label={`${localizedName} (${classType})`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={CLASS_RESOURCE_MAX}
        aria-valuetext={`${localizedName} ${value} / ${CLASS_RESOURCE_MAX}`}
        style={{ background: GB.dark }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{
            width: `${pct}%`,
            background: spec.color,
            transition: `width 240ms ${EASE_OUT}`,
          }}
        />
      </div>
      <span
        className="typo-caption tabular-nums"
        style={{
          color: GB.light,
          minWidth: 56,
          textAlign: "right",
        }}
      >
        {value}/{CLASS_RESOURCE_MAX}
      </span>
    </div>
  );
}
