import type { ChallengeCard, Rarity } from "@/types/card";
import type {
  MinigameTile,
  ActiveBuff,
  RoundConfig,
  SkillEffectId,
  CurseEffectId,
} from "@/types/minigame";
import { ALL_CARDS } from "@/data/cards";
import { drawSkillIds } from "@/data/minigame";

/**
 * 미니게임 보드 생성 — 순수 함수.
 *
 * 하이브리드 풀 전략:
 *   1) progress.unlockedCardIds에서 랜덤 샘플
 *   2) 언락 카드 부족하면 잠긴 카드(ALL_CARDS \ unlocked)에서 채움
 *   3) Rare Surge 활성 시 legend/unique 가중치 ×1.3
 *   4) 각 카드 2장씩 복제 (pairKey = card.id)
 *   5) 스킬 쌍 / 저주 쌍 주입
 *   6) 전체 셔플
 */

const CURSE_ID: CurseEffectId = "loseChanceAndStripBuff";

// rarity별 기본 가중치 — Rare Surge 없을 때
// 높은 등급이 너무 자주 나오지 않도록 normal 비중을 크게 늘림.
// 확률(등급이 pool에 골고루 있을 때): normal 69% / rare 19% / unique 7.7% / legend 3.8%.
const BASE_RARITY_WEIGHT: Record<Rarity, number> = {
  normal: 18,
  rare: 5,
  unique: 2,
  legend: 1,
};

const RARE_SURGE_MULTIPLIER = 1.3;

// Fisher-Yates shuffle
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 가중치 기반 샘플링 (replacement 없음) — N장을 cardPool에서 뽑음.
 */
function weightedSample(
  pool: ChallengeCard[],
  count: number,
  rareSurge: boolean,
  rng: () => number,
): ChallengeCard[] {
  const picked: ChallengeCard[] = [];
  const available = [...pool];
  const n = Math.min(count, available.length);

  for (let i = 0; i < n; i++) {
    const weights = available.map((c) => {
      let w = BASE_RARITY_WEIGHT[c.rarity];
      if (rareSurge && (c.rarity === "legend" || c.rarity === "unique")) {
        w *= RARE_SURGE_MULTIPLIER;
      }
      return w;
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = rng() * total;
    let idx = 0;
    for (let j = 0; j < available.length; j++) {
      roll -= weights[j];
      if (roll <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  return picked;
}

let tileIdCounter = 0;
function nextTileId(): string {
  tileIdCounter += 1;
  return `tile-${Date.now()}-${tileIdCounter}`;
}

export interface GenerateBoardArgs {
  config: RoundConfig;
  unlockedCardIds: string[];
  activeBuffs: ActiveBuff[];
  currentRound: 1 | 2 | 3;
  rng?: () => number;
}

export interface GenerateBoardResult {
  board: MinigameTile[];
  skillIdsInRound: SkillEffectId[];
}

export function generateBoard({
  config,
  unlockedCardIds,
  activeBuffs,
  currentRound,
  rng = Math.random,
}: GenerateBoardArgs): GenerateBoardResult {
  // Rare Surge 버프 체크 — scope=round이며 이번 라운드 대상
  const rareSurge = activeBuffs.some(
    (b) =>
      b.effectId === "rareSurge" &&
      !b.consumed &&
      (b.appliesInRound === currentRound || b.appliesInRound === "all"),
  );

  // 1) 카드 풀 구성 — 하이브리드
  const unlockedSet = new Set(unlockedCardIds);
  const unlockedPool = ALL_CARDS.filter((c) => unlockedSet.has(c.id));
  const lockedPool = ALL_CARDS.filter((c) => !unlockedSet.has(c.id));

  const needed = config.normalPairs;
  let chosen: ChallengeCard[] = [];

  if (unlockedPool.length >= needed) {
    chosen = weightedSample(unlockedPool, needed, rareSurge, rng);
  } else {
    // 언락된 카드 전부 + 잠긴 풀에서 부족분 채움
    chosen = [...unlockedPool];
    const shortfall = needed - chosen.length;
    const fillers = weightedSample(lockedPool, shortfall, rareSurge, rng);
    chosen = [...chosen, ...fillers];
  }

  // 2) 정상 카드 쌍 생성 — 카드마다 2장
  const normalTiles: MinigameTile[] = [];
  for (const card of chosen) {
    for (let i = 0; i < 2; i++) {
      normalTiles.push({
        tileId: nextTileId(),
        pairKey: card.id,
        kind: "challenge",
        isFaceUp: false,
        isMatched: false,
        card,
      });
    }
  }

  // 3) 스킬 쌍 주입 — skillPairs 만큼 서로 다른 효과 랜덤 뽑기
  const skillIds = drawSkillIds(config.skillPairs, rng);
  const skillTiles: MinigameTile[] = [];
  for (const skillId of skillIds) {
    for (let i = 0; i < 2; i++) {
      skillTiles.push({
        tileId: nextTileId(),
        pairKey: `skill-${skillId}`,
        kind: "skill",
        isFaceUp: false,
        isMatched: false,
        skillId,
      });
    }
  }

  // 4) 저주 쌍 주입 — MVP는 단일 효과
  const curseTiles: MinigameTile[] = [];
  for (let k = 0; k < config.cursePairs; k++) {
    for (let i = 0; i < 2; i++) {
      curseTiles.push({
        tileId: nextTileId(),
        pairKey: `curse-${k}`,
        kind: "curse",
        isFaceUp: false,
        isMatched: false,
        curseId: CURSE_ID,
      });
    }
  }

  // 5) 전체 셔플
  const allTiles = [...normalTiles, ...skillTiles, ...curseTiles];
  const board = shuffle(allTiles, rng);

  return { board, skillIdsInRound: skillIds };
}

/**
 * 그리드 상의 idx(row-major)에서 인접 8방향 타일 인덱스 반환 — Compass 스킬에서 사용.
 */
export function getAdjacentIndices(
  idx: number,
  rows: number,
  cols: number,
): number[] {
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      out.push(nr * cols + nc);
    }
  }
  return out;
}
