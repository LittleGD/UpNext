import SwiftUI

/// Rehearsal stays visibly separate from the real Home Screen installation.
struct WidgetSetupPractice: View {
    let step: Int
    let onAdvance: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var holding = false
    @State private var menuOpen = false
    @State private var wide = true
    @State private var added = false

    private func copy(_ key: String.LocalizationValue) -> String { RetentionSetupCopy.text(key) }
    private var motion: Animation { reduceMotion ? .easeOut(duration: 0.12) : Anim.cardOverlayEnter }

    var body: some View {
        VStack(spacing: 12) {
            Text(copy("연습")).typography(.micro).foregroundStyle(Color.textTertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
            if step == 2 { gallery } else { home }
        }
        .padding(14)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
    }

    private var home: some View {
        VStack(spacing: 12) {
            if step == 1 {
                HStack {
                    Button {
                        Haptics.play(.selection)
                        withAnimation(motion) { menuOpen.toggle() }
                    } label: {
                        Text(copy("편집")).typography(.caption)
                            .padding(.horizontal, 14).frame(minHeight: 44)
                            .background(Color.accentPrimary, in: Capsule())
                            .foregroundStyle(Color.bgPrimary)
                    }.buttonStyle(.unPress).accessibilityIdentifier("widgetPracticeEdit")
                    Spacer()
                    Text(copy("완료")).typography(.caption).foregroundStyle(Color.textTertiary)
                }
                .overlay(alignment: .topLeading) {
                    if menuOpen {
                        Button(action: onAdvance) {
                            HStack(spacing: 8) {
                                PixelIcon(.plus, size: 18)
                                Text(copy("위젯 추가")).typography(.body)
                            }
                            .padding(.horizontal, 14).frame(minHeight: 48)
                            .background(Color.bgHover, in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(Color.textPrimary)
                        }
                        .buttonStyle(.unPress)
                        .offset(y: 46).zIndex(2)
                        .transition(.opacity)
                        .accessibilityIdentifier("widgetPracticeAddMenu")
                    }
                }.zIndex(2)
            }
            HStack(spacing: 14) {
                ForEach(0..<4) { index in
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.textSecondary.opacity(index == 0 ? 0.24 : 0.1))
                        .frame(width: 32, height: 32)
                        .rotationEffect(.degrees(reduceMotion || step == 0 ? 0 : (index.isMultiple(of: 2) ? -3 : 3)))
                }
                Spacer(minLength: 0)
            }.accessibilityHidden(true)
            if step == 0 {
                ZStack {
                    Circle().trim(from: 0, to: holding ? 1 : 0)
                        .stroke(Color.accentPrimary, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .frame(width: 58, height: 58).rotationEffect(.degrees(-90))
                        .animation(holding && !reduceMotion ? .linear(duration: 0.65) : nil, value: holding)
                    PixelIcon(.hand, size: 30, color: .accentPrimary)
                        .scaleEffect(reduceMotion || !holding ? 1 : 0.94)
                }
                .frame(maxWidth: .infinity, minHeight: 88)
                .contentShape(Rectangle())
                .onLongPressGesture(minimumDuration: 0.65, maximumDistance: 24,
                                    perform: onAdvance, onPressingChanged: { holding = $0 })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(copy("빈 곳 길게 누르기"))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { onAdvance() }
                .accessibilityIdentifier("widgetPracticeHold")
            } else {
                PixelIcon(.arrowUp, size: 28, color: .accentPrimary)
                    .rotationEffect(.degrees(-45))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .accessibilityHidden(true)
            }
        }
    }

    private var gallery: some View {
        VStack(spacing: 12) {
            Button {
                Haptics.play(.success)
                withAnimation(motion) { added = true }
            } label: {
                RetentionWidgetPreview()
                    .frame(maxWidth: wide ? .infinity : 156)
                    .scaleEffect(reduceMotion || !added ? 1 : 0.96)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(copy("위젯 놓기"))
            .accessibilityIdentifier("widgetPracticePlace")
            Text(copy(added ? "연습 완료" : "위젯을 눌러 놓아보세요."))
                .typography(.micro).foregroundStyle(added ? Color.accentPrimary : Color.textSecondary)
                .accessibilityIdentifier(added ? "widgetPracticeFinished" : "widgetPracticeHint")
            Picker(copy("위젯 크기"), selection: $wide) {
                Text(copy("작게")).tag(false)
                Text(copy("넓게")).tag(true)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("widgetPracticeSize")
            .onChange(of: wide) { _ in Haptics.play(.selection) }
        }
        .animation(reduceMotion ? nil : Anim.easeOut(0.2), value: wide)
    }
}

struct RetentionWidgetPreview: View {
    @EnvironmentObject private var store: GameStore
    private func copy(_ key: String.LocalizationValue) -> String { RetentionSetupCopy.text(key) }

    private var taskTitle: String {
        guard let daily = store.daily else { return copy("오늘의 챌린지") }
        let cards: [ChallengeCard]
        let done: [String]
        switch daily.challengePhase {
        case .daily: cards = daily.selectedCards; done = daily.completedIds
        case .extra: cards = daily.extraSelectedCards; done = daily.extraCompletedIds
        case .super: cards = daily.superSelectedCards; done = daily.superCompletedIds
        }
        return cards.first(where: { !done.contains($0.id) })?.localizedTitle(.current)
            ?? AppConfig.loc("widget.daily.complete")
    }

    private var completion: (done: Int, total: Int) {
        guard let daily = store.daily else { return (0, 0) }
        switch daily.challengePhase {
        case .daily: return (daily.completedIds.count, daily.selectedCards.count)
        case .extra: return (daily.extraCompletedIds.count, daily.extraSelectedCards.count)
        case .super: return (daily.superCompletedIds.count, daily.superSelectedCards.count)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("UpNext").typography(.micro)
                Spacer(minLength: 8)
                PixelIcon(.flame, size: 16, color: .accentPrimary).accessibilityHidden(true)
            }
            Text(taskTitle).typography(.body).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 5) {
                ForEach(0..<min(completion.total, 5), id: \.self) { index in
                    Capsule().fill(index < completion.done ? Color.accentPrimary : Color.bgHover)
                        .frame(width: 16, height: 4)
                }
                Text("\(completion.done)/\(completion.total)").typography(.micro).monospacedDigit()
                Spacer()
                PixelIcon(.arrowUp, size: 16, color: .accentPrimary).rotationEffect(.degrees(45))
            }
            .accessibilityHidden(true)
        }
        .padding(14)
        .foregroundStyle(Color.textPrimary)
        .background(Color.bgPrimary, in: RoundedRectangle(cornerRadius: 12))
    }
}
