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
//  괘선 정합 규약 (이 파일의 존재 이유):
//   예전 구현은 SwiftUI `TextEditor` 위에 24pt 간격 괘선을 Canvas 로 따로 그렸다.
//   TextEditor 는 내부 UITextView 의 기본 textContainerInset(top 8) + lineFragmentPadding(5)
//   을 쓰고 행높이는 폰트 intrinsic(16pt 기준 ≈20pt)이라, 첫 줄이 괘선보다 ~11pt 아래에서
//   시작하고 줄마다 4pt 씩 어긋나 누적됐다 — "줄 위에 쓰이는 게 아니라 그냥 덮어씌운 느낌".
//   이제 UITextView 를 직접 감싸 (a) lineSpacing 으로 행높이를 괘선 간격에 정확히 고정,
//   (b) inset/padding 을 0 기준으로 재설정, (c) 괘선 y 를 실제 폰트 ascender 에서 계산한다.
//   또한 종이는 스크롤되지 않으므로 isScrollEnabled=false 로 두고, 카드 밖으로 넘칠 입력은
//   아예 거절한다(자수 제한 + 줄수 제한).
//

import SwiftUI
import UIKit

struct MemoEditor: View {
    @Binding var text: String
    let maxLength: Int = 200

    /// 첫 줄 안내 문구 — 비어 있고 편집 중이 아닐 때 첫 괘선 위에 표시.
    private let placeholder: String
    /// 포커스 소유권 — 호출부가 `focus:` 로 Bool 바인딩을 넘기면 그걸로 first responder 를
    /// 구동하고, 안 넘기면 내부 상태로 자체 관리한다.
    ///   `@FocusState` 대신 `Binding<Bool>` 인 이유: 이 에디터는 SwiftUI TextEditor 가 아니라
    ///   UITextView 래퍼라 `.focused()` 가 first responder 를 구동하지 못한다(no-op 함정).
    ///   대신 updateUIView 에서 become/resignFirstResponder 를 직접 호출한다.
    private let externalFocus: Binding<Bool>?
    @State private var internalFocus: Bool = false

    @Environment(\.locale) private var locale

    // MARK: 라인 노트 지오메트리 — 괘선과 텍스트가 **같은 상수**를 본다.
    private static let lineHeight: CGFloat = 24
    private static let fontSize: CGFloat = 16
    private static let hInset: CGFloat = 12
    private static let topInset: CGFloat = 10
    private static let counterHeight: CGFloat = 16
    /// 괘선을 베이스라인에서 얼마나 아래에 둘지 — 글자가 선 '위에' 앉아 보이는 거리.
    private static let ruleDrop: CGFloat = 2

    init(text: Binding<String>,
         placeholder: String = "",
         focus: Binding<Bool>? = nil) {
        self._text = text
        self.placeholder = placeholder
        self.externalFocus = focus
    }

    private var focusBinding: Binding<Bool> {
        externalFocus ?? $internalFocus
    }

    private var uiFont: UIFont {
        let code = locale.language.languageCode?.identifier ?? "ko"
        let family = AppFont.family(forLangCode: code)
        return UIFont(name: family, size: Self.fontSize)
            ?? UIFont.systemFont(ofSize: Self.fontSize)
    }

    var body: some View {
        GeometryReader { geo in
            let font = uiFont
            // 텍스트가 쓸 수 있는 세로 = 카드 높이 − 상단 여백 − 카운터 줄.
            let usable = max(Self.lineHeight,
                             geo.size.height - Self.topInset - Self.counterHeight)
            let maxLines = max(1, Int((usable / Self.lineHeight).rounded(.down)))

            ZStack(alignment: .topLeading) {
                Color.paperCream.clipShape(RoundedRectangle(cornerRadius: 2))

                // 괘선 — 각 줄의 베이스라인 바로 아래.
                Canvas { ctx, _ in
                    for n in 0..<maxLines {
                        let y = Self.topInset
                            + CGFloat(n) * Self.lineHeight
                            + font.ascender
                            + Self.ruleDrop
                        var p = Path()
                        p.move(to: CGPoint(x: Self.hInset, y: y))
                        p.addLine(to: CGPoint(x: geo.size.width - Self.hInset, y: y))
                        ctx.stroke(p, with: .color(Color.paperLine), lineWidth: 0.5)
                    }
                }
                .allowsHitTesting(false)

                // 안내 문구 — 첫 줄 괘선 위, 텍스트와 같은 좌표계.
                if text.isEmpty && !focusBinding.wrappedValue && !placeholder.isEmpty {
                    Text(placeholder)
                        .font(.custom(AppFont.family(forLangCode:
                            locale.language.languageCode?.identifier ?? "ko"),
                                      size: Self.fontSize))
                        .foregroundStyle(Color.paperPlaceholder)
                        .padding(.leading, Self.hInset)
                        .padding(.top, Self.topInset)
                        .allowsHitTesting(false)
                }

                LinedTextView(
                    text: $text,
                    focused: focusBinding,
                    font: font,
                    lineHeight: Self.lineHeight,
                    topInset: Self.topInset,
                    hInset: Self.hInset,
                    maxLength: maxLength,
                    maxLines: maxLines
                )
                // 폭·높이를 모두 명시 — 폭을 안 잠그면 위 compression-resistance 조정만으로는
                //   부족해 긴 문장이 한 줄로 뻗는다(실측). 높이는 괘선 개수와 정확히 일치.
                .frame(width: geo.size.width,
                       height: Self.topInset + CGFloat(maxLines) * Self.lineHeight,
                       alignment: .topLeading)

                // 카운터 — 우하단.
                VStack {
                    Spacer(minLength: 0)
                    HStack {
                        Spacer()
                        Text("\(text.count) / \(maxLength)")
                            .typography(.micro)
                            .foregroundStyle(counterColor)
                    }
                    .padding(.trailing, Self.hInset)
                }
                .allowsHitTesting(false)
            }
        }
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
}

// MARK: - 괘선 정합 UITextView 래퍼

private struct LinedTextView: UIViewRepresentable {
    @Binding var text: String
    var focused: Binding<Bool>
    let font: UIFont
    let lineHeight: CGFloat
    let topInset: CGFloat
    let hInset: CGFloat
    let maxLength: Int
    let maxLines: Int

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        // 종이는 스크롤되지 않는다 — 카드 밖으로 밀려나는 입력은 아래 delegate 가 거절.
        tv.isScrollEnabled = false
        tv.alwaysBounceVertical = false
        tv.backgroundColor = .clear
        tv.textContainer.lineFragmentPadding = 0
        tv.textContainer.widthTracksTextView = true
        tv.textContainerInset = UIEdgeInsets(top: topInset, left: hInset,
                                             bottom: 0, right: hInset)
        // isScrollEnabled=false 인 UITextView 는 intrinsicContentSize 로 레이아웃된다.
        //   가로 압축 저항이 기본값이면 "한 줄로 쭉 늘어난 너비"를 그대로 요구해 카드 밖으로
        //   삐져나가고 줄바꿈이 아예 일어나지 않는다. 우선순위를 낮춰 부모가 제안한 폭에
        //   맞추게 하면 그 폭 기준으로 워드랩이 돈다.
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        tv.setContentHuggingPriority(.defaultLow, for: .horizontal)
        tv.tintColor = UIColor(Color.inkWarmText)
        tv.autocorrectionType = .no
        tv.spellCheckingType = .no
        // 폴라로이드 뒷면은 항상 밝은 크림 종이 — 다크 트레이트를 상속하면 캐럿/선택색이
        //   뒤집혀 크림 위에서 안 보인다(SignatureCanvas 와 같은 대응).
        tv.overrideUserInterfaceStyle = .light
        tv.inputAccessoryView = context.coordinator.makeAccessory()
        applyText(tv, text)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        context.coordinator.parent = self
        if tv.text != text { applyText(tv, text) }
        // 포커스 동기화 — SwiftUI 상태 → UIKit first responder.
        if focused.wrappedValue, !tv.isFirstResponder {
            DispatchQueue.main.async { tv.becomeFirstResponder() }
        } else if !focused.wrappedValue, tv.isFirstResponder {
            DispatchQueue.main.async { tv.resignFirstResponder() }
        }
    }

    /// 행높이를 괘선 간격에 고정한 typing/텍스트 속성 적용.
    ///   lineSpacing 은 폰트 intrinsic 행높이 **위에 더해지는** 간격이므로,
    ///   목표(lineHeight) − intrinsic 만큼만 준다. 그러면 n 번째 줄의 프래그먼트 top 이
    ///   정확히 `topInset + n*lineHeight` 가 되고 베이스라인은 거기에 ascender 만큼 아래 —
    ///   MemoEditor 의 괘선 y 계산과 완전히 같은 식이 된다.
    private func applyText(_ tv: UITextView, _ value: String) {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = max(0, lineHeight - font.lineHeight)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor(Color.inkWarmText),
            .paragraphStyle: style,
        ]
        tv.typingAttributes = attrs
        let selected = tv.selectedRange
        tv.attributedText = NSAttributedString(string: value, attributes: attrs)
        // 커서 위치 보존 — attributedText 재대입은 캐럿을 문서 끝으로 보낸다.
        let clamped = min(selected.location, (value as NSString).length)
        tv.selectedRange = NSRange(location: clamped, length: 0)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: LinedTextView
        init(_ p: LinedTextView) { parent = p }

        func makeAccessory() -> UIToolbar {
            let bar = UIToolbar(frame: CGRect(x: 0, y: 0, width: 0, height: 44))
            bar.sizeToFit()
            bar.items = [
                UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil),
                UIBarButtonItem(title: AppConfig.loc("완료"), style: .done,
                                target: self, action: #selector(doneTapped)),
            ]
            return bar
        }

        @objc private func doneTapped() {
            parent.focused.wrappedValue = false
        }

        /// 자수 제한 + **줄수 제한**. 스크롤이 없으므로 카드 밖으로 나갈 입력은 거절한다.
        func textView(_ tv: UITextView, shouldChangeTextIn range: NSRange,
                      replacementText replacement: String) -> Bool {
            let current = tv.text as NSString
            let next = current.replacingCharacters(in: range, with: replacement)
            if next.count > parent.maxLength { return false }
            // 지우기·같은 길이 편집은 항상 허용(레이아웃이 줄어들 뿐).
            if next.count <= current.length { return true }
            return fits(next, in: tv)
        }

        /// 후보 문자열이 maxLines 안에 들어가는지 — 실제 TextKit 레이아웃으로 측정.
        private func fits(_ candidate: String, in tv: UITextView) -> Bool {
            let style = NSMutableParagraphStyle()
            style.lineSpacing = max(0, parent.lineHeight - parent.font.lineHeight)
            let attr = NSAttributedString(string: candidate, attributes: [
                .font: parent.font, .paragraphStyle: style,
            ])
            let width = max(1, tv.bounds.width - parent.hInset * 2)
            let box = attr.boundingRect(
                with: CGSize(width: width, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
            // 마지막 줄엔 lineSpacing 이 붙지 않으므로 여유 1pt 를 둔다.
            return box.height <= CGFloat(parent.maxLines) * parent.lineHeight + 1
        }

        func textViewDidChange(_ tv: UITextView) {
            // typingAttributes 가 유지되도록 문단 스타일을 다시 씌운다(붙여넣기 대비).
            let style = NSMutableParagraphStyle()
            style.lineSpacing = max(0, parent.lineHeight - parent.font.lineHeight)
            let full = NSRange(location: 0, length: (tv.text as NSString).length)
            tv.textStorage.addAttributes([.paragraphStyle: style, .font: parent.font], range: full)
            parent.text = tv.text
        }

        func textViewDidBeginEditing(_ tv: UITextView) {
            if !parent.focused.wrappedValue { parent.focused.wrappedValue = true }
        }

        func textViewDidEndEditing(_ tv: UITextView) {
            if parent.focused.wrappedValue { parent.focused.wrappedValue = false }
        }
    }
}
