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

    // 이슈#26 — 라임 채운 캡슐 세그먼트를 웹 sliding-underline(EquipmentInventory:473-504
    // 패리티)으로 교체. 하단 네비 라임 캡슐과 형태를 분리해 세그먼트 위계를 복원한다.
    private var tabBar: some View {
        let cases = CodexTab.allCases
        let idx = cases.firstIndex(of: tab) ?? 0
        return HStack(spacing: 0) {
            ForEach(cases, id: \.self) { t in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { tab = t }
                    Haptics.play(.selection)
                } label: {
                    Text(AppConfig.locRuntime(t.rawValue))
                        .typography(.body)
                        .foregroundStyle(tab == t ? Color.accentPrimary : Color.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        // 탭 하단 경계선 1px rgb(255 255 255 / 0.06).
        .background(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 1)
        }
        // sliding-underline — 3탭 균등폭, 폭=총폭/3, 240ms cubic-bezier(.23,1,.32,1).
        .overlay {
            GeometryReader { geo in
                let seg = geo.size.width / CGFloat(cases.count)
                Rectangle()
                    .fill(Color.accentPrimary)
                    .frame(width: seg, height: 2)
                    .shadow(color: Color.accentPrimary.opacity(0.4), radius: 2)
                    .offset(x: CGFloat(idx) * seg)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .animation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.24), value: tab)
            }
        }
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    // MARK: - 몬스터 그리드

    private var monsterGrid: some View {
        let templates = MonsterPool.allTemplates.filter { !$0.isBoss }
        // 웹 패리티 — codex 는 template.name 기반 기록. 하위호환으로 boss set 도 합집합.
        let discovered = Set(upHero.state.codex.monsters).union(upHero.state.codex.bosses)
        let discoveredCount = templates.filter { Self.isDiscovered($0, in: discovered) }.count
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(discoveredCount) / \(templates.count)종 발견")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            LazyVGrid(columns: gridColumns, spacing: 12) {
                ForEach(templates, id: \.id) { template in
                    let isDiscovered = Self.isDiscovered(template, in: discovered)
                    Button {
                        if isDiscovered {
                            SoundPlayer.shared.play(.select)
                            Haptics.play(.selection)
                            selectedMonster = template
                        }
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
        let discovered = Set(upHero.state.codex.bosses).union(upHero.state.codex.monsters)
        let allBosses = MonsterPool.allTemplates.filter { $0.isBoss }
        let discoveredCount = allBosses.filter { Self.isDiscovered($0, in: discovered) }.count
        return VStack(alignment: .leading, spacing: 16) {
            Text("\(discoveredCount) / \(allBosses.count)종 발견")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            ForEach(bossGroups.keys.sorted(), id: \.self) { dungeonKey in
                VStack(alignment: .leading, spacing: 8) {
                    // 웹 패리티(dungeonName) — raw enum id("fitness") 대신 현지화 던전명 노출.
                    Text(LocalizedStringKey(
                        Dungeons.all[DungeonId(rawValue: dungeonKey) ?? .fitness]?.name ?? dungeonKey))
                        .typography(.heading).foregroundStyle(Color.accentPrimary)
                    LazyVGrid(columns: gridColumns, spacing: 12) {
                        ForEach(bossGroups[dungeonKey]!, id: \.id) { boss in
                            let isDiscovered = Self.isDiscovered(boss, in: discovered)
                            Button {
                                if isDiscovered {
                                    SoundPlayer.shared.play(.select)
                                    Haptics.play(.selection)
                                    selectedMonster = boss
                                }
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

    /// 웹 HeroCodex.isDiscovered 패리티 — codex(monsters/bosses)는 template.name 기반 기록.
    /// (기존 버그: template.id 로 대조 → 이름 집합과 절대 불일치해 발견분이 ??? 로 표시.)
    /// 레거시 instance-id("{id}_f...") 포맷도 하위호환 매칭.
    static func isDiscovered(_ template: MonsterTemplate, in discovered: Set<String>) -> Bool {
        if discovered.contains(template.name) { return true }
        let prefix = "\(template.id)_f"
        return discovered.contains { $0.hasPrefix(prefix) }
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
            Text(discovered ? LocalizedStringKey(template.baseName) : "???")
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
