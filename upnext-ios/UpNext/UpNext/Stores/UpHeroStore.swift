//
//  UpHeroStore.swift
//  UpNext — Up Hero RPG 상태 스토어 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 src/store/useUpHeroStore.ts 의 Zustand 스토어를 SwiftUI 반응형 스토어로 재설계.
//  GameStore 와 마찬가지로 화면 슬라이스가 요구하는 액션을 한 슬라이스씩 덧붙여 키운다
//  (1,750줄 Zustand 액션을 일괄 포팅하지 않는다 — on-demand 포팅).
//
//  ── 슬라이스 14~18 (현재) ──
//  상태 컨테이너 + 기본 상태 팩토리 + 로컬 영속화 + initialize(idle accrual).
//   - UpHeroState 를 보유하고, 비-세션 부분을 기기 로컬 파일에 JSON 으로 저장한다
//     (PersistedUpHeroState — UpHeroPersistence.swift). 웹 localStorage["uphero"] 대응.
//   - initialize(gameLevel:) 가 heroStartLevel seed + 오프라인 수련 보상을 적용.
//     영웅 XP 는 GameStore 소관이라 지급량을 반환 → GameStore.enterUpHero 가 반영.
//
//  ── 다음 슬라이스 ──
//  장비 인벤토리, 버프 드로우, 전투(currentSession 영속화 포함),
//  세션 결과·전직, 스킬트리·도감. 주간 변종 seed 도 이후 슬라이스.
//
//  영웅 레벨/XP 의 진실의 원천은 GameStore.progress — UpHeroStore 가 소유하지 않는다.
//  (전투 세션 생성 시 그 시점 레벨을 스냅샷할 뿐. 웹 useUpHeroStore 와 동일.)
//

import Foundation
import Combine

@MainActor
final class UpHeroStore: ObservableObject {

    /// Up Hero 전체 상태. 화면은 이걸 구독하고, 변경은 스토어 액션으로만.
    @Published private(set) var state: UpHeroState

    init() {
        // 디스크에 저장된 상태가 있으면 복원, 없으면(최초 실행) 기본 상태.
        state = Self.loadPersisted() ?? Self.makeDefaultState()
    }

    // MARK: - 수명주기

    /// Up Hero 진입 시 1회 — heroStartLevel seed + 오프라인 수련 보상(idle accrual).
    /// 코인은 즉시 반영하고 idleReward 스냅샷을 저장한다 (아지트가 토스트로 표시).
    /// 영웅 XP 의 진실의 원천은 GameStore.progress 라 XP 는 여기서 더하지 않고
    /// 지급할 양을 반환 — 호출부(GameStore.enterUpHero)가 progress 에 반영한다.
    /// 웹 useUpHeroStore.initialize() 대응. 이미 로드됐으면 0 (1회성).
    func initialize(gameLevel: Int) -> Int {
        guard !state.isLoaded else { return 0 }

        var s = state
        s.isLoaded = true
        let now = Self.nowMillis()

        // heroStartLevel seed — 최초 1회. 웹은 기존 저장 데이터 마이그레이션
        //   휴리스틱(hasPlayedUpHero)으로 1 또는 curLevel 을 정하지만, 네이티브 앱은
        //   항상 brand-new 진입이라 curLevel 로 seed (영웅 Lv 을 1부터 키운다).
        if s.heroStartLevel == nil {
            s.heroStartLevel = gameLevel
        }

        // 오프라인 수련 보상 — 영웅 effective 레벨 기준 (웹과 동일).
        //   클래스 XP/coin 배율은 전직 슬라이스에서 — 현재 영웅은 무직이라 ×1.
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: s.heroStartLevel)
        var grantedXP = 0
        let rewound = IdleAccrual.detectClockRewind(
            now: now, lastSeenAt: s.lastSeenAt, lastIdleAt: s.lastIdleAccrualAt)
        if !rewound,
           let reward = IdleAccrual.calculateIdleReward(
               elapsedMs: now - s.lastIdleAccrualAt, level: heroLevel) {
            s.coins += reward.coins
            s.idleReward = IdleRewardSnapshot(
                xp: reward.xp, coins: reward.coins,
                elapsedMin: reward.elapsedMin, rawElapsedMin: reward.rawElapsedMin)
            s.lastIdleAccrualAt = now   // 보상 지급분만큼 누적 기준점 이동
            grantedXP = reward.xp
        }
        s.lastSeenAt = now              // 시계 rewind 감지 기준 — 매 진입 갱신

        state = s
        persist()
        return grantedXP
    }

    /// idle 보상 토스트 확인 — 스냅샷을 비운다. transient 라 저장은 불필요.
    func acknowledgeIdleReward() {
        state.idleReward = nil
    }

    /// 로그아웃 — 메모리 상태를 디스크 저장본 기준으로 다시 맞춘다.
    /// Up Hero 는 기기 로컬 데이터라 로그아웃해도 저장 파일은 보존한다 (웹 localStorage
    /// 와 동일). 메모리만 저장본으로 되돌려, 이후 영속화가 어긋난 상태를 덮어쓰지
    /// 않게 한다. 다음 로그인 시 저장본이 그대로 복원된다.
    func resetForSignOut() {
        state = Self.loadPersisted() ?? Self.makeDefaultState()
    }

    // MARK: - 장비 (웹 equipItem / unequipItem / sellItem / discardItem)

    /// 인벤토리 장비를 해당 슬롯에 장착. 슬롯에 기존 장비가 있으면 인벤토리로 되돌린다.
    /// 슬롯은 item.type 으로 결정 (웹 equipItem 의 slot 인자는 item.type 과 동일).
    func equipItem(_ itemId: String) {
        mutate { s in
            guard let item = s.inventory.first(where: { $0.id == itemId }) else { return }
            s.inventory.removeAll { $0.id == itemId }
            if let existing = s.hero.equipped[item.type] {
                s.inventory.append(existing)
            }
            s.hero.equipped[item.type] = item
        }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardSelect)
    }

    /// 슬롯의 장비를 해제해 인벤토리로 되돌린다. 웹 unequipItem.
    func unequipItem(_ slot: EquipSlot) {
        mutate { s in
            guard let item = s.hero.equipped[slot] else { return }
            s.hero.equipped[slot] = nil
            s.inventory.append(item)
        }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardSelect)
    }

    /// 인벤토리 장비 판매 — 등급별 코인 환급. 반환: 환급액(없으면 0). 웹 sellItem.
    @discardableResult
    func sellItem(_ itemId: String) -> Int {
        guard let item = state.inventory.first(where: { $0.id == itemId }) else { return 0 }
        let refund = UpHeroRules.sellPrice[item.rarity] ?? 0
        mutate { s in
            s.inventory.removeAll { $0.id == itemId }
            s.coins += refund
        }
        Haptics.play(.light)
        SoundPlayer.shared.play(.cancel)
        return refund
    }

    /// 인벤토리 장비 버리기 — 환급 없음. 웹 discardItem.
    func discardItem(_ itemId: String) {
        mutate { s in
            s.inventory.removeAll { $0.id == itemId }
        }
        Haptics.play(.light)
        SoundPlayer.shared.play(.cancel)
    }

    /// 상태 변경 + 발행 + 로컬 영속화 — 상태를 바꾸는 Up Hero 액션의 공통 경로.
    /// (GameStore.mutateProgress 의 Up Hero 판.)
    private func mutate(_ change: (inout UpHeroState) -> Void) {
        var s = state
        change(&s)
        state = s
        persist()
    }

    // MARK: - 던전 진입 준비 (웹 prepareBuffDraw / cancelBuffDraw)

    /// 던전 진입 전 버프 카드 6장 드로우 → pendingDungeon 에 저장. 웹 prepareBuffDraw.
    /// ownedCardIds 는 사용자 해금 카드 (GameStore.progress.unlockedCardIds — 호출부 전달).
    /// 웹의 탐험권(passes) 게이팅은 패스 경제(상점·챌린지 보상) 슬라이스에서 — 지금은 생략.
    func prepareBuffDraw(dungeonId: DungeonId, ownedCardIds: [String]) {
        let ownedSet = Set(ownedCardIds)
        let owned = CardCatalog.allCards.filter { ownedSet.contains($0.id) }
        let drawn = BuffDraw.drawBuffCards(owned: owned, dungeonId: dungeonId, drawCount: 6)
        mutate {
            $0.pendingDungeon = PendingDungeonPrep(
                dungeonId: dungeonId, drawnCardIds: drawn.map(\.id))
        }
    }

    /// 버프 드로우 취소 — pendingDungeon 클리어. 웹 cancelBuffDraw.
    func cancelBuffDraw() {
        mutate { $0.pendingDungeon = nil }
    }

    // MARK: - 전투 세션 (웹 confirmDungeon / abandonSession)

    /// 버프 선택 확정 → 전투 세션 생성. 웹 confirmDungeon.
    /// gameLevel 은 영웅 effective 레벨 산출용 (GameStore.progress.level — 호출부 전달).
    /// 탐험권(passes) 소비는 패스 경제 슬라이스에서.
    func confirmDungeon(selectedCardIds: [String], gameLevel: Int) {
        guard let prep = state.pendingDungeon else { return }
        let dungeonId = prep.dungeonId

        // 선택 카드 → 버프 (CardBuffs.getCardBuff)
        let buffs: [CardBuff] = selectedCardIds
            .compactMap { id in CardCatalog.allCards.first { $0.id == id } }
            .map(CardBuffs.getCardBuff)

        // 영웅 레벨 성장 반영 + 시작 층 (재진입 체크포인트 +1)
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: state.heroStartLevel)
        let leveledHero = UpHeroRules.computeHeroForLevel(state.hero, level: heroLevel)
        let startFloor = (state.dungeons[dungeonId]?.floorReached ?? 0) + 1

        var rng = SystemRandom()
        let session = UpHeroSession.createSession(
            dungeonId: dungeonId, hero: leveledHero, startFloor: startFloor,
            activeBuffs: buffs,
            options: CreateSessionOptions(
                ngPlusLevel: state.ngPlusLevel, isWeeklyVariant: nil,
                weeklyAffixId: nil, heroLevel: heroLevel),
            rng: &rng)

        mutate {
            $0.currentSession = session
            $0.pendingDungeon = nil
        }
        Haptics.play(.medium)  // 탐험 출발
        SoundPlayer.shared.play(.confirm)
    }

    /// 탐험 포기 — 세션을 .completed(heroAbandoned)로 종료시킨다. 웹 abandonSession.
    /// 즉시 비우지 않고 정상 종료 처리 → 결산 화면을 거쳐 그때까지 모은 보상을
    /// acknowledgeSessionEnd 에서 지급한다 (포기해도 번 건 챙긴다).
    func abandonSession() {
        guard let session = state.currentSession else { return }
        state.currentSession = UpHeroSession.abandonSession(session)
    }

    /// 완료된 세션 결산 — 보상을 반영하고 세션을 비운다. 웹 acknowledgeSessionEnd.
    /// 코인·장비(사망 시 절반)·던전 진행·코덱스·NG+ 는 여기서 반영하고, XP 는
    /// GameStore.progress 소관이라 지급량만 반환한다 (호출부가 progress 에 적용).
    /// 반환: 지급할 XP (세션 없음/미완료면 0).
    @discardableResult
    func acknowledgeSessionEnd() -> Int {
        guard let session = state.currentSession,
              session.status == .completed else { return 0 }
        var rng = SystemRandom()

        // 보상 계산 — sessionReward.ts 의 순수 helper (state-in → 값-out).
        let keptDrops = SessionReward.calculateKeptDrops(session, rng: &rng)
        let prevProgress = state.dungeons[session.dungeonId]
        let prevBosses = prevProgress?.bossesDefeated ?? []
        let newBosses = SessionReward.calculateBossesDefeated(
            log: session.log, existing: prevBosses)
        let newDungeonProgress = SessionReward.calculateDungeonProgress(
            session: session, existing: prevProgress, newBossesDefeated: newBosses)
        let newCodex = SessionReward.calculateCodexDelta(
            log: session.log, current: state.codex)
        // NG+ — F30 보스를 이번 세션에 처음 처치 시 +1 (weekly variant 제외).
        let clearedF30Newly = newBosses.contains(30) && !prevBosses.contains(30)

        mutate { s in
            s.coins += session.rewards.coins
            s.inventory.append(contentsOf: keptDrops)
            s.dungeons[session.dungeonId] = newDungeonProgress
            s.codex = newCodex
            if clearedF30Newly, session.isWeeklyVariant != true {
                s.ngPlusLevel = (s.ngPlusLevel ?? 0) + 1
            }
            s.currentSession = nil
        }
        return session.rewards.xp
    }

    // MARK: - 전투 진행 (웹 tickSession / resolveChoice / resolveMinigame)

    /// 전투 한 스텝 진행 — status 에 따라 tick / 선택 자동결정 / 미니게임 자동해결 /
    /// 보스 자동재개. 슬라이스 22 는 자동 진행 — 이벤트 선택지 인터랙션은 다음 슬라이스.
    /// currentSession 은 영속 대상이 아니므로(PersistedUpHeroState 제외) persist 를
    /// 건너뛴다 — 매 tick 파일 쓰기 방지.
    func advanceCombat() {
        guard var session = state.currentSession else { return }
        let wasOngoing = session.status != .completed
        var rng = SystemRandom()
        switch session.status {
        case .active:
            session = UpHeroSession.tickSession(
                session, flavor: FlavorPool.bundled, rng: &rng)
        case .paused:
            // 보스 등장 연출 — 슬라이스 22 는 자동 재개 (인트로 연출은 이후 슬라이스).
            session.status = .active
        case .awaitingChoice:
            // 사용자가 선택지를 고를 때까지 대기 — resolveChoice 가 전투를 재개시킨다.
            return
        case .awaitingMinigame:
            // 미니게임은 Phase 4.6 — 자동 성공 처리 (미구현 기능으로 벌점 X).
            session = UpHeroSession.resolveMinigame(session, success: true, rng: &rng)
        case .completed:
            return
        }
        // 이번 스텝에 탐험이 끝났으면 결산 햅틱·사운드 (매 tick 이 아니라 종료 1회).
        // fullClear — 던전 결산은 데일리 풀클리어급 임팩트.
        if wasOngoing, session.status == .completed {
            Haptics.play(.success)
            SoundPlayer.shared.play(.fullClear)
        }
        state.currentSession = session
    }

    /// 이벤트 선택지 해결 — 사용자가 고른 옵션으로 전투를 재개시킨다. 웹 resolveChoice.
    /// currentSession 만 바꾸므로 persist 생략 (advanceCombat 과 동일).
    func resolveChoice(_ optionIndex: Int) {
        guard let session = state.currentSession,
              session.status == .awaitingChoice else { return }
        var rng = SystemRandom()
        state.currentSession = UpHeroSession.resolveChoice(
            session, optionIndex: optionIndex, rng: &rng)
    }

    // MARK: - 상점 (웹 purchase* 의 코인 차감부)

    /// 코인 차감 — 잔액이 충분하면 차감 후 true, 부족하면 false. 웹 purchase* 공통.
    /// 구매 품목 지급은 호출부(GameStore.buyCardPack 등)가 담당 — 코인만 여기서.
    @discardableResult
    func spendCoins(_ amount: Int) -> Bool {
        guard state.coins >= amount else { return false }
        mutate { $0.coins -= amount }
        return true
    }

    // MARK: - 전직 (웹 assignClass / confirmClassChoice)

    /// 영웅 전직 — classType 을 확정한다. 이미 전직했으면 no-op. 웹 assignClass.
    /// 진행 중 세션이 있으면 그 hero 스냅샷의 classType 도 동기화.
    /// 스킬트리(learnedSkills)는 condensed — 전직 슬라이스에선 classType 만 설정한다
    /// (전투 엔진은 classType 기반 스탯·자원만 적용, 클래스 액티브 스킬은 이후).
    func assignClass(_ classType: ClassType) {
        guard state.hero.classType == nil else { return }
        mutate { s in
            s.hero.classType = classType
            s.currentSession?.hero.classType = classType
        }
        Haptics.play(.celebration)  // 전직 — 큰 분기 순간
        SoundPlayer.shared.play(.levelUp)
    }

    // MARK: - 사진 부적 (웹 PhotoTalisman)

    /// 인증 사진을 부적 장비로 만들어 인벤토리에 추가. 웹 사진 부적 시스템.
    /// condensed — 부적은 사진 id 참조 + 기본 스탯만 (passive talismanSkills 는
    /// 웹 매핑이 복잡해 이후 슬라이스로 유보). 장착하면 스탯이 전투에 반영된다.
    func createPhotoTalisman(photoId: String) {
        let talisman = Equipment(
            id: "talisman_photo_\(Self.nowMillis())",
            name: "추억의 부적", baseId: nil, type: .talisman,
            rarity: .rare, category: .wellness, iconName: "photo",
            stats: [.vit: 3, .agi: 2], effects: nil,
            flavor: "성장의 순간을 담은 부적.", photoId: photoId,
            enhanceLevel: nil, enhanceFailStreak: nil,
            affix: nil, affixes: nil, talismanSkills: nil)
        mutate { $0.inventory.append(talisman) }
        Haptics.play(.success)
        SoundPlayer.shared.play(.complete)
    }

    // MARK: - 로컬 영속화 (웹 localStorage["uphero"])

    /// 현재 상태를 디스크에 저장. 상태를 바꾸는 액션이 호출한다 (best-effort).
    private func persist() {
        Self.savePersisted(state)
    }

    /// 저장 파일 — Application Support/uphero.json.
    private static var persistenceURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
        return dir.appendingPathComponent("uphero.json")
    }

    /// 디스크에서 상태 복원. 파일이 없거나 손상되면 nil → 호출부가 기본 상태로 폴백.
    private static func loadPersisted() -> UpHeroState? {
        guard let data = try? Data(contentsOf: persistenceURL),
              let persisted = try? JSONDecoder().decode(PersistedUpHeroState.self, from: data)
        else { return nil }
        return persisted.toState()
    }

    /// 상태의 영속 부분(PersistedUpHeroState)을 디스크에 기록. 실패는 무시한다.
    private static func savePersisted(_ state: UpHeroState) {
        let url = persistenceURL
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(PersistedUpHeroState(state)) else { return }
        try? data.write(to: url, options: .atomic)
    }

    /// 현재 시각 (epoch ms) — 웹 Date.now() 대응.
    static func nowMillis() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    // MARK: - 기본 상태 팩토리 (웹 useUpHeroStore 초기 상태 리터럴)

    static func makeDefaultState() -> UpHeroState {
        let now = nowMillis()
        return UpHeroState(
            hero: UpHeroRules.createDefaultHero(),
            inventory: [],
            coins: 0,
            passes: [:],
            dungeons: [:],
            currentSession: nil,
            pendingDungeon: nil,
            codex: Codex(monsters: [], equipment: [], bosses: []),
            cosmetics: Cosmetics(tentColor: nil, campfire: nil),
            lastIdleAccrualAt: now,
            lastSeenAt: now,
            heroStartLevel: nil,        // initialize 에서 seed (슬라이스 16~)
            shopDaily: nil,
            ngPlusLevel: 0,
            weeklyVariant: nil,
            schemaVersion: nil,
            hasSeenCampTutorial: false,
            idleReward: nil,            // transient
            pendingClassAwaken: nil,    // transient
            pendingClassChoice: nil,    // transient
            isLoaded: false
        )
    }
}
