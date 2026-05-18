//
//  UpHeroGameView.swift
//  UpNext — Up Hero RPG 루트 화면 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 components/uphero/UpHeroGame.tsx 포팅. 웹은 currentSession.status 로 화면을
//  분기한다 — 세션이 없으면 아지트(Camp), 진행 중이면 던전(전투).
//
//  슬라이스 14 는 진입점만 — 아지트 셸 골격이다. 던전·전투·상점·장비·전직·스킬은
//  이후 슬라이스에서 채운다. 그때 currentSession 분기에 던전 뷰가 들어온다.
//

import SwiftUI

struct UpHeroGameView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    var body: some View {
        // 웹 UpHeroGame 의 currentSession.status 분기 자리.
        // 슬라이스 14 는 세션 진입 경로가 아직 없으므로 항상 아지트.
        // 던전 뷰(전투)는 전투 슬라이스에서 이 분기에 추가된다.
        CampView()
            .onAppear { upHero.initialize() }
    }
}

// MARK: - 아지트 (Camp)

/// Up Hero 의 허브 화면. 웹 CampPlaceholder.
/// 슬라이스 14 는 골격 — 영웅 요약 + 코인 + 메뉴 자리표시.
/// 영웅 스탯 패널·던전 선택·상점·장비 인벤토리는 이후 슬라이스에서 실제 화면으로 교체.
private struct CampView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                heroCard
                menuPlaceholder
            }
            .padding(16)
            .padding(.bottom, 88)  // 하단 플로팅 네비 여유
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: 헤더 — 제목 + 코인

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("아지트")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Text("코인 \(upHero.state.coins)")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
    }

    // MARK: 영웅 요약 카드

    private var heroCard: some View {
        let hero = upHero.state.hero
        return VStack(alignment: .leading, spacing: 8) {
            Text(hero.name)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text(classLabel(hero.classType))
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
            Text("HP \(hero.hp) / \(hero.maxHp)")
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: 메뉴 자리표시 — 다음 슬라이스에서 실제 화면으로 교체

    private var menuPlaceholder: some View {
        VStack(spacing: 10) {
            ForEach(menuItems, id: \.title) { item in
                HStack(spacing: 12) {
                    Image(systemName: item.icon)
                        .font(.system(size: 18))
                        .foregroundStyle(Color.textTertiary)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .typography(.body)
                            .foregroundStyle(Color.textSecondary)
                        Text(item.subtitle)
                            .typography(.micro)
                            .foregroundStyle(Color.textTertiary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .frame(maxWidth: .infinity)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                .opacity(0.55)  // 아직 비활성 — 다음 슬라이스에서 활성화
            }
        }
    }

    private var menuItems: [(title: String, subtitle: String, icon: String)] {
        [
            ("탐험 시작", "던전 선택 — 다음 슬라이스", "map"),
            ("장비", "인벤토리 — 다음 슬라이스", "shield"),
            ("상점", "갓생 상점 — 이후 슬라이스", "bag"),
        ]
    }

    private func classLabel(_ c: ClassType?) -> String {
        guard let c, let meta = UpHeroRules.classMeta[c] else { return "전직 전" }
        return meta.name
    }
}
