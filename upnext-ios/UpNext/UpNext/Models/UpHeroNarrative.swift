//
//  UpHeroNarrative.swift
//  UpNext 로직 — Up Hero 전투 narrative 생성기.
//
//  웹 src/lib/upHeroNarrative.ts (178줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//
//  outcome + damage → narrative 문장. pick 은 시드 가능한 RandomSource 사용.
//

import Foundation

/// i18n metadata 와 함께 묶인 narrative. 웹 `I18nNarrative`.
struct I18nNarrative: Equatable {
    let text: String                   // 한국어 legacy fallback
    var key: String? = nil             // i18n key
    var params: NarrativeParams? = nil  // t() 전달용 params
}

enum UpHeroNarrative {

    /// 배열에서 random 요소 pick. 웹 `pick` (seedable rng).
    static func pick<T, R: RandomSource>(_ pool: [T], rng: inout R) -> T {
        pool[rng.int(below: pool.count)]
    }

    /// 몬스터 이름/templateId params.
    private static func monsterParams(_ m: Monster) -> NarrativeParams {
        ["monster": .text(m.name), "monsterTemplateId": .text(m.templateId ?? "")]
    }

    /// 몬스터 params + damage.
    private static func monsterParamsD(_ m: Monster, _ damage: Int) -> NarrativeParams {
        var p = monsterParams(m)
        p["damage"] = .number(Double(damage))
        return p
    }

    /// 영웅 공격 narrative (i18n). 웹 `heroAttackNarrativeI18n`.
    static func heroAttackNarrativeI18n<R: RandomSource>(
        monster: Monster, outcome: CombatOutcome, damage: Int, rng: inout R
    ) -> I18nNarrative {
        switch outcome {
        case .miss:
            return I18nNarrative(text: pick(CombatFlavor.heroMissLines, rng: &rng),
                                 key: "uphero.combat.narrative.heroMiss")
        case .dodge:
            return I18nNarrative(
                text: pick(CombatFlavor.monsterDodgeLines[monster.kind]!, rng: &rng),
                key: "uphero.combat.narrative.monsterDodge",
                params: monsterParams(monster))
        case .crit:
            let part = pick(CombatFlavor.monsterBodyParts[monster.kind]!.weak, rng: &rng)
            let verb = pick(CombatFlavor.heroCritVerbs, rng: &rng)
            return I18nNarrative(
                text: "치명타! 영웅이 \(monster.name)의 \(part)를 \(verb). −\(damage)",
                key: "uphero.combat.narrative.heroCrit",
                params: monsterParamsD(monster, damage))
        case .hit:
            let part = pick(CombatFlavor.monsterBodyParts[monster.kind]!.normal, rng: &rng)
            let verb = pick(CombatFlavor.heroHitVerbs, rng: &rng)
            return I18nNarrative(
                text: "영웅이 \(monster.name)의 \(part)를 \(verb). −\(damage)",
                key: "uphero.combat.narrative.heroHit",
                params: monsterParamsD(monster, damage))
        }
    }

    /// 몬스터 공격 narrative (i18n). 웹 `monsterAttackNarrativeI18n`.
    static func monsterAttackNarrativeI18n<R: RandomSource>(
        monster: Monster, outcome: CombatOutcome, damage: Int, rng: inout R
    ) -> I18nNarrative {
        let flavor = CombatFlavor.monsterAttackFlavor[monster.kind]!
        switch outcome {
        case .miss:
            return I18nNarrative(
                text: pick(CombatFlavor.monsterMissLines[monster.kind]!, rng: &rng),
                key: "uphero.combat.narrative.monsterMiss",
                params: monsterParams(monster))
        case .dodge:
            return I18nNarrative(text: pick(CombatFlavor.heroDodgeLines, rng: &rng),
                                 key: "uphero.combat.narrative.heroDodge")
        case .crit:
            let verb = pick(flavor.critVerbs, rng: &rng)
            return I18nNarrative(
                text: "치명타! \(monster.name)이(가) \(verb). −\(damage)",
                key: "uphero.combat.narrative.enemyCrit",
                params: monsterParamsD(monster, damage))
        case .hit:
            let instrument = pick(flavor.instruments, rng: &rng)
            let verb = pick(flavor.hitVerbs, rng: &rng)
            return I18nNarrative(
                text: "\(monster.name)이(가) \(instrument) 영웅을 \(verb). −\(damage)",
                key: "uphero.combat.narrative.enemyHit",
                params: monsterParamsD(monster, damage))
        }
    }

    /// 영웅 공격 narrative (string). 웹 `heroAttackNarrative`.
    static func heroAttackNarrative<R: RandomSource>(
        monster: Monster, outcome: CombatOutcome, damage: Int, rng: inout R
    ) -> String {
        heroAttackNarrativeI18n(monster: monster, outcome: outcome, damage: damage, rng: &rng).text
    }

    /// 몬스터 공격 narrative (string). 웹 `monsterAttackNarrative`.
    static func monsterAttackNarrative<R: RandomSource>(
        monster: Monster, outcome: CombatOutcome, damage: Int, rng: inout R
    ) -> String {
        monsterAttackNarrativeI18n(monster: monster, outcome: outcome, damage: damage, rng: &rng).text
    }
}
