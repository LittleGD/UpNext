//
//  GameStore.swift
//  UpNext — 앱 전역 게임 상태 스토어 (Phase 4 — Zustand → ObservableObject 재설계).
//
//  웹 src/store/useGameStore.ts 의 Zustand 스토어를 SwiftUI 반응형 스토어로 재설계.
//  Phase 4 는 화면 단위로 진행하며, 이 스토어도 화면이 요구하는 액션을 한 슬라이스씩
//  덧붙여 키운다 — 4,328줄 Zustand 액션을 일괄 포팅하지 않는다 (on-demand 포팅).
//
//  ── 슬라이스 1 (현재) ──
//  상태 컨테이너 + 기본 상태 팩토리 + 클라우드 부트스트랩.
//   - auth 상태를 구독 → 로그인 시 클라우드 데이터를 로드 (없으면 기본 상태 생성+업로드)
//   - getCloudData 의 .failed 는 기본 상태로 덮어쓰지 않음 (기존 데이터 보호)
//
//  ── 다음 슬라이스 ──
//  라이브 리스너(_setFromCloud + dailyProgressScore stale 가드), 일일 롤오버,
//  로컬 캐시(UserDefaults), 게임 액션(드로우/선택/완료 등).
//

import Foundation
import Combine

@MainActor
final class GameStore: ObservableObject {

    /// 앱 부팅 단계 — 루트 뷰가 이걸로 화면을 분기한다.
    enum BootPhase: Equatable {
        case launching      // Auth 상태 확인 중
        case needsSignIn    // 로그아웃 — 로그인 화면 필요
        case loading        // 로그인됨, 클라우드 데이터 로드 중
        case onboarding     // 신규 계정 — 온보딩 진행 중
        case ready          // progress/daily 준비 완료
        case failed(String) // 클라우드 로드 실패 — 재시도 필요
    }

    /// 인증·동기화 서비스 — 스토어가 소유하고 환경 객체로 함께 노출한다.
    let auth = AuthService()
    let sync = SyncManager()

    /// Up Hero RPG 스토어 — 함께 소유하고 환경 객체로 노출 (Phase 4.4).
    let upHero = UpHeroStore()

    /// Growth(인증 사진) 스토어 — 함께 소유하고 환경 객체로 노출 (Phase 4.5).
    let growth = GrowthStore()

    @Published private(set) var progress: UserProgress? {
        // 설정의 hapticEnabled 를 Haptics 헬퍼에 동기 — progress 가 바뀌는 모든
        // 경로(bootstrap·applyCloudUpdate·mutateProgress·onboarding)에서 자동 반영.
        didSet { Haptics.enabled = progress?.hapticEnabled ?? true }
    }
    @Published private(set) var daily: DailyState?
    @Published private(set) var phase: BootPhase = .launching

    /// 컬렉션 100% 최초 달성 축하 모달 트리거. openCardPack 에서 켜지고
    /// 사용자가 확인하면 dismissCollectionCelebration 으로 꺼진다 (웹 collectionCelebration).
    @Published private(set) var collectionCelebration = false

    private var cancellables = Set<AnyCancellable>()
    private var bootstrappedUid: String?

    init() {
        // Auth 상태 변화를 단일 진입점에서 처리 — 로그인 시 부트스트랩, 로그아웃 시 클리어.
        auth.$state
            .sink { [weak self] state in
                Task { @MainActor in self?.handleAuthState(state) }
            }
            .store(in: &cancellables)
    }

    // MARK: - Auth 연동

    private func handleAuthState(_ state: AuthService.AuthState) {
        switch state {
        case .unknown:
            phase = .launching

        case .signedOut:
            bootstrappedUid = nil
            progress = nil
            daily = nil
            collectionCelebration = false
            upHero.resetForSignOut()
            sync.setSyncReady(false)
            sync.stopListener()
            phase = .needsSignIn

        case let .signedIn(uid, _, _):
            guard uid != bootstrappedUid else { return }  // 동일 유저 중복 부트스트랩 방지
            bootstrappedUid = uid
            Task { await bootstrap(uid: uid) }
        }
    }

    /// 로그인 직후 1회 — 클라우드 데이터를 로드하거나 신규 계정 기본 상태를 만든다.
    private func bootstrap(uid: String) async {
        phase = .loading
        sync.setSyncReady(false)  // 부트스트랩 동안 로컬 write 차단 (race 방지)

        let result = await sync.getCloudData(uid: uid)
        // await(네트워크) 중 로그아웃·계정 전환이 일어났으면 이 결과를 폐기한다.
        //   안 그러면 로그아웃된 유저에게 .ready/.onboarding 화면이 노출된다.
        guard bootstrappedUid == uid else { return }

        switch result {
        case let .loaded(cloudProgress, cloudDaily):
            // 기존 유저 — XP/레벨 정규화 적용 (구 XP 커브 마이그레이션, 음수 XP 방어).
            progress = GameRules.normalizeXpLevel(cloudProgress).progress
            daily = cloudDaily
            startLiveSync(uid: uid)
            phase = .ready
            bootstrapUpHero()  // 앱 진입 시점에 idle accrual — 웹 useUpHeroStore.initialize
            // 알림 설정이 켜져 있던 유저면 매일 리마인더를 다시 보장 (재설치·재로그인 대비).
            NotificationManager.syncDailyReminder(
                enabled: progress?.notificationsEnabled ?? false,
                time: progress?.notificationTime ?? "09:00")

        case .notFound:
            // 신규 계정 — 온보딩 진입. 기본 상태는 메모리에만 두고, 클라우드 업로드는
            //   온보딩 완료(finishOnboarding) 후로 미룬다 — 온보딩 중단 시 빈 문서가
            //   남지 않아, 재로그인하면 온보딩이 깨끗하게 다시 시작된다.
            progress = Self.makeDefaultProgress()
            daily = Self.makeDefaultDaily()
            phase = .onboarding

        case .failed:
            // 조회 실패 — 기본 상태로 덮어쓰지 않는다 (기존 클라우드 데이터 보호).
            //   bootstrappedUid 를 비워 재시도(retry()) 를 허용.
            bootstrappedUid = nil
            phase = .failed("클라우드 데이터를 불러오지 못했습니다 — 네트워크 확인 후 다시 시도")
        }
    }

    /// 라이브 리스너 시작 (다른 기기 변경 수신) + 로컬 write 허용.
    /// bootstrap(.loaded) 와 finishOnboarding 이 공유.
    private func startLiveSync(uid: String) {
        sync.startListener(uid: uid) { [weak self] cloudProgress, cloudDaily in
            self?.applyCloudUpdate(cloudProgress, cloudDaily)
        }
        sync.setSyncReady(true)
    }

    /// 라이브 리스너가 전달한 클라우드 변경을 로컬에 반영.
    /// SyncManager.handleSnapshot 이 3중 가드(hasPendingWrites/isUpdatingFromCloud/
    /// hasLocalPendingWrite)를 통과시킨 변경만 전달한다.
    /// (웹 _setFromCloud 의 dailyProgressScore 단조 stale 가드는 다음 슬라이스에서 보강.)
    private func applyCloudUpdate(_ cloudProgress: UserProgress, _ cloudDaily: DailyState) {
        progress = GameRules.normalizeXpLevel(cloudProgress).progress
        // stale 가드 — 같은 날짜인데 클라우드 daily 의 진행 점수가 로컬보다 낮으면
        //   (리오더돼 늦게 도착한 오래된 snapshot) daily 를 덮어쓰지 않는다.
        //   웹 _setFromCloud 의 dailyProgressScore 단조 비교.
        if let local = daily,
           local.date == cloudDaily.date,
           Self.dailyProgressScore(cloudDaily) < Self.dailyProgressScore(local) {
            return
        }
        daily = cloudDaily
    }

    /// 부트스트랩 실패 후 수동 재시도 (루트 뷰의 "다시 시도" 버튼용).
    func retry() {
        guard let uid = auth.uid else { return }
        guard uid != bootstrappedUid else { return }
        bootstrappedUid = uid
        Task { await bootstrap(uid: uid) }
    }

    // MARK: - 설정 액션 (웹 useGameStore setLanguage / toggleSound / setMode …)

    func setLanguage(_ lang: Language) { mutateProgress { $0.language = lang } }
    func toggleSound() { mutateProgress { $0.soundEnabled.toggle() } }
    func toggleHaptic() { mutateProgress { $0.hapticEnabled.toggle() } }
    /// 알림 켜기/끄기. 켤 때는 권한을 요청하고 — 거부되면 토글을 실제 허용 상태로
    /// 되돌린다 (설정이 OS 권한과 어긋나지 않게). 매일 리마인더도 함께 갱신.
    func setNotificationsEnabled(_ enabled: Bool) {
        guard enabled else {
            mutateProgress { $0.notificationsEnabled = false }
            NotificationManager.syncDailyReminder(enabled: false, time: "")
            return
        }
        Task {
            let granted = await NotificationManager.requestAuthorization()
            mutateProgress { $0.notificationsEnabled = granted }
            NotificationManager.syncDailyReminder(
                enabled: granted, time: progress?.notificationTime ?? "09:00")
        }
    }

    /// 알림 시각 변경 — 리마인더를 새 시각으로 재예약.
    func setNotificationTime(_ time: String) {
        mutateProgress { $0.notificationTime = time }
        NotificationManager.syncDailyReminder(
            enabled: progress?.notificationsEnabled ?? false, time: time)
    }

    /// 챌린지 모드 변경 — pendingMode 에 예약 (다음 날부터 적용). 웹 setMode.
    func setMode(_ mode: GameMode) { mutateProgress { $0.pendingMode = mode } }
    func cancelPendingMode() { mutateProgress { $0.pendingMode = nil } }

    /// progress 를 변경 → 발행 → 클라우드 동기화(디바운스). 모든 설정 액션의 공통 경로.
    /// (웹 액션의 `set({progress})` + `saveToStorage` 대응 — 단 저장은 SyncManager 가 담당.)
    private func mutateProgress(_ change: (inout UserProgress) -> Void) {
        guard var p = progress else { return }
        change(&p)
        progress = p
        sync.syncProgress(p)
    }

    // MARK: - 온보딩 (웹 useGameStore selectStarterPack / completeOnboarding)

    /// 스타터 팩 선택 — 팩 6장 + 트렌딩 스타터 카드를 해금. 웹 selectStarterPack.
    func selectStarterPack(_ packId: String) {
        guard let pack = StarterPacks.all.first(where: { $0.id == packId }) else { return }
        // 트렌딩은 카테고리 노출 자체가 핵심 가치 — pack 선택과 무관하게 항상 deck 에 포함.
        let trendingStarters = CardCatalog.allCards
            .filter { $0.category == .trending && $0.unlockCondition == nil }
            .map(\.id)
        // 순서 보존 dedup (웹 Array.from(new Set(...)) 대응 — Swift Set 은 순서 불보장).
        var seen = Set<String>()
        let merged = (pack.cardIds + trendingStarters).filter { seen.insert($0).inserted }
        mutateProgress { $0.unlockedCardIds = merged }
    }

    /// 온보딩 마지막 단계 — 웹 completeOnboarding. 레벨 0→1, 카드팩·체험 티켓 적립,
    /// pendingMode 즉시 반영 후 클라우드 최초 업로드 → 라이브 동기화 시작 → .ready.
    func finishOnboarding() {
        guard var p = progress, let d = daily, let uid = auth.uid else { return }
        p.level = 1
        p.xp = GameRules.totalXPForLevel(1)
        p.pendingPacks += 1
        p.tickets = min(GameConstants.minigameTicketCap, p.tickets + 1)
        if let pendingMode = p.pendingMode {
            p.mode = pendingMode          // 온보딩에서 고른 난이도를 day 1 에 즉시 반영
            p.pendingMode = nil
        }
        progress = p
        phase = .loading
        Task {
            await sync.uploadLocalData(uid: uid, progress: p, daily: d)
            guard bootstrappedUid == uid else { return }  // 업로드 중 로그아웃 — 폐기
            startLiveSync(uid: uid)
            phase = .ready
            bootstrapUpHero()  // 신규 유저도 동일 — heroStartLevel seed
        }
    }

    // MARK: - 데일리 루프 (웹 useGameStore drawDailyCards / selectCard / completeChallenge …)

    /// 오늘의 카드 6장 드로우. 웹 drawDailyCards.
    func drawDailyCards() {
        guard let p = progress else { return }
        let unlocked = CardCatalog.allCards.filter { p.unlockedCardIds.contains($0.id) }
        let drawn = Deck.drawCards(unlocked: unlocked)
        mutateDaily { d in
            applyDraw(&d, drawn: drawn)
            d.isDrawComplete = true
        }
        Haptics.play(.light)
    }

    /// 리롤 — 하루 1회, 선택 미확정 시. 웹 rerollCards.
    func rerollCards() {
        guard let p = progress, let current = daily else { return }
        guard !current.rerollUsed, !current.isSelectionComplete else { return }
        let unlocked = CardCatalog.allCards.filter { p.unlockedCardIds.contains($0.id) }
        let drawn = Deck.drawCards(unlocked: unlocked)
        mutateDaily { d in
            applyDraw(&d, drawn: drawn)
            d.rerollUsed = true
        }
        Haptics.play(.medium)
    }

    /// 드로우 결과 반영 — 패널티 시 6장 중 1장 랜덤 잠금 + 자동 선택. drawDailyCards/rerollCards 공통.
    private func applyDraw(_ d: inout DailyState, drawn: [ChallengeCard]) {
        d.drawnCards = drawn
        d.selectedCards = []
        d.penaltyCardId = nil
        if d.hasPenalty, let penalty = drawn.randomElement() {
            d.penaltyCardId = penalty.id
            d.selectedCards = [penalty]
        }
    }

    /// 카드 선택 — mode 별 최대 장수까지. 웹 selectCard.
    func selectCard(_ card: ChallengeCard) {
        guard let p = progress, let current = daily else { return }
        guard current.selectedCards.count < p.mode.cardCount,
              !current.selectedCards.contains(where: { $0.id == card.id }) else { return }
        mutateDaily { $0.selectedCards.append(card) }
        Haptics.play(.selection)
    }

    /// 카드 선택 취소 — 패널티 카드·확정 후엔 불가. 웹 deselectCard.
    func deselectCard(_ cardId: String) {
        guard let current = daily else { return }
        guard !current.isSelectionComplete, current.penaltyCardId != cardId else { return }
        mutateDaily { $0.selectedCards.removeAll { $0.id == cardId } }
        Haptics.play(.selection)
    }

    /// 선택 확정 — mode 장수와 정확히 일치할 때만. 웹 confirmSelection.
    func confirmSelection() {
        guard let p = progress, let current = daily else { return }
        guard current.selectedCards.count == p.mode.cardCount else { return }
        mutateDaily { $0.isSelectionComplete = true }
        Haptics.play(.medium)
    }

    /// 챌린지 완료 — 웹 completeChallenge. XP·카테고리/카드 완료수·신규 해금·
    /// 풀클리어 보너스(티켓)·레벨업까지 포팅. Up Hero 탐험 패스/코인/스킬포인트
    /// 지급은 Phase 4.4 — 미포함(stub).
    func completeChallenge(_ cardId: String) {
        guard var p = progress, var d = daily else { return }
        guard !d.completedIds.contains(cardId),
              let card = d.selectedCards.first(where: { $0.id == cardId }) else { return }

        d.completedIds.append(cardId)
        p.categoryCompletions[card.category.rawValue, default: 0] += 1
        p.cardCompletions[cardId, default: 0] += 1
        p.xp += GameConstants.xpPerRarity[card.rarity] ?? 10

        // 신규 카드 해금 — unlockCondition 충족분
        let newUnlocks = CardCatalog.allCards.filter { c in
            guard !p.unlockedCardIds.contains(c.id), let cond = c.unlockCondition else { return false }
            return p.categoryCompletions[cond.category.rawValue, default: 0] >= cond.completions
        }
        p.unlockedCardIds.append(contentsOf: newUnlocks.map(\.id))

        // 풀클리어 — 미니게임 티켓 +1 (상한)
        if d.completedIds.count >= d.selectedCards.count {
            d.extraNudgeScheduled = true
            p.tickets = min(GameConstants.minigameTicketCap, p.tickets + 1)
        }
        // 레벨업 — XP/레벨 정규화로 level 재계산 + 상승분만큼 pendingPacks 적립.
        //   웹 completeChallenge 의 getLevelFromXP 기반 레벨업과 동치
        //   (normalizeProgressXpLevel 이 같은 getLevelFromXP + pendingPacks 로직).
        let normalized = GameRules.normalizeXpLevel(p)
        p = normalized.progress

        progress = p
        daily = d
        sync.syncProgress(p)
        sync.syncDaily(d)
        // 완료 햅틱 — 레벨업이면 celebration(컴파운드), 아니면 success.
        Haptics.play(normalized.levelsGained > 0 ? .celebration : .success)
    }

    /// daily 를 변경 → 발행 → 클라우드 동기화 (디바운스). mutateProgress 의 daily 판.
    private func mutateDaily(_ change: (inout DailyState) -> Void) {
        guard var d = daily else { return }
        change(&d)
        daily = d
        sync.syncDaily(d)
    }

    /// daily 진행 정도를 단조 정수로 환산 — stale 클라우드 snapshot 판별용 (웹 dailyProgressScore).
    /// phase 간 100배 간격으로 daily→extra→super 파이프라인 순서를 반영.
    static func dailyProgressScore(_ d: DailyState) -> Int {
        var s = 0
        if d.isDrawComplete { s += 1 }
        if d.rerollUsed { s += 1 }
        s += d.selectedCards.count * 2
        if d.isSelectionComplete { s += 10 }
        s += d.completedIds.count * 5
        if d.extraDrawComplete { s += 100 }
        s += d.extraSelectedCards.count * 2
        if d.extraSelectionComplete { s += 1000 }
        s += d.extraCompletedIds.count * 50
        if d.superDrawComplete { s += 10000 }
        s += d.superSelectedCards.count * 2
        if d.superSelectionComplete { s += 100000 }
        s += d.superCompletedIds.count * 500
        return s
    }

    // MARK: - Extra / Super 챌린지 페이즈 (웹 useGameStore startExtraChallenge / drawPhaseCards …)

    /// 추가 챌린지 시작 — daily 풀클리어 후. 웹 startExtraChallenge.
    func startExtraChallenge() {
        guard let d = daily, !d.selectedCards.isEmpty,
              d.completedIds.count >= d.selectedCards.count else { return }
        mutateDaily { $0.challengePhase = .extra }
        Haptics.play(.medium)
    }

    /// 슈퍼 챌린지 시작 — extra 풀클리어 후. 웹 startSuperChallenge.
    func startSuperChallenge() {
        guard let d = daily, !d.extraSelectedCards.isEmpty,
              d.extraCompletedIds.count >= d.extraSelectedCards.count else { return }
        mutateDaily { $0.challengePhase = .`super` }
        Haptics.play(.medium)
    }

    /// 현재 페이즈에 6장 드로우. daily 면 drawDailyCards 로 위임. 웹 drawPhaseCards.
    func drawPhaseCards() {
        guard let p = progress, let d = daily else { return }
        switch d.challengePhase {
        case .daily:
            drawDailyCards()
        case .extra, .`super`:
            // 이전 페이즈에서 고른 카드는 풀에서 제외 (중복 방지).
            var exclude = Set(d.selectedCards.map(\.id))
            if d.challengePhase == .`super` {
                exclude.formUnion(d.extraSelectedCards.map(\.id))
            }
            let pool = CardCatalog.allCards.filter {
                p.unlockedCardIds.contains($0.id) && !exclude.contains($0.id)
            }
            let drawn = Deck.drawCards(unlocked: pool)
            mutateDaily { dd in
                if dd.challengePhase == .extra {
                    dd.extraDrawnCards = drawn
                    dd.extraDrawComplete = true
                } else {
                    dd.superDrawnCards = drawn
                    dd.superDrawComplete = true
                }
            }
            Haptics.play(.light)
        }
    }

    /// 현재 페이즈 카드 선택. 웹 selectPhaseCard.
    func selectPhaseCard(_ card: ChallengeCard) {
        guard let d = daily else { return }
        switch d.challengePhase {
        case .daily:
            selectCard(card)
        case .extra:
            guard d.extraSelectedCards.count < ChallengePhase.extra.cardCount,
                  !d.extraSelectedCards.contains(where: { $0.id == card.id }) else { return }
            mutateDaily { $0.extraSelectedCards.append(card) }
            Haptics.play(.selection)
        case .`super`:
            guard d.superSelectedCards.count < ChallengePhase.`super`.cardCount,
                  !d.superSelectedCards.contains(where: { $0.id == card.id }) else { return }
            mutateDaily { $0.superSelectedCards.append(card) }
            Haptics.play(.selection)
        }
    }

    /// 현재 페이즈 카드 선택 취소. 웹 deselectPhaseCard.
    func deselectPhaseCard(_ cardId: String) {
        guard let d = daily else { return }
        switch d.challengePhase {
        case .daily:
            deselectCard(cardId)
        case .extra:
            guard !d.extraSelectionComplete else { return }
            mutateDaily { $0.extraSelectedCards.removeAll { $0.id == cardId } }
            Haptics.play(.selection)
        case .`super`:
            guard !d.superSelectionComplete else { return }
            mutateDaily { $0.superSelectedCards.removeAll { $0.id == cardId } }
            Haptics.play(.selection)
        }
    }

    /// 현재 페이즈 선택 확정. 웹 confirmPhaseSelection.
    func confirmPhaseSelection() {
        guard let d = daily else { return }
        switch d.challengePhase {
        case .daily:
            confirmSelection()
        case .extra:
            guard d.extraSelectedCards.count >= ChallengePhase.extra.cardCount else { return }
            mutateDaily { $0.extraSelectionComplete = true }
            Haptics.play(.medium)
        case .`super`:
            guard d.superSelectedCards.count >= ChallengePhase.`super`.cardCount else { return }
            mutateDaily { $0.superSelectionComplete = true }
            Haptics.play(.medium)
        }
    }

    /// 현재 페이즈 챌린지 완료. daily 면 completeChallenge 로 위임. 웹 completePhaseChallenge.
    /// 페이즈 풀클리어 시 보너스 카드 + 티켓. (Up Hero 패스 지급은 Phase 4.4 — stub.)
    func completePhaseChallenge(_ cardId: String) {
        guard let phase = daily?.challengePhase else { return }
        if phase == .daily {
            completeChallenge(cardId)
            return
        }
        guard var p = progress, var d = daily else { return }
        let isExtra = phase == .extra
        let selected = isExtra ? d.extraSelectedCards : d.superSelectedCards
        let completed = isExtra ? d.extraCompletedIds : d.superCompletedIds
        guard !completed.contains(cardId),
              let card = selected.first(where: { $0.id == cardId }) else { return }

        if isExtra { d.extraCompletedIds.append(cardId) }
        else { d.superCompletedIds.append(cardId) }
        p.categoryCompletions[card.category.rawValue, default: 0] += 1
        p.cardCompletions[cardId, default: 0] += 1
        p.xp += GameConstants.xpPerRarity[card.rarity] ?? 10

        let newUnlocks = CardCatalog.allCards.filter { c in
            guard !p.unlockedCardIds.contains(c.id), let cond = c.unlockCondition else { return false }
            return p.categoryCompletions[cond.category.rawValue, default: 0] >= cond.completions
        }
        p.unlockedCardIds.append(contentsOf: newUnlocks.map(\.id))

        // 페이즈 풀클리어 — 보너스 카드 1장 + 미니게임 티켓 1장
        let nowCompleted = isExtra ? d.extraCompletedIds : d.superCompletedIds
        if nowCompleted.count >= selected.count {
            p.pendingBonusCards += 1
            p.tickets = min(GameConstants.minigameTicketCap, p.tickets + 1)
        }
        let normalized = GameRules.normalizeXpLevel(p)
        p = normalized.progress

        progress = p
        daily = d
        sync.syncProgress(p)
        sync.syncDaily(d)
        Haptics.play(normalized.levelsGained > 0 ? .celebration : .success)
    }

    // MARK: - 카드팩 개봉 (웹 useGameStore openCardPack)

    /// 카드팩 1개 개봉 — 잠긴 카드 풀에서 등급 굴림으로 N장 해금.
    /// 보너스 카드(pendingBonusCards) 우선 소진 (normal tier 1장).
    /// 컬렉션 100% 시 환산 보상(영웅 코인)은 Phase 4.4 — 우선 큐만 비운다(stub).
    /// 반환: 개봉된 카드 + 팩 등급. 열 팩이 없으면 nil.
    @discardableResult
    func openCardPack() -> (cards: [ChallengeCard], tier: Rarity)? {
        guard var p = progress else { return nil }
        guard p.pendingPacks > 0 || p.pendingBonusCards > 0 else { return nil }

        let locked = CardCatalog.allCards.filter { !p.unlockedCardIds.contains($0.id) }
        guard !locked.isEmpty else {
            // 컬렉션 100% — 환산 보상은 Phase 4.4(영웅 코인). 우선 큐만 소진.
            //   웹과 동일하게 이 분기(이미 완료)에선 첫 완료 보너스를 부여하지 않는다.
            p.pendingPacks = 0
            p.pendingBonusCards = 0
            progress = p
            sync.syncProgress(p)
            return nil
        }

        let isBonus = p.pendingBonusCards > 0
        let tier: Rarity
        let newCards: [ChallengeCard]
        if isBonus {
            tier = .normal
            newCards = Deck.drawFromPool(locked, count: 1)
        } else {
            tier = PackTier.rollPackTier()
            newCards = PackTier.drawTierPack(locked, tier: tier, count: PackTier.count(tier))
        }
        p.unlockedCardIds.append(contentsOf: newCards.map(\.id))
        if isBonus { p.pendingBonusCards -= 1 } else { p.pendingPacks -= 1 }

        // 첫 컬렉션 완료 감지 — 이번 개봉으로 풀 100% 채워졌고, 달성 이력이 없을 때.
        //   웹 openCardPack 의 justCompleted. firstClearBonus.xp 만 직접 가산하고
        //   레벨 재계산은 하지 않는다 (웹과 동일 — 다음 로드의 normalizeXpLevel 가 보정).
        //   영웅 코인(firstClearBonus.coins) 지급은 Up Hero 의존 → Phase 4.4 stub.
        let justCompleted = p.collectionCompletedAt == nil
            && p.unlockedCardIds.count >= CardCatalog.allCards.count
        if justCompleted {
            p.collectionCompletedAt = ISO8601DateFormatter().string(from: Date())
            p.xp += PackTier.firstClearBonus.xp
        }

        progress = p
        sync.syncProgress(p)
        if justCompleted { collectionCelebration = true }
        // 개봉 햅틱 — 컬렉션 첫 완성이면 celebration, 아니면 success.
        Haptics.play(justCompleted ? .celebration : .success)
        return (newCards, tier)
    }

    /// 컬렉션 완성 축하 모달 닫기 (웹 dismissCollectionCelebration).
    func dismissCollectionCelebration() {
        collectionCelebration = false
    }

    // MARK: - Up Hero 연동 (웹 useUpHeroStore ↔ useGameStore)

    /// 앱 부팅 완료(.ready) 시 1회 — UpHeroStore 를 초기화하고, 오프라인 수련 보상의
    /// XP 를 progress 에 반영한다. 영웅 XP 의 진실의 원천은 progress 이므로
    /// UpHeroStore 가 직접 쓰지 않고 지급량만 반환 → 여기서 부모 스토어가 반영
    /// (웹 useUpHeroStore.initialize 가 useGameStore 에 XP 를 써넣는 흐름과 동일).
    ///
    /// Up Hero 탭 진입이 아니라 부팅 시점에 호출하는 이유: idle accrual 은 "앱을 닫은
    /// 사이"가 기준이라 앱 진입 즉시 계산해야 한다. 탭 진입 때 돌리면 그전까지 앱 안에
    /// 머문 시간까지 idle 로 잡히고, heroStartLevel seed 도 늦어 영웅 Lv 표기가 한 번
    /// 깜빡인다. 1회성(UpHeroStore.isLoaded 가드)이라 부팅마다 한 번만 실행된다.
    func bootstrapUpHero() {
        guard let p = progress else { return }
        let idleXP = upHero.initialize(gameLevel: p.level)
        guard idleXP > 0 else { return }
        // idle XP 반영 — 웹 idle 과 동일하게 level 만 재계산 (pendingPacks 미적립).
        //   normalizeXpLevel 의 레벨 산출(grandfather·승급)만 쓰고 pendingPacks 는 버린다.
        mutateProgress {
            $0.xp += idleXP
            $0.level = GameRules.normalizeXpLevel($0).progress.level
        }
    }

    /// Up Hero 전투 세션 결산 — UpHeroStore 가 자기 보상(코인·장비·던전·코덱스·NG+)을
    /// 반영하고 세션을 비운 뒤, 반환한 세션 XP 를 progress 에 적용한다.
    /// 웹 acknowledgeSessionEnd 의 cross-store XP 반영부. (idle XP 와 동일 경로.)
    func finishUpHeroSession() {
        let sessionXP = upHero.acknowledgeSessionEnd()
        guard sessionXP > 0 else { return }
        mutateProgress {
            $0.xp += sessionXP
            $0.level = GameRules.normalizeXpLevel($0).progress.level
        }
    }

    /// Up Hero 코인으로 카드팩 구매 — 코인 차감(upHero) + 팩 적립(progress).
    /// full=true 면 레벨업 팩(pendingPacks), false 면 보너스 카드 1장(pendingBonusCards).
    /// 적립되면 MainTabView 의 syncPackOpener 가 팩 오프너를 띄운다 (기존 배선 재사용).
    /// 웹 useUpHeroStore.purchaseCardPack.
    func buyCardPack(full: Bool) {
        let price = full ? ShopPrices.cardPackFull : ShopPrices.cardPackSmall
        guard upHero.spendCoins(price) else { return }
        mutateProgress {
            if full { $0.pendingPacks += 1 } else { $0.pendingBonusCards += 1 }
        }
        Haptics.play(.success)
    }

    // MARK: - 미니게임 (웹 useMinigameStore — 티켓 소비 / 보상)

    /// 미니게임 시작 — 티켓 1장 소비. 티켓이 없으면 false. 웹 미니게임 진입.
    @discardableResult
    func startMinigame() -> Bool {
        guard (progress?.tickets ?? 0) > 0 else { return false }
        mutateProgress { $0.tickets -= 1 }
        Haptics.play(.light)
        return true
    }

    /// 미니게임 성공 보상 — XP. 웹은 카드 드래프트 보상이나 condensed:
    /// XP 로 단순화 (보너스 카드면 팩 오프너가 미니게임 시트 위로 중첩되는 문제 회피).
    func awardMinigameWin() {
        mutateProgress {
            $0.xp += 30
            $0.level = GameRules.normalizeXpLevel($0).progress.level
        }
        Haptics.play(.celebration)
    }

    // MARK: - 기본 상태 팩토리 (웹 getInitialProgress / getInitialDailyState)

    static func makeDefaultProgress() -> UserProgress {
        UserProgress(
            currentStreak: 0,
            longestStreak: 0,
            totalDaysCompleted: 0,
            unlockedCardIds: CardCatalog.starterCardIds,
            completionHistory: [],
            categoryCompletions: Dictionary(
                uniqueKeysWithValues: Category.allCases.map { ($0.rawValue, 0) }),
            mode: .normal,
            level: 0,
            xp: 0,
            daysTowardNextLevel: 0,
            pendingPacks: 0,
            pendingBonusCards: 0,
            cardCompletions: [:],
            extraChallengesCompleted: 0,
            superChallengesCompleted: 0,
            equippedTitleId: nil,
            seenTitleIds: [],
            pendingMode: nil,
            hasPendingPenalty: false,
            language: .en,
            soundEnabled: true,
            hapticEnabled: true,
            notificationsEnabled: false,
            notificationTime: "09:00",
            tickets: 0,
            minigameRunsPlayed: 0,
            minigameBestMatches: 0,
            cardmatchShopDaily: nil,
            lastSeenPatchVersion: nil,
            collectionCompletedAt: nil
        )
    }

    static func makeDefaultDaily() -> DailyState {
        DailyState(
            date: todayString(),
            drawnCards: [],
            selectedCards: [],
            completedIds: [],
            isDrawComplete: false,
            isSelectionComplete: false,
            rerollUsed: false,
            challengePhase: .daily,
            extraDrawnCards: [],
            extraSelectedCards: [],
            extraCompletedIds: [],
            extraDrawComplete: false,
            extraSelectionComplete: false,
            superDrawnCards: [],
            superSelectedCards: [],
            superCompletedIds: [],
            superDrawComplete: false,
            superSelectionComplete: false,
            hasPenalty: false,
            penaltyCardId: nil,
            extraNudgeScheduled: false
        )
    }

    /// 오늘 날짜 YYYY-MM-DD (로컬 타임존). 웹 getTodayString.
    static func todayString() -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
}
