import SwiftUI

/// Always-visible item information; the sheet explains builds without covering placement controls.
struct BagInspectorView: View {
    let item: Equipment?
    let worn: Bool
    let equipped: [EquipSlot: Equipment]
    let inventory: [Equipment]
    let rows: Int
    let onAction: (BagItemAction, Equipment) -> Void
    let onPlace: (Equipment, BagPlacement) -> Void
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.map { $0.localizedDisplayName + (($0.enhanceLevel ?? 0) > 0 ? " +\($0.enhanceLevel!)" : "") } ?? BagCopy.text("guide"))
                    .typography(.caption).foregroundStyle(GBPalette.lightest).lineLimit(1)
                if let item {
                    Text(BagCopy.text(worn ? "worn" : "stats") + " · " + statText(item.stats))
                        .typography(.caption).foregroundStyle(GBPalette.light).lineLimit(2)
                    Text(BagCopy.text("detail") + " · " + BagCopy.text("rules"))
                        .typography(.micro).underline().foregroundStyle(GBPalette.light)
                } else {
                    Text(BagCopy.text("idle")).typography(.caption).foregroundStyle(GBPalette.light)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(GBPalette.dark.opacity(0.4))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("bagInspector")
        .sheet(isPresented: $open) { detailSheet }
    }

    private var detailSheet: some View {
        VStack(spacing: 0) {
            HStack {
                Text(BagCopy.text(item == nil ? "guide" : "detail")).typography(.heading)
                Spacer()
                Button { open = false } label: {
                    Text(BagCopy.text("close"))
                        .typography(.caption).foregroundStyle(GBPalette.lightest)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("bagDetailClose")
            }.padding(.horizontal, 16).padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let item { itemSection(item) }
                    Text(BagCopy.text("roles")).typography(.caption).foregroundStyle(GBPalette.light)
                    if let item {
                        comparison(item)
                        connections(item)
                        if !worn { recommendation(item) }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        Text(BagCopy.text("rules")).typography(.heading)
                        ForEach(ruleKeys, id: \.self) { rule in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(BagCopy.text(rule + "title")).typography(.body).foregroundStyle(GBPalette.lightest)
                                Text(BagCopy.text(rule + "body")).typography(.caption)
                            }
                        }
                        Text(BagCopy.text("synth")).typography(.caption).foregroundStyle(GBPalette.light)
                    }
                }.padding(16).padding(.bottom, 24)
            }
        }
        .foregroundStyle(Color.textPrimary)
        .background(GBPalette.darkest)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var ruleKeys: [String] {
        guard let item, !worn else { return ["s1", "s2", "s3", "s4"] }
        if UpHeroBag.isPhotoTalisman(item) { return ["s4"] }
        return ["s1"] + (item.type == .accessory ? ["s2"] : item.type == .talisman ? ["s3"] : [])
    }

    private func itemSection(_ item: Equipment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.localizedDisplayName + ((item.enhanceLevel ?? 0) > 0 ? " +\(item.enhanceLevel!)" : "")).typography(.title).foregroundStyle(GBPalette.lightest)
            Text(item.category.label + " · " + slotName(item.type) + " · " + item.rarity.displayName)
                .typography(.caption)
            Text(BagCopy.text(worn ? "worn" : UpHeroBag.normalizeBagLayout(inventory, rows: rows).layout.statusById[item.id] == .placed ? "carried" : "waiting")).typography(.caption)
            Text(BagCopy.text("stats")).typography(.heading)
            Text(BagShape.label(item.type, UpHeroBag.normalizeRot(item.bagRot))).typography(.caption)
            Text(BagCopy.text("statsIncluded")).typography(.caption).foregroundStyle(GBPalette.light)
            ForEach(StatKey.allCases.filter { (item.stats[$0] ?? 0) != 0 }, id: \.self) { key in
                HStack {
                    Text(statName(key) + " (" + (key == .slotBonus ? "SLOT" : key.rawValue.uppercased()) + ")")
                    Spacer()
                    Text(signed(key, item.stats[key] ?? 0)).monospacedDigit()
                }.typography(.body)
            }
            ForEach(item.talismanSkills ?? [], id: \.self) { id in
                if let skill = TalismanSkills.catalog[id] {
                    Text(AppConfig.locRuntime(skill.name) + ": " + AppConfig.locRuntime(skill.description)).typography(.caption)
                }
            }
            Text(BagCopy.text("statMeaning")).typography(.caption).foregroundStyle(GBPalette.light)
            Text(BagCopy.text("statSkills")).typography(.caption).foregroundStyle(GBPalette.light)
        }
    }

    private func comparison(_ item: Equipment) -> some View {
        let change = BagInsights.equipmentChange(item, worn: worn, equipped: equipped, inventory: inventory, rows: rows)
        return VStack(alignment: .leading, spacing: 10) {
            Text(BagCopy.text(worn ? "compareUnequip" : "compareEquip")).typography(.heading)
            deltaView(change.delta)
            Text(BagCopy.text("compareNote")).typography(.caption)
            actionButton(AppConfig.loc(worn ? "해제" : "장착"), id: "bagDetailEquip") {
                open = false
                onAction(worn ? .unequip : .equip, item)
            }
            if !worn {
                Button(BagCopy.text("move")) { open = false; onAction(.place, item) }
                    .typography(.body).foregroundStyle(GBPalette.lightest)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityIdentifier("bagDetailMove")
            }
        }.padding(12).background(GBPalette.dark.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }

    private func connections(_ item: Equipment) -> some View {
        let syn = UpHeroBag.computeBagSynergy(equipped: equipped, inventory: inventory, rows: rows)
        let links = syn.links.filter { $0.rule != .s6 && (worn ? $0.anchor == item.type : $0.sourceId == item.id) }
        let slots = UpHeroBag.anchorOrder.filter { slot in links.contains { $0.anchor == slot } }
        return VStack(alignment: .leading, spacing: 8) {
            Text(BagCopy.text("connections")).typography(.heading)
            if slots.isEmpty {
                Text(BagCopy.text("noConnections")).typography(.caption)
            } else {
                Text(BagCopy.text("anchorTotal")).typography(.caption).foregroundStyle(GBPalette.light)
                ForEach(slots, id: \.self) { slot in
                    Text(slotName(slot) + ": " + statText(syn.perAnchor[slot] ?? [:])).typography(.caption)
                }
            }
        }
    }

    private func recommendation(_ item: Equipment) -> some View {
        let suggestion = BagInsights.suggest(item, equipped: equipped, inventory: inventory, rows: rows)
        return VStack(alignment: .leading, spacing: 10) {
            Text(BagCopy.text("suggest")).typography(.heading)
            if let suggestion {
                Text(BagCopy.text("suggestion")).typography(.caption)
                deltaView(suggestion.delta)
                placementMap(item, suggestion.placement)
                actionButton(BagCopy.text("apply"), id: "bagApplySuggestion") {
                    open = false
                    onPlace(item, suggestion.placement)
                }
            } else {
                Text(BagCopy.text("noSuggestion")).typography(.caption)
            }
        }
    }

    private func placementMap(_ item: Equipment, _ p: BagPlacement) -> some View {
        let cells = UpHeroBag.footprint(type: item.type, x: p.x, y: p.y, rot: p.rot)
        let layout = UpHeroBag.normalizeBagLayout(inventory.filter { $0.id != item.id }, rows: rows).layout
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 5), spacing: 4) {
            ForEach(0..<(rows * 5), id: \.self) { i in
                let x = i % 5, y = rows - 1 - i / 5
                let hot = cells.contains(BagCell(x: x, y: y))
                let slot = UpHeroBag.anchorAt(x: x, y: y)
                let occupied = layout.occupancy[y * 5 + x] != nil
                Text(hot ? "+" : slot.map { slotName($0) } ?? (x == 2 && y == 1 ? "●" : occupied ? "·" : ""))
                    .typography(.micro).lineLimit(1).minimumScaleFactor(0.5)
                    .foregroundStyle(hot ? GBPalette.darkest : GBPalette.light)
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .background(hot ? GBPalette.lightest : GBPalette.dark.opacity(occupied ? 1 : 0.3), in: RoundedRectangle(cornerRadius: 4))
            }
        }.frame(maxWidth: 250).frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore).accessibilityLabel(BagCopy.text("suggestion"))
    }

    private func deltaView(_ stats: [StatKey: Int]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if stats.isEmpty { Text(BagCopy.text("noChange")).typography(.body) }
            ForEach(StatKey.allCases.filter { (stats[$0] ?? 0) != 0 }, id: \.self) { key in
                Text(statName(key) + " " + signed(key, stats[key] ?? 0)).typography(.body)
                    .foregroundStyle((stats[key] ?? 0) < 0 ? GBPalette.enemy : GBPalette.lightest)
            }
        }
    }

    private func actionButton(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).typography(.body).foregroundStyle(GBPalette.darkest)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(GBPalette.lightest, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.unPress).accessibilityIdentifier(id)
    }
    private func statText(_ stats: [StatKey: Int]) -> String {
        let values = StatKey.allCases.filter { (stats[$0] ?? 0) != 0 }.map { statName($0) + " " + signed($0, stats[$0] ?? 0) }
        return values.isEmpty ? BagCopy.text("noStats") : values.joined(separator: " · ")
    }
    private func signed(_ key: StatKey, _ value: Int) -> String { (value > 0 ? "+" : "") + "\(value)" + (key == .crit ? "%p" : "") }
    private func statName(_ key: StatKey) -> String {
        switch key {
        case .str: return AppConfig.loc("힘")
        case .int: return AppConfig.loc("지성")
        case .vit: return AppConfig.loc("체력")
        case .dex: return AppConfig.loc("손재주")
        case .agi: return AppConfig.loc("민첩")
        case .crit: return AppConfig.loc("치명")
        case .slotBonus: return AppConfig.loc("슬롯")
        }
    }
    private func slotName(_ slot: EquipSlot) -> String {
        AppConfig.loc(slot == .weapon ? "무기" : slot == .armor ? "방어구" : slot == .accessory ? "장신구" : "부적")
    }
}

private enum BagCopy {
    static func text(_ key: String) -> String {
        switch key {
        case "guide": return AppConfig.loc("가방 사용법")
        case "detail": return AppConfig.loc("장비 상세")
        case "idle": return AppConfig.loc("아이템을 탭하면 능력치와 연결 조건을 볼 수 있어요.")
        case "roles": return AppConfig.loc("영웅 옆 4개 슬롯에 장착하면 장비 능력치가 적용돼요. 가방 속 장비는 연결 조건을 만족할 때 시너지로 도와줘요. 정리 대기 중에는 효과가 없어요.")
        case "stats": return AppConfig.loc("장착 시 능력치")
        case "carried": return AppConfig.loc("가방에 보관 중")
        case "worn": return AppConfig.loc("장착 중")
        case "waiting": return AppConfig.loc("정리 대기 중")
        case "noStats": return AppConfig.loc("능력치 없음")
        case "noChange": return AppConfig.loc("능력치 변화 없음")
        case "compareEquip": return AppConfig.loc("장착하면 달라지는 능력치")
        case "compareUnequip": return AppConfig.loc("해제하면 달라지는 능력치")
        case "compareNote": return AppConfig.loc("장착 교체와 가방 시너지를 함께 계산했어요. 다음 탐험부터 적용돼요.")
        case "connections": return AppConfig.loc("현재 연결")
        case "noConnections": return AppConfig.loc("적용 중인 연결 효과가 없어요. 장착 여부, 배치 조건, 슬롯별 한도를 확인하세요.")
        case "anchorTotal": return AppConfig.loc("연결된 슬롯의 전체 시너지")
        case "rules": return AppConfig.loc("연결 조건")
        case "s1title": return AppConfig.loc("같은 활동끼리")
        case "s1body": return AppConfig.loc("같은 활동의 장비를 장착 슬롯의 상하좌우에 붙이세요. 가방 장비 크기 1칸당 장착 장비의 가장 높은 능력치 +5%, 슬롯당 최대 30%예요. 소수점은 반올림하고 최소 +1이 적용돼요.")
        case "s2title": return AppConfig.loc("장신구로 치명타 올리기")
        case "s2body": return AppConfig.loc("장착한 무기의 상하좌우에 장신구를 놓으세요. 1개당 치명 +3%p, 최대 2개까지 적용돼요. 활동이 달라도 연결돼요.")
        case "s3title": return AppConfig.loc("부적으로 방어 올리기")
        case "s3body": return AppConfig.loc("장착한 방어구의 상하좌우에 일반 부적을 놓으세요. 1개당 체력 +3, 최대 2개까지 적용돼요. 사진 부적은 별도 규칙을 따라요.")
        case "s4title": return AppConfig.loc("사진으로 여러 장비 돕기")
        case "s4body": return AppConfig.loc("사진 부적은 상하좌우와 대각선의 장착 장비에 연결돼요. 가장 높은 능력치 +1, 강화 +5부터 +2, +10부터 +3이에요. 슬롯마다 효과가 높은 사진 2장까지 적용돼요.")
        case "synth": return AppConfig.loc("합성은 배치와 별개예요. 같은 등급 장비 3개를 고르면 돼요. 사진 부적과 전설 장비는 재료로 쓸 수 없어요.")
        case "suggest": return AppConfig.loc("시너지 자리 찾기")
        case "suggestion": return AppConfig.loc("이 자리로 옮기면")
        case "apply": return AppConfig.loc("추천 위치에 놓기")
        case "noSuggestion": return AppConfig.loc("다른 능력치를 낮추지 않고 시너지를 늘릴 빈자리가 없어요. 장착 장비나 주변 배치를 바꿔 보세요.")
        case "move": return AppConfig.loc("위치 옮기기")
        case "close": return AppConfig.loc("닫기")
        case "statMeaning": return AppConfig.loc("힘은 기본 공격, 체력은 받는 피해 감소, 손재주는 명중과 치명타, 민첩은 회피와 도주에 쓰여요. 치명은 확률 보너스이며 실제 전투 확률에는 상한이 있어요.")
        case "statSkills": return AppConfig.loc("지성은 전직 스킬의 피해·회복량을 높여요. 슬롯은 장신구·부적에 장착할 때 탐험 버프 선택 수를 늘리며, 최대 4개까지예요.")
        case "statsIncluded": return AppConfig.loc("표시 값에는 드롭 당시 능력치, 부가 능력치, 강화가 모두 포함돼요.")
        case "noBagStats": return AppConfig.loc("가방에 놓으면 아래 연결 효과만 적용돼요.")
        case "cancelMove": return AppConfig.loc("이동 취소")
        default: return key
        }
    }
}
