//
//  ClassSkillBranchTests.swift
//  UpNextTests — Phase 3-F (Track F, 피드백 34b) 직업별 스킬 분기 a/b · 학습 규칙 · 리스펙.
//
//  웹 src/lib/classSkills.test.ts · src/store/useUpHeroStore.learnSkill.test.ts 의 iOS 미러.
//   - 트리 형태: class 마다 [T1, T2a, T2b, T3a, T3b, T4] 6개, 전체 51개(novice 3 포함) 고유 id.
//   - requires 배선: T2 → [T1], T3 → [T2a, T2b], T4 → [T3a, T3b].
//   - learnStatus 검사 순서: learned → class → level → requires → branch → points.
//   - maybeFireSkill: tier 내림차순, 동 tier 는 선언 순서 (a 먼저) 타이브레이크.
//   - 스토어: learnSkill 결과 매핑 + respecSkills 코인/SP 산술 (SP 는 파생값, 환급 산술 없음).
//
//  UpHeroStore 는 Application Support 의 uphero.json 을 읽고 쓴다 — UpHeroXpSettlementTests 와
//  같은 sharedStore 패턴 + 매 테스트 resetAllData 로 격리한다.
//

import XCTest
@testable import UpNext

@MainActor
final class ClassSkillBranchTests: XCTestCase {

    private static var sharedStore: UpHeroStore?

    private func freshStore() -> UpHeroStore {
        let s: UpHeroStore
        if let shared = Self.sharedStore { s = shared } else { s = UpHeroStore(); Self.sharedStore = s }
        s.resetAllData()
        return s
    }

    override func tearDown() {
        Self.sharedStore?.resetAllData()
        super.tearDown()
    }

    // MARK: - 픽스처

    private let classes: [ClassType] = [.warrior, .mage, .monk, .druid, .bard, .chronomancer, .priest, .illusionist]

    private let W1 = "warrior_smash_t1", W2A = "warrior_berserk_t2", W2B = "warrior_ironwall_t2"
    private let W3A = "warrior_crush_t3", W3B = "warrior_warcry_t3", W4 = "warrior_rage_burst_t4"

    private func tree(_ cls: ClassType) -> [ClassSkill] { ClassSkills.classSkillTrees[cls] ?? [] }

    private func byTier(_ cls: ClassType, _ tier: Int, _ branch: SkillBranch? = nil) -> ClassSkill {
        tree(cls).first { $0.tier == tier && (branch == nil || $0.branch == branch) }!
    }

    /// 웹 classSkills.test.ts mkSession — 워리어 auto 세션.
    private func mkSession(hp: Int, maxHp: Int = 500, learned: [String],
                           autoSkill: Bool = true, resource: Int = 100,
                           cooldowns: [String: Int]? = nil) -> CombatSession {
        var rng = Mulberry32(seed: 7)
        var hero = UpHeroRules.createDefaultHero()
        hero.classType = .warrior
        hero.learnedSkills = learned
        hero.autoSkillEnabled = autoSkill
        var s = UpHeroSession.createSession(dungeonId: .fitness, hero: hero, startFloor: 1, rng: &rng)
        s.hero.maxHp = maxHp
        s.hero.hp = hp
        s.classResource = resource
        s.skillCooldowns = cooldowns
        s.heroAtkBonusRounds = nil
        s.enemyStunnedRounds = nil
        s.heroDmgReductionRounds = nil
        return s
    }

    private func mkMonster(hp: Int = 400, isBoss: Bool = false) -> Monster {
        Monster(id: "m", name: "M", templateId: "tmpl", kind: .beast, level: 20, hp: hp,
                maxHp: nil, atk: 30, def: 10, xpReward: 10, coinReward: 5,
                isBoss: isBoss, dungeonId: .fitness, trait: nil)
    }

    private func lastSkillId(_ s: CombatSession) -> String? {
        for e in s.log.reversed() {
            if case let .skill(_, sid, _, _, _, _, _) = e { return sid }
        }
        return nil
    }

    private func status(_ id: String, learned: [String], points: Int = 5, level: Int = 45,
                        cls: ClassType? = .warrior) -> SkillLearnStatus {
        ClassSkills.learnStatus(ClassSkills.findSkillById(id)!, classType: cls,
                                heroLevel: level, learned: learned, points: points)
    }

    // MARK: - 트리 형태

    func testEveryClassTreeIsSixNodesInBranchOrder() {
        for cls in classes {
            let shape = tree(cls).map { "\($0.tier)\($0.branch?.rawValue ?? "-")" }
            XCTAssertEqual(shape, ["1-", "2a", "2b", "3a", "3b", "4-"], "\(cls)")
        }
        XCTAssertEqual(ClassSkills.skillTreeTiers, [1, 2, 3, 4])
    }

    func testFiftyOneUniqueIdsAndNamingConvention() {
        let all = ClassSkills.noviceSkills + classes.flatMap { tree($0) }
        XCTAssertEqual(all.count, 51)
        XCTAssertEqual(Set(all.map(\.id)).count, 51)
        let re = try! NSRegularExpression(pattern: "^(warrior|mage|monk|druid|bard|chrono|priest|illus)_[a-z_]+_t[1-4]$")
        for sk in classes.flatMap({ tree($0) }) {
            XCTAssertNotNil(re.firstMatch(in: sk.id, range: NSRange(sk.id.startIndex..., in: sk.id)), sk.id)
        }
    }

    func testRequiresWiringAndTierCosts() {
        for cls in classes {
            let t1 = byTier(cls, 1), t2a = byTier(cls, 2, .a), t2b = byTier(cls, 2, .b)
            let t3a = byTier(cls, 3, .a), t3b = byTier(cls, 3, .b), t4 = byTier(cls, 4)
            XCTAssertEqual(t1.requires, [], "\(cls) T1")
            XCTAssertNil(t1.branch); XCTAssertNil(t4.branch)
            for t2 in [t2a, t2b] {
                XCTAssertEqual(t2.requires, [t1.id], "\(cls) \(t2.id)")
                XCTAssertEqual(t2.requiredLevel, 35); XCTAssertEqual(t2.pointCost, 1)
            }
            for t3 in [t3a, t3b] {
                XCTAssertEqual(t3.requires, [t2a.id, t2b.id], "\(cls) \(t3.id)")
                XCTAssertEqual(t3.requiredLevel, 40); XCTAssertEqual(t3.pointCost, 1)
            }
            XCTAssertEqual(t4.requires, [t3a.id, t3b.id], "\(cls) T4")
            XCTAssertEqual(t4.requiredLevel, 45); XCTAssertEqual(t4.pointCost, 2)
        }
    }

    func testSiblingSkill() {
        XCTAssertEqual(ClassSkills.siblingSkill(of: ClassSkills.findSkillById(W2A)!)?.id, W2B)
        XCTAssertEqual(ClassSkills.siblingSkill(of: ClassSkills.findSkillById(W2B)!)?.id, W2A)
        XCTAssertEqual(ClassSkills.siblingSkill(of: ClassSkills.findSkillById(W3A)!)?.id, W3B)
        XCTAssertNil(ClassSkills.siblingSkill(of: ClassSkills.findSkillById(W1)!))
        XCTAssertNil(ClassSkills.siblingSkill(of: ClassSkills.findSkillById(W4)!))
        XCTAssertNil(ClassSkills.siblingSkill(of: ClassSkills.findSkillById("novice_heal")!))
    }

    // MARK: - learnStatus 매트릭스 (웹 getSkillLearnStatus 픽스처 그대로)

    func testLearnStatusMatrix() {
        XCTAssertEqual(status(W2A, learned: [W1]), .ok)
        XCTAssertEqual(status(W2B, learned: [W1, W2A]), .branchTaken)
        XCTAssertEqual(status(W4, learned: [W1, W2A]), .needPrereq)
        XCTAssertEqual(status(W4, learned: [W1, W2B, W3B]), .ok)
        XCTAssertEqual(status(W3B, learned: [W1, W2A]), .ok)          // T3 는 T2a/T2b 어느 쪽이든
        XCTAssertEqual(status(W3B, learned: [W1]), .needPrereq)
        XCTAssertEqual(status("mage_chain_t3", learned: [W1]), .wrongClass)
        XCTAssertEqual(status(W2A, learned: [W1], level: 34), .needLevel)
        XCTAssertEqual(status(W2A, learned: [W1], points: 0), .needPoints)
        XCTAssertEqual(status(W2A, learned: [W1, W2A]), .learned)
        XCTAssertEqual(status(W2A, learned: [W1], cls: nil), .wrongClass)
        XCTAssertEqual(SkillLearnStatus.wrongClass.webName, "class")
        XCTAssertEqual(SkillLearnStatus.needPrereq.webName, "requires")
        XCTAssertEqual(SkillLearnStatus.branchTaken.webName, "branch")
    }

    func testLearnStatusCheckOrder() {
        // learned 가 모든 것보다 먼저 (다른 class·저레벨·SP0 이어도 learned)
        XCTAssertEqual(status(W2A, learned: [W2A], points: 0, level: 1, cls: .mage), .learned)
        // class 가 level 보다 먼저
        XCTAssertEqual(status(W2A, learned: [], level: 1, cls: .mage), .wrongClass)
        // level 이 requires 보다 먼저
        XCTAssertEqual(status(W4, learned: [W1], level: 44), .needLevel)
        // requires 가 branch 보다 먼저 (T3b: 선행 없음 + 형제 배움 → requires)
        XCTAssertEqual(status(W3B, learned: [W1, W3A]), .needPrereq)
        // branch 가 points 보다 먼저
        XCTAssertEqual(status(W2B, learned: [W1, W2A], points: 0), .branchTaken)
    }

    func testLegacyBothSiblingsStayLearned() {
        XCTAssertEqual(status(W2A, learned: [W1, W2A, W2B]), .learned)
        XCTAssertEqual(status(W2B, learned: [W1, W2A, W2B]), .learned)
    }

    // MARK: - pushSkillLog 규약 (narrativeKey = uphero.skill.<id>.narrative)

    func testEverySkillLogsItsOwnNarrativeKey() {
        let all = ClassSkills.noviceSkills + classes.flatMap { tree($0) }
        for sk in all {
            var s = mkSession(hp: 100, learned: [sk.id])
            s.hero.classType = nil
            sk.apply(&s, mkMonster())
            var key: String?
            for e in s.log.reversed() {
                if case let .skill(_, _, _, _, nkey, _, _) = e { key = nkey; break }
            }
            XCTAssertEqual(key, "uphero.skill.\(sk.id).narrative", sk.id)
        }
    }

    // MARK: - maybeFireSkill 선택 + 타이브레이크

    func testHigherTierBranchBFiresFirst() {
        var s = mkSession(hp: 200, learned: [W1, W2B, W3B])
        ClassSkills.maybeFireSkill(&s, monster: mkMonster())
        XCTAssertEqual(lastSkillId(s), W3B)
        XCTAssertEqual(s.enemyStunnedRounds, 1)
        XCTAssertEqual(s.heroAtkBonusRounds, AtkBonusEffect(rounds: 2, mult: 1.4))
    }

    func testFallsBackToTier2BWhenTier3OnCooldown() {
        var s = mkSession(hp: 200, learned: [W1, W2B, W3B], cooldowns: [W3B: 3])
        ClassSkills.maybeFireSkill(&s, monster: mkMonster())
        XCTAssertEqual(lastSkillId(s), W2B)
        XCTAssertEqual(s.heroDmgReductionRounds, DmgReductionEffect(rounds: 3, reduction: 0.4))
    }

    func testTieBreakIsDeclarationOrderAFirst() {
        var s = mkSession(hp: 250, learned: [W1, W2A, W2B])
        ClassSkills.maybeFireSkill(&s, monster: mkMonster())
        XCTAssertEqual(lastSkillId(s), W2A)
    }

    func testTieBreakIgnoresLearnedSkillsOrder() {
        var s = mkSession(hp: 250, learned: [W2B, W2A, W1])
        ClassSkills.maybeFireSkill(&s, monster: mkMonster())
        XCTAssertEqual(lastSkillId(s), W2A)
    }

    func testAutoSkillOffFiresNothing() {
        var s = mkSession(hp: 100, learned: [W1, W2B], autoSkill: false)
        let before = s.log.count
        ClassSkills.maybeFireSkill(&s, monster: mkMonster())
        XCTAssertEqual(s.log.count, before)
    }

    // MARK: - 신규 b 스킬 효과 (대표 케이스 — 전량은 동치 검증 classskills suite 가 고정)

    func testChainLightningDamageAndStun() {
        let sk = ClassSkills.findSkillById("mage_chain_t3")!
        var s = mkSession(hp: 470, learned: [sk.id])
        s.hero.baseStats.int = 50          // intMult 1.5 → round(400*0.3*1.5) = 180
        XCTAssertTrue(sk.shouldFire(s, mkMonster()))
        sk.apply(&s, mkMonster())
        var dmg: Int?
        for e in s.log { if case let .combat(_, d, _, _, nkey, _, _) = e {
            dmg = d; XCTAssertEqual(nkey, "uphero.combat.narrative.skillHitMonster.mage_chain_t3") } }
        XCTAssertEqual(dmg, UpHeroCombat.jsRound(400 * 0.3 * ClassSkills.getIntMult(s)))
        XCTAssertEqual(s.enemyStunnedRounds, 1)
    }

    func testForesightNeedsBossOrBigEnemy() {
        let sk = ClassSkills.findSkillById("chrono_foresight_t3")!
        let s = mkSession(hp: 470, learned: [sk.id])
        XCTAssertFalse(sk.shouldFire(s, mkMonster(hp: 100)))
        XCTAssertTrue(sk.shouldFire(s, mkMonster(hp: 100, isBoss: true)))
        XCTAssertTrue(sk.shouldFire(s, mkMonster(hp: 150)))
    }

    func testVigorHealClampsAndLogsHealed() {
        let sk = ClassSkills.findSkillById("druid_vigor_t2")!
        var s = mkSession(hp: 480, maxHp: 500, learned: [sk.id])
        s.hero.baseStats.int = 50
        XCTAssertFalse(sk.shouldFire(s, mkMonster()))   // hp 96% — hp<50% 조건 미충족
        sk.apply(&s, mkMonster())
        XCTAssertEqual(s.hero.hp, 500)
        XCTAssertEqual(s.forcedDodgeRounds, 1)
        var healed: Double?
        for e in s.log { if case let .skill(_, _, _, _, _, params, _) = e, case let .number(n)? = params?["heal"] { healed = n } }
        XCTAssertEqual(healed, 20)
    }

    // MARK: - 스토어: learnSkill 결과 매핑 + respecSkills

    func testLearnSkillBranchFlowAndRespec() {
        let store = freshStore()
        store.assignClass(.warrior)                    // learnedSkills = [T1]
        store.debugSetHeroLevel(45)                    // 웹 시드 heroTotalXPForLevel(45) = 34,650
        XCTAssertEqual(store.state.heroXp, 34_650)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(45), 15)
        XCTAssertEqual(store.state.hero.skillPoints, 15)

        XCTAssertEqual(store.learnSkill(W2A), .ok)
        XCTAssertEqual(store.state.hero.skillPoints, 14)
        XCTAssertEqual(store.learnSkill(W2B), .branchTaken)
        XCTAssertEqual(store.learnSkill(W4), .needPrereq)
        XCTAssertEqual(store.learnSkill(W3B), .ok)
        XCTAssertEqual(store.state.hero.skillPoints, 13)
        XCTAssertEqual(store.learnSkill(W4), .ok)
        XCTAssertEqual(store.state.hero.skillPoints, 11)
        XCTAssertEqual(store.learnSkill(W4), .already)
        XCTAssertEqual(store.learnSkill("mage_chain_t3"), .noClass)
        XCTAssertEqual(store.state.hero.learnedSkills, [W1, W2A, W3B, W4])

        // 진행 중 세션 미러 + 사라진 스킬 쿨다운 정리
        var session = mkSession(hp: 300, learned: [W1, W2A, W3B, W4], cooldowns: [W1: 2, W2A: 3, W4: 9])
        session.hero.classType = .warrior
        store.debugSetCurrentSession(session)

        // 코인 299 → no-coins, 상태 불변
        store.addCoins(299)
        XCTAssertEqual(store.respecSkills(), .noCoins)
        XCTAssertEqual(store.state.hero.learnedSkills, [W1, W2A, W3B, W4])
        XCTAssertEqual(store.state.coins, 299)

        // 코인 300 → ok: learned [T1], SP 15 복원 (환급 산술 없이 파생), 코인 0
        store.addCoins(1)
        XCTAssertEqual(store.respecSkills(), .ok)
        XCTAssertEqual(store.state.hero.learnedSkills, [W1])
        XCTAssertEqual(store.state.hero.skillPoints, 15)
        XCTAssertEqual(store.state.coins, 300 - ShopPrices.skillRespec)
        XCTAssertEqual(store.state.currentSession?.hero.learnedSkills, [W1])
        XCTAssertEqual(store.state.currentSession?.skillCooldowns, [W1: 2])

        // 다시 → nothing (T2+ 배운 게 없음)
        store.addCoins(300)
        XCTAssertEqual(store.respecSkills(), .nothing)
        XCTAssertEqual(store.state.coins, 300)
    }

    func testRespecBeforeClassIsNoClass() {
        let store = freshStore()
        store.addCoins(300)
        XCTAssertEqual(store.respecSkills(), .noClass)
        XCTAssertEqual(store.state.coins, 300)
    }

    func testRespecPriceMatchesWeb() {
        XCTAssertEqual(ShopPrices.skillRespec, 300)
    }
}
