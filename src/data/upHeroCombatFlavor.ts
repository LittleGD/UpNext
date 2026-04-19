/**
 * Up Hero — Phase 3: 전투 narrative flavor pool.
 *
 * 구조:
 *  - 영웅 공격 풀 — MonsterKind 무관 (Phase 5 에서 weaponKind 로 분기 예정)
 *  - 몬스터 공격 풀 — MonsterKind 별 (beast / goblin / spirit / construct / book / creature / large)
 *  - 타격 부위 풀 — 몬스터 kind 별 (일반 / 급소)
 *  - 회피 / 미스 풀 — 공격자·방어자 관점 분리
 *
 * 템플릿:
 *  - 영웅 공격: `{critPrefix}영웅이 {monster.name}의 {bodyPart}를 {verb}. −{dmg}`
 *  - 몬스터 공격: `{critPrefix}{monster.name}이(가) {instrument} 영웅을 {verb}. −{dmg}`
 *  - 회피/미스: 단일 문장 풀에서 pick
 *
 * 조사 `이(가)`: Phase 3 는 괄호 그대로 노출. Phase 5 에서 받침 체크 helper 추가 예정.
 */

import type { MonsterKind } from "@/types/uphero";

/** 영웅 일반 공격 동사 */
export const HERO_HIT_VERBS = [
  "베었다",
  "찔렀다",
  "내리쳤다",
  "후려쳤다",
  "강타했다",
] as const;

/** 영웅 크리 동사 — 더 강한 표현 */
export const HERO_CRIT_VERBS = [
  "꿰뚫었다",
  "쪼개버렸다",
  "깊숙이 베었다",
  "가차없이 찍었다",
  "단숨에 갈랐다",
] as const;

/** 영웅 미스 문구 — 공격자 관점 */
export const HERO_MISS_LINES = [
  "영웅의 검이 허공을 갈랐다.",
  "영웅의 일격이 빗나갔다.",
  "영웅이 발을 헛디뎠다.",
  "영웅의 공격이 바닥을 때렸다.",
] as const;

/** 영웅 회피 문구 — 방어자 관점 (몬스터가 공격했는데 영웅이 피함) */
export const HERO_DODGE_LINES = [
  "영웅이 날렵하게 몸을 피했다.",
  "영웅이 공격을 굴러 피했다.",
  "영웅이 옆으로 빠져나갔다.",
  "영웅이 아슬아슬하게 피했다.",
] as const;

/** 몬스터 kind 별 공격 flavor */
interface MonsterAttackFlavor {
  /** 일반 공격 동사 */
  hitVerbs: readonly string[];
  /** 크리 동사 */
  critVerbs: readonly string[];
  /** 공격 도구/신체 서술 */
  instruments: readonly string[];
}

export const MONSTER_ATTACK_FLAVOR: Record<MonsterKind, MonsterAttackFlavor> = {
  beast: {
    hitVerbs: ["할퀴었다", "물어뜯었다", "덮쳤다"],
    critVerbs: ["사나운 이빨로 파고들었다", "목덜미를 물어뜯었다"],
    instruments: ["발톱으로", "이빨로", "송곳니로"],
  },
  goblin: {
    hitVerbs: ["찔렀다", "베었다", "휘둘렀다"],
    critVerbs: ["급소를 노렸다", "교활하게 파고들었다"],
    instruments: ["녹슨 단검으로", "투박한 곤봉으로", "손톱으로"],
  },
  spirit: {
    hitVerbs: ["스쳤다", "얼어붙게 했다", "휘감았다"],
    critVerbs: ["영혼을 찢었다", "한기를 쏟아부었다"],
    instruments: ["차가운 손길로", "어둠의 기운으로", "속삭임으로"],
  },
  construct: {
    hitVerbs: ["내리쳤다", "짓눌렀다", "후려쳤다"],
    critVerbs: ["온 무게로 찍어눌렀다", "금속 팔로 강타했다"],
    instruments: ["쇠주먹으로", "톱니바퀴로", "돌 몸체로"],
  },
  book: {
    hitVerbs: ["페이지로 베었다", "글자를 쏘았다", "휘둘렀다"],
    critVerbs: ["저주받은 문장을 쏟아냈다", "금서의 기운을 휘감았다"],
    instruments: ["종이 모서리로", "쏟아진 잉크로", "낡은 책등으로"],
  },
  creature: {
    hitVerbs: ["덤볐다", "부딪쳤다", "휘말았다"],
    critVerbs: ["예상 못한 일격을 날렸다", "촉수로 온몸을 감았다"],
    instruments: ["촉수로", "몸통으로", "가시로"],
  },
  large: {
    hitVerbs: ["내리쳤다", "짓밟았다", "쓸어버렸다"],
    critVerbs: ["거대한 일격을 퍼부었다", "전력으로 짓눌렀다", "포효하며 강타했다"],
    instruments: ["거대한 팔로", "육중한 발로", "포효와 함께"],
  },
};

/** 몬스터 kind 별 타격 부위 — 영웅이 공격할 때의 target */
export const MONSTER_BODY_PARTS: Record<
  MonsterKind,
  { normal: readonly string[]; weak: readonly string[] }
> = {
  beast: {
    normal: ["옆구리", "등", "다리"],
    weak: ["목덜미", "급소"],
  },
  goblin: {
    normal: ["어깨", "복부", "팔"],
    weak: ["심장", "목"],
  },
  spirit: {
    normal: ["형체", "기운", "윤곽"],
    weak: ["핵", "중심"],
  },
  construct: {
    normal: ["팔", "다리", "몸통"],
    weak: ["연결부", "핵심 톱니"],
  },
  book: {
    normal: ["표지", "페이지", "책등"],
    weak: ["주문의 중심", "금서의 봉인"],
  },
  creature: {
    normal: ["몸통", "꼬리", "촉수"],
    weak: ["눈", "연약한 복부"],
  },
  large: {
    normal: ["다리", "팔", "옆구리"],
    weak: ["가슴", "얼굴"],
  },
};

/** 몬스터 회피 문구 — 방어자 관점 (영웅이 공격했는데 몬스터가 피함) */
export const MONSTER_DODGE_LINES: Record<MonsterKind, readonly string[]> = {
  beast: [
    "짐승이 몸을 틀어 피했다.",
    "짐승이 재빠르게 물러섰다.",
  ],
  goblin: [
    "고블린이 교활하게 몸을 숙였다.",
    "잽싸게 옆으로 빠졌다.",
  ],
  spirit: [
    "영혼이 반투명해지며 지나갔다.",
    "형체가 잠시 흐려졌다.",
  ],
  construct: [
    "둔한 몸통이 의외로 비켜섰다.",
    "톱니가 삐걱이며 회피했다.",
  ],
  book: [
    "페이지가 바람처럼 흩어졌다.",
    "책이 펄럭이며 비켜갔다.",
  ],
  creature: [
    "몸을 움츠려 피했다.",
    "촉수가 공격을 감쌌다.",
  ],
  large: [
    "거대한 몸이 의외로 민첩하게 움직였다.",
    "육중한 발이 한 걸음 물러섰다.",
  ],
};

/** 몬스터 미스 문구 — 공격자 관점 (몬스터의 공격이 허탕) */
export const MONSTER_MISS_LINES: Record<MonsterKind, readonly string[]> = {
  beast: [
    "짐승의 이빨이 허공에 부딪쳤다.",
    "짐승이 거리를 잘못 쟀다.",
  ],
  goblin: [
    "고블린이 발을 헛디뎠다.",
    "단검이 빗나갔다.",
  ],
  spirit: [
    "영혼의 손길이 실체를 잡지 못했다.",
    "한기가 흩어졌다.",
  ],
  construct: [
    "무거운 팔이 둔하게 빗나갔다.",
    "톱니가 공중에서 돌았다.",
  ],
  book: [
    "주문이 잘못 발음되었다.",
    "페이지가 엉뚱한 곳으로 날아갔다.",
  ],
  creature: [
    "촉수가 얽혀 움직이지 못했다.",
    "몸통이 방향을 잃었다.",
  ],
  large: [
    "거대한 팔이 둔하게 내려와 공중을 때렸다.",
    "포효만 남긴 채 일격이 빗나갔다.",
  ],
};
