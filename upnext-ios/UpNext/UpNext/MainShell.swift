//
//  MainShell.swift
//  UpNext — 메인 앱 셸 (Phase 4 슬라이스 6 · Phase 4.2 시작).
//
//  로그인·부트스트랩 완료(.ready) 후의 앱 구조:
//   AppHeader(상단 Lv·XP) + 탭별 화면 + BottomNav(하단 플로팅 네비).
//
//  웹 components/layout/BottomNav.tsx · Header.tsx 포팅. 탭 4종 —
//  챌린지/컬렉션/플레이그라운드/설정. 설정만 실제 화면이고 나머지는
//  Phase 4.2~4.4 다음 슬라이스에서 채워질 placeholder.
//

import SwiftUI

// MARK: - 탭 정의

enum MainTab: CaseIterable {
    case challenge, collection, playground, settings

    var label: String {
        switch self {
        case .challenge:  return "챌린지"
        case .collection: return "컬렉션"
        case .playground: return "플레이"
        case .settings:   return "설정"
        }
    }

    var icon: String {
        switch self {
        case .challenge:  return "checklist"
        case .collection: return "rectangle.stack"
        case .playground: return "gamecontroller"
        case .settings:   return "gearshape"
        }
    }
}

// MARK: - 메인 셸

struct MainTabView: View {
    @EnvironmentObject private var store: GameStore
    @State private var tab: MainTab = .challenge
    @State private var showPackOpener = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.bgPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                AppHeader(showXP: tab == .challenge)
                screen
            }

            BottomNav(selected: $tab)
        }
        .onAppear { syncPackOpener() }
        .onChange(of: pendingPackCount) { _ in syncPackOpener() }
        .fullScreenCover(isPresented: $showPackOpener) {
            CardPackOpenerView { showPackOpener = false }
        }
    }

    /// 미개봉 카드팩 수 (레벨업 팩 + 보너스 카드).
    private var pendingPackCount: Int {
        (store.progress?.pendingPacks ?? 0) + (store.progress?.pendingBonusCards ?? 0)
    }

    /// 열 팩이 있으면 개봉 화면을 띄운다. 개봉 중 pendingPacks 가 0 이 돼도
    /// showPackOpener 는 별도 상태라 마지막 reveal 까지 보이고 "완료" 로 닫힌다.
    private func syncPackOpener() {
        if pendingPackCount > 0 { showPackOpener = true }
    }

    @ViewBuilder private var screen: some View {
        switch tab {
        case .challenge:
            DailyHomeView()
        case .collection:
            CollectionView()
        case .playground:
            ComingSoonView(title: "플레이그라운드",
                           subtitle: "Up Hero — Phase 4.4")
        case .settings:
            SettingsView()
        }
    }
}

// MARK: - 상단 헤더 (Lv · XP)

struct AppHeader: View {
    @EnvironmentObject private var store: GameStore
    /// 챌린지 탭에서만 XP 바를 노출 (웹 Header 의 full/compact 분기 대응).
    let showXP: Bool

    var body: some View {
        let level = store.progress?.level ?? 0
        let xp = store.progress?.xp ?? 0
        VStack(spacing: 6) {
            HStack {
                Text("Lv.\(level)")
                    .typography(.heading)
                    .foregroundStyle(Color.accentPrimary)
                Spacer()
                if showXP {
                    Text("\(xpCurrent(level, xp)) / \(xpNeeded(level)) XP")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            if showXP {
                xpBar(level: level, xp: xp)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color.bgPrimary)
    }

    /// 현재 레벨 구간에서 쌓인 XP. 웹 getXPProgress 의 current (음수 클램프).
    private func xpCurrent(_ level: Int, _ xp: Int) -> Int {
        max(0, xp - GameRules.totalXPForLevel(level))
    }

    /// 다음 레벨까지 필요한 XP.
    private func xpNeeded(_ level: Int) -> Int {
        GameRules.totalXPForLevel(level + 1) - GameRules.totalXPForLevel(level)
    }

    private func xpBar(level: Int, xp: Int) -> some View {
        let needed = xpNeeded(level)
        let fraction = needed > 0
            ? min(Double(xpCurrent(level, xp)) / Double(needed), 1)
            : 0
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.bgElevated)
                Capsule().fill(Color.accentPrimary)
                    .frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 5)
    }
}

// MARK: - 하단 플로팅 네비

struct BottomNav: View {
    @Binding var selected: MainTab

    var body: some View {
        HStack(spacing: 4) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                Button {
                    selected = tab
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 18))
                        if selected == tab {
                            Text(tab.label).typography(.caption)
                        }
                    }
                    .foregroundStyle(selected == tab ? Color.bgPrimary : Color.textTertiary)
                    .padding(.horizontal, 16)
                    .frame(minWidth: 44, minHeight: 44)
                    .background(selected == tab ? Color.accentPrimary : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
            }
        }
        .padding(6)
        .background(Color.bgElevated, in: Capsule())
        .padding(.bottom, 8)
    }
}

// MARK: - 미구현 화면 placeholder

struct ComingSoonView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text(subtitle)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }
}
