"use client";

/**
 * Phase 6-E (Track E, 피드백 11) — 슬롯 필터 칩.
 *
 * 가방 탭과 강화 탭이 같은 필터 상태를 공유한다. 텍스트 칩만 (아이콘 박스·보더 없음),
 * 활성은 라임 배경 + 어두운 글자, 비활성은 어두운 배경 단계. aria-pressed 로 상태를
 * 말한다 (탭 리스트가 아니라 토글 버튼 묶음).
 */

import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { SLOT_LABEL_KEY, SLOT_ORDER } from "@/lib/equipmentSlotMeta";
import { useTranslation } from "@/hooks/useTranslation";
import type { EquipSlot } from "@/types/uphero";

export type SlotFilter = EquipSlot | "all";

interface SlotFilterChipsProps {
  value: SlotFilter;
  onChange: (next: SlotFilter) => void;
  /** 슬롯별 개수 — 있으면 라벨 뒤에 붙는다. */
  counts?: Partial<Record<EquipSlot, number>>;
}

export default function SlotFilterChips({ value, onChange, counts }: SlotFilterChipsProps) {
  const { t } = useTranslation();
  const chips: Array<{ key: SlotFilter; label: string }> = [
    { key: "all", label: t("uphero.equip.filter.all") },
    ...SLOT_ORDER.map((slot) => {
      const n = counts?.[slot];
      const base = t(SLOT_LABEL_KEY[slot]);
      return { key: slot as SlotFilter, label: n != null ? `${base} ${n}` : base };
    }),
  ];
  return (
    <div className="flex gap-1 overflow-x-auto mb-2" role="group">
      {chips.map((chip) => {
        const active = chip.key === value;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.key)}
            aria-pressed={active}
            className="uphero-slot-chip typo-micro rounded px-2 py-1 shrink-0 tabular-nums"
            style={{
              minHeight: 32,
              background: active ? GB.lightest : `${GB.dark}66`,
              color: active ? GB.darkest : GB.light,
              border: "none",
              fontWeight: active ? 600 : 400,
            }}
          >
            {chip.label}
          </button>
        );
      })}
      <style jsx>{`
        .uphero-slot-chip {
          transition:
            transform 120ms ${EASE_OUT},
            background 160ms ${EASE_OUT};
        }
        .uphero-slot-chip:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}
