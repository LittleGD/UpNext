//
//  UpNextWidget.swift
//  WidgetKit + ActivityKit 진입점.
//
//  포함:
//   - HomeWidget: 홈 화면 위젯 (small/medium/large)
//   - LockWidget: 잠금화면 위젯 (accessoryCircular/Rectangular/Inline)
//   - ChallengeLiveActivity: Live Activity + Dynamic Island
//
//  WidgetBundle main 으로 묶여 단일 Widget Extension 타깃에서 모두 노출.
//

import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Design Tokens

extension Color {
    /// UpNext 디자인 토큰 — 위젯 내부에서만 쓰는 정적 정의 (Asset Catalog 없이도 동작)
    static let upBg            = Color(red: 0.039, green: 0.039, blue: 0.039)  // #0A0A0A
    static let upBgSurface     = Color(red: 0.078, green: 0.078, blue: 0.082)  // #141415
    static let upBgElevated    = Color(red: 0.118, green: 0.118, blue: 0.125)  // #1E1E20
    static let upAccent        = Color(red: 0.780, green: 0.949, blue: 0.424)  // #C7F26C
    static let upTextPrimary   = Color.white
    static let upTextSecondary = Color.white.opacity(0.6)
    static let upTextTertiary  = Color.white.opacity(0.4)
}

extension View {
    /// iOS 17+: containerBackground modifier 적용. 그 미만에선 no-op (배경은 ZStack에서 처리).
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { color }
        } else {
            self
        }
    }
}

// MARK: - Timeline Provider

struct UpNextEntry: TimelineEntry {
    let date: Date
    let state: WidgetState
}

struct UpNextProvider: TimelineProvider {
    func placeholder(in context: Context) -> UpNextEntry {
        UpNextEntry(date: Date(), state: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
        let state = context.isPreview ? .placeholder : WidgetState.load()
        completion(UpNextEntry(date: Date(), state: state))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
        let state = WidgetState.load()
        let now = Date()
        let entry = UpNextEntry(date: now, state: state)
        // 30분 후 재요청 — 앱이 active이면 reloadAllTimelines로 즉시 갱신되지만,
        // 백그라운드에서 자정 전후 streak 변화 등을 위해 주기적 polling도 같이 둠.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Home Widget Views

/// small (155×155pt @ iPhone 14 Pro): 연속일 강조
struct HomeSmallView: View {
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("UpNext")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upAccent)
                Spacer()
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(state.streak)")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundColor(.upTextPrimary)
                Text("일")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.upTextSecondary)
            }
            Text("연속 달성")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.upTextTertiary)

            Spacer(minLength: 0)

            // 오늘 진행률 미니 바
            ProgressBar(ratio: state.progressRatio)
                .frame(height: 4)
            Text("오늘 \(state.todayDone)/\(state.todayCount)")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.upTextSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// medium (329×155pt): 메인 챌린지 + 진행률 + streak
struct HomeMediumView: View {
    let state: WidgetState

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            // Left: streak block
            VStack(alignment: .leading, spacing: 4) {
                Text("UpNext")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upAccent)
                Spacer(minLength: 0)
                Text("\(state.streak)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.upTextPrimary)
                Text("연속")
                    .font(.system(size: 11))
                    .foregroundColor(.upTextSecondary)
            }
            .frame(width: 80)

            // Divider
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 1)

            // Right: today main challenge + progress
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("오늘의 챌린지")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.upTextTertiary)
                    Spacer()
                    Text("\(state.todayDone)/\(state.todayCount)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.upAccent)
                }

                Text(state.mainChallengeTitle.isEmpty ? "카드를 뽑아 챌린지를 시작해보세요" : state.mainChallengeTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.upTextPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 0)

                ProgressBar(ratio: state.progressRatio)
                    .frame(height: 5)

                Text("Lv.\(state.level) \(state.levelTitle)")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.upTextSecondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// large (329×345pt): 메인 챌린지 + XP 게이지 + CTA
struct HomeLargeView: View {
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("UpNext")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upAccent)
                Spacer()
                Text("Lv.\(state.level)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upTextSecondary)
            }

            // Streak hero
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(state.streak)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundColor(.upTextPrimary)
                Text("일 연속")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.upTextSecondary)
                Spacer()
            }

            // Divider
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)

            // Main challenge
            VStack(alignment: .leading, spacing: 6) {
                Text("오늘의 메인 챌린지")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upTextTertiary)
                Text(state.mainChallengeTitle.isEmpty ? "카드를 뽑아 챌린지를 시작해보세요" : state.mainChallengeTitle)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.upTextPrimary)
                    .lineLimit(2)
            }

            // Progress
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("진행률")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.upTextTertiary)
                    Spacer()
                    Text("\(state.todayDone)/\(state.todayCount)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.upAccent)
                }
                ProgressBar(ratio: state.progressRatio)
                    .frame(height: 6)
            }

            // XP gauge
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("XP")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.upTextTertiary)
                    Spacer()
                    Text("\(state.xp) / \(state.xpForNext)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.upTextSecondary)
                }
                ProgressBar(ratio: state.xpRatio, tint: .upTextSecondary)
                    .frame(height: 4)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// 공용 진행률 바
struct ProgressBar: View {
    let ratio: Double
    var tint: Color = .upAccent

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.white.opacity(0.08))
                RoundedRectangle(cornerRadius: 2)
                    .fill(tint)
                    .frame(width: max(2, geo.size.width * CGFloat(ratio)))
            }
        }
    }
}

// MARK: - Home Widget Entry View

struct HomeWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: UpNextEntry

    var body: some View {
        ZStack {
            Color.upBg
            switch family {
            case .systemSmall:  HomeSmallView(state: entry.state)
            case .systemMedium: HomeMediumView(state: entry.state)
            case .systemLarge:  HomeLargeView(state: entry.state)
            default:            HomeSmallView(state: entry.state)
            }
        }
        .widgetBackground(.upBg)
    }
}

// MARK: - Lock Screen Widget Views

struct LockCircularView: View {
    let state: WidgetState

    var body: some View {
        VStack(spacing: 0) {
            Text("\(state.streak)")
                .font(.system(size: 22, weight: .bold, design: .rounded))
            Text("연속")
                .font(.system(size: 9, weight: .semibold))
        }
    }
}

struct LockRectangularView: View {
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text("UpNext")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                Spacer()
                Text("\(state.todayDone)/\(state.todayCount)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
            }
            Text(state.mainChallengeTitle.isEmpty ? "오늘의 카드를 뽑아보세요" : state.mainChallengeTitle)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(2)
        }
    }
}

struct LockInlineView: View {
    let state: WidgetState

    var body: some View {
        Text("UpNext · \(state.todayDone)/\(state.todayCount) · \(state.streak)일 연속")
    }
}

struct LockWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: UpNextEntry

    var body: some View {
        switch family {
        case .accessoryCircular:    LockCircularView(state: entry.state)
        case .accessoryRectangular: LockRectangularView(state: entry.state)
        case .accessoryInline:      LockInlineView(state: entry.state)
        default:                    LockInlineView(state: entry.state)
        }
    }
}

// MARK: - Widget Configurations

struct HomeWidget: Widget {
    let kind: String = "UpNextHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpNextProvider()) { entry in
            HomeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("UpNext")
        .description("연속 달성일과 오늘의 챌린지를 한눈에")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct LockWidget: Widget {
    let kind: String = "UpNextLockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpNextProvider()) { entry in
            LockWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("UpNext 잠금화면")
        .description("잠금화면에서 챌린지 진행 확인")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Live Activity (iOS 16.1+)

@available(iOS 16.1, *)
struct ChallengeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ChallengeActivityAttributes.self) { context in
            // Lock Screen / Banner
            ChallengeLockScreenView(context: context)
                .activityBackgroundTint(.upBg)
                .activitySystemActionForegroundColor(.upAccent)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — 다이나믹 아일랜드 펼친 상태 (longPress 시)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "target")
                            .foregroundColor(.upAccent)
                        Text("챌린지")
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.upTextSecondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.expiresAt, style: .timer)
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.upAccent)
                        .multilineTextAlignment(.trailing)
                }
                DynamicIslandExpandedRegion(.center) { EmptyView() }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.upTextPrimary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "target")
                    .foregroundColor(.upAccent)
            } compactTrailing: {
                Text(context.state.expiresAt, style: .timer)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upAccent)
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: "target")
                    .foregroundColor(.upAccent)
            }
            .keylineTint(.upAccent)
        }
    }
}

@available(iOS 16.1, *)
struct ChallengeLockScreenView: View {
    let context: ActivityViewContext<ChallengeActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.upAccent.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "target")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.upAccent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("진행 중인 챌린지")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upTextTertiary)
                Text(context.state.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.upTextPrimary)
                    .lineLimit(2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("남은 시간")
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(.upTextTertiary)
                Text(context.state.expiresAt, style: .timer)
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(.upAccent)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Bundle (Widget Extension entry)

@main
struct UpNextWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeWidget()
        LockWidget()
        if #available(iOS 16.1, *) {
            ChallengeLiveActivity()
        }
    }
}
