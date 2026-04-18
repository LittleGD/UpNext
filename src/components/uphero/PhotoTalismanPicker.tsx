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
import { isPhotoBound, PHOTO_TALISMAN_RITUAL_COST } from "@/lib/photoTalisman";
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
  const photos = useGrowthStore((s) => s.photoMetas);
  const coins = useUpHeroStore((s) => s.coins);
  const inventory = useUpHeroStore((s) => s.inventory);
  const equipped = useUpHeroStore((s) => s.hero.equipped);
  const bindPhotoAsTalisman = useUpHeroStore((s) => s.bindPhotoAsTalisman);
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

  // 아직 바인딩 안 된 photo 만 — 바인딩된 photo 는 inventory 에 photoId 로 존재
  const availablePhotos = useMemo(
    () => photos.filter((p) => !isPhotoBound(p.id, inventory, equipped)),
    [photos, inventory, equipped],
  );

  const canAfford = coins >= PHOTO_TALISMAN_RITUAL_COST;

  /** Phase 9a — GbConfirm 으로 교체. 의식 시작 전 사용자 확인 step. */
  const [pendingPhoto, setPendingPhoto] = useState<PhotoMeta | null>(null);

  const onBind = (photo: PhotoMeta) => {
    if (!canAfford) {
      play("cancel");
      onNotify(`코인 부족 (${PHOTO_TALISMAN_RITUAL_COST} 필요)`);
      return;
    }
    setPendingPhoto(photo);
  };

  const executeBind = () => {
    const photo = pendingPhoto;
    setPendingPhoto(null);
    if (!photo) return;
    const result = bindPhotoAsTalisman(photo.id);
    if (result.ok && result.newItem) {
      play("collect");
      setRitualPhoto(photo);
      setRitualItem(result.newItem);
      // 기존 타이머 정리 — 의식 중 다른 photo 탭 방어
      if (ritualTimerRef.current) {
        window.clearTimeout(ritualTimerRef.current);
      }
      // 2800ms 후 reveal 로 전환 — keyframe 의 90-100% fade-out 구간 (2700-3000ms)
      // 이 자연스럽게 reveal 등장과 교차하도록.
      ritualTimerRef.current = window.setTimeout(() => {
        setRitualPhoto(null);
        setRevealedItem(result.newItem!);
        ritualTimerRef.current = null;
      }, 2800);
    } else {
      play("cancel");
      onNotify(result.error ?? "실패");
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
      aria-label="사진 부적 바인딩"
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
        className="px-3 py-2.5 flex items-center gap-3 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onClose}
          className="typo-caption inline-flex items-center gap-1 rounded"
          style={{
            minHeight: 40,
            padding: "8px 12px",
            background: `${GB.dark}cc`,
            border: `1px solid ${GB.light}`,
            color: GB.light,
          }}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
        </button>
        <div className="flex flex-col leading-tight flex-1">
          <div className="typo-caption" style={{ color: GB.lightest }}>
            사진 부적 — 바인딩 의식
          </div>
          <div className={`typo-caption ${gbClass.textDim} tabular-nums`}>
            {availablePhotos.length} / {photos.length} 바인딩 가능 · 의식{" "}
            {PHOTO_TALISMAN_RITUAL_COST} 코인
          </div>
        </div>
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
          RARITY 확률
        </div>
        <div className="flex items-center gap-3 flex-wrap typo-micro tabular-nums">
          <RarityProb color={GB.light} label="일반" pct={50} />
          <RarityProb color={GB_RARE} label="희귀" pct={35} />
          <RarityProb color={GB_UNIQUE} label="고유" pct={12} />
          <RarityProb color={GB_LEGEND} label="전설" pct={3} />
        </div>
      </div>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {availablePhotos.length === 0 ? (
          <div
            className={`typo-caption ${gbClass.textDim} text-center py-10`}
          >
            {photos.length === 0
              ? "챌린지를 완료하고 사진을 찍어보세요"
              : "이미 모든 사진이 부적이 되었어요"}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {availablePhotos.map((p) => (
              <PhotoThumb
                key={p.id}
                photo={p}
                onClick={() => onBind(p)}
                disabled={!canAfford}
              />
            ))}
          </div>
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

      {/* Phase 9a — 바인딩 확인 (기존 native confirm 대체).
           중첩 Portal 이라도 z-[70] GbConfirm 이 z-[50] picker 위에 떠서 무방. */}
      <GbConfirm
        open={pendingPhoto != null}
        title="이 사진을 부적으로 만들까요?"
        body={
          <>
            비용 {PHOTO_TALISMAN_RITUAL_COST} 코인 · Rarity 는 랜덤 (일반/희귀/고유/전설)
            <br />
            한 번 바인딩되면 재롤 불가합니다.
          </>
        }
        confirmLabel="의식 시작"
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
            alt={photo.challengeTitle}
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
            aria-label={`${photo.category} 카테고리`}
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
          {photo.challengeTitle}
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
    normal: "일반",
    rare: "희귀",
    unique: "고유",
    legend: "전설",
  }[item.rarity];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
            <div className={gbClass.textDim}>스탯</div>
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
            인벤토리로
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
            alt="ritual"
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
        의식이 진행되고 있다…
      </div>
    </div>,
    document.body,
  );
}
