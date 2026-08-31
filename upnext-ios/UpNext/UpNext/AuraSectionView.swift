//
//  AuraSectionView.swift
//  UpNext — 오늘의 기운 3종 리딩의 배선. 웹 `src/components/flame/AuraSection.tsx` 포팅.
//
//  AuraReadingView.swift 가 만든 두 조각(AuraPickPanel · AuraReadingOverlay)을 실제
//  화면에 연결한다. 조각만 있고 부르는 곳이 없으면 기능은 없는 것과 같다.
//
//  자리: **오늘의 기운 공개 오버레이 안**, 폴라로이드 바로 아래.
//        폴라로이드를 본 흐름에서 곧장 이어지고, 불꽃 탭에는 카드 한 장만 남는다.
//        오늘의 기운 광고를 이미 봤다는 사실이 첫 리딩의 값이 된다(웹과 같은 계약).
//
//  대가 규칙(웹과 동일):
//   - 그날의 첫 리딩은 **무료**. 나머지 둘은 각각 리워드 광고 1회.
//   - 광고를 재생할 수 없는 환경(EEA 동의 거부·미승인 지역·오프라인·no fill)에서는
//     대신 코인(ShopPrices.auraReading)으로 연다. 광고가 유일한 경로가 되면 그런
//     사용자는 하루에 기운 하나만 영영 보게 된다 — FortuneCardView 와 같은 원칙이고,
//     AdsService 가 스스로 적어둔 정책("광고가 유일한 경로가 되면 안 된다")이다.
//   - 이미 연 기운은 그날 안에서 광고도 코인도 없이 다시 볼 수 있다(재시청 유도 금지).
//   - 중도 이탈은 아무 일도 아니다 — 보상도 소모도 없다.
//
//  오버레이를 왜 위로 올리는가: 이 뷰는 폴라로이드 오버레이 안쪽 ScrollView 에 있어서
//  여기서 리딩을 띄우면 스크롤을 따라 움직이고 폴라로이드를 덮지도 못한다.
//  요청만 올리고 표시는 탭 루트(RecordTabView)가 맡는다 — 거기서만 z 순서를 세울 수 있다.
//
//  ⚠️ 접근성 미완: 잠긴 칩의 accessibilityValue 는 AuraPickPanel(AuraReadingView.swift)
//  이 들고 있고 코인 경로에서도 "잠겨 있어요, 광고를 보면 열려요" 로 읽힌다. 코인 경로에
//  들어서면 그 값은 사실과 어긋난다. 고치려면 AuraPickPanel 에 `usesCoinPath` 를
//  기본값 있는 파라미터로 하나 얹고 a11yValue 의 locked 분기를 코인 문구로 가르면 되지만,
//  그 파일은 이 작업의 소유 범위 밖이고 지금 다른 세션이 편집 중이라 손대지 않았다.
//  당장의 완충은 아래 안내줄이다 — 접근성 트리에 그대로 노출되는 Text 라 VoiceOver
//  커서가 세 칩을 지난 직후 가격을 읽는다. 웹도 잠긴 칩 aria-label 은 "잠김" 한 마디이고
//  가격은 같은 안내줄이 진다(aura.coin.hint) — 즉 지금의 웹/iOS 정보 배치는 같고,
//  iOS 쪽 칩 문구만 광고를 특정해 남아 있다.
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
    /// 코인 차감 통로. 앱 부팅(GameStore.bootstrapUpHero)에서 이미 초기화돼 주입되므로
    /// 웹처럼 이 화면에서 스토어를 깨우는 보험(heroInitialize)이 필요 없다.
    @EnvironmentObject private var upHero: UpHeroStore

    @State private var state: AuraState = .empty
    /// 광고 대기 중인 기운
    @State private var loading: AuraKind?
    /// 코인 경로인데 잔액이 모자란다 — 3초 안내 후 스스로 걷힌다.
    @State private var noCoins = false
    /// 안내 되돌리기의 세대 번호. 웹의 `clearTimeout` 자리다 — 안내가 뜬 채로 다시
    /// 누르면 앞선 대기가 **새 안내를** 3초보다 일찍 지워 버린다.
    @State private var noCoinsToken = 0
    /// 이번 세션에서 광고 경로가 실제로 실패했다. 한 번 확인되면 코인 경로로 전환한다.
    ///   `AdsService.isAvailable` 은 동의 갱신 전 낙관적으로 true 를 돌려주므로 그것만으로는
    ///   판정할 수 없다. 실제 `.unavailable` 을 받은 뒤에야 확정된다(웹 `adDeadEnd`).
    @State private var adDeadEnd = false
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

    /**
     코인으로 열어야 하는 상태.
     광고를 볼 수 있으면 **광고가 기본 경로**다. 코인은 광고가 불가능할 때만 나타난다 —
     둘을 항상 나란히 보여주면 "코인 아까우니 광고 봐야지"라는 압박이 새로 생긴다
     (FortuneCardView.usesCoinPath 와 같은 판정).
     */
    private var usesCoinPath: Bool { adDeadEnd || !AdsService.shared.isAvailable }

    /**
     안내줄을 띄울 조건. 잠긴 칩이 **실제로 남아 있을 때만** 뜬다
     (웹 `usesCoinPath && opened.length > 0 && !allOpened` 와 같은 식).

     이 줄이 기습 결제를 막는 구조적 장치다. 칩에는 문구를 얹을 자리가 없고
     (잠금은 자물쇠 하나로만 말한다) 가격이 여기 서지 않으면 탭이 곧 결제가 된다.
     조건이 "코인이 빠질 수 있는 칩이 화면에 있다"와 정확히 같은 식이라,
     가격을 보지 못한 채 코인이 빠지는 경로가 성립하지 않는다.
     */
    private var showsCoinHint: Bool {
        usesCoinPath && !state.opened.isEmpty && !state.allOpened
    }

    var body: some View {
        VStack(spacing: 8) {
            AuraPickPanel(state: state, accent: accent, loading: loading) { kind in
                Task { await pick(kind) }
            }
            .disabled(!ready)
            .opacity(ready ? 1 : 0.6)

            // 광고 실패 안내("지금은 보여줄 광고가 없어요")가 있던 자리. 그 문구는
            // 3초 뒤 원복될 뿐 아무것도 열어주지 않아, 광고를 구조적으로 못 받는
            // 사용자에게는 무한 막다른 길이었다. 이제 같은 자리에서 코인 경로의
            // 가격을 알린다 — 안내가 출구를 갖는다.
            if noCoins {
                notice("코인이 부족해요 (\(ShopPrices.auraReading) 필요)")
            } else if showsCoinHint {
                notice("잠긴 기운은 코인 \(ShopPrices.auraReading)으로 열 수 있어요")
            }
        }
        .onAppear { refresh() }
        .onChange(of: today) { _ in refresh() }
    }

    /// 안내 한 줄. 잔액 부족은 **에러가 아니라 안내**다 — accentSecondary(에러 전용색)를
    /// 쓰지 않는다. 코인이 모자란 것은 잘못이 아니고, 기운은 렌즈이지 심판이 아니다.
    /// 웹 AuraSection 의 같은 자리와 맞춘다(그쪽도 text-tertiary 한 색이다).
    private func notice(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .typography(.micro)
            .foregroundStyle(Color.textTertiary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
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

    /// 칩 탭 — **유일한** 진입점이다.
    ///
    /// 기습 결제 방지: 이 뷰에는 자동 진입/외부 트리거가 없다. FortuneCardView 는
    /// 진입 팝업의 `FortuneAutoOpen` 신호가 가드 없이 tap() 을 태워 코인이 조용히
    /// 빠지는 사고가 있었지만, 여기로 들어오는 신호는 존재하지 않는다
    /// (`AuraSectionView` 의 유일한 호출부는 FortuneRevealOverlay 이고, onAppear /
    /// onChange(of: today) 는 refresh() 만 부른다). 새 자동 열기 경로를 붙이려거든
    /// `guard !usesCoinPath` 를 함께 걸어라 — 값을 보지 못한 탭은 결제가 될 수 없다.
    private func pick(_ kind: AuraKind) async {
        guard loading == nil, ready else { return }
        SoundPlayer.shared.play(.select)

        // 이미 연 기운 · 그날의 첫 기운은 대가 없이 바로 연다.
        if state.opened.contains(kind) || state.opened.isEmpty {
            open(kind)
            return
        }

        // 다시 눌렀다 — 앞선 안내는 여기서 걷는다(웹 clearTimeout 자리).
        noCoins = false
        noCoinsToken &+= 1

        // 코인 경로 — 광고를 못 받는 상태에서만 온다. 가격은 칩 아래 안내줄에 이미
        // 떠 있고(showsCoinHint 가 이 분기의 조건을 포함한다), 이 탭이 곧 결제 확정이다
        // — 리롤·오늘의 기운과 같은 규약: 별도 확인 다이얼로그 없음.
        if usesCoinPath {
            guard upHero.spendCoins(ShopPrices.auraReading) else {
                SoundPlayer.shared.play(.cancel)
                Haptics.play(.warning)
                let token = noCoinsToken
                noCoins = true
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if noCoins, noCoinsToken == token { noCoins = false }
                return
            }
            SoundPlayer.shared.play(.confirm)
            open(kind)
            return
        }

        loading = kind
        let result = await AdsService.shared.showRewardedAd(slot: .fortune)
        loading = nil
        switch result {
        case .rewarded:
            SoundPlayer.shared.play(.confirm)
            open(kind)
        case .unavailable:
            // 막다른 길이던 자리. 예전엔 "지금은 보여줄 광고가 없어요"를 3초 띄우고
            //   원복해, 아무리 눌러도 열 수 없는 상태가 무한 반복됐다. 이제 광고 경로가
            //   실제로 죽었다는 사실을 확정하고 코인 경로로 전환한다 — 다음 렌더부터
            //   안내줄이 가격을 달고 뜬다. 여기서 코인을 자동 차감하지는 않는다
            //   (사용자가 가격을 보고 한 번 더 눌러야 한다).
            SoundPlayer.shared.play(.cancel)
            adDeadEnd = true
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
