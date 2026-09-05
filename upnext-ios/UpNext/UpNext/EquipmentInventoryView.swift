//
//  EquipmentInventoryView.swift
//  UpNext — Up Hero 가방 (격자 인벤토리).
//
//  웹 components/uphero/EquipmentInventory.tsx 1:1 미러. 화면은 위에서 아래로 고정
//  높이 4단이다:
//    서브헤더 48 / BagBoardView(남는 만큼) / 사진 부적 CTA 44 / BagTrayView 64 / BagActionBar 56.
//  보드는 **절대 스크롤 컨테이너 안에 두지 않는다** — 격자는 한 화면에 다 보여야
//  "무엇이 어디 있는지" 가 공간 기억으로 남는다. 대신 셀 크기가 44~56 사이에서 줄어든다.
//
//  탭(가방/사진/강화)과 시스템 액션시트는 제거했다. 강화는 선택 아이템의 액션바 버튼이고,
//  정렬된 강화 개요는 서브헤더 오른쪽 아이콘이 여는 보조 시트다. 판매·버리기 같은
//  비가역 동작은 그대로 GbConfirm 을 거친다.
//
//  상태 기계(플랜 §7): idle → selected(item) → placing(item, rot).
//   - 아이템 탭 = 선택 / 같은 아이템 재탭 = 회전(무기만)
//   - 빈 칸 탭 = 그 칸을 원점으로 배치
//   - 앵커 탭 = 착용 아이템 선택 (해제·강화)
//  드래그는 이 경로 위에 얹힌 것이고, 탭 경로가 항상 보장된 폴백이다.
//

import SwiftUI

/// "새로 들어온 타일" 표식 — 첫 탭 전까지 모서리 점.
///
/// 비영속이고 스토어에도 없다. 뷰 밖(타입 스코프)에 두는 이유: 가방 화면은 탐험 정산
/// 뒤에 다시 **마운트**되는데, @State 로 두면 매 진입마다 전부 새것이 되거나 전부
/// 헌것이 된다. 앱 세션 동안만 살아 있으면 충분하다.
@MainActor
enum BagNewMarks {
    static var seen = Set<String>()
    /// 첫 진입이 기존 아이템을 "본 것" 으로 채웠는지.
    static var primed = false
}

struct EquipmentInventoryView: View {
    /// 가방 화면 루트 좌표계 — 트레이 롱프레스 드래그가 보드 기하와 좌표를 맞추는 기준.
    static let rootSpace = "upheroBagRoot"
    private static let headerH: CGFloat = 48
    private static let photoCtaH: CGFloat = 44

    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var growth: GrowthStore
    let onBack: () -> Void

    // ── 선택 상태 기계 ──
    @State private var selectedId: String?
    @State private var selectedSlot: EquipSlot?
    @State private var placing = false
    @State private var placingRot = 0
    /// 모듈 Set 변경을 리렌더로 옮기는 트리거 (Set 자체는 SwiftUI 가 관찰하지 못한다).
    @State private var seenTick = 0
    /// 보드가 올려보낸 격자 기하 — 트레이 드래그의 좌표 해석에 쓴다.
    @State private var boardMetrics: BagBoardMetrics?

    @State private var statsOpen = false
    @State private var enhanceListOpen = false
    @State private var showTalismanPicker = false

    // ── 강화 연출 (기존 흐름 유지) ──
    @State private var enhancingItem: Equipment?
    @State private var enhanceOutcome: EnhanceRitualOutcome?
    /// 강화 의식이 끝난 뒤 띄울 결과 문구 (웹 결과 모달 대응 — iOS 는 토스트).
    @State private var enhanceMessage: String?
    /// 강화 확인 다이얼로그의 방지권 토글 2종. 다이얼로그를 열 때마다 기본 ON 으로
    /// 되돌린다 (웹 EquipmentInventory 와 동일) — 소모는 실제로 막아냈을 때만
    /// 일어나므로 켜둔 채로 두는 것이 유저에게 손해가 아니다.
    @State private var useDestroyGuard = true
    @State private var useDownGuard = true
    @State private var toast: String?
    // 05-modal-design — 판매/버리기(비가역)는 GbConfirm 재확인. 강화도 확인을 거친다
    // (성공률·소실/하락 위험·비용·방지권을 보여줘야 하므로 — 웹 GbConfirm 과 같은 자리).
    @State private var pendingAction: PendingEquipAction?

    private enum EquipConfirmKind { case sell, discard, enhance }
    private struct PendingEquipAction: Identifiable {
        let id = UUID()
        let kind: EquipConfirmKind
        let item: Equipment
    }

    // MARK: - 파생 상태

    private var gameLevel: Int { store.progress?.level ?? 1 }
    /// 보드 행 수는 렌더 시점에 계산한다 — 레벨업 직후에도 스토어와 어긋나지 않게.
    private var rows: Int { upHero.currentBagRows(gameLevel: gameLevel) }
    private var heroLevel: Int {
        UpHeroRules.getEffectiveHeroLevel(
            gameLevel: gameLevel, heroStartLevel: upHero.state.heroStartLevel)
    }
    private var inventory: [Equipment] { upHero.state.inventory }
    private var equipped: [EquipSlot: Equipment] { upHero.state.hero.equipped }

    private var layout: BagLayout {
        UpHeroBag.normalizeBagLayout(inventory, rows: rows).layout
    }
    private var synergy: BagSynergy {
        UpHeroBag.computeBagSynergy(equipped: equipped, inventory: inventory, rows: rows)
    }
    private var selectedItem: Equipment? {
        selectedId.flatMap { id in inventory.first { $0.id == id } }
    }
    private var selectedWorn: Equipment? { selectedSlot.flatMap { equipped[$0] } }

    /// 아직 부적으로 묶지 않은 사진 수 — 0 이면 CTA 를 잠근다.
    private var unboundPhotoCount: Int {
        growth.photoMetas.filter {
            !PhotoTalisman.isBound($0.id, inventory: inventory, equipped: equipped)
        }.count
    }

    private var newIds: Set<String> {
        _ = seenTick
        guard BagNewMarks.primed else { return [] }
        return Set(inventory.map(\.id)).subtracting(BagNewMarks.seen)
    }

    // MARK: - Body

    var body: some View {
        let lay = layout
        let syn = synergy
        ZStack {
            VStack(spacing: 0) {
                header
                BagBoardView(
                    rows: rows,
                    inventory: inventory,
                    equipped: equipped,
                    classType: upHero.state.hero.classType,
                    heroVariant: UpHeroRules.getHeroAppearanceVariant(level: heroLevel),
                    selectedId: selectedId,
                    selectedSlot: selectedSlot,
                    placingRot: placingRot,
                    synergy: syn,
                    newIds: newIds,
                    growth: growth,
                    onSelect: handleSelect,
                    onTapEmptyCell: handleTapEmptyCell,
                    onTapWorn: handleTapWorn,
                    onTapHero: { statsOpen = true },
                    onDropAt: { id, x, y, rot in commitPlace(id, x, y, rot, withSound: false) },
                    onItemAction: handleItemAction)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                photoTalismanCTA
                BagTrayView(
                    items: trayItems(lay),
                    suspendedIds: Set(lay.suspended.map(\.id)),
                    selectedId: selectedId,
                    synergy: syn,
                    growth: growth,
                    onSelect: { handleSelect($0) },
                    onDragToBoard: handleDragToBoard)
                BagActionBar(
                    item: selectedItem,
                    wornSlot: selectedWorn != nil ? selectedSlot : nil,
                    placing: placing,
                    trayCount: lay.unplaced.count,
                    rotatable: selectedItem.map { UpHeroBag.canRotate(type: $0.type) } ?? false,
                    onAction: { action in
                        if let worn = selectedWorn, selectedItem == nil {
                            handleItemAction(action, worn)
                        } else if let item = selectedItem {
                            handleItemAction(action, item)
                        }
                    },
                    onCancel: clearSelection)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(GBPalette.darkest)
            .coordinateSpace(name: Self.rootSpace)
            .onPreferenceChange(BagBoardMetricsKey.self) { boardMetrics = $0 }

            // 강화 의식 오버레이. 소리·결과 문구는 연출이 끝난 뒤에 — 2초 연출보다 먼저
            // 들리면 결과가 스포일된다 (웹 Phase 11b-fix 와 같은 이유).
            if let item = enhancingItem, let outcome = enhanceOutcome {
                EnhanceRitualOverlay(equipment: item, outcome: outcome) {
                    enhancingItem = nil
                    enhanceOutcome = nil
                    if outcome == .success {
                        Haptics.play(.success)
                        SoundPlayer.shared.play(.collect)
                    } else {
                        Haptics.play(.warning)
                        SoundPlayer.shared.play(.cancel)
                    }
                    if let msg = enhanceMessage { showToast(msg) }
                    enhanceMessage = nil
                }
                .transition(.opacity)
                .zIndex(50)
            }

            // 05-modal-design — 판매/버리기 재확인 (danger). 웹 EquipmentInventory.tsx 문구.
            if let pending = pendingAction, pending.kind != .enhance {
                GbConfirm(
                    title: pending.kind == .sell
                        ? "\(pending.item.localizedDisplayName) — 판매할까요?"
                        : "\(pending.item.localizedDisplayName) — 버릴까요?",
                    message: pending.kind == .sell
                        ? "+\(UpHeroRules.sellPrice[pending.item.rarity] ?? 0) 코인"
                        : "환급 없음 · 복구 불가",
                    confirmLabel: pending.kind == .sell ? "판매" : "버리기",
                    danger: true,
                    onConfirm: {
                        if pending.kind == .sell { upHero.sellItem(pending.item.id) }
                        else { upHero.discardItem(pending.item.id) }
                        clearSelection()
                        pendingAction = nil
                    },
                    onCancel: { pendingAction = nil })
                .transition(.opacity)
                .zIndex(60)
            }

            // 강화 재확인 — 성공률·소실/하락 위험·비용, 그리고 위험 구간에서만 방지권 토글.
            if let pending = pendingAction, pending.kind == .enhance {
                enhanceConfirm(pending.item)
                    .transition(.opacity)
                    .zIndex(60)
            }

            if let toast { toastView(toast) }
        }
        .fullScreenCover(isPresented: $showTalismanPicker) {
            PhotoTalismanPicker(onClose: { showTalismanPicker = false })
        }
        .sheet(isPresented: $statsOpen) { HeroStatPanel() }
        .sheet(isPresented: $enhanceListOpen) { enhanceListSheet }
        // 가방 화면이 열려 있는 동안은 하단 네비를 숨긴다(MainShell 이 이 신호를 본다).
        // onDisappear 가 뒤로 가기·탭 전환 양쪽을 덮으므로 플래그가 남지 않는다.
        .onAppear {
            upHero.setBagOpen(true)
            primeNewMarks()
        }
        .onDisappear { upHero.setBagOpen(false) }
    }

    /// 트레이 = 미배치 + 보류(좌표는 있지만 지금 rows 밖). 최신순.
    private func trayItems(_ lay: BagLayout) -> [Equipment] {
        inventory.filter { lay.statusById[$0.id] != .placed }.reversed()
    }

    // MARK: - 선택 / 배치

    private func clearSelection() {
        selectedId = nil
        selectedSlot = nil
        placing = false
    }

    /// 배치 커밋 — 성공하면 그 자리로, 실패하면 상태를 전혀 건드리지 않는다.
    /// gameLevel 을 반드시 넘긴다: 화면이 8행을 그리는데 판정만 5행이면 아래 행 드롭이
    /// 전부 거절된다.
    @discardableResult
    private func commitPlace(
        _ itemId: String, _ x: Int, _ y: Int, _ rot: Int, withSound: Bool
    ) -> Bool {
        let res = upHero.placeItem(itemId: itemId, x: x, y: y, rot: rot, gameLevel: gameLevel)
        guard res == .placed else {
            if withSound { SoundPlayer.shared.play(.cancel) }
            showToast(AppConfig.loc("그 자리에는 놓을 수 없어요"))
            return false
        }
        markSeen(itemId)
        placing = false
        if withSound { SoundPlayer.shared.play(.equip) }
        showToast(AppConfig.loc("배치했어요"))
        return true
    }

    /// 같은 아이템 재탭 = 회전. 이미 놓여 있으면 제자리 회전까지 시도한다.
    private func rotateSelected() {
        guard let item = selectedItem, UpHeroBag.canRotate(type: item.type) else { return }
        let next = (placingRot + 1) % 2
        if let p = UpHeroBag.readPlacement(item) {
            let res = upHero.placeItem(
                itemId: item.id, x: p.x, y: p.y, rot: next, gameLevel: gameLevel)
            guard res == .placed else {
                SoundPlayer.shared.play(.cancel)
                showToast(AppConfig.loc("그 자리에는 놓을 수 없어요"))
                return
            }
        }
        placingRot = next
        SoundPlayer.shared.play(.select)
    }

    private func handleSelect(_ id: String?) {
        guard let id else {
            clearSelection()
            return
        }
        if id == selectedId {
            rotateSelected()
            return
        }
        guard let item = inventory.first(where: { $0.id == id }) else { return }
        markSeen(id)
        selectedSlot = nil
        selectedId = id
        placingRot = UpHeroBag.normalizeRot(item.bagRot)
        placing = false
        SoundPlayer.shared.play(.select)
    }

    /// 빈 칸 탭 = 그 칸을 **덮는** 자리에 놓기 (웹 동일). 탭한 칸을 원점으로만 쓰면 1x2 세로
    /// 무기를 맨 윗줄에 탭했을 때 footprint 가 보드 밖으로 나가 거절된다.
    private func handleTapEmptyCell(_ x: Int, _ y: Int) {
        guard let id = selectedId else {
            clearSelection()
            return
        }
        guard let item = inventory.first(where: { $0.id == id }) else { return }
        guard let origin = UpHeroBag.firstValidOriginCovering(
            occ: layout.occupancy, rows: rows, type: item.type, rot: placingRot,
            x: x, y: y, ignoreId: item.id)
        else {
            SoundPlayer.shared.play(.cancel)
            showToast(AppConfig.loc("그 자리에는 놓을 수 없어요"))
            return
        }
        commitPlace(id, origin.x, origin.y, placingRot, withSound: true)
    }

    /// 트레이 롱프레스 드래그 — 보드 기하로 화면 좌표를 원점 칸으로 바꾼다.
    private func handleDragToBoard(_ itemId: String, _ point: CGPoint, _ rot: Int) {
        guard let item = inventory.first(where: { $0.id == itemId }),
              let origin = boardMetrics?.originFromPoint(point, type: item.type, rot: rot) else {
            SoundPlayer.shared.play(.cancel)
            showToast(AppConfig.loc("그 자리에는 놓을 수 없어요"))
            return
        }
        commitPlace(itemId, origin.x, origin.y, rot, withSound: true)
    }

    private func handleTapWorn(_ slot: EquipSlot) {
        guard equipped[slot] != nil else { return }
        selectedId = nil
        placing = false
        selectedSlot = slot
        SoundPlayer.shared.play(.select)
    }

    /// 액션바·보드 접근성 액션이 함께 쓰는 실행 경로.
    private func handleItemAction(_ action: BagItemAction, _ item: Equipment) {
        switch action {
        case .place:
            if selectedId != item.id { handleSelect(item.id) }
            placing = true
        case .rotate:
            if selectedId != item.id { handleSelect(item.id) }
            rotateSelected()
        case .equip:
            upHero.equipItem(item.id)
            clearSelection()
        case .unequip:
            upHero.unequipItem(item.type, gameLevel: gameLevel)
            clearSelection()
        case .enhance:
            beginEnhance(item)
        case .sell:
            pendingAction = PendingEquipAction(kind: .sell, item: item)
        case .discard:
            pendingAction = PendingEquipAction(kind: .discard, item: item)
        }
    }

    // MARK: - 새 아이템 표식

    private func primeNewMarks() {
        guard !BagNewMarks.primed else { return }
        for item in inventory { BagNewMarks.seen.insert(item.id) }
        BagNewMarks.primed = true
        seenTick += 1
    }

    private func markSeen(_ id: String) {
        guard !BagNewMarks.seen.contains(id) else { return }
        BagNewMarks.seen.insert(id)
        seenTick += 1
    }

    // MARK: - 헤더

    private var header: some View {
        HStack(spacing: 4) {
            Button(action: onBack) {
                HStack(spacing: 2) {
                    PixelIcon(.chevronLeft, size: 14, color: GBPalette.light)
                    Text(AppConfig.loc("뒤로"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                }
                .padding(.horizontal, 8)
                .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.unPress)
            Text(AppConfig.loc("가방"))
                .typography(.body)
                .foregroundStyle(GBPalette.lightest)
                .padding(.leading, 4)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                PixelIcon(.coins, size: 13, color: GBPalette.light)
                Text("\(upHero.state.coins)")
                    .typography(.caption)
                    .monospacedDigit()
                    .foregroundStyle(GBPalette.lightest)
            }
            Button {
                SoundPlayer.shared.play(.select)
                enhanceListOpen = true
            } label: {
                PixelIcon(.fire, size: 18, color: GBPalette.light)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.unPress)
            .accessibilityLabel(AppConfig.loc("강화 목록"))
        }
        .padding(.horizontal, 8)
        .frame(height: Self.headerH)
        .overlay(alignment: .bottom) { Rectangle().fill(GBPalette.dark).frame(height: 1) }
    }

    // MARK: - 사진 부적 CTA (트레이 머리줄)

    private var photoTalismanCTA: some View {
        let has = unboundPhotoCount > 0
        return Button { showTalismanPicker = true } label: {
            HStack(spacing: 8) {
                PixelIcon(.camera, size: 14, color: GBPalette.light)
                Text(has
                     ? AppConfig.loc("사진 부적 만들기")
                     : AppConfig.loc("바인딩할 수 있는 사진 없음"))
                    .typography(.caption)
                    .foregroundStyle(GBPalette.lightest)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(AppConfig.loc("\(PhotoTalisman.ritualCost) C · 랜덤"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(GBPalette.light)
            }
            .padding(.horizontal, 12)
            .frame(height: Self.photoCtaH)
            .frame(maxWidth: .infinity)
            .background(has ? GBPalette.dark.opacity(0.27) : Color.clear)
            .opacity(has ? 1 : 0.55)
        }
        .buttonStyle(.unPress)
        .disabled(!has)
        .overlay(alignment: .top) { Rectangle().fill(GBPalette.dark).frame(height: 1) }
    }

    // MARK: - 강화 목록 (보조 시트)

    /// 강화 가능한 아이템 (인벤 + 착용). 등급 내림차순 → 강화 레벨 내림차순.
    private var enhanceableItems: [Equipment] {
        var all = inventory
        for slot in UpHeroBag.anchorOrder {
            if let eq = equipped[slot] { all.append(eq) }
        }
        let rarityOrder: [Rarity: Int] = [.legend: 0, .unique: 1, .rare: 2, .normal: 3]
        return all
            .filter { ($0.enhanceLevel ?? 0) < UpHeroRules.maxEnhanceLevel }
            .sorted { a, b in
                let ra = rarityOrder[a.rarity] ?? 3
                let rb = rarityOrder[b.rarity] ?? 3
                if ra != rb { return ra < rb }
                return (a.enhanceLevel ?? 0) > (b.enhanceLevel ?? 0)
            }
    }

    private var enhanceListSheet: some View {
        VStack(spacing: 0) {
            HStack {
                Text(AppConfig.loc("강화 목록"))
                    .typography(.body)
                    .foregroundStyle(GBPalette.lightest)
                Spacer()
                Button(AppConfig.loc("닫기")) { enhanceListOpen = false }
                    .typography(.caption)
                    .foregroundStyle(GBPalette.light)
                    .frame(minWidth: 44, minHeight: 44)
                    .buttonStyle(.unPress)
            }
            .padding(.horizontal, 12)
            .frame(height: Self.headerH)
            .overlay(alignment: .bottom) { Rectangle().fill(GBPalette.dark).frame(height: 1) }

            ScrollView {
                if enhanceableItems.isEmpty {
                    Text(AppConfig.loc("강화할 수 있는 장비가 없어요"))
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                        .multilineTextAlignment(.center)
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(enhanceableItems) { item in enhanceRow(item) }
                    }
                    .padding(12)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GBPalette.darkest)
    }

    private func enhanceRow(_ item: Equipment) -> some View {
        let p = enhancePreview(item)
        let canAfford = upHero.state.coins >= p.cost
        let streak = item.enhanceFailStreak ?? 0
        return HStack(spacing: 8) {
            PixelIcon(PixelIconName.resolve(item.iconName), size: 18, color: item.rarity.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.localizedDisplayName)
                    .typography(.caption)
                    .foregroundStyle(GBPalette.lightest)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("+\(p.level) → +\(p.level + 1)")
                        .foregroundStyle(GBPalette.light)
                    Text("\(p.successPct)%")
                        .foregroundStyle(item.rarity.color)
                    if streak > 0 {
                        Text("pity ×\(streak)")
                            .foregroundStyle(Rarity.legend.color)
                    }
                    if p.safe {
                        Text(AppConfig.loc("안전")).foregroundStyle(GBPalette.lightest)
                    }
                    if p.equipped {
                        Text(AppConfig.loc("장착 중")).foregroundStyle(bagWarnColor)
                    }
                }
                .typography(.micro)
                .monospacedDigit()
            }
            Spacer(minLength: 0)
            Button {
                useDestroyGuard = true   // 열 때마다 기본 ON (웹 onEnhance)
                useDownGuard = true
                enhanceListOpen = false
                pendingAction = PendingEquipAction(kind: .enhance, item: item)
            } label: {
                Text(AppConfig.loc("강화 (−\(p.cost) 코인)"))
                    .typography(.caption)
                    .monospacedDigit()
                    .foregroundStyle(canAfford ? GBPalette.darkest : GBPalette.light)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(canAfford ? item.rarity.color : GBPalette.dark.opacity(0.67),
                                in: RoundedRectangle(cornerRadius: 4))
                    .opacity(canAfford ? 1 : 0.55)
            }
            .buttonStyle(.unPress)
            .disabled(!canAfford)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(GBPalette.dark.opacity(0.4), in: RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(item.rarity.color.opacity(BagRarityStyle.borderAlpha(item.rarity)),
                              lineWidth: 1))
    }

    // MARK: - 강화 확인 (웹 GbConfirm enhance 분기 1:1)

    /// 강화 확인 다이얼로그에 필요한 파생값. 확률은 전부 `enhanceOutcomeRates` 단일
    /// 출처에서 나온다 — 표시값과 실제 롤이 어긋나지 않도록 한 곳에서만 뽑는다.
    private struct EnhancePreview {
        let level: Int
        let cost: Int
        let successPct: Int
        let destroyPct: Int
        let downPct: Int
        /// 실패해도 소실·하락이 둘 다 0 인 완전 안전 구간인가 (현재 레벨 0..2).
        let safe: Bool
        let canDestroy: Bool
        let canDown: Bool
        let equipped: Bool
    }

    private func enhancePreview(_ item: Equipment) -> EnhancePreview {
        let level = item.enhanceLevel ?? 0
        let rate = UpHeroRules.enhanceSuccessRate(
            rarity: item.rarity, currentLevel: level,
            failStreak: item.enhanceFailStreak ?? 0)
        let rates = UpHeroRules.enhanceOutcomeRates(rarity: item.rarity, currentLevel: level)
        return EnhancePreview(
            level: level,
            cost: UpHeroRules.enhanceCost(rarity: item.rarity, currentLevel: level),
            successPct: Int((rate * 100).rounded()),
            destroyPct: Int((rates.destroy * 100).rounded()),
            downPct: Int((rates.down * 100).rounded()),
            safe: rates.destroy == 0 && rates.down == 0,
            canDestroy: rates.destroy > 0,
            canDown: rates.down > 0,
            equipped: EquipSlot.allCases.contains {
                upHero.state.hero.equipped[$0]?.id == item.id
            })
    }

    /// 강화 시도 — 확인 다이얼로그 표시. 방지권 토글은 열 때마다 기본 ON.
    private func beginEnhance(_ item: Equipment) {
        guard (item.enhanceLevel ?? 0) < UpHeroRules.maxEnhanceLevel else {
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
            return
        }
        useDestroyGuard = true
        useDownGuard = true
        pendingAction = PendingEquipAction(kind: .enhance, item: item)
    }

    /// 이번 시도에 실제로 걸리는 방지권. 웹 `guardArm` 과 같은 3중 조건 —
    /// 토글 ON + 보유 1 이상 + 그 결과가 나올 수 있는 레벨. 안전 구간에서는 걸지 않는다
    /// (걸어도 소모되지 않지만, 애초에 넘기지 않는 편이 계약이 분명하다).
    private func armedGuards(_ item: Equipment) -> EnhanceGuardArm {
        let level = item.enhanceLevel ?? 0
        return EnhanceGuardArm(
            destroy: useDestroyGuard
                && (upHero.state.destroyGuards ?? 0) > 0
                && UpHeroRules.canEnhanceDestroy(rarity: item.rarity, currentLevel: level),
            down: useDownGuard
                && (upHero.state.downGuards ?? 0) > 0
                && UpHeroRules.canEnhanceDowngrade(rarity: item.rarity, currentLevel: level))
    }

    @ViewBuilder
    private func enhanceConfirm(_ item: Equipment) -> some View {
        let p = enhancePreview(item)
        let destroyHeld = upHero.state.destroyGuards ?? 0
        let downHeld = upHero.state.downGuards ?? 0
        GbConfirm(
            title: "\(item.localizedDisplayName) 강화 (+\(p.level) → +\(p.level + 1))?",
            message: "\(enhanceBody(item, p))",
            onBackdropTap: { pendingAction = nil }
        ) { tint in
            VStack(alignment: .leading, spacing: 6) {
                // 해당 결과가 나올 수 있는 레벨에서만 노출한다. 안전 구간에서 권하면
                // 필요 없는 것을 파는 셈이라 아예 그리지 않는다.
                // 보유 0 이면 토글 대신 "어디서 구하는지" 안내만 보여준다.
                if p.canDestroy {
                    if destroyHeld > 0 {
                        guardToggle(kind: .destroy, owned: destroyHeld)
                    } else {
                        guardNoneHint(AppConfig.loc(
                            "\(AppConfig.loc("소실방지권")) 없음 · 보스와 탐험 상자에서 나와요"))
                    }
                }
                if p.canDown {
                    if downHeld > 0 {
                        guardToggle(kind: .down, owned: downHeld)
                    } else {
                        guardNoneHint(AppConfig.loc(
                            "\(AppConfig.loc("하락방지권")) 없음 · 상점에서 살 수 있어요"))
                    }
                }
                GbConfirmStandardFooter(
                    confirmLabel: "강화 시도",
                    cancelLabel: "취소",
                    tint: tint,
                    onConfirm: { runEnhance(item) },
                    onCancel: { pendingAction = nil })
                .padding(.top, 4)
            }
        }
    }

    /// 위험 안내는 정직하게 — 안전 구간에서는 "그대로예요" 라고 말하고, 위험 구간에서는
    /// 소실·하락을 **각각** 숫자로 준다. 하락을 유지와 같은 칸에 묶으면 기만이 된다.
    /// 방지권을 건 줄에는 "막힘" 태그를 붙인다 (웹 blockedTag).
    private func enhanceBody(_ item: Equipment, _ p: EnhancePreview) -> String {
        let armed = armedGuards(item)
        let blocked = AppConfig.loc("· 막힘")
        var lines: [String] = [AppConfig.loc("성공률 \(p.successPct)%")]
        if p.safe {
            lines.append(AppConfig.loc("이 단계는 실패해도 그대로예요"))
        } else {
            if p.canDestroy {
                lines.append(AppConfig.loc("실패 시 \(p.destroyPct)% 확률로 아이템 소실")
                    + (armed.destroy ? " \(blocked)" : ""))
            }
            if p.canDown {
                lines.append(AppConfig.loc("실패 시 \(p.downPct)% 확률로 한 단계 하락")
                    + (armed.down ? " \(blocked)" : ""))
            }
        }
        lines.append(AppConfig.loc("비용 \(p.cost) 코인 (보유 \(upHero.state.coins))"))
        if p.equipped {
            lines.append(AppConfig.loc("장착 중 — 소실 시 스탯이 즉시 하락합니다"))
        }
        return lines.joined(separator: "\n")
    }

    /// 방지권 사용 토글. 체크/원 아이콘은 SettingsView 라디오와 같은 결(박스 없음).
    private func guardToggle(kind: EnhanceGuardKind, owned: Int) -> some View {
        let on = kind == .destroy ? useDestroyGuard : useDownGuard
        let name = AppConfig.loc(kind == .destroy ? "소실방지권" : "하락방지권")
        return Button {
            if kind == .destroy { useDestroyGuard.toggle() } else { useDownGuard.toggle() }
            Haptics.play(.selection)
        } label: {
            HStack(spacing: 8) {
                PixelIcon(on ? .check : .circle, size: 14,
                          color: on ? Color.accentPrimary : GBPalette.light)
                Text(AppConfig.loc("\(name) 쓰기 (보유 \(owned))"))
                    .typography(.caption)
                    .foregroundStyle(on ? GBPalette.lightest : GBPalette.light)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func guardNoneHint(_ text: String) -> some View {
        Text(text)
            .typography(.micro)
            .foregroundStyle(GBPalette.light.opacity(0.8))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func runEnhance(_ item: Equipment) {
        let result = upHero.enhanceItem(item.id, guards: armedGuards(item))
        pendingAction = nil
        clearSelection()
        switch result {
        case .success:
            startRitual(item, .success, AppConfig.loc("강화 성공"))
        case .keep:
            startRitual(item, .keep, AppConfig.loc("강화 실패 — 아이템은 남았다"))
        case .down:
            startRitual(item, .keep, AppConfig.loc("한 단계 내려갔다"))
        case .guarded(_, let kind):
            startRitual(item, .keep, kind == .destroy
                ? AppConfig.loc("사라질 뻔했다")
                : AppConfig.loc("내려갈 뻔했다"))
        case .destroyed:
            startRitual(item, .destroyed, AppConfig.loc("아이템 소실"))
        case .coinShort(let need):
            failToast(AppConfig.loc("코인 부족 (\(need) 필요)"))
        case .maxed:
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
        case .notFound:
            failToast(AppConfig.loc("아이템을 찾을 수 없음"))
        }
    }

    private func startRitual(_ item: Equipment, _ outcome: EnhanceRitualOutcome, _ message: String) {
        enhancingItem = item
        enhanceOutcome = outcome
        enhanceMessage = message
    }

    /// 시도 자체가 성립하지 않은 경우 — 연출 없이 즉시 알린다 (웹과 동일).
    private func failToast(_ msg: String) {
        Haptics.play(.warning)
        SoundPlayer.shared.play(.cancel)
        showToast(msg)
    }

    // MARK: - 토스트 (ShopView 패턴 재사용)

    private func toastView(_ msg: String) -> some View {
        VStack {
            Spacer()
            Text(msg)
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color.bgElevated, in: Capsule())
                .padding(.bottom, CGFloat(UpHeroBag.trayH + UpHeroBag.actionH) + 12)
        }
        .allowsHitTesting(false)
    }

    private func showToast(_ msg: String) {
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if toast == msg { toast = nil } }
    }
}
