//
//  DesignSystemGallery.swift
//  UpNext — Phase 1.5 검증 화면.
//
//  Phase 1에서 포팅한 디자인 시스템(색상·타이포·아이콘)을 한 화면에 모아
//  웹 globals.css와 픽셀 비교 검증. Phase 2 이후엔 빌드에서 제외하거나
//  개발자 메뉴 뒤로 숨길 수 있음.
//

import SwiftUI

struct DesignSystemGallery: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header

                colorSection("배경", [
                    ("bgPrimary", .bgPrimary), ("bgSurface", .bgSurface),
                    ("bgElevated", .bgElevated), ("bgHover", .bgHover),
                ])
                colorSection("액센트", [
                    ("accentPrimary", .accentPrimary), ("accentSecondary", .accentSecondary),
                    ("accentCyan", .accentCyan), ("accentBlue", .accentBlue),
                    ("accentFushia", .accentFushia),
                ])
                colorSection("텍스트", [
                    ("textPrimary", .textPrimary), ("textSecondary", .textSecondary),
                    ("textTertiary", .textTertiary),
                ])
                colorSection("카드 등급", [
                    ("rarityNormal", .rarityNormal), ("rarityRare", .rarityRare),
                    ("rarityUnique", .rarityUnique), ("rarityLegend", .rarityLegend),
                ])
                colorSection("미니게임 시그널", [
                    ("signalGo", .signalGo), ("signalReady", .signalReady),
                    ("signalStop", .signalStop), ("signalStopStrong", .signalStopStrong),
                ])
                colorSection("skill / curse", [
                    ("colorSkill", .colorSkill), ("colorSkillStrong", .colorSkillStrong),
                    ("colorCurse", .colorCurse), ("colorCurseStrong", .colorCurseStrong),
                    ("colorHeartActive", .colorHeartActive), ("colorHeartEmpty", .colorHeartEmpty),
                ])
                colorSection("폴라로이드 잉크", [
                    ("paperCream", .paperCream), ("inkWarmText", .inkWarmText),
                    ("inkRed", .inkRed), ("inkBlue", .inkBlue),
                    ("inkGreen", .inkGreen), ("inkPurple", .inkPurple),
                ])
                colorSection("오류", [
                    ("colorError", .colorError), ("colorErrorStrong", .colorErrorStrong),
                ])

                typographySection
                iconSection
            }
            .padding(20)
        }
        .background(Color.bgPrimary)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("디자인 시스템")
                .typography(.display)
                .foregroundStyle(Color.accentPrimary)
            Text("Phase 1 — 색상 46 · 타이포 6단계 · 아이콘 34")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
    }

    // MARK: - 컬러 섹션

    private func colorSection(_ title: String, _ tokens: [(String, Color)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(tokens, id: \.0) { token in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(token.1)
                            .frame(height: 52)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(Color.white.opacity(0.08))
                            )
                        Text(token.0)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Color.textTertiary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }

    // MARK: - 타이포 섹션

    private var typographySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("타이포그래피")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Group {
                Text("Display — 갓생 시작").typography(.display)
                Text("Title — 오늘의 챌린지").typography(.title)
                Text("Heading — 카드 컬렉션").typography(.heading)
                Text("Body — 매일 6장의 카드를 뽑아 2개를 수행하세요").typography(.body)
                Text("Caption — 연속 7일 달성 중").typography(.caption)
                Text("Micro — 2026.05.15 업데이트").typography(.micro)
            }
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - 아이콘 섹션

    private var iconSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("픽셀 아이콘 (\(PixelIconName.allCases.count))")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 16) {
                ForEach(PixelIconName.allCases, id: \.self) { icon in
                    VStack(spacing: 6) {
                        PixelIcon(icon, size: 26, color: .accentPrimary)
                        Text(icon.rawValue)
                            .font(.system(size: 8, design: .monospaced))
                            .foregroundStyle(Color.textTertiary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                }
            }
        }
    }
}

#Preview {
    DesignSystemGallery()
}
