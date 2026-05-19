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
#if canImport(ActivityKit)
import ActivityKit
#endif

enum WidgetSync {

    // MARK: - 위젯 상태 publish

    /// progress + daily + upHero 의 현재 스냅샷을 WidgetState JSON 으로 직렬화해
    /// App Group UserDefaults 에 저장하고 위젯 타임라인을 즉시 재로드한다.
    ///
    /// GameStore.mutateProgress / mutateDaily 가 매 변경마다 호출 — 매 호출이
    /// 디스크 + 위젯 reload 두 작업을 동반하지만 액션 빈도가 낮고(드로우·완료 등)
    /// 위젯이 즉시 갱신되는 게 사용자 신호로 더 가치 있어 디바운스 생략.
    static func publish(progress: UserProgress?, daily: DailyState?) {
        guard let p = progress else {
            // 로그아웃 등 — 위젯도 비워서 이전 사용자 데이터가 잠금화면에 남지 않게 한다.
            AppConfig.sharedDefaults?.removeObject(forKey: "widgetState")
            WidgetCenter.shared.reloadAllTimelines()
            return
        }
        let snapshot: [String: Any] = [
            "streak":             p.currentStreak,
            "todayCount":         todayCount(daily),
            "todayDone":          todayDone(daily),
            "xp":                 xpInCurrentLevel(p),
            "xpForNext":          xpForNextLevel(p),
            "level":              p.level,
            "levelTitle":         GameRules.titleForLevel(p.level),
            "mainChallengeTitle": mainChallengeTitle(daily),
            "updatedAt":          Date().timeIntervalSince1970
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: snapshot),
              let defaults = AppConfig.sharedDefaults
        else { return }
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
    private static func mainChallengeTitle(_ d: DailyState?) -> String {
        guard let d = d else { return "오늘의 카드를 뽑아보세요" }
        let (selected, completed): ([ChallengeCard], [String])
        switch d.challengePhase {
        case .daily:
            selected = d.selectedCards; completed = d.completedIds
        case .extra:
            selected = d.extraSelectedCards; completed = d.extraCompletedIds
        case .`super`:
            selected = d.superSelectedCards; completed = d.superCompletedIds
        }
        if selected.isEmpty { return "오늘의 카드를 뽑아보세요" }
        let completedSet = Set(completed)
        if let next = selected.first(where: { !completedSet.contains($0.id) }) {
            return next.title
        }
        return "오늘의 도전 완료!"
    }

    /// 일자 키 — 로컬 시간대 기준 "yyyy-MM-dd" (KST 사용자의 자정~오전 9시에 UTC 가
    /// 전날인 경계 버그 방지). DateFormatter 는 호출마다 만들면 비싸서 캐시.
    private static let dayKeyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        f.locale = Locale(identifier: "en_US_POSIX")  // 형식 안정 (사용자 로케일 무관)
        return f
    }()

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
    static func reconcileChallengeActivity(daily: DailyState?) {
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
        // 페이즈 단위 ID — 페이즈 전환 시 새 활동으로 시작. 로컬 시간대 기준이라
        // KST 사용자의 자정~09시에도 같은 "오늘"로 유지된다 (UTC 기준이면 mid-day 점프).
        let dayKey = dayKeyFormatter.string(from: Date())
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
        let state = ChallengeActivityAttributes.ContentState(
            title: title,
            expiresAt: Date().addingTimeInterval(hoursUntilExpiry * 3600))
        let content = ActivityContent(state: state, staleDate: state.expiresAt)
        do {
            let activity = try Activity.request(attributes: attrs, content: content)
            AppConfig.sharedDefaults?.set(activity.id, forKey: activityIdKey)
            AppConfig.sharedDefaults?.set(challengeId, forKey: existingChallengeIdKey)
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
        let newState = ChallengeActivityAttributes.ContentState(
            title: title,
            expiresAt: Date().addingTimeInterval(hoursUntilExpiry * 3600))
        let content = ActivityContent(state: newState, staleDate: newState.expiresAt)
        Task { await activity.update(content) }
    }

    /// 현재 활동 종료 (챌린지 완료·만료·로그아웃 등).
    static func endChallengeActivity() {
        guard #available(iOS 16.1, *) else { return }
        guard let id = AppConfig.sharedDefaults?.string(forKey: activityIdKey) else { return }
        AppConfig.sharedDefaults?.removeObject(forKey: activityIdKey)
        AppConfig.sharedDefaults?.removeObject(forKey: existingChallengeIdKey)
        let target = Activity<ChallengeActivityAttributes>.activities
            .first(where: { $0.id == id })
        guard let target = target else { return }
        Task { await target.end(nil, dismissalPolicy: .immediate) }
    }

    /// 모든 활동 종료 (앱 리셋·로그아웃 등 — 잔여 활동 청소).
    static func endAllActivities() {
        guard #available(iOS 16.1, *) else { return }
        AppConfig.sharedDefaults?.removeObject(forKey: activityIdKey)
        AppConfig.sharedDefaults?.removeObject(forKey: existingChallengeIdKey)
        for activity in Activity<ChallengeActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
