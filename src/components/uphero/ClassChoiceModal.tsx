"use client";

/**
 * Up Hero — ClassChoiceModal.
 *
 * Bug 2026-04 사용자 피드백 대응:
 *   기존: Lv30 도달 시 가장 많이 완료한 카테고리로 자동 전직 → 유저 피드백
 *         "선택하지 않았는데 드루이드로 자동 전직돼버림".
 *   변경: 8개 직업 중 유저가 직접 선택. 자동 감지된 "추천" 직업은 pre-select
 *         + 배지로 표시하되, 다른 직업을 고를 수도 있음.
 *
 * 플로우:
 *   1. store.pendingClassChoice 가 non-null 이면 modal mount
 *   2. 그리드(2×4)로 8개 직업 노출, 각 타일: 아이콘 + 이름 + 패시브 + 추천 배지
 *   3. 확정 버튼 탭 → confirmClassChoice(classType)
 *   4. confirmClassChoice 내부에서 assignClass() 호출 → pendingClassAwaken 세팅 →
 *      이어서 기존 ClassAwakenModal 이 극적 연출을 담당
 *
 * 접근성:
 *   - role="dialog" aria-modal="true"
 *   - Esc 로 닫지 않음 (확정 전엔 선택 필수 — 되돌릴 수 없는 선택이므로 의도적)
 *   - 그리드는 role="radiogroup", 각 타일 role="radio" + aria-checked
 *   - 터치 타깃 ≥ 44×44 (타일 자체는 훨씬 큼)
 */

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import {
  CLASS_META,
  CLASS_THEME_COLOR,
  type ClassType,
} from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { className as classNameI18n, classPassive } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";

// 8 직업의 표시 순서 — DUNGEON_LIST canonical 순서와 동일하게 유지.
//   fitness → learning → mindfulness → nutrition → social → productivity →
//   wellness → trending.
const CLASS_ORDER: ClassType[] = [
  "warrior",
  "mage",
  "monk",
  "druid",
  "bard",
  "chronomancer",
  "priest",
  "illusionist",
];

export default function ClassChoiceModal() {
  const { t, language } = useTranslation();
  const pending = useUpHeroStore((s) => s.pendingClassChoice);
  const confirmClassChoice = useUpHeroStore((s) => s.confirmClassChoice);
  const { play } = useSound();
  const reducedMotion = useReducedMotion();

  const [selected, setSelected] = useState<ClassType | null>(
    pending?.recommended ?? null,
  );
  // React 권장 derived-state 패턴: pending (외부 store) 이 바뀔 때마다 추천값을
  //   기본 선택으로 lift. useEffect 대신 render-phase 비교로 cascading render 회피.
  const [lastRecommended, setLastRecommended] = useState<ClassType | null>(
    pending?.recommended ?? null,
  );
  const currentRecommended = pending?.recommended ?? null;
  if (currentRecommended !== lastRecommended) {
    setLastRecommended(currentRecommended);
    setSelected(currentRecommended);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Esc 닫기는 의도적으로 막는다 — 전직은 되돌릴 수 없는 선택이고, 이미 Lv30
  //   달성한 상태라 escape 해도 다음 init 에서 modal 이 재오픈됨. 유저 혼란
  //   줄이려면 닫기 동작 자체를 제공하지 않고 확정만 허용.
  //   useModalA11y 는 focus trap + scroll lock 만 쓰고 onClose 는 no-op.
  useModalA11y(containerRef, () => {}, {
    disabled: !pending,
    noEscape: true,
    initialFocus: confirmRef,
  });

  const onConfirm = () => {
    if (!selected) return;
    play("confirm");
    confirmClassChoice(selected);
  };

  if (!pending) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("uphero.classChoice.dialogAria")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: `radial-gradient(ellipse at center, ${GB.dark}ee 0%, ${GB.darkest}f4 60%, ${GB.darkest} 100%)`,
        paddingTop: "calc(env(safe-area-inset-top) + 16px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 16px)",
        paddingLeft: 16,
        paddingRight: 16,
        outline: "none",
        overflowY: "auto",
        animation: reducedMotion ? "none" : `mg-shell-in 280ms ${EASE_OUT}`,
      }}
    >
      <div className="flex flex-col items-center w-full" style={{ maxWidth: 560 }}>
        <div
          className="typo-caption mb-2"
          style={{ color: GB.light, letterSpacing: "0.1em" }}
        >
          {t("uphero.classChoice.title")}
        </div>
        <div
          className="typo-heading mb-2 text-center"
          style={{ color: GB.lightest }}
        >
          {t("uphero.classChoice.subtitle")}
        </div>
        <div
          className="typo-caption mb-6 text-center"
          style={{ color: GB.light, opacity: 0.8, maxWidth: 360, lineHeight: 1.5 }}
        >
          {t("uphero.classChoice.recommendedHint")}
        </div>

        <div
          role="radiogroup"
          aria-label={t("uphero.classChoice.dialogAria")}
          className="grid gap-2 w-full"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        >
          {CLASS_ORDER.map((cls) => {
            const meta = CLASS_META[cls];
            const color = CLASS_THEME_COLOR[cls];
            const isRecommended = pending.recommended === cls;
            const isSelected = selected === cls;
            const name = classNameI18n(cls, language);
            const passive = classPassive(cls, meta.passive, language);
            return (
              <button
                key={cls}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={t("uphero.classChoice.optionAria", { name, passive })}
                onClick={() => {
                  play("select");
                  setSelected(cls);
                }}
                className={`class-tile ${isSelected ? "is-selected" : ""}`}
                style={{
                  ["--tile-accent" as string]: color,
                  background: isSelected
                    ? `linear-gradient(180deg, ${color}2e 0%, ${GB.darkest} 100%)`
                    : GB.darkest,
                  border: `2px solid ${isSelected ? color : GB.dark}`,
                  borderRadius: 8,
                  padding: "12px 10px",
                  minHeight: 112,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 6,
                  position: "relative",
                  color: GB.lightest,
                  textAlign: "center",
                  cursor: "pointer",
                }}
              >
                {isRecommended && (
                  <span
                    className="typo-caption"
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      background: color,
                      color: GB.darkest,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 10,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("uphero.classChoice.recommendedBadge")}
                  </span>
                )}
                <PixelIcon name={meta.icon} size={36} color={color} />
                <div
                  className="typo-body"
                  style={{ color: color, fontWeight: 700 }}
                >
                  {name}
                </div>
                <div
                  className="typo-caption"
                  style={{ color: GB.light, lineHeight: 1.4, opacity: 0.9 }}
                >
                  {passive}
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="typo-caption mt-5 mb-3 text-center"
          style={{ color: GB.light, opacity: 0.7 }}
        >
          {t("uphero.classChoice.warning")}
        </div>

        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          disabled={!selected}
          className="choice-cta typo-body rounded px-6"
          style={{
            minHeight: 48,
            minWidth: 200,
            background: selected ? CLASS_THEME_COLOR[selected] : GB.dark,
            color: GB.darkest,
            border: `2px solid ${selected ? CLASS_THEME_COLOR[selected] : GB.dark}`,
            fontWeight: 700,
            opacity: selected ? 1 : 0.5,
            cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          {t("uphero.classChoice.confirm")}
        </button>
      </div>

      <style jsx>{`
        .class-tile {
          transition:
            transform 120ms ${EASE_OUT},
            border-color 160ms ${EASE_OUT},
            background 160ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .class-tile:focus-visible {
          outline: 2px solid var(--tile-accent, ${GB.lightest});
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .class-tile:hover {
            transform: translateY(-2px);
            border-color: var(--tile-accent, ${GB.light});
          }
        }
        .class-tile:active {
          transform: scale(0.97);
        }
        .choice-cta {
          transition:
            transform 120ms ${EASE_OUT},
            background 160ms ${EASE_OUT},
            border-color 160ms ${EASE_OUT},
            opacity 160ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .choice-cta:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 3px;
        }
        @media (hover: hover) and (pointer: fine) {
          .choice-cta:not(:disabled):hover {
            filter: brightness(1.08);
          }
        }
        .choice-cta:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .class-tile,
          .class-tile:hover,
          .class-tile:active,
          .choice-cta,
          .choice-cta:hover,
          .choice-cta:active {
            transition: none;
            transform: none;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
