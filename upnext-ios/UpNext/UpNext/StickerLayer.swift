//
//  StickerLayer.swift
//  UpNext — 폴라로이드 위 스티커 드래그/핀치/회전/롱프레스 삭제.
//
//  웹 src/components/growth/StickerLayer.tsx 포팅.
//  - 스티커 추가: emoji 또는 logo (UpNextLogoMark)
//  - 드래그: 한 손가락 — 위치 변경
//  - 핀치: 두 손가락 — scale (0.4 ~ 3.0)
//  - 회전: 두 손가락 회전 제스처 — rotation
//  - 롱프레스 500ms: 삭제. 진행 ring 표시.
//  - 선택: 탭 시 활성 (border + 회전 reset 핸들 등 — 단순화)
//

import SwiftUI

// MARK: - 스티커 치수 규약 (화면 ⇄ 저장 합성 단일 진실의 원천)
//
// 스티커 기본 크기를 **컨테이너 가로폭 비율**로 정의한다. 예전엔 화면 StickerLayer 가
// 48/64 pt 를 ≈300pt 폭 카드에서(=16%/21%), 저장 합성이 같은 48/64 를 600px 캔버스에서
// (=8%/10.7%) 써서 저장본 스티커가 화면의 **절반 크기**로 박혔다. 비율로 두면 어떤
// 렌더 크기에서도 같은 비중으로 나온다.
enum StickerMetrics {
    /// 이모지 스티커 기본 변 — 컨테이너 폭 대비 (48/300).
    static let emojiRatio: CGFloat = 48.0 / 300.0
    /// 브랜드 로고 스티커 기본 변 — 컨테이너 폭 대비 (64/300).
    static let logoRatio: CGFloat = 64.0 / 300.0
    /// 이모지 글리프는 기본 변의 85% (화면 `Text.font(size: base*0.85)` 와 동일).
    static let emojiGlyph: CGFloat = 0.85
    /// 브랜드 로고 흰 카드 — 기본 변 대비 가로/세로.
    static let logoCardW: CGFloat = 1.3
    static let logoCardH: CGFloat = 0.55
    /// 로고 카드 코너 라운드 — 카드 세로 대비.
    static let logoCardRadius: CGFloat = 8.0 / 35.2

    static func baseSize(for content: String, containerWidth: CGFloat) -> CGFloat {
        max(1, containerWidth) * (content == "upnext-logo" ? logoRatio : emojiRatio)
    }

    /// 스티커 실제 렌더 박스 (선택 표시·히트영역 계산 공용).
    static func boxSize(for content: String, base: CGFloat) -> CGSize {
        content == "upnext-logo"
            ? CGSize(width: base * logoCardW, height: base * logoCardH)
            : CGSize(width: base, height: base)
    }
}

struct Sticker: Identifiable, Equatable, Codable {
    /// 새 id 발급은 init 으로만, 디코드 시엔 저장된 id 보존.
    let id: UUID
    var type: StickerType
    var content: String      // emoji char 또는 asset name ("upnext-logo")
    var x: Double            // 0-100 (%)
    var y: Double
    var rotation: Double     // degrees
    var scale: Double        // 0.4 ~ 3.0
    var zIndex: Int

    init(type: StickerType, content: String, x: Double, y: Double,
         rotation: Double = 0, scale: Double = 1, zIndex: Int = 0) {
        self.id = UUID()
        self.type = type
        self.content = content
        self.x = x; self.y = y; self.rotation = rotation
        self.scale = scale; self.zIndex = zIndex
    }

    enum StickerType: String, Equatable, Codable { case emoji, image }
}

struct StickerLayer: View {
    @Binding var stickers: [Sticker]
    @Binding var selectedId: UUID?
    var editable: Bool = true
    /// 스티커 조작(이동·확대·회전·삭제)이 시작될 때 1회 — 실행취소 스냅샷용.
    var onBeginEdit: (() -> Void)?
    /// 조작이 끝났을 때 1회 — 변한 게 없으면 스냅샷을 되물리도록.
    var onEndEdit: (() -> Void)?

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack(alignment: .topLeading) {
                Color.clear
                ForEach(stickers) { sticker in
                    StickerView(
                        sticker: binding(for: sticker),
                        selected: selectedId == sticker.id,
                        editable: editable,
                        containerSize: CGSize(width: w, height: h),
                        onSelect: { selectedId = sticker.id },
                        onDelete: { delete(sticker) },
                        onBeginEdit: onBeginEdit,
                        onEndEdit: onEndEdit
                    )
                }
            }
            .frame(width: w, height: h)
            .contentShape(Rectangle())
            .onTapGesture { selectedId = nil }
            // 저장 합성은 캔버스 밖을 그리지 않는다 — 화면도 폴라로이드 밖으로 삐져나온
            //   부분을 잘라야 "꾸민 그대로" 저장된다(구 구현은 화면에서만 프레임 밖으로 나왔다).
            .clipped()
        }
    }

    private func binding(for sticker: Sticker) -> Binding<Sticker> {
        Binding(
            get: { stickers.first { $0.id == sticker.id } ?? sticker },
            set: { newValue in
                if let idx = stickers.firstIndex(where: { $0.id == sticker.id }) {
                    stickers[idx] = newValue
                }
            }
        )
    }

    private func delete(_ s: Sticker) {
        stickers.removeAll { $0.id == s.id }
        if selectedId == s.id { selectedId = nil }
        Haptics.play(.warning)
    }
}

// MARK: - 개별 스티커 뷰

private struct StickerView: View {
    @Binding var sticker: Sticker
    let selected: Bool
    let editable: Bool
    let containerSize: CGSize
    let onSelect: () -> Void
    let onDelete: () -> Void
    let onBeginEdit: (() -> Void)?
    let onEndEdit: (() -> Void)?

    @State private var dragOffset: CGSize = .zero
    @State private var gestureScale: Double = 1
    @State private var gestureRotation: Double = 0
    @State private var longPressProgress: Double = 0
    @State private var longPressActive: Bool = false
    /// 터치 다운 여부 — 제스처 시작을 1회만 처리하기 위한 래치.
    @State private var pressing: Bool = false
    /// 삭제 예약 WorkItem — 손을 떼거나 움직이면 취소.
    @State private var deleteWork: DispatchWorkItem?
    /// 두 손가락(핀치·회전) 진행 중 — 드래그 중심 이동이 겹쳐 스티커가 튀는 것을 막는다.
    @State private var multiTouch: Bool = false

    /// 롱프레스 삭제까지 필요한 시간.
    private let holdToDelete: Double = 0.6

    /// 기본 변 — 컨테이너 폭 비율(StickerMetrics). 저장 합성과 같은 규약.
    private var baseSize: CGFloat {
        StickerMetrics.baseSize(for: sticker.content, containerWidth: containerSize.width)
    }
    private var liveScale: Double { sticker.scale * gestureScale }
    private var liveRotation: Double { sticker.rotation + gestureRotation }

    var body: some View {
        let box = StickerMetrics.boxSize(for: sticker.content, base: baseSize)
        return ZStack {
            stickerContent
                .frame(width: box.width, height: box.height)

            // 선택 표시 — 스티커 실제 박스를 따라가는 파선 라운드렉트(이모지=정사각,
            //   로고=가로 카드). 원형 링은 로고 카드와 형태가 안 맞아 어긋나 보였다.
            if selected {
                RoundedRectangle(cornerRadius: max(3, baseSize * 0.12))
                    .stroke(Color.accentPrimary,
                            style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    .frame(width: box.width + baseSize * 0.18,
                           height: box.height + baseSize * 0.18)
            }
        }
        .frame(width: box.width, height: box.height)
        .contentShape(Rectangle())
        .scaleEffect(liveScale)
        .rotationEffect(.degrees(liveRotation))
        // 롱프레스 진행 링 — 스케일/회전 밖에 둬서 항상 같은 크기·정방향으로 읽힌다.
        //   (디자인 규칙·웹 충실도: 라임 accentPrimary. accentSecondary=에러RED 금지)
        .overlay {
            if longPressActive {
                Circle()
                    .trim(from: 0, to: longPressProgress)
                    .stroke(Color.accentPrimary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: baseSize * 1.5, height: baseSize * 1.5)
                    .rotationEffect(.degrees(-90))
                    .allowsHitTesting(false)
            }
        }
        .position(
            x: containerSize.width * (sticker.x / 100) + dragOffset.width,
            y: containerSize.height * (sticker.y / 100) + dragOffset.height
        )
        .zIndex(Double(sticker.zIndex))
        .gesture(combinedGesture)
    }

    @ViewBuilder
    private var stickerContent: some View {
        switch sticker.type {
        case .emoji:
            Text(sticker.content)
                .font(.system(size: baseSize * StickerMetrics.emojiGlyph))
                .minimumScaleFactor(0.5)
        case .image:
            if sticker.content == "upnext-logo" {
                // P3(g) 브랜드 스티커 — 웹 StickerLayer 처럼 흰 둥근 카드 위 실제 UpNext 워드마크.
                //   기존 "U↗" 임시 텍스트는 저품질이었고, 합성(PolaroidComposite)은 존재하지 않는
                //   "upnext-logo" asset 을 참조해 저장본에서 완전 소실됐다. 앱에 이미 있는 "Wordmark"
                //   벡터 asset(template)을 흰 카드에 얹어 화면·저장을 동일 브랜드 마크로 통일한다.
                let cardW = baseSize * StickerMetrics.logoCardW
                let cardH = baseSize * StickerMetrics.logoCardH
                Image("Wordmark")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color(hex: 0x212727))
                    .padding(.horizontal, cardW * 0.10)
                    .padding(.vertical, cardH * 0.16)
                    .frame(width: cardW, height: cardH)
                    .background(Color.white, in: RoundedRectangle(
                        cornerRadius: cardH * StickerMetrics.logoCardRadius))
            } else if let img = UIImage(named: sticker.content) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFit()
            }
        }
    }

    // MARK: - 제스처

    private var combinedGesture: some Gesture {
        // minimumDistance 0 — 터치 다운 순간을 잡아 선택 + 삭제 홀드 타이머를 건다.
        //   (구현 교체 사유: 예전엔 LongPressGesture(0.5).onChanged 에서 링 애니를 시작하고
        //    onEnded 에서 progress>=0.95 를 검사했는데, LongPressGesture 는 minimumDuration 이
        //    **지난 뒤에** onChanged/onEnded 가 사실상 동시에 발화한다. 링이 0 인 채로 판정돼
        //    롱프레스 삭제가 아예 동작하지 않았다. 이제 터치 다운 기준 WorkItem 으로 확정 구동.)
        let drag = DragGesture(minimumDistance: 0)
            .onChanged { g in
                if !pressing {
                    pressing = true
                    onSelect()
                    Haptics.play(.selection)
                    // 실행취소 체크포인트 — 조작 **전** 상태를 여기서 찍는다.
                    //   단순 선택 탭도 여기에 걸리지만, 아무것도 안 바뀌면
                    //   onEndEdit 에서 호출부가 그 스냅샷을 되물린다.
                    onBeginEdit?()
                    beginHoldToDelete()
                }
                // 손가락이 움직이면 삭제 홀드 취소 — 이동 의도로 판정.
                if abs(g.translation.width) > 6 || abs(g.translation.height) > 6 {
                    cancelHoldToDelete()
                }
                // 두 손가락 조작 중엔 중심 이동을 무시(스티커 튐 방지).
                guard !multiTouch else { return }
                dragOffset = g.translation
            }
            .onEnded { g in
                cancelHoldToDelete()
                pressing = false
                defer { dragOffset = .zero; multiTouch = false; onEndEdit?() }
                guard !multiTouch, containerSize.width > 0, containerSize.height > 0 else { return }
                // 위치 % 좌표로 변환 — 중심점은 항상 카드 안(0~100)으로 clamp.
                let newCx = containerSize.width * (sticker.x / 100) + g.translation.width
                let newCy = containerSize.height * (sticker.y / 100) + g.translation.height
                sticker.x = max(0, min(100, Double(newCx / containerSize.width) * 100))
                sticker.y = max(0, min(100, Double(newCy / containerSize.height) * 100))
            }

        let pinch = MagnificationGesture()
            .onChanged { value in
                multiTouch = true
                cancelHoldToDelete()
                // 라이브 배율은 **최종 배율(sticker.scale × 제스처)** 기준으로 clamp 한다.
                //   구 구현은 제스처 값만 0.4~3.0 으로 잘라, 이미 scale 2.0 인 스티커를
                //   크게 벌리면 화면엔 6.0 배로 커졌다가 손을 떼는 순간 3.0 으로 툭 줄었다.
                gestureScale = clampedScale(sticker.scale * Double(value)) / sticker.scale
            }
            .onEnded { value in
                sticker.scale = clampedScale(sticker.scale * Double(value))
                gestureScale = 1
                multiTouch = false
            }

        let rotate = RotationGesture()
            .onChanged { angle in
                multiTouch = true
                cancelHoldToDelete()
                gestureRotation = angle.degrees
            }
            .onEnded { angle in
                sticker.rotation += angle.degrees
                gestureRotation = 0
                multiTouch = false
            }

        return drag
            .simultaneously(with: pinch)
            .simultaneously(with: rotate)
    }

    /// 스티커 배율 허용 범위 — 화면 표시와 커밋이 **같은 식**을 쓰도록 한 곳에 둔다.
    private func clampedScale(_ s: Double) -> Double { max(0.4, min(3.0, s)) }

    /// 꾹 눌러 삭제 — 링이 한 바퀴 돌면 삭제. 이동/핀치/떼기 시 취소.
    private func beginHoldToDelete() {
        guard editable else { return }
        cancelHoldToDelete()
        longPressActive = true
        withAnimation(.linear(duration: holdToDelete)) { longPressProgress = 1 }
        let work = DispatchWorkItem {
            guard longPressActive else { return }
            cancelHoldToDelete()
            onDelete()
        }
        deleteWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + holdToDelete, execute: work)
    }

    private func cancelHoldToDelete() {
        deleteWork?.cancel()
        deleteWork = nil
        guard longPressActive || longPressProgress != 0 else { return }
        longPressActive = false
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) { longPressProgress = 0 }
    }
}
