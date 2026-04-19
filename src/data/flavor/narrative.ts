/**
 * Up Hero — 분위기 narrative + 보물 설명 pool.
 * 던전별 분위기 텍스트는 매 floor 시작/중간에 랜덤 삽입된다.
 *
 * i18n (Phase 14):
 *   - NARRATIVE_POOL_IDS / TREASURE_IDS / REST_IDS 는 i18n key suffix 만 보관.
 *     실제 문장은 `uphero.narrative.<dungeonShort>.<idx>` / `uphero.treasure.<idx>` /
 *     `uphero.rest.<idx>` 로 4 언어 dict 에 저장. combat push 시 key 를 로그에
 *     동반 저장하고 CombatLog 가 현재 언어로 풀어 표시한다.
 *   - NARRATIVE_POOL / TREASURE_DESCRIPTIONS / REST_DESCRIPTIONS (한국어 배열) 은
 *     legacy fallback 으로 유지 — (1) i18n key 미존재 시 fallback, (2) 기존
 *     저장 데이터 (narrativeKey 가 아직 없는 legacy LogEntry) 그대로 사용.
 */

import type { DungeonId } from "@/types/uphero";

/* ───────── i18n key suffix (Phase 14 신규) ───────── */

/**
 * 던전별 narrative i18n key 배열.
 *   각 key 는 `uphero.narrative.<dungeonShort>.<idx>` 형식 — dict 에 저장됨.
 *   `fit/lrn/mnd/ntr/soc/prd/wel/trd` 는 i18n key 내 dungeon short code.
 */
export const NARRATIVE_POOL_IDS: Record<DungeonId, readonly string[]> = {
  fitness: [
    "uphero.narrative.fit.0",
    "uphero.narrative.fit.1",
    "uphero.narrative.fit.2",
    "uphero.narrative.fit.3",
    "uphero.narrative.fit.4",
    "uphero.narrative.fit.5",
    "uphero.narrative.fit.6",
    "uphero.narrative.fit.7",
    "uphero.narrative.fit.8",
    "uphero.narrative.fit.9",
  ],
  learning: [
    "uphero.narrative.lrn.0",
    "uphero.narrative.lrn.1",
    "uphero.narrative.lrn.2",
    "uphero.narrative.lrn.3",
    "uphero.narrative.lrn.4",
    "uphero.narrative.lrn.5",
    "uphero.narrative.lrn.6",
    "uphero.narrative.lrn.7",
    "uphero.narrative.lrn.8",
    "uphero.narrative.lrn.9",
  ],
  mindfulness: [
    "uphero.narrative.mnd.0",
    "uphero.narrative.mnd.1",
    "uphero.narrative.mnd.2",
    "uphero.narrative.mnd.3",
    "uphero.narrative.mnd.4",
    "uphero.narrative.mnd.5",
    "uphero.narrative.mnd.6",
    "uphero.narrative.mnd.7",
    "uphero.narrative.mnd.8",
    "uphero.narrative.mnd.9",
  ],
  nutrition: [
    "uphero.narrative.ntr.0",
    "uphero.narrative.ntr.1",
    "uphero.narrative.ntr.2",
    "uphero.narrative.ntr.3",
    "uphero.narrative.ntr.4",
    "uphero.narrative.ntr.5",
    "uphero.narrative.ntr.6",
    "uphero.narrative.ntr.7",
    "uphero.narrative.ntr.8",
    "uphero.narrative.ntr.9",
  ],
  social: [
    "uphero.narrative.soc.0",
    "uphero.narrative.soc.1",
    "uphero.narrative.soc.2",
    "uphero.narrative.soc.3",
    "uphero.narrative.soc.4",
    "uphero.narrative.soc.5",
    "uphero.narrative.soc.6",
    "uphero.narrative.soc.7",
    "uphero.narrative.soc.8",
    "uphero.narrative.soc.9",
  ],
  productivity: [
    "uphero.narrative.prd.0",
    "uphero.narrative.prd.1",
    "uphero.narrative.prd.2",
    "uphero.narrative.prd.3",
    "uphero.narrative.prd.4",
    "uphero.narrative.prd.5",
    "uphero.narrative.prd.6",
    "uphero.narrative.prd.7",
    "uphero.narrative.prd.8",
    "uphero.narrative.prd.9",
  ],
  wellness: [
    "uphero.narrative.wel.0",
    "uphero.narrative.wel.1",
    "uphero.narrative.wel.2",
    "uphero.narrative.wel.3",
    "uphero.narrative.wel.4",
    "uphero.narrative.wel.5",
    "uphero.narrative.wel.6",
    "uphero.narrative.wel.7",
    "uphero.narrative.wel.8",
    "uphero.narrative.wel.9",
  ],
  trending: [
    "uphero.narrative.trd.0",
    "uphero.narrative.trd.1",
    "uphero.narrative.trd.2",
    "uphero.narrative.trd.3",
    "uphero.narrative.trd.4",
    "uphero.narrative.trd.5",
    "uphero.narrative.trd.6",
    "uphero.narrative.trd.7",
    "uphero.narrative.trd.8",
    "uphero.narrative.trd.9",
  ],
} as const;

/** 보물 설명 i18n key 배열 — `uphero.treasure.<idx>`. */
export const TREASURE_IDS = [
  "uphero.treasure.0",
  "uphero.treasure.1",
  "uphero.treasure.2",
  "uphero.treasure.3",
  "uphero.treasure.4",
  "uphero.treasure.5",
] as const;

/** 휴식처 설명 i18n key 배열 — `uphero.rest.<idx>`. */
export const REST_IDS = [
  "uphero.rest.0",
  "uphero.rest.1",
  "uphero.rest.2",
  "uphero.rest.3",
  "uphero.rest.4",
  "uphero.rest.5",
  "uphero.rest.6",
  "uphero.rest.7",
] as const;

/* ───────── legacy fallback (한국어 원본 — i18n key 미존재/legacy save 용) ───────── */

/** 분위기 narrative — 던전별 10개씩. legacy fallback (i18n 키가 없을 때만 사용). */
export const NARRATIVE_POOL: Record<DungeonId, string[]> = {
  fitness: [
    "차가운 바람이 바위 사이를 휘감는다.",
    "발 아래 돌이 흩어진다.",
    "멀리서 늑대 울음이 들린다.",
    "가파른 절벽을 올라간다.",
    "눈보라가 시야를 가린다.",
    "산악 새가 울며 지나간다.",
    "오래된 사람의 흔적을 발견한다.",
    "얼어붙은 폭포 옆을 지난다.",
    "숨을 고르며 앞으로 나아간다.",
    "발자국 소리가 골짜기에 울린다.",
  ],
  learning: [
    "먼지 쌓인 책장이 끝없이 이어진다.",
    "촛불이 흔들리며 그림자를 만든다.",
    "고대 문서의 향이 코를 찌른다.",
    "조용한 속삭임이 들린다.",
    "책 한 권이 스스로 넘어간다.",
    "잉크 냄새가 진해진다.",
    "어둠 속에서 눈동자가 반짝인다.",
    "종이 부스러기가 발걸음마다 밟힌다.",
    "천장 높이 쌓인 책이 위태롭다.",
    "멀리서 종이 울린다.",
  ],
  mindfulness: [
    "고요가 귓속을 채운다.",
    "향 냄새가 부드럽게 스민다.",
    "호흡 소리만이 들린다.",
    "빛 한 줄기가 바닥을 비춘다.",
    "마음이 잔잔해진다.",
    "작은 종소리가 맑게 퍼진다.",
    "눈을 감았다 뜨자 주변이 바뀌었다.",
    "영혼의 기운이 느껴진다.",
    "무언가가 지켜보는 듯하다.",
    "공기가 무겁게 눌러온다.",
  ],
  nutrition: [
    "황금빛 곡물이 바람에 흔들린다.",
    "풍성한 과일 향이 퍼진다.",
    "꿀벌이 주위를 맴돈다.",
    "익은 토마토가 발에 채인다.",
    "곡식 창고의 문이 삐걱인다.",
    "허수아비가 우뚝 서 있다.",
    "태양이 따뜻하게 내리쬔다.",
    "채소밭 너머 무엇인가 움직인다.",
    "잘 익은 열매가 길을 막는다.",
    "농부의 흔적이 보인다.",
  ],
  social: [
    "시끌벅적한 소리가 들린다.",
    "노래가 멀리서 울려 퍼진다.",
    "상인의 호객 소리.",
    "군중이 영웅을 쳐다본다.",
    "누군가 말을 걸려 한다.",
    "술잔 부딪히는 소리.",
    "광대의 웃음이 공허하다.",
    "낯선 이의 시선이 느껴진다.",
    "축제의 장막이 보인다.",
    "음유시인의 이야기가 들린다.",
  ],
  productivity: [
    "톱니바퀴 소리가 일정하게 들린다.",
    "시계 초침이 멈췄다 다시 간다.",
    "기계 증기가 뿜어져 나온다.",
    "황동 파이프가 복잡하게 얽혔다.",
    "진자가 규칙적으로 흔들린다.",
    "공간이 뒤틀린 듯 느껴진다.",
    "메트로놈 소리가 심장과 맞춰진다.",
    "기계 팔이 반복 작동한다.",
    "시계탑 종이 울린다.",
    "계기판이 붉게 깜빡인다.",
  ],
  wellness: [
    "따뜻한 김이 피어오른다.",
    "온천 물소리가 평화롭다.",
    "치유의 기운이 감돈다.",
    "부드러운 풀 위를 걷는다.",
    "허브 향기가 짙어진다.",
    "작은 시냇물이 흐른다.",
    "수정같은 물이 고였다.",
    "무언가 졸음이 온다.",
    "온화한 빛이 감싼다.",
    "꽃잎이 천천히 떨어진다.",
  ],
  trending: [
    "공간이 뒤틀린다.",
    "색이 계속 바뀐다.",
    "이해할 수 없는 문양이 떠다닌다.",
    "감각이 왜곡된다.",
    "네온 불빛이 깜빡인다.",
    "음향이 왜곡되어 들린다.",
    "벽이 거울처럼 반사한다.",
    "픽셀이 흩어지며 재조합된다.",
    "이상한 노래가 머릿속에 남는다.",
    "중력이 살짝 약해진다.",
  ],
};

/** 보물 상자 설명 풀. legacy fallback. */
export const TREASURE_DESCRIPTIONS = [
  "오래된 나무 상자를 발견했다.",
  "반짝이는 동전이 흩어져 있다.",
  "작은 보석이 빛난다.",
  "버려진 배낭에서 금화가 떨어진다.",
  "이끼에 덮인 동전 더미.",
  "유물 조각이 눈에 띈다.",
];
