import SwiftUI

/// An explicitly labelled rehearsal, never a fake system permission or success.
struct WidgetSetupPractice: View {
    let step: Int
    let onAdvance: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var holding = false
    @State private var menuOpen = false
    @State private var wide = true
    @State private var added = false
    @Namespace private var placement

    private func copy(_ key: String.LocalizationValue) -> String { RetentionSetupCopy.text(key) }
    private var motion: Animation { reduceMotion ? .easeOut(duration: 0.18) : Anim.cardOverlayEnter }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text(copy("여기서 연습해보세요"))
                    .font(.caption.weight(.medium)).foregroundStyle(Color.textSecondary)
                Spacer()
                Image(systemName: "hand.draw").foregroundStyle(Color.accentPrimary)
            }
            if step == 2 { gallery } else { home }
        }
        .padding(20)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 24))
    }

    private var home: some View {
        VStack(spacing: 22) {
            HStack {
                if step == 1 {
                    Button {
                        Haptics.play(.selection)
                        withAnimation(motion) { menuOpen.toggle() }
                    } label: {
                        Text(copy("편집")).font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16).frame(minHeight: 44)
                            .background(Color.accentPrimary, in: Capsule())
                            .foregroundStyle(Color.bgPrimary)
                    }
                    .accessibilityIdentifier("widgetPracticeEdit")
                } else {
                    Text("UpNext").font(.subheadline.weight(.semibold)).foregroundStyle(Color.textPrimary)
                }
                Spacer()
                if step == 1 {
                    Text(copy("완료")).font(.subheadline).foregroundStyle(Color.textSecondary)
                }
            }
            .overlay(alignment: .topLeading) {
                if menuOpen {
                    Button(action: onAdvance) {
                        Label(copy("위젯 추가"), systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 18).frame(minHeight: 52)
                            .background(Color.bgHover, in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(Color.textPrimary)
                            .shadow(color: .black.opacity(0.3), radius: 12, y: 8)
                    }
                    .offset(y: 50).zIndex(2)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.96, anchor: .topLeading)))
                    .accessibilityIdentifier("widgetPracticeAddMenu")
                }
            }
            .zIndex(2)

            // Neutral silhouettes stand in for the user's home screen app tiles.
            HStack(spacing: 16) {
                ForEach(0..<4) { index in
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.textSecondary.opacity(index == 0 ? 0.24 : 0.1))
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .rotationEffect(.degrees(reduceMotion || step == 0 ? 0 : (index.isMultiple(of: 2) ? -3 : 3)))
                }
            }.accessibilityHidden(true)

            if step == 0 {
                VStack(spacing: 12) {
                    ZStack {
                        Circle().fill(Color.accentPrimary.opacity(holding ? 0.15 : 0.06))
                            .frame(width: 68, height: 68)
                        Circle().trim(from: 0, to: holding ? 1 : 0)
                            .stroke(Color.accentPrimary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .frame(width: 68, height: 68).rotationEffect(.degrees(-90))
                            .animation(holding ? .linear(duration: 0.65) : Anim.easeOut(0.15), value: holding)
                        Image(systemName: "hand.point.up.left")
                            .font(.title).foregroundStyle(Color.accentPrimary)
                            .scaleEffect(reduceMotion || !holding ? 1 : 0.94)
                    }
                    Text(copy("빈 곳을 길게 눌러보세요"))
                        .font(.subheadline).foregroundStyle(Color.textSecondary)
                }
                .frame(maxWidth: .infinity).frame(minHeight: 124)
                .contentShape(Rectangle())
                .onLongPressGesture(minimumDuration: 0.65, maximumDistance: 24,
                                    perform: onAdvance, onPressingChanged: { holding = $0 })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(copy("빈 곳을 길게 누르기 연습"))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { onAdvance() }
                .accessibilityIdentifier("widgetPracticeHold")
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "arrow.up.left").font(.largeTitle)
                        .foregroundStyle(Color.accentPrimary)
                    Text(copy("편집 → 위젯 추가"))
                        .font(.subheadline).foregroundStyle(Color.textSecondary)
                }
                .frame(maxWidth: .infinity).frame(minHeight: 124)
                .accessibilityHidden(true)
            }
        }
    }

    private var gallery: some View {
        VStack(spacing: 18) {
            HStack {
                Image(systemName: added ? "checkmark" : "magnifyingglass")
                Text(added ? copy("연습 완료") : "UpNext")
                Spacer()
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(added ? Color.accentPrimary : Color.textPrimary)
            .padding(12)
            .background(Color.bgHover, in: RoundedRectangle(cornerRadius: 12))

            RetentionWidgetPreview()
                .frame(maxWidth: wide ? .infinity : 170)
                .matchedGeometryEffect(id: "widget", in: placement)
                .scaleEffect(reduceMotion || !added ? 1 : 0.96)
                .shadow(color: Color.accentPrimary.opacity(added ? 0.12 : 0), radius: 20)
                .frame(maxWidth: .infinity, minHeight: 150)

            if !added {
                Picker(copy("위젯 크기"), selection: $wide) {
                    Text(copy("작게")).tag(false)
                    Text(copy("넓게")).tag(true)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("widgetPracticeSize")
                .onChange(of: wide) { _ in Haptics.play(.selection) }
                Button {
                    Haptics.play(.success)
                    withAnimation(motion) { added = true }
                } label: {
                    Label(copy("위젯 추가 연습"), systemImage: "plus")
                }
                .buttonStyle(.un(.primary))
                .accessibilityIdentifier("widgetPracticePlace")
            } else {
                Text(copy("이제 같은 방법으로 실제 홈 화면에 추가해봐요."))
                    .font(.subheadline).foregroundStyle(Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("widgetPracticeFinished")
            }
        }
        .animation(reduceMotion ? nil : Anim.easeOut(0.25), value: wide)
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
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("UpNext").font(.caption.weight(.bold))
                Spacer(minLength: 8)
                Image(systemName: "flame.fill").foregroundStyle(Color.accentPrimary)
            }
            Text(taskTitle)
                .font(.headline).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 5) {
                ForEach(0..<min(completion.total, 5), id: \.self) { index in
                    Capsule().fill(index < completion.done ? Color.accentPrimary : Color.bgHover)
                        .frame(width: 18, height: 5)
                }
                Text("\(completion.done)/\(completion.total)").font(.caption).monospacedDigit()
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(Color.accentPrimary)
            }
            .accessibilityHidden(true)
        }
        .padding(20)
        .foregroundStyle(Color.textPrimary)
        .background(Color.bgPrimary, in: RoundedRectangle(cornerRadius: 22))
    }
}
