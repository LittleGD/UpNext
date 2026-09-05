//
//  ClassSkills.swift
//  UpNext 로직 — Up Hero 클래스 스킬트리 (8클래스 × 6노드 + novice 3종).
//
//  웹 src/lib/classSkills.ts 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 의 "스킬" 단계 산출물.
//
//  Phase 3-F (피드백 34b) — 트리가 선형 4칸에서 6노드 분기 트리로:
//    `[T1, T2a, T2b, T3a, T3b, T4]`. 기존 T2/T3 16개는 branch .a 로 편입(id·수치 불변),
//    신규 .b 16개는 기존 CombatSession 프리미티브만 쓴다. requires (any-of):
//    T2=[T1], T3=[T2a,T2b], T4=[T3a,T3b]. 학습 규칙은 learnStatus 한 곳
//    (웹 getSkillLearnStatus 와 검사 순서 동일 — 동치 검증 섹션 H).
//
//  설계:
//   - ClassSkill 은 shouldFire/apply 클로저를 담는 값 타입.
//   - apply 는 CombatSession 을 변형 → Swift 에서 (inout CombatSession, Monster?) 클로저.
//   - 스킬은 RNG 미사용 — 전부 결정론적 (getIntMult·Math.round 만). 함수 단위 검증 가능.
//   - 발동 로직: canFireSkill(자원/쿨다운/해금) → fireSkill → maybeFireSkill(auto).
//
//  Date.now() 타임스탬프는 비결정론 — 검증 시 timestamp 필드는 비교 대상에서 제외.
//

import Foundation

/// 클래스 스킬 1종. 웹 `ClassSkill` interface.
struct ClassSkill {
    let id: String
    let skillClass: SkillLogClass   // 8 class + novice (웹 `class: ClassType | "novice"`)
    let tier: Int                   // 0(novice) ~ 4
    let name: String
    let description: String
    let resourceCost: Int           // 발동 시 소모 클래스 자원 (0 = 무료)
    let cooldown: Int               // 발동 후 쿨다운 (round)
    let requiredLevel: Int          // 해금 최소 레벨
    let pointCost: Int              // 해금 스킬 포인트 (T1=0, T2/T3=1, T4=2)
    /// Phase 3-F — 분기. T2/T3 만 a|b (T1/T4/novice 는 nil). 같은 class·tier 의 다른
    /// branch 가 형제이며 둘 중 하나만 배운다. 웹 `branch?: "a" | "b"`.
    /// 기본값이 있어야 기존 35개 memberwise 리터럴이 그대로 컴파일된다 — pointCost 뒤,
    /// 클로저 앞에 둘 것.
    var branch: SkillBranch? = nil
    /// Phase 3-F — 선행 스킬 id (any-of: 하나라도 배웠으면 충족). T1 은 []. 웹 `requires?`.
    var requires: [String] = []
    let shouldFire: (CombatSession, Monster?) -> Bool   // auto 발동 조건
    let apply: (inout CombatSession, Monster?) -> Void  // 효과 적용 + 로그 push
}

/// canFireSkill 차단 사유. 웹 `"locked" | "cooldown" | "resource"`.
enum SkillBlockReason: String {
    case locked, cooldown, resource
}

/// Phase 3-F — T2/T3 분기. 웹 `"a" | "b"`.
enum SkillBranch: String {
    case a, b
}

/// Phase 3-F — 학습 판정. 웹 `SkillLearnStatus`.
///   ok / learned(이미 배움) / wrongClass(전직 전 또는 다른 class) / needLevel /
///   needPrereq(선행 any-of 미충족) / branchTaken(같은 tier 형제를 이미 배움) / needPoints.
enum SkillLearnStatus: Equatable {
    case ok, learned, wrongClass, needLevel, needPrereq, branchTaken, needPoints

    /// 웹 문자열 union 과 같은 이름 — 동치 검증 드라이버가 출력한다.
    var webName: String {
        switch self {
        case .ok:          return "ok"
        case .learned:     return "learned"
        case .wrongClass:  return "class"
        case .needLevel:   return "level"
        case .needPrereq:  return "requires"
        case .branchTaken: return "branch"
        case .needPoints:  return "points"
        }
    }
}

enum ClassSkills {

    // MARK: - 헬퍼

    /// 웹 `Date.now()` — ms epoch. 로그 timestamp 용 (비결정론 — 검증서 제외).
    static func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

    /// INT 스케일링 — 스킬 데미지/회복량 배율. 웹 `getIntMult` — `1 + int×0.01`.
    static func getIntMult(_ s: CombatSession) -> Double {
        let intStat = UpHeroRules.computeEffectiveStats(s.hero).int
        return 1.0 + Double(intStat) * 0.01
    }

    /// skill 로그 entry push. 웹 `pushSkillLog` (narrativeKey 는 skillId 기반 auto-derive).
    static func pushSkillLog(
        _ s: inout CombatSession, _ classType: SkillLogClass,
        _ skillName: String, _ narrative: String,
        skillId: String? = nil, narrativeParams: NarrativeParams? = nil
    ) {
        s.log.append(.skill(
            classType: classType,
            skillId: skillId,
            skillName: skillName,
            narrative: narrative,
            narrativeKey: skillId.map { "uphero.skill.\($0).narrative" },
            narrativeParams: narrativeParams,
            timestamp: now()))
    }

    /// 스킬 직격 combat 로그 push 헬퍼 — 데미지 스킬 8종 공통 형식.
    private static func pushSkillHit(
        _ s: inout CombatSession, _ m: Monster, damage: Int,
        narrative: String, skillId: String
    ) {
        s.log.append(.combat(
            attacker: .hero, damage: damage, outcome: .crit,
            narrative: narrative,
            narrativeKey: "uphero.combat.narrative.skillHitMonster.\(skillId)",
            narrativeParams: [
                "monster": .text(m.name),
                "monsterTemplateId": .text(m.templateId ?? ""),
                "damage": .number(Double(damage)),
            ],
            timestamp: now()))
    }

    /// 몬스터 존재 + 생존 여부 — 웹 `!!m && m.hp > 0`.
    private static func alive(_ m: Monster?) -> Bool { (m?.hp ?? 0) > 0 }

    // MARK: - warrior (분노)

    static let warriorT1 = ClassSkill(
        id: "warrior_smash_t1", skillClass: .warrior, tier: 1,
        name: "강타", description: "다음 공격 피해 2배.",
        resourceCost: 30, cooldown: 4, requiredLevel: 30, pointCost: 0,
        shouldFire: { _, m in alive(m) },
        apply: { s, _ in
            s.nextHeroDamageMult = 2
            pushSkillLog(&s, .warrior, "강타",
                "영웅이 강타를 준비한다: 다음 공격 2배", skillId: "warrior_smash_t1")
        })

    static let warriorT2 = ClassSkill(
        id: "warrior_berserk_t2", skillClass: .warrior, tier: 2,
        name: "광폭화", description: "3 round 동안 공격 +30%.",
        resourceCost: 50, cooldown: 6, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["warrior_smash_t1"],
        shouldFire: { s, m in alive(m) && s.heroAtkBonusRounds == nil },
        apply: { s, _ in
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 3, mult: 1.3)
            pushSkillLog(&s, .warrior, "광폭화",
                "영웅이 광폭화: 3 round 공격 +30%", skillId: "warrior_berserk_t2")
        })

    static let warriorT2b = ClassSkill(
        id: "warrior_ironwall_t2", skillClass: .warrior, tier: 2,
        name: "철벽", description: "3 round 동안 받는 피해 -40%.",
        resourceCost: 45, cooldown: 6, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["warrior_smash_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.6 && s.heroDmgReductionRounds == nil },
        apply: { s, _ in
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 3, reduction: 0.4)
            pushSkillLog(&s, .warrior, "철벽",
                "영웅이 철벽처럼 버틴다. 3 round 피해 -40%", skillId: "warrior_ironwall_t2")
        })

    static let warriorT3 = ClassSkill(
        id: "warrior_crush_t3", skillClass: .warrior, tier: 3,
        name: "분쇄", description: "적 현재 HP 20% 즉시 피해.",
        resourceCost: 60, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["warrior_berserk_t2", "warrior_ironwall_t2"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.2 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "분쇄가 \(m.name) 을 강타한다, \(dmg) 피해",
                skillId: "warrior_crush_t3")
            pushSkillLog(&s, .warrior, "분쇄", "적 HP 20% 감소 (\(dmg))",
                skillId: "warrior_crush_t3", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let warriorT3b = ClassSkill(
        id: "warrior_warcry_t3", skillClass: .warrior, tier: 3,
        name: "전쟁의 함성", description: "적 1 round 봉인 + 다음 2 round 공격 +40%.",
        resourceCost: 60, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["warrior_berserk_t2", "warrior_ironwall_t2"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 1
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 2, mult: 1.4)
            pushSkillLog(&s, .warrior, "전쟁의 함성",
                "전쟁의 함성이 울린다. 적 1 round 봉인, 2 round 공격 +40%", skillId: "warrior_warcry_t3")
        })

    static let warriorT4 = ClassSkill(
        id: "warrior_rage_burst_t4", skillClass: .warrior, tier: 4,
        name: "분노 폭발", description: "즉시 80 고정 피해 + 다음 3 round 공격 +50%.",
        resourceCost: 100, cooldown: 10, requiredLevel: 45, pointCost: 2,
        requires: ["warrior_crush_t3", "warrior_warcry_t3"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(80 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "영웅이 분노를 폭발시킨다, \(m.name) 에 \(dmg) 고정 피해",
                skillId: "warrior_rage_burst_t4")
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 3, mult: 1.5)
            pushSkillLog(&s, .warrior, "분노 폭발",
                "\(dmg) 피해 + 다음 3 round 공격 +50%",
                skillId: "warrior_rage_burst_t4", narrativeParams: ["damage": .number(Double(dmg))])
        })

    // MARK: - mage (마나)

    static let mageT1 = ClassSkill(
        id: "mage_lightning_t1", skillClass: .mage, tier: 1,
        name: "지식의 번개", description: "적 현재 HP 25% 즉시 피해.",
        resourceCost: 25, cooldown: 6, requiredLevel: 30, pointCost: 0,
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.25 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "영웅의 번개가 \(m.name) 을 꿰뚫는다, \(dmg) 피해",
                skillId: "mage_lightning_t1")
            pushSkillLog(&s, .mage, "지식의 번개", "적 HP 25% 감소 (\(dmg))",
                skillId: "mage_lightning_t1", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let mageT2 = ClassSkill(
        id: "mage_freeze_t2", skillClass: .mage, tier: 2,
        name: "빙결", description: "적 1 round 행동 봉인.",
        resourceCost: 40, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["mage_lightning_t1"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 1
            pushSkillLog(&s, .mage, "빙결",
                "적이 얼어붙었다: 1 round 공격 불가", skillId: "mage_freeze_t2")
        })

    static let mageT2b = ClassSkill(
        id: "mage_manashield_t2", skillClass: .mage, tier: 2,
        name: "마나 방패", description: "2 round 동안 받는 피해 -50%.",
        resourceCost: 40, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["mage_lightning_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 && s.heroDmgReductionRounds == nil },
        apply: { s, _ in
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 2, reduction: 0.5)
            pushSkillLog(&s, .mage, "마나 방패",
                "마나 방패가 펼쳐진다. 2 round 피해 -50%", skillId: "mage_manashield_t2")
        })

    static let mageT3 = ClassSkill(
        id: "mage_fireball_t3", skillClass: .mage, tier: 3,
        name: "화염구", description: "즉시 50 고정 피해.",
        resourceCost: 55, cooldown: 5, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["mage_freeze_t2", "mage_manashield_t2"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(50 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "불꽃이 \(m.name) 을 휩싼다, \(dmg) 피해",
                skillId: "mage_fireball_t3")
            pushSkillLog(&s, .mage, "화염구", "\(dmg) 고정 피해",
                skillId: "mage_fireball_t3", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let mageT3b = ClassSkill(
        id: "mage_chain_t3", skillClass: .mage, tier: 3,
        name: "연쇄 번개", description: "적 현재 HP 30% 피해 + 1 round 봉인.",
        resourceCost: 60, cooldown: 7, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["mage_freeze_t2", "mage_manashield_t2"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.3 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "연쇄 번개가 \(m.name) 을 관통한다. \(dmg) 피해",
                skillId: "mage_chain_t3")
            if s.enemyStunnedRounds == nil { s.enemyStunnedRounds = 1 }   // 웹 `if (!s.enemyStunnedRounds)`
            pushSkillLog(&s, .mage, "연쇄 번개", "연쇄 번개가 적을 관통한다 (\(dmg)), 1 round 봉인",
                skillId: "mage_chain_t3", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let mageT4 = ClassSkill(
        id: "mage_meteor_t4", skillClass: .mage, tier: 4,
        name: "메테오", description: "적 현재 HP 40% 피해.",
        resourceCost: 90, cooldown: 12, requiredLevel: 45, pointCost: 2,
        requires: ["mage_fireball_t3", "mage_chain_t3"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.4 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "메테오가 \(m.name) 을 내리친다, \(dmg) 피해",
                skillId: "mage_meteor_t4")
            pushSkillLog(&s, .mage, "메테오", "적 HP 40% 감소 (\(dmg))",
                skillId: "mage_meteor_t4", narrativeParams: ["damage": .number(Double(dmg))])
        })

    // MARK: - monk (기)

    static let monkT1 = ClassSkill(
        id: "monk_zen_t1", skillClass: .monk, tier: 1,
        name: "선정", description: "2 round 회피 100%.",
        resourceCost: 40, cooldown: 8, requiredLevel: 30, pointCost: 0,
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 },
        apply: { s, _ in
            s.forcedDodgeRounds = 2
            pushSkillLog(&s, .monk, "선정",
                "영웅이 선정에 든다: 2 round 회피 100%", skillId: "monk_zen_t1")
        })

    static let monkT2 = ClassSkill(
        id: "monk_flash_t2", skillClass: .monk, tier: 2,
        name: "일섬", description: "적 현재 HP 30% 즉시 피해.",
        resourceCost: 60, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["monk_zen_t1"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.3 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "일섬: \(m.name) 을 베어낸다, \(dmg) 피해",
                skillId: "monk_flash_t2")
            pushSkillLog(&s, .monk, "일섬", "적 HP 30% 감소 (\(dmg))",
                skillId: "monk_flash_t2", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let monkT2b = ClassSkill(
        id: "monk_ironbody_t2", skillClass: .monk, tier: 2,
        name: "철포삼", description: "3 round 동안 받는 피해 -35%.",
        resourceCost: 50, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["monk_zen_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.6 && s.heroDmgReductionRounds == nil },
        apply: { s, _ in
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 3, reduction: 0.35)
            pushSkillLog(&s, .monk, "철포삼",
                "영웅의 몸이 강철이 된다. 3 round 피해 -35%", skillId: "monk_ironbody_t2")
        })

    static let monkT3 = ClassSkill(
        id: "monk_taiji_t3", skillClass: .monk, tier: 3,
        name: "태극", description: "HP +50 회복 + 다음 2 round 공격 +20%.",
        resourceCost: 70, cooldown: 6, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["monk_flash_t2", "monk_ironbody_t2"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.7 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(50 * getIntMult(s))
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 2, mult: 1.2)
            pushSkillLog(&s, .monk, "태극", "HP +\(heal) · 2 round 공격 +20%",
                skillId: "monk_taiji_t3", narrativeParams: ["heal": .number(Double(heal))])
        })

    static let monkT3b = ClassSkill(
        id: "monk_chainstrike_t3", skillClass: .monk, tier: 3,
        name: "연환격", description: "다음 공격 피해 2.5배.",
        resourceCost: 65, cooldown: 6, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["monk_flash_t2", "monk_ironbody_t2"],
        shouldFire: { s, m in alive(m) && s.nextHeroDamageMult == nil },
        apply: { s, _ in
            s.nextHeroDamageMult = 2.5
            pushSkillLog(&s, .monk, "연환격",
                "연환격을 준비한다. 다음 공격 2.5배", skillId: "monk_chainstrike_t3")
        })

    static let monkT4 = ClassSkill(
        id: "monk_lotus_t4", skillClass: .monk, tier: 4,
        name: "연화", description: "3 round 무적.",
        resourceCost: 90, cooldown: 14, requiredLevel: 45, pointCost: 2,
        requires: ["monk_taiji_t3", "monk_chainstrike_t3"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.3 },
        apply: { s, _ in
            s.heroInvulnerableRounds = 3
            pushSkillLog(&s, .monk, "연화",
                "연꽃이 영웅을 감싼다: 3 round 무적", skillId: "monk_lotus_t4")
        })

    // MARK: - druid (자연력)

    static let druidT1 = ClassSkill(
        id: "druid_ward_t1", skillClass: .druid, tier: 1,
        name: "치유 결계", description: "HP +40 회복.",
        resourceCost: 30, cooldown: 5, requiredLevel: 30, pointCost: 0,
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.6 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(40 * getIntMult(s))
            let healed = min(s.hero.maxHp - s.hero.hp, heal)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            pushSkillLog(&s, .druid, "치유 결계", "HP +\(healed)",
                skillId: "druid_ward_t1", narrativeParams: ["heal": .number(Double(healed))])
        })

    static let druidT2 = ClassSkill(
        id: "druid_root_t2", skillClass: .druid, tier: 2,
        name: "뿌리옥죄기", description: "적 2 round 행동 봉인.",
        resourceCost: 50, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["druid_ward_t1"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 2
            pushSkillLog(&s, .druid, "뿌리옥죄기",
                "뿌리가 적을 잡아챈다: 2 round 봉인", skillId: "druid_root_t2")
        })

    static let druidT2b = ClassSkill(
        id: "druid_vigor_t2", skillClass: .druid, tier: 2,
        name: "자연의 활력", description: "HP +60 회복 + 1 round 회피 100%.",
        resourceCost: 50, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["druid_ward_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(60 * getIntMult(s))
            let healed = min(s.hero.maxHp - s.hero.hp, heal)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.forcedDodgeRounds = 1
            pushSkillLog(&s, .druid, "자연의 활력", "자연의 활력이 흐른다. HP +\(healed), 1 round 회피",
                skillId: "druid_vigor_t2", narrativeParams: ["heal": .number(Double(healed))])
        })

    static let druidT3 = ClassSkill(
        id: "druid_grove_t3", skillClass: .druid, tier: 3,
        name: "숲의 포옹", description: "HP +80 회복 + 다음 3 round 피해 -30%.",
        resourceCost: 60, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["druid_root_t2", "druid_vigor_t2"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(80 * getIntMult(s))
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 3, reduction: 0.3)
            pushSkillLog(&s, .druid, "숲의 포옹", "HP +\(heal) · 3 round 피해 -30%",
                skillId: "druid_grove_t3", narrativeParams: ["heal": .number(Double(heal))])
        })

    static let druidT3b = ClassSkill(
        id: "druid_claw_t3", skillClass: .druid, tier: 3,
        name: "맹수의 발톱", description: "3 round 동안 공격 +40%.",
        resourceCost: 60, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["druid_root_t2", "druid_vigor_t2"],
        shouldFire: { s, m in alive(m) && s.heroAtkBonusRounds == nil },
        apply: { s, _ in
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 3, mult: 1.4)
            pushSkillLog(&s, .druid, "맹수의 발톱",
                "맹수의 발톱이 돋는다. 3 round 공격 +40%", skillId: "druid_claw_t3")
        })

    static let druidT4 = ClassSkill(
        id: "druid_wild_call_t4", skillClass: .druid, tier: 4,
        name: "야생의 부름", description: "적 HP 30% 피해 + HP +100 회복.",
        resourceCost: 85, cooldown: 12, requiredLevel: 45, pointCost: 2,
        requires: ["druid_grove_t3", "druid_claw_t3"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let intMult = getIntMult(s)
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.3 * intMult)
            pushSkillHit(&s, m, damage: dmg,
                narrative: "야생의 짐승이 \(m.name) 을 공격한다, \(dmg) 피해",
                skillId: "druid_wild_call_t4")
            let heal = UpHeroCombat.jsRound(100 * intMult)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            pushSkillLog(&s, .druid, "야생의 부름", "적 HP 30% (\(dmg)) · HP +\(heal)",
                skillId: "druid_wild_call_t4",
                narrativeParams: ["damage": .number(Double(dmg)), "heal": .number(Double(heal))])
        })

    // MARK: - bard (영감)

    static let bardT1 = ClassSkill(
        id: "bard_song_t1", skillClass: .bard, tier: 1,
        name: "노래", description: "다음 처치 코인 1.5배.",
        resourceCost: 25, cooldown: 4, requiredLevel: 30, pointCost: 0,
        shouldFire: { _, _ in true },
        apply: { s, _ in
            s.nextCoinMult = 1.5
            pushSkillLog(&s, .bard, "노래",
                "용기의 노래: 다음 처치 보상 1.5배", skillId: "bard_song_t1")
        })

    static let bardT2 = ClassSkill(
        id: "bard_ensemble_t2", skillClass: .bard, tier: 2,
        name: "협연", description: "다음 3 round 공격 +25%.",
        resourceCost: 50, cooldown: 5, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["bard_song_t1"],
        shouldFire: { s, _ in s.heroAtkBonusRounds == nil },
        apply: { s, _ in
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 3, mult: 1.25)
            pushSkillLog(&s, .bard, "협연", "3 round 공격 +25%", skillId: "bard_ensemble_t2")
        })

    static let bardT2b = ClassSkill(
        id: "bard_lullaby_t2", skillClass: .bard, tier: 2,
        name: "자장가", description: "적 1 round 행동 봉인.",
        resourceCost: 45, cooldown: 6, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["bard_song_t1"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 1
            pushSkillLog(&s, .bard, "자장가",
                "자장가가 적을 재운다. 1 round 봉인", skillId: "bard_lullaby_t2")
        })

    static let bardT3 = ClassSkill(
        id: "bard_anthem_t3", skillClass: .bard, tier: 3,
        name: "영웅가", description: "HP +30 + 다음 3 round 피해 -25%.",
        resourceCost: 60, cooldown: 6, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["bard_ensemble_t2", "bard_lullaby_t2"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.7 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(30 * getIntMult(s))
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 3, reduction: 0.25)
            pushSkillLog(&s, .bard, "영웅가", "HP +\(heal) · 3 round 피해 -25%",
                skillId: "bard_anthem_t3", narrativeParams: ["heal": .number(Double(heal))])
        })

    static let bardT3b = ClassSkill(
        id: "bard_fortune_t3", skillClass: .bard, tier: 3,
        name: "행운의 노래", description: "다음 처치 코인 2배 + 다음 2 공격 반드시 crit.",
        resourceCost: 60, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["bard_ensemble_t2", "bard_lullaby_t2"],
        shouldFire: { s, m in alive(m) && s.guaranteedCritAttacks == nil },
        apply: { s, _ in
            s.nextCoinMult = 2.0
            s.guaranteedCritAttacks = 2
            pushSkillLog(&s, .bard, "행운의 노래",
                "행운의 노래. 다음 처치 코인 2배, 다음 2 공격 crit", skillId: "bard_fortune_t3")
        })

    static let bardT4 = ClassSkill(
        id: "bard_epic_t4", skillClass: .bard, tier: 4,
        name: "대서사시", description: "다음 5 공격 반드시 crit.",
        resourceCost: 80, cooldown: 10, requiredLevel: 45, pointCost: 2,
        requires: ["bard_anthem_t3", "bard_fortune_t3"],
        // 보스 또는 HP 150+ 적 전용 — 일반 몬스터에 crit 5회 낭비 방지.
        shouldFire: { s, m in
            alive(m) && s.guaranteedCritAttacks == nil
                && (m?.isBoss == true || (m?.hp ?? 0) >= 150)
        },
        apply: { s, _ in
            s.guaranteedCritAttacks = 5
            pushSkillLog(&s, .bard, "대서사시", "다음 5 공격 반드시 crit", skillId: "bard_epic_t4")
        })

    // MARK: - chronomancer (시간 파편)

    static let chronoT1 = ClassSkill(
        id: "chrono_rewind_t1", skillClass: .chronomancer, tier: 1,
        name: "시간 되감기", description: "시간 +10.",
        resourceCost: 30, cooldown: 7, requiredLevel: 30, pointCost: 0,
        shouldFire: { s, _ in Double(s.time) < Double(s.maxTime) * 0.5 },
        apply: { s, _ in
            let restore = min(s.maxTime - s.time, 10)
            s.time = min(s.maxTime, s.time + 10)
            pushSkillLog(&s, .chronomancer, "시간 되감기", "시간 +\(restore)",
                skillId: "chrono_rewind_t1", narrativeParams: ["time": .number(Double(restore))])
        })

    static let chronoT2 = ClassSkill(
        id: "chrono_accel_t2", skillClass: .chronomancer, tier: 2,
        name: "시간 가속", description: "모든 스킬 쿨다운 즉시 -2.",
        resourceCost: 60, cooldown: 6, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["chrono_rewind_t1"],
        shouldFire: { s, _ in (s.skillCooldowns ?? [:]).values.contains { $0 > 0 } },
        apply: { s, _ in
            var cds = s.skillCooldowns ?? [:]
            for k in Array(cds.keys) { cds[k] = max(0, cds[k]! - 2) }
            s.skillCooldowns = cds
            pushSkillLog(&s, .chronomancer, "시간 가속", "모든 스킬 CD -2", skillId: "chrono_accel_t2")
        })

    static let chronoT2b = ClassSkill(
        id: "chrono_warp_t2", skillClass: .chronomancer, tier: 2,
        name: "시간 왜곡", description: "2 round 회피 100%.",
        resourceCost: 55, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["chrono_rewind_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 && s.forcedDodgeRounds == nil },
        apply: { s, _ in
            s.forcedDodgeRounds = 2
            pushSkillLog(&s, .chronomancer, "시간 왜곡",
                "시간이 왜곡된다. 2 round 회피 100%", skillId: "chrono_warp_t2")
        })

    static let chronoT3 = ClassSkill(
        id: "chrono_stop_t3", skillClass: .chronomancer, tier: 3,
        name: "시간 정지", description: "적 2 round 행동 봉인.",
        resourceCost: 70, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["chrono_accel_t2", "chrono_warp_t2"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 2
            pushSkillLog(&s, .chronomancer, "시간 정지",
                "시간이 멈춘다: 2 round 봉인", skillId: "chrono_stop_t3")
        })

    static let chronoT3b = ClassSkill(
        id: "chrono_foresight_t3", skillClass: .chronomancer, tier: 3,
        name: "미래 예지", description: "다음 3 공격 반드시 crit.",
        resourceCost: 65, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["chrono_accel_t2", "chrono_warp_t2"],
        // 보스 또는 HP 150+ 적 전용 — bardT4 와 같은 게이트.
        shouldFire: { s, m in
            alive(m) && s.guaranteedCritAttacks == nil
                && (m?.isBoss == true || (m?.hp ?? 0) >= 150)
        },
        apply: { s, _ in
            s.guaranteedCritAttacks = 3
            pushSkillLog(&s, .chronomancer, "미래 예지",
                "미래를 본다. 다음 3 공격 반드시 crit", skillId: "chrono_foresight_t3")
        })

    static let chronoT4 = ClassSkill(
        id: "chrono_reflux_t4", skillClass: .chronomancer, tier: 4,
        name: "시간 역류", description: "HP 완전 회복 + 시간 +30.",
        resourceCost: 90, cooldown: 14, requiredLevel: 45, pointCost: 2,
        requires: ["chrono_stop_t3", "chrono_foresight_t3"],
        shouldFire: { s, _ in
            Double(s.hero.hp) < Double(s.hero.maxHp) * 0.4 || Double(s.time) < Double(s.maxTime) * 0.3
        },
        apply: { s, _ in
            s.hero.hp = s.hero.maxHp
            s.time = min(s.maxTime, s.time + 30)
            pushSkillLog(&s, .chronomancer, "시간 역류",
                "HP 완전 회복 · 시간 +30", skillId: "chrono_reflux_t4")
        })

    // MARK: - priest (신앙)

    static let priestT1 = ClassSkill(
        id: "priest_light_t1", skillClass: .priest, tier: 1,
        name: "성스러운 빛", description: "HP 완전 회복.",
        resourceCost: 20, cooldown: 10, requiredLevel: 30, pointCost: 0,
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.2 },
        apply: { s, _ in
            let healed = s.hero.maxHp - s.hero.hp
            s.hero.hp = s.hero.maxHp
            pushSkillLog(&s, .priest, "성스러운 빛", "HP 완전 회복 (+\(healed))",
                skillId: "priest_light_t1", narrativeParams: ["heal": .number(Double(healed))])
        })

    static let priestT2 = ClassSkill(
        id: "priest_purge_t2", skillClass: .priest, tier: 2,
        name: "정화", description: "HP +40 + 다음 3 round 피해 -30%.",
        resourceCost: 45, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["priest_light_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.6 },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(40 * getIntMult(s))
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.heroDmgReductionRounds = DmgReductionEffect(rounds: 3, reduction: 0.3)
            pushSkillLog(&s, .priest, "정화", "HP +\(heal) · 3 round 피해 -30%",
                skillId: "priest_purge_t2", narrativeParams: ["heal": .number(Double(heal))])
        })

    static let priestT2b = ClassSkill(
        id: "priest_favor_t2", skillClass: .priest, tier: 2,
        name: "신의 가호", description: "1 round 무적.",
        resourceCost: 50, cooldown: 9, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["priest_light_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.4 && s.heroInvulnerableRounds == nil },
        apply: { s, _ in
            s.heroInvulnerableRounds = 1
            pushSkillLog(&s, .priest, "신의 가호",
                "신의 가호가 내린다. 1 round 무적", skillId: "priest_favor_t2")
        })

    static let priestT3 = ClassSkill(
        id: "priest_judgment_t3", skillClass: .priest, tier: 3,
        name: "심판", description: "적 현재 HP 25% 성스러운 피해.",
        resourceCost: 60, cooldown: 6, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["priest_purge_t2", "priest_favor_t2"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.25 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "심판: \(m.name) 이 빛에 타들어간다, \(dmg) 피해",
                skillId: "priest_judgment_t3")
            pushSkillLog(&s, .priest, "심판", "적 HP 25% (\(dmg))",
                skillId: "priest_judgment_t3", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let priestT3b = ClassSkill(
        id: "priest_bless_t3", skillClass: .priest, tier: 3,
        name: "축복", description: "HP +60 회복 + 3 round 공격 +25%.",
        resourceCost: 60, cooldown: 7, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["priest_purge_t2", "priest_favor_t2"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.7 && s.heroAtkBonusRounds == nil },
        apply: { s, _ in
            let heal = UpHeroCombat.jsRound(60 * getIntMult(s))
            let healed = min(s.hero.maxHp - s.hero.hp, heal)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 3, mult: 1.25)
            pushSkillLog(&s, .priest, "축복", "축복이 내린다. HP +\(healed), 3 round 공격 +25%",
                skillId: "priest_bless_t3", narrativeParams: ["heal": .number(Double(healed))])
        })

    static let priestT4 = ClassSkill(
        id: "priest_revive_t4", skillClass: .priest, tier: 4,
        name: "부활", description: "다음 죽음 1회 무효 (HP 50%).",
        resourceCost: 100, cooldown: 20, requiredLevel: 45, pointCost: 2,
        requires: ["priest_judgment_t3", "priest_bless_t3"],
        // HP 35% 이하 위험 상태에서만 — 비위험 시 T1 성스러운 빛이 자연 발동.
        shouldFire: { s, _ in
            s.revivePending != true && Double(s.hero.hp) / Double(s.hero.maxHp) < 0.35
        },
        apply: { s, _ in
            s.revivePending = true
            pushSkillLog(&s, .priest, "부활", "부활의 축복이 준비된다", skillId: "priest_revive_t4")
        })

    // MARK: - illusionist (환기)

    static let illusT1 = ClassSkill(
        id: "illus_mirage_t1", skillClass: .illusionist, tier: 1,
        name: "환영", description: "다음 3 적 공격 miss.",
        resourceCost: 30, cooldown: 6, requiredLevel: 30, pointCost: 0,
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.4 },
        apply: { s, _ in
            s.forcedEnemyMisses = 3
            pushSkillLog(&s, .illusionist, "환영",
                "환영: 다음 3 공격 miss", skillId: "illus_mirage_t1")
        })

    static let illusT2 = ClassSkill(
        id: "illus_double_t2", skillClass: .illusionist, tier: 2,
        name: "분신", description: "다음 2 round 공격 2배.",
        resourceCost: 50, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .a, requires: ["illus_mirage_t1"],
        shouldFire: { s, _ in s.heroAtkBonusRounds == nil },
        apply: { s, _ in
            s.heroAtkBonusRounds = AtkBonusEffect(rounds: 2, mult: 2.0)
            pushSkillLog(&s, .illusionist, "분신", "2 round 공격 2배", skillId: "illus_double_t2")
        })

    static let illusT2b = ClassSkill(
        id: "illus_shadow_t2", skillClass: .illusionist, tier: 2,
        name: "그림자 걸음", description: "2 round 회피 100%.",
        resourceCost: 50, cooldown: 7, requiredLevel: 35, pointCost: 1,
        branch: .b, requires: ["illus_mirage_t1"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.5 && s.forcedDodgeRounds == nil },
        apply: { s, _ in
            s.forcedDodgeRounds = 2
            pushSkillLog(&s, .illusionist, "그림자 걸음",
                "그림자 속으로 사라진다. 2 round 회피 100%", skillId: "illus_shadow_t2")
        })

    static let illusT3 = ClassSkill(
        id: "illus_charm_t3", skillClass: .illusionist, tier: 3,
        name: "환혹", description: "적 2 round 무력화.",
        resourceCost: 65, cooldown: 8, requiredLevel: 40, pointCost: 1,
        branch: .a, requires: ["illus_double_t2", "illus_shadow_t2"],
        shouldFire: { s, m in alive(m) && s.enemyStunnedRounds == nil },
        apply: { s, _ in
            s.enemyStunnedRounds = 2
            pushSkillLog(&s, .illusionist, "환혹",
                "적이 홀려 움직이지 못한다: 2 round", skillId: "illus_charm_t3")
        })

    static let illusT3b = ClassSkill(
        id: "illus_burst_t3", skillClass: .illusionist, tier: 3,
        name: "환상 폭발", description: "적 현재 HP 30% 피해.",
        resourceCost: 65, cooldown: 7, requiredLevel: 40, pointCost: 1,
        branch: .b, requires: ["illus_double_t2", "illus_shadow_t2"],
        shouldFire: { _, m in alive(m) },
        apply: { s, m in
            guard let m else { return }
            let dmg = UpHeroCombat.jsRound(Double(m.hp) * 0.3 * getIntMult(s))
            pushSkillHit(&s, m, damage: dmg,
                narrative: "환상이 \(m.name) 앞에서 폭발한다. \(dmg) 피해",
                skillId: "illus_burst_t3")
            pushSkillLog(&s, .illusionist, "환상 폭발", "환상이 폭발한다 (\(dmg))",
                skillId: "illus_burst_t3", narrativeParams: ["damage": .number(Double(dmg))])
        })

    static let illusT4 = ClassSkill(
        id: "illus_dreamscape_t4", skillClass: .illusionist, tier: 4,
        name: "환몽", description: "3 round 무적.",
        resourceCost: 85, cooldown: 12, requiredLevel: 45, pointCost: 2,
        requires: ["illus_charm_t3", "illus_burst_t3"],
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.3 },
        apply: { s, _ in
            s.heroInvulnerableRounds = 3
            pushSkillLog(&s, .illusionist, "환몽",
                "영웅이 꿈 속으로: 3 round 무적", skillId: "illus_dreamscape_t4")
        })

    // MARK: - novice (전직 전 tutorial — tier 0, 자원 0)

    static let noviceHeal = ClassSkill(
        id: "novice_heal", skillClass: .novice, tier: 0,
        name: "초급 힐링", description: "HP +15 회복.",
        resourceCost: 0, cooldown: 7, requiredLevel: 1, pointCost: 0,
        shouldFire: { s, _ in Double(s.hero.hp) < Double(s.hero.maxHp) * 0.6 },
        apply: { s, _ in
            // 고정 15 — novice 는 INT scaling 없이 튜토리얼 난이도 유지.
            let heal = 15
            let healed = min(s.hero.maxHp - s.hero.hp, heal)
            s.hero.hp = min(s.hero.maxHp, s.hero.hp + heal)
            pushSkillLog(&s, .novice, "초급 힐링", "HP +\(healed)",
                skillId: "novice_heal", narrativeParams: ["heal": .number(Double(healed))])
        })

    static let noviceFocus = ClassSkill(
        id: "novice_focus", skillClass: .novice, tier: 0,
        name: "집중 일격", description: "다음 공격 피해 +50%.",
        resourceCost: 0, cooldown: 5, requiredLevel: 5, pointCost: 0,
        shouldFire: { _, m in alive(m) },
        apply: { s, _ in
            let prev = s.nextHeroDamageMult ?? 1
            s.nextHeroDamageMult = max(prev, 1.5)
            pushSkillLog(&s, .novice, "집중 일격",
                "영웅이 깊게 호흡한다: 다음 공격 +50%.", skillId: "novice_focus")
        })

    static let noviceBrace = ClassSkill(
        id: "novice_brace", skillClass: .novice, tier: 0,
        name: "방어 자세", description: "다음 1 round 받는 피해 -50%.",
        resourceCost: 0, cooldown: 6, requiredLevel: 15, pointCost: 0,
        shouldFire: { s, m in
            alive(m) && Double(s.hero.hp) / Double(s.hero.maxHp) <= 0.5
        },
        apply: { s, _ in
            let prev = s.heroDmgReductionRounds
            if prev == nil || prev!.reduction < 0.5 || prev!.rounds < 1 {
                s.heroDmgReductionRounds = DmgReductionEffect(rounds: 1, reduction: 0.5)
            }
            pushSkillLog(&s, .novice, "방어 자세",
                "영웅이 자세를 낮춘다: 다음 피해 -50%.", skillId: "novice_brace")
        })

    // MARK: - 레지스트리

    /// novice 스킬 — UI/해금 순서 (Lv1 힐 → Lv5 집중 → Lv15 방어). 웹 `NOVICE_SKILLS`.
    static let noviceSkills: [ClassSkill] = [noviceHeal, noviceFocus, noviceBrace]

    /// 클래스별 스킬트리 — 6노드 `[T1, T2a, T2b, T3a, T3b, T4]`. 웹 `CLASS_SKILL_TREES`.
    /// 선언 순서가 maybeFireSkill 동 tier 타이브레이크(a 먼저)와 UI 렌더 순서다.
    static let classSkillTrees: [ClassType: [ClassSkill]] = [
        .warrior: [warriorT1, warriorT2, warriorT2b, warriorT3, warriorT3b, warriorT4],
        .mage: [mageT1, mageT2, mageT2b, mageT3, mageT3b, mageT4],
        .monk: [monkT1, monkT2, monkT2b, monkT3, monkT3b, monkT4],
        .druid: [druidT1, druidT2, druidT2b, druidT3, druidT3b, druidT4],
        .bard: [bardT1, bardT2, bardT2b, bardT3, bardT3b, bardT4],
        .chronomancer: [chronoT1, chronoT2, chronoT2b, chronoT3, chronoT3b, chronoT4],
        .priest: [priestT1, priestT2, priestT2b, priestT3, priestT3b, priestT4],
        .illusionist: [illusT1, illusT2, illusT2b, illusT3, illusT3b, illusT4],
    ]

    /// 트리 tier 순서 (UI 렌더 순서). tier 2/3 은 2열, 1/4 는 1열. 웹 `SKILL_TREE_TIERS`.
    static let skillTreeTiers: [Int] = [1, 2, 3, 4]

    /// Legacy — 클래스별 T1 스킬. 웹 `CLASS_SKILLS` (deprecated).
    static let classSkills: [ClassType: ClassSkill] = [
        .warrior: warriorT1, .mage: mageT1, .monk: monkT1, .druid: druidT1,
        .bard: bardT1, .chronomancer: chronoT1, .priest: priestT1, .illusionist: illusT1,
    ]

    // MARK: - 학습 규칙 (Phase 3-F)

    /// 같은 class·같은 tier 의 다른 branch 스킬. T1/T4/novice 는 nil. 웹 `getSiblingSkill`.
    static func siblingSkill(of skill: ClassSkill) -> ClassSkill? {
        guard skill.skillClass != .novice, skill.branch != nil,
              let cls = ClassType(rawValue: skill.skillClass.rawValue),
              let tree = classSkillTrees[cls] else { return nil }
        return tree.first { $0.tier == skill.tier && $0.id != skill.id && $0.branch != nil }
    }

    /// 단일 학습 규칙 — 스토어 learnSkill 과 HeroStatPanel 이 같이 쓴다. 웹 `getSkillLearnStatus`.
    ///   검사 순서 고정: learned → class → level → requires → branch → points → ok.
    static func learnStatus(
        _ skill: ClassSkill, classType: ClassType?, heroLevel: Int,
        learned: [String], points: Int
    ) -> SkillLearnStatus {
        if learned.contains(skill.id) { return .learned }
        guard let classType, skill.skillClass.rawValue == classType.rawValue else { return .wrongClass }
        if heroLevel < skill.requiredLevel { return .needLevel }
        if !skill.requires.isEmpty, !skill.requires.contains(where: { learned.contains($0) }) {
            return .needPrereq
        }
        if let sib = siblingSkill(of: skill), learned.contains(sib.id) { return .branchTaken }
        if points < skill.pointCost { return .needPoints }
        return .ok
    }

    // MARK: - 발동 로직

    /// skillId → ClassSkill lookup. 웹 `findSkillById`.
    static func findSkillById(_ id: String) -> ClassSkill? {
        if let nov = noviceSkills.first(where: { $0.id == id }) { return nov }
        for tree in classSkillTrees.values {
            if let s = tree.first(where: { $0.id == id }) { return s }
        }
        return nil
    }

    /// 스킬 발동 가능 여부 — 자원 + 쿨다운 + 해금. 웹 `canFireSkill`.
    static func canFireSkill(
        _ s: CombatSession, skillId: String
    ) -> (ok: Bool, reason: SkillBlockReason?) {
        guard let skill = findSkillById(skillId) else { return (false, .locked) }
        let learned = s.hero.learnedSkills ?? []
        if !learned.contains(skillId) { return (false, .locked) }
        let cd = (s.skillCooldowns ?? [:])[skillId] ?? 0
        if cd > 0 { return (false, .cooldown) }
        let resource = s.classResource ?? 0
        if resource < skill.resourceCost { return (false, .resource) }
        return (true, nil)
    }

    /// 스킬 fire — 자원 차감 + apply + 쿨다운 세팅. 웹 `fireSkill`.
    @discardableResult
    static func fireSkill(
        _ s: inout CombatSession, skillId: String, monster: Monster?
    ) -> Bool {
        let check = canFireSkill(s, skillId: skillId)
        if !check.ok { return false }
        guard let skill = findSkillById(skillId) else { return false }
        // 자원 차감
        s.classResource = max(0, (s.classResource ?? 0) - skill.resourceCost)
        // apply
        skill.apply(&s, monster)
        // 웹 호환 — 마지막 skill 로그가 skillId 없으면 주입 (현 포팅은 항상 주입돼 no-op).
        if let last = s.log.last,
           case let .skill(cls, sid, sname, narr, nkey, nparams, ts) = last, sid == nil {
            s.log[s.log.count - 1] = .skill(
                classType: cls, skillId: skillId, skillName: sname, narrative: narr,
                narrativeKey: nkey, narrativeParams: nparams, timestamp: ts)
        }
        // 쿨다운 세팅
        var cds = s.skillCooldowns ?? [:]
        cds[skillId] = skill.cooldown
        s.skillCooldowns = cds
        s.skillCooldown = skill.cooldown   // T1 legacy 호환
        return true
    }

    /// auto 모드 스킬 시도 — 상위 tier 우선, round 당 최대 1개. 웹 `maybeFireSkill`.
    ///
    /// Phase 3-F — 동 tier 타이브레이크 = classSkillTrees 선언 순서 (a 먼저, 그 다음 b).
    ///   정상 저장본은 tier 당 최대 1개만 배우므로 충돌은 레거시/손상 데이터에서만 생긴다.
    ///   (tier desc, offset asc) 정렬이 웹의 안정 정렬(Array.prototype.sort)과 같은 결과를
    ///   낸다 — 비교자를 offset 없는 비안정 정렬로 바꾸지 말 것 (ClassSkillBranchTests 가 고정).
    static func maybeFireSkill(_ s: inout CombatSession, monster: Monster?) {
        if s.hero.autoSkillEnabled == false { return }
        let learned = s.hero.learnedSkills ?? []
        let tree = s.hero.classType.flatMap { classSkillTrees[$0] } ?? []
        // novice + class tree 합쳐 해금된 것만, tier 내림차순 (동tier 는 원래 순서 유지).
        let pool = noviceSkills + tree
        let candidates = pool
            .filter { learned.contains($0.id) }
            .enumerated()
            .sorted { $0.element.tier != $1.element.tier
                ? $0.element.tier > $1.element.tier
                : $0.offset < $1.offset }
            .map { $0.element }
        for sk in candidates {
            if !canFireSkill(s, skillId: sk.id).ok { continue }
            if !sk.shouldFire(s, monster) { continue }
            fireSkill(&s, skillId: sk.id, monster: monster)
            return   // 1 round 1 스킬
        }
    }

    /// Combat round 종료 — 모든 쿨다운 -1 + 지속 효과 카운터 감소. 웹 `advanceSkillCounters`.
    static func advanceSkillCounters(_ s: inout CombatSession) {
        if var cds = s.skillCooldowns {
            for k in Array(cds.keys) { cds[k] = max(0, cds[k]! - 1) }
            s.skillCooldowns = cds
        }
        if let cd = s.skillCooldown, cd > 0 {
            s.skillCooldown = cd - 1
        }
        if let fd = s.forcedDodgeRounds, fd > 0 {
            s.forcedDodgeRounds = fd - 1
            if s.forcedDodgeRounds == 0 { s.forcedDodgeRounds = nil }
        }
        if var atk = s.heroAtkBonusRounds, atk.rounds > 0 {
            atk.rounds -= 1
            s.heroAtkBonusRounds = atk.rounds <= 0 ? nil : atk
        }
        if let es = s.enemyStunnedRounds, es > 0 {
            s.enemyStunnedRounds = es - 1
            if s.enemyStunnedRounds == 0 { s.enemyStunnedRounds = nil }
        }
        if var dr = s.heroDmgReductionRounds, dr.rounds > 0 {
            dr.rounds -= 1
            s.heroDmgReductionRounds = dr.rounds <= 0 ? nil : dr
        }
        if let inv = s.heroInvulnerableRounds, inv > 0 {
            s.heroInvulnerableRounds = inv - 1
            if s.heroInvulnerableRounds == 0 { s.heroInvulnerableRounds = nil }
        }
    }
}
