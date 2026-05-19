//
//  CodexView.swift
//  UpNext — Up Hero 도감 (Phase 4 슬라이스 27).
//
//  웹 components/uphero/HeroCodex.tsx 포팅. 던전 탐험에서 만난 몬스터·보스·장비가
//  도감에 기록된다 (세션 결산 시 calculateCodexDelta 가 채움).
//
//  슬라이스 27 은 발견 현황(진행도) — 각 항목별 개별 엔트리(아트·스탯 카드)는
//  condensed. codex 는 id 목록만 보유하므로 발견 수 집계로 도감 진행을 보여준다.
//

import SwiftUI

struct CodexView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    /// 전체 보스 수 — 던전 8종 × 보스 3종.
    private var totalBosses: Int {
        Dungeons.list.reduce(0) { $0 + $1.bossIds.count }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("던전에서 만난 몬스터·보스와 얻은 장비가 도감에 기록됩니다.")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 4)
                    codexRow("몬스터", upHero.state.codex.monsters.count,
                             total: MonsterPool.allTemplates.count)
                    codexRow("보스", upHero.state.codex.bosses.count,
                             total: totalBosses)
                    codexRow("장비", upHero.state.codex.equipment.count,
                             total: nil)
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("도감")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    /// total 이 있으면 "N / total", 없으면 "N종" 표기.
    private func codexRow(_ label: String, _ count: Int, total: Int?) -> some View {
        HStack {
            Text(label)
                .typography(.body)
                .foregroundStyle(Color.textPrimary)
            Spacer(minLength: 0)
            Text(total.map { "\(count) / \($0)" } ?? "\(count)종")
                .typography(.body)
                .foregroundStyle(count > 0 ? Color.accentPrimary : Color.textTertiary)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }
}
