/**
 * Up Hero — Phase 7: Photo Talisman.
 *
 * 사용자가 챌린지 완료 후 찍은 사진을 "의식" 을 거쳐 영웅의 talisman 부적으로
 * 바인딩. 코인 소모 + 랜덤 rarity roll + category 기반 stat 생성.
 *
 * 설계:
 * - photo 는 archive 에 남아있고 (grower store 의 photoMetas), talisman 은
 *   Equipment 로 inventory 에 추가됨. photoId 로 연결.
 * - 한 photo 는 한 번만 바인딩 가능 (이미 inventory 에 해당 photoId 의
 *   Equipment 이 있으면 재바인딩 금지).
 * - stats 는 기존 drop 포뮬러 과 유사. category → primary stat, rarity →
 *   배수. photo 자체의 노력 요소 (memo/signature/sticker) 는 여기서는
 *   반영 안 함 (user 가 랜덤 롤 선택).
 */

import type { Equipment, HeroBaseStats, DungeonId } from "@/types/uphero";
import type { PhotoMeta } from "@/types/growth";
import type { Rarity } from "@/types/card";

export const PHOTO_TALISMAN_RITUAL_COST = 80;

/** category → primary stat 매핑 (드롭 장비와 동일) */
const CATEGORY_STAT: Record<DungeonId, keyof HeroBaseStats> = {
  fitness: "str",
  learning: "int",
  mindfulness: "int",
  nutrition: "vit",
  social: "agi",
  productivity: "dex",
  wellness: "vit",
  trending: "dex",
};

/** rarity 별 stat 배수 (base 4 × mult, 반올림) */
const RARITY_STAT_MULT: Record<Rarity, number> = {
  normal: 1,
  rare: 1.5,
  unique: 2.2,
  legend: 3.2,
};

/** rarity 분포 — drop 과 유사하나 photo 는 더 자주 실시되므로 legend 확률 약간 낮게 */
export function rollPhotoRarity(): Rarity {
  const r = Math.random();
  if (r < 0.03) return "legend";
  if (r < 0.15) return "unique";
  if (r < 0.5) return "rare";
  return "normal";
}

/** rarity 별 이름 prefix (드롭 장비의 RARITY_PREFIX 와 톤 맞춤) */
const RARITY_PREFIX: Record<Rarity, string> = {
  normal: "회상의 ",
  rare: "빛바랜 ",
  unique: "운명의 ",
  legend: "신성한 ",
};

/** photo 의 date 를 자연어로 변환 */
function formatPhotoDate(photo: PhotoMeta): string {
  try {
    const d = new Date(photo.timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return photo.date;
  }
}

/**
 * photo 를 rarity 가 주어진 Equipment 로 변환. (의식 실행의 실제 결과)
 * - name: "{prefix}{photo.challengeTitle 축약}"
 * - stats: category 기반 primary stat + rarity mult
 * - photoId: photo.id (UI 에서 썸네일 렌더 trigger)
 * - flavor: 날짜 + category 기반 자동 생성 (photo.memo 가 있으면 우선)
 */
export function buildPhotoTalisman(
  photo: PhotoMeta,
  rarity: Rarity,
): Equipment {
  const primaryStat = CATEGORY_STAT[photo.category as DungeonId];
  const baseVal = 4;
  const mult = RARITY_STAT_MULT[rarity];
  const statVal = Math.round(baseVal * mult);
  const stats: Partial<HeroBaseStats> = { [primaryStat]: statVal };

  // unique / legend 는 slotBonus +1 (버프 슬롯 확장) — 기존 accessory/talisman 규칙
  if (rarity === "unique" || rarity === "legend") {
    stats.slotBonus = 1;
  }
  // legend 는 crit +3% 추가
  if (rarity === "legend") {
    stats.crit = 3;
  }

  // Phase 8a: 이름 단축 — rarity prefix + "부적" 제거, title 5 글자 max.
  // rarity 는 card border 색 / accent dot 으로 이미 전달, "부적" 은 썸네일 +
  // talisman 슬롯 위치로 맥락 전달. 짧을수록 sm 카드 (80×100) 에서 2줄 이내.
  const shortTitle =
    photo.challengeTitle.length > 5
      ? photo.challengeTitle.slice(0, 5) + "…"
      : photo.challengeTitle;

  const dateLabel = formatPhotoDate(photo);
  // flavor 에 rarity prefix 텍스트 흡수 ("빛바랜 100 Jump Ropes — 2026.04.16")
  const flavorOriginal = photo.memo
    ? photo.memo.slice(0, 60)
    : `${dateLabel} — ${photo.challengeTitle}`;
  const flavor = `${RARITY_PREFIX[rarity]}${flavorOriginal}`;

  return {
    id: `photoTal_${photo.id}`,
    name: shortTitle,
    type: "talisman",
    rarity,
    category: photo.category as DungeonId,
    iconName: "Camera", // fallback — UI 는 photoId 로 썸네일 렌더 우선
    stats,
    flavor,
    photoId: photo.id,
  };
}

/**
 * photo 가 이미 bound 된 상태인지 판정 — inventory 에서 photoId 매칭.
 */
export function isPhotoBound(
  photoId: string,
  inventory: Equipment[],
  equipped?: Partial<Record<string, Equipment>>,
): boolean {
  if (inventory.some((eq) => eq.photoId === photoId)) return true;
  if (equipped) {
    for (const eq of Object.values(equipped)) {
      if (eq && eq.photoId === photoId) return true;
    }
  }
  return false;
}

/** category / primary stat 표시 (UI helper) */
export { CATEGORY_STAT as PHOTO_CATEGORY_STAT };
