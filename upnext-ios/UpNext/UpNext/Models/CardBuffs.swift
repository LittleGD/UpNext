//
//  CardBuffs.swift
//  UpNext 데이터 — Up Hero 카드 뒷면 버프 (Phase 4 슬라이스 21).
//
//  웹 src/data/cardBuffs.ts 1:1 포팅. 챌린지 카드를 던전 진입 버프로 해석한다.
//   - normal : 카테고리별 공통 템플릿 (8개)
//   - rare   : auto-gen (카테고리 주 스탯 + 특수효과)
//   - unique : auto-gen (주 스탯 + 친화/특수, id 뒷숫자 홀짝으로 결정론적 분기)
//   - legend : 23개 개별 커스텀 (legendBuffs)
//
//  getCardBuff 는 순수 함수 — RNG 없음. 카드 데이터에 buff 를 직접 넣지 않고
//  런타임 resolve 하여 카탈로그를 깔끔히 유지 (웹과 동일 전략).
//

import Foundation

enum CardBuffs {

    /// 친화 multiplier — 같은 카테고리 던전에서 1.3배. 웹 AFFINITY_MULTIPLIER.
    private static let affinityMultiplier = 1.3

    // MARK: - NORMAL — 카테고리별 공통 템플릿

    static let normalBuffs: [Category: CardBuff] = [
        .fitness: CardBuff(effects: [.stat(stats: [.str: 3])],
                           description: "STR +3"),
        .learning: CardBuff(effects: [.stat(stats: [.int: 3])],
                            description: "INT +3"),
        .mindfulness: CardBuff(effects: [.stat(stats: [.agi: 2, .vit: 2])],
                               description: "AGI +2 · VIT +2"),
        .nutrition: CardBuff(effects: [.stat(stats: [.vit: 4])],
                             description: "VIT +4"),
        .social: CardBuff(effects: [.stat(stats: [.agi: 3])],
                          description: "AGI +3"),
        .productivity: CardBuff(effects: [.stat(stats: [.dex: 3])],
                                description: "DEX +3"),
        .wellness: CardBuff(
            effects: [.stat(stats: [.vit: 2]), .special(type: .healStart, value: 20)],
            description: "VIT +2 · 시작 HP +20"),
        .trending: CardBuff(effects: [.stat(stats: [.crit: 2])],
                            description: "CRIT +2%"),
    ]

    // MARK: - LEGEND — 23개 개별 커스텀 (카드 이름의 의미를 살린 개성 버프)

    static let legendBuffs: [String: CardBuff] = [
        // 운동 3종 — 지구력, 정복, 유연함
        "fitness-008": CardBuff(
            effects: [.stat(stats: [.str: 6, .vit: 3]),
                      .affinity(category: .fitness, multiplier: affinityMultiplier)],
            description: "STR +6 · VIT +3 · 운동 던전 1.3배"),
        "fitness-023": CardBuff(
            effects: [.stat(stats: [.str: 7, .vit: 5]),
                      .affinity(category: .fitness, multiplier: affinityMultiplier)],
            description: "STR +7 · VIT +5 · 운동 던전 1.3배"),
        "fitness-033": CardBuff(
            effects: [.stat(stats: [.str: 5, .agi: 4, .crit: 2]),
                      .affinity(category: .fitness, multiplier: affinityMultiplier)],
            description: "STR +5 · AGI +4 · CRIT +2% · 운동 던전 1.3배"),
        // 식단 3종 — 정성, 회복, 준비
        "nutrition-006": CardBuff(
            effects: [.stat(stats: [.vit: 5, .crit: 2]),
                      .affinity(category: .nutrition, multiplier: affinityMultiplier)],
            description: "VIT +5 · CRIT +2% · 식단 던전 1.3배"),
        "nutrition-023": CardBuff(
            effects: [.stat(stats: [.vit: 5]), .special(type: .healStart, value: 25),
                      .affinity(category: .nutrition, multiplier: affinityMultiplier)],
            description: "VIT +5 · 시작 HP +25 · 식단 던전 1.3배"),
        "nutrition-033": CardBuff(
            effects: [.stat(stats: [.vit: 6]), .special(type: .coinBoost, value: 15),
                      .affinity(category: .nutrition, multiplier: affinityMultiplier)],
            description: "VIT +6 · 코인 +15% · 식단 던전 1.3배"),
        // 명상 3종 — 자연, 침묵, 단절
        "mindfulness-005": CardBuff(
            effects: [.stat(stats: [.agi: 4, .vit: 3]),
                      .affinity(category: .mindfulness, multiplier: affinityMultiplier)],
            description: "AGI +4 · VIT +3 · 명상 던전 1.3배"),
        "mindfulness-023": CardBuff(
            effects: [.stat(stats: [.agi: 5, .dex: 3]),
                      .special(type: .monsterFrequency, value: -12),
                      .affinity(category: .mindfulness, multiplier: affinityMultiplier)],
            description: "AGI +5 · DEX +3 · 몬스터 조우 -12% · 명상 던전 1.3배"),
        "mindfulness-033": CardBuff(
            effects: [.stat(stats: [.agi: 7, .int: 3]),
                      .affinity(category: .mindfulness, multiplier: affinityMultiplier)],
            description: "AGI +7 · INT +3 · 명상 던전 1.3배"),
        // 학습 3종 — 넓은 시야, 지혜, 사유
        "learning-006": CardBuff(
            effects: [.stat(stats: [.int: 5]), .special(type: .xpBoost, value: 17),
                      .affinity(category: .learning, multiplier: affinityMultiplier)],
            description: "INT +5 · XP +17% · 학습 던전 1.3배"),
        "learning-023": CardBuff(
            effects: [.stat(stats: [.int: 7]), .special(type: .xpBoost, value: 20),
                      .affinity(category: .learning, multiplier: affinityMultiplier)],
            description: "INT +7 · XP +20% · 학습 던전 1.3배"),
        "learning-033": CardBuff(
            effects: [.stat(stats: [.int: 8]), .special(type: .dropRate, value: 10),
                      .affinity(category: .learning, multiplier: affinityMultiplier)],
            description: "INT +8 · 드롭 +10% · 학습 던전 1.3배"),
        // 소통 3종 — 진심, 품, 연결
        "social-005": CardBuff(
            effects: [.stat(stats: [.agi: 4]), .special(type: .coinBoost, value: 14),
                      .affinity(category: .social, multiplier: affinityMultiplier)],
            description: "AGI +4 · 코인 +14% · 소통 던전 1.3배"),
        "social-023": CardBuff(
            effects: [.stat(stats: [.agi: 4, .vit: 3]),
                      .special(type: .coinBoost, value: 17),
                      .affinity(category: .social, multiplier: affinityMultiplier)],
            description: "AGI +4 · VIT +3 · 코인 +17% · 소통 던전 1.3배"),
        "social-033": CardBuff(
            effects: [.stat(stats: [.vit: 5, .agi: 4]),
                      .special(type: .healStart, value: 20),
                      .affinity(category: .social, multiplier: affinityMultiplier)],
            description: "VIT +5 · AGI +4 · 시작 HP +20 · 소통 던전 1.3배"),
        // 생산성 3종 — 집중, 돌파, 달성
        "productivity-005": CardBuff(
            effects: [.stat(stats: [.dex: 5]), .special(type: .xpBoost, value: 20),
                      .affinity(category: .productivity, multiplier: affinityMultiplier)],
            description: "DEX +5 · XP +20% · 생산성 던전 1.3배"),
        "productivity-023": CardBuff(
            effects: [.stat(stats: [.dex: 5, .str: 3, .crit: 3]),
                      .affinity(category: .productivity, multiplier: affinityMultiplier)],
            description: "DEX +5 · STR +3 · CRIT +3% · 생산성 던전 1.3배"),
        "productivity-033": CardBuff(
            effects: [.stat(stats: [.dex: 7, .str: 4]),
                      .special(type: .xpBoost, value: 25),
                      .affinity(category: .productivity, multiplier: affinityMultiplier)],
            description: "DEX +7 · STR +4 · XP +25% · 생산성 던전 1.3배"),
        // 건강 3종 — 회복, 밤, 자연
        "wellness-005": CardBuff(
            effects: [.stat(stats: [.vit: 5]), .special(type: .healStart, value: 30),
                      .affinity(category: .wellness, multiplier: affinityMultiplier)],
            description: "VIT +5 · 시작 HP +30 · 건강 던전 1.3배"),
        "wellness-023": CardBuff(
            effects: [.stat(stats: [.vit: 5]), .special(type: .healStart, value: 22),
                      .special(type: .monsterFrequency, value: -10),
                      .affinity(category: .wellness, multiplier: affinityMultiplier)],
            description: "VIT +5 · 시작 HP +22 · 몬스터 조우 -10% · 건강 던전 1.3배"),
        "wellness-033": CardBuff(
            effects: [.stat(stats: [.vit: 7, .agi: 3]),
                      .special(type: .healStart, value: 45),
                      .affinity(category: .wellness, multiplier: affinityMultiplier)],
            description: "VIT +7 · AGI +3 · 시작 HP +45 · 건강 던전 1.3배"),
        // 트렌딩 2종 — 올라운더, 절대집중
        "trending-008": CardBuff(
            effects: [.stat(stats: [.str: 3, .int: 3, .dex: 3, .vit: 3, .agi: 3]),
                      .affinity(category: .trending, multiplier: affinityMultiplier)],
            description: "모든 스탯 +3 · 트렌딩 던전 1.3배"),
        "trending-025": CardBuff(
            effects: [.stat(stats: [.dex: 6, .crit: 4]),
                      .special(type: .xpBoost, value: 20)],
            description: "DEX +6 · CRIT +4% · XP +20%"),
    ]

    // MARK: - RARE / UNIQUE auto-gen 테이블

    /// 카테고리 → 주 스탯. 웹 CATEGORY_PRIMARY_STAT.
    private static let primaryStat: [Category: StatKey] = [
        .fitness: .str, .learning: .int, .mindfulness: .agi, .nutrition: .vit,
        .social: .agi, .productivity: .dex, .wellness: .vit, .trending: .crit,
    ]

    /// 카테고리 → auto-gen 특수효과 (type, rare 값, unique 값). 웹 CATEGORY_SPECIAL.
    private static let categorySpecial: [Category: (type: SpecialEffect, rare: Int, unique: Int)] = [
        .fitness:      (.critBonus, 1, 3),
        .learning:     (.xpBoost, 7, 14),
        .mindfulness:  (.monsterFrequency, -7, -10),
        .nutrition:    (.healStart, 10, 20),
        .social:       (.coinBoost, 7, 14),
        .productivity: (.xpBoost, 10, 18),
        .wellness:     (.healStart, 15, 28),
        .trending:     (.critBonus, 2, 4),
    ]

    // MARK: - 메인 API

    /// 카드의 버프를 rarity 별 규칙으로 resolve. 웹 getCardBuff.
    static func getCardBuff(_ card: ChallengeCard) -> CardBuff {
        switch card.rarity {
        case .legend:
            return legendBuffs[card.id] ?? generateUniqueBuff(card)  // 안전 fallback
        case .unique:
            return generateUniqueBuff(card)
        case .rare:
            return generateRareBuff(card)
        case .normal:
            return normalBuffs[card.category]
                ?? CardBuff(effects: [], description: "")
        }
    }

    // MARK: - auto-gen

    private static func generateRareBuff(_ card: ChallengeCard) -> CardBuff {
        let primary = primaryStat[card.category] ?? .str
        let special = categorySpecial[card.category] ?? (.xpBoost, 0, 0)
        let isCrit = primary == .crit
        let statValue = isCrit ? 1 : 3   // rare: 스탯 3, crit 1% (웹 Phase 4b.1b)
        return CardBuff(
            effects: [
                .stat(stats: [primary: statValue]),
                .special(type: special.type, value: Double(special.rare)),
            ],
            description: "\(primary.label) +\(statValue)\(isCrit ? "%" : "")"
                + " · \(describeSpecial(special.type, special.rare))")
    }

    private static func generateUniqueBuff(_ card: ChallengeCard) -> CardBuff {
        let primary = primaryStat[card.category] ?? .str
        let special = categorySpecial[card.category] ?? (.xpBoost, 0, 0)
        let isCrit = primary == .crit
        let statValue = isCrit ? 3 : 5   // unique: 스탯 5, crit 3% (웹 Phase 4b.1b)
        // 친화 vs 특수효과 — 카드 id 뒷숫자 홀짝 기반 (결정론적). 웹 generateUniqueBuff.
        let useAffinity = idSuffix(card.id) % 2 == 0
        if useAffinity {
            return CardBuff(
                effects: [
                    .stat(stats: [primary: statValue]),
                    .affinity(category: card.category, multiplier: affinityMultiplier),
                ],
                description: "\(primary.label) +\(statValue)\(isCrit ? "%" : "")"
                    + " · \(categoryLabel(card.category)) 던전 1.3배")
        }
        return CardBuff(
            effects: [
                .stat(stats: [primary: statValue]),
                .special(type: special.type, value: Double(special.unique)),
            ],
            description: "\(primary.label) +\(statValue)\(isCrit ? "%" : "")"
                + " · \(describeSpecial(special.type, special.unique))")
    }

    // MARK: - 헬퍼

    /// id 의 뒷숫자 추출 (예: "fitness-012" → 12). 웹 parseIdSuffix.
    private static func idSuffix(_ id: String) -> Int {
        guard let last = id.split(separator: "-").last, let n = Int(last) else { return 0 }
        return n
    }

    /// 특수효과 한국어 요약. 웹 describeSpecial.
    private static func describeSpecial(_ type: SpecialEffect, _ value: Int) -> String {
        let sign = value >= 0 ? "+" : ""
        switch type {
        case .dropRate:         return "드롭 \(sign)\(value)%"
        case .monsterFrequency: return "몬스터 조우 \(sign)\(value)%"
        case .coinBoost:        return "코인 \(sign)\(value)%"
        case .xpBoost:          return "XP \(sign)\(value)%"
        case .critBonus:        return "CRIT \(sign)\(value)%"
        case .healStart:        return "시작 HP \(sign)\(value)"
        }
    }

    /// 카테고리 한국어 라벨 (친화 문구용 — Up Hero 라벨 셋, 메인 게임 Category.label
    /// 과 의도적으로 다름: mindfulness 명상 / trending 트렌딩).
    private static func categoryLabel(_ c: Category) -> String {
        switch c {
        case .fitness:      return "운동"
        case .learning:     return "학습"
        case .mindfulness:  return "명상"
        case .nutrition:    return "식단"
        case .social:       return "소통"
        case .productivity: return "생산성"
        case .wellness:     return "건강"
        case .trending:     return "트렌딩"
        }
    }
}
