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

    @Published private(set) var progress: UserProgress?
    @Published private(set) var daily: DailyState?
    @Published private(set) var phase: BootPhase = .launching

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
    func setNotificationsEnabled(_ enabled: Bool) { mutateProgress { $0.notificationsEnabled = enabled } }
    func setNotificationTime(_ time: String) { mutateProgress { $0.notificationTime = time } }

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
        }
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
