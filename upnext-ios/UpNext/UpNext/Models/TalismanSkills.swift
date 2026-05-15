//
//  TalismanSkills.swift
//  UpNext 로직 — Up Hero 사진 부적 passive 스킬 (8카테고리 × 2티어 = 16종).
//
//  웹 src/lib/talismanSkills.ts (388줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) "스킬" 단계 — UpHero.swift 의 TalismanModifiers 스텁을
//  여기 실제 구조체로 정의 (CombatSession.talismanMods 가 참조).
//
//  부적 +5 / +10 강화 시 category 기반 passive skill 부여. 각 skill 은 세션 시작
//  시 TalismanModifiers 에 효과를 누적 → combat/time/drop 각 지점에서 참조.
//

import Foundation

/// 부적 passive 합산 modifier 버킷. 웹 `TalismanModifiers`.
/// 기본 생성자 `TalismanModifiers()` = 웹 `emptyTalismanMods()` (배율은 1, 나머지 0).
struct TalismanModifiers: Equatable {
    var dodgeBonus: Double = 0          // 회피 추가 확률 (0-1)
    var enemyMissBonus: Double = 0      // 적 miss 추가 확률 (0-1)
    var critDmgBonus: Double = 0        // crit damage 배율 가산
    var coinMult: Double = 1            // coin 보상 곱
    var timeCostMult: Double = 1        // time 소모 곱
    var healEffectMult: Double = 1      // heal 효과 곱
    var hpRegenEvery2Rounds: Int = 0    // 2 round 마다 +N HP
    var extraDropChance: Double = 0     // 세션 중 1회 보너스 드롭 확률
    var legendDropBonus: Double = 0     // legend 드롭 확률 가산 (%p)
    var bossTimeRecover: Int = 0        // 보스 처치 시 time 회복
    var counterChance: Double = 0       // 피격 시 반격 확률
    var lowHpDmgBonus: Double = 0       // HP ≤ 20% 공격 배율 가산
    var agiRoundAccum: Int = 0          // round 당 agi 누적치
    var agiRoundCap: Int = 0            // agi 누적 상한
    var classSkillCdReduce: Int = 0     // class skill 쿨다운 감소
    var startXp: Int = 0                // 세션 시작 즉시 XP
    var startHpMult: Double = 1         // 세션 시작 HP 배율
    var startHpFlat: Int = 0            // 세션 시작 HP 고정 가산

    /// 부적 스킬 0개인 영웅용 기본값. 웹 `emptyTalismanMods()`.
    static let empty = TalismanModifiers()
}

/// 부적 스킬 1종. 웹 `TalismanSkill`.
struct TalismanSkill {
    let id: String
    let category: DungeonId
    let tier: Int                              // 5 | 10
    let name: String
    let description: String
    let apply: (inout TalismanModifiers) -> Void
}

enum TalismanSkills {

    // MARK: - 16 스킬 카탈로그

    static let fit5 = TalismanSkill(
        id: "fit_5", category: .fitness, tier: 5,
        name: "강단", description: "피격 시 15% 확률로 반격 +1 데미지",
        apply: { m in m.counterChance += 0.15 })

    static let fit10 = TalismanSkill(
        id: "fit_10", category: .fitness, tier: 10,
        name: "불굴", description: "HP 20% 이하 공격 +25%",
        apply: { m in m.lowHpDmgBonus += 0.25 })

    static let lrn5 = TalismanSkill(
        id: "lrn_5", category: .learning, tier: 5,
        name: "통찰", description: "세션 시작 시 +15 XP",
        apply: { m in m.startXp += 15 })

    static let lrn10 = TalismanSkill(
        id: "lrn_10", category: .learning, tier: 10,
        name: "현자", description: "치명타 피해 +15%",
        apply: { m in m.critDmgBonus += 0.15 })

    static let mnd5 = TalismanSkill(
        id: "mnd_5", category: .mindfulness, tier: 5,
        name: "평정", description: "클래스 스킬 쿨다운 -1",
        apply: { m in m.classSkillCdReduce += 1 })

    static let mnd10 = TalismanSkill(
        id: "mnd_10", category: .mindfulness, tier: 10,
        name: "무념", description: "round 당 agi +1 (최대 +8)",
        apply: { m in
            m.agiRoundAccum += 1
            m.agiRoundCap = max(m.agiRoundCap, 8)
        })

    static let ntr5 = TalismanSkill(
        id: "ntr_5", category: .nutrition, tier: 5,
        name: "포만", description: "세션 시작 HP +20",
        apply: { m in m.startHpFlat += 20 })

    static let ntr10 = TalismanSkill(
        id: "ntr_10", category: .nutrition, tier: 10,
        name: "대지의 축복", description: "2 round 마다 HP +1",
        apply: { m in m.hpRegenEvery2Rounds += 1 })

    static let soc5 = TalismanSkill(
        id: "soc_5", category: .social, tier: 5,
        name: "카리스마", description: "코인 보상 +10%",
        apply: { m in m.coinMult *= 1.1 })

    static let soc10 = TalismanSkill(
        id: "soc_10", category: .social, tier: 10,
        name: "군중의 총애", description: "세션 중 25% 확률로 랜덤 드롭 1회 추가",
        apply: { m in m.extraDropChance = max(m.extraDropChance, 0.25) })

    static let prd5 = TalismanSkill(
        id: "prd_5", category: .productivity, tier: 5,
        name: "절약", description: "시간 소모 -5%",
        apply: { m in m.timeCostMult *= 0.95 })

    static let prd10 = TalismanSkill(
        id: "prd_10", category: .productivity, tier: 10,
        name: "시간 도둑", description: "보스 처치 시 시간 +10",
        apply: { m in m.bossTimeRecover += 10 })

    static let wel5 = TalismanSkill(
        id: "wel_5", category: .wellness, tier: 5,
        name: "회복력", description: "회복 효과 +25%",
        apply: { m in m.healEffectMult *= 1.25 })

    static let wel10 = TalismanSkill(
        id: "wel_10", category: .wellness, tier: 10,
        name: "안식", description: "세션 시작 HP 110%",
        apply: { m in m.startHpMult *= 1.1 })

    static let trd5 = TalismanSkill(
        id: "trd_5", category: .trending, tier: 5,
        name: "변덕", description: "회피 +5%, 적 빗맞힘 +5%",
        apply: { m in
            m.dodgeBonus += 0.05
            m.enemyMissBonus += 0.05
        })

    static let trd10 = TalismanSkill(
        id: "trd_10", category: .trending, tier: 10,
        name: "유행", description: "레전드 드롭 확률 +2%p",
        apply: { m in m.legendDropBonus += 0.02 })

    /// id → TalismanSkill. 웹 `TALISMAN_SKILLS`.
    static let catalog: [String: TalismanSkill] = {
        let all = [fit5, fit10, lrn5, lrn10, mnd5, mnd10, ntr5, ntr10,
                   soc5, soc10, prd5, prd10, wel5, wel10, trd5, trd10]
        return Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
    }()

    /// 카테고리 → [tier5 id, tier10 id]. 웹 `CATEGORY_TO_SKILLS`.
    static let categoryToSkills: [DungeonId: [String]] = [
        .fitness: ["fit_5", "fit_10"],
        .learning: ["lrn_5", "lrn_10"],
        .mindfulness: ["mnd_5", "mnd_10"],
        .nutrition: ["ntr_5", "ntr_10"],
        .social: ["soc_5", "soc_10"],
        .productivity: ["prd_5", "prd_10"],
        .wellness: ["wel_5", "wel_10"],
        .trending: ["trd_5", "trd_10"],
    ]

    // MARK: - 헬퍼

    /// 부적 enhanceLevel 에 따라 부여될 skill id 목록. 웹 `computeTalismanSkillIds`.
    /// +5 이상 → tier5, +10 이상 → tier10 추가.
    static func computeTalismanSkillIds(category: DungeonId, enhanceLevel: Int) -> [String] {
        guard let pair = categoryToSkills[category] else { return [] }
        var ids: [String] = []
        if enhanceLevel >= 5 { ids.append(pair[0]) }
        if enhanceLevel >= 10 { ids.append(pair[1]) }
        return ids
    }

    /// 영웅의 장착 부적 전체에서 talisman skill 수집 → modifier 합산. 웹 `collectTalismanMods`.
    /// (apply 는 += / *= / max — 전부 교환법칙 성립 → 슬롯 순회 순서 무관.)
    static func collectTalismanMods(_ hero: Hero) -> TalismanModifiers {
        var mods = TalismanModifiers()
        for slot in EquipSlot.allCases {
            guard let eq = hero.equipped[slot],
                  let ids = eq.talismanSkills, !ids.isEmpty else { continue }
            for id in ids {
                catalog[id]?.apply(&mods)
            }
        }
        return mods
    }

    /// 세션 시작 시 즉시 적용되는 talisman 효과 — HP scale/flat, XP. 웹 `applyTalismanSkillStartEffects`.
    static func applyTalismanSkillStartEffects(
        _ session: inout CombatSession, mods: TalismanModifiers
    ) {
        if mods.startHpMult != 1 {
            session.hero.maxHp = UpHeroCombat.jsRound(Double(session.hero.maxHp) * mods.startHpMult)
            session.hero.hp = session.hero.maxHp
        }
        if mods.startHpFlat > 0 {
            session.hero.maxHp += mods.startHpFlat
            session.hero.hp += mods.startHpFlat
        }
        if mods.startXp > 0 {
            session.rewards.xp += mods.startXp
        }
    }
}
