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
//  Phase 5-B (Track B) / 6-E (Track E) 통합:
//   - 강화: +20 상한, 시도당 방지권 패널(GbConfirmPanel, 기본 OFF), 밴드 힌트·연출(2.0/2.6/3.4s),
//     칭호 토스트, 사진 부적 제외. 강화 개요 시트는 장착 마지막 정렬·슬롯 필터·"장착 중으로" 점프.
//   - 합성: 액션바 "합성" 으로 들어가는 재료 고르기 모드 (보드·트레이에서 같은 등급 3개,
//     사진 부적·전설·등급 불일치는 흐리게 + 토스트), GbConfirm 확인 + 결과 카드.
//   - 판매가 = 등급 + 드롭 층 + 강화 단계 (UpHeroStore.sellPrice 단일 출처).
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
    /// Phase 6-E — 강화 개요 시트의 슬롯 필터 (nil = 전체). 웹 slotFilter.
    @State private var slotFilter: EquipSlot?

    // ── 강화 연출 (Track B 흐름) ──
    @State private var enhancingItem: Equipment?
    @State private var enhanceOutcome: EnhanceRitualOutcome?
    /// Phase 5-B — 진행 중인 강화 연출의 밴드 (enhanceRitualBand(targetLevel)).
    @State private var enhanceBand = 0
    /// 강화 의식이 끝난 뒤 띄울 결과 문구 (웹 결과 모달 대응 — iOS 는 토스트).
    /// Phase 5-B — 각성/초월 타이틀 + 소모된 방지권 한 줄씩이 여기 실린다.
    @State private var enhanceMessage: String?
    /// 강화 확인 다이얼로그의 방지권 토글 2종. Phase 5-B — 기본 OFF 이고 다이얼로그를
    /// 열 때마다 OFF 로 되돌린다 (웹 EquipmentInventory 와 동일). 시도당 소모라 켜둔 채
    /// 잊으면 매 시도 1장씩 조용히 나가므로, 명시적 선택만 받는다.
    @State private var useDestroyGuard = false
    @State private var useDownGuard = false
    @State private var toast: String?
    // 05-modal-design — 판매/버리기(비가역)는 GbConfirm 재확인. 강화도 확인을 거친다
    // (성공률·소실/하락 위험·비용·방지권을 보여줘야 하므로 — 웹 GbConfirm 과 같은 자리).
    @State private var pendingAction: PendingEquipAction?

    // ── Phase 6-E 합성 (Track E) ──
    /// 합성 모드 + 고른 재료 id (최대 3). 웹 synthMode / synthPicks.
    @State private var synthMode = false
    @State private var synthPicks: [String] = []
    /// 합성 확인 대기 재료 (GbConfirm). 웹 PendingAction kind "synth".
    @State private var pendingSynth: [Equipment]?
    /// 합성 결과 (SynthesisResultModal 대응).
    @State private var synthResult: Equipment?

    private enum EquipConfirmKind { case sell, discard, enhance }
    private struct PendingEquipAction: Identifiable {
        let id = UUID()
        let kind: EquipConfirmKind
        let item: Equipment
    }

    // MARK: - 파생 상태

    /// 보드 행 수는 렌더 시점에 계산한다 — 상점에서 행을 사면 즉시 반영되게.
    private var rows: Int { upHero.currentBagRows() }
    /// Phase 2-A — 영웅 레벨은 heroXp 풀 기준 (UpHeroStore.heroLevel).
    private var heroLevel: Int { upHero.heroLevel }
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

    private var equippedIds: Set<String> {
        Set(equipped.values.map(\.id))
    }

    // MARK: - Body

    var body: some View {
        let lay = layout
        let syn = synergy
        let picked = Set(synthPicks)
        let dimmed = synthDimmedIds
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
                    pickedIds: picked,
                    dimmedIds: dimmed,
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
                    pickedIds: picked,
                    dimmedIds: dimmed,
                    growth: growth,
                    onSelect: { handleSelect($0) },
                    onDragToBoard: handleDragToBoard)
                BagActionBar(
                    item: selectedItem,
                    wornSlot: selectedWorn != nil ? selectedSlot : nil,
                    placing: placing,
                    trayCount: lay.unplaced.count,
                    rotatable: selectedItem.map { UpHeroBag.canRotate(type: $0.type) } ?? false,
                    synthMode: synthMode,
                    synthCount: synthPickItems.count,
                    canStartSynth: canStartSynth,
                    onAction: { action in
                        if action == .synth {
                            enterSynthMode(first: selectedItem)
                        } else if let worn = selectedWorn, selectedItem == nil {
                            handleItemAction(action, worn)
                        } else if let item = selectedItem {
                            handleItemAction(action, item)
                        }
                    },
                    onCancel: clearSelection,
                    onSynthConfirm: confirmSynth,
                    onSynthCancel: exitSynthMode)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(GBPalette.darkest)
            .coordinateSpace(name: Self.rootSpace)
            .onPreferenceChange(BagBoardMetricsKey.self) { boardMetrics = $0 }

            // 강화 의식 오버레이. 소리·결과 문구는 연출이 끝난 뒤에 — 연출보다 먼저
            // 들리면 결과가 스포일된다 (웹 Phase 11b-fix 와 같은 이유).
            if let item = enhancingItem, let outcome = enhanceOutcome {
                EnhanceRitualOverlay(equipment: item, outcome: outcome, band: enhanceBand) {
                    enhancingItem = nil
                    enhanceOutcome = nil
                    // Phase 5-B — band 0 은 기존 그대로, band 1/2 는 전용 큐 + 햅틱 (웹 onDone).
                    switch outcome {
                    case .success:
                        let cue: SoundName = enhanceBand == 2 ? .enhanceSuccessMax
                            : enhanceBand == 1 ? .enhanceSuccessHigh : .collect
                        Haptics.play(cue.enhanceHapticIntent ?? .success)
                        SoundPlayer.shared.play(cue)
                    case .destroyed:
                        if enhanceBand >= 1 {
                            Haptics.play(SoundName.enhanceShatter.enhanceHapticIntent ?? .heavy)
                            SoundPlayer.shared.play(.enhanceShatter)
                        } else {
                            Haptics.play(.warning)
                            SoundPlayer.shared.play(.cancel)
                        }
                    case .keep:
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
            // 판매가 = 등급 + 드롭 층 + 강화 단계 (Track E, UpHeroStore.sellPrice 단일 출처).
            if let pending = pendingAction, pending.kind != .enhance {
                GbConfirm(
                    title: pending.kind == .sell
                        ? "\(pending.item.localizedDisplayName): 판매할까요?"
                        : "\(pending.item.localizedDisplayName): 버릴까요?",
                    message: pending.kind == .sell
                        ? "+\(UpHeroStore.sellPrice(pending.item)) 코인"
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

            // Phase 6-E — 합성 확인 (웹 GbConfirm synth 분기).
            if let items = pendingSynth, let first = items.first,
               let next = UpHeroRules.nextRarity[first.rarity] {
                GbConfirm(
                    title: LocalizedStringKey(AppConfig.loc("\(first.rarity.displayName) 장비 3개를 합성할까요?")),
                    message: LocalizedStringKey(AppConfig.loc(
                        "\(next.displayName) 장비 1개가 나와요. 강화 단계는 사라지고 층수는 가장 높은 것을 따라가요")),
                    confirmLabel: "합성",
                    onConfirm: { runSynthesis(items) },
                    onCancel: { pendingSynth = nil })
                .transition(.opacity)
                .zIndex(60)
            }

            // Phase 6-E — 합성 결과 (웹 SynthesisResultModal). 카드 한 장 + 확인.
            if let result = synthResult {
                GbConfirm(title: "합성 완료", onBackdropTap: { synthResult = nil }) { tint in
                    VStack(spacing: 12) {
                        EquipmentSlotCard(item: result, slot: result.type, onAction: nil)
                            .frame(maxWidth: 200)
                        GbConfirmStandardFooter(
                            confirmLabel: "확인", cancelLabel: "취소", tint: tint,
                            showCancel: false,
                            onConfirm: { synthResult = nil }, onCancel: { synthResult = nil })
                    }
                }
                .transition(.opacity)
                .zIndex(60)
            }

            // 강화 재확인 — 성공률·소실/하락 위험·비용, 그리고 위험 구간에서만 방지권 패널.
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
    /// 판정 행 수는 스토어의 `currentBagRows()` 하나뿐이라 화면과 어긋날 수 없다.
    @discardableResult
    private func commitPlace(
        _ itemId: String, _ x: Int, _ y: Int, _ rot: Int, withSound: Bool
    ) -> Bool {
        let res = upHero.placeItem(itemId: itemId, x: x, y: y, rot: rot)
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
            let res = upHero.placeItem(itemId: item.id, x: p.x, y: p.y, rot: next)
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
        if synthMode {
            // 합성 모드에서는 탭이 전부 재료 토글이다 (빈 칸 탭은 무시).
            guard let id, let item = inventory.first(where: { $0.id == id }) else { return }
            toggleSynthPick(item)
            return
        }
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
        if synthMode { return }
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
        if synthMode { return }
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
            upHero.unequipItem(item.type)
            clearSelection()
        case .enhance:
            beginEnhance(item)
        case .sell:
            pendingAction = PendingEquipAction(kind: .sell, item: item)
        case .discard:
            pendingAction = PendingEquipAction(kind: .discard, item: item)
        case .synth:
            enterSynthMode(first: item)
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

    // MARK: - Phase 6-E — 합성 모드 (웹 synthMode / onSynthPick / executePending synth)

    /// 합성 재료 후보인가 — 사진 부적·전설은 절대 아니다.
    private func synthEligible(_ item: Equipment) -> Bool {
        item.photoId == nil && UpHeroRules.nextRarity[item.rarity] != nil
    }

    /// 재료 후보(사진·전설 제외)가 3개 이상일 때만 유휴 바에 합성 진입을 보인다.
    private var canStartSynth: Bool {
        inventory.filter(synthEligible).count >= UpHeroRules.synthesisInputCount
    }

    private var synthPickItems: [Equipment] {
        synthPicks.compactMap { id in inventory.first { $0.id == id } }
    }

    /// 합성 모드에서 흐리게 그릴 타일 — 후보가 아니거나 첫 재료와 등급이 다른 것.
    private var synthDimmedIds: Set<String> {
        guard synthMode else { return [] }
        let picked = Set(synthPicks)
        let first = synthPickItems.first
        var out = Set<String>()
        for item in inventory where !picked.contains(item.id) {
            let eligible = synthEligible(item) && (first == nil || first?.rarity == item.rarity)
            if !eligible { out.insert(item.id) }
        }
        return out
    }

    /// 합성 모드 진입 — 선택한 아이템이 첫 재료가 된다 (후보가 아니면 빈손으로 시작).
    private func enterSynthMode(first: Equipment?) {
        synthMode = true
        if let first, synthEligible(first) { synthPicks = [first.id] } else { synthPicks = [] }
        clearSelection()
        Haptics.play(.selection)
        SoundPlayer.shared.play(.select)
    }

    private func exitSynthMode() {
        synthMode = false
        synthPicks = []
    }

    /// 합성 재료 토글. 사진 부적·legend·등급 불일치는 토스트로 거절 (웹 onSynthPick).
    private func toggleSynthPick(_ item: Equipment) {
        if let idx = synthPicks.firstIndex(of: item.id) {
            synthPicks.remove(at: idx)
            Haptics.play(.selection)
            SoundPlayer.shared.play(.select)
            return
        }
        if let reason = synthBlockReason(item) {
            failToast(reason)
            return
        }
        guard synthPicks.count < UpHeroRules.synthesisInputCount else { return }
        synthPicks.append(item.id)
        markSeen(item.id)
        Haptics.play(.selection)
        SoundPlayer.shared.play(.select)
    }

    /// 재료가 될 수 없는 이유 (nil = 가능). 첫 재료의 등급이 기준이다.
    private func synthBlockReason(_ item: Equipment) -> String? {
        if item.photoId != nil { return AppConfig.loc("사진 부적은 합성할 수 없어요") }
        if UpHeroRules.nextRarity[item.rarity] == nil { return AppConfig.loc("전설 장비는 합성할 수 없어요") }
        if let first = synthPickItems.first, first.rarity != item.rarity {
            return AppConfig.loc("같은 등급끼리만 합성할 수 있어요")
        }
        return nil
    }

    /// 액션바 "합성 n/3" — 3개가 모였을 때만 GbConfirm 으로.
    private func confirmSynth() {
        let items = synthPickItems
        guard items.count == UpHeroRules.synthesisInputCount else { return }
        pendingSynth = items
    }

    private func runSynthesis(_ items: [Equipment]) {
        pendingSynth = nil
        switch upHero.synthesizeItems(items.map(\.id)) {
        case .ok(let item):
            exitSynthMode()
            Haptics.play(.success)
            SoundPlayer.shared.play(.collect)
            synthResult = item
            showToast(AppConfig.loc("\(item.localizedDisplayName) 획득"))
        case .fail(let reason):
            switch reason {
            case .rarity: failToast(AppConfig.loc("같은 등급끼리만 합성할 수 있어요"))
            case .legend: failToast(AppConfig.loc("전설 장비는 합성할 수 없어요"))
            case .photo: failToast(AppConfig.loc("사진 부적은 합성할 수 없어요"))
            case .count, .notFound: failToast(AppConfig.loc("아이템을 찾을 수 없음"))
            }
            synthPicks = []
        }
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

    /// 강화 가능한 아이템 (인벤 + 착용). Phase 5-B — 사진 부적(photoId) 제외 (재의식 경로만).
    /// Phase 6-E — 정렬: 장착 중 마지막 → 등급 (legend 먼저) → 강화 단계 내림차순. 슬롯 필터.
    private var enhanceableItems: [Equipment] {
        var all = inventory
        for slot in UpHeroBag.anchorOrder {
            if let eq = equipped[slot] { all.append(eq) }
        }
        let worn = equippedIds
        let rarityOrder: [Rarity: Int] = [.legend: 0, .unique: 1, .rare: 2, .normal: 3]
        return all
            .filter {
                $0.photoId == nil
                    && ($0.enhanceLevel ?? 0) < UpHeroRules.maxEnhanceLevel
                    && (slotFilter == nil || $0.type == slotFilter)
            }
            .sorted { a, b in
                let ea = worn.contains(a.id) ? 1 : 0
                let eb = worn.contains(b.id) ? 1 : 0
                if ea != eb { return ea < eb }
                let ra = rarityOrder[a.rarity] ?? 3
                let rb = rarityOrder[b.rarity] ?? 3
                if ra != rb { return ra < rb }
                return (a.enhanceLevel ?? 0) > (b.enhanceLevel ?? 0)
            }
    }

    private var enhanceListSheet: some View {
        let items = enhanceableItems
        let worn = equippedIds
        let firstEquippedId = items.first { worn.contains($0.id) }?.id
        return VStack(spacing: 0) {
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

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(AppConfig.loc("강화 (+\(UpHeroRules.maxEnhanceLevel) 까지)"))
                            .typography(.caption)
                            .foregroundStyle(GBPalette.lightest)
                        // Phase 6-E — 슬롯 필터 + "장착 중으로" 점프.
                        HStack(alignment: .top, spacing: 8) {
                            SlotFilterChips(selection: $slotFilter)
                            if firstEquippedId != nil {
                                Button(AppConfig.loc("장착 중으로")) {
                                    withAnimation { proxy.scrollTo("eq-enhance-equipped", anchor: .top) }
                                }
                                .typography(.micro)
                                .foregroundStyle(GBPalette.lightest)
                                .padding(.horizontal, 8)
                                .frame(minHeight: 32)
                                .background(GBPalette.dark.opacity(0.4),
                                            in: RoundedRectangle(cornerRadius: 6))
                                .buttonStyle(.plain)
                            }
                        }
                        if items.isEmpty {
                            Text(AppConfig.loc("강화할 수 있는 장비가 없어요"))
                                .typography(.caption)
                                .foregroundStyle(GBPalette.light)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 40)
                        } else {
                            if let first = items.first, !worn.contains(first.id) {
                                Text(AppConfig.loc("가방"))
                                    .typography(.micro)
                                    .foregroundStyle(GBPalette.light)
                            }
                            VStack(spacing: 6) {
                                ForEach(items) { item in
                                    if item.id == firstEquippedId {
                                        Text(AppConfig.loc("장착 중"))
                                            .typography(.micro)
                                            .foregroundStyle(GBPalette.light)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(.top, 8)
                                            .id("eq-enhance-equipped")
                                    }
                                    enhanceRow(item, equipped: worn.contains(item.id))
                                }
                            }
                        }
                    }
                    .padding(12)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GBPalette.darkest)
    }

    private func enhanceRow(_ item: Equipment, equipped isEquipped: Bool) -> some View {
        let p = enhancePreview(item)
        let canAfford = upHero.state.coins >= p.cost
        let streak = item.enhanceFailStreak ?? 0
        return HStack(spacing: 8) {
            PixelIcon(PixelIconName.resolve(item.iconName), size: 18, color: item.rarity.color)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(item.localizedDisplayName)
                        .typography(.caption)
                        .foregroundStyle(GBPalette.lightest)
                        .lineLimit(1)
                    // Phase 5-B — 칭호 칩 (각성/초월).
                    if let title = UpHeroRules.enhanceTitle(level: p.level) {
                        let titleText = AppConfig.loc(String.LocalizationValue(EnhanceChipTone.titleKey(title)))
                        Text(titleText)
                            .typography(.micro)
                            .foregroundStyle(GBPalette.lightest)
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(GBPalette.lightest.opacity(0.13), in: RoundedRectangle(cornerRadius: 3))
                            .accessibilityLabel(AppConfig.loc("칭호 \(titleText)"))
                    }
                }
                HStack(spacing: 6) {
                    Text("+\(p.level) → +\(p.level + 1)")
                        .foregroundStyle(GBPalette.light)
                    Text("\(p.successPct)%")
                        .foregroundStyle(item.rarity.color)
                    if streak > 0 {
                        Text("pity ×\(streak)")
                            .foregroundStyle(Rarity.legend.color)
                    }
                    // Phase 15 안전 배지 / Phase 5-B 밴드 배지 (웹 enhanceBadge).
                    if p.safe {
                        Text(AppConfig.loc("안전")).foregroundStyle(GBPalette.lightest)
                    } else if let badge = enhanceBandBadge(item) {
                        Text(badge).foregroundStyle(
                            p.level >= UpHeroRules.enhanceTitleAwakenedLevel ? bagWarnColor : GBPalette.light)
                    } else {
                        Text(AppConfig.loc("보존 \(100 - p.destroyPct - p.downPct)%"))
                            .foregroundStyle(GBPalette.light)
                    }
                    if isEquipped {
                        Text(AppConfig.loc("장착 중")).foregroundStyle(bagWarnColor)
                    }
                }
                .typography(.micro)
                .monospacedDigit()
            }
            Spacer(minLength: 0)
            Button {
                enhanceListOpen = false
                beginEnhance(item)
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

    /// 강화 시도 — 확인 다이얼로그 표시. Phase 5-B — 방지권 토글은 열 때마다 OFF (시도당 소모).
    /// 사진 부적(photoId) 은 제외 — 부적은 재의식(+10 상한) 경로만 쓴다.
    private func beginEnhance(_ item: Equipment) {
        guard item.photoId == nil else {
            failToast(AppConfig.loc("사진 부적은 재의식으로만 강화할 수 있어요"))
            return
        }
        guard (item.enhanceLevel ?? 0) < UpHeroRules.maxEnhanceLevel else {
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
            return
        }
        useDestroyGuard = false
        useDownGuard = false
        pendingAction = PendingEquipAction(kind: .enhance, item: item)
    }

    /// 이번 시도에 실제로 걸리는(arm 되는) 방지권 — 표시용. 토글 ON + 보유 1 이상 +
    /// 그 결과가 나올 수 있는 레벨. 스토어가 같은 3중 조건을 한 곳에서 다시 검증하므로
    /// 실제 호출에는 토글 값을 그대로 넘긴다 (웹 Phase 5-B 와 동일).
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

    /// Phase 5-B — 밴드 배지 (웹 enhanceBadge). 10..14 "실패 시 한 단계 하락",
    /// 15..19 "소실 N%". 그 외 nil (안전/하위 밴드는 확인 다이얼로그가 숫자로 말한다).
    private func enhanceBandBadge(_ item: Equipment) -> String? {
        let level = item.enhanceLevel ?? 0
        if level >= UpHeroRules.enhanceTitleAwakenedLevel {
            let pct = Int((UpHeroRules.enhanceOutcomeRates(
                rarity: item.rarity, currentLevel: level).destroy * 100).rounded())
            let pctText = "\(pct)%"
            return AppConfig.loc("소실 \(pctText)")
        }
        if level >= UpHeroRules.enhanceHighBandStart {
            return AppConfig.loc("실패 시 한 단계 하락")
        }
        return nil
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
            VStack(alignment: .leading, spacing: 8) {
                // Phase 5-B — 방지권 패널 2종 (웹 sections 슬롯). 안전 구간(소실·하락 0)
                // 에서는 아예 그리지 않는다. 그 외에는 둘 다 그리되, 불가능한 쪽은
                // 회색 NA 로 남긴다.
                if !p.safe {
                    Text(AppConfig.loc("방지권"))
                        .typography(.micro)
                        .foregroundStyle(GBPalette.light)
                    guardPanel(kind: .destroy, held: destroyHeld,
                               armed: useDestroyGuard, applicable: p.canDestroy)
                    guardPanel(kind: .down, held: downHeld,
                               armed: useDownGuard, applicable: p.canDown)
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
    /// 소실·하락을 **각각** 숫자로 준다 (그 결과가 가능한 줄만). 하락을 유지와 같은 칸에
    /// 묶으면 기만이 된다. 방지권을 건 줄에는 "막힘" 태그를 붙인다 (웹 blockedTag).
    /// Phase 5-B — 밴드 힌트(10..14 / 15..19), 방지권이 걸리면 "이번 시도: 코인 + 방지권" 요약.
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
            if p.level >= UpHeroRules.enhanceTitleAwakenedLevel {
                lines.append(AppConfig.loc(
                    "+15 이후 실패는 주로 소실이고, 아니면 +14로 내려가요. 두 방지권을 모두 걸어야 제자리에서 버텨요"))
            } else if p.level >= UpHeroRules.enhanceHighBandStart {
                lines.append(AppConfig.loc(
                    "+10 이후 실패는 한 단계 내려가요. +9로 내려가면 소실 위험이 다시 생겨요"))
            }
        }
        lines.append(AppConfig.loc("비용 \(p.cost) 코인 (보유 \(upHero.state.coins))"))
        var wards: [String] = []
        if armed.destroy { wards.append(AppConfig.loc("소실방지권")) }
        if armed.down { wards.append(AppConfig.loc("하락방지권")) }
        if !wards.isEmpty {
            lines.append(AppConfig.loc("이번 시도: \(p.cost) 코인 + \(wards.joined(separator: " + "))"))
        }
        if p.equipped {
            lines.append(AppConfig.loc("장착 중: 소실 시 스탯이 즉시 하락합니다"))
        }
        return lines.joined(separator: "\n")
    }

    /// Phase 5-B — 방지권 패널 (웹 GuardPanel). GbConfirmPanel 위에 올라가며, 걸리면
    /// (armed && applicable && held > 0) 라임 글로우.
    ///   - applicable=false : 이 레벨에서 그 결과가 날 수 없다 (소실 0 인 +10..+14 등).
    ///                        회색 NA 문구만, 버튼 없음. 걸어도 소모되지 않는다는 뜻.
    ///   - held 0           : 구하는 경로를 한 줄로.
    ///   - 그 외             : 40pt 토글 + "켜면 이번 시도에 1장 (결과 무관)" 마이크로 힌트.
    private func guardPanel(kind: EnhanceGuardKind, held: Int, armed: Bool, applicable: Bool) -> some View {
        let name = AppConfig.loc(kind == .destroy ? "소실방지권" : "하락방지권")
        let active = armed && applicable && held > 0
        return GbConfirmPanel(active: active, title: name) {
            Text(AppConfig.loc("보유 \(held)"))
                .typography(.micro).monospacedDigit()
                .foregroundStyle(GBPalette.lightest)
                .padding(.horizontal, 6).padding(.vertical, 1)
                .background(GBPalette.darkest, in: RoundedRectangle(cornerRadius: 4))
        } content: {
            if !applicable {
                Text(AppConfig.loc(kind == .destroy
                    ? "이 단계에서는 소실이 없어요" : "이 단계에서는 하락이 없어요"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light.opacity(0.5))
                    .padding(.top, 2)
            } else if held <= 0 {
                guardNoneHint(kind == .destroy
                    ? AppConfig.loc("\(name) 없음 · 보스와 탐험 상자에서 나와요")
                    : AppConfig.loc("\(name) 없음 · 상점에서 살 수 있어요"))
                .padding(.top, 2)
            } else {
                guardToggle(kind: kind, on: armed)
                Text(AppConfig.loc("켜면 이번 시도에 1장을 씁니다. 결과와 상관없이 소모돼요"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// 방지권 사용 토글. 체크/원 아이콘은 SettingsView 라디오와 같은 결(박스 없음).
    private func guardToggle(kind: EnhanceGuardKind, on: Bool) -> some View {
        Button {
            if kind == .destroy { useDestroyGuard.toggle() } else { useDownGuard.toggle() }
            Haptics.play(.selection)
        } label: {
            HStack(spacing: 8) {
                PixelIcon(on ? .check : .circle, size: 14,
                          color: on ? Color.accentPrimary : GBPalette.light)
                Text(AppConfig.loc("이번 시도에 쓰기"))
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
        // Phase 5-B — 토글 값을 그대로 넘긴다. 보유 0 / 그 결과가 불가능한 레벨 검증은
        //   스토어가 한 곳에서 한다 (UI 게이트는 안내용).
        let lvl = item.enhanceLevel ?? 0
        let result = upHero.enhanceItem(
            item.id, guards: EnhanceGuardArm(destroy: useDestroyGuard, down: useDownGuard))
        pendingAction = nil
        clearSelection()
        let band = UpHeroRules.enhanceRitualBand(targetLevel: lvl + 1)
        switch result {
        case .success(let newItem, _, let spent):
            // 각성(+15..+19) / 초월(+20) 타이틀 (웹 awakenTitle / transcendTitle).
            let newLevel = newItem.enhanceLevel ?? lvl + 1
            let title = newLevel >= UpHeroRules.enhanceTitleTranscendedLevel
                ? AppConfig.loc("초월 강화 성공")
                : newLevel >= UpHeroRules.enhanceTitleAwakenedLevel
                    ? AppConfig.loc("각성 강화 성공")
                    : AppConfig.loc("강화 성공")
            startRitual(item, .success, band, withSpent(title, spent))
        case .keep(_, let spent):
            startRitual(item, .keep, band,
                        withSpent(AppConfig.loc("강화 실패: 아이템은 남았다"), spent))
        case .down(_, _, let spent):
            startRitual(item, .keep, band, withSpent(AppConfig.loc("한 단계 내려갔다"), spent))
        case .guarded(_, let kind, let spent):
            startRitual(item, .keep, band, withSpent(kind == .destroy
                ? AppConfig.loc("사라질 뻔했다")
                : AppConfig.loc("내려갈 뻔했다"), spent))
        case .destroyed(_, let spent):
            startRitual(item, .destroyed, band, withSpent(AppConfig.loc("아이템 소실"), spent))
        case .coinShort(let need):
            failToast(AppConfig.loc("코인 부족 (\(need) 필요)"))
        case .maxed:
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
        case .notFound:
            failToast(AppConfig.loc("아이템을 찾을 수 없음"))
        }
    }

    /// Phase 5-B — 소모된 방지권을 한 줄씩 덧붙인다 (웹 EnhanceResultModal spent.line).
    /// 시도당 소모라 어떤 결과에서도 나올 수 있다.
    private func withSpent(_ message: String, _ spent: EnhanceGuardSpend) -> String {
        var lines = [message]
        let destroyName = AppConfig.loc("소실방지권")
        let downName = AppConfig.loc("하락방지권")
        if spent.destroy > 0 { lines.append(AppConfig.loc("\(destroyName) 1장 사용")) }
        if spent.down > 0 { lines.append(AppConfig.loc("\(downName) 1장 사용")) }
        return lines.joined(separator: "\n")
    }

    private func startRitual(
        _ item: Equipment, _ outcome: EnhanceRitualOutcome, _ band: Int, _ message: String
    ) {
        enhancingItem = item
        enhanceOutcome = outcome
        enhanceBand = band
        enhanceMessage = message
        // Phase 5-B — band >= 1 은 시작 시 충전음 (결과와 무관해 스포일 아님).
        if band >= 1 {
            Haptics.play(SoundName.enhanceCharge.enhanceHapticIntent ?? .light)
            SoundPlayer.shared.play(.enhanceCharge)
        }
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

// MARK: - 슬롯 카드 (rarity glow + stats summary) — Track E 카드 (합성 결과 등 카드가 그려지는 곳)

struct EquipmentSlotCard: View {
    let item: Equipment
    let slot: EquipSlot?
    let onAction: (() -> Void)?
    /// Phase 6-E — 합성 재료로 고른 상태 (선택 상태는 보더 예외 규칙).
    var selected: Bool = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    // 칩 3개(등급·슬롯·+N)가 3열 카드에 나란히 설 때 SwiftUI 가 슬롯 칩을
                    // 두 줄("방어\n구")로 접던 문제 — 칩은 항상 한 줄, 고유 폭을 고정한다.
                    Text(item.rarity.displayName)
                        .typography(.micro)
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(item.rarity.color, in: Capsule())
                    // Phase 6-E — 슬롯 칩 (텍스트만, GB.dark 배경 단계). 웹 slot chip.
                    Text(slotChipLabel)
                        .typography(.micro)
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .foregroundStyle(GBPalette.light)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(GBPalette.dark, in: RoundedRectangle(cornerRadius: 3))
                    if let lvl = item.enhanceLevel, lvl > 0 {
                        // Phase 5-B — +N 칩 톤은 밴드 표 (웹 enhanceChipTone):
                        //   1..9 어두운 배경 / 10..14 legend 골드 / 15..19 라임 + 글로우 /
                        //   20 라임 + 더 강한 글로우. 보더 없음.
                        let tone = EnhanceChipTone.forLevel(lvl)
                        Text("+\(lvl)")
                            .typography(.micro).monospacedDigit()
                            .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                            .foregroundStyle(tone.fg)
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(tone.bg, in: RoundedRectangle(cornerRadius: 3))
                            .shadow(color: tone.glow, radius: tone.glowRadius)
                            .accessibilityLabel(AppConfig.loc("강화 +\(lvl)"))
                    }
                    Spacer(minLength: 0)
                }
                PixelIcon(PixelIconName.resolve(item.iconName), size: 28, color: item.rarity.color)
                Text(item.localizedDisplayName)
                    .typography(.micro)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                // Phase 5-B — 칭호 칩 (각성/초월). 저장하지 않고 레벨에서 파생. 3열 인벤토리
                // 카드(웹 sm)는 공간이 없어 장착 슬롯 카드(웹 md/lg)에서만 그린다.
                if slot != nil, let title = UpHeroRules.enhanceTitle(level: item.enhanceLevel ?? 0) {
                    let titleText = AppConfig.loc(String.LocalizationValue(EnhanceChipTone.titleKey(title)))
                    Text(titleText)
                        .typography(.micro)
                        .foregroundStyle(GBPalette.lightest)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(GBPalette.lightest.opacity(0.13), in: Capsule())
                        .accessibilityLabel(AppConfig.loc("칭호 \(titleText)"))
                }
                // Phase 6-E — 전 스탯 2열 마이크로 그리드 (주스탯 먼저, EquipmentStats 단일 출처).
                statGrid
                // Phase 6-E — 부적 버프 슬롯 칩 (slotBonus > 0).
                if (item.stats[.slotBonus] ?? 0) > 0 {
                    Text(AppConfig.loc("버프 슬롯 +1"))
                        .typography(.micro)
                        .foregroundStyle(GBPalette.lightest)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(GBPalette.lightest.opacity(0.13), in: RoundedRectangle(cornerRadius: 3))
                }
            }
            .padding(8)
            // 그룹 등고(패턴 A) — 이름 2줄·강화 배지 유무로 갈리던 셀 높이를 행 단위로 통일.
            .unCardCell(minHeight: CardHeights.equipmentCell)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            // Phase 6-E — 등급 스트로크 제거 (카드 보더 금지 규칙). 등급은 글로우 + 배지로.
            //   선택 상태(합성 재료)만 예외로 라임 스트로크.
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentPrimary, lineWidth: selected ? 2 : 0)
            )
            .shadow(color: item.rarity.color.opacity(rarityGlowAlpha),
                    radius: rarityGlowRadius)

            // 해제 버튼 (장착 슬롯 카드일 때만)
            if let onAction {
                Button(action: onAction) {
                    Text("해제")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.bgElevated, in: Capsule())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .topTrailing)
                .padding(6)
            }
        }
    }

    /// 슬롯 칩 라벨 — 카탈로그 키는 EquipSlot.labelKey (무기/방어구/장신구/부적).
    private var slotChipLabel: String {
        switch item.type {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }

    /// Phase 6-E — 스탯 2열 그리드. 웹 EquipmentCard sm `grid grid-cols-2`.
    @ViewBuilder
    private var statGrid: some View {
        let entries = EquipmentStats.orderedEntries(item)
        if entries.isEmpty {
            Text(AppConfig.loc("효과 없음"))
                .typography(.micro).foregroundStyle(Color.textTertiary)
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)],
                      alignment: .leading, spacing: 0) {
                ForEach(Array(entries.enumerated()), id: \.offset) { idx, entry in
                    Text("\(entry.key.label) \(EquipmentStats.format(entry.key, entry.value))")
                        .font(.system(size: 9)).monospacedDigit()
                        .foregroundStyle(idx == 0 ? Color.textPrimary : Color.textTertiary)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var rarityGlowAlpha: Double {
        switch item.rarity {
        case .normal: return 0
        case .rare:   return 0.28
        case .unique: return 0.32
        case .legend: return 0.42
        }
    }

    private var rarityGlowRadius: CGFloat {
        switch item.rarity {
        case .normal: return 0
        case .rare:   return 8
        case .unique: return 10
        case .legend: return 14
        }
    }

}

// MARK: - Phase 6-E — 슬롯 필터 칩 (웹 SlotFilterChips)

/// 전체 + 무기/방어구/장신구/부적 텍스트 칩. 보더 없음 — 활성은 라임 배경, 비활성은 GB.dark 단계.
/// 강화 개요 시트가 쓴다 (가방 본체는 격자라 필터가 없다).
struct SlotFilterChips: View {
    @Binding var selection: EquipSlot?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                chip(label: AppConfig.loc("전체"), slot: nil)
                ForEach(EquipSlot.displayOrder, id: \.self) { slot in
                    chip(label: slotLabel(slot), slot: slot)
                }
            }
        }
    }

    private func chip(label: String, slot: EquipSlot?) -> some View {
        let active = selection == slot
        return Button {
            selection = slot
            Haptics.play(.selection)
        } label: {
            Text(label)
                .typography(.micro)
                .foregroundStyle(active ? GBPalette.darkest : GBPalette.light)
                .padding(.horizontal, 8)
                .frame(minHeight: 32)
                .background(active ? GBPalette.lightest : GBPalette.dark.opacity(0.4),
                            in: RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
    }

    private func slotLabel(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }
}

// MARK: - Phase 5-B — +N 칩 톤 (웹 EquipmentCard.enhanceChipTone)

/// 강화 레벨 칩의 밴드별 톤. 1..9 어두운 배경, 10..14 legend 골드, 15..19 라임 + 글로우,
/// 20 라임 + 더 강한 글로우. 보더는 쓰지 않는다 (카드/버튼 보더 금지 규칙).
struct EnhanceChipTone {
    let bg: Color
    let fg: Color
    let glow: Color
    let glowRadius: CGFloat

    static func forLevel(_ level: Int) -> EnhanceChipTone {
        if level >= UpHeroRules.enhanceTitleTranscendedLevel {
            return EnhanceChipTone(bg: GBPalette.lightest, fg: GBPalette.darkest,
                                   glow: GBPalette.lightest, glowRadius: 6)
        }
        if level >= UpHeroRules.enhanceTitleAwakenedLevel {
            return EnhanceChipTone(bg: GBPalette.lightest, fg: GBPalette.darkest,
                                   glow: GBPalette.lightest.opacity(0.67), glowRadius: 3)
        }
        if level >= UpHeroRules.enhanceHighBandStart {
            return EnhanceChipTone(bg: GBPalette.legend, fg: GBPalette.darkest,
                                   glow: .clear, glowRadius: 0)
        }
        return EnhanceChipTone(bg: GBPalette.darkest.opacity(0.87), fg: GBPalette.lightest,
                               glow: .clear, glowRadius: 0)
    }

    /// 칭호 카탈로그 키 (웹 uphero.enhance.title.awakened / transcended 와 같은 dotted 키).
    static func titleKey(_ title: EnhanceTitle) -> String {
        "uphero.enhance.title.\(title.rawValue)"
    }
}
