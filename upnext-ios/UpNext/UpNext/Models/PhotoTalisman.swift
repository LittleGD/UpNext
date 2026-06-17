//
//  PhotoTalisman.swift
//  UpNext — 사진 부적 변환 로직.
//
//  웹 src/lib/photoTalisman.ts 포팅. 사진을 코인 소모 + 랜덤 rarity roll 로 부적
//  Equipment 로 변환(bind), 이미 바인딩된 부적은 재의식(rebind)으로 +1 강화한다.
//  iOS 이전엔 고정 rare 부적만 생성하던 condensed 버전 → 풀 시스템으로 격상.
//

import Foundation

enum PhotoTalisman {
    /// 최초 바인딩 비용(코인).
    static let ritualCost = 80

    /// 재의식 비용 — 현재 강화 레벨 스케일. 80 × (1 + lv × 0.3). 웹 동치.
    static func rebindCost(currentLevel: Int) -> Int {
        let lv = max(0, currentLevel)
        return Int((Double(ritualCost) * (1 + Double(lv) * 0.3)).rounded())
    }

    static let maxEnhanceLevel = 10

    /// category → primary stat (드롭 장비와 동일 매핑).
    static let categoryStat: [DungeonId: StatKey] = [
        .fitness: .str, .learning: .int, .mindfulness: .int, .nutrition: .vit,
        .social: .agi, .productivity: .dex, .wellness: .vit, .trending: .dex,
    ]

    /// rarity 별 stat 배수 (base 4 × mult, 반올림).
    static let rarityStatMult: [Rarity: Double] = [
        .normal: 1, .rare: 1.5, .unique: 2.2, .legend: 3.2,
    ]

    /// rarity 별 이름 prefix(flavor 에 흡수).
    static let rarityPrefix: [Rarity: String] = [
        .normal: "회상의 ", .rare: "빛바랜 ", .unique: "운명의 ", .legend: "신성한 ",
    ]

    /// rarity 분포 — legend 3% / unique 12% / rare 35% / normal 50%.
    static func rollRarity<R: RandomSource>(_ rng: inout R) -> Rarity {
        let r = rng.unit()
        if r < 0.03 { return .legend }
        if r < 0.15 { return .unique }
        if r < 0.5 { return .rare }
        return .normal
    }

    /// 사진 → 부적 Equipment. (의식 결과)
    static func build(photo: PhotoMeta, rarity: Rarity) -> Equipment {
        let category = photo.category ?? .wellness
        let primary = categoryStat[category] ?? .vit
        let mult = rarityStatMult[rarity] ?? 1
        let statVal = Int((4.0 * mult).rounded())
        var stats: [StatKey: Int] = [primary: statVal]
        if rarity == .unique || rarity == .legend { stats[.slotBonus] = 1 }
        if rarity == .legend { stats[.crit] = 3 }

        let rawTitle: String = {
            if let t = photo.challengeTitle, !t.isEmpty { return t }
            if !photo.memo.isEmpty { return photo.memo }
            return "성장의 순간"
        }()
        let shortTitle = rawTitle.count > 5 ? String(rawTitle.prefix(5)) + "…" : rawTitle

        let dateLabel = photo.date
        let flavorBody = (photo.memo.isEmpty == false)
            ? String(photo.memo.prefix(60))
            : "\(dateLabel) — \(rawTitle)"
        let flavor = (rarityPrefix[rarity] ?? "") + flavorBody

        return Equipment(
            id: "photoTal_\(photo.id)",
            name: shortTitle, baseId: nil, type: .talisman,
            rarity: rarity, category: category, iconName: "Camera",
            stats: stats, effects: nil, flavor: flavor, photoId: photo.id,
            enhanceLevel: nil, enhanceFailStreak: nil,
            affix: nil, affixes: nil, talismanSkills: nil)
    }

    /// photoId 가 이미 부적으로 바인딩됐는지 — inventory + equipped 탐색.
    static func isBound(_ photoId: String, inventory: [Equipment],
                        equipped: [EquipSlot: Equipment]) -> Bool {
        findBound(photoId, inventory: inventory, equipped: equipped) != nil
    }

    enum BoundLocation { case inventory, equipped }

    /// 바인딩된 부적 + 위치 반환.
    static func findBound(_ photoId: String, inventory: [Equipment],
                          equipped: [EquipSlot: Equipment]) -> (item: Equipment, location: BoundLocation)? {
        if let inv = inventory.first(where: { $0.photoId == photoId }) {
            return (inv, .inventory)
        }
        for (_, eq) in equipped where eq.photoId == photoId {
            return (eq, .equipped)
        }
        return nil
    }

    /// 재의식 — 기존 부적 enhanceLevel +1. stat 짝수 레벨에만 +1, +5/+10 에 스킬 부여.
    static func rebuild(current: Equipment, newLevel: Int) -> Equipment {
        // primary stat 추정 — crit/slotBonus 제외 최대값 key.
        let primary = current.stats
            .filter { $0.key != .crit && $0.key != .slotBonus }
            .max { ($0.value) < ($1.value) }?.key
        let prevLevel = current.enhanceLevel ?? 0
        var stats = current.stats
        if let primary, newLevel > prevLevel {
            var bonus = 0
            for lv in (prevLevel + 1)...newLevel where lv % 2 == 0 { bonus += 1 }
            if bonus > 0 { stats[primary] = (stats[primary] ?? 0) + bonus }
        }
        // 이름 " +N" suffix 갱신.
        let baseName = current.name.replacingOccurrences(
            of: #"\s+\+\d+$"#, with: "", options: .regularExpression)
        let newName = newLevel >= 1 ? "\(baseName) +\(newLevel)" : baseName
        let skillIds = TalismanSkills.computeTalismanSkillIds(
            category: current.category, enhanceLevel: newLevel)
        var result = current
        result.name = newName
        result.enhanceLevel = newLevel
        result.stats = stats
        result.talismanSkills = skillIds.isEmpty ? nil : skillIds
        return result
    }
}
