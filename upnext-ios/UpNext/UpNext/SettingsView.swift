//
//  SettingsView.swift
//  UpNext — 설정 화면 (Phase 4 슬라이스 2).
//
//  웹 src/app/settings/page.tsx 의 일반 설정·챌린지 모드·통계 부분을 SwiftUI 로 포팅.
//  칭호 / 계정 연동 / 데이터 초기화 섹션은 데이터·화면 의존성이 있어 이후 슬라이스로 분리.
//
//  GameStore 를 환경 객체로 받아 progress 를 읽고, 설정 액션으로 변경 → 클라우드 동기화.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: GameStore
    @State private var modeToConfirm: GameMode?
    @State private var showPrivacy = false
    @State private var showResetConfirm = false
    @State private var showSignOutConfirm = false
    @State private var showDeleteAccountConfirm = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: String?

    var body: some View {
        ScrollView {
            if let progress = store.progress {
                content(progress)
            } else {
                placeholder
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // 앰비언트 노출(요인1) — 화면 루트 투명화. MainShell 바닥의 오로라·별이 관통(웹 main z-[1] 패리티).
        // 설정 항목은 bgSurface 카드 위라 대비/가독성 유지.
        .sheet(isPresented: $showPrivacy) { PrivacyView() }
        // 05-modal-design — 시스템 .alert/.confirmationDialog → GbConfirm(GB 팔레트).
        // 풀스크린 백드롭이 필요해 개별 섹션이 아닌 body 루트(전체 프레임)에 부착.
        // ⚠️ 계정 삭제 재인증(Apple/Google) 시트는 store.deleteAccount() 내부의 시스템
        //    시트로 그대로 유지(교체 금지 — 시스템 권한류).
        .overlay { confirmDialogs }
    }

    // MARK: - GbConfirm 다이얼로그 (노출 빈도 순)

    @ViewBuilder
    private var confirmDialogs: some View {
        // 모드 변경 — 비파괴적(info).
        if let mode = modeToConfirm {
            GbConfirm(
                title: "모드 변경",
                message: "\(modeLabel(mode)) 모드는 내일부터 적용됩니다.",
                confirmLabel: "변경",
                onConfirm: { store.setMode(mode); modeToConfirm = nil },
                onCancel: { modeToConfirm = nil })
            .transition(.opacity)
        }
        // 로그아웃 — danger.
        if showSignOutConfirm {
            GbConfirm(
                title: "로그아웃 하시겠어요?",
                confirmLabel: "로그아웃",
                danger: true,
                onConfirm: { store.auth.signOut(); showSignOutConfirm = false },
                onCancel: { showSignOutConfirm = false })
            .transition(.opacity)
        }
        // 계정 삭제 확인 — danger. 확인 시 재인증 시스템 시트가 이어짐(범위 밖).
        if showDeleteAccountConfirm {
            GbConfirm(
                title: "계정을 삭제하시겠어요?",
                message: "계정과 모든 데이터가 영구 삭제됩니다. 같은 계정으로 다시 로그인해도 복구되지 않습니다.",
                confirmLabel: "계정 삭제 (되돌릴 수 없음)",
                danger: true,
                onConfirm: { showDeleteAccountConfirm = false; performAccountDeletion() },
                onCancel: { showDeleteAccountConfirm = false })
            .transition(.opacity)
        }
        // 계정 삭제 실패 에러 — 단일 확인 버튼(info, 웹엔 없는 iOS 자유 설계).
        if let err = deleteAccountError {
            GbConfirm(
                title: "계정 삭제",
                message: "\(err)",
                confirmLabel: "확인",
                showCancel: false,
                onConfirm: { deleteAccountError = nil },
                onCancel: { deleteAccountError = nil })
            .transition(.opacity)
        }
        // 모든 데이터 리셋 — danger(웹 app/settings/page.tsx:440 GbConfirm 대응).
        if showResetConfirm {
            GbConfirm(
                title: "모든 데이터 리셋",
                message: "로컬·클라우드 데이터를 전부 초기화합니다. 카드·진행도·로그·부적·장비가 모두 사라집니다.",
                confirmLabel: "리셋 (되돌릴 수 없음)",
                danger: true,
                onConfirm: { showResetConfirm = false; performReset() },
                onCancel: { showResetConfirm = false })
            .transition(.opacity)
        }
    }

    // progress 가 아직 없을 때의 방어용 표시. 실제로는 .ready 단계에서만 이 화면이
    // 렌더되어 progress 가 항상 존재하므로 도달하지 않는 분기다.
    private var placeholder: some View {
        ProgressView()
            .tint(Color.accentPrimary)
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
    }

    private func content(_ progress: UserProgress) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("설정")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)

            generalSection(progress)
            modeSection(progress)
            titleSection(progress)
            accountSection()
            statsSection(progress)
            dataResetSection()
            infoSection()

            creditSection()
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 100)  // 하단 플로팅 네비에 가리지 않도록 여유
    }

    // MARK: - 일반

    private func generalSection(_ p: UserProgress) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("일반")
            VStack(spacing: 0) {
                settingRow("언어") {
                    Picker("", selection: Binding(
                        get: { p.language },
                        set: { store.setLanguage($0) })
                    ) {
                        ForEach(Language.allCases, id: \.self) { lang in
                            Text(langLabel(lang)).tag(lang)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Color.accentPrimary)
                }
                divider
                toggleRow("사운드 효과", isOn: Binding(
                    get: { p.soundEnabled }, set: { _ in store.toggleSound() }))
                divider
                toggleRow("햅틱 (진동)", isOn: Binding(
                    get: { p.hapticEnabled }, set: { _ in store.toggleHaptic() }))
                divider
                toggleRow("알림", isOn: Binding(
                    get: { p.notificationsEnabled },
                    set: { store.setNotificationsEnabled($0) }))
                if p.notificationsEnabled {
                    divider
                    settingRow("알림 시간") {
                        DatePicker("", selection: Binding(
                            get: { Self.timeToDate(p.notificationTime) },
                            set: { store.setNotificationTime(Self.dateToTime($0)) }),
                            displayedComponents: .hourAndMinute)
                        .labelsHidden()
                    }
                }
            }
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - 챌린지 모드

    private func modeSection(_ p: UserProgress) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("챌린지 모드")
            VStack(spacing: 0) {
                ForEach(Array(GameMode.allCases.enumerated()), id: \.element) { idx, mode in
                    modeRow(mode, progress: p)
                    if idx < GameMode.allCases.count - 1 { divider }
                }
            }
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        // 모드 변경 확인은 body 루트의 confirmDialogs(GbConfirm)로 이동.
    }

    private func modeRow(_ mode: GameMode, progress p: UserProgress) -> some View {
        let isActive = p.mode == mode
        let isPending = p.pendingMode == mode
        return Button {
            if isPending {
                store.cancelPendingMode()
            } else if !isActive {
                modeToConfirm = mode
            }
        } label: {
            HStack(spacing: 12) {
                // R3 마감 — 모드 라디오: 선택=.check, 변경예정=.clock, 비선택=.circle.
                PixelIcon(isActive ? .check : isPending ? .clock : .circle, size: 20,
                          color: isActive || isPending ? Color.accentPrimary : Color.textTertiary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(modeLabel(mode))
                        .typography(.body)
                        .foregroundStyle(isActive ? Color.accentPrimary : Color.textPrimary)
                    Text(modeDesc(mode))
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                }
                Spacer()
                if isPending {
                    Text("내일 적용")
                        .typography(.micro)
                        .foregroundStyle(Color.accentPrimary)
                }
                Text("\(mode.cardCount)장")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 내 기록

    private func statsSection(_ p: UserProgress) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("내 기록")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                statCard(AppConfig.loc("현재 스트릭"), AppConfig.loc("\(p.currentStreak)일"))
                statCard(AppConfig.loc("최장 스트릭"), AppConfig.loc("\(p.longestStreak)일"))
                statCard(AppConfig.loc("총 XP"), "\(p.xp) XP")
                statCard(AppConfig.loc("해금 카드"), AppConfig.loc("\(p.unlockedCardIds.count)장"))
            }
        }
    }

    private func statCard(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text(label)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - 칭호

    private func titleSection(_ p: UserProgress) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("칭호")
            VStack(spacing: 0) {
                settingRow("현재 칭호") {
                    Text(GameRules.titleForLevel(p.level, lang: p.language))
                        .typography(.body)
                        .foregroundStyle(Color.accentPrimary)
                }
                divider
                VStack(alignment: .leading, spacing: 8) {
                    Text("Lv 별 칭호")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                    titleProgressList(progress: p)
                }
                .padding(16)
            }
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func titleProgressList(progress: UserProgress) -> some View {
        let breakpoints: [(Int, String)] = [
            (0, AppConfig.loc("입문자")), (1, AppConfig.loc("뉴비")), (2, AppConfig.loc("도전자")), (4, AppConfig.loc("실천가")),
            (6, AppConfig.loc("갓생러")), (9, AppConfig.loc("마스터")), (13, AppConfig.loc("레전드"))
        ]
        return VStack(alignment: .leading, spacing: 4) {
            ForEach(0..<breakpoints.count, id: \.self) { i in
                let bp = breakpoints[i]
                let unlocked = progress.level >= bp.0
                HStack(spacing: 8) {
                    PixelIcon(unlocked ? .check : .lock,
                              size: 11, color: unlocked ? Color.accentPrimary : Color.textTertiary)
                    Text("Lv. \(bp.0)+: \(bp.1)")
                        .typography(.caption)
                        .foregroundStyle(unlocked ? Color.textPrimary : Color.textTertiary)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    // MARK: - 계정 연결 / 로그아웃

    private func accountSection() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("계정")
            VStack(spacing: 0) {
                let uid = store.auth.uid
                let isAnon = store.isAnonymous
                settingRow("로그인 상태") {
                    Text(uid == nil ? AppConfig.loc("비로그인") :
                         isAnon ? AppConfig.loc("익명") : AppConfig.loc("연동됨"))
                        .typography(.caption)
                        .foregroundStyle(uid == nil || isAnon ? Color.textSecondary : Color.accentPrimary)
                }
                if isAnon || uid == nil {
                    divider
                    HStack(spacing: 8) {
                        Button {
                            Task { await store.auth.signInWithApple() }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "apple.logo")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("Apple")
                                    .typography(.caption)
                            }
                                .foregroundStyle(Color.textPrimary)
                                .frame(maxWidth: .infinity).frame(height: 40)
                                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        Button {
                            Task { await store.auth.signInWithGoogle() }
                        } label: {
                            Text("Google")
                                .typography(.caption)
                                .foregroundStyle(Color.textPrimary)
                                .frame(maxWidth: .infinity).frame(height: 40)
                                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(16)
                } else {
                    divider
                    Button {
                        showSignOutConfirm = true
                    } label: {
                        HStack {
                            Text("로그아웃")
                                .typography(.body)
                                .foregroundStyle(Color.colorError)
                            Spacer()
                            PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    divider
                    // App Store Guideline 5.1.1(v) — 계정 생성 앱은 앱 내 계정 삭제 경로 필수.
                    Button {
                        showDeleteAccountConfirm = true
                    } label: {
                        HStack {
                            Text("계정 삭제")
                                .typography(.body)
                                .foregroundStyle(Color.colorError)
                            Spacer()
                            if isDeletingAccount {
                                ProgressView().tint(Color.colorError)
                            } else {
                                PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .disabled(isDeletingAccount)
                }
            }
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        // 로그아웃·계정 삭제 확인·삭제 실패 에러는 body 루트의 confirmDialogs(GbConfirm)로 이동.
        // (계정 삭제 확인 이후의 재인증 시스템 시트는 store.deleteAccount() 내부에서 그대로 뜸.)
    }

    /// 계정 영구 삭제 실행 — 재인증 시트가 떠 사용자 확인 후 Auth/클라우드/로컬 전부 제거.
    /// 성공 시 GameStore.resetAllData 가 phase=.onboarding 으로 전환해 이 화면이 사라진다.
    /// 실패/취소 시 auth.lastError 메시지를 alert 로 노출.
    private func performAccountDeletion() {
        isDeletingAccount = true
        Task {
            let ok = await store.deleteAccount()
            isDeletingAccount = false
            if !ok {
                deleteAccountError = store.auth.lastError
                    ?? AppConfig.loc("계정 삭제에 실패했어요. 잠시 후 다시 시도해주세요")
            }
        }
    }

    // MARK: - 데이터 리셋

    private func dataResetSection() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("데이터")
            Button {
                showResetConfirm = true
            } label: {
                HStack {
                    Text("모든 데이터 리셋")
                        .typography(.body)
                        .foregroundStyle(Color.colorError)
                    Spacer()
                    PixelIcon(.trash, size: 14, color: Color.colorError)
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        // 데이터 리셋 확인은 body 루트의 confirmDialogs(GbConfirm)로 이동.
    }

    /// 모든 데이터 리셋 — 로그인 사용자는 Firestore 클라우드 문서도 삭제 후 로컬 초기화.
    /// 클라우드 삭제 누락 시 재로그인으로 진행도가 그대로 복구돼 "리셋" 약속이 깨진다.
    /// 비로그인은 클라우드가 없으니 로컬만.
    private func performReset() {
        let uid = store.auth.uid
        if let uid {
            Task {
                await store.sync.deleteCloudData(uid: uid)
                store.resetAllData()
            }
        } else {
            store.resetAllData()
        }
    }

    // MARK: - 정보

    private func infoSection() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("정보")
            Button {
                showPrivacy = true
            } label: {
                HStack {
                    Text("개인정보 처리방침")
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - 제작자 크레딧 + 버전

    /// 설정 맨 아래 제작자 크레딧과 앱 버전. 버전 표기와 같은 톤(micro/tertiary)으로
    /// 조용하게, 링크만 textSecondary 로 한 단계 밝혀 탭 가능함을 암시.
    /// 영문 고정 문구 — Text(verbatim:) 으로 로컬라이즈 카탈로그 비대상.
    private func creditSection() -> some View {
        VStack(spacing: 6) {
            Text(verbatim: "Designed & built by Jongmin Lee")
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
            HStack(spacing: 8) {
                Link(destination: URL(string: "https://www.linkedin.com/in/jongmin-lee-design/")!) {
                    Text(verbatim: "LinkedIn")
                        .foregroundStyle(Color.textSecondary)
                }
                Text(verbatim: "·")
                    .foregroundStyle(Color.textTertiary)
                    .opacity(0.6)
                Link(destination: URL(string: "https://www.jongmin.design")!) {
                    Text(verbatim: "Portfolio")
                        .foregroundStyle(Color.textSecondary)
                }
            }
            .typography(.micro)
            Text(verbatim: "UpNext v0.1.0")
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
                .opacity(0.6)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - 공통 행 / 헬퍼

    private func sectionHeader(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .padding(.leading, 4)
    }

    private func settingRow<Control: View>(
        _ label: LocalizedStringKey,
        @ViewBuilder control: () -> Control
    ) -> some View {
        HStack {
            Text(label)
                .typography(.body)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            control()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func toggleRow(_ label: LocalizedStringKey, isOn: Binding<Bool>) -> some View {
        settingRow(label) {
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color.accentPrimary)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 1)
    }

    private func langLabel(_ l: Language) -> String {
        switch l {
        case .ko: return "한국어"
        case .en: return "English"
        case .ja: return "日本語"
        case .zh: return "中文"
        }
    }

    /// 모드 라벨 — Text 와 "%@ 모드는…" 보간 양쪽에서 쓰이므로 인앱 언어로 해석된
    /// String 을 반환(일반/갓생/초갓생은 카탈로그 키). LocalizedStringKey 로는 보간 arg 가
    /// 한국어로 남기 때문에 AppConfig.loc 로 미리 해석.
    private func modeLabel(_ m: GameMode) -> String {
        switch m {
        case .normal:  return AppConfig.loc("일반")
        case .godlife: return AppConfig.loc("갓생")
        case .ultra:   return AppConfig.loc("초갓생")
        }
    }

    private func modeDesc(_ m: GameMode) -> LocalizedStringKey {
        switch m {
        case .normal:  return "하루에 카드 1장: 가볍게"
        case .godlife: return "하루에 카드 2장: 갓생 모드"
        case .ultra:   return "하루에 카드 3장: 초갓생 모드"
        }
    }

    /// "HH:MM" → Date (시·분만). 알림 시간 DatePicker 바인딩용.
    private static func timeToDate(_ hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":")
        var c = DateComponents()
        c.hour = parts.count > 0 ? Int(parts[0]) ?? 9 : 9
        c.minute = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
        return Calendar.current.date(from: c) ?? Date()
    }

    /// Date → "HH:MM".
    private static func dateToTime(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 9, c.minute ?? 0)
    }
}
