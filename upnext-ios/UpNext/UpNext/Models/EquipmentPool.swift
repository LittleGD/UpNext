//
//  EquipmentPool.swift
//  UpNext 데이터 — Up Hero 장비 템플릿 + 드롭 생성.
//
//  웹 src/data/upHeroEquipment.ts (514줄) 포팅 (findTemplateByLegacyId 제외 —
//  legacy codex 마이그레이션 전용, 오케스트레이션 미사용).
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//
//  결정론: pickAffix/createEquipmentFromTemplate/rollEquipmentDrop/rollDropRarity
//   는 시드 가능한 rng() 사용 → 같은 seed 면 동일 출력 (id 의 timestamp 만 예외).
//

import Foundation

/// 장비 템플릿 — instance 생성 시 랜덤 ID 부여. 웹 `EquipmentTemplate`.
struct EquipmentTemplate: Equatable {
    let baseId: String
    let baseName: String
    let type: EquipSlot
    let category: DungeonId
    let iconName: String
    let statBoost: StatKey
    var flavor: String? = nil
    let rarityMult: [Rarity: Double]
}

enum EquipmentPool {

    /// 카테고리별 장비 테마 (3종 × 8). 웹 `TEMPLATES` / `EQUIPMENT_TEMPLATES`.
    static let templates: [EquipmentTemplate] = [
        // 운동 (fitness) — 친화: 무기
        EquipmentTemplate(baseId: "self_control_sword", baseName: "자기절제의 검", type: .weapon,
            category: .fitness, iconName: "Sword", statBoost: .str, flavor: "유혹을 베는 날카로움",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "persistence_shield", baseName: "꾸준함의 방패", type: .armor,
            category: .fitness, iconName: "Shield", statBoost: .vit, flavor: "매일의 반복을 막아내는 방패",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "endurance_bracer", baseName: "끈기의 완대", type: .accessory,
            category: .fitness, iconName: "Armor", statBoost: .str, flavor: "포기 직전의 한 번 더",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 학습 (learning) — 친화: 액세서리
        EquipmentTemplate(baseId: "wisdom_glasses", baseName: "지혜의 안경", type: .accessory,
            category: .learning, iconName: "EyeClosed", statBoost: .int, flavor: "숨은 진리를 드러내는 렌즈",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "memo_pen", baseName: "메모의 펜", type: .weapon,
            category: .learning, iconName: "Edit", statBoost: .int, flavor: "글자 한 줄이 적을 베는 도구",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "bookmark_charm", baseName: "책갈피의 부적", type: .talisman,
            category: .learning, iconName: "Note", statBoost: .dex, flavor: "잃어버린 페이지를 찾아주는",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 명상 (mindfulness) — 친화: 부적
        EquipmentTemplate(baseId: "serenity_charm", baseName: "평정의 부적", type: .talisman,
            category: .mindfulness, iconName: "Moon", statBoost: .agi, flavor: "숨 한 번으로 모든 공격을 흘려보냄",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "zen_beads", baseName: "선정의 염주", type: .accessory,
            category: .mindfulness, iconName: "Sun", statBoost: .vit, flavor: "마음이 구슬처럼 둥글어진다",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "silence_robe", baseName: "침묵의 로브", type: .armor,
            category: .mindfulness, iconName: "Hanger", statBoost: .int, flavor: "소리 없이 스며드는 천",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 식단 (nutrition) — 친화: 갑옷
        EquipmentTemplate(baseId: "grain_armor", baseName: "곡물의 갑옷", type: .armor,
            category: .nutrition, iconName: "Hanger", statBoost: .vit, flavor: "황금빛 알갱이가 상처를 막는다",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "moderation_spoon", baseName: "절제의 수저", type: .weapon,
            category: .nutrition, iconName: "Fork", statBoost: .dex, flavor: "정량을 재어 공격하는 도구",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "aroma_charm", baseName: "향기의 부적", type: .talisman,
            category: .nutrition, iconName: "Star", statBoost: .int, flavor: "향으로 적을 홀리는",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 소통 (social) — 친화: 액세서리
        EquipmentTemplate(baseId: "smile_ring", baseName: "미소의 반지", type: .accessory,
            category: .social, iconName: "Heart", statBoost: .agi, flavor: "적을 웃게 만드는 힘",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "dialogue_lute", baseName: "대화의 류트", type: .weapon,
            category: .social, iconName: "Music", statBoost: .int, flavor: "노래가 적을 설득한다",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "friendship_cape", baseName: "우정의 망토", type: .armor,
            category: .social, iconName: "Hanger", statBoost: .vit, flavor: "친구들의 온기로 보호받는",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 생산성 (productivity) — 친화: 액세서리
        EquipmentTemplate(baseId: "focus_clock", baseName: "집중의 시계", type: .accessory,
            category: .productivity, iconName: "Clock", statBoost: .dex, flavor: "시간이 한 방향으로 흐른다",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "efficiency_axe", baseName: "효율의 도끼", type: .weapon,
            category: .productivity, iconName: "Tool", statBoost: .str, flavor: "한 번에 한 번만 휘두른다",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "timeblock_charm", baseName: "타임블록 부적", type: .talisman,
            category: .productivity, iconName: "Grid", statBoost: .agi, flavor: "시간을 블록으로 묶는 힘",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 건강 (wellness) — 친화: 갑옷
        EquipmentTemplate(baseId: "recovery_robe", baseName: "회복의 로브", type: .armor,
            category: .wellness, iconName: "Heart", statBoost: .vit, flavor: "온기가 상처를 치유한다",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "deepsleep_charm", baseName: "숙면의 부적", type: .talisman,
            category: .wellness, iconName: "Moon", statBoost: .vit, flavor: "꿈이 현실을 치료한다",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "balance_bracer", baseName: "균형의 완대", type: .accessory,
            category: .wellness, iconName: "Scale", statBoost: .agi, flavor: "양 끝이 평형을 이룬다",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
        // 트렌딩 (trending) — 친화: 부적
        EquipmentTemplate(baseId: "mutation_charm", baseName: "변화의 부적", type: .talisman,
            category: .trending, iconName: "Flash", statBoost: .dex, flavor: "매번 다른 형태로 변한다",
            rarityMult: [.normal: 1, .rare: 1.6, .unique: 2.2, .legend: 3]),
        EquipmentTemplate(baseId: "viral_sword", baseName: "바이럴 검", type: .weapon,
            category: .trending, iconName: "Zap", statBoost: .agi, flavor: "퍼져나가는 한 방",
            rarityMult: [.normal: 1, .rare: 1.5, .unique: 2, .legend: 2.8]),
        EquipmentTemplate(baseId: "trend_ring", baseName: "트렌드의 반지", type: .accessory,
            category: .trending, iconName: "Reload", statBoost: .int, flavor: "어제와 오늘이 다른",
            rarityMult: [.normal: 1, .rare: 1.4, .unique: 1.9, .legend: 2.6]),
    ]

    /// 등급별 이름 접두사. 웹 `RARITY_PREFIX`.
    static let rarityPrefix: [Rarity: String] = [
        .normal: "", .rare: "빛나는 ", .unique: "전설적 ", .legend: "신성한 ",
    ]

    /// Equipment 의 baseName 복원. 웹 `getEquipmentBaseName`.
    /// baseId 역참조 우선(신규 드롭은 항상 보유) — name 문자열 파싱은 legacy 전용.
    /// name 은 "빛나는 자기절제의 검 of 힘, 민첩" 형태라 rarity 접두사와 affix 접미사를
    /// 모두 벗겨야 카탈로그 키(baseName)와 매칭된다.
    static func equipmentBaseName(_ eq: Equipment) -> String {
        if let baseId = eq.baseId,
           let t = templates.first(where: { $0.baseId == baseId }) {
            return t.baseName
        }
        var name = eq.name
        let prefix = rarityPrefix[eq.rarity] ?? ""
        if !prefix.isEmpty && name.hasPrefix(prefix) {
            name = String(name.dropFirst(prefix.count))
        }
        if let r = name.range(of: " of ") {
            name = String(name[..<r.lowerBound])
        }
        return name
    }

    /// 도감 표시용 — 저장된 식별자(현재 codex.equipment 는 한글 baseName, 미래 호환 위해
    /// baseId 도 함께 매칭)로 friendly 이름 반환. 웹 `equipmentNameById` 의 iOS 판.
    /// 다국어 사전이 아직 없어 한국어 baseName 으로 fallback (그게 templates 의 진실).
    static func displayName(forBaseIdOrName id: String, language: Language = .ko) -> String {
        // baseName(한국어 원문)을 카탈로그 키로 인앱 언어 해석. language 인자는 호환 위해
        // 유지하되 실제 해석은 AppConfig.currentLocale(인앱 언어 단일 출처)이 담당.
        // 1) baseId 매칭
        if let t = templates.first(where: { $0.baseId == id }) {
            return AppConfig.locRuntime(t.baseName)
        }
        // 2) 한글 baseName 매칭 (현재 codex.equipment 가 저장하는 값)
        if let t = templates.first(where: { $0.baseName == id }) {
            return AppConfig.locRuntime(t.baseName)
        }
        // 3) 매칭 실패 — 원본 그대로 (debug 시 식별 가능)
        return id
    }

    /// 도감 표시용 — 슬롯 타입 라벨 (무기/방어구/장신구/부적). 매칭 실패 시 nil.
    static func slotLabel(forBaseIdOrName id: String, language: Language = .ko) -> String? {
        let template = templates.first(where: { $0.baseId == id })
            ?? templates.first(where: { $0.baseName == id })
        guard let template else { return nil }
        switch template.type {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }

    /// 도감 표시용 — 템플릿의 iconName 반환 (PixelIcon 매핑 가능). 매칭 실패 시 nil.
    static func iconName(forBaseIdOrName id: String) -> String? {
        let template = templates.first(where: { $0.baseId == id })
            ?? templates.first(where: { $0.baseName == id })
        return template?.iconName
    }

    // MARK: - affix 시스템

    /// 등급별 affix 값. 웹 `AFFIX_VALUE`.
    static let affixValue: [Rarity: Int] = [.normal: 0, .rare: 2, .unique: 4, .legend: 6]

    /// affix stat 한글 라벨. 웹 `AFFIX_STAT_LABEL`.
    static let affixStatLabel: [StatKey: String] = [
        .str: "힘", .int: "지성", .vit: "체력", .dex: "손재주",
        .agi: "민첩", .crit: "치명", .slotBonus: "슬롯",
    ]

    /// affix 후보 stat 풀. 웹 `AFFIX_POOL`.
    static let affixPool: [StatKey] = [.str, .int, .vit, .dex, .agi, .crit]

    /// primary 와 겹치지 않는 affix stat 랜덤 선택. 웹 `pickAffix`.
    static func pickAffix<R: RandomSource>(exclude: Set<StatKey>, rng: inout R) -> StatKey? {
        let available = affixPool.filter { !exclude.contains($0) }
        if available.isEmpty { return nil }
        return available[rng.int(below: available.count)]
    }

    /// 템플릿 + 등급 → Equipment instance. 웹 `createEquipmentFromTemplate`.
    static func createEquipmentFromTemplate<R: RandomSource>(
        _ template: EquipmentTemplate, rarity: Rarity, dungeonFloor: Int, rng: inout R
    ) -> Equipment {
        let mult = template.rarityMult[rarity] ?? 1
        let baseStatValue = UpHeroCombat.jsRound((5 + Double(dungeonFloor) * 0.5) * mult)

        // unique +3% / legend +7% crit.
        let critBonus = rarity == .legend ? 7 : (rarity == .unique ? 3 : 0)
        // accessory/talisman + unique 이상 → slotBonus +1.
        let isSlotBearer =
            (template.type == .accessory || template.type == .talisman)
                && (rarity == .unique || rarity == .legend)

        var stats: [StatKey: Int] = [template.statBoost: baseStatValue]
        if critBonus > 0 { stats[.crit] = critBonus }
        if isSlotBearer { stats[.slotBonus] = 1 }

        // affix — rare+ 1개, legend 추가 1개. primary/crit/slotBonus exclude.
        let primaryKey = template.statBoost
        let affix1 = rarity == .normal
            ? nil
            : pickAffix(exclude: [primaryKey, .crit, .slotBonus], rng: &rng)
        var affixList: [StatKey] = []
        if let affix1 {
            stats[affix1] = (stats[affix1] ?? 0) + (affixValue[rarity] ?? 0)
            affixList.append(affix1)
        }
        if rarity == .legend {
            var exclude2: Set<StatKey> = [primaryKey, .crit, .slotBonus]
            if let affix1 { exclude2.insert(affix1) }
            if let affix2 = pickAffix(exclude: exclude2, rng: &rng) {
                stats[affix2] = (stats[affix2] ?? 0) + (affixValue[rarity] ?? 0)
                affixList.append(affix2)
            }
        }

        let affixSuffix = affixList.isEmpty
            ? ""
            : " of " + affixList.map { affixStatLabel[$0] ?? "" }.joined(separator: ", ")

        let strippedName = template.baseName.replacingOccurrences(of: " ", with: "")
        // UUID — 같은 ms 내 다중 드롭 시 id 충돌(`dedupeDrops`·prefix-기반 절반 키핑 등)
        // 회피. 이전 ms%1e5 + rng%1e3 조합은 충돌 가능성 실제 측정 사례 존재.
        let id = "eq_\(strippedName)_\(rarity.rawValue)_\(UUID().uuidString)"

        return Equipment(
            id: id,
            name: "\(rarityPrefix[rarity] ?? "")\(template.baseName)\(affixSuffix)",
            baseId: template.baseId,
            type: template.type,
            rarity: rarity,
            category: template.category,
            iconName: template.iconName,
            stats: stats,
            effects: nil,
            flavor: template.flavor,
            photoId: nil,
            enhanceLevel: nil,
            enhanceFailStreak: nil,
            affix: affixList.count == 1 ? affixList[0] : nil,
            affixes: affixList.count > 1 ? affixList : nil,
            talismanSkills: nil)
    }

    /// 던전 + floor 기반 드롭 생성. 웹 `rollEquipmentDrop`.
    static func rollEquipmentDrop<R: RandomSource>(
        dungeonId: DungeonId, floor: Int, rarity: Rarity = .normal,
        affinitySlot: EquipSlot? = nil, rng: inout R
    ) -> Equipment {
        let dungeonTemplates = templates.filter { $0.category == dungeonId }
        let pool = dungeonTemplates.isEmpty ? templates : dungeonTemplates
        // 친화 슬롯 70% 가중.
        let affinityPool = pool.filter { $0.type == affinitySlot }
        let chosenPool = (!affinityPool.isEmpty && rng.chance(0.7)) ? affinityPool : pool
        let template = chosenPool[rng.int(below: chosenPool.count)]
        return createEquipmentFromTemplate(template, rarity: rarity, dungeonFloor: floor, rng: &rng)
    }

    /// 랜덤 rarity 결정 — floor 에 따라 확률 변동. 웹 `rollDropRarity`.
    static func rollDropRarity<R: RandomSource>(
        floor: Int, legendDropBonus: Double = 0, flatten: Bool = false, rng: inout R
    ) -> Rarity {
        let r = rng.unit()
        if flatten {
            // "혼돈의 보물" — legend 25%, unique 25%, rare 25%, normal 25% (legend cap 0.30).
            let legendCut = min(0.3, 0.25 + legendDropBonus)
            if r < legendCut { return .legend }
            if r < 0.5 { return .unique }
            if r < 0.75 { return .rare }
            return .normal
        }
        let tier = min(floor / 10, 3)   // 0-3 tier
        let legendCut: Double =
            tier >= 3 ? 0.07 + legendDropBonus :   // F30+ 7%
            tier >= 2 ? 0.05 + legendDropBonus :   // F20-F29 5%
            0                                       // F0-F19 legend 없음
        if legendCut > 0 && r < legendCut { return .legend }
        if tier >= 1 && r < 0.12 { return .unique }
        if r < 0.05 { return .unique }
        if r < 0.3 { return .rare }
        return .normal
    }
}

extension Equipment {
    /// 인앱 언어로 현지화된 표시 이름 — 희귀도 접두사 + baseName(둘 다 카탈로그 경유).
    /// baseId 로 원본 baseName 을 복원해 재현지화한다. affix 는 stats 로 별도 표시되므로
    /// 이름에선 생략(저장된 name 의 한국어 접미사 " of …" 회피). 저장 name 은 불변.
    var localizedDisplayName: String {
        let prefix = AppConfig.locRuntime(EquipmentPool.rarityPrefix[rarity] ?? "")
        return prefix + EquipmentPool.displayName(forBaseIdOrName: baseId ?? name)
    }
}
