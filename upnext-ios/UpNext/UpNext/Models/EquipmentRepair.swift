//
//  EquipmentRepair.swift
//  UpNext 모델 — 장비/도감 수리 (웹 스키마 v7 마이그레이션의 iOS 판).
//
//  웹 src/lib/upHeroMigrations.ts 1:1 (Phase 6-E, Track E). iOS 는 버전 게이트가 없다 —
//  `UpHeroStore.loadPersisted()` 와 클라우드 채택(`adoptCloudState`) 이 매번 같은 규칙으로
//  돌린다. 전부 순수·멱등이라 재실행에 안전하다.
//
//  수리 항목:
//   - iconName: 템플릿(baseId → legacy id 파싱) 의 새 pixelarticons 이름으로, 템플릿이
//     없으면 `EquipmentPool.iconLegacyRemap` 폴백 (옛 이름 10개는 imageset 이 없어 `.card`
//     로 떨어졌다 — 피드백 9).
//   - baseId 시드 (레거시 저장본은 없었다).
//   - dropFloor 역추정: 주스탯에서 강화 성장분(`enhancePrimaryGrowthTotal`) 을 빼고 드롭
//     공식 `round((5 + floor × 0.5) × rarityMult)` 를 뒤집는다. 오차는 최대 1층.
//   - 부적(talisman) slotBonus = max(1, 기존) (피드백 21).
//   - 도감 equipment 키: 접두/강화/affix 가 붙은 이름과 legacy 인스턴스 id 를 템플릿
//     baseName 으로 (피드백 18).
//

import Foundation

enum EquipmentRepair {

    /// dropFloor 역추정 상한 — 그 위는 정보가 없는 손상본으로 본다. 웹 `DROP_FLOOR_ESTIMATE_MAX`.
    static let dropFloorEstimateMax = 60

    /// 주스탯에서 드롭 층을 역산한다. 주스탯이 없으면 nil. 웹 `estimateDropFloor`.
    ///   est = clamp(round(((stats[primary] - growth(enhanceLevel)) / rarityMult - 5) × 2), 0, 60)
    static func estimateDropFloor(_ eq: Equipment, template: EquipmentTemplate) -> Int? {
        guard let primary = eq.stats[template.statBoost] else { return nil }
        let mult = template.rarityMult[eq.rarity] ?? 1
        let base = Double(primary - UpHeroRules.enhancePrimaryGrowthTotal(level: eq.enhanceLevel ?? 0))
        let est = UpHeroCombat.jsRound((base / mult - 5) * 2)
        return min(dropFloorEstimateMax, max(0, est))
    }

    /// 장비 한 개 수리. 웹 `repairEquipmentItem`.
    static func repairItem(_ eq: Equipment) -> Equipment {
        var next = eq
        if next.photoId != nil {
            // 사진 부적: 템플릿이 없다. 부적 규칙(slotBonus)만 맞춘다.
            if next.type == .talisman {
                next.stats[.slotBonus] = max(1, next.stats[.slotBonus] ?? 0)
            }
            return next
        }
        let template = next.baseId.flatMap { EquipmentPool.findTemplate(baseId: $0) }
            ?? EquipmentPool.findTemplateByLegacyId(next.id)
        if let template {
            if next.baseId == nil { next.baseId = template.baseId }
            next.iconName = template.iconName
            if next.dropFloor == nil, let est = estimateDropFloor(next, template: template) {
                next.dropFloor = est
            }
        } else {
            next.iconName = EquipmentPool.iconLegacyRemap[next.iconName] ?? next.iconName
        }
        if next.type == .talisman {
            next.stats[.slotBonus] = max(1, next.stats[.slotBonus] ?? 0)
        }
        return next
    }

    /// 배열 수리. 웹 `repairEquipmentList`.
    static func repairList(_ list: [Equipment]) -> [Equipment] {
        list.map(repairItem)
    }

    /// hero.equipped 수리 — 있는 슬롯만. 웹 `repairEquippedMap`.
    static func repairEquipped(_ equipped: [EquipSlot: Equipment]) -> [EquipSlot: Equipment] {
        equipped.mapValues(repairItem)
    }

    private static let templateBaseNames = Set(EquipmentPool.templates.map(\.baseName))
    /// 접두 목록 (빈 문자열 제외). 긴 것 먼저.
    private static let prefixes = EquipmentPool.rarityPrefix.values
        .filter { !$0.isEmpty }
        .sorted { $0.count > $1.count }

    /// 도감 equipment 항목 하나를 템플릿 baseName 으로 정규화. 템플릿과 맞지 않으면 nil.
    /// 웹 `normalizeCodexEquipmentKey`.
    ///  - legacy `eq_...` 인스턴스 id → findTemplateByLegacyId
    ///  - 그 외: 등급 접두 → " +N" → " of ..." 순으로 벗긴다.
    static func normalizeCodexEquipmentKey(_ entry: String) -> String? {
        if entry.hasPrefix("eq_") {
            return EquipmentPool.findTemplateByLegacyId(entry)?.baseName
        }
        var name = entry
        for p in prefixes where name.hasPrefix(p) {
            name = String(name.dropFirst(p.count))
            break
        }
        name = UpHeroRules.stripEnhanceSuffix(name)
        if let r = name.range(of: " of ") {
            name = String(name[..<r.lowerBound])
        }
        name = name.trimmingCharacters(in: .whitespaces)
        return templateBaseNames.contains(name) ? name : nil
    }

    /// 도감 equipment 배열 수리 — 정규화 + 순서 보존 dedupe. 웹 `repairCodexEquipment`.
    static func repairCodexEquipment(_ entries: [String]) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        for entry in entries {
            guard let key = normalizeCodexEquipmentKey(entry), !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(key)
        }
        return out
    }

    /// 상태 전체 수리 — loadPersisted / adoptCloudState 공용.
    static func repairState(_ s: inout UpHeroState) {
        s.inventory = repairList(s.inventory)
        s.hero.equipped = repairEquipped(s.hero.equipped)
        s.overflowDrops = repairList(s.overflowDrops)
        s.codex.equipment = repairCodexEquipment(s.codex.equipment)
    }
}
