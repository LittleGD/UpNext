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

/// 익명 → 로그인 시 *둘 다 진척이 있고 strictly-ahead 판정이 conflict* 인 케이스의
/// MergeConflictDialog 표시 데이터. 사용자가 어느 쪽을 선택하느냐에 따라
/// 후속 upload (local 선택) 또는 cloud-take (cloud 선택) 가 갈린다.
struct MergeConflictData: Equatable {
    let uid: String
    let localProgress: UserProgress
    let localDaily: DailyState
    let localRetention: RetentionState?
    let cloudProgress: UserProgress
    let cloudDaily: DailyState
    let cloudRetention: RetentionState?

    /// 추천 분기 — 웹 MergeConflictDialog: `cloudDays >= localDays` 면 "cloud" 추천.
    /// 동률 시 cloud 우선 (백업의 신뢰성).
    var recommend: Recommendation {
        cloudProgress.totalDaysCompleted >= localProgress.totalDaysCompleted ? .cloud : .local
    }

    enum Recommendation: String { case local, cloud }

    /// Equatable — UserProgress/DailyState/RetentionState 가 Codable 만이라 자동 합성 X.
    /// 다이얼로그 표시·해제 트리거에는 uid + summary level/days 비교로 충분 (id 키 역할).
    static func == (lhs: MergeConflictData, rhs: MergeConflictData) -> Bool {
        lhs.uid == rhs.uid
            && lhs.localProgress.level == rhs.localProgress.level
            && lhs.localProgress.totalDaysCompleted == rhs.localProgress.totalDaysCompleted
            && lhs.cloudProgress.level == rhs.cloudProgress.level
            && lhs.cloudProgress.totalDaysCompleted == rhs.cloudProgress.totalDaysCompleted
    }
}

@MainActor
final class GameStore: ObservableObject {

    /// 앱 부팅 단계 — 루트 뷰가 이걸로 화면을 분기한다.
    /// R1 (UI 충실도 회복) 부터 *익명 모드 우선*. 로그인은 옵션이라 별도 phase 없음 —
    /// 익명/로그인 둘 다 `.ready` 로 수렴하고, *로그인 상태* 는 `auth.uid != nil` 로 판단.
    /// LoginOverlay 는 phase 가 아닌 `showLoginOverlay` 플래그로 표시.
    enum BootPhase: Equatable {
        case launching      // Auth 상태 확인 중 (Firebase listener 첫 emit 전)
        case loading        // 로그인됨 — 클라우드 데이터 로드 중
        case onboarding     // 신규 사용자 (익명 또는 로그인 직후 .notFound) — 온보딩 진행 중
        case ready          // progress/daily 준비 완료 (익명·로그인 공통)
        case failed(String) // 클라우드 로드 실패 — 재시도 필요
    }

    /// 인증·동기화 서비스 — 스토어가 소유하고 환경 객체로 함께 노출한다.
    let auth = AuthService()
    let sync = SyncManager()

    /// Up Hero RPG 스토어 — 함께 소유하고 환경 객체로 노출 (Phase 4.4).
    let upHero = UpHeroStore()

    /// Growth(인증 사진) 스토어 — 함께 소유하고 환경 객체로 노출 (Phase 4.5).
    let growth = GrowthStore()

    /// Duo streak experiment — Firestore-backed, independent from solo retention.
    let duo = DuoStore()

    @Published private(set) var progress: UserProgress? {
        // 설정의 haptic/sound 토글을 헬퍼에 동기 + 위젯 상태 publish + 익명 시 로컬 저장.
        // progress 가 바뀌는 모든 경로에서 자동 반영. 익명 (uid 없음) 일 때만 캐시 — 로그인
        // 상태에선 SyncManager 가 Firestore 가 진실의 원천 (캐시 우회).
        didSet {
            Haptics.enabled = progress?.hapticEnabled ?? true
            SoundPlayer.enabled = progress?.soundEnabled ?? true
            WidgetSync.publish(progress: progress, daily: daily)
            persistLocalIfAnonymous()
        }
    }
    @Published private(set) var daily: DailyState? {
        // daily 변경 — 위젯 데이터 publish + Live Activity 재조정 (둘 다 idempotent).
        // 익명 모드 시 로컬 캐시도 갱신.
        didSet {
            WidgetSync.publish(progress: progress, daily: daily)
            WidgetSync.reconcileChallengeActivity(daily: daily)
            persistLocalIfAnonymous()
        }
    }
    @Published private(set) var retention: RetentionState? {
        didSet { persistLocalIfAnonymous() }
    }
    @Published private(set) var phase: BootPhase = .launching

    /// 컬렉션 100% 최초 달성 축하 모달 트리거. openCardPack 에서 켜지고
    /// 사용자가 확인하면 dismissCollectionCelebration 으로 꺼진다 (웹 collectionCelebration).
    @Published private(set) var collectionCelebration = false

    /// LoginOverlay 표시 여부. 익명 모드 + 첫 카드 드로 후 1회 권유 (웹 login_prompt_seen).
    /// `dismissLoginPrompt()` 또는 성공 로그인 시 false. 별도 phase 아닌 *overlay 플래그*.
    @Published var showLoginOverlay: Bool = false

    /// MergeConflictDialog 표시 데이터. 익명 → 로그인 시 둘 다 진척이 있고 strictly-ahead
    /// 판정이 conflict 인 경우만 셋. nil = 다이얼로그 미표시.
    @Published var mergeConflict: MergeConflictData? = nil

    /// 익명 모드 여부 — auth.uid 미존재 + progress 가 LocalProgressCache 에서 복원됨.
    /// 뷰가 LoginOverlay·BackupReminderBanner 표시 조건으로 사용.
    var isAnonymous: Bool {
        auth.uid == nil && progress != nil
    }

    /// LoginOverlay 가 이미 한 번 보였는지 — 웹 localStorage["login_prompt_seen"].
    /// UserDefaults 라 앱 재설치 외엔 보존.
    private static let loginPromptSeenKey = "login_prompt_seen"
    var loginPromptSeen: Bool {
        get { UserDefaults.standard.bool(forKey: Self.loginPromptSeenKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.loginPromptSeenKey) }
    }

    private var cancellables = Set<AnyCancellable>()
    private var bootstrappedUid: String?

    init() {
        #if DEBUG
        if Self.applyUITestSeedIfNeeded(to: self) {
            return
        }
        #endif
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
            collectionCelebration = false
            sync.setSyncReady(false)
            sync.stopListener()
            // R1 — 익명 모드 진입. 우선순위:
            //   1. *메모리에 진척 있음* (logged-in → sign-out 직후): 그 데이터를
            //      LocalProgressCache 로 저장해 익명 모드로 *그대로 유지*. 사용자가 sign
            //      out 했다고 모든 진행을 잃지 않는다 (Critical #1 픽스).
            //   2. *캐시 존재* (재시작·앱 종료 후 복귀): 이전 익명 진행 복원.
            //   3. *둘 다 없음* (앱 첫 실행): 기본 progress 로 .onboarding 진입.
            if let p = progress, let d = daily, let r = retention,
               hasMeaningfulProgress(p) {
                // 1: logged-in 상태에서 메모리에 데이터 살아있음 — 익명 캐시로 옮긴다.
                LocalProgressCacheStore.save(progress: p, daily: d, retention: r)
                phase = .ready
                AuthFunnel.log(.signOutToAnonymous, ["days": "\(p.totalDaysCompleted)"])
                if !loginPromptSeen, !d.isDrawComplete {
                    showLoginOverlay = true
                    AuthFunnel.log(.loginPromptShown, ["trigger": "signout_to_anonymous"])
                }
            } else if let cache = LocalProgressCacheStore.load() {
                // 2: 캐시 복원.
                progress = cache.progress
                daily = cache.daily
                retention = cache.retention
                phase = .ready
                AuthFunnel.log(.anonymousResume, ["days": "\(cache.progress.totalDaysCompleted)"])
                if !loginPromptSeen, !cache.daily.isDrawComplete {
                    showLoginOverlay = true
                    AuthFunnel.log(.loginPromptShown, ["trigger": "anonymous_resume"])
                }
            } else {
                // 3: 진짜 fresh — 익명 신규 사용자.
                progress = nil
                daily = nil
                retention = nil
                upHero.resetForSignOut()
                duo.reset()
                WidgetSync.endAllActivities()
                progress = Self.makeDefaultProgress()
                daily = Self.makeDefaultDaily()
                retention = RetentionState.fresh(today: Self.todayString())
                phase = .onboarding
                AuthFunnel.log(.anonymousStart)
            }

        case let .signedIn(uid, provider, displayName):
            guard uid != bootstrappedUid else { return }  // 동일 유저 중복 부트스트랩 방지
            bootstrappedUid = uid
            duo.start(uid: uid, displayName: displayName)
            showLoginOverlay = false  // 로그인 성공 = overlay 자동 dismiss
            loginPromptSeen = true
            AuthFunnel.log(.loginSuccess, ["provider": provider])
            Task { await bootstrap(uid: uid) }
        }
    }

    /// 사용자가 LoginOverlay 에서 "건너뛰기" 또는 BackupReminderBanner 의 "나중에"
    /// 를 눌렀을 때 호출. 웹 saveToStorage("login_prompt_seen", true) 와 동치.
    /// 익명 진행은 그대로 유지 — 다음 트리거 (예: 7일 후) 까지 LoginOverlay 안 뜸.
    func dismissLoginPrompt() {
        loginPromptSeen = true
        showLoginOverlay = false
        AuthFunnel.log(.loginSkipped)
    }

    /// 익명 사용자가 첫 카드 드로 직전 또는 BackupReminderBanner 가 "지금 백업" 을
    /// 눌렀을 때 호출. LoginOverlay 를 다시 표시.
    func promptLogin() {
        showLoginOverlay = true
        AuthFunnel.log(.loginPromptShown, ["trigger": "manual"])
    }

    /// 익명 → 로그인 머지 다이얼로그 응답: 로컬 선택. 로컬 데이터를 클라우드에 업로드.
    func resolveMergeUsingLocal() {
        guard let conflict = mergeConflict else { return }
        mergeConflict = nil
        AuthFunnel.log(.mergeResolvedLocal, [
            "local_days": "\(conflict.localProgress.totalDaysCompleted)",
            "cloud_days": "\(conflict.cloudProgress.totalDaysCompleted)",
        ])
        Task {
            await sync.uploadLocalData(
                uid: conflict.uid,
                progress: conflict.localProgress,
                daily: conflict.localDaily,
                retention: conflict.localRetention ?? RetentionState.fresh(today: Self.todayString()))
            // 로컬을 유지하므로 progress/daily/retention 은 이미 셋. 캐시는 더이상
            // 익명 모드 아니므로 비운다 (이젠 Firestore 가 진실).
            LocalProgressCacheStore.clear()
            startLiveSync(uid: conflict.uid)
            phase = .ready
        }
    }

    /// 익명 → 로그인 머지 다이얼로그 응답: 클라우드 선택. 클라우드 데이터로 로컬 교체.
    func resolveMergeUsingCloud() {
        guard let conflict = mergeConflict else { return }
        mergeConflict = nil
        AuthFunnel.log(.mergeResolvedCloud, [
            "local_days": "\(conflict.localProgress.totalDaysCompleted)",
            "cloud_days": "\(conflict.cloudProgress.totalDaysCompleted)",
        ])
        progress = GameRules.normalizeXpLevel(conflict.cloudProgress).progress
        daily = conflict.cloudDaily
        retention = conflict.cloudRetention ?? RetentionState.fresh(today: Self.todayString())
        LocalProgressCacheStore.clear()
        startLiveSync(uid: conflict.uid)
        phase = .ready
    }

    /// 익명 사용자에게 "의미 있는 진척"이 있는지 — sign-out 보존·머지 게이트가 *동일* 판정.
    /// 리뷰 #1: 분기마다 다르게 판정(한쪽 days만, 다른쪽 days+cards+xp)하면 익명 진행이
    /// 조용히 폐기됨. 단일 헬퍼로 통일해 데이터 손실 차단.
    private func hasMeaningfulProgress(_ p: UserProgress) -> Bool {
        p.totalDaysCompleted > 0 || (p.unlockedCardIds.count > 0 && p.xp > 0)
    }

    private var persistScheduled = false
    /// 매 progress/daily/retention 변경 시 호출. 익명일 때만 LocalProgressCache 갱신.
    /// 로그인 상태에선 SyncManager 가 Firestore 로 동기화 → 캐시는 stale 위험만 만들어 우회.
    /// 리뷰 #2: 한 runloop tick 내 다중 didSet (예: 3필드 동시 설정) 을 1회 write 로
    /// coalesce — 중복 디스크 IO 제거. 같은 tick async 라 hard-kill 손실 위험 없음.
    private func persistLocalIfAnonymous() {
        guard auth.uid == nil, !persistScheduled else { return }
        persistScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.persistScheduled = false
            guard self.auth.uid == nil,
                  let p = self.progress, let d = self.daily, let r = self.retention
            else { return }
            LocalProgressCacheStore.save(progress: p, daily: d, retention: r)
        }
    }

    /// 로그인 직후 1회 — 클라우드 데이터를 로드하고, 익명 진행이 있으면 머지 결정.
    /// R1: LocalProgressCache 가 있으면 *익명 → 로그인* 전환 케이스이므로 머지 분기.
    private func bootstrap(uid: String) async {
        phase = .loading
        sync.setSyncReady(false)  // 부트스트랩 동안 로컬 write 차단 (race 방지)

        // 익명 진행 캡처 — handleAuthState 가 이미 progress/daily/retention 에 로드해뒀음.
        let localProgress = progress
        let localDaily = daily
        let localRetention = retention
        let hadLocalProgress = LocalProgressCacheStore.exists()

        let result = await sync.getCloudData(uid: uid)
        guard bootstrappedUid == uid else { return }

        switch result {
        case let .loaded(cloudProgress, cloudDaily, cloudRetention):
            // R1 — 머지 분기 (High #2 픽스: AND 로 *진짜 충돌* 만 다이얼로그).
            //   양쪽 모두 진척 있을 때만 사용자에게 위임. 한쪽이 비어있으면 자동 결정.
            //   한쪽만 진척 있는 케이스:
            //   - local 진척 + cloud 비어있음 → uploadLocalData (local 채택, cloud 덮어쓰기 안전)
            //   - local 비어있음 + cloud 진척 → cloud 채택 (default path)
            if hadLocalProgress, let lp = localProgress, let ld = localDaily,
               hasMeaningfulProgress(lp) && hasMeaningfulProgress(cloudProgress) {
                mergeConflict = MergeConflictData(
                    uid: uid,
                    localProgress: lp, localDaily: ld, localRetention: localRetention,
                    cloudProgress: cloudProgress, cloudDaily: cloudDaily, cloudRetention: cloudRetention)
                AuthFunnel.log(.mergeShown, [
                    "local_days": "\(lp.totalDaysCompleted)",
                    "cloud_days": "\(cloudProgress.totalDaysCompleted)",
                ])
                // 결정 대기 — phase 는 그대로 .loading. 사용자 응답이 phase 를 .ready 로 옮김.
                return
            }
            // 자동 분기 — local 만 진척 있으면 upload, 그 외엔 cloud 채택.
            // (양쪽 모두 진척 = 위에서 다이얼로그로 분기됨. 여기는 최대 한쪽만 진척.)
            if hadLocalProgress, let lp = localProgress, let ld = localDaily,
               hasMeaningfulProgress(lp) && !hasMeaningfulProgress(cloudProgress) {
                let lr = localRetention ?? RetentionState.fresh(today: Self.todayString())
                await sync.uploadLocalData(uid: uid, progress: lp, daily: ld, retention: lr)
                LocalProgressCacheStore.clear()
                startLiveSync(uid: uid)
                phase = .ready
                return
            }

            progress = GameRules.normalizeXpLevel(cloudProgress).progress
            daily = cloudDaily
            retention = cloudRetention ?? RetentionState.fresh(today: Self.todayString())
            LocalProgressCacheStore.clear()  // 이젠 Firestore 가 진실 — 캐시 제거
            reconcileForToday(syncChanges: false)
            startLiveSync(uid: uid)
            phase = .ready
            bootstrapUpHero()
            NotificationManager.syncDailyReminder(
                enabled: progress?.notificationsEnabled ?? false,
                time: progress?.notificationTime ?? "09:00")

        case .notFound:
            // 클라우드 비어있고 익명 진행 있음 → 익명 데이터를 클라우드에 업로드 (충돌 없음).
            if hadLocalProgress, let lp = localProgress, let ld = localDaily {
                let lr = localRetention ?? RetentionState.fresh(today: Self.todayString())
                await sync.uploadLocalData(uid: uid, progress: lp, daily: ld, retention: lr)
                LocalProgressCacheStore.clear()
                startLiveSync(uid: uid)
                phase = .ready
                return
            }
            // 신규 계정 — 온보딩 진입.
            progress = Self.makeDefaultProgress()
            daily = Self.makeDefaultDaily()
            retention = RetentionState.fresh(today: Self.todayString())
            phase = .onboarding

        case .failed:
            // 조회 실패 — 기본 상태로 덮어쓰지 않는다 (기존 클라우드 데이터 보호).
            bootstrappedUid = nil
            phase = .failed("클라우드 데이터를 불러오지 못했습니다 — 네트워크 확인 후 다시 시도")
        }
    }

    /// 라이브 리스너 시작 (다른 기기 변경 수신) + 로컬 write 허용.
    /// bootstrap(.loaded) 와 finishOnboarding 이 공유.
    private func startLiveSync(uid: String) {
        sync.startListener(uid: uid) { [weak self] cloudProgress, cloudDaily, cloudRetention in
            self?.applyCloudUpdate(cloudProgress, cloudDaily, cloudRetention)
        }
        sync.setSyncReady(true)
        syncAllIfReady()
    }

    /// 라이브 리스너가 전달한 클라우드 변경을 로컬에 반영.
    /// SyncManager.handleSnapshot 이 3중 가드(hasPendingWrites/isUpdatingFromCloud/
    /// hasLocalPendingWrite)를 통과시킨 변경만 전달한다.
    /// (웹 _setFromCloud 의 dailyProgressScore 단조 stale 가드는 다음 슬라이스에서 보강.)
    private func applyCloudUpdate(_ cloudProgress: UserProgress, _ cloudDaily: DailyState, _ cloudRetention: RetentionState?) {
        progress = GameRules.normalizeXpLevel(cloudProgress).progress
        retention = cloudRetention ?? retention ?? RetentionState.fresh(today: Self.todayString())
        // stale 가드 — 같은 날짜인데 클라우드 daily 의 진행 점수가 로컬보다 낮으면
        //   (리오더돼 늦게 도착한 오래된 snapshot) daily 를 덮어쓰지 않는다.
        //   웹 _setFromCloud 의 dailyProgressScore 단조 비교.
        if let local = daily,
           local.date == cloudDaily.date,
           Self.dailyProgressScore(cloudDaily) < Self.dailyProgressScore(local) {
            return
        }
        daily = cloudDaily
        reconcileForToday(syncChanges: true)
    }

    /// 부트스트랩 실패 후 수동 재시도 (루트 뷰의 "다시 시도" 버튼용).
    func retry() {
        guard let uid = auth.uid else { return }
        guard uid != bootstrappedUid else { return }
        bootstrappedUid = uid
        Task { await bootstrap(uid: uid) }
    }

    // MARK: - 리텐션 / 일일 롤오버

    /// 앱 진입·foreground 복귀 시 오늘 날짜 기준으로 daily 를 정리한다.
    func reconcileForToday(syncChanges: Bool = true) {
        guard var p = progress, var d = daily else { return }
        var r = retention ?? RetentionState.fresh(today: Self.todayString())
        let today = Self.todayString()
        var changedProgress = false
        var changedDaily = false
        var changedRetention = false

        let refreshed = RetentionEngine.refreshMonthlySavers(r, today: today)
        if refreshed != r {
            r = refreshed
            changedRetention = true
        }

        if d.date != today {
            if d.isSelectionComplete && !d.selectedCards.isEmpty {
                let wasFullClear = d.completedIds.count >= d.selectedCards.count
                let extraDone = d.extraSelectionComplete
                    && !d.extraSelectedCards.isEmpty
                    && d.extraCompletedIds.count >= d.extraSelectedCards.count
                let superDone = d.superSelectionComplete
                    && !d.superSelectedCards.isEmpty
                    && d.superCompletedIds.count >= d.superSelectedCards.count
                let record = DayRecord(
                    date: d.date,
                    selectedCardIds: d.selectedCards.map(\.id),
                    completedCardIds: d.completedIds,
                    wasFullClear: wasFullClear,
                    mode: p.mode,
                    extraCompleted: extraDone ? true : nil,
                    superCompleted: superDone ? true : nil,
                    wasFailed: wasFullClear ? nil : true
                )
                p.completionHistory.append(record)
                if p.completionHistory.count > GameConstants.completionHistoryCap {
                    p.completionHistory = Array(p.completionHistory.suffix(GameConstants.completionHistoryCap))
                }
                if wasFullClear { p.totalDaysCompleted += 1 }
                if extraDone { p.extraChallengesCompleted += 1 }
                if superDone { p.superChallengesCompleted += 1 }
                changedProgress = true
            }

            if let pending = p.pendingMode {
                p.mode = pending
                p.pendingMode = nil
                changedProgress = true
            }

            d = Self.makeDefaultDaily()
            d.date = today
            changedDaily = true
        }

        let reported = RetentionEngine.generatePreviousWeekReport(
            retention: r,
            progress: p,
            photos: growth.photoMetas,
            today: today
        )
        if reported != r {
            r = reported
            changedRetention = true
        }

        progress = p
        daily = d
        retention = r

        guard syncChanges else { return }
        if changedProgress { sync.syncProgress(p) }
        if changedDaily { sync.syncDaily(d) }
        if changedRetention { sync.syncRetention(r) }
    }

    func checkInToday() {
        guard var p = progress else { return }
        let today = Self.todayString()
        let current = retention ?? RetentionState.fresh(today: today)
        let result = RetentionEngine.checkIn(current, today: today)
        retention = result.state
        p.currentStreak = result.state.currentLightStreak
        p.longestStreak = result.state.bestLightStreak
        progress = p
        sync.syncRetention(result.state)
        sync.syncProgress(p)
        if result.changed {
            duo.publishCheckIn(date: today)
            Haptics.play(result.usedSaver ? .medium : .success)
            SoundPlayer.shared.play(.confirm)
        } else {
            Haptics.play(.selection)
        }
    }

    private func syncAllIfReady() {
        if let progress { sync.syncProgress(progress) }
        if let daily { sync.syncDaily(daily) }
        if let retention { sync.syncRetention(retention) }
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
    /// pendingMode 즉시 반영. 로그인 사용자는 클라우드 업로드 → 라이브 동기화 → .ready.
    /// 익명 사용자는 LocalProgressCache 만 (didSet 자동) + LoginOverlay 권유 → .ready.
    ///
    /// 웹 useGameStore.completeOnboarding (L:678-696) 와 1:1 — 차이점은 *uid 의존* 만:
    /// 웹은 localStorage 가 진실의 원천이라 uid 무관, iOS 도 LocalProgressCache 가
    /// 익명의 진실의 원천이라 uid 무관해야 함 (Critical 픽스).
    func finishOnboarding() {
        guard var p = progress, let d = daily else { return }
        p.level = 1
        p.xp = GameRules.totalXPForLevel(1)
        p.pendingPacks += 1
        p.tickets = min(GameConstants.minigameTicketCap, p.tickets + 1)
        if let pendingMode = p.pendingMode {
            p.mode = pendingMode          // 온보딩에서 고른 난이도를 day 1 에 즉시 반영
            p.pendingMode = nil
        }
        progress = p
        let r = retention ?? RetentionState.fresh(today: Self.todayString())
        retention = r
        AuthFunnel.log(.onboardingComplete, ["anonymous": auth.uid == nil ? "1" : "0"])

        if let uid = auth.uid {
            // 로그인 사용자 — 클라우드 업로드 + 라이브 동기화.
            phase = .loading
            Task {
                await sync.uploadLocalData(uid: uid, progress: p, daily: d, retention: r)
                guard bootstrappedUid == uid else { return }  // 업로드 중 로그아웃 — 폐기
                startLiveSync(uid: uid)
                phase = .ready
                bootstrapUpHero()
            }
        } else {
            // 익명 사용자 — progress/daily/retention 의 didSet 이 이미 LocalProgressCache
            // 저장. 클라우드 우회. *첫 카드 드로 직전* LoginOverlay 권유 (웹 page.tsx
            // L:82-85: !daily.isDrawComplete + !loginPromptSeen).
            phase = .ready
            bootstrapUpHero()
            if !loginPromptSeen, !d.isDrawComplete {
                showLoginOverlay = true
                AuthFunnel.log(.loginPromptShown, ["trigger": "onboarding_complete"])
            }
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
        SoundPlayer.shared.play(.cardFlip)
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
        SoundPlayer.shared.play(.cardFlip)
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
        SoundPlayer.shared.play(.cardSelect)
    }

    /// 카드 선택 취소 — 패널티 카드·확정 후엔 불가. 웹 deselectCard.
    func deselectCard(_ cardId: String) {
        guard let current = daily else { return }
        guard !current.isSelectionComplete, current.penaltyCardId != cardId else { return }
        mutateDaily { $0.selectedCards.removeAll { $0.id == cardId } }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cancel)
    }

    /// 선택 확정 — mode 장수와 정확히 일치할 때만. 웹 confirmSelection.
    func confirmSelection() {
        guard let p = progress, let current = daily else { return }
        guard current.selectedCards.count == p.mode.cardCount else { return }
        mutateDaily { $0.isSelectionComplete = true }
        Haptics.play(.medium)
        SoundPlayer.shared.play(.confirm)
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
        // 완료 햅틱·사운드 — 레벨업이면 celebration/levelUp, 아니면 success/complete.
        Haptics.play(normalized.levelsGained > 0 ? .celebration : .success)
        SoundPlayer.shared.play(normalized.levelsGained > 0 ? .levelUp : .complete)
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
        SoundPlayer.shared.play(.confirm)
    }

    /// 슈퍼 챌린지 시작 — extra 풀클리어 후. 웹 startSuperChallenge.
    func startSuperChallenge() {
        guard let d = daily, !d.extraSelectedCards.isEmpty,
              d.extraCompletedIds.count >= d.extraSelectedCards.count else { return }
        mutateDaily { $0.challengePhase = .`super` }
        Haptics.play(.medium)
        SoundPlayer.shared.play(.confirm)
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
            SoundPlayer.shared.play(.cardFlip)
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
            SoundPlayer.shared.play(.cardSelect)
        case .`super`:
            guard d.superSelectedCards.count < ChallengePhase.`super`.cardCount,
                  !d.superSelectedCards.contains(where: { $0.id == card.id }) else { return }
            mutateDaily { $0.superSelectedCards.append(card) }
            Haptics.play(.selection)
            SoundPlayer.shared.play(.cardSelect)
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
            SoundPlayer.shared.play(.cancel)
        case .`super`:
            guard !d.superSelectionComplete else { return }
            mutateDaily { $0.superSelectedCards.removeAll { $0.id == cardId } }
            Haptics.play(.selection)
            SoundPlayer.shared.play(.cancel)
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
            SoundPlayer.shared.play(.confirm)
        case .`super`:
            guard d.superSelectedCards.count >= ChallengePhase.`super`.cardCount else { return }
            mutateDaily { $0.superSelectionComplete = true }
            Haptics.play(.medium)
            SoundPlayer.shared.play(.confirm)
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
        SoundPlayer.shared.play(normalized.levelsGained > 0 ? .levelUp : .complete)
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
        // 개봉 햅틱·사운드 — 컬렉션 첫 완성이면 celebration, 아니면 success.
        Haptics.play(justCompleted ? .celebration : .success)
        SoundPlayer.shared.play(.packOpen)
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
        SoundPlayer.shared.play(.packOpen)
    }

    // MARK: - 미니게임 (웹 useMinigameStore — 티켓 소비 / 보상)

    /// 미니게임 시작 — 티켓 1장 소비. 티켓이 없으면 false. 웹 미니게임 진입.
    @discardableResult
    func startMinigame() -> Bool {
        guard (progress?.tickets ?? 0) > 0 else { return false }
        mutateProgress { $0.tickets -= 1 }
        Haptics.play(.light)
        SoundPlayer.shared.play(.select)
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
        SoundPlayer.shared.play(.levelUp)
    }

    #if DEBUG
    /// UI tests can bypass Firebase Auth and land directly in a deterministic ready state.
    private static func applyUITestSeedIfNeeded(to store: GameStore) -> Bool {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("UITestBypassAuth") else { return false }
        var p = makeDefaultProgress()
        p.level = 1
        p.xp = GameRules.totalXPForLevel(1)
        p.unlockedCardIds = CardCatalog.starterCardIds
        var d = makeDefaultDaily()
        if args.contains("UITestSeedBoard"),
           let card = CardCatalog.allCards.first {
            d.drawnCards = Array(CardCatalog.allCards.prefix(6))
            d.selectedCards = [card]
            d.isDrawComplete = true
            d.isSelectionComplete = true
        }
        var r = RetentionState.fresh(today: todayString())
        if args.contains("UITestSeedReport") {
            let report = WeeklyReportSummary(
                weekStart: RetentionEngine.addDays(todayString(), -7) ?? todayString(),
                weekEnd: RetentionEngine.addDays(todayString(), -1) ?? todayString(),
                generatedAt: UpHeroStore.nowMillis(),
                checkInCount: 5,
                completedCardCount: 8,
                topCategory: .fitness,
                highlightCardTitle: "1000보 걷기",
                photoLogCount: 2,
                usedSaver: false
            )
            r.weeklyReports = [report]
        }
        if args.contains("UITestSeedChallengeLog"),
           let card = CardCatalog.allCards.first {
            store.growth.seedChallengeLogForUITests(card: card)
        }
        store.progress = p
        store.daily = d
        store.retention = r
        store.phase = .ready
        return true
    }
    #endif

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
        AppClock.todayString()
    }
}
