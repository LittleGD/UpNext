//
//  BagBoardView.swift
//  UpNext — Up Hero 격자 가방 보드 (웹 components/uphero/BagBoard.tsx 1:1 미러).
//
//  5열 × rows 행. 데이터 좌표는 row 0 이 십자이고, 화면은 `UpHeroBag.visualRow` 로
//  뒤집어 십자가 **아래쪽 엄지 영역**에 오게 그린다. 새 행은 위로 쌓인다.
//
//  왜 LazyVGrid 가 아니라 절대 배치인가: 1x2 / 2x2 아이템이 여러 칸을 덮어야 하는데
//  SwiftUI 그리드에는 셀 span 이 없다. 칸 크기를 GeometryReader 로 한 번 재고
//  (`UpHeroBag.bagCellSize`) 좌표를 pt 로 직접 환산하면 드래그 히트테스트와 렌더가
//  **같은 수식**을 공유해 어긋나지 않는다.
//
//  상태 기계는 부모(EquipmentInventoryView)가 갖는다. 보드는 "무엇을 눌렀다" 만
//  올려보내고 selectedId·placingRot 은 인자로 받는다 — 트레이에서 고른 아이템을
//  보드 빈 칸에 놓는 경로가 있어 선택 상태가 보드보다 위에 있어야 하기 때문이다.
//

import SwiftUI

// MARK: - 공용 값 타입

/// 액션바와 보드 접근성 액션이 함께 쓰는 아이템 동작 (웹 BagActionBar 버튼 집합).
enum BagItemAction {
    case place, rotate, equip, unequip, enhance, sell, discard
    /// Track E 합성 — 선택 아이템을 첫 재료로 합성 모드에 들어간다.
    case synth
}

/// 모양의 폭·높이(칸 수). 렌더·히트테스트·프리뷰가 같은 값을 써야 한 칸씩 어긋나지 않는다.
enum BagShape {
    static func extent(_ type: EquipSlot, _ rot: Int) -> (w: Int, h: Int) {
        var w = 1
        var h = 1
        for c in UpHeroBag.shapeFor(type: type, rot: rot) {
            w = max(w, c.x + 1)
            h = max(h, c.y + 1)
        }
        return (w, h)
    }

    /// SR 이 "세로 2칸" 처럼 읽도록 하는 모양 라벨 (웹 shapeKey).
    static func label(_ type: EquipSlot, _ rot: Int) -> String {
        let e = extent(type, rot)
        if e.w == 2 && e.h == 2 { return AppConfig.loc("4칸") }
        if e.w == 2 { return AppConfig.loc("가로 2칸") }
        if e.h == 2 { return AppConfig.loc("세로 2칸") }
        return AppConfig.loc("1칸")
    }
}

/// 보드 격자의 화면 기하. 트레이 롱프레스 드래그가 화면 좌표를 데이터 칸으로 바꿀 때 쓴다.
/// 보드 안 드래그와 **같은 수식**(`originFromPoint`)을 공유해야 두 경로가 갈리지 않는다.
struct BagBoardMetrics: Equatable {
    /// 격자 좌상단 — 가방 화면 루트 좌표계(`BagBoardView.space`) 기준.
    var origin: CGPoint
    var cell: CGFloat
    var step: CGFloat
    var rows: Int

    /// 화면 좌표 → **원점 칸**. 들린 프리뷰가 손가락 한 칸 위에 있으므로 한 칸 위를
    /// 기준으로 잡고, 모양 높이만큼 데이터 row 를 내려 원점을 만든다
    /// (footprint 는 데이터 아래로 자라는데 화면은 뒤집혀 있어 그냥 칸을 쓰면 1x2 가 어긋난다).
    func originFromPoint(_ p: CGPoint, type: EquipSlot, rot: Int) -> BagCell? {
        guard step > 0 else { return nil }
        let col = Int(((p.x - origin.x) / step).rounded(.down))
        let vr = Int(((p.y - step - origin.y) / step).rounded(.down))
        guard col >= 0, col < UpHeroBag.cols, vr >= 0, vr < rows else { return nil }
        let h = BagShape.extent(type, rot).h
        return BagCell(x: col, y: rows - vr - h)
    }
}

struct BagBoardMetricsKey: PreferenceKey {
    static let defaultValue: BagBoardMetrics? = nil
    static func reduce(value: inout BagBoardMetrics?, nextValue: () -> BagBoardMetrics?) {
        if let next = nextValue() { value = next }
    }
}

/// 등급 글로우 표 — `EquipmentSlotCard` 가 쓰던 세 표를 한 곳으로 모았다.
/// 타일과 슬롯 카드가 같은 값을 써야 "같은 등급인데 다른 세기" 가 생기지 않는다.
enum BagRarityStyle {
    static func borderAlpha(_ r: Rarity) -> Double {
        switch r {
        case .normal: return 0.15
        case .rare:   return 0.4
        case .unique: return 0.5
        case .legend: return 0.7
        }
    }

    static func glowAlpha(_ r: Rarity) -> Double {
        switch r {
        case .normal: return 0
        case .rare:   return 0.28
        case .unique: return 0.32
        case .legend: return 0.42
        }
    }

    static func glowRadius(_ r: Rarity) -> CGFloat {
        switch r {
        case .normal: return 0
        case .rare:   return 8
        case .unique: return 10
        case .legend: return 14
        }
    }
}

/// 경고 톤 — 웹 `GB_WARN`(#e8d88b). 무효 고스트에만 쓴다(등급색과 겹치지 않는 노란 계열).
let bagWarnColor = Color(hexString: "#e8d88b")

// MARK: - 보드

struct BagBoardView: View {
    /// 가방 화면 전체가 공유하는 좌표계 이름. 트레이 드래그가 이 좌표로 좌표를 넘긴다.
    static let space = "upheroBag"
    /// 앵커 델타 한 줄이 쓰는 높이. 보드 높이에서 미리 빼고 셀 크기를 잰다.
    private static let footerH: CGFloat = 18
    /// 탭과 드래그를 가르는 이동량(pt). 플랜 §7 값.
    private static let dragThreshold: CGFloat = 6

    let rows: Int
    let inventory: [Equipment]
    let equipped: [EquipSlot: Equipment]
    let classType: ClassType?
    let heroVariant: Int
    let selectedId: String?
    let selectedSlot: EquipSlot?
    let placingRot: Int
    let synergy: BagSynergy
    let newIds: Set<String>
    /// Track E 합성 모드 — 재료로 고른 타일(선택과 같은 라임 보더) / 재료가 될 수 없는 타일(흐리게).
    var pickedIds: Set<String> = []
    var dimmedIds: Set<String> = []
    let growth: GrowthStore
    let onSelect: (String?) -> Void
    let onTapEmptyCell: (Int, Int) -> Void
    let onTapWorn: (EquipSlot) -> Void
    let onTapHero: () -> Void
    /// 드래그 릴리스 커밋. 성공 여부만 돌려받아 소리·햅틱은 보드가 직접 낸다.
    let onDropAt: (String, Int, Int, Int) -> Bool
    let onItemAction: (BagItemAction, Equipment) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 드래그 중 상태 — 손가락 위치(격자 좌표계)와 스냅된 원점.
    private struct DragState {
        var itemId: String
        var type: EquipSlot
        var rot: Int
        var point: CGPoint
        var origin: BagCell?
        var valid: Bool
        /// 들기 햅틱을 한 번만 울리기 위한 래치.
        var lifted: Bool
    }

    /// 거절된 드래그가 제 자리로 돌아가는 150ms.
    private struct SnapState: Equatable {
        var item: Equipment
        var rot: Int
        var from: CGPoint
        var to: CGPoint
        var settled: Bool
    }

    @State private var drag: DragState?
    @State private var snap: SnapState?

    var body: some View {
        GeometryReader { geo in
            let cell = CGFloat(UpHeroBag.bagCellSize(
                width: Double(geo.size.width),
                height: Double(max(0, geo.size.height - Self.footerH)),
                rows: rows))
            let step = cell + CGFloat(UpHeroBag.gap)
            let gridW = CGFloat(UpHeroBag.cols) * cell + CGFloat(UpHeroBag.gap * (UpHeroBag.cols - 1))
            let gridH = CGFloat(rows) * cell + CGFloat(UpHeroBag.gap * (rows - 1))
            let layout = UpHeroBag.normalizeBagLayout(inventory, rows: rows).layout

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                grid(cell: cell, step: step, gridW: gridW, gridH: gridH, layout: layout)
                Spacer(minLength: 0)
                // 앵커 델타 — 시너지가 실제로 무엇을 주는지 숫자로.
                Text(anchorDeltaText)
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(GBPalette.light)
                    .lineLimit(1)
                    .frame(height: Self.footerH)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8)
                    .accessibilityHidden(anchorDeltaText.isEmpty)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - 격자

    @ViewBuilder
    private func grid(
        cell: CGFloat, step: CGFloat, gridW: CGFloat, gridH: CGFloat, layout: BagLayout
    ) -> some View {
        let tiles = layout.placed.compactMap { item -> (item: Equipment, p: BagPlacement)? in
            guard let p = UpHeroBag.readPlacement(item) else { return nil }
            return (item, p)
        }
        ZStack(alignment: .topLeading) {
            // 가방 실루엣 — 빈 칸을 항상 옅게 깔아 "가방이 몇 칸인지" 가 보이게 한다.
            // (선택 중에 뜨는 빈 칸 버튼이 이 위에 겹친다. 타일 아래라 이벤트는 없다.)
            ForEach(bagSilhouette(), id: \.self) { c in
                RoundedRectangle(cornerRadius: 3)
                    .fill(GBPalette.dark.opacity(0.18))
                    .frame(width: cell, height: cell)
                    .offset(x: CGFloat(c.x) * step,
                            y: CGFloat(UpHeroBag.visualRow(bagY: c.y, rows: rows)) * step)
                    .allowsHitTesting(false)
            }

            // 십자 — 앵커 4 + 영웅. 채움만, 보더는 착용/선택에만.
            ForEach(UpHeroBag.anchorOrder, id: \.self) { slot in
                if let a = UpHeroBag.anchors[slot], a.y < rows {
                    anchorCell(slot: slot, at: a, cell: cell, step: step)
                }
            }
            heroCell(cell: cell, step: step)

            // 빈 칸 — 아이템을 고른 동안에만 노출(탭 타깃·SR 노출 모두).
            if selectedId != nil {
                ForEach(emptyCells(layout: layout), id: \.self) { c in
                    emptyCell(c, cell: cell, step: step)
                }
            }

            // 가방 타일
            ForEach(tiles, id: \.item.id) { entry in
                tileView(entry.item, entry.p, cell: cell, step: step)
            }

            // 드래그 고스트 — 유효/무효를 색으로만 말한다.
            ForEach(ghostCells(), id: \.self) { c in
                Rectangle()
                    .fill((drag?.valid == true ? GBPalette.lightest : bagWarnColor).opacity(0.22))
                    .frame(width: cell, height: cell)
                    .overlay {
                        if drag?.valid != true {
                            Rectangle().strokeBorder(
                                bagWarnColor,
                                style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        }
                    }
                    .offset(x: CGFloat(c.x) * step,
                            y: CGFloat(UpHeroBag.visualRow(bagY: c.y, rows: rows)) * step)
                    .allowsHitTesting(false)
            }

            // 시너지 커넥터 — 오버레이 1장, 이벤트 없음.
            Canvas { ctx, _ in
                for link in synergy.links {
                    guard link.cells.count == 2 else { continue }
                    let a = center(link.cells[0], cell: cell, step: step)
                    let b = center(link.cells[1], cell: cell, step: step)
                    let hot = link.sourceId == selectedId
                    let color = hot ? GBPalette.lightest : GBPalette.light
                    let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
                    if a.x != b.x && a.y != b.y {
                        // S4 대각 — 공유 모서리에 점 하나.
                        ctx.fill(
                            Path(ellipseIn: CGRect(x: mid.x - 2, y: mid.y - 2, width: 4, height: 4)),
                            with: .color(color))
                        continue
                    }
                    // 공유 변의 60% 길이 둥근 선분.
                    let half = cell * 0.3
                    let vertical = a.x != b.x   // 좌우 인접 = 공유 변이 세로
                    var path = Path()
                    path.move(to: CGPoint(x: vertical ? mid.x : mid.x - half,
                                          y: vertical ? mid.y - half : mid.y))
                    path.addLine(to: CGPoint(x: vertical ? mid.x : mid.x + half,
                                             y: vertical ? mid.y + half : mid.y))
                    ctx.stroke(path, with: .color(color),
                               style: StrokeStyle(lineWidth: 3, lineCap: .round))
                }
            }
            .frame(width: gridW, height: gridH)
            .allowsHitTesting(false)

            // 들린 프리뷰 — 손가락 한 칸 위. 격자 밖으로 나가도 클립하지 않는다.
            if let d = drag {
                let e = BagShape.extent(d.type, d.rot)
                RoundedRectangle(cornerRadius: 3)
                    .fill(GBPalette.dark.opacity(0.93))
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .strokeBorder(d.valid ? GBPalette.lightest : bagWarnColor, lineWidth: 1))
                    .frame(width: CGFloat(e.w) * cell + CGFloat((e.w - 1) * UpHeroBag.gap),
                           height: CGFloat(e.h) * cell + CGFloat((e.h - 1) * UpHeroBag.gap))
                    .offset(x: d.point.x - cell / 2, y: d.point.y - cell / 2 - step)
                    .allowsHitTesting(false)
            }

            // 스냅백 — 거절된 드래그가 제 자리로 돌아가는 150ms.
            if let s = snap {
                let e = BagShape.extent(s.item.type, s.rot)
                RoundedRectangle(cornerRadius: 3)
                    .fill(GBPalette.dark.opacity(0.93))
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .strokeBorder(s.item.rarity.color, lineWidth: 1))
                    .frame(width: CGFloat(e.w) * cell + CGFloat((e.w - 1) * UpHeroBag.gap),
                           height: CGFloat(e.h) * cell + CGFloat((e.h - 1) * UpHeroBag.gap))
                    .offset(x: s.settled ? s.to.x : s.from.x, y: s.settled ? s.to.y : s.from.y)
                    .animation(.easeOut(duration: 0.15), value: s.settled)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: gridW, height: gridH, alignment: .topLeading)
        .contentShape(Rectangle())
        .coordinateSpace(name: Self.space)
        .background(
            GeometryReader { g in
                Color.clear.preference(
                    key: BagBoardMetricsKey.self,
                    value: BagBoardMetrics(
                        origin: g.frame(in: .named(EquipmentInventoryView.rootSpace)).origin,
                        cell: cell, step: step, rows: rows))
            }
        )
        .gesture(dragGesture(cell: cell, step: step, layout: layout, tiles: tiles))
        // children: .contain 이 없으면 컨테이너의 식별자가 **모든 자식에 덮어씌워져**
        // bagTile_<id> 가 사라진다 (SwiftUI 기본 전파 동작 — UITest 로 확인).
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bagBoard")
    }

    // MARK: - 칸

    private func anchorCell(
        slot: EquipSlot, at a: BagCell, cell: CGFloat, step: CGFloat
    ) -> some View {
        let worn = equipped[slot]
        let iconSize = cell < 52 ? CGFloat(22) : CGFloat(26)
        return Button {
            if worn != nil { onTapWorn(slot) }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 3).fill(GBPalette.dark)
                if let worn {
                    if let photoId = worn.photoId, !photoId.isEmpty {
                        photoThumb(photoId, size: iconSize + 6)
                    } else {
                        PixelIcon(PixelIconName.resolve(worn.iconName),
                                  size: iconSize, color: GBPalette.lightest)
                    }
                } else {
                    PixelIcon(slotIcon(slot), size: iconSize, color: GBPalette.light.opacity(0.4))
                }
                // Track E — 착용 앵커의 +N 칩 (Track B 톤 표). 웹 BagBoard 앵커 동일.
                if let worn, let lvl = worn.enhanceLevel, lvl > 0 {
                    let tone = EnhanceChipTone.forLevel(lvl)
                    Text("+\(lvl)")
                        .typography(.micro)
                        .monospacedDigit()
                        .foregroundStyle(tone.fg)
                        .padding(.horizontal, 3)
                        .background(tone.bg, in: RoundedRectangle(cornerRadius: 2))
                        .shadow(color: tone.glow, radius: tone.glowRadius)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(2)
                }
            }
            .frame(width: cell, height: cell)
            .overlay {
                // 보더는 의미가 있을 때만: 착용 = 등급색, 지금 고른 앵커 = 라임(화면에 하나).
                if let worn {
                    RoundedRectangle(cornerRadius: 3)
                        .strokeBorder(
                            selectedSlot == slot ? GBPalette.lightest : worn.rarity.color,
                            lineWidth: 1)
                }
            }
        }
        .buttonStyle(.unPress)
        .offset(x: CGFloat(a.x) * step,
                y: CGFloat(UpHeroBag.visualRow(bagY: a.y, rows: rows)) * step)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(worn.map {
            AppConfig.loc("\(slotName(slot)) \($0.localizedDisplayName), 착용 중")
        } ?? AppConfig.loc("\(slotName(slot)) 비어 있음"))
        .accessibilityIdentifier("bagAnchor_\(slot.rawValue)")
        .accessibilityActions {
            if let worn {
                Button(AppConfig.loc("해제")) { onItemAction(.unequip, worn) }
                Button(AppConfig.loc("강화 시도")) { onItemAction(.enhance, worn) }
            }
        }
    }

    private func heroCell(cell: CGFloat, step: CGFloat) -> some View {
        // 정수 배율만 쓴다 — 셀에 맞춰 늘리면 도트가 뭉갠다.
        let spriteSize: CGFloat = cell < 52 ? 36 : 48
        return Button(action: onTapHero) {
            ZStack {
                RoundedRectangle(cornerRadius: 3).fill(GBPalette.dark)
                HeroSprite(
                    variant: heroVariant,
                    classType: classType,
                    size: spriteSize,
                    color: classType != nil ? HeroSprite.themeColor(classType) : GBPalette.lightest)
            }
            .frame(width: cell, height: cell)
            .clipped()
        }
        .buttonStyle(.unPress)
        .offset(x: CGFloat(UpHeroBag.heroCell.x) * step,
                y: CGFloat(UpHeroBag.visualRow(bagY: UpHeroBag.heroCell.y, rows: rows)) * step)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(AppConfig.loc("영웅"))
        .accessibilityIdentifier("bagHero")
    }

    private func emptyCell(_ c: BagCell, cell: CGFloat, step: CGFloat) -> some View {
        let vr = UpHeroBag.visualRow(bagY: c.y, rows: rows)
        return Button { onTapEmptyCell(c.x, c.y) } label: {
            RoundedRectangle(cornerRadius: 3)
                .fill(GBPalette.dark.opacity(0.33))
                .frame(width: cell, height: cell)
        }
        .buttonStyle(.unPress)
        .offset(x: CGFloat(c.x) * step, y: CGFloat(vr) * step)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(AppConfig.loc("\(c.x + 1)열 \(vr + 1)행, 비어 있음"))
    }

    private func tileView(
        _ item: Equipment, _ p: BagPlacement, cell: CGFloat, step: CGFloat
    ) -> some View {
        let e = BagShape.extent(item.type, p.rot)
        let w = CGFloat(e.w) * cell + CGFloat((e.w - 1) * UpHeroBag.gap)
        let h = CGFloat(e.h) * cell + CGFloat((e.h - 1) * UpHeroBag.gap)
        let selected = item.id == selectedId || pickedIds.contains(item.id)
        let dimmed = dimmedIds.contains(item.id)
        let iconSize = cell < 52 ? CGFloat(22) : CGFloat(26)
        let enhance = item.enhanceLevel ?? 0
        // 화면 첫 행은 footprint 의 **가장 큰** 데이터 row 다 (렌더가 뒤집혀 있으므로).
        let topRow = UpHeroBag.visualRow(bagY: p.y + e.h - 1, rows: rows)
        return Button { onSelect(item.id) } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 3).fill(GBPalette.dark.opacity(0.87))
                if let photoId = item.photoId, !photoId.isEmpty {
                    photoThumb(photoId, size: iconSize + 8)
                } else {
                    PixelIcon(PixelIconName.resolve(item.iconName),
                              size: iconSize, color: item.rarity.color)
                }
                if enhance > 0 {
                    // Track B 강화 칩 톤 (1..9 어둡게 / 10..14 골드 / 15+ 라임 글로우). 웹 BagBoard 동일.
                    let tone = EnhanceChipTone.forLevel(enhance)
                    Text("+\(enhance)")
                        .typography(.micro)
                        .monospacedDigit()
                        .foregroundStyle(tone.fg)
                        .padding(.horizontal, 3)
                        .background(tone.bg, in: RoundedRectangle(cornerRadius: 2))
                        .shadow(color: tone.glow, radius: tone.glowRadius)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(2)
                }
                if newIds.contains(item.id) {
                    // 새로 들어온 타일 — 첫 탭 전까지 모서리 점 하나.
                    Rectangle()
                        .fill(GBPalette.lightest)
                        .frame(width: 4, height: 4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(2)
                }
            }
            .frame(width: w, height: h)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(selected ? GBPalette.lightest : item.rarity.color, lineWidth: 1))
            .shadow(color: item.rarity.color.opacity(BagRarityStyle.glowAlpha(item.rarity)),
                    radius: BagRarityStyle.glowRadius(item.rarity) * 0.5)
            .opacity(drag?.itemId == item.id ? 0.35 : (dimmed ? 0.4 : 1))
        }
        .buttonStyle(.unPress)
        .offset(x: CGFloat(p.x) * step, y: CGFloat(topRow) * step)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityLabel(tileLabel(item, p))
        .accessibilityIdentifier("bagTile_\(item.id)")
        .accessibilityActions {
            Button(AppConfig.loc("배치")) { onItemAction(.place, item) }
            if UpHeroBag.canRotate(type: item.type) {
                Button(AppConfig.loc("회전")) { onItemAction(.rotate, item) }
            }
            Button(AppConfig.loc("장착")) { onItemAction(.equip, item) }
            Button(AppConfig.loc("강화 시도")) { onItemAction(.enhance, item) }
            Button(AppConfig.loc("판매")) { onItemAction(.sell, item) }
            if item.photoId == nil, UpHeroRules.nextRarity[item.rarity] != nil {
                Button(AppConfig.loc("합성")) { onItemAction(.synth, item) }
            }
            Button(AppConfig.loc("버리기")) { onItemAction(.discard, item) }
        }
    }

    private func photoThumb(_ photoId: String, size: CGFloat) -> some View {
        GrowthThumbImage(id: photoId, growth: growth) {
            RoundedRectangle(cornerRadius: 2).fill(GBPalette.dark)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 2))
    }

    // MARK: - 드래그 (탭 경로 위에 얹는다)

    private func dragGesture(
        cell: CGFloat, step: CGFloat, layout: BagLayout,
        tiles: [(item: Equipment, p: BagPlacement)]
    ) -> some Gesture {
        DragGesture(minimumDistance: Self.dragThreshold, coordinateSpace: .named(Self.space))
            .onChanged { g in
                guard let entry = hitTile(g.startLocation, step: step, tiles: tiles) else { return }
                let rot = entry.item.id == selectedId ? placingRot : entry.p.rot
                if drag == nil {
                    Haptics.play(.light)
                }
                let origin = BagBoardMetrics(origin: .zero, cell: cell, step: step, rows: rows)
                    .originFromPoint(g.location, type: entry.item.type, rot: rot)
                var valid = false
                if let origin {
                    valid = UpHeroBag.checkPlacement(
                        occ: layout.occupancy, rows: rows, type: entry.item.type,
                        x: origin.x, y: origin.y, rot: rot, ignoreId: entry.item.id) == .ok
                }
                // 유효한 자리로 **바뀔 때만** 짧은 selection 햅틱. 프레임마다 울리면 안 된다.
                let prev = drag
                if valid, let origin,
                   prev?.valid != true || prev?.origin?.x != origin.x || prev?.origin?.y != origin.y {
                    Haptics.play(.selection)
                }
                drag = DragState(
                    itemId: entry.item.id, type: entry.item.type, rot: rot,
                    point: g.location, origin: origin, valid: valid, lifted: true)
            }
            .onEnded { g in
                guard let d = drag else { return }
                drag = nil
                guard let entry = tiles.first(where: { $0.item.id == d.itemId }) else { return }
                if let origin = d.origin, d.valid,
                   onDropAt(d.itemId, origin.x, origin.y, d.rot) {
                    Haptics.play(.medium)
                    SoundPlayer.shared.play(.equip)
                    UIAccessibility.post(
                        notification: .announcement,
                        argument: AppConfig.loc(
                            "\(entry.item.localizedDisplayName) 배치. \(synergyText(entry.item))"))
                    return
                }
                Haptics.play(.warning)
                SoundPlayer.shared.play(.cancel)
                beginSnapBack(entry.item, rot: d.rot, from: g.location, cell: cell, step: step)
            }
    }

    /// 드래그 시작점이 어느 타일 위였는지. 십자·빈 칸에서 시작한 드래그는 무시한다.
    private func hitTile(
        _ p: CGPoint, step: CGFloat, tiles: [(item: Equipment, p: BagPlacement)]
    ) -> (item: Equipment, p: BagPlacement)? {
        guard step > 0 else { return nil }
        let col = Int((p.x / step).rounded(.down))
        let vr = Int((p.y / step).rounded(.down))
        guard col >= 0, col < UpHeroBag.cols, vr >= 0, vr < rows else { return nil }
        let y = rows - 1 - vr
        return tiles.first { entry in
            UpHeroBag.footprint(type: entry.item.type, x: entry.p.x, y: entry.p.y, rot: entry.p.rot)
                .contains(BagCell(x: col, y: y))
        }
    }

    private func beginSnapBack(
        _ item: Equipment, rot: Int, from: CGPoint, cell: CGFloat, step: CGFloat
    ) {
        // reduced motion 이면 즉시 제자리 — 되돌아가는 궤적을 그리지 않는다.
        guard !reduceMotion, let p = UpHeroBag.readPlacement(item) else { return }
        let h = BagShape.extent(item.type, rot).h
        let to = CGPoint(
            x: CGFloat(p.x) * step,
            y: CGFloat(UpHeroBag.visualRow(bagY: p.y + h - 1, rows: rows)) * step)
        let start = CGPoint(x: from.x - cell / 2, y: from.y - cell / 2 - step)
        snap = SnapState(item: item, rot: rot, from: start, to: to, settled: false)
        DispatchQueue.main.async {
            if snap?.item.id == item.id { snap?.settled = true }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            if snap?.item.id == item.id { snap = nil }
        }
    }

    // MARK: - 파생

    /// 십자를 뺀 모든 가방 칸 — 실루엣 배경용(점유 여부와 무관).
    private func bagSilhouette() -> [BagCell] {
        var out: [BagCell] = []
        for y in 0..<rows {
            for x in 0..<UpHeroBag.cols where !UpHeroBag.isCrossCell(x: x, y: y) {
                out.append(BagCell(x: x, y: y))
            }
        }
        return out
    }

    private func emptyCells(layout: BagLayout) -> [BagCell] {
        var out: [BagCell] = []
        for y in 0..<rows {
            for x in 0..<UpHeroBag.cols
            where layout.occupancy[UpHeroBag.cellIndex(x: x, y: y)] == nil {
                out.append(BagCell(x: x, y: y))
            }
        }
        return out
    }

    private func ghostCells() -> [BagCell] {
        guard let d = drag, let origin = d.origin else { return [] }
        return UpHeroBag.footprint(type: d.type, x: origin.x, y: origin.y, rot: d.rot)
            .filter { $0.x >= 0 && $0.x < UpHeroBag.cols && $0.y >= 0 && $0.y < rows }
    }

    private func center(_ c: BagCell, cell: CGFloat, step: CGFloat) -> CGPoint {
        CGPoint(
            x: CGFloat(c.x) * step + cell / 2,
            y: CGFloat(UpHeroBag.visualRow(bagY: c.y, rows: rows)) * step + cell / 2)
    }

    private func tileLabel(_ item: Equipment, _ p: BagPlacement) -> String {
        // 조각은 각자 현지화되고 구분자만 붙인다 — 조립 문장을 카탈로그 키로 만들면
        // 언어마다 어순이 다른데도 한 벌만 남는다.
        "\(item.rarity.displayName) \(item.localizedDisplayName), "
            + "\(BagShape.label(item.type, p.rot)), \(synergyText(item))"
    }

    /// 아이템별 시너지 요약 문장 (SR 라벨·배치 announce 용).
    private func synergyText(_ item: Equipment) -> String {
        var parts: [String] = []
        for link in synergy.links where link.sourceId == item.id || link.partnerId == item.id {
            let stat = link.stat?.label ?? ""
            let n = link.amount ?? 0
            // S1 은 퍼센트라 값 쪽에서 기호까지 만든다 — 리터럴 "%" 를 카탈로그 키에 두면
            // "%%" 로 이스케이프돼 i18n 스캐너가 짝을 못 맞추고 매번 오탐을 낸다.
            let pct = "\(n)%"
            switch link.rule {
            case .s1: parts.append(AppConfig.loc("동류 \(stat) +\(pct)"))
            case .s2: parts.append(AppConfig.loc("무기 옆 장신구 치명 +\(n)"))
            case .s3: parts.append(AppConfig.loc("갑옷 옆 부적 체력 +\(n)"))
            case .s4: parts.append(AppConfig.loc("사진 부적 \(stat) +\(n)"))
            case .s6: parts.append(AppConfig.loc("합성 가능한 짝"))
            }
        }
        return parts.isEmpty ? AppConfig.loc("시너지 없음") : parts.joined(separator: ", ")
    }

    /// 앵커 델타 한 줄 — 어떤 앵커가 얼마를 받고 있는지.
    /// StatKey 는 `allCases` 로 훑는다 — Dictionary 순회 순서에 맡기면 매 렌더 순서가 바뀐다.
    private var anchorDeltaText: String {
        var chunks: [String] = []
        for slot in UpHeroBag.anchorOrder {
            guard let per = synergy.perAnchor[slot], !per.isEmpty else { continue }
            let deltas = StatKey.allCases.compactMap { key -> String? in
                guard let v = per[key], v != 0 else { return nil }
                return "+\(v) \(key.label)"
            }.joined(separator: " ")
            if deltas.isEmpty { continue }
            chunks.append("\(slotName(slot)) \(deltas)")
        }
        return chunks.joined(separator: "  ·  ")
    }

    private func slotIcon(_ slot: EquipSlot) -> PixelIconName {
        switch slot {
        case .weapon:    return .sword
        case .armor:     return .shield
        case .accessory: return .zap
        case .talisman:  return .moon
        }
    }

    private func slotName(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }
}
