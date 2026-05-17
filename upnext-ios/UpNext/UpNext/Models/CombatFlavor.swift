//
//  CombatFlavor.swift
//  UpNext 데이터 — Up Hero 전투 narrative flavor 풀.
//
//  웹 src/data/upHeroCombatFlavor.ts (199줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//

import Foundation

enum CombatFlavor {

    /// 영웅 일반 공격 동사. 웹 `HERO_HIT_VERBS`.
    static let heroHitVerbs = ["베었다", "찔렀다", "내리쳤다", "후려쳤다", "강타했다"]

    /// 영웅 크리 동사. 웹 `HERO_CRIT_VERBS`.
    static let heroCritVerbs = ["꿰뚫었다", "쪼개버렸다", "깊숙이 베었다", "가차없이 찍었다", "단숨에 갈랐다"]

    /// 영웅 미스 문구. 웹 `HERO_MISS_LINES`.
    static let heroMissLines = [
        "영웅의 검이 허공을 갈랐다.", "영웅의 일격이 빗나갔다.",
        "영웅이 발을 헛디뎠다.", "영웅의 공격이 바닥을 때렸다.",
    ]

    /// 영웅 회피 문구. 웹 `HERO_DODGE_LINES`.
    static let heroDodgeLines = [
        "영웅이 날렵하게 몸을 피했다.", "영웅이 공격을 굴러 피했다.",
        "영웅이 옆으로 빠져나갔다.", "영웅이 아슬아슬하게 피했다.",
    ]

    /// 몬스터 kind 별 공격 flavor. 웹 `MonsterAttackFlavor`.
    struct MonsterAttackFlavor {
        let hitVerbs: [String]
        let critVerbs: [String]
        let instruments: [String]
    }

    /// 몬스터 kind 별 공격 flavor. 웹 `MONSTER_ATTACK_FLAVOR`.
    static let monsterAttackFlavor: [MonsterKind: MonsterAttackFlavor] = [
        .beast: MonsterAttackFlavor(
            hitVerbs: ["할퀴었다", "물어뜯었다", "덮쳤다"],
            critVerbs: ["사나운 이빨로 파고들었다", "목덜미를 물어뜯었다"],
            instruments: ["발톱으로", "이빨로", "송곳니로"]),
        .goblin: MonsterAttackFlavor(
            hitVerbs: ["찔렀다", "베었다", "휘둘렀다"],
            critVerbs: ["급소를 노렸다", "교활하게 파고들었다"],
            instruments: ["녹슨 단검으로", "투박한 곤봉으로", "손톱으로"]),
        .spirit: MonsterAttackFlavor(
            hitVerbs: ["스쳤다", "얼어붙게 했다", "휘감았다"],
            critVerbs: ["영혼을 찢었다", "한기를 쏟아부었다"],
            instruments: ["차가운 손길로", "어둠의 기운으로", "속삭임으로"]),
        .construct: MonsterAttackFlavor(
            hitVerbs: ["내리쳤다", "짓눌렀다", "후려쳤다"],
            critVerbs: ["온 무게로 찍어눌렀다", "금속 팔로 강타했다"],
            instruments: ["쇠주먹으로", "톱니바퀴로", "돌 몸체로"]),
        .book: MonsterAttackFlavor(
            hitVerbs: ["페이지로 베었다", "글자를 쏘았다", "휘둘렀다"],
            critVerbs: ["저주받은 문장을 쏟아냈다", "금서의 기운을 휘감았다"],
            instruments: ["종이 모서리로", "쏟아진 잉크로", "낡은 책등으로"]),
        .creature: MonsterAttackFlavor(
            hitVerbs: ["덤볐다", "부딪쳤다", "휘말았다"],
            critVerbs: ["예상 못한 일격을 날렸다", "촉수로 온몸을 감았다"],
            instruments: ["촉수로", "몸통으로", "가시로"]),
        .large: MonsterAttackFlavor(
            hitVerbs: ["내리쳤다", "짓밟았다", "쓸어버렸다"],
            critVerbs: ["거대한 일격을 퍼부었다", "전력으로 짓눌렀다", "포효하며 강타했다"],
            instruments: ["거대한 팔로", "육중한 발로", "포효와 함께"]),
    ]

    /// 몬스터 kind 별 타격 부위. 웹 `MonsterBodyParts`.
    struct BodyParts {
        let normal: [String]
        let weak: [String]
    }

    /// 몬스터 kind 별 타격 부위. 웹 `MONSTER_BODY_PARTS`.
    static let monsterBodyParts: [MonsterKind: BodyParts] = [
        .beast: BodyParts(normal: ["옆구리", "등", "다리"], weak: ["목덜미", "급소"]),
        .goblin: BodyParts(normal: ["어깨", "복부", "팔"], weak: ["심장", "목"]),
        .spirit: BodyParts(normal: ["형체", "기운", "윤곽"], weak: ["핵", "중심"]),
        .construct: BodyParts(normal: ["팔", "다리", "몸통"], weak: ["연결부", "핵심 톱니"]),
        .book: BodyParts(normal: ["표지", "페이지", "책등"], weak: ["주문의 중심", "금서의 봉인"]),
        .creature: BodyParts(normal: ["몸통", "꼬리", "촉수"], weak: ["눈", "연약한 복부"]),
        .large: BodyParts(normal: ["다리", "팔", "옆구리"], weak: ["가슴", "얼굴"]),
    ]

    /// 몬스터 회피 문구 (영웅 공격을 몬스터가 피함). 웹 `MONSTER_DODGE_LINES`.
    static let monsterDodgeLines: [MonsterKind: [String]] = [
        .beast: ["짐승이 몸을 틀어 피했다.", "짐승이 재빠르게 물러섰다."],
        .goblin: ["고블린이 교활하게 몸을 숙였다.", "잽싸게 옆으로 빠졌다."],
        .spirit: ["영혼이 반투명해지며 지나갔다.", "형체가 잠시 흐려졌다."],
        .construct: ["둔한 몸통이 의외로 비켜섰다.", "톱니가 삐걱이며 회피했다."],
        .book: ["페이지가 바람처럼 흩어졌다.", "책이 펄럭이며 비켜갔다."],
        .creature: ["몸을 움츠려 피했다.", "촉수가 공격을 감쌌다."],
        .large: ["거대한 몸이 의외로 민첩하게 움직였다.", "육중한 발이 한 걸음 물러섰다."],
    ]

    /// 몬스터 미스 문구 (몬스터 공격이 허탕). 웹 `MONSTER_MISS_LINES`.
    static let monsterMissLines: [MonsterKind: [String]] = [
        .beast: ["짐승의 이빨이 허공에 부딪쳤다.", "짐승이 거리를 잘못 쟀다."],
        .goblin: ["고블린이 발을 헛디뎠다.", "단검이 빗나갔다."],
        .spirit: ["영혼의 손길이 실체를 잡지 못했다.", "한기가 흩어졌다."],
        .construct: ["무거운 팔이 둔하게 빗나갔다.", "톱니가 공중에서 돌았다."],
        .book: ["주문이 잘못 발음되었다.", "페이지가 엉뚱한 곳으로 날아갔다."],
        .creature: ["촉수가 얽혀 움직이지 못했다.", "몸통이 방향을 잃었다."],
        .large: ["거대한 팔이 둔하게 내려와 공중을 때렸다.", "포효만 남긴 채 일격이 빗나갔다."],
    ]
}
