//
//  CodexView.swift
//  UpNext — Up Hero 도감 (R8 격상 — 탭 + 스프라이트 그리드).
//
//  웹 components/uphero/HeroCodex.tsx 포팅. 3탭 (몬스터/보스/장비).
//   - 몬스터 탭: MonsterPool.allTemplates 그리드. 발견(codex.monsters) 만 컬러, 미발견 회색 실루엣.
//   - 보스 탭: 던전별 보스 grouped. 발견(codex.bosses) 만 표시.
//   - 장비 탭: codex.equipment id 별 발견 카운트 (Equipment 카드 — rarity glow).
//

import SwiftUI

struct CodexView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    let onBack: () -> Void

    @State private var tab: CodexTab = .monsters
    /// 발견 몬스터 탭 시 상세 모달 대상.
    @State private var selectedMonster: MonsterTemplate?

    private enum CodexTab: String, CaseIterable {
        case monsters = "몬스터"
        case bosses = "보스"
        case equipment = "장비"
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            ScrollView {
                Group {
                    switch tab {
                    case .monsters:  monsterGrid
                    case .bosses:    bossGrid
                    case .equipment: equipmentGrid
                    }
                }
                .padding(16)
                .padding(.bottom, 100)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .overlay {
            if let m = selectedMonster {
                MonsterCodexDetailModal(template: m, onClose: { selectedMonster = nil })
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: selectedMonster?.id)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("도감").typography(.title).foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
    }

    private var tabBar: some View {
        HStack(spacing: 8) {
            ForEach(CodexTab.allCases, id: \.self) { t in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { tab = t }
                    Haptics.play(.selection)
                } label: {
                    Text(AppConfig.locRuntime(t.rawValue))
                        .typography(.caption)
                        .foregroundStyle(tab == t ? Color.bgPrimary : Color.textSecondary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(tab == t ? Color.accentPrimary : Color.bgSurface, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    // MARK: - 몬스터 그리드

    private var monsterGrid: some View {
        let templates = MonsterPool.allTemplates.filter { !$0.isBoss }
        let discovered = Set(upHero.state.codex.monsters)
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(discovered.count) / \(templates.count)종 발견")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            LazyVGrid(columns: gridColumns, spacing: 12) {
                ForEach(templates, id: \.id) { template in
                    let isDiscovered = discovered.contains(template.id)
                    Button {
                        if isDiscovered { SoundPlayer.shared.play(.select); selectedMonster = template }
                    } label: {
                        MonsterCodexCard(template: template, discovered: isDiscovered)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isDiscovered)
                }
            }
        }
    }

    // MARK: - 보스 그리드 (던전별)

    private var bossGrid: some View {
        let bossGroups = MonsterPool.allTemplates.filter { $0.isBoss }
            .reduce(into: [String: [MonsterTemplate]]()) { acc, t in
                if let did = t.dungeonId {
                    acc[did.rawValue, default: []].append(t)
                }
            }
        let discovered = Set(upHero.state.codex.bosses)
        return VStack(alignment: .leading, spacing: 16) {
            Text("\(discovered.count) / \(MonsterPool.allTemplates.filter { $0.isBoss }.count)종 발견")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            ForEach(bossGroups.keys.sorted(), id: \.self) { dungeonKey in
                VStack(alignment: .leading, spacing: 8) {
                    Text(dungeonKey)
                        .typography(.heading).foregroundStyle(Color.accentPrimary)
                    LazyVGrid(columns: gridColumns, spacing: 12) {
                        ForEach(bossGroups[dungeonKey]!, id: \.id) { boss in
                            let isDiscovered = discovered.contains(boss.id)
                            Button {
                                if isDiscovered { SoundPlayer.shared.play(.select); selectedMonster = boss }
                            } label: {
                                MonsterCodexCard(template: boss, discovered: isDiscovered)
                            }
                            .buttonStyle(.plain)
                            .disabled(!isDiscovered)
                        }
                    }
                }
            }
        }
    }

    // MARK: - 장비 그리드 — P0-2: 전체 템플릿을 ??? silhouette 으로 표시, 발견분만 실제 이름.

    private var equipmentGrid: some View {
        // codex.equipment 는 SessionReward.calculateCodexDelta 에서 한글 baseName 으로
        // 누적 (웹 Set<string> 동치). 미래 baseId 저장 마이그레이션 대비 둘 다 매칭.
        let discoveredSet = Set(upHero.state.codex.equipment)
        let allTemplates = EquipmentPool.templates
        let discoveredCount = allTemplates.filter {
            discoveredSet.contains($0.baseName) || discoveredSet.contains($0.baseId)
        }.count
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(discoveredCount) / \(allTemplates.count)종 발견")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            LazyVGrid(columns: gridColumns, spacing: 12) {
                ForEach(allTemplates, id: \.baseId) { template in
                    EquipmentCodexCard(
                        template: template,
                        discovered: discoveredSet.contains(template.baseName)
                            || discoveredSet.contains(template.baseId)
                    )
                }
            }
        }
    }

    private var gridColumns: [GridItem] {
        [GridItem(.flexible(), spacing: 12),
         GridItem(.flexible(), spacing: 12),
         GridItem(.flexible(), spacing: 12)]
    }
}

// MARK: - 몬스터 카드

struct MonsterCodexCard: View {
    let template: MonsterTemplate
    let discovered: Bool

    var body: some View {
        VStack(spacing: 6) {
            MonsterSprite(
                kind: template.kind,
                size: 44,
                color: discovered
                    ? (template.isBoss ? Color.accentSecondary : Color.textPrimary)
                    : Color.textTertiary.opacity(0.3),
                glow: discovered && template.isBoss
            )
            Text(discovered ? LocalizedStringKey(template.name) : "???")
                .typography(.micro)
                .foregroundStyle(discovered ? Color.textPrimary : Color.textTertiary)
                .lineLimit(1)
            if discovered {
                HStack(spacing: 2) {
                    ForEach(0..<template.power, id: \.self) { _ in
                        PixelIcon(.star, size: 7, color: Color.accentPrimary)
                    }
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 100)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(template.isBoss && discovered ? Color.accentSecondary.opacity(0.4)
                        : Color.clear, lineWidth: 1)
        )
    }
}

// MARK: - 장비 카드 (P0-2 — slot 아이콘 + friendly 이름 + 슬롯 라벨)

struct EquipmentCodexCard: View {
    let template: EquipmentTemplate
    let discovered: Bool

    /// 슬롯 타입 → PixelIcon 매핑. 템플릿의 iconName 이 PixelIcon enum 에 없을 수도
    /// 있어 슬롯 기반의 안정적 시각 신호 우선 (resolve 의 .card fallback 회피).
    private var slotIcon: PixelIconName {
        switch template.type {
        case .weapon:    return .sword
        case .armor:     return .shield
        case .accessory: return .gift
        case .talisman:  return .sparkle
        }
    }

    private var slotLabel: String {
        switch template.type {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            PixelIcon(
                slotIcon, size: 28,
                color: discovered ? Color.accentPrimary : Color.textTertiary.opacity(0.3)
            )
            Text(discovered ? template.baseName : "???")
                .typography(.micro)
                .foregroundStyle(discovered ? Color.textPrimary : Color.textTertiary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
            Text(slotLabel)
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 100)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }
}
