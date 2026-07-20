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
    func acknowledgeSessionEnd(gameLevel: Int? = nil) -> Int {
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

        // 17-leaderboard-dummy — 주간 변종 세션이면 clearedDungeons/bestScore 갱신 +
        //   최고 점수 경신 시 Firestore 업로드(fire-and-forget). 웹 useUpHeroStore.ts:1373-1405.
        //   F30 미도달 실패도 floorsCleared 기반 점수는 산출(웹 R2). 세션 로그의 F30 보스
        //   victory 유무로 클리어 판정(prevBosses 와 무관 — 웹 R3).
        var uploadPayload: (score: Int, floors: Int, heroLevel: Int, clsRaw: String?)?
        if session.isWeeklyVariant == true, let weekly = state.weeklyVariant {
            let bossesThisSession = SessionReward.calculateBossesDefeated(
                log: session.log, existing: [])
            let clearedF30 = bossesThisSession.contains(30)
            let reachedFloors = max(0, session.currentFloor - session.startFloor)
            let floorsCleared = clearedF30 ? reachedFloors + 1 : reachedFloors
            // 웹 파리티: 정산 시점에 gameLevel-heroStartLevel+1 재계산 — 세션 도중
            // 챌린지 XP 로 레벨업하면 시작 스냅샷(session.heroLevel)은 낮은 점수를
            // isNewBest 로 영구 업로드하는 비가역 결함이 있었다(코드리뷰 must-fix).
            // gameLevel 미전달 폴백만 스냅샷 사용.
            let heroLv: Int
            if let gl = gameLevel {
                heroLv = UpHeroRules.getEffectiveHeroLevel(
                    gameLevel: gl, heroStartLevel: state.heroStartLevel)
            } else {
                heroLv = max(1, session.heroLevel ?? 1)
            }
            let score = UpHeroRules.computeWeeklyScore(
                floorsCleared: floorsCleared, remainingTime: session.time, heroLevel: heroLv)
            let isNewBest = score > weekly.bestScore
            if isNewBest {
                uploadPayload = (score, floorsCleared, heroLv, session.hero.classType?.rawValue)
            }
        }

        mutate { s in
            s.coins += session.rewards.coins
            s.inventory.append(contentsOf: keptDrops)
            s.dungeons[session.dungeonId] = newDungeonProgress
            s.codex = newCodex
            if clearedF30Newly, session.isWeeklyVariant != true {
                s.ngPlusLevel = (s.ngPlusLevel ?? 0) + 1
            }
            // 주간 변종 최고 점수 갱신 + 클리어 던전 기록 (state commit 후 업로드는 아래).
            if session.isWeeklyVariant == true, var weekly = s.weeklyVariant {
                if let payload = uploadPayload {
                    weekly.bestScore = max(weekly.bestScore, payload.score)
                    let bosses = SessionReward.calculateBossesDefeated(log: session.log, existing: [])
                    if bosses.contains(30), !weekly.clearedDungeons.contains(session.dungeonId) {
                        weekly.clearedDungeons.append(session.dungeonId)
                    }
                }
                s.weeklyVariant = weekly
            }
            s.currentSession = nil
        }

        // state commit 뒤 fire-and-forget 업로드(웹 R1 — atomic 순서 고정). 성공 시에만
        //   lastUploadedAt 갱신(웹 R3). 익명/미로그인은 서비스 내부에서 skip.
        if let payload = uploadPayload {
            let week = state.weeklyVariant?.week ?? RetentionEngine.weekId(for: AppClock.todayString())
            let anon = AppConfig.loc("익명 영웅")
            let clearedAt = Self.nowMillis()
            Task { [weak self] in
                let result = await WeeklyLeaderboardService.uploadWeeklyScore(
                    weekId: week, score: payload.score, floorsCleared: payload.floors,
                    heroLevel: payload.heroLevel, classType: payload.clsRaw,
                    clearedAt: clearedAt, anonymousFallback: anon)
                // Task 는 @MainActor UpHeroStore 컨텍스트를 상속 — await 이후 다시 메인.
                guard result == .ok, let self else { return }
                if self.state.weeklyVariant?.week == week {
                    self.mutate { $0.weeklyVariant?.lastUploadedAt = Self.nowMillis() }
                }
            }
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
            // R8 — 미니게임은 UI 가 resolveMinigameResult(success:) 로 처리.
            // 여기선 자동 진행하지 않고 대기 — DungeonView 가 MinigameRouter 오버레이를 띄움.
            return
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

    /// R8 — 모든 영웅 데이터 리셋. 로컬 캐시 삭제 + 메모리 상태 초기.
    /// 파일 삭제는 savePersisted 와 같은 serial ioQueue 로 넘겨, 리셋 직전 in-flight
    /// write 가 리셋 뒤에 도착해 파일을 되살리는 race 를 막는다(FIFO 순서 보장).
    func resetAllData() {
        state = Self.makeDefaultState()
        let url = Self.persistenceURL
        Self.ioQueue.async { try? FileManager.default.removeItem(at: url) }
    }

    /// R8 — 장비 강화. 100 코인 소모. 70% success / 20% keep / 10% destroyed.
    /// 결과는 caller 가 EnhanceRitualOverlay 로 표시. 실제 변경은 outcome 에 따라.
    @discardableResult
    func enhanceItem(_ itemId: String) -> EnhanceRitualOutcome {
        guard let idx = state.inventory.firstIndex(where: { $0.id == itemId }) else {
            return .keep
        }
        guard state.coins >= 100 else { return .keep }
        mutate { $0.coins -= 100 }
        let roll = Double.random(in: 0..<1)
        if roll < 0.10 {
            // destroyed
            mutate { $0.inventory.removeAll(where: { $0.id == itemId }) }
            return .destroyed
        } else if roll < 0.30 {
            return .keep
        } else {
            // success — enhanceLevel +1
            mutate {
                var item = $0.inventory[idx]
                item.enhanceLevel = (item.enhanceLevel ?? 0) + 1
                $0.inventory[idx] = item
            }
            return .success
        }
    }

    /// R8 — 미니게임 결과 해소. UI 가 호출 — success/fail 에 따라 successEffects/failEffects 적용.
    func resolveMinigameResult(success: Bool) {
        guard let session = state.currentSession,
              session.status == .awaitingMinigame else { return }
        var rng = SystemRandom()
        state.currentSession = UpHeroSession.resolveMinigame(
            session, success: success, rng: &rng)
        if success {
            Haptics.play(.success)
            SoundPlayer.shared.play(.matchPair)
        } else {
            Haptics.play(.warning)
        }
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

    /// 코인 적립 — 컬렉션 완료/팩 환산/미니게임 보상에서 GameStore 가 호출.
    func addCoins(_ amount: Int) {
        guard amount > 0 else { return }
        mutate { $0.coins += amount }
    }

    /// 챌린지 완료 보상 탐험권. 웹 `grantExpeditionPass`.
    func grantExpeditionPass(_ category: Category, _ rarity: Rarity) {
        let gain = UpHeroRules.passGrantByRarity[rarity] ?? 1
        mutate { s in
            let current = s.passes[category] ?? 0
            s.passes[category] = min(UpHeroRules.passCapPerCategory, current + gain)
        }
    }

    // MARK: - 상점 구매 (22-shop-tickets — 웹 purchasePass / claimCoinPouch 1:1 이식)

    /// 탐험권 구매 결과. 웹 `purchasePass` 반환값("ok"/"no-coin"/"daily-cap"/"pass-cap") 대응.
    enum PurchasePassResult { case ok, noCoin, dailyCap, passCap }

    /// 탐험권 구매 — 던전별 1장, ShopPrices.expeditionPass(80) 코인. 오늘 날짜가 아니면
    /// shopDaily 를 리셋 후 진행. 일일 총 구매 cap(dailyPassPurchaseCap=8) → 던전별 보유
    /// cap(passCapPerCategory=20) 순으로 검사. 웹 useUpHeroStore.ts:1545-1580 `purchasePass`.
    @discardableResult
    func purchasePass(_ dungeonId: DungeonId) -> PurchasePassResult {
        let price = ShopPrices.expeditionPass                 // 80
        guard state.coins >= price else { return .noCoin }
        let today = AppClock.todayString()
        var daily = (state.shopDaily?.date == today)
            ? state.shopDaily!
            : ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil)
        guard daily.passesBought < UpHeroRules.dailyPassPurchaseCap else { return .dailyCap }   // 8
        let current = state.passes[dungeonId] ?? 0
        guard current < UpHeroRules.passCapPerCategory else { return .passCap }                 // 20
        daily.passesBought += 1
        mutate { s in
            s.coins -= price
            s.passes[dungeonId] = current + 1
            s.shopDaily = daily
        }
        return .ok
    }

    /// 데일리 코인 주머니 — 하루 1회 무료, [coinPouchMin, coinPouchMax](20...160) 균등 랜덤
    /// 코인 지급. 오늘 이미 수령했으면 실패. 웹 useUpHeroStore.ts:1582-1608 `claimCoinPouch`.
    /// 반환: (성공 여부, 지급 코인 — 실패 시 0).
    @discardableResult
    func claimCoinPouch() -> (ok: Bool, coins: Int) {
        let today = AppClock.todayString()
        var daily = (state.shopDaily?.date == today)
            ? state.shopDaily!
            : ShopDaily(date: today, passesBought: 0, coinPouchClaimed: nil)
        guard daily.coinPouchClaimed != true else { return (false, 0) }
        let rolled = Int.random(in: UpHeroRules.coinPouchMin...UpHeroRules.coinPouchMax)  // 20...160
        daily.coinPouchClaimed = true
        mutate { s in
            s.coins += rolled
            s.shopDaily = daily
        }
        return (true, rolled)
    }

    func grantSkillPoints(_ points: Int) {
        guard points > 0 else { return }
        mutate { $0.hero.skillPoints = ($0.hero.skillPoints ?? 0) + points }
    }

    enum LearnSkillResult { case ok, already, notFound, noClass, needLevel, noPoints }

    /// Phase 12d — 스킬트리에서 스킬 포인트로 클래스 스킬 해금. 웹 `learnSkill` 동치.
    /// gameLevel 은 호출부(뷰)가 store.progress.level 로 주입(confirmDungeon 패턴).
    @discardableResult
    func learnSkill(_ skillId: String, gameLevel: Int) -> LearnSkillResult {
        guard let cls = state.hero.classType else { return .noClass }
        guard let skill = ClassSkills.findSkillById(skillId) else { return .notFound }
        guard skill.skillClass.rawValue == cls.rawValue else { return .noClass }
        let heroLevel = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: state.heroStartLevel)
        guard heroLevel >= skill.requiredLevel else { return .needLevel }
        let learned = state.hero.learnedSkills ?? []
        guard !learned.contains(skillId) else { return .already }
        let points = state.hero.skillPoints ?? 0
        guard points >= skill.pointCost else { return .noPoints }
        mutate { s in
            s.hero.learnedSkills = learned + [skillId]
            s.hero.skillPoints = points - skill.pointCost
        }
        Haptics.play(.celebration)   // 스킬 해금 — 성장 순간
        SoundPlayer.shared.play(.levelUp)
        return .ok
    }

    /// 전직 전 튜토리얼 스킬 자동 해금. 웹 `grantNoviceSkills`.
    func grantNoviceSkills(_ level: Int) {
        let unlocks: [String]
        switch level {
        case 15...:
            unlocks = ClassSkills.noviceSkills.map(\.id)
        case 5...:
            unlocks = Array(ClassSkills.noviceSkills.prefix(2)).map(\.id)
        case 1...:
            unlocks = Array(ClassSkills.noviceSkills.prefix(1)).map(\.id)
        default:
            unlocks = []
        }
        guard !unlocks.isEmpty else { return }
        mutate { s in
            var learned = s.hero.learnedSkills ?? []
            for id in unlocks where !learned.contains(id) {
                learned.append(id)
            }
            s.hero.learnedSkills = learned
        }
    }

    /// Lv30 도달 시 클래스 선택 모달을 준비. 이미 전직했거나 대기 중이면 no-op.
    func proposeClassChoice() {
        guard state.hero.classType == nil, state.pendingClassChoice == nil else { return }
        let recommendedDungeon = state.passes.max(by: { $0.value < $1.value })?.key
        let recommended: ClassType
        if let recommendedDungeon,
           let classType = UpHeroRules.classByDungeon[recommendedDungeon] {
            recommended = classType
        } else {
            recommended = .warrior
        }
        mutate { $0.pendingClassChoice = PendingClassChoice(recommended: recommended) }
    }

    // MARK: - 전직 (웹 assignClass / confirmClassChoice)

    /// 영웅 전직 — classType 을 확정한다. 이미 전직했으면 no-op. 웹 assignClass.
    /// 진행 중 세션이 있으면 그 hero 스냅샷의 classType 도 동기화.
    /// 스킬트리(learnedSkills)는 condensed — 전직 슬라이스에선 classType 만 설정한다
    /// (전투 엔진은 classType 기반 스탯·자원만 적용, 클래스 액티브 스킬은 이후).
    func assignClass(_ classType: ClassType) {
        guard state.hero.classType == nil else { return }
        // Phase 12d / Bug 2026-04 — 전직 시 해당 클래스 T1 스킬 자동 해금 +
        // learnedSkills 를 [T1] 로 완전 초기화(novice 스킬 제거 — 전직 후엔 클래스
        // 스킬트리로 성장). 진행 중 세션 hero snapshot 도 동기화해 회귀 방지.
        let t1 = ClassSkills.classSkillTrees[classType]?.first { $0.tier == 1 }
        let learned = t1.map { [$0.id] } ?? []
        mutate { s in
            s.hero.classType = classType
            s.hero.learnedSkills = learned
            s.currentSession?.hero.classType = classType
            s.currentSession?.hero.learnedSkills = learned
            s.pendingClassChoice = nil   // 전직 확정 → 자동 제안 소비
        }
        Haptics.play(.celebration)  // 전직 — 큰 분기 순간
        SoundPlayer.shared.play(.levelUp)
    }

    /// Lv.30 자동 전직 제안을 사용자가 닫았을 때(전직 안 하고 나감) — 제안 소비.
    /// 다시 보려면 아지트 '전직' CTA(classEligible) 로 진입.
    func acknowledgeClassChoice() {
        guard state.pendingClassChoice != nil else { return }
        mutate { $0.pendingClassChoice = nil }
    }

    // MARK: - 영웅 이름 / 자동 스킬 (웹 renameHero / toggleAutoSkill — HeroStatPanel)

    /// 영웅 이름 변경 — 16자 cap + 공백 trim. 웹 renameHero.
    func renameHero(_ name: String) {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(16))
        guard !trimmed.isEmpty, trimmed != state.hero.name else { return }
        mutate { $0.hero.name = trimmed }
    }

    /// 아지트 첫 진입 튜토리얼을 읽음으로 기록(persist). 재호출은 no-op. 웹 markCampTutorialSeen.
    func markCampTutorialSeen() {
        guard state.hasSeenCampTutorial != true else { return }
        mutate { $0.hasSeenCampTutorial = true }
    }

    #if DEBUG
    /// UITest 전용 — 도감 발견 상태를 *실제 기록 경로*(SessionReward.calculateCodexDelta)로
    /// 시드한다. 전투 로그(.encounter/.drop)를 구성해 acknowledgeSessionEnd 와 동일한
    /// 함수로 codex 를 갱신 → "처치 후 도감 발견" 을 결정론적으로 재현(도감 표시 버그 검증용).
    func seedCodexFromCombatForUITests() {
        let pool = MonsterPool.templates[.fitness]!
        let m1 = MonsterPool.scaleMonster(pool.normal[2], dungeonId: .fitness, floor: 5)   // 산악 늑대
        let m2 = MonsterPool.scaleMonster(pool.normal[3], dungeonId: .fitness, floor: 6)   // 돌산 곰
        let m3 = MonsterPool.scaleMonster(pool.normal[6], dungeonId: .fitness, floor: 8)   // 절벽 독수리
        let boss = MonsterPool.scaleMonster(pool.bosses[0], dungeonId: .fitness, floor: 10) // 알파 늑대
        let log: [LogEntry] = [
            .encounter(monster: m1, timestamp: 0),
            .encounter(monster: m2, timestamp: 1),
            .encounter(monster: m3, timestamp: 2),
            .boss(monster: boss, floor: 10, timestamp: 3),
            .encounter(monster: boss, timestamp: 4),
        ]
        let newCodex = SessionReward.calculateCodexDelta(log: log, current: state.codex)
        mutate { $0.codex = newCodex }
    }
    #endif

    /// 액티브 스킬 자동 발동 on/off 토글. 웹 toggleAutoSkill.
    func toggleAutoSkill() {
        mutate { $0.hero.autoSkillEnabled = !($0.hero.autoSkillEnabled ?? true) }
    }

    /// 전투 중 스킬 수동 발동 (웹 SkillBar 탭). canFireSkill 통과 시 fireSkill 적용 →
    /// 자원 차감·쿨다운·효과. 결과(몬스터 사망 등)는 다음 tick 의 advanceCombat 가 처리.
    func fireSkillManual(_ skillId: String) {
        guard var s = state.currentSession, s.status == .active else { return }
        let idx = UpHeroCombat.findLastEncounterIndex(s.log)
        var monster: Monster?
        if idx >= 0, case let .encounter(m, _) = s.log[idx] { monster = m }
        guard ClassSkills.fireSkill(&s, skillId: skillId, monster: monster) else { return }
        Haptics.play(.heavy)
        SoundPlayer.shared.play(.impactShake)
        mutate { $0.currentSession = s }
    }

    // MARK: - 사진 부적 (웹 PhotoTalisman — 풀 시스템: rarity roll·코인·재의식·스킬)

    struct PhotoTalismanResult { let ok: Bool; let item: Equipment?; let error: String? }
    private func talismanFail(_ msg: String) -> PhotoTalismanResult {
        SoundPlayer.shared.play(.cancel)
        return PhotoTalismanResult(ok: false, item: nil, error: msg)
    }

    /// 사진 → 부적 최초 바인딩. 코인(80) 소모 + 랜덤 rarity roll + category 스탯.
    /// 웹 bindPhotoAsTalisman 동치. 사진 메타는 호출부(뷰)가 GrowthStore 에서 주입.
    @discardableResult
    func bindPhotoAsTalisman(photo: PhotoMeta) -> PhotoTalismanResult {
        guard !PhotoTalisman.isBound(photo.id, inventory: state.inventory,
                                     equipped: state.hero.equipped) else {
            return talismanFail(AppConfig.loc("이미 부적으로 만든 사진이에요"))
        }
        guard state.coins >= PhotoTalisman.ritualCost else {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(PhotoTalisman.ritualCost) 필요)"))
        }
        var rng = SystemRandom()
        let rarity = PhotoTalisman.rollRarity(&rng)
        let item = PhotoTalisman.build(photo: photo, rarity: rarity)
        mutate {
            $0.inventory.append(item)
            $0.coins -= PhotoTalisman.ritualCost
        }
        Haptics.play(.success)
        SoundPlayer.shared.play(.complete)
        return PhotoTalismanResult(ok: true, item: item, error: nil)
    }

    /// 재의식 — 바인딩된 부적 enhanceLevel +1 (rarity 유지, 스탯 미미 상승, +5/+10 스킬).
    /// 코인은 현재 레벨 스케일. 웹 rebindPhotoTalisman 동치. 장착 중인 부적도 in-place 교체.
    @discardableResult
    func rebindPhotoTalisman(photoId: String) -> PhotoTalismanResult {
        guard let found = PhotoTalisman.findBound(photoId, inventory: state.inventory,
                                                  equipped: state.hero.equipped) else {
            return talismanFail(AppConfig.loc("바인딩된 부적이 아니에요"))
        }
        let cur = found.item.enhanceLevel ?? 0
        guard cur < PhotoTalisman.maxEnhanceLevel else {
            return talismanFail(AppConfig.loc("이미 최대 강화(+\(PhotoTalisman.maxEnhanceLevel))예요"))
        }
        let cost = PhotoTalisman.rebindCost(currentLevel: cur)
        guard state.coins >= cost else {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(cost) 필요)"))
        }
        let newItem = PhotoTalisman.rebuild(current: found.item, newLevel: cur + 1)
        mutate { s in
            s.coins -= cost
            switch found.location {
            case .inventory:
                if let idx = s.inventory.firstIndex(where: { $0.id == found.item.id }) {
                    s.inventory[idx] = newItem
                }
            case .equipped:
                for (slot, eq) in s.hero.equipped where eq.id == found.item.id {
                    s.hero.equipped[slot] = newItem
                }
            }
        }
        Haptics.play(.success)
        SoundPlayer.shared.play(.complete)
        return PhotoTalismanResult(ok: true, item: newItem, error: nil)
    }

    /// 3초 의식 진행 중인 사진. AlbumView 가 구독해 PhotoTalismanRitual 오버레이를 띄운다.
    /// transient — 영속 대상 아님. 부적 생성은 의식 종료 시 completePhotoTalismanRitual().
    @Published var pendingTalismanPhoto: PhotoMeta?
    /// 의식 결과 부적 — 종료 후 reveal 용(있으면 AlbumView/picker 가 표시).
    @Published var lastTalismanReveal: Equipment?

    /// 부적 의식 시작. 코인 부족·이미 바인딩이면 시작하지 않고 실패 반환.
    @discardableResult
    func beginPhotoTalismanRitual(photo: PhotoMeta) -> PhotoTalismanResult {
        guard pendingTalismanPhoto == nil else {
            return PhotoTalismanResult(ok: false, item: nil, error: nil)
        }
        if PhotoTalisman.isBound(photo.id, inventory: state.inventory, equipped: state.hero.equipped) {
            return talismanFail(AppConfig.loc("이미 부적으로 만든 사진이에요"))
        }
        if state.coins < PhotoTalisman.ritualCost {
            return talismanFail(AppConfig.loc("코인이 부족해요 (\(PhotoTalisman.ritualCost) 필요)"))
        }
        pendingTalismanPhoto = photo
        return PhotoTalismanResult(ok: true, item: nil, error: nil)
    }

    /// ritual 종료 시 호출. 부적을 실제 생성(bindPhotoAsTalisman)하고 pending 클리어.
    func completePhotoTalismanRitual() {
        guard let photo = pendingTalismanPhoto else { return }
        pendingTalismanPhoto = nil
        let result = bindPhotoAsTalisman(photo: photo)
        lastTalismanReveal = result.item
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

    /// 디스크 IO 전용 serial 큐 — encode + atomic write 를 메인스레드 밖에서 수행.
    /// 14-completion-delay: grantExpeditionPass(챌린지 완료마다 mutate→persist)가 메인에서
    ///   JSONEncoder.encode + write(.atomic = temp+fsync+rename)를 코얼레싱 없이 돌려 완료
    ///   틱의 메인스레드를 붙잡고 fullScreenCover/후속 입력을 지연시키던 비용을 오프메인.
    ///   serial 이라 write 순서(마지막 상태 우선)가 보장돼 torn write 없음.
    private static let ioQueue = DispatchQueue(
        label: "com.littlegd.upnext.uphero.persist", qos: .utility)

    /// 상태의 영속 부분(PersistedUpHeroState)을 디스크에 기록. 실패는 무시한다.
    private static func savePersisted(_ state: UpHeroState) {
        // 인코딩은 호출 컨텍스트(메인)에서 수행하고, 무거운 atomic 파일쓰기(temp+fsync+
        // rename — 완료 틱 메인을 붙잡던 진짜 blocking IO)만 background serial 큐로 넘긴다.
        // (인코딩을 큐 안에서 하면 @MainActor 격리 Codable 을 nonisolated 컨텍스트에서 쓰는
        //  경고가 나므로 Data 스냅샷을 만들어 넘긴다 — Data 는 Sendable.)
        let url = persistenceURL
        guard let data = try? JSONEncoder().encode(PersistedUpHeroState(state)) else { return }
        ioQueue.async {
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    /// 현재 시각 (epoch ms) — 웹 Date.now() 대응.
    static func nowMillis() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    // MARK: - 기본 상태 팩토리 (웹 useUpHeroStore 초기 상태 리터럴)

    static func makeDefaultState() -> UpHeroState {
        let now = nowMillis()
        // 기본 영웅 이름을 인앱 언어 풀에서 뽑는다 — language 미전달 시 ko 풀로 고정돼
        // 비한국어 사용자도 한국어 이름을 받던 버그 수정(heroNamePools 에 4개국어 존재).
        let appLang = Language(rawValue:
            AppConfig.sharedDefaults?.string(forKey: AppConfig.languageKey) ?? "ko") ?? .ko
        return UpHeroState(
            hero: UpHeroRules.createDefaultHero(language: appLang),
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
