"use client";

/**
 * Up Hero — CampTutorialOverlay.
 *
 * 아지트 (CampPlaceholder home view) 첫 진입 시 1회 노출되는 온보딩 오버레이.
 * - hasSeenCampTutorial=false 일 때만 포털로 렌더
 * - 4 step 캐러셀: welcome → stat → expedition → shop/gear
 * - Skip / Prev / Next / Start 모든 경로가 markCampTutorialSeen() 호출 후 onClose
 * - Esc/backdrop 터치는 의도적으로 close-without-remember 되지 않게 처리 (유저가
 *   실수로 닫아도 다음 진입에 다시 뜸). Skip 버튼으로만 "다시 안 보기" 결정.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";
import KeyboardAccessoryBar from "@/components/common/KeyboardAccessoryBar";

interface CampTutorialOverlayProps {
  onClose: () => void;
}

type StepKind = "info" | "name";

interface Step {
  kind: StepKind;
  titleKey: DictKey;
  bodyKey: DictKey;
  iconName: "Home" | "AvatarCircle" | "Sword" | "Backpack" | "PenSquare";
}

const STEPS: Step[] = [
  {
    kind: "info",
    titleKey: "uphero.tutorial.step1.title",
    bodyKey: "uphero.tutorial.step1.body",
    iconName: "Home",
  },
  {
    kind: "name",
    titleKey: "uphero.tutorial.name.title",
    bodyKey: "uphero.tutorial.name.body",
    iconName: "PenSquare",
  },
  {
    kind: "info",
    titleKey: "uphero.tutorial.step2.title",
    bodyKey: "uphero.tutorial.step2.body",
    iconName: "AvatarCircle",
  },
  {
    kind: "info",
    titleKey: "uphero.tutorial.step3.title",
    bodyKey: "uphero.tutorial.step3.body",
    iconName: "Sword",
  },
  {
    kind: "info",
    titleKey: "uphero.tutorial.step4.title",
    bodyKey: "uphero.tutorial.step4.body",
    iconName: "Backpack",
  },
];

export default function CampTutorialOverlay({ onClose }: CampTutorialOverlayProps) {
  const { t } = useTranslation();
  const markSeen = useUpHeroStore((s) => s.markCampTutorialSeen);
  const currentName = useUpHeroStore((s) => s.hero.name);
  const renameHero = useUpHeroStore((s) => s.renameHero);
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const step = STEPS[idx];

  useEffect(() => {
    // name step 에서는 input 이 자연스레 포커스 되도록 — card 포커스 skip.
    if (step.kind === "info") cardRef.current?.focus();
  }, [idx, step.kind]);

  // 유저가 name step 을 떠날 때 (next/prev/skip/start/finish) 입력한 이름 commit.
  const commitNameIfAny = () => {
    const trimmed = nameDraft.trim().slice(0, 16);
    if (trimmed && trimmed !== currentName) {
      renameHero(trimmed);
    }
  };

  const finish = () => {
    commitNameIfAny();
    markSeen();
    onClose();
  };

  const goTo = (nextIdx: number) => {
    if (step.kind === "name") commitNameIfAny();
    setIdx(nextIdx);
  };

  const isFirst = idx === 0;
  const isLast = idx === STEPS.length - 1;

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(step.titleKey)}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: `${GB.darkest}e6`,
        color: GB.light,
        opacity: mounted ? 1 : 0,
        transition: `opacity 200ms ${EASE_OUT}`,
        padding: "24px 20px",
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 16px) + 24px)",
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full max-w-sm flex flex-col items-center rounded-md outline-none"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.dark}`,
          padding: "28px 22px 20px",
        }}
      >
        {/* 상단 step 인디케이터 */}
        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden
              style={{
                width: i === idx ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === idx ? GB.lightest : `${GB.light}55`,
                transition: `width 200ms ${EASE_OUT}, background 200ms ${EASE_OUT}`,
              }}
            />
          ))}
        </div>

        {/* 아이콘 */}
        <div
          className="flex items-center justify-center mb-4"
          style={{
            width: 56,
            height: 56,
            background: `${GB.dark}88`,
            borderRadius: 6,
          }}
          aria-hidden
        >
          <PixelIcon name={step.iconName} size={28} color={GB.lightest} />
        </div>

        <div
          className="typo-body text-center mb-2"
          style={{ color: GB.lightest, fontWeight: 600 }}
        >
          {t(step.titleKey)}
        </div>
        <div
          className={`typo-caption text-center ${gbClass.textDim}`}
          style={{ lineHeight: 1.55, marginBottom: step.kind === "name" ? 14 : 20 }}
        >
          {t(step.bodyKey)}
        </div>

        {step.kind === "name" && (
          <input
            ref={nameInputRef}
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 16))}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (isLast) finish();
                else goTo(idx + 1);
              }
            }}
            placeholder={currentName}
            maxLength={16}
            aria-label={t("uphero.tutorial.name.inputAria")}
            className="typo-caption w-full text-center mb-5 px-3 py-2 rounded-sm"
            style={{
              background: GB.lightest,
              color: GB.darkest,
              letterSpacing: "0.05em",
              border: `2px solid ${GB.light}`,
              outline: "none",
            }}
          />
        )}

        {/* 스텝 카운터 */}
        <div
          className={`typo-micro tabular-nums mb-4 ${gbClass.textDim}`}
          aria-hidden
        >
          {t("uphero.tutorial.step", {
            current: idx + 1,
            total: STEPS.length,
          })}
        </div>

        {/* 컨트롤 */}
        <div className="w-full flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={() => goTo(idx - 1)}
              className="typo-caption rounded flex-1"
              style={{
                minHeight: 42,
                background: "transparent",
                color: GB.light,
                border: `1px solid ${GB.dark}`,
              }}
            >
              {t("uphero.tutorial.prev")}
            </button>
          )}
          {isFirst && (
            <button
              type="button"
              onClick={finish}
              className={`typo-caption rounded flex-1 ${gbClass.textDim}`}
              style={{
                minHeight: 42,
                background: "transparent",
                border: `1px solid ${GB.dark}`,
              }}
            >
              {t("uphero.tutorial.skip")}
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? finish : () => goTo(idx + 1)}
            className="typo-caption rounded flex-1"
            style={{
              minHeight: 42,
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
              fontWeight: 600,
            }}
          >
            {isLast ? t("uphero.tutorial.start") : t("uphero.tutorial.next")}
          </button>
        </div>
      </div>
      {/* name step 전용 — 키보드 위 완료/취소 액세서리 바 */}
      {step.kind === "name" && (
        <KeyboardAccessoryBar
          visible={nameFocused}
          onDone={() => nameInputRef.current?.blur()}
          onCancel={() => {
            setNameDraft("");
            nameInputRef.current?.blur();
          }}
        />
      )}
    </div>,
    document.body,
  );
}
