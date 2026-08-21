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

// Sticker 데이터 구조체는 Models/StickerModels.swift 로 분리 (모델 레이어 CLI 컴파일용).

struct StickerLayer: View {
    @Binding var stickers: [Sticker]
    @Binding var selectedId: UUID?
    var editable: Bool = true

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
                        onDelete: { delete(sticker) }
                    )
                }
            }
            .frame(width: w, height: h)
            .contentShape(Rectangle())
            .onTapGesture { selectedId = nil }
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

    @State private var dragOffset: CGSize = .zero
    @State private var gestureScale: Double = 1
    @State private var gestureRotation: Double = 0
    @State private var longPressProgress: Double = 0
    @State private var longPressActive: Bool = false

    private var baseSize: CGFloat {
        sticker.content == "upnext-logo" ? 64 : 48
    }

    var body: some View {
        ZStack {
            stickerContent
                .frame(width: baseSize, height: baseSize)
                .scaleEffect(sticker.scale * gestureScale)
                .rotationEffect(.degrees(sticker.rotation + gestureRotation))

            // 선택 보더
            if selected {
                Circle()
                    .stroke(Color.accentPrimary, lineWidth: 2)
                    .frame(width: baseSize * 1.3 * sticker.scale * gestureScale,
                           height: baseSize * 1.3 * sticker.scale * gestureScale)
            }

            // 롱프레스 진행 링 (디자인 규칙·웹 충실도: 라임 accentPrimary. accentSecondary=에러RED 금지)
            if longPressActive {
                Circle()
                    .trim(from: 0, to: longPressProgress)
                    .stroke(Color.accentPrimary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: baseSize * 1.5, height: baseSize * 1.5)
                    .rotationEffect(.degrees(-90))
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
                .font(.system(size: baseSize * 0.85))
                .minimumScaleFactor(0.5)
        case .image:
            if sticker.content == "upnext-logo" {
                // P3(g) 브랜드 스티커 — 웹 StickerLayer 처럼 흰 둥근 카드 위 실제 UpNext 워드마크.
                //   기존 "U↗" 임시 텍스트는 저품질이었고, 합성(PolaroidComposite)은 존재하지 않는
                //   "upnext-logo" asset 을 참조해 저장본에서 완전 소실됐다. 앱에 이미 있는 "Wordmark"
                //   벡터 asset(template)을 흰 카드에 얹어 화면·저장을 동일 브랜드 마크로 통일한다.
                Image("Wordmark")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color(hex: 0x212727))
                    .frame(width: baseSize * 1.05)
                    .padding(.horizontal, baseSize * 0.10)
                    .padding(.vertical, baseSize * 0.11)
                    .frame(width: baseSize * 1.3, height: baseSize * 0.55)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
            } else if let img = UIImage(named: sticker.content) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFit()
            }
        }
    }

    // MARK: - 제스처

    private var combinedGesture: some Gesture {
        let drag = DragGesture()
            .onChanged { g in
                onSelect()
                cancelLongPress()
                dragOffset = g.translation
            }
            .onEnded { g in
                // 위치 % 좌표로 변환
                let newCx = containerSize.width * (sticker.x / 100) + g.translation.width
                let newCy = containerSize.height * (sticker.y / 100) + g.translation.height
                sticker.x = max(0, min(100, Double(newCx / containerSize.width) * 100))
                sticker.y = max(0, min(100, Double(newCy / containerSize.height) * 100))
                dragOffset = .zero
            }

        let pinch = MagnificationGesture()
            .onChanged { value in gestureScale = max(0.4, min(3.0, Double(value))) }
            .onEnded { value in
                let newScale = sticker.scale * max(0.4, min(3.0, Double(value)))
                sticker.scale = max(0.4, min(3.0, newScale))
                gestureScale = 1
            }

        let rotate = RotationGesture()
            .onChanged { angle in gestureRotation = angle.degrees }
            .onEnded { angle in
                sticker.rotation += angle.degrees
                gestureRotation = 0
            }

        let longPress = LongPressGesture(minimumDuration: 0.5)
            .onChanged { _ in
                onSelect()
                if !longPressActive {
                    longPressActive = true
                    withAnimation(.linear(duration: 0.5)) { longPressProgress = 1 }
                }
            }
            .onEnded { _ in
                if longPressProgress >= 0.95 {
                    onDelete()
                }
                cancelLongPress()
            }

        return drag
            .simultaneously(with: pinch)
            .simultaneously(with: rotate)
            .simultaneously(with: longPress)
    }

    private func cancelLongPress() {
        longPressActive = false
        longPressProgress = 0
    }
}
