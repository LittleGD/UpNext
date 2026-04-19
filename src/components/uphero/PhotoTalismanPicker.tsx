"use client";

/**
 * Up Hero — Phase 7: PhotoTalismanPicker.
 *
 * EquipmentInventory 의 "사진 부적 만들기" CTA 에서 열림.
 * 미바인딩 photo 그리드 (폴라로이드 썸네일 3-col) 에서 하나 선택 →
 * 80 코인 지불 확인 → 랜덤 rarity 로 Equipment 생성 → reveal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";
import {
  findBoundPhotoTalisman,
  isPhotoBound,
  PHOTO_TALISMAN_RITUAL_COST,
  rebindPhotoTalismanCost,
} from "@/lib/photoTalisman";
import { MAX_ENHANCE_LEVEL } from "@/types/uphero";
import { TALISMAN_SKILLS, computeTalismanSkillIds } from "@/lib/talismanSkills";
import { DUNGEONS } from "@/data/upHeroDungeons";
import type { PhotoMeta } from "@/types/growth";
import type { Equipment, DungeonId } from "@/types/uphero";
import {
  GB,
  EASE_OUT,
  gbClass,
  GB_LEGEND,
  GB_UNIQUE,
  GB_RARE,
} from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, type DictKey } from "@/i18n";
import { ALL_CARDS } from "@/data/cards";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "./GbConfirm";

interface PhotoTalismanPickerProps {
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export default function PhotoTalismanPicker({
  onClose,
  onNotify,
}: PhotoTalismanPickerProps) {
  const { t } = useTranslation();
  const photos = useGrowthStore((s) => s.photoMetas);
  const coins = useUpHeroStore((s) => s.coins);
  const inventory = useUpHeroStore((s) => s.inventory);
  const equipped = useUpHeroStore((s) => s.hero.equipped);
  const bindPhotoAsTalisman = useUpHeroStore((s) => s.bindPhotoAsTalisman);
  const rebindPhotoTalisman = useUpHeroStore((s) => s.rebindPhotoTalisman);
  const { play } = useSound();

  const [mounted, setMounted] = useState(false);
  const [revealedItem, setRevealedItem] = useState<Equipment | null>(null);
  // Phase 7 polish — "의식" 연출. photoId + 결과 item 을 3초 애니메이션 동안
  // 보관하고 끝날 때 reveal 로 전환. 코인 차감 / inventory 추가 / rarity roll
  // 은 애니메이션 시작 직후 즉시 (UI 는 애니메이션 재생 중 바뀐 상태를 보여주지
  // 않도록 availablePhotos 갱신이 애니메이션 끝날 때 반영되어도 OK — 방어적
  // 으로 ritual photo 는 그 photo 객체를 snapshot 으로 들고 있음).
  const [ritualPhoto, setRitualPhoto] = useState<PhotoMeta | null>(null);
  const [ritualItem, setRitualItem] = useState<Equipment | null>(null);
  /**
   * Phase 7 polish fix — 의식 타이머 ref.
   * unmount 시 / 동일 photo 연속 바인딩 시 cleanup. React warning 방지 +
   * 사용자가 picker 를 닫을 때 뒤늦게 reveal 이 뜨는 현상 차단.
   */
  const ritualTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // unmount 시 살아있는 ritual 타이머 제거
  useEffect(() => {
    return () => {
      if (ritualTimerRef.current) {
        window.clearTimeout(ritualTimerRef.current);
        ritualTimerRef.current = null;
      }
    };
  }, []);

  // Phase 11b — 모든 photo 를 노출하되 bound 여부로 분리.
  //   unbound : 최초 바인딩 (rarity roll)
  //   bound   : 재의식 (+1 enhanceLevel, rarity 유지).
  //   상단엔 unbound, 하단엔 bound 섹션으로 명확히 구분.
  const unboundPhotos = useMemo(
    () => photos.filter((p) => !isPhotoBound(p.id, inventory, equipped)),
    [photos, inventory, equipped],
  );
  const boundPhotos = useMemo(
    () =>
      photos
        .map((p) => {
          const bound = findBoundPhotoTalisman(p.id, inventory, equipped);
          if (!bound) return null;
          return { photo: p, item: bound.item };
        })
        .filter(
          (x): x is { photo: PhotoMeta; item: Equipment } => x !== null,
        ),
    [photos, inventory, equipped],
  );

  const canAfford = coins >= PHOTO_TALISMAN_RITUAL_COST;

  /** Phase 9a → 11b — GbConfirm 으로 교체. 의식 시작 전 사용자 확인 step.
   *   mode=bind  : 초기 바인딩 (rarity roll).
   *   mode=rebind: 재의식 (+1 enhanceLevel). 같은 photo 의 기존 item 을 가리킴. */
  const [pendingPhoto, setPendingPhoto] = useState<{
    photo: PhotoMeta;
    mode: "bind" | "rebind";
    existing?: Equipment; // rebind 시 현재 부적
  } | null>(null);

  const onBind = (photo: PhotoMeta) => {
    if (!canAfford) {
      play("cancel");
      onNotify(
        t("uphero.photo.toast.insufficientCoin", {
          cost: PHOTO_TALISMAN_RITUAL_COST,
        }),
      );
      return;
    }
    setPendingPhoto({ photo, mode: "bind" });
  };

  const onRebind = (photo: PhotoMeta, existing: Equipment) => {
    if (!canAfford) {
      play("cancel");
      onNotify(
        t("uphero.photo.toast.insufficientCoin", {
          cost: PHOTO_TALISMAN_RITUAL_COST,
        }),
      );
      return;
    }
    if ((existing.enhanceLevel ?? 0) >= MAX_ENHANCE_LEVEL) {
      play("cancel");
      onNotify(t("uphero.photo.toast.maxEnhance"));
      return;
    }
    setPendingPhoto({ photo, mode: "rebind", existing });
  };

  const executeBind = () => {
    const pending = pendingPhoto;
    setPendingPhoto(null);
    if (!pending) return;

    if (pending.mode === "bind") {
      const result = bindPhotoAsTalisman(pending.photo.id);
      if (result.ok && result.newItem) {
        play("collect");
        setRitualPhoto(pending.photo);
        setRitualItem(result.newItem);
        if (ritualTimerRef.current) {
          window.clearTimeout(ritualTimerRef.current);
        }
        ritualTimerRef.current = window.setTimeout(() => {
          setRitualPhoto(null);
          setRevealedItem(result.newItem!);
          ritualTimerRef.current = null;
        }, 2800);
      } else {
        play("cancel");
        onNotify(
          result.errorKey
            ? t(result.errorKey as DictKey, result.errorParams)
            : t("uphero.photo.toast.genericFail"),
        );
      }
      return;
    }

    // rebind — 재의식
    const result = rebindPhotoTalisman(pending.photo.id);
    if (result.ok && result.newItem) {
      play("collect");
      setRitualPhoto(pending.photo);
      setRitualItem(result.newItem);
      if (ritualTimerRef.current) {
        window.clearTimeout(ritualTimerRef.current);
      }
      ritualTimerRef.current = window.setTimeout(() => {
        setRitualPhoto(null);
        setRevealedItem(result.newItem!);
        ritualTimerRef.current = null;
      }, 2800);
    } else {
      play("cancel");
      onNotify(
        result.errorKey
          ? t(result.errorKey as DictKey, result.errorParams)
          : t("uphero.photo.toast.genericFail"),
      );
    }
  };

  // Phase 9a — Esc 닫기 + focus trap + scroll lock.
  //   의식 진행 중 (ritualPhoto != null) 에는 실수로 닫히지 않도록 비활성.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, {
    disabled: ritualPhoto != null || revealedItem != null,
  });

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("uphero.photo.bindAria")}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: GB.darkest,
        color: GB.light,
        opacity: mounted ? 1 : 0,
        transition: `opacity 200ms ${EASE_OUT}`,
        paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
        outline: "none",
      }}
    >
      {/* === Header === */}
      <header
        // Phase 11b-fix — subheader 균형.
        className="px-3 py-2 flex items-center gap-1 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onClose}
          className="picker-back typo-caption inline-flex items-center gap-0.5 rounded"
          style={{
            minHeight: 40,
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            color: GB.light,
          }}
          aria-label={t("uphero.photo.backAria")}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          {t("uphero.photo.back")}
        </button>
        <div className="flex flex-col leading-tight flex-1 ml-1 min-w-0">
          <div
            className="typo-body truncate"
            style={{ color: GB.lightest, fontWeight: 500 }}
          >
            {t("uphero.photo.title")}
          </div>
          <div className={`typo-micro ${gbClass.textDim} tabular-nums`}>
            {t("uphero.photo.subheader", {
              unbound: unboundPhotos.length,
              bound: boundPhotos.length,
              cost: PHOTO_TALISMAN_RITUAL_COST,
            })}
          </div>
        </div>
        <style jsx>{`
          .picker-back {
            transition: transform 120ms ${EASE_OUT},
              background 160ms ${EASE_OUT};
          }
          .picker-back:active {
            transform: scale(0.96);
            background: ${GB.dark}66;
          }
        `}</style>
      </header>

      {/* === Rarity 확률 표 — 의식 전 투명성 확보 === */}
      <div
        className="px-3 py-2.5 shrink-0"
        style={{
          borderBottom: `1px solid ${GB.dark}`,
          background: `${GB.dark}33`,
        }}
      >
        <div
          className={`typo-micro ${gbClass.textDim} mb-1.5`}
          style={{ letterSpacing: "0.05em" }}
        >
          {t("uphero.photo.rarityHeader")}
        </div>
        <div className="flex items-center gap-3 flex-wrap typo-micro tabular-nums">
          <RarityProb color={GB.light} label={t("uphero.photo.rarity.normal")} pct={50} />
          <RarityProb color={GB_RARE} label={t("uphero.photo.rarity.rare")} pct={35} />
          <RarityProb color={GB_UNIQUE} label={t("uphero.photo.rarity.unique")} pct={12} />
          <RarityProb color={GB_LEGEND} label={t("uphero.photo.rarity.legend")} pct={3} />
        </div>
      </div>

      {/* === Body — Phase 11b: unbound + bound 두 섹션 ===
           unbound: 최초 바인딩 (랜덤 rarity).
           bound:   재의식 (+N → +(N+1), rarity 유지, +5/+10 skill 부여). */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {photos.length === 0 && (
          <div
            className={`typo-caption ${gbClass.textDim} text-center py-10`}
          >
            {t("uphero.photo.emptyHint")}
          </div>
        )}

        {/* 미바인딩 섹션 */}
        {unboundPhotos.length > 0 && (
          <section className="mb-5">
            <div
              className="typo-caption mb-2 inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Sparkle" size={14} color={GB.lightest} />
              {t("uphero.photo.section.bind")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {unboundPhotos.map((p) => (
                <PhotoThumb
                  key={p.id}
                  photo={p}
                  onClick={() => onBind(p)}
                  disabled={!canAfford}
                />
              ))}
            </div>
          </section>
        )}

        {/* 재의식 섹션 — bound photo 들 */}
        {boundPhotos.length > 0 && (
          <section>
            <div
              className="typo-caption mb-2 inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Fire" size={14} color={GB.lightest} />
              {t("uphero.photo.section.rebind", { max: MAX_ENHANCE_LEVEL })}
            </div>
            <div className="flex flex-col gap-1.5">
              {boundPhotos.map(({ photo: p, item }) => {
                const level = item.enhanceLevel ?? 0;
                const isMaxed = level >= MAX_ENHANCE_LEVEL;
                // Phase 11c R4 — rebind 비용 level 스케일. 각 행마다 재계산.
                const rebindCost = rebindPhotoTalismanCost(level);
                const rowCanAfford = coins >= rebindCost;
                const skillIds = computeTalismanSkillIds(
                  item.category,
                  level,
                );
                const nextSkillIds = computeTalismanSkillIds(
                  item.category,
                  level + 1,
                );
                const gainingSkill = nextSkillIds.length > skillIds.length;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded px-2.5 py-2"
                    style={{
                      background: `${GB.dark}66`,
                      border: `1px solid ${GB.light}55`,
                    }}
                  >
                    <PixelIcon name="Camera" size={16} color={GB.lightest} />
                    <div className="flex-1 min-w-0">
                      <div
                        className="typo-caption truncate"
                        style={{ color: GB.lightest }}
                      >
                        {item.name}
                      </div>
                      <div
                        className={`typo-micro tabular-nums ${gbClass.textDim} flex items-center gap-2 mt-0.5`}
                      >
                        <span>+{level} → +{Math.min(MAX_ENHANCE_LEVEL, level + 1)}</span>
                        {gainingSkill && (
                          <span style={{ color: GB.lightest }}>
                            {t("uphero.photo.newSkill")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!rowCanAfford || isMaxed}
                      onClick={() => onRebind(p, item)}
                      className="uphero-rebind-btn typo-caption tabular-nums rounded"
                      style={{
                        padding: "10px 14px",
                        minHeight: 44,
                        background: rowCanAfford && !isMaxed ? GB.lightest : `${GB.dark}aa`,
                        color: rowCanAfford && !isMaxed ? GB.darkest : GB.light,
                        border: `1px solid ${
                          rowCanAfford && !isMaxed ? GB.lightest : GB.dark
                        }`,
                        opacity: rowCanAfford && !isMaxed ? 1 : 0.55,
                      }}
                    >
                      {isMaxed
                        ? t("uphero.photo.maxLabel")
                        : t("uphero.photo.rebindButton", { cost: rebindCost })}
                    </button>
                  </div>
                );
              })}
              <style jsx>{`
                .uphero-rebind-btn {
                  transition: transform 120ms ${EASE_OUT};
                }
                .uphero-rebind-btn:not(:disabled):active {
                  transform: scale(0.96);
                }
              `}</style>
            </div>
          </section>
        )}
      </div>

      {/* === Ritual 연출 === */}
      {ritualPhoto && ritualItem && (
        <RitualAnimation photo={ritualPhoto} item={ritualItem} />
      )}

      {/* === Reveal modal === */}
      {revealedItem && (
        <RitualReveal
          item={revealedItem}
          onClose={() => {
            setRevealedItem(null);
          }}
        />
      )}

      {/* Phase 9a → 11b — 바인딩/재의식 확인 (native confirm 대체).
           중첩 Portal 이라도 z-[70] GbConfirm 이 z-[50] picker 위에 떠서 무방. */}
      <GbConfirm
        open={pendingPhoto != null}
        title={
          pendingPhoto?.mode === "bind"
            ? t("uphero.photo.confirm.bindTitle")
            : t("uphero.photo.confirm.rebindTitle", {
                name: pendingPhoto?.existing?.name ?? "",
              })
        }
        body={
          pendingPhoto?.mode === "bind" ? (
            <>
              {t("uphero.photo.confirm.bindBodyCost", {
                cost: PHOTO_TALISMAN_RITUAL_COST,
              })}
              <br />
              {t("uphero.photo.confirm.bindBodyHint")}
            </>
          ) : pendingPhoto?.mode === "rebind" ? (
            (() => {
              const cur = pendingPhoto.existing?.enhanceLevel ?? 0;
              const next = cur + 1;
              const newSkills = computeTalismanSkillIds(
                pendingPhoto.existing?.category ?? "fitness",
                next,
              );
              const prevSkills = computeTalismanSkillIds(
                pendingPhoto.existing?.category ?? "fitness",
                cur,
              );
              const newlyGained = newSkills.filter((id) => !prevSkills.includes(id));
              // Phase 11c R4 — rebind 비용은 현재 level 기반 스케일.
              const rebindCost = rebindPhotoTalismanCost(cur);
              return (
                <>
                  {t("uphero.photo.confirm.rebindBodyCost", { cost: rebindCost })}
                  <br />
                  {t("uphero.photo.confirm.rebindEnhance")}{" "}
                  <span style={{ color: GB.lightest }}>+{cur} → +{next}</span>
                  {newlyGained.length > 0 && (
                    <>
                      <br />
                      {t("uphero.photo.confirm.rebindNewSkills")}{" "}
                      <span style={{ color: GB.lightest }}>
                        {newlyGained
                          .map((id) => TALISMAN_SKILLS[id]?.name ?? id)
                          .join(", ")}
                      </span>
                    </>
                  )}
                </>
              );
            })()
          ) : null
        }
        confirmLabel={
          pendingPhoto?.mode === "rebind"
            ? t("uphero.photo.button.ritualRebind")
            : t("uphero.photo.button.ritualBind")
        }
        onConfirm={executeBind}
        onCancel={() => setPendingPhoto(null)}
      />
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────── */

/** rarity 확률 표 pill — 색 dot + 한글 이름 + 퍼센트 */
function RarityProb({
  color,
  label,
  pct,
}: {
  color: string;
  label: string;
  pct: number;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="rounded-full"
        style={{
          width: 6,
          height: 6,
          background: color,
          boxShadow: `0 0 3px ${color}aa`,
        }}
      />
      <span style={{ color }}>{label}</span>
      <span className={gbClass.textDim}>{pct}%</span>
    </div>
  );
}

/** 썸네일 한 장 — IndexedDB 에서 blob 가져와 URL 로 렌더 */
function PhotoThumb({
  photo,
  onClick,
  disabled,
}: {
  photo: PhotoMeta;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t, language } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photo.id)
      .then((blob) => {
        if (!active) return;
        if (blob) {
          objectUrl = blobToUrl(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  // Phase 13 review P1 — photo.challengeTitle 은 촬영 시점의 한국어 스냅샷.
  //   photo.challengeCardId 로 ALL_CARDS 다국어 title lookup. 카드가 없어진 경우
  //   (legacy) challengeTitle fallback.
  const displayTitle = useMemo(() => {
    const card = ALL_CARDS.find((c) => c.id === photo.challengeCardId);
    if (!card) return photo.challengeTitle;
    return cardTitle(card, language);
  }, [photo.challengeCardId, photo.challengeTitle, language]);

  const dateLabel = new Date(photo.timestamp).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });

  // Phase 7 polish — 카테고리 색 dot 우상단. 8개 photo 섞여있을 때 한눈에
  // "운동/학습/명상..." 구분 가능. DUNGEONS.themeColor 재사용.
  const categoryColor = DUNGEONS[photo.category as DungeonId]?.themeColor;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col rounded overflow-hidden text-left"
      style={{
        aspectRatio: "184/223",
        background: GB.dark,
        border: `1px solid ${GB.light}`,
        opacity: disabled ? 0.5 : 1,
        transition: `transform 120ms ${EASE_OUT}`,
      }}
    >
      <div
        className="flex-1 relative"
        style={{ background: url ? "transparent" : `${GB.darkest}` }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={displayTitle}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center typo-micro ${gbClass.textDim}`}
          >
            …
          </div>
        )}
        {/* 카테고리 dot — 우상단 overlay */}
        {categoryColor && (
          <div
            className="absolute top-1 right-1 rounded-full"
            style={{
              width: 8,
              height: 8,
              background: categoryColor,
              boxShadow: `0 0 4px ${categoryColor}, 0 1px 2px rgba(0,0,0,0.4)`,
            }}
            aria-label={t("uphero.photo.categoryAria", {
              category: t(`uphero.category.${photo.category}` as DictKey),
            })}
          />
        )}
      </div>
      <div
        className="px-1.5 py-1 flex flex-col"
        style={{
          background: GB.darkest,
          borderTop: `1px solid ${GB.dark}`,
        }}
      >
        <div
          className="typo-micro truncate"
          style={{ color: GB.lightest, letterSpacing: "0.03em" }}
        >
          {displayTitle}
        </div>
        <div
          className={`typo-micro tabular-nums ${gbClass.textDim}`}
        >
          {dateLabel}
        </div>
      </div>
    </button>
  );
}

/* ────────────────────────────────────────── */

function RitualReveal({
  item,
  onClose,
}: {
  item: Equipment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const rarityColor =
    item.rarity === "legend"
      ? GB_LEGEND
      : item.rarity === "unique"
        ? GB_UNIQUE
        : item.rarity === "rare"
          ? GB_RARE
          : GB.light;

  const rarityLabel = {
    normal: t("uphero.photo.rarity.normal"),
    rare: t("uphero.photo.rarity.rare"),
    unique: t("uphero.photo.rarity.unique"),
    legend: t("uphero.photo.rarity.legend"),
  }[item.rarity];

  // Phase 11c R1 — picker z-50 / RitualAnimation z-55 와 겹쳐 stacking 보장 위해 z-[58].
  return createPortal(
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}ee`,
        opacity: mounted ? 1 : 0,
        transition: `opacity 220ms ${EASE_OUT}`,
      }}
    >
      <div
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${rarityColor}`,
          transform: mounted ? "scale(1)" : "scale(0.94)",
          opacity: mounted ? 1 : 0,
          transition: `transform 260ms ${EASE_OUT}, opacity 220ms ${EASE_OUT}`,
        }}
      >
        <div
          className="px-4 py-4 text-center flex flex-col items-center gap-2"
          style={{
            borderBottom: `1px solid ${GB.dark}`,
            background: `linear-gradient(180deg, ${rarityColor}22 0%, transparent 100%)`,
          }}
        >
          <div
            className="typo-caption"
            style={{ color: rarityColor, letterSpacing: "0.08em" }}
          >
            {rarityLabel}
          </div>
          <div className="typo-heading" style={{ color: GB.lightest }}>
            {item.name}
          </div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-2.5 typo-caption">
          <div className="flex flex-col gap-1">
            <div className={gbClass.textDim}>{t("uphero.photo.stats")}</div>
            {Object.entries(item.stats).map(([k, v]) => (
              <div key={k} style={{ color: GB.lightest }}>
                {k.toUpperCase()} +{v}
              </div>
            ))}
          </div>
          {item.flavor && (
            <div className={`${gbClass.textDim} leading-relaxed pt-1`}>
              {item.flavor}
            </div>
          )}
        </div>
        <div
          className="px-4 py-3"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded typo-caption"
            style={{
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
            }}
          >
            {t("uphero.photo.toInventory")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────── */

/**
 * Phase 7 polish — 의식 연출. 3 초 동안 photo 가 회전/확대 + 파편 + flash.
 * 끝나면 parent 가 RitualReveal 로 전환.
 */
function RitualAnimation({
  photo,
  item,
}: {
  photo: PhotoMeta;
  item: Equipment;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photo.id)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = blobToUrl(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  const rarityColor =
    item.rarity === "legend"
      ? GB_LEGEND
      : item.rarity === "unique"
        ? GB_UNIQUE
        : item.rarity === "rare"
          ? GB_RARE
          : GB.light;

  // 파편 수 + glow 반경 rarity 별 차등 — "의식 규모" 자체가 결과 힌트.
  // 평범한 일반 결과는 6 파편 작은 glow, 전설은 20 파편 큰 glow.
  const { sparkCount, glowSize, farR } = useMemo(() => {
    switch (item.rarity) {
      case "legend":
        return { sparkCount: 20, glowSize: 320, farR: 170 };
      case "unique":
        return { sparkCount: 14, glowSize: 280, farR: 150 };
      case "rare":
        return { sparkCount: 10, glowSize: 240, farR: 140 };
      default:
        return { sparkCount: 6, glowSize: 200, farR: 120 };
    }
  }, [item.rarity]);

  // N 방향 파편 — 각도별로 계산해서 inline style 변수 전달
  const sparks = useMemo(() => {
    const arr: Array<{ sx: number; sy: number; fx: number; fy: number; delay: number }> = [];
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2;
      const midR = 60;
      arr.push({
        sx: Math.cos(angle) * midR,
        sy: Math.sin(angle) * midR,
        fx: Math.cos(angle) * farR,
        fy: Math.sin(angle) * farR,
        delay: 600 + i * (sparkCount >= 14 ? 60 : 90),
      });
    }
    return arr;
  }, [sparkCount, farR]);

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center pointer-events-none"
      style={{ background: `${GB.darkest}ee` }}
    >
      {/* 중앙 glow — rarity 에 따라 크기 차등 */}
      <div
        className="uphero-ritual-glow absolute rounded-full"
        style={{
          width: glowSize,
          height: glowSize,
          background: `radial-gradient(circle, ${rarityColor}66 0%, ${rarityColor}22 40%, transparent 70%)`,
        }}
        aria-hidden="true"
      />
      {/* 파편 */}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="uphero-ritual-spark absolute typo-caption pointer-events-none"
          style={
            {
              color: rarityColor,
              fontSize: 14,
              textShadow: `0 0 6px ${rarityColor}`,
              "--sx": `${s.sx}px`,
              "--sy": `${s.sy}px`,
              "--fx": `${s.fx}px`,
              "--fy": `${s.fy}px`,
              animationDelay: `${s.delay}ms`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          ✦
        </span>
      ))}

      {/* photo 본체 */}
      <div
        className="uphero-ritual-photo relative overflow-hidden rounded"
        style={{
          width: 150,
          height: 150,
          border: `2px solid ${rarityColor}`,
          boxShadow: `0 0 24px ${rarityColor}aa`,
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: GB.dark,
            }}
          />
        )}
      </div>

      {/* 텍스트 — "의식이 진행 중..." */}
      <div
        className="absolute typo-caption"
        style={{
          bottom: "calc(50% - 140px)",
          color: GB.lightest,
          letterSpacing: "0.1em",
        }}
      >
        {t("uphero.photo.ritualProgress")}
      </div>
    </div>,
    document.body,
  );
}
