/**
 * Up Hero — 이벤트 결과 팝업의 "톤/모티프" 계약.
 *
 * 왜 별도 모듈인가:
 *   ChoiceResultModal (렌더) 과 ChoiceResultAura (연출 레이어) 가 같은 타입을
 *   공유해야 하는데, 서로 import 하면 순환이 된다. 타입 + 순수 파생 함수만
 *   여기에 모아 양쪽이 단방향으로 참조한다.
 *
 * 슬롯머신 등 새 이벤트가 결과를 이 모달에 태울 때 맞춰야 하는 계약도 이 파일이다.
 *   호출자는 `tone` / `motif` 만 넘기면 색·아이콘·입자·진입 모션이 전부 갈린다.
 *   아무것도 안 넘기면 summaryData 수치에서 자동 추론 (기존 던전 이벤트 경로).
 */

import { GB, GB_ENEMY, GB_LEGEND } from "@/lib/upHeroPalette";
import { SLOT_CELEBRATION_TIER, type SlotOutcomeId, type SlotTier } from "@/lib/upHeroSlot";
import type { EffectSummaryData } from "@/types/uphero";

/**
 * 결과의 정서적 톤. 색·입자 방향·진입 모션·글로우 속도를 전부 이 값이 결정한다.
 *   - jackpot : 대박 (황금 스파크, 링 펄스, 팝 진입)
 *   - boon    : 이득 (라임 모트가 위로, 부드러운 상승 진입)
 *   - neutral : 무해 (희미한 먼지, 정적 글로우)
 *   - bane    : 손해 (붉은 재가 아래로, 위에서 떨어지는 진입 + 비네트)
 */
export type ChoiceResultTone = "jackpot" | "boon" | "neutral" | "bane";

/**
 * 결과가 "무엇" 이었는지를 가리키는 아이콘 모티프.
 *   슬롯머신 보상 5종 + 꽝 = coin / protect / preserve / box / buff / blank.
 *   던전 이벤트는 gear / heal / damage / time / generic 로 자동 추론된다.
 */
export type ChoiceResultMotif =
  /** 코인 획득 */
  | "coin"
  /** 하락방지권 — 방패. 드럼 룬 `shield` 와 같은 아이콘. */
  | "protect"
  /** 소실방지권 — 자물쇠. 드럼 룬 `cloth` 와 같은 아이콘. */
  | "preserve"
  /** 아이템 랜덤 상자 */
  | "box"
  /** 일시 버프 (다음 N 전투 능력치 상승) */
  | "buff"
  /** 꽝 */
  | "blank"
  /** 장비 드롭 */
  | "gear"
  /** 회복 */
  | "heal"
  /** 피해 */
  | "damage"
  /** 탐험 시간 변동 */
  | "time"
  /** Phase 4-D — 런 한정 저주 (능력치 하락) */
  | "curse"
  /** Phase 4-D — 은신 (조우 회피) */
  | "stealth"
  /** Phase 4-D — 층 건너뜀 */
  | "skip"
  /** 분류 없음 */
  | "generic";

/** 결과 연출 지정. 호출자가 부분만 넘겨도 나머지는 추론된다. */
export interface ChoiceResultPresentation {
  tone?: ChoiceResultTone;
  motif?: ChoiceResultMotif;
  /**
   * 수치로 안 잡히는 보상의 라벨 (이미 t() 로 풀린 문자열).
   * 예: "소실방지권 ×1", "다음 3전투 능력치 +10%".
   * summaryData 요약 chip 옆에 별도 chip 으로 노출.
   */
  rewardLabel?: string | null;
}

/**
 * ChoiceResultModal 이 받는 수치 요약 (combat 의 summarizeEffectsData 반환형).
 *   Phase 4-D — types/uphero.ts 의 EffectSummaryData 로 승격, 여기서는 별칭만.
 */
export type ChoiceResultSummaryData = EffectSummaryData;

/** 톤별 대표 색 — GB 팔레트 안에서만 고른다. */
export const CHOICE_TONE_COLOR: Record<ChoiceResultTone, string> = {
  /** 붉은 금색. 레전드 드롭과 같은 "최상급" 신호. */
  jackpot: GB_LEGEND,
  /** UpNext accent. */
  boon: GB.lightest,
  /** 차분한 세이지. */
  neutral: GB.light,
  /** 앱 토큰 accent-secondary 의 GB 톤 대응. 게임 내 위험 신호. */
  bane: GB_ENEMY,
};

/** 모티프 → pixelarticons 아이콘 이름. */
const MOTIF_ICON: Record<ChoiceResultMotif, string> = {
  coin: "Coins",
  protect: "Shield",
  preserve: "Lock",
  box: "Package",
  buff: "Sparkle",
  blank: "Frown",
  gear: "Sword",
  heal: "Heart",
  damage: "Skull",
  time: "Clock",
  curse: "Moon",
  stealth: "Eye",
  skip: "Forward",
  generic: "Zap",
};

/**
 * Phase 4-D — 런 한정 효과의 톤 가중치. 수치가 아닌 효과라 정성적으로 정한다:
 *   버프/스킵 = 평범한 이벤트 보상(≈40) 하나, 은신/보스 정보 = 그보다 조금 작게,
 *   장비 확정 = 가장 크게 (드롭 하나가 코인 수십 개 가치). 저주는 같은 크기의 손해.
 */
const RUN_MOD_TONE_WEIGHT = 40;
const STEALTH_TONE_WEIGHT = 30;
const GUARANTEED_DROP_TONE_WEIGHT = 60;
const SKIP_TONE_WEIGHT = 40;
const BOSS_REVEAL_TONE_WEIGHT = 30;

function runModCounts(d: ChoiceResultSummaryData): { pos: number; neg: number } {
  let pos = 0;
  let neg = 0;
  for (const m of d.runMods ?? []) {
    if (m.pct > 0) pos += 1;
    else if (m.pct < 0) neg += 1;
  }
  return { pos, neg };
}

/**
 * 아이콘 이름 확정. generic + jackpot 은 트로피로 승격 —
 * "분류는 없지만 대박" 인 결과(예: 슬롯 최상단 잭팟)를 밋밋한 번개로 두지 않는다.
 */
export function choiceResultIcon(
  motif: ChoiceResultMotif,
  tone: ChoiceResultTone,
): string {
  if (motif === "generic" && tone === "jackpot") return "Trophy";
  return MOTIF_ICON[motif];
}

/**
 * summaryData 수치에서 톤 추론. 호출자가 tone 을 명시하면 쓰이지 않는다.
 *
 * 가중치 근거:
 *   - HP 손실은 같은 크기의 XP 획득보다 훨씬 아프게 읽힌다 → damage ×3.
 *   - timeDelta 는 음수가 소모(손해), 양수가 회복(이득).
 *   - jackpot 은 "손해 0 + 이득이 평범한 이벤트 보상(≈50)의 두 배 이상" 일 때만.
 */
export function deriveChoiceResultTone(
  d?: ChoiceResultSummaryData | null,
): ChoiceResultTone {
  if (!d) return "neutral";
  const timeDelta = d.timeDelta ?? 0;
  const { pos, neg } = runModCounts(d);
  const gain =
    (d.xp ?? 0) +
    (d.coins ?? 0) +
    (d.heal ?? 0) +
    Math.max(0, timeDelta) * 2 +
    pos * RUN_MOD_TONE_WEIGHT +
    (d.stealth ?? 0) * STEALTH_TONE_WEIGHT +
    (d.guaranteedDrop ?? 0) * GUARANTEED_DROP_TONE_WEIGHT +
    (d.skipFloors ?? 0) * SKIP_TONE_WEIGHT +
    ((d.bossDmgPct ?? 0) > 0 ? BOSS_REVEAL_TONE_WEIGHT : 0);
  const loss =
    (d.damage ?? 0) * 3 + Math.max(0, -timeDelta) * 2 + neg * RUN_MOD_TONE_WEIGHT;
  if (gain === 0 && loss === 0) return "neutral";
  if (loss > gain) return "bane";
  if (loss === 0 && gain >= 120) return "jackpot";
  return "boon";
}

/**
 * 굴림틀 축하 티어 → 팝업 톤. 티어의 단일 출처는 `upHeroSlot.SLOT_CELEBRATION_TIER`
 * 라 여기서는 옮기기만 한다. big 만 jackpot (황금 스파크·링·셰이크·스파크 낙하).
 * blank 는 bane 이 아니라 neutral: 붉은 재와 비네트는 실제 피해(HP 손실·함정)에만
 * 쓴다. 꽝은 "아무 일도 없었다" 지 피해가 아니다.
 */
export const SLOT_TIER_TONE: Record<SlotTier, ChoiceResultTone> = {
  none: "neutral",
  small: "boon",
  mid: "boon",
  big: "jackpot",
};

/** 굴림틀 결과 → 아이콘 모티프. 드럼 룬(`SYMBOL_ICON`)과 같은 그림이어야 한다. */
const SLOT_OUTCOME_MOTIF: Record<SlotOutcomeId, ChoiceResultMotif> = {
  blank: "blank",
  coinSmall: "coin",
  coinMid: "coin",
  coinJackpot: "coin",
  rankProtect: "protect",
  destroyProtect: "preserve",
  itemBox: "box",
  battleBuff: "buff",
};

/**
 * 굴림틀 결과 → 팝업 연출. 호출자는 이 표를 그대로 펴서
 * `<ChoiceResultModal {...SLOT_OUTCOME_PRESENTATION[id]} rewardLabel={...} />`
 * 로 넘기면 된다. 아이콘/색/입자/진입 모션이 전부 갈린다. `big` 이 true 면
 * 결과 모달이 셰이크·스파크 낙하까지 얹는다.
 */
export const SLOT_OUTCOME_PRESENTATION: Record<
  SlotOutcomeId,
  { tone: ChoiceResultTone; motif: ChoiceResultMotif; big: boolean }
> = (Object.keys(SLOT_CELEBRATION_TIER) as SlotOutcomeId[]).reduce(
  (acc, id) => {
    const tier = SLOT_CELEBRATION_TIER[id];
    acc[id] = {
      tone: SLOT_TIER_TONE[tier],
      motif: SLOT_OUTCOME_MOTIF[id],
      big: tier === "big",
    };
    return acc;
  },
  {} as Record<SlotOutcomeId, { tone: ChoiceResultTone; motif: ChoiceResultMotif; big: boolean }>,
);

/** summaryData 에서 모티프 추론. 호출자가 motif 를 명시하면 쓰이지 않는다. */
export function deriveChoiceResultMotif(
  d?: ChoiceResultSummaryData | null,
): ChoiceResultMotif {
  if (!d) return "generic";
  const timeDelta = d.timeDelta ?? 0;
  // Phase 4-D — 런 한정 효과가 있으면 그 쪽이 결과의 정체다 (시간/코인보다 우선).
  //   장비 확정 > 저주(양수 보정 없음) > 버프·보스 정보 > 은신 > 스킵.
  const { pos, neg } = runModCounts(d);
  if ((d.guaranteedDrop ?? 0) > 0) return "gear";
  if (neg > 0 && pos === 0) return "curse";
  if (pos > 0 || (d.bossDmgPct ?? 0) > 0) return "buff";
  if ((d.stealth ?? 0) > 0) return "stealth";
  if ((d.skipFloors ?? 0) > 0) return "skip";
  const gain = (d.xp ?? 0) + (d.coins ?? 0) + (d.heal ?? 0);
  if ((d.damage ?? 0) > 0 && gain === 0) return "damage";
  if ((d.heal ?? 0) > 0 && (d.xp ?? 0) === 0 && (d.coins ?? 0) === 0) return "heal";
  if ((d.coins ?? 0) > 0 && (d.xp ?? 0) === 0) return "coin";
  if (gain === 0 && timeDelta !== 0) return "time";
  return "generic";
}
