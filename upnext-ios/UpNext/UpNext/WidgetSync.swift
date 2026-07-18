//
//  WidgetSync.swift
//  UpNext — 위젯 + Live Activity 브릿지 (Phase 5 슬라이스 6 · Phase 5.5).
//
//  웹 src/lib/widget.ts 의 pushWidgetState / startChallengeActivity 포팅.
//  웹은 Capacitor 커스텀 플러그인(WidgetBridge) 경유였고 — 네이티브는
//  WidgetCenter / ActivityKit 을 직접 부른다 (브릿지 폐기, plan Phase 0.2).
//
//  데이터 흐름:
//    GameStore.mutateProgress / mutateDaily
//      → WidgetSync.publish(progress, daily, upHero, lang)
//        → App Group UserDefaults("widgetState") JSON 저장
//        → WidgetCenter.shared.reloadAllTimelines()
//        → 위젯 Extension 의 TimelineProvider.getTimeline 이 다시 읽음.
//
//  Live Activity 는 daily 선택 확정 시 start, 풀클리어/리셋 시 end.
//  iOS 16.1+ 만 — 미만 OS 에선 silent no-op.
//

import Foundation
import WidgetKit
import ActivityKit

@MainActor
enum WidgetSync {

    // MARK: - 위젯 상태 publish (runloop tick 단위로 코얼레스)

    /// 직전 publish 호출에서 받은 최신 스냅샷 — async 디스패치가 fire 될 때 읽는다.
    /// 같은 runloop 의 다중 publish (progress = p; daily = d 연쇄) 가 들어와도
    /// 마지막 값만 살아남아 디스크·위젯 reload 가 1회로 합쳐진다.
    private static var pendingProgress: UserProgress?
    private static var pendingDaily: DailyState?
    private static var publishScheduled = false

    /// progress + daily 의 현재 스냅샷을 위젯에 publish 한다. 같은 runloop tick 안에서
    /// 여러 번 불러도 마지막 값으로 1회만 실제 발행 — completeChallenge 처럼
    /// progress·daily 가 연쇄로 바뀌는 액션에서 reload 가 2회 도는 비용을 제거.
    ///
    /// GameStore.progress / daily 의 didSet 에서 자동 호출되며, 어떤 액션이든
    /// 위젯 타임라인이 자동 갱신된다.
    static func publish(progress: UserProgress?, daily: DailyState?) {
        pendingProgress = progress
        pendingDaily = daily
        guard !publishScheduled else { return }
        publishScheduled = true
        // 다음 runloop tick — 같은 tick 의 연쇄 호출은 모두 합쳐진 뒤 1회만 실행.
        DispatchQueue.main.async {
            publishScheduled = false
            let snapProgress = pendingProgress
            let snapDaily = pendingDaily
            pendingProgress = nil
            pendingDaily = nil
            publishNow(progress: snapProgress, daily: snapDaily)
        }
    }

    /// 실제 디스크·위젯 reload 수행부 — publish 의 코얼레서가 1회만 호출.
    private static func publishNow(progress: UserProgress?, daily: DailyState?) {
        guard let p = progress else {
            // 로그아웃 등 — 위젯도 비워서 이전 사용자 데이터가 잠금화면에 남지 않게 한다.
            AppConfig.sharedDefaults?.removeObject(forKey: "widgetState")
            WidgetCenter.shared.reloadAllTimelines()
            return
        }
        let snapshot: [String: Any] = [
            "date":               AppClock.todayString(),
            "streak":             p.currentStreak,
            "todayCount":         todayCount(daily),
            "todayDone":          todayDone(daily),
            "xp":                 xpInCurrentLevel(p),
            "xpForNext":          xpForNextLevel(p),
            "level":              p.level,
            "levelTitle":         GameRules.titleForLevel(p.level),
            "mainChallengeTitle": mainChallengeTitle(daily, lang: p.language),
            "tasks":              tasksList(daily, lang: p.language),
            "updatedAt":          Date().timeIntervalSince1970
        ]
        let data: Data
        do {
            data = try JSONSerialization.data(withJSONObject: snapshot)
        } catch {
            // 9개 키 모두 primitive 라 실패할 일은 없지만, 미래 필드 추가 시
            // 디버그 빌드에서 즉시 잡히도록 로그를 남긴다.
            #if DEBUG
            print("[WidgetSync] JSON encode failed: \(error)")
            #endif
            return
        }
        guard let defaults = AppConfig.sharedDefaults else { return }
        defaults.set(data, forKey: "widgetState")
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// 현재 페이즈의 선택 카드 수 — 위젯의 "X/Y 완료" 분모.
    private static func todayCount(_ d: DailyState?) -> Int {
        guard let d = d else { return 0 }
        switch d.challengePhase {
        case .daily: return d.selectedCards.count
        case .extra: return d.extraSelectedCards.count
        case .`super`: return d.superSelectedCards.count
        }
    }

    /// 현재 페이즈의 완료 수 — 위젯의 "X/Y 완료" 분자.
    private static func todayDone(_ d: DailyState?) -> Int {
        guard let d = d else { return 0 }
        switch d.challengePhase {
        case .daily: return d.completedIds.count
        case .extra: return d.extraCompletedIds.count
        case .`super`: return d.superCompletedIds.count
        }
    }

    /// 현재 레벨 구간 내 XP. (웹 getXPProgress.current.)
    private static func xpInCurrentLevel(_ p: UserProgress) -> Int {
        max(0, p.xp - GameRules.totalXPForLevel(p.level))
    }

    /// 다음 레벨까지 필요한 XP (구간 폭). (웹 getXPProgress.needed.)
    private static func xpForNextLevel(_ p: UserProgress) -> Int {
        GameRules.totalXPForLevel(p.level + 1) - GameRules.totalXPForLevel(p.level)
    }

    /// 위젯에 표시할 메인 챌린지 — 아직 안 끝낸 카드 우선, 아무것도 없으면 안내.
    /// 풀클리어 후엔 격려 문구 (위젯이 비어 보이지 않게).
    /// 다국어: 메인 앱 번들의 String Catalog 에서 *인앱 언어*(AppConfig.currentLocale)로
    /// 해석된 문자열을 JSON 으로 직렬화 → 위젯 extension 은 그대로 표시. 기기 로케일이
    /// 아닌 설정 언어를 따르도록 AppConfig.loc 사용(위젯이 자체 해석 불필요).
    /// 오늘의 태스크 목록(현재 페이즈의 선택 카드) — 위젯(태스크 중심)이 체크리스트+도트로
    /// 표시. 제목은 인앱 언어로 미리 해석(localizedTitle) — 위젯은 카드 데이터 접근 불가.
    private static func tasksList(_ d: DailyState?, lang: Language) -> [[String: Any]] {
        guard let d = d else { return [] }
        let (selected, completed): ([ChallengeCard], [String])
        switch d.challengePhase {
        case .daily:  selected = d.selectedCards;      completed = d.completedIds
        case .extra:  selected = d.extraSelectedCards; completed = d.extraCompletedIds
        case .`super`: selected = d.superSelectedCards; completed = d.superCompletedIds
        }
        let done = Set(completed)
        return selected.map { ["title": $0.localizedTitle(lang), "done": done.contains($0.id)] }
    }

    private static func mainChallengeTitle(_ d: DailyState?, lang: Language) -> String {
        let emptyText = AppConfig.loc("widget.daily.empty")
        guard let d = d else { return emptyText }
        let (selected, completed): ([ChallengeCard], [String])
        switch d.challengePhase {
        case .daily:
            selected = d.selectedCards; completed = d.completedIds
        case .extra:
            selected = d.extraSelectedCards; completed = d.extraCompletedIds
        case .`super`:
            selected = d.superSelectedCards; completed = d.superCompletedIds
        }
        if selected.isEmpty { return emptyText }
        let completedSet = Set(completed)
        if let next = selected.first(where: { !completedSet.contains($0.id) }) {
            // 인앱 언어로 카드 제목을 해석해 publish — 위젯 chrome 과 같은 언어로 보이도록.
            // (raw `next.title` 은 항상 한국어라 chrome(=인앱 언어)과 불일치를 만들었음.)
            return next.localizedTitle(lang)
        }
        return AppConfig.loc("widget.daily.complete")
    }

    // MARK: - Live Activity 재조정 (daily 상태 기준 idempotent 동기화)

    /// 현재 daily 상태에 맞춰 Live Activity 를 시작·갱신·종료한다 (idempotent).
    /// GameStore.daily 의 didSet 에서 자동 호출 — 어떤 액션으로 daily 가 변하든
    /// Live Activity 가 진실(현재 페이즈의 첫 미완료 카드 제목)을 따라간다.
    ///
    /// 분기:
    ///  - 선택 미확정 / 모두 완료 → 활동 종료 (보여줄 게 없음).
    ///  - 그 외 → 활동 시작·갱신 (시작이 endChallengeActivity 를 먼저 호출하므로 단일성 보장).
    ///
    /// challengeId 는 페이즈 단위 — "daily-2026-05-19-daily" 처럼 (날짜+페이즈).
    /// 페이즈가 바뀌면 새 challengeId 로 종료→재시작 (다른 챌린지로 본 사용자 신호).
    ///
    /// 14-completion-delay — publish(42-56)처럼 다음 runloop tick 으로 코얼레싱.
    ///   daily.didSet 이 인라인으로 호출하면 완료 틱에 progress=/daily= 이중 대입·연쇄
    ///   변경마다 ActivityKit `Activity.activities` 열거·update 가 여러 번 인라인 실행돼
    ///   완료 틱 메인스레드를 붙잡았다. 마지막 daily 값만 살아남아 1회만 재조정한다.
    private static var pendingReconcileDaily: DailyState?
    private static var reconcileScheduled = false
    static func reconcileChallengeActivity(daily: DailyState?) {
        pendingReconcileDaily = daily
        guard !reconcileScheduled else { return }
        reconcileScheduled = true
        DispatchQueue.main.async {
            reconcileScheduled = false
            let snap = pendingReconcileDaily
            pendingReconcileDaily = nil
            reconcileChallengeActivityNow(daily: snap)
        }
    }

    /// 실제 Live Activity 재조정 수행부 — reconcileChallengeActivity 의 코얼레서가 1회만 호출.
    private static func reconcileChallengeActivityNow(daily: DailyState?) {
        guard let d = daily else { endChallengeActivity(); return }
        let (selected, completed, selectionDone): ([ChallengeCard], [String], Bool)
        switch d.challengePhase {
        case .daily:
            selected = d.selectedCards
            completed = d.completedIds
            selectionDone = d.isSelectionComplete
        case .extra:
            selected = d.extraSelectedCards
            completed = d.extraCompletedIds
            selectionDone = d.extraSelectionComplete
        case .`super`:
            selected = d.superSelectedCards
            completed = d.superCompletedIds
            selectionDone = d.superSelectionComplete
        }
        let completedSet = Set(completed)
        let next = selected.first(where: { !completedSet.contains($0.id) })
        // 선택 미확정 또는 페이즈 풀클리어 → 종료.
        guard selectionDone, let card = next else { endChallengeActivity(); return }
        // 페이즈 단위 ID — 페이즈 전환 시 새 활동으로 시작. 날짜 기준은 웹
        // getTodayString 과 같은 01:00 로컬 롤오버를 쓴다.
        let dayKey = AppClock.todayString()
        let challengeId = "daily-\(dayKey)-\(d.challengePhase.rawValue)"
        let existing = AppConfig.sharedDefaults?.string(forKey: existingChallengeIdKey)
        if existing == challengeId {
            updateChallengeActivity(challengeId: challengeId, title: card.title)
        } else {
            startChallengeActivity(challengeId: challengeId, title: card.title)
        }
    }

    private static let existingChallengeIdKey = "challengeActivityChallengeId"

    // MARK: - Live Activity (iOS 16.1+)

    /// 현재 진행 중인 챌린지 활동 — 1개만 동시에 (웹 동일).
    /// 동시 N개 가능하지만 daily 챌린지는 단일 흐름이라 1개로 충분.
    private static let activityIdKey = "challengeActivityId"

    /// staleDate 에 적용하는 grace period — 만료시각 정각에 stale 로 표시되면
    /// 음수 카운트다운("-00:01..") 이 잠금화면에 남는 시각적 결함. 5분 여유를 줘서
    /// 그 사이 expiry-watchdog 가 자동 dismiss 를 호출하게 한다.
    private static let staleGraceSeconds: TimeInterval = 5 * 60

    /// expiresAt 시각에 자동 dismiss 를 트리거하는 watchdog Task — 앱이 살아있을 동안만
    /// 작동하며 (BGTaskScheduler 와 달리 시스템 허락 없이 동작), background→active
    /// 복귀 후의 reconcile 에서도 한 번 더 dismiss 시도가 들어가므로 두 layer 로 안전.
    /// 새 활동이 시작되거나 명시 dismiss 가 호출되면 이전 watchdog 는 취소.
    private static var expiryWatchdog: Task<Void, Never>?

    /// 챌린지 선택 확정 시 호출 → 잠금화면 + 다이나믹 아일랜드에 카운트다운.
    /// expiresAt 은 만료 시각 (Date). 4시간 데드라인은 웹의 startChallengeActivity
    /// 와 동일 (당일 자정이 아니라 "지금부터 4시간" — 늦은 밤 시작도 4시간 유지).
    static func startChallengeActivity(challengeId: String, title: String,
                                       hoursUntilExpiry: Double = 4) {
        guard #available(iOS 16.1, *) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        // 이전 활동이 떠 있으면 종료 후 새로 시작 (단일성 보장).
        endChallengeActivity()

        let attrs = ChallengeActivityAttributes(challengeId: challengeId)
        let expiresAt = Date().addingTimeInterval(hoursUntilExpiry * 3600)
        let state = ChallengeActivityAttributes.ContentState(
            title: title,
            expiresAt: expiresAt)
        // staleDate 에 grace period 를 더해서 만료 정각에 즉시 stale 처리되어
        // 음수 카운트다운이 보이는 결함을 막는다.
        let content = ActivityContent(state: state,
                                      staleDate: expiresAt.addingTimeInterval(staleGraceSeconds))
        do {
            let activity = try Activity.request(attributes: attrs, content: content)
            AppConfig.sharedDefaults?.set(activity.id, forKey: activityIdKey)
            AppConfig.sharedDefaults?.set(challengeId, forKey: existingChallengeIdKey)
            scheduleExpiryWatchdog(expiresAt: expiresAt)
        } catch {
            // Live Activity 실패는 silent — 사용자가 시스템 설정에서 끄거나 한도 초과
        }
    }

    /// 진행 중인 활동의 제목·만료를 갱신. 시스템이 활동을 이미 종료했으면 (8시간
    /// 만료·메모리 압박) UserDefaults 의 활동 ID 가 stale — 그땐 새로 시작한다.
    /// challengeId 인자가 필요한 이유: 재시작 fallback 시 attributes 가 필요해서.
    static func updateChallengeActivity(challengeId: String, title: String,
                                        hoursUntilExpiry: Double = 4) {
        guard #available(iOS 16.1, *) else { return }
        let live = AppConfig.sharedDefaults?.string(forKey: activityIdKey)
            .flatMap { id in
                Activity<ChallengeActivityAttributes>.activities.first { $0.id == id }
            }
        guard let activity = live else {
            // 활동이 죽었음 — 새로 시작 (잠금화면에 다시 보이게).
            startChallengeActivity(challengeId: challengeId, title: title,
                                   hoursUntilExpiry: hoursUntilExpiry)
            return
        }
        let expiresAt = Date().addingTimeInterval(hoursUntilExpiry * 3600)
        let newState = ChallengeActivityAttributes.ContentState(
            title: title,
            expiresAt: expiresAt)
        let content = ActivityContent(state: newState,
                                      staleDate: expiresAt.addingTimeInterval(staleGraceSeconds))
        Task { await activity.update(content) }
        scheduleExpiryWatchdog(expiresAt: expiresAt)
    }

    /// 현재 활동 종료 (챌린지 완료·만료·로그아웃 등).
    /// dismissalPolicy: .immediate — 잠금화면에서 즉시 사라짐.
    static func endChallengeActivity() {
        guard #available(iOS 16.1, *) else { return }
        cancelExpiryWatchdog()
        guard let id = AppConfig.sharedDefaults?.string(forKey: activityIdKey) else { return }
        AppConfig.sharedDefaults?.removeObject(forKey: activityIdKey)
        AppConfig.sharedDefaults?.removeObject(forKey: existingChallengeIdKey)
        let target = Activity<ChallengeActivityAttributes>.activities
            .first(where: { $0.id == id })
        guard let target = target else { return }
        Task { await target.end(nil, dismissalPolicy: .immediate) }
    }

    /// 모든 활동 종료 (앱 리셋·로그아웃 등 — 잔여 활동 청소).
    /// 자정 reconcile 에서도 호출되어 어제 활동을 청소한다 (reconcileChallengeActivity
    /// 가 daily=nil 분기로 endChallengeActivity 까지 결국 도달).
    static func endAllActivities() {
        guard #available(iOS 16.1, *) else { return }
        cancelExpiryWatchdog()
        AppConfig.sharedDefaults?.removeObject(forKey: activityIdKey)
        AppConfig.sharedDefaults?.removeObject(forKey: existingChallengeIdKey)
        for activity in Activity<ChallengeActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }

    // MARK: - Expiry watchdog (앱이 켜져있을 동안 자동 dismiss)

    /// expiresAt 시각이 되면 endChallengeActivity 를 자동 호출하는 Task 예약.
    /// 동일 활동의 update 가 들어오면 기존 watchdog 는 취소되고 새 시간으로 재예약.
    /// 백그라운드에선 Task 가 정지되므로 BGTaskScheduler 가 진짜 백그라운드 dismiss 를
    /// 보장 — 여긴 앱이 active 인 경우의 best-effort.
    private static func scheduleExpiryWatchdog(expiresAt: Date) {
        cancelExpiryWatchdog()
        let interval = expiresAt.timeIntervalSinceNow
        guard interval > 0 else {
            // 이미 지난 만료 → 즉시 종료.
            endChallengeActivity()
            return
        }
        expiryWatchdog = Task { [interval] in
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run { endChallengeActivity() }
        }
    }

    private static func cancelExpiryWatchdog() {
        expiryWatchdog?.cancel()
        expiryWatchdog = nil
    }
}
