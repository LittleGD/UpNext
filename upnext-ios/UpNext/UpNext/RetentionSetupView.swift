import SwiftUI
import UserNotifications

struct RetentionSetupView: View {
    let kind: RetentionSetupKind
    @ObservedObject var setup: RetentionSetup
    @EnvironmentObject private var store: GameStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AccessibilityFocusState private var headingFocused: Bool
    @State private var time = Date()
    @State private var notificationDenied = false
    @State private var busy = false
    @State private var succeeded = false
    @State private var error: String?
    @State private var widgetStep = 0
    @State private var previewArrived = false

    private func copy(_ key: String.LocalizationValue) -> String { RetentionSetupCopy.text(key) }
    private var transitionAnimation: Animation { reduceMotion ? .easeOut(duration: 0.18) : Anim.easeOut(0.25) }
    private var stageID: String { "\(widgetStep)-\(notificationDenied)-\(succeeded)" }

    var body: some View {
        OverlayContainer(onBackdropTap: dismiss, blur: false) {
            ViewThatFits(in: .vertical) {
                card.fixedSize(horizontal: false, vertical: true)
                ScrollView { card }
            }
            .frame(maxWidth: 380)
            .padding(16)
        }
        .accessibilityAddTraits(.isModal)
        .environment(\.colorScheme, .dark)
        .task {
            time = Self.date(for: setup.reminderTime ?? store.progress?.notificationTime ?? "09:00")
            widgetStep = min(3, max(0, setup.widgetStep))
            if kind == .notifications {
                notificationDenied = await NotificationManager.authorizationStatus() == .denied
                await resumeReminderFromSettings()
            } else if widgetStep == 3 {
                await checkWidget(showMissing: false)
            }
            withAnimation(transitionAnimation) { previewArrived = true }
            headingFocused = true
        }
        .onChange(of: stageID) { _ in headingFocused = true }
        .onChange(of: time) { value in
            if kind == .notifications { setup.reminderTime = Self.timeString(value) }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, !busy, !succeeded else { return }
            Task {
                if kind == .widget && widgetStep == 3 {
                    await checkWidget(showMissing: true)
                } else if kind == .notifications {
                    await resumeReminderFromSettings()
                }
            }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                PixelIcon(succeeded ? .check : kind == .notifications ? .clock : .grid3x3,
                          size: 20, color: .accentPrimary)
                    .accessibilityHidden(true)
                Text(title)
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($headingFocused)
                    .accessibilityIdentifier("retentionSetupTitle")
                Spacer(minLength: 0)
                if kind == .widget && !succeeded && widgetStep < 3 {
                    Text("\(widgetStep + 1)/3").typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            if let subtitle {
                Text(subtitle).typography(.caption).foregroundStyle(Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if kind == .notifications {
                notificationPreview
                if !succeeded { timeControls }
            } else {
                widgetContent
            }
            if let error {
                Text(error).typography(.caption).foregroundStyle(Color.accentSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("retentionSetupError")
            }
            footer
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
    }

    private var title: String {
        if succeeded { return copy(kind == .notifications ? "알림 설정 완료" : "위젯 추가 완료") }
        if kind == .notifications { return copy(notificationDenied ? "알림이 꺼져 있어요" : "내일도 이어갈까요?") }
        switch widgetStep {
        case 0: return copy("홈 화면에서 바로 보기")
        case 1: return copy("위젯 메뉴 열기")
        case 2: return copy("크기 고르기")
        default: return copy("홈 화면에 추가하기")
        }
    }

    private var subtitle: String? {
        if succeeded { return nil }
        if kind == .notifications {
            return notificationDenied ? copy("설정에서 알림을 켜주세요.") : nil
        }
        switch widgetStep {
        case 0: return copy("빈 곳을 길게 눌러보세요.")
        case 1: return nil
        case 2: return nil
        default: return copy("홈 화면으로 나가 따라 해보세요.")
        }
    }

    private var notificationPreview: some View {
        HStack(alignment: .top, spacing: 12) {
            PixelIcon(.flame, size: 24, color: .accentPrimary).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("UpNext").typography(.micro)
                    Spacer()
                    Text(time, style: .time).typography(.caption).monospacedDigit()
                        .contentTransition(reduceMotion ? .opacity : .numericText())
                        .accessibilityIdentifier("reminderPreviewTime")
                }.foregroundStyle(Color.textSecondary)
                Text(AppConfig.loc("오늘의 챌린지")).typography(.body).foregroundStyle(Color.textPrimary)
            }
        }
        .padding(14)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        .offset(y: reduceMotion || previewArrived ? 0 : 8)
        .opacity(previewArrived ? 1 : 0)
    }

    private var timeControls: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                timePreset("아침", time: "09:00")
                timePreset("점심", time: "12:30")
                timePreset("저녁", time: "20:00")
            }
            HStack {
                Text(copy("직접 고르기")).typography(.caption)
                Spacer()
                DatePicker(copy("알림 시간"), selection: $time, displayedComponents: .hourAndMinute)
                    .labelsHidden().tint(Color.accentPrimary)
                    .accessibilityIdentifier("reminderTimePicker")
            }
            .foregroundStyle(Color.textSecondary)
        }
        .disabled(busy)
    }

    private func timePreset(_ label: String.LocalizationValue, time value: String) -> some View {
        let selected = Self.timeString(time) == value
        return Button {
            withAnimation(transitionAnimation) { time = Self.date(for: value) }
            Haptics.play(.selection)
        } label: {
            Text(copy(label)).typography(.caption)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(selected ? Color.accentPrimary : Color.bgElevated, in: Capsule())
                .foregroundStyle(selected ? Color.bgPrimary : Color.textSecondary)
        }
        .buttonStyle(.unPress)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier("reminderPreset-\(value)")
    }

    @ViewBuilder private var widgetContent: some View {
        if succeeded {
            RetentionWidgetPreview()
                .accessibilityIdentifier("widgetInstalledConfirmation")
        } else if widgetStep < 3 {
            WidgetSetupPractice(step: widgetStep, onAdvance: advanceWidget)
                .id(widgetStep)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 6)))
        } else {
            VStack(alignment: .leading, spacing: 14) {
                instruction(1, "빈 곳 길게 누르기")
                if #available(iOS 18, *) { instruction(2, "편집 → 위젯 추가") }
                else { instruction(2, "+ → 위젯 추가") }
                instruction(3, "UpNext → 위젯 추가")
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func instruction(_ number: Int, _ text: String.LocalizationValue) -> some View {
        HStack(spacing: 12) {
            Text("\(number)").typography(.caption).foregroundStyle(Color.accentPrimary)
            Text(copy(text)).typography(.body).foregroundStyle(Color.textPrimary)
        }
    }

    private var footer: some View {
        VStack(spacing: 4) {
            if busy {
                ProgressView().tint(Color.accentPrimary).frame(maxWidth: .infinity, minHeight: 52)
                    .accessibilityLabel(copy("확인 중"))
            } else if succeeded {
                Button(copy("완료"), action: dismiss)
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("retentionSetupDone")
            } else if kind == .notifications {
                Button(copy(notificationDenied ? "설정 열기" : "알림 켜기")) {
                    if notificationDenied {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        setup.waitingForNotificationSettings = true
                        Task {
                            if await !UIApplication.shared.open(url) {
                                setup.waitingForNotificationSettings = false
                                error = copy("설정을 열지 못했어요. 다시 시도해주세요.")
                            }
                        }
                    } else { Task { await enableReminder() } }
                }
                .buttonStyle(.un(.primary)).accessibilityIdentifier("enableReminderButton")
            } else if widgetStep == 3 {
                Button(copy("추가 확인")) { Task { await checkWidget(showMissing: true) } }
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("checkWidgetButton")
            } else {
                Button(copy(widgetStep == 2 ? "홈 화면에 추가하기" : "다음"), action: advanceWidget)
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("widgetTutorialNext")
            }
            if !succeeded {
                HStack(spacing: 8) {
                    if kind == .widget && widgetStep == 3 {
                        Button(copy("다시 보기")) {
                            withAnimation(transitionAnimation) { widgetStep = 0; setup.widgetStep = 0; error = nil }
                        }.buttonStyle(.un(.ghost)).accessibilityIdentifier("replayWidgetTutorial")
                    }
                    Button(copy("나중에"), action: dismiss)
                        .buttonStyle(.un(.ghost)).accessibilityIdentifier("retentionSetupLater")
                }.disabled(busy)
            }
        }
    }

    private func dismiss() {
        guard !busy else { return }
        withAnimation(Anim.cardOverlayExit) { setup.dismiss() }
    }

    private func advanceWidget() {
        guard widgetStep < 3 else { return }
        Haptics.play(.selection)
        withAnimation(transitionAnimation) {
            widgetStep += 1
            setup.widgetStep = widgetStep
            error = nil
        }
    }

    private func resumeReminderFromSettings() async {
        guard setup.waitingForNotificationSettings else { return }
        setup.waitingForNotificationSettings = false
        let status = await NotificationManager.authorizationStatus()
        notificationDenied = status == .denied
        if status == .authorized || status == .provisional || status == .ephemeral {
            await enableReminder()
        }
    }

    private func enableReminder() async {
        guard !busy else { return }
        busy = true
        error = nil
        let result = await store.configureDailyReminder(time: Self.timeString(time))
        busy = false
        withAnimation(transitionAnimation) {
            switch result {
            case .enabled: succeeded = true; Haptics.play(.success)
            case .denied: notificationDenied = true
            case .failed: error = copy("설정을 저장하지 못했어요. 다시 시도해주세요.")
            }
        }
    }

    private func checkWidget(showMissing: Bool) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let installed = try await RetentionSetup.homeWidgetInstalled()
            withAnimation(transitionAnimation) {
                succeeded = installed
                error = installed || !showMissing ? nil : copy("홈 화면에 위젯을 추가해주세요.")
            }
            if installed { Haptics.play(.success) }
        } catch {
            self.error = copy("확인하지 못했어요. 다시 시도해주세요.")
        }
    }

    private static func date(for time: String) -> Date {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(bySettingHour: parts.first ?? 9,
                                     minute: parts.count == 2 ? parts[1] : 0,
                                     second: 0, of: Date()) ?? Date()
    }

    private static func timeString(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 9, components.minute ?? 0)
    }
}
