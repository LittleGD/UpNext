//
//  AuraSectionView.swift
//  UpNext — 오늘의 기운 3종 리딩의 배선. 웹 `src/components/flame/AuraSection.tsx` 포팅.
//
//  AuraReadingView.swift 가 만든 두 조각(AuraPickPanel · AuraReadingOverlay)을 실제
//  화면에 연결한다. 조각만 있고 부르는 곳이 없으면 기능은 없는 것과 같다.
//
//  자리: 폴라로이드를 **이미 본 뒤에만** 오늘의 기운 카드 아래에 붙는다.
//        오늘의 기운 광고를 이미 봤다는 사실이 첫 리딩의 값이 된다(웹과 같은 계약).
//
//  광고 규칙(웹과 동일):
//   - 그날의 첫 리딩은 **무료**. 나머지 둘은 각각 리워드 광고 1회.
//   - 이미 연 기운은 그날 안에서 광고 없이 다시 볼 수 있다(재시청 유도 금지).
//   - 중도 이탈은 아무 일도 아니다 — 보상도 소모도 없다.
//
//  오버레이를 왜 위로 올리는가: 이 뷰는 RecordTabView 의 ScrollView 안에 있어서
//  여기서 오버레이를 띄우면 스크롤을 따라 움직이고 화면 전체를 덮지 못한다.
//  폴라로이드(FortuneRevealOverlay)와 같은 이유로 요청만 올리고 표시는 탭이 맡는다.
//

import SwiftUI

/// 리딩 오버레이 표시 요청. 탭 루트(RecordTabView)가 받아 ScrollView 밖에서 띄운다.
struct AuraOverlayRequest: Identifiable {
    let id = UUID()
    let reading: AuraReading
    /// 오늘의 색 — 폴라로이드와 같은 액센트라 두 화면이 한 벌로 읽힌다.
    let accent: Color
    /// 처음 여는 리딩인지 (재열람은 문지르기 의식을 반복하지 않는다)
    let needsRitual: Bool
    let allOpened: Bool
    /// 오버레이가 닫힌 순간 — 의식을 실제로 통과했다는 뜻이다(닫기 버튼은 공개 후에만 뜬다).
    let onFinish: () -> Void
}

@MainActor
struct AuraSectionView: View {
    /// daily 기준 오늘 날짜 — 자정을 넘기면 열람 기록과 스냅샷이 함께 버려진다.
    let today: String
    let accent: Color
    let onOpenReading: (AuraOverlayRequest) -> Void

    @EnvironmentObject private var store: GameStore

    @State private var state: AuraState = .empty
    /// 광고 대기 중인 기운
    @State private var loading: AuraKind?
    @State private var failed = false
    /// 마지막으로 읽어들인 날짜 — 탭을 떠나지 않은 채 자정을 넘기는 경우를 잡는다.
    @State private var loadedDay = ""
    /**
     권리는 얻었지만 아직 문질러 드러내지 않은 기운.
     열람 기록은 광고를 본 순간 남긴다(문지르다 나가도 광고값은 지켜야 하므로).
     그래서 기록만으로는 "이미 봤다"와 "받아만 뒀다"를 구분할 수 없어, 이 세션
     안에서는 여기로 구분해 의식을 다시 보여준다.
     */
    @State private var pendingRitual: Set<AuraKind> = []

    /**
     리텐션 복원 전이면 체크인·방패 이력이 비어 보인다. 그 상태로 첫 리딩을 열면
     빈 이력으로 스냅샷이 굳어 하루 종일 엉뚱한 등급과 조짐을 보게 된다.
     이미 오늘 스냅샷이 있으면(재열람) 새로 계산하지 않으므로 기다릴 이유가 없다.
     웹 AuraSection 의 `ready` 와 같은 게이트다.
     */
    private var ready: Bool {
        state.snapshot != nil || store.retention != nil
    }

    var body: some View {
        VStack(spacing: 8) {
            AuraPickPanel(state: state, loading: loading) { kind in
                Task { await pick(kind) }
            }
            .disabled(!ready)
            .opacity(ready ? 1 : 0.6)
            if failed {
                Text("지금은 보여줄 광고가 없어요")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .onAppear { refresh() }
        .onChange(of: today) { _ in refresh() }
    }

    // MARK: - 동작

    private func refresh() {
        if loadedDay != today {
            // 날짜가 넘어갔다 — 이 세션의 "받아만 뒀다" 표시도 함께 버린다.
            pendingRitual.removeAll()
            loadedDay = today
        }
        state = AuraStore.state(today: today)
    }

    private func pick(_ kind: AuraKind) async {
        guard loading == nil, ready else { return }
        SoundPlayer.shared.play(.select)

        // 이미 연 기운 · 그날의 첫 기운은 광고 없이 바로 연다.
        if state.opened.contains(kind) || state.opened.isEmpty {
            open(kind)
            return
        }

        failed = false
        loading = kind
        let result = await AdsService.shared.showRewardedAd(slot: .fortune)
        loading = nil
        switch result {
        case .rewarded:
            SoundPlayer.shared.play(.confirm)
            open(kind)
        case .unavailable:
            SoundPlayer.shared.play(.cancel)
            failed = true
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            failed = false
        case .dismissed:
            // 중도 이탈 — 조용히 원상 복귀. 보상도 소모도 없다.
            break
        }
    }

    private func open(_ kind: AuraKind) {
        // 첫 리딩을 여는 시점에 3종을 한꺼번에 계산해 고정한다. 이미 오늘 스냅샷이
        // 있으면 덮어쓰지 않는다 — 하루 안에서 점수가 흔들리면 점이 아니라 대시보드다.
        let input = AuraFlow.input(store: store, today: today)
        let snapshot = AuraStore.ensureSnapshot(today: today) { Aura.compute(input) }
        // 처음 여는 기운만 의식을 거친다. 재열람은 곧장 결과로.
        let ritual = !state.opened.contains(kind) || pendingRitual.contains(kind)
        if ritual { pendingRitual.insert(kind) }
        // 열람 기록은 "볼 권리를 얻은 순간" 남긴다. 문지르다 나가도 광고값은 지킨다.
        let opened = AuraStore.markOpened(today: today, kind: kind)
        state = AuraState(opened: opened, snapshot: snapshot)

        onOpenReading(AuraOverlayRequest(
            reading: snapshot[kind],
            accent: accent,
            needsRitual: ritual,
            allOpened: state.allOpened,
            onFinish: { pendingRitual.remove(kind) }
        ))
    }
}
