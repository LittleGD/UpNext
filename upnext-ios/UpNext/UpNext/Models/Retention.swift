//
//  Retention.swift
//  UpNext — lightweight retention model and deterministic rules.
//

import Foundation

enum AppClock {
    static func todayString(now: Date = Date()) -> String {
        if let override = uiTestTodayOverride() {
            return override
        }
        return productDayString(now)
    }

    /// Product day boundary matches the original web app: the "today" key rolls
    /// over at 01:00 local time, not exactly midnight.
    static func productDayString(_ date: Date = Date()) -> String {
        dayString(date.addingTimeInterval(-60 * 60))
    }

    static func dayString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    static func date(from day: String) -> Date? {
        dayFormatter.date(from: day)
    }

    private static func uiTestTodayOverride() -> String? {
        // 테스트 클럭 주입은 DEBUG 전용 — Release 바이너리에는 런치인자/환경변수 경로가
        // 컴파일되지 않는다(다른 UITest 훅과 동일하게 #if DEBUG 격리).
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let hit = args.first(where: { $0.hasPrefix("UITestNow=") }) {
            return String(hit.dropFirst("UITestNow=".count))
        }
        return ProcessInfo.processInfo.environment["UITestNow"]
        #else
        return nil
        #endif
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

enum PhotoKind: String, Codable, Hashable {
    case free
    case challengeLog
}

struct WeeklyReportSummary: Codable, Identifiable, Equatable {
    var id: String { weekStart }

    var weekStart: String
    var weekEnd: String
    var generatedAt: Int
    var checkInCount: Int
    var completedCardCount: Int
    var topCategory: Category?
    var highlightCardTitle: String?
    var photoLogCount: Int
    var usedSaver: Bool
}

struct RetentionState: Codable, Equatable {
    var currentLightStreak: Int
    var bestLightStreak: Int
    var lastCheckInDate: String?
    var streakSavers: Int
    var saverRefreshMonth: String
    var checkInDates: [String]
    var usedSaverDates: [String]
    var weeklyReports: [WeeklyReportSummary]

    static func fresh(today: String = AppClock.todayString()) -> RetentionState {
        RetentionState(
            currentLightStreak: 0,
            bestLightStreak: 0,
            lastCheckInDate: nil,
            streakSavers: RetentionEngine.maxMonthlySavers,
            saverRefreshMonth: RetentionEngine.monthKey(for: today),
            checkInDates: [],
            usedSaverDates: [],
            weeklyReports: []
        )
    }
}

extension RetentionState {
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currentLightStreak = (try? c.decode(Int.self, forKey: .currentLightStreak)) ?? 0
        bestLightStreak = (try? c.decode(Int.self, forKey: .bestLightStreak)) ?? 0
        lastCheckInDate = try? c.decode(String.self, forKey: .lastCheckInDate)
        streakSavers = (try? c.decode(Int.self, forKey: .streakSavers)) ?? RetentionEngine.maxMonthlySavers
        saverRefreshMonth = (try? c.decode(String.self, forKey: .saverRefreshMonth))
            ?? RetentionEngine.monthKey(for: AppClock.todayString())
        checkInDates = (try? c.decode([String].self, forKey: .checkInDates)) ?? []
        usedSaverDates = (try? c.decode([String].self, forKey: .usedSaverDates)) ?? []
        weeklyReports = (try? c.decode([WeeklyReportSummary].self, forKey: .weeklyReports)) ?? []
    }
}

enum RetentionEngine {
    static let maxMonthlySavers = 2
    private static let maxStoredCheckIns = 420
    private static let maxWeeklyReports = 12

    struct CheckInResult: Equatable {
        var state: RetentionState
        var changed: Bool
        var usedSaver: Bool
    }

    static func checkIn(_ input: RetentionState, today: String = AppClock.todayString()) -> CheckInResult {
        var state = refreshMonthlySavers(input, today: today)
        if state.lastCheckInDate == today {
            return CheckInResult(state: state, changed: false, usedSaver: false)
        }

        var usedSaver = false
        if let last = state.lastCheckInDate,
           let gap = dayGap(from: last, to: today) {
            if gap == 1 {
                state.currentLightStreak += 1
            } else if gap == 2, state.streakSavers > 0, let missed = addDays(last, 1) {
                state.streakSavers -= 1
                state.usedSaverDates = appendUnique(state.usedSaverDates, missed)
                state.currentLightStreak += 1
                usedSaver = true
            } else {
                state.currentLightStreak = 1
            }
        } else {
            state.currentLightStreak = 1
        }

        state.bestLightStreak = max(state.bestLightStreak, state.currentLightStreak)
        state.lastCheckInDate = today
        state.checkInDates = appendUnique(state.checkInDates, today)
        if state.checkInDates.count > maxStoredCheckIns {
            state.checkInDates = Array(state.checkInDates.suffix(maxStoredCheckIns))
        }
        return CheckInResult(state: state, changed: true, usedSaver: usedSaver)
    }

    static func refreshMonthlySavers(_ input: RetentionState, today: String) -> RetentionState {
        let month = monthKey(for: today)
        guard input.saverRefreshMonth != month else { return input }
        var state = input
        state.streakSavers = maxMonthlySavers
        state.saverRefreshMonth = month
        return state
    }

    /// 직전 주들의 리포트를 생성·백필. 결주 후 복귀(2주+ 결주) 시 자리비운 모든
    /// 주의 회고를 한 번에 만든다 — 이전 구현은 *가장 직전 1주* 만 채우고 끝나
    /// 2주 이상 자리비웠을 때 중간 주(들) 리포트가 영원히 사라졌다.
    ///
    /// 범위: 오늘이 속한 주의 직전 maxWeeklyReports 주까지 검사. 이미 존재하는
    /// 주는 skip. 활동(완료/체크인/챌린지로그)이 0 인 주도 skip — "사용 0일" 리포트는
    /// 사용자에게 의미 없고 모달만 늘림.
    static func generatePreviousWeekReport(
        retention input: RetentionState,
        progress: UserProgress,
        photos: [PhotoMeta],
        today: String = AppClock.todayString()
    ) -> RetentionState {
        guard let todayDate = AppClock.date(from: today) else { return input }
        let thisWeekStart = weekStartDate(for: todayDate)
        let existingWeeks = Set(input.weeklyReports.map(\.weekStart))
        var newReports: [WeeklyReportSummary] = []

        for offset in 1...maxWeeklyReports {
            guard let weekStartDate = Calendar.retentionCalendar.date(
                byAdding: .day, value: -7 * offset, to: thisWeekStart
            ) else { continue }
            let weekStart = AppClock.dayString(weekStartDate)
            if existingWeeks.contains(weekStart) { continue }
            guard let weekEndDate = Calendar.retentionCalendar.date(
                byAdding: .day, value: 6, to: weekStartDate
            ) else { continue }
            let weekEnd = AppClock.dayString(weekEndDate)
            let inRange: (String) -> Bool = { day in
                isDay(day, inClosedRangeFrom: weekStart, to: weekEnd)
            }
            let hasActivity = progress.completionHistory.contains { inRange($0.date) }
                || input.checkInDates.contains(where: inRange)
                || photos.contains { $0.kind == .challengeLog && inRange($0.date) }
            guard hasActivity else { continue }
            newReports.append(buildReport(
                weekStart: weekStart,
                weekEnd: weekEnd,
                progress: progress,
                retention: input,
                photos: photos
            ))
        }

        guard !newReports.isEmpty else { return input }
        var state = input
        // 최신주가 앞에 오도록 정렬 + maxWeeklyReports cap.
        state.weeklyReports = (newReports + state.weeklyReports)
            .sorted { $0.weekStart > $1.weekStart }
        if state.weeklyReports.count > maxWeeklyReports {
            state.weeklyReports = Array(state.weeklyReports.prefix(maxWeeklyReports))
        }
        return state
    }

    static func buildReport(
        weekStart: String,
        weekEnd: String,
        progress: UserProgress,
        retention: RetentionState,
        photos: [PhotoMeta]
    ) -> WeeklyReportSummary {
        let records = progress.completionHistory.filter {
            isDay($0.date, inClosedRangeFrom: weekStart, to: weekEnd)
        }
        let checkIns = retention.checkInDates.filter {
            isDay($0, inClosedRangeFrom: weekStart, to: weekEnd)
        }
        let photoLogs = photos.filter {
            $0.kind == .challengeLog && isDay($0.date, inClosedRangeFrom: weekStart, to: weekEnd)
        }
        let saverUsed = retention.usedSaverDates.contains {
            isDay($0, inClosedRangeFrom: weekStart, to: weekEnd)
        }

        var categoryCounts: [Category: Int] = [:]
        var titleById: [String: String] = [:]
        for card in CardCatalog.allCards {
            titleById[card.id] = card.title
        }
        for record in records {
            for id in record.completedCardIds {
                if let card = CardCatalog.card(id: id) {
                    categoryCounts[card.category, default: 0] += 1
                }
            }
        }
        let topCategory = categoryCounts.sorted {
            if $0.value == $1.value { return $0.key.rawValue < $1.key.rawValue }
            return $0.value > $1.value
        }.first?.key

        let highlight = records
            .flatMap(\.completedCardIds)
            .reversed()
            .compactMap { titleById[$0] }
            .first

        return WeeklyReportSummary(
            weekStart: weekStart,
            weekEnd: weekEnd,
            generatedAt: Int(Date().timeIntervalSince1970 * 1000),
            checkInCount: Set(checkIns).count,
            completedCardCount: records.reduce(0) { $0 + $1.completedCardIds.count },
            topCategory: topCategory,
            highlightCardTitle: highlight,
            photoLogCount: photoLogs.count,
            usedSaver: saverUsed
        )
    }

    static func weekId(for day: String) -> String {
        guard let date = AppClock.date(from: day) else { return day }
        return AppClock.dayString(weekStartDate(for: date))
    }

    static func monthKey(for day: String) -> String {
        String(day.prefix(7))
    }

    static func addDays(_ day: String, _ value: Int) -> String? {
        guard let date = AppClock.date(from: day),
              let next = Calendar.retentionCalendar.date(byAdding: .day, value: value, to: date) else {
            return nil
        }
        return AppClock.dayString(next)
    }

    private static func weekStartDate(for date: Date) -> Date {
        let cal = Calendar.retentionCalendar
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return cal.date(from: comps) ?? date
    }

    private static func dayGap(from: String, to: String) -> Int? {
        guard let a = AppClock.date(from: from), let b = AppClock.date(from: to) else { return nil }
        return Calendar.retentionCalendar.dateComponents([.day], from: a, to: b).day
    }

    private static func isDay(_ day: String, inClosedRangeFrom start: String, to end: String) -> Bool {
        day >= start && day <= end
    }

    private static func appendUnique(_ arr: [String], _ value: String) -> [String] {
        arr.contains(value) ? arr : arr + [value]
    }
}

private extension Calendar {
    static var retentionCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "en_US_POSIX")
        cal.timeZone = .current
        cal.firstWeekday = 2 // Monday
        cal.minimumDaysInFirstWeek = 4
        return cal
    }
}
