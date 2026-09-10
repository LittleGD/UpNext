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
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Label(copy(kind == .notifications ? "내일도 이어가요" : "눈에 보이면 더 쉬워요"),
                          systemImage: kind == .notifications ? "bell" : "rectangle.grid.2x2")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.accentPrimary)
                    Spacer()
                    Button { setup.dismiss() } label: {
                        Image(systemName: "xmark").font(.body.weight(.medium))
                            .frame(width: 44, height: 44)
                    }
                    .foregroundStyle(Color.textSecondary)
                    .accessibilityLabel(copy("닫기"))
                    .accessibilityIdentifier("retentionSetupClose")
                    .disabled(busy)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text(title)
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                        .foregroundStyle(Color.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused($headingFocused)
                        .accessibilityIdentifier("retentionSetupTitle")
                    Text(subtitle)
                        .font(.body)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .id(stageID)
                .transition(.opacity)

                if kind == .notifications {
                    notificationPreview
                    if !succeeded { timeControls }
                } else {
                    widgetContent
                }

                if let error {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(Color.accentPrimary)
                        .accessibilityIdentifier("retentionSetupError")
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 24)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .background(Color.bgSurface)
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled(busy)
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

    private var title: String {
        if succeeded { return copy(kind == .notifications ? "내일 만날 시간, 정했어요" : "홈 화면에 자리 잡았어요") }
        if kind == .notifications {
            if notificationDenied { return copy("알림을 다시 켜볼까요?") }
            return copy(setup.manualRequest == kind ? "나에게 맞는\n알림 시간을 정해요" : "첫 실천 완료!\n내일은 언제 만날까요?")
        }
        switch widgetStep {
        case 0: return copy(setup.manualRequest == kind ? "오늘의 챌린지를\n홈 화면에서 만나요" : "두 번째 실천도 완료!\n홈 화면에 꺼내둘까요?")
        case 1: return copy("위젯을 놓을\n자리를 만들어요")
        case 2: return copy("UpNext를 찾아\n위젯을 골라요")
        default: return copy("이제 홈 화면에서\n직접 추가해보세요")
        }
    }

    private var subtitle: String {
        if succeeded {
            return copy(kind == .notifications
                        ? "선택한 시간에 하루 한 번 알려드릴게요. 설정에서 언제든 바꿀 수 있어요."
                        : "오늘의 챌린지를 바로 확인하고, 위젯을 눌러 UpNext로 돌아올 수 있어요.")
        }
        if kind == .notifications {
            return copy(notificationDenied
                        ? "기기 설정에서 ‘알림’을 열고 ‘알림 허용’을 켠 뒤 돌아오세요. 선택한 시간으로 마무리할게요."
                        : "실천하기 편한 시간을 골라주세요. 하루 한 번, 오늘의 챌린지를 알려드릴게요.")
        }
        switch widgetStep {
        case 0: return copy("앱을 열지 않아도 오늘 할 일이 보여요. 아래 화면으로 추가하는 방법을 연습해봐요.")
        case 1: return copy("홈 화면을 길게 누른 다음, 왼쪽 위 ‘편집’에서 ‘위젯 추가’를 선택해요.")
        case 2: return copy("위젯 목록에서 UpNext를 검색하고, 원하는 크기를 고른 뒤 ‘위젯 추가’를 눌러요.")
        default: return copy("홈 화면으로 나가 아래 순서대로 추가해주세요. 돌아오면 설치 여부를 확인할게요.")
        }
    }

    private var notificationPreview: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text(copy(succeeded ? "알림 설정 완료" : "알림 미리보기"))
                    .font(.caption.weight(.medium))
                Spacer()
                Image(systemName: succeeded ? "checkmark" : "bell.badge")
                    .foregroundStyle(Color.accentPrimary)
            }
            Text(time, style: .time)
                .font(.system(size: 48, weight: .light, design: .rounded))
                .monospacedDigit()
                .contentTransition(reduceMotion ? .opacity : .numericText())
                .accessibilityIdentifier("reminderPreviewTime")
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "flame.fill")
                    .font(.title2).foregroundStyle(Color.accentPrimary)
                VStack(alignment: .leading, spacing: 5) {
                    Text("UpNext").font(.caption.weight(.semibold))
                    Text(AppConfig.loc("오늘의 챌린지")).font(.subheadline.weight(.semibold))
                    Text(AppConfig.loc("오늘의 카드를 뽑고 갓생을 이어가세요."))
                        .font(.subheadline).foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .offset(y: reduceMotion || previewArrived ? 0 : 12)
            .opacity(previewArrived ? 1 : 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 24))
        .foregroundStyle(Color.textPrimary)
    }

    private var timeControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                timePreset("아침", time: "09:00")
                timePreset("점심", time: "12:30")
                timePreset("저녁", time: "20:00")
            }
            HStack {
                Text(copy("직접 고르기")).font(.subheadline)
                Spacer()
                DatePicker(copy("알림 시간"), selection: $time, displayedComponents: .hourAndMinute)
                    .labelsHidden().tint(Color.accentPrimary)
                    .accessibilityIdentifier("reminderTimePicker")
            }
            .foregroundStyle(Color.textSecondary)
        }
    }

    private func timePreset(_ label: String.LocalizationValue, time value: String) -> some View {
        let selected = Self.timeString(time) == value
        return Button {
            withAnimation(transitionAnimation) { time = Self.date(for: value) }
            Haptics.play(.selection)
        } label: {
            Text(copy(label)).font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(selected ? Color.accentPrimary : Color.bgElevated, in: Capsule())
                .foregroundStyle(selected ? Color.bgPrimary : Color.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier("reminderPreset-\(value)")
    }

    @ViewBuilder private var widgetContent: some View {
        if succeeded {
            RetentionWidgetPreview()
                .padding(24)
                .background(Color.accentPrimary.opacity(0.08), in: RoundedRectangle(cornerRadius: 24))
            Label(copy("위젯 추가를 확인했어요"), systemImage: "checkmark.circle.fill")
                .foregroundStyle(Color.accentPrimary)
                .accessibilityIdentifier("widgetInstalledConfirmation")
        } else if widgetStep < 3 {
            WidgetSetupPractice(step: widgetStep, onAdvance: advanceWidget)
                .id(widgetStep)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 8)))
            HStack(spacing: 6) {
                ForEach(0..<3) { index in
                    Capsule().fill(index <= widgetStep ? Color.accentPrimary : Color.bgHover)
                        .frame(width: index == widgetStep ? 28 : 8, height: 5)
                }
                Spacer()
                Text(copy("연습 화면 · \(widgetStep + 1)/3"))
                    .font(.caption).foregroundStyle(Color.textSecondary)
            }
        } else {
            VStack(alignment: .leading, spacing: 20) {
                instruction(1, "홈 화면의 빈 곳을 길게 누르기")
                instruction(2, "편집 → 위젯 추가")
                instruction(3, "UpNext 검색 → 위젯 추가 → 완료")
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 24))
            Text(copy("홈 버튼이 있는 기기는 홈 버튼을 누르고, 다른 기기는 화면 아래에서 위로 쓸어올려 홈 화면으로 이동해요."))
                .font(.subheadline).foregroundStyle(Color.textSecondary)
            Text(copy("iOS 17에서는 ‘편집’ 대신 왼쪽 위 + 버튼을 눌러요."))
                .font(.caption).foregroundStyle(Color.textSecondary)
        }
    }

    private func instruction(_ number: Int, _ text: String.LocalizationValue) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Text("\(number)").font(.title3.weight(.semibold)).foregroundStyle(Color.accentPrimary)
            Text(copy(text)).font(.body).foregroundStyle(Color.textPrimary)
        }
    }

    private var footer: some View {
        VStack(spacing: 4) {
            if busy {
                ProgressView().tint(Color.accentPrimary).frame(height: 52)
                    .accessibilityLabel(copy("확인 중"))
            } else if succeeded {
                Button(copy("좋아요")) { setup.dismiss() }
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("retentionSetupDone")
            } else if kind == .notifications {
                Button(copy(notificationDenied ? "기기 알림 설정 열기" : "이 시간에 알림 받기")) {
                    if notificationDenied {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        setup.waitingForNotificationSettings = true
                        Task {
                            if await !UIApplication.shared.open(url) {
                                setup.waitingForNotificationSettings = false
                                error = copy("설정을 열지 못했어요. 기기 설정에서 UpNext의 알림을 켜주세요.")
                            }
                        }
                    } else {
                        Task { await enableReminder() }
                    }
                }
                .buttonStyle(.un(.primary)).accessibilityIdentifier("enableReminderButton")
            } else if widgetStep == 3 {
                Button(copy("추가했어요 · 확인하기")) { Task { await checkWidget(showMissing: true) } }
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("checkWidgetButton")
                Button(copy("방법 다시 보기")) {
                    withAnimation(transitionAnimation) { widgetStep = 0; setup.widgetStep = 0; error = nil }
                }.buttonStyle(.un(.ghost)).accessibilityIdentifier("replayWidgetTutorial")
            } else {
                Button(copy(widgetStep == 2 ? "연습 마치고 직접 추가하기" : "다음 단계")) { advanceWidget() }
                    .buttonStyle(.un(.primary)).accessibilityIdentifier("widgetTutorialNext")
            }
            if !succeeded {
                Button(copy("나중에 할게요")) { setup.dismiss() }
                    .buttonStyle(.un(.ghost)).disabled(busy)
                    .accessibilityIdentifier("retentionSetupLater")
            }
        }
        .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 8)
        .frame(maxWidth: 520).frame(maxWidth: .infinity)
        .background(Color.bgSurface)
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
                error = installed || !showMissing ? nil : copy("아직 위젯이 확인되지 않아요. 홈 화면에서 추가한 뒤 다시 확인해주세요.")
            }
            if installed { Haptics.play(.success) }
        } catch {
            self.error = copy("위젯을 확인하지 못했어요. 잠시 후 다시 확인해주세요.")
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
