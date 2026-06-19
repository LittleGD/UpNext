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
//  PixelIcon 브랜드 아이콘 사용 — Target.imageset 을 UpNextWidget/Assets.xcassets 에
//  복사(동기화 그룹 자동 번들)해 widgetTargetIcon() 으로 template 렌더. SF Symbol 폐기.
//

import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - 위젯 브랜드 폰트 (메인 앱과 동일 April16th Promise — 번들 등록)

private extension Font {
    /// 위젯 브랜드 텍스트 폰트. 폰트는 UpNextWidget/April16th-Promise.ttf (번들 복사) +
    /// Info.plist UIAppFonts 로 등록. family명 "April16th Promise" (메인 앱 동일).
    /// 숫자/데이터 라벨은 정렬 위해 system monospaced/rounded 유지.
    static func up(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("April16th Promise", size: size).weight(weight)
    }
}

// MARK: - 위젯 픽셀 아이콘 (브랜드 PixelIcon — 위젯 번들 Assets.xcassets)

/// SF Symbol "target" 폴백 폐기 — 메인 앱과 동일 픽셀아트 Target 아이콘.
/// Target.imageset 을 UpNextWidget/Assets.xcassets 에 복사(동기화 번들), template 렌더.
private func widgetTargetIcon(_ size: CGFloat) -> some View {
    Image("Target")
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: size, height: size)
        .foregroundColor(.accentPrimary)
}

/// 스트릭 칩용 브랜드 불꽃 아이콘 — Flame.imageset(fire.svg) 를 UpNextWidget/Assets.xcassets 에
/// 복사(Target.imageset 패턴). 앱 불꽃 탭과 동일하게 accentPrimary(라임) 틴트.
/// (디자인 토큰 규칙: accentSecondary 는 에러 전용 — 불꽃에 쓰지 않음.)
private func widgetFlameIcon(_ size: CGFloat) -> some View {
    Image("Flame")
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: size, height: size)
        .foregroundColor(.accentPrimary)
}

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
// MARK: 공용 — 레트로 픽셀 도트 진행 · 스트릭 칩 · 태스크 행

/// 사각 픽셀 도트 진행 + "X/Y" (한 HStack 으로 묶어 게이지 오해 차단).
/// done = 라임 채움 / todo = 외곽선. 총 1~6, small/medium 은 maxDots 로 압축.
private struct DotProgress: View {
    let done: Int
    let total: Int
    var dotSize: CGFloat = 9
    var spacing: CGFloat = 4
    var maxDots: Int = 5
    var countFont: Font = .system(size: 15, weight: .bold, design: .rounded)
    var countColor: Color = .textSecondary

    private var shown: Int { max(0, min(total, maxDots)) }
    private var filled: Int {
        guard total > 0 else { return 0 }
        return total <= maxDots
            ? min(done, total)
            : Int((Double(maxDots) * Double(done) / Double(total)).rounded())
    }

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: spacing) {
                ForEach(0..<shown, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(i < filled ? Color.accentPrimary : Color.clear)
                        .frame(width: dotSize, height: dotSize)
                        .overlay {
                            if i >= filled {
                                RoundedRectangle(cornerRadius: 1.5).stroke(Color.textTertiary, lineWidth: 1.5)
                            }
                        }
                }
            }
            Text("\(done)/\(total)")
                .font(countFont).monospacedDigit()
                .foregroundColor(done == total && total > 0 ? .accentPrimary : countColor)
        }
    }
}

/// 보조 스트릭 칩 — 불꽃 아이콘 + 숫자(배경/보더 없음, 디자인 규칙). streak 0 이면 숨김.
private struct StreakChip: View {
    let streak: Int
    var flameSize: CGFloat = 13
    var numberSize: CGFloat = 14

    var body: some View {
        if streak > 0 {
            HStack(spacing: 4) {
                widgetFlameIcon(flameSize)
                Text("\(streak)")
                    .font(.system(size: numberSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.textSecondary)
            }
        }
    }
}

/// medium 우측 미니 태스크 행 (7pt 상태 사각 + 제목).
private struct TaskRowMini: View {
    let task: WidgetTask
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(task.done ? Color.accentPrimary : Color.clear)
                .frame(width: 7, height: 7)
                .overlay {
                    if !task.done {
                        RoundedRectangle(cornerRadius: 1.5).stroke(Color.textTertiary, lineWidth: 1)
                    }
                }
                .offset(y: -1)
            Text(task.title)
                .font(.up(13, .medium))
                .foregroundColor(task.done ? .textTertiary : .textSecondary)
                .strikethrough(task.done, color: .textTertiary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

/// large 태스크 리스트 행 (16pt 상태 글리프 + 제목, '다음 할 일'은 라임 강조).
private struct TaskRowLarge: View {
    let task: WidgetTask
    let isNextTodo: Bool
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 3)
                .fill(task.done ? Color.accentPrimary : Color.clear)
                .frame(width: 16, height: 16)
                .overlay {
                    if !task.done {
                        RoundedRectangle(cornerRadius: 3).stroke(Color.textTertiary, lineWidth: 1.5)
                    }
                }
            Text(task.title)
                .font(.up(16, task.done ? .regular : (isNextTodo ? .semibold : .medium)))
                .foregroundColor(task.done ? .textTertiary : (isNextTodo ? .accentPrimary : .textPrimary))
                .strikethrough(task.done, color: .textTertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.9)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Home Widget Views (태스크 중심)

/// small (155×155): 헤더 + 다음 태스크(히어로) + 도트 진행. 리스트 없음(공간 부족).
struct HomeSmallView: View {
    let state: WidgetState
    private var allDone: Bool { state.todayCount > 0 && state.todayDone == state.todayCount }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                widgetTargetIcon(13)
                Text(AppConfig.locBundled("widget.label.today_challenge"))
                    .font(.up(13, .semibold)).foregroundColor(.textTertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                StreakChip(streak: state.streak)
            }
            Spacer(minLength: 6)
            Text(state.displayChallengeTitle)
                .font(.up(20, .semibold))
                .foregroundColor(allDone ? .accentPrimary : .textPrimary)
                .lineLimit(3).multilineTextAlignment(.leading).minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 8)
            if state.todayCount > 0 {
                DotProgress(done: state.todayDone, total: state.todayCount)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// medium (329×155pt): 메인 챌린지 + 진행률 + streak
/// medium (329×155): 좌(헤더 + 다음 태스크 히어로 + 도트) · 우(오늘 태스크 미리보기 최대 3행).
struct HomeMediumView: View {
    let state: WidgetState
    private var allDone: Bool { state.todayCount > 0 && state.todayDone == state.todayCount }
    /// 좌측 히어로(다음 할 일)와 중복되지 않도록, 우측 미리보기는 '히어로 태스크'를 제외한 나머지.
    private var nextIdx: Int? { state.tasks.firstIndex(where: { !$0.done }) }
    private var peekAll: [WidgetTask] {
        guard let n = nextIdx else { return state.tasks }   // 전부 완료 → 전체 목록
        return state.tasks.enumerated().filter { $0.offset != n }.map(\.element)
    }
    private var peek: [WidgetTask] { Array(peekAll.prefix(3)) }
    private var peekOverflow: Int { max(0, peekAll.count - 3) }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            // LEFT — 실행 존
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    widgetTargetIcon(13)
                    Text(AppConfig.locBundled("widget.label.today_challenge"))
                        .font(.up(13, .semibold)).foregroundColor(.textTertiary).lineLimit(1)
                    Spacer(minLength: 4)
                    StreakChip(streak: state.streak)
                }
                Spacer(minLength: 6)
                Text(state.displayChallengeTitle)
                    .font(.up(20, .semibold))
                    .foregroundColor(allDone ? .accentPrimary : .textPrimary)
                    .lineLimit(2).minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 8)
                if state.todayCount > 0 {
                    DotProgress(done: state.todayDone, total: state.todayCount)
                }
            }

            // RIGHT — 태스크 미리보기 (데이터 있을 때만, 세로 중앙)
            if state.todayCount > 0 && !peek.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(Array(peek.enumerated()), id: \.offset) { _, t in
                        TaskRowMini(task: t)
                    }
                    if peekOverflow > 0 {
                        Text("+\(peekOverflow)")
                            .font(.up(12, .medium)).foregroundColor(.textTertiary)
                    }
                }
                .frame(width: 118)
                .frame(maxHeight: .infinity, alignment: .leading)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// large (329×345pt): 메인 챌린지 + XP 게이지 + CTA
/// large (329×345): 헤더 + 도트 요약 + 실제 오늘의 태스크 체크리스트(최대 6).
struct HomeLargeView: View {
    let state: WidgetState
    private var list: [WidgetTask] { Array(state.tasks.prefix(6)) }
    private var firstTodo: Int? { list.firstIndex(where: { !$0.done }) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                widgetTargetIcon(16)
                Text(AppConfig.locBundled("widget.label.today_challenge"))
                    .font(.up(17, .semibold)).foregroundColor(.textPrimary).lineLimit(1)
                Spacer(minLength: 4)
                StreakChip(streak: state.streak, flameSize: 15, numberSize: 16)
            }

            if state.todayCount > 0 {
                DotProgress(done: state.todayDone, total: state.todayCount,
                            dotSize: 12, spacing: 5, maxDots: 6,
                            countFont: .system(size: 18, weight: .bold, design: .rounded),
                            countColor: .accentPrimary)
                Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1).padding(.vertical, 2)
            }

            if !list.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(list.enumerated()), id: \.offset) { i, t in
                        TaskRowLarge(task: t, isNextTodo: i == firstTodo)
                    }
                }
            } else {
                // tasks[] 부재(구버전) 또는 선택 전 — 다음 태스크/안내 문구를 히어로로.
                Text(state.displayChallengeTitle)
                    .font(.up(22, .semibold)).foregroundColor(.textPrimary)
                    .lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// (ProgressBar 게이지 제거 — 진행은 DotProgress 픽셀 도트로 표기. XP 오해 차단.)

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
            Text(AppConfig.locBundled("widget.label.streak"))
                .font(.up(9, .semibold))
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
                .font(.up(13, .semibold))
                .lineLimit(2)
        }
    }
}

struct LockInlineView: View {
    let state: WidgetState

    var body: some View {
        // "widget.lock.inline" (값: "UpNext · %1$lld/%2$lld · %3$lld일 연속").
        // 인앱 언어 .lproj 를 직접 로드(AppConfig.locBundled)해 포맷 문자열을 얻는다 —
        // String(localized:locale:)/NSLocalizedString 은 위젯에서 시스템 언어로 떨어짐.
        Text(String(
            format: AppConfig.locBundled("widget.lock.inline"),
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
        .contentMarginsDisabled()   // 시스템 기본 여백 제거 → 배경 엣지투엣지(액자감 제거). 위젯 타깃 iOS17.
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
                        widgetTargetIcon(14)
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
                        .font(.up(15, .semibold))
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                widgetTargetIcon(14)
            } compactTrailing: {
                Text(context.state.expiresAt, style: .timer)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.accentPrimary)
                    .frame(maxWidth: 56)
            } minimal: {
                widgetTargetIcon(14)
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
                widgetTargetIcon(22)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("widget.activity.in_progress")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.textTertiary)
                Text(context.state.title)
                    .font(.up(15, .semibold))
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
