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
        return dayString(now)
    }

    static func dayString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    static func date(from day: String) -> Date? {
        dayFormatter.date(from: day)
    }

    private static func uiTestTodayOverride() -> String? {
        let args = ProcessInfo.processInfo.arguments
        if let hit = args.first(where: { $0.hasPrefix("UITestNow=") }) {
            return String(hit.dropFirst("UITestNow=".count))
        }
        return ProcessInfo.processInfo.environment["UITestNow"]
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

    static func generatePreviousWeekReport(
        retention input: RetentionState,
        progress: UserProgress,
        photos: [PhotoMeta],
        today: String = AppClock.todayString()
    ) -> RetentionState {
        guard let todayDate = AppClock.date(from: today),
              let previousWeekStart = Calendar.retentionCalendar.date(
                byAdding: .day,
                value: -7,
                to: weekStartDate(for: todayDate)
              ) else { return input }

        let start = AppClock.dayString(previousWeekStart)
        if input.weeklyReports.contains(where: { $0.weekStart == start }) {
            return input
        }
        guard let endDate = Calendar.retentionCalendar.date(byAdding: .day, value: 6, to: previousWeekStart) else {
            return input
        }
        let end = AppClock.dayString(endDate)
        let report = buildReport(
            weekStart: start,
            weekEnd: end,
            progress: progress,
            retention: input,
            photos: photos
        )
        var state = input
        state.weeklyReports.insert(report, at: 0)
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
