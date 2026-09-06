"use client";

/**
 * Up Hero — 가방 액션바.
 *
 * **항상** 마운트된다(56px). 선택 여부에 따라 나타났다 사라지면 그 위의 보드가
 * 매번 리사이즈되어 셀 크기가 출렁인다 — 격자에서 그건 "아이템이 움직였다"로
 * 읽힌다. 그래서 비어 있을 땐 힌트 한 줄이 그 자리를 지킨다.
 *
 * 계층: 라임(GB.lightest)은 화면에서 **하나**뿐인 활성 요소다. 여기서는 지금
 * 해야 할 행동(배치 또는 장착) 하나만 라임이고 나머지는 배경 단계로만 구분한다.
 *
 * 취소는 **가로 스크롤 밖**에 오른쪽으로 고정한다. 액션은 언어마다 폭이 달라
 * (en 기준 497px > 375px) 스크롤 안에 두면 화면 밖으로 밀리는데, 취소는 선택
 * 상태를 터치로 빠져나가는 유일한 길이라 항상 보여야 한다.
 */

import { BAG_ACTION_H } from "@/lib/upHeroBag";
import { PHOTO_TALISMAN_MAX_ENHANCE_LEVEL } from "@/lib/photoTalisman";
import {
  NEXT_RARITY,
  SYNTHESIS_INPUT_COUNT,
  sellPrice,
  type Equipment,
  type EquipSlot,
} from "@/types/uphero";
import { EASE_OUT, GB, GB_ENEMY, gbClass } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";

const SLOT_LABEL_KEY: Record<EquipSlot, DictKey> = {
  weapon: "uphero.slot.weapon",
  armor: "uphero.slot.armor",
  accessory: "uphero.slot.accessory",
  talisman: "uphero.slot.talisman",
};

interface BagActionBarProps {
  /** 선택된 가방 아이템 (없으면 null) */
  item: Equipment | null;
  /** 선택된 착용 아이템의 슬롯 (앵커를 눌렀을 때) */
  wornSlot: EquipSlot | null;
  /** 빈 칸 탭을 기다리는 중인가 */
  placing: boolean;
  /** 정리 대기 개수 — 0 보다 크면 유휴 힌트가 "가방이 꽉 찼어요" 로 바뀐다 */
  trayCount: number;
  /** 회전이 의미 있는 타입인가 (v1: 무기만) */
  rotatable: boolean;
  /**
   * Track E 합성 모드 — 같은 등급 3개를 보드·트레이에서 고르는 중. 이때 바는
   * "합성 n/3" 확인과 취소만 보인다 (배치·장착은 모드 밖에서).
   */
  synthMode: boolean;
  /** 합성 모드에서 지금까지 고른 재료 수. */
  synthCount: number;
  /** 유휴 상태에서 합성 모드 진입 버튼을 보일지 (재료 후보가 3개 이상일 때). */
  canStartSynth: boolean;
  onPlace: () => void;
  onRotate: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  onEnhance: () => void;
  onSell: () => void;
  onCancel: () => void;
  /** 합성 모드 진입 — 선택 아이템이 있으면 첫 재료가 된다. */
  onSynth: () => void;
  /** 합성 확인 (재료 3개가 모였을 때만 활성). */
  onSynthConfirm: () => void;
  /** 합성 모드 취소. */
  onSynthCancel: () => void;
}

export default function BagActionBar({
  item,
  wornSlot,
  placing,
  trayCount,
  rotatable,
  synthMode,
  synthCount,
  canStartSynth,
  onPlace,
  onRotate,
  onEquip,
  onUnequip,
  onEnhance,
  onSell,
  onCancel,
  onSynth,
  onSynthConfirm,
  onSynthCancel,
}: BagActionBarProps) {
  const { t } = useTranslation();

  const hint = placing
    ? t("uphero.bag.hint.placing")
    : trayCount > 0
      ? t("uphero.bag.hint.full")
      : t("uphero.bag.hint.idle");

  // 사진 부적은 +10 이 상한이다. 이미 상한이면 강화 버튼 자체를 내린다 (강화 목록
  //   시트도 사진 부적을 빼고 있다) — 눌러 봐야 "이미 최대" 토스트만 돌아온다.
  const enhanceable =
    !item ||
    !item.photoId ||
    (item.enhanceLevel ?? 0) < PHOTO_TALISMAN_MAX_ENHANCE_LEVEL;

  // 취소는 스크롤 밖 고정. 유휴 상태에는 벗어날 선택 자체가 없어 띄우지 않는다.
  const cancel = synthMode
    ? onSynthCancel
    : wornSlot || item
      ? onCancel
      : null;

  return (
    <section
      className="shrink-0 flex items-center gap-1.5 px-2"
      style={{
        height: BAG_ACTION_H,
        borderTop: `1px solid ${GB.dark}`,
        background: `${GB.dark}33`,
      }}
      aria-label={t("uphero.bag.actionBarAria")}
    >
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto">
        {synthMode ? (
          <>
            {/* 합성 모드: 재료 수가 주인공. 3개가 모이면 확인이 라임으로 켜진다. */}
            <span className="typo-caption flex-1 truncate" style={{ color: GB.lightest }}>
              {t("uphero.equip.synth.mode")}
            </span>
            <BagAction
              onClick={onSynthConfirm}
              primary
              disabled={synthCount !== SYNTHESIS_INPUT_COUNT}
            >
              {t("uphero.equip.synth.button", { n: synthCount })}
            </BagAction>
          </>
        ) : wornSlot ? (
          <>
            <span
              className="typo-micro shrink-0 truncate"
              style={{ color: GB.light, maxWidth: 84 }}
            >
              {t(SLOT_LABEL_KEY[wornSlot])}
            </span>
            <BagAction onClick={onUnequip} primary>
              {t("common.unequip")}
            </BagAction>
            <BagAction onClick={onEnhance}>
              {t("uphero.equip.tabEnhance")}
            </BagAction>
          </>
        ) : item && placing ? (
          <>
            {/* 배치 모드: 힌트가 주인공. 회전·취소만 남겨 빈 칸 탭에 집중시킨다. */}
            <span className="typo-caption flex-1 truncate" style={{ color: GB.lightest }}>
              {hint}
            </span>
            <BagAction onClick={onRotate} disabled={!rotatable} shortcut="r">
              {t("uphero.bag.action.rotate")}
            </BagAction>
          </>
        ) : item ? (
          <>
            <BagAction onClick={onPlace} primary>
              {t("uphero.bag.action.place")}
            </BagAction>
            <BagAction onClick={onRotate} disabled={!rotatable} shortcut="r">
              {t("uphero.bag.action.rotate")}
            </BagAction>
            <BagAction onClick={onEquip}>
              {t("uphero.equip.action.equip")}
            </BagAction>
            {/* 좁은 폭에서 여러 버튼이 들어가야 하므로 "강화 시도" 대신 탭 라벨과 같은 "강화". */}
            {enhanceable && (
              <BagAction onClick={onEnhance}>
                {t("uphero.equip.tabEnhance")}
              </BagAction>
            )}
            <BagAction onClick={onSell}>
              {t("uphero.equip.action.sellPreview", {
                price: sellPrice(item.rarity, item.dropFloor, item.enhanceLevel),
              })}
            </BagAction>
            {/* Track E 합성 — 선택한 아이템이 첫 재료. legend(다음 등급 없음)·사진 부적은
                iOS 와 같이 버튼 자체를 숨긴다. */}
            {!item.photoId && NEXT_RARITY[item.rarity] !== null && (
              <BagAction onClick={onSynth}>
                {t("uphero.equip.action.synth")}
              </BagAction>
            )}
          </>
        ) : (
          <>
            <span className={`typo-caption ${gbClass.textDim} flex-1 truncate`}>
              {hint}
            </span>
            {canStartSynth && (
              <BagAction onClick={onSynth}>
                {t("uphero.equip.action.synth")}
              </BagAction>
            )}
          </>
        )}
      </div>
      {cancel && (
        <BagAction onClick={cancel}>{t("uphero.bag.action.cancel")}</BagAction>
      )}
    </section>
  );
}

/**
 * 액션 버튼 — 보더 없이 배경 단계와 색으로만 위계를 만든다.
 * 44px 터치 타깃, press 0.97 (reduced motion 이면 정지).
 */
function BagAction({
  children,
  onClick,
  primary,
  danger,
  disabled,
  shortcut,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      className="bag-action typo-caption rounded shrink-0 whitespace-nowrap"
      style={{
        minHeight: 44,
        padding: "10px 9px",
        background: primary ? GB.lightest : `${GB.dark}88`,
        color: primary ? GB.darkest : danger ? GB_ENEMY : GB.light,
        border: "none",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
      <style jsx>{`
        .bag-action {
          transition: transform 120ms ${EASE_OUT};
        }
        .bag-action:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .bag-action {
            transition: none;
          }
          .bag-action:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </button>
  );
}
