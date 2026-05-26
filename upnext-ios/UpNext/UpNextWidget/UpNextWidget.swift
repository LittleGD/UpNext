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
//  ── 디자인 정체성 (R-디자인) ──
//  Color.bgPrimary / Color.accentPrimary 등의 디자인 토큰은 Shared/Color+Tokens.swift 가
//  widget 타깃에도 멤버라서 그대로 사용. UI 텍스트는 SwiftUI Text(_:) 의 LocalizedStringKey
//  오버로드 + UpNextWidget/Localizable.xcstrings (Bundle.main) 로 4언어 해석.
//
//  ── 아이콘 정책 ──
//  Image(systemName: "target") 같은 SF Symbol 은 widget extension 의 Assets 분리 제약
//  때문에 잠정 유지 (PixelIcon 자산이 위젯 번들에 있지 않음). PixelIcon 자산을 widget
//  번들로 옮기는 작업은 별도 메모리 + Build Phases 변경이 필요 — Phase 추가 시 PixelIcon
//  화이트리스트 위반은 위젯 한정으로 명시적 폴백.
//

import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - 위젯 컨테이너 배경 호환 헬퍼

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
                    .foregroundColor(.accentPrimary)
                Spacer()
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(state.streak)")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Text("widget.label.day_unit")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.textSecondary)
            }
            Text("widget.label.streak_achieved")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.textTertiary)

            Spacer(minLength: 0)

            // 오늘 진행률 미니 바
            ProgressBar(ratio: state.progressRatio)
                .frame(height: 4)
            Text("\(state.todayDone)/\(state.todayCount)")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.textSecondary)
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
                    .foregroundColor(.accentPrimary)
                Spacer(minLength: 0)
                Text("\(state.streak)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Text("widget.label.streak")
                    .font(.system(size: 11))
                    .foregroundColor(.textSecondary)
            }
            .frame(width: 80)

            // Divider
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 1)

            // Right: today main challenge + progress
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("widget.label.today_challenge")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.textTertiary)
                    Spacer()
                    Text("\(state.todayDone)/\(state.todayCount)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.accentPrimary)
                }

                Text(state.displayChallengeTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 0)

                ProgressBar(ratio: state.progressRatio)
                    .frame(height: 5)

                // levelTitle 은 메인 앱이 publish 한 사용자 언어 문자열 — 빈 경우만 가림.
                if !state.levelTitle.isEmpty {
                    Text("Lv.\(state.level) \(state.levelTitle)")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.textSecondary)
                } else {
                    Text("Lv.\(state.level)")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.textSecondary)
                }
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
                    .foregroundColor(.accentPrimary)
                Spacer()
                Text("Lv.\(state.level)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(.textSecondary)
            }

            // Streak hero
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(state.streak)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Text("widget.label.day_streak")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.textSecondary)
                Spacer()
            }

            // Divider
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)

            // Main challenge
            VStack(alignment: .leading, spacing: 6) {
                Text("widget.label.main_challenge")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.textTertiary)
                Text(state.displayChallengeTitle)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
            }

            // Progress
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("widget.label.progress")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.textTertiary)
                    Spacer()
                    Text("\(state.todayDone)/\(state.todayCount)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.accentPrimary)
                }
                ProgressBar(ratio: state.progressRatio)
                    .frame(height: 6)
            }

            // XP gauge — XP/언어 무관 단순 수치라 키 불필요
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("XP")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.textTertiary)
                    Spacer()
                    Text("\(state.xp) / \(state.xpForNext)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.textSecondary)
                }
                ProgressBar(ratio: state.xpRatio, tint: .textSecondary)
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
    var tint: Color = .accentPrimary

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
            Color.bgPrimary
            switch family {
            case .systemSmall:  HomeSmallView(state: entry.state)
            case .systemMedium: HomeMediumView(state: entry.state)
            case .systemLarge:  HomeLargeView(state: entry.state)
            default:            HomeSmallView(state: entry.state)
            }
        }
        // 탭 시 메인 앱 daily 화면으로 딥링크 — UpNextApp.swift 의 onOpenURL 핸들러 필요
        // (E agent 영역). URL scheme `upnext` 는 Info.plist CFBundleURLSchemes 에 등록.
        .widgetURL(URL(string: "upnext://daily"))
        .widgetBackground(.bgPrimary)
    }
}

// MARK: - Lock Screen Widget Views

struct LockCircularView: View {
    let state: WidgetState

    var body: some View {
        VStack(spacing: 0) {
            Text("\(state.streak)")
                .font(.system(size: 22, weight: .bold, design: .rounded))
            Text("widget.label.streak")
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
            Text(state.displayChallengeTitle)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(2)
        }
    }
}

struct LockInlineView: View {
    let state: WidgetState

    var body: some View {
        // String Catalog "widget.lock.inline" 키 (값: "UpNext · %1$lld/%2$lld · %3$lld일 연속")
        // 를 위젯 번들에서 해석. positional %1$lld 형식이라 언어별 어순 자유.
        Text(String(
            format: NSLocalizedString("widget.lock.inline", bundle: .main, comment: ""),
            state.todayDone, state.todayCount, state.streak))
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
        .configurationDisplayName("widget.display_name.home")
        .description("widget.description.home")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct LockWidget: Widget {
    let kind: String = "UpNextLockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpNextProvider()) { entry in
            LockWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("widget.display_name.lock")
        .description("widget.description.lock")
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
                .activityBackgroundTint(.bgPrimary)
                .activitySystemActionForegroundColor(.accentPrimary)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — 다이나믹 아일랜드 펼친 상태 (longPress 시)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        // SF Symbol 폴백 — PixelIcon 자산이 widget 번들에 미포함이라 잠정 유지.
                        Image(systemName: "target")
                            .foregroundColor(.accentPrimary)
                        Text("widget.activity.challenge")
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.textSecondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.expiresAt, style: .timer)
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.accentPrimary)
                        .multilineTextAlignment(.trailing)
                }
                DynamicIslandExpandedRegion(.center) { EmptyView() }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "target")
                    .foregroundColor(.accentPrimary)
            } compactTrailing: {
                Text(context.state.expiresAt, style: .timer)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.accentPrimary)
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: "target")
                    .foregroundColor(.accentPrimary)
            }
            .keylineTint(.accentPrimary)
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
                    .fill(Color.accentPrimary.opacity(0.15))
                    .frame(width: 44, height: 44)
                // SF Symbol 폴백 — PixelIcon 자산이 widget 번들에 미포함이라 잠정 유지.
                Image(systemName: "target")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.accentPrimary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("widget.activity.in_progress")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.textTertiary)
                Text(context.state.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("widget.activity.time_left")
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(.textTertiary)
                Text(context.state.expiresAt, style: .timer)
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(.accentPrimary)
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
