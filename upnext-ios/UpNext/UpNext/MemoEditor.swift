//
//  MemoEditor.swift
//  UpNext — 폴라로이드 뒷면 수기 메모.
//
//  웹 src/components/growth/MemoEditor.tsx 포팅.
//   - paper-cream 배경 + 라인 노트 (paper-line) guide
//   - 200자 최대, 카운터 우하단
//   - placeholder color: paper-placeholder
//   - 카운터 색 변환: 0~180 = placeholder / 180~199 = warning / 200+ = error
//

import SwiftUI

struct MemoEditor: View {
    @Binding var text: String
    let maxLength: Int = 200

    // 포커스 소유권 — 호출부가 `focus:` 로 자기 FocusState 를 넘기면 그걸 쓰고(합성 View
    // 바깥에서 `.focused()` 를 붙이면 SwiftUI 에서 no-op 이 되는 함정을 제거), 안 넘기면
    // 내부 @FocusState 로 자체 관리한다(PhotoCaptureModal 처럼 외부 포커스가 필요없는 곳).
    //   PhotoDetailModal 은 뒷면 메모 편집 상태(memoEditing)를 이 포커스로 구동하므로
    //   외부 바인딩이 반드시 실제 TextEditor 의 `.focused()` 에 직접 연결돼야 한다.
    private let externalFocus: FocusState<Bool>.Binding?
    @FocusState private var internalFocus: Bool

    init(text: Binding<String>, focus: FocusState<Bool>.Binding? = nil) {
        self._text = text
        self.externalFocus = focus
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // 라인 노트 배경
            LinedPaperBackground()
                .fill(Color.paperCream)
                .overlay(linesOverlay)

            VStack(alignment: .leading, spacing: 0) {
                TextEditor(text: bindingClamped)
                    .focused(externalFocus ?? $internalFocus)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .font(.custom(AppFont.family, size: 16))
                    .foregroundStyle(Color.inkWarmText)
                    .padding(12)

                // 카운터
                HStack {
                    Spacer()
                    Text("\(text.count) / \(maxLength)")
                        .typography(.micro)
                        .foregroundStyle(counterColor)
                        .padding(.trailing, 12)
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private var bindingClamped: Binding<String> {
        Binding(
            get: { text },
            set: { newValue in
                if newValue.count > maxLength {
                    text = String(newValue.prefix(maxLength))
                } else {
                    text = newValue
                }
            }
        )
    }

    private var counterColor: Color {
        if text.count >= maxLength {
            return Color.colorErrorStrong
        } else if text.count > Int(Double(maxLength) * 0.9) {
            return Color.colorError
        } else {
            return Color.paperPlaceholder
        }
    }

    private var linesOverlay: some View {
        Canvas { ctx, size in
            let lineHeight: CGFloat = 24
            var y: CGFloat = lineHeight
            while y < size.height - 4 {
                var p = Path()
                p.move(to: CGPoint(x: 12, y: y))
                p.addLine(to: CGPoint(x: size.width - 12, y: y))
                ctx.stroke(p, with: .color(Color.paperLine), lineWidth: 0.5)
                y += lineHeight
            }
        }
    }
}

private struct LinedPaperBackground: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.addRoundedRect(in: rect, cornerSize: CGSize(width: 2, height: 2))
        return p
    }
}
