//
//  SignatureCanvas.swift
//  UpNext — 폴라로이드 캡션 영역 freehand 서명 캔버스.
//
//  웹 src/components/growth/SignatureCanvas.tsx 의 Catmull-Rom + 압력/속도 가변 stroke
//  → PencilKit 으로 격상. PencilKit 은 iOS 13+ 기본 제공 — 더 자연스러운 서명+그리기.
//
//  외부 API:
//   @Binding var signatureData: Data?  // PKDrawing.dataRepresentation()
//   var penColor: UIColor
//   var penWidth: CGFloat
//   var eraserMode: Bool
//

import SwiftUI
import PencilKit

struct SignatureCanvas: UIViewRepresentable {
    @Binding var signatureData: Data?
    var penColor: UIColor = .black
    var penWidth: CGFloat = 2.0
    var eraserMode: Bool = false
    var background: UIColor = .clear
    /// 획이 하나 커밋될 때 1회 — **그 획을 긋기 직전의 데이터**를 넘긴다.
    ///   호출부는 이 값을 실행취소 스택에 그대로 쌓으면 된다.
    var onStrokeCommitted: ((Data?) -> Void)?

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.backgroundColor = background
        canvas.isOpaque = background != .clear
        canvas.drawingPolicy = .anyInput   // 손가락도 허용
        // P3(b) 검은펜→흰색 버그: 앱이 항상 다크 UI라 PKCanvasView 가 다크 trait 을 상속하면
        //   PencilKit 이 authored 검정 잉크를 화면에서 흰색으로 자동반전(디스플레이 타임)한다.
        //   반면 합성(renderImage=PKDrawing.image)은 반전하지 않아 화면=흰색·저장=검정 이중
        //   불일치. 캔버스를 .light 로 고정해 반전을 차단 → 화면·저장 모두 authored 검정 유지.
        canvas.overrideUserInterfaceStyle = .light
        canvas.delegate = context.coordinator
        configureTool(canvas)
        // 기존 데이터 로드
        if let data = signatureData, let drawing = try? PKDrawing(data: data) {
            canvas.drawing = drawing
        }
        context.coordinator.lastEmitted = signatureData
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        context.coordinator.parent = self
        configureTool(canvas)
        // 외부에서 signatureData 가 바뀐 경우(실행취소/다시실행) 캔버스에 반영한다.
        //   판별 기준은 "이 캔버스가 마지막으로 내보낸 값"이다. 매번 drawing 을 직렬화해
        //   비교하면 비싸고, 무조건 재대입하면 그리는 중에 획이 끊긴다.
        //   재대입은 델리게이트를 다시 부르므로 isApplyingExternal 로 되먹임을 끊는다.
        guard signatureData != context.coordinator.lastEmitted else { return }
        context.coordinator.isApplyingExternal = true
        if let data = signatureData, let drawing = try? PKDrawing(data: data) {
            canvas.drawing = drawing
        } else {
            canvas.drawing = PKDrawing()      // nil = 전부 지운 상태
        }
        context.coordinator.lastEmitted = signatureData
        context.coordinator.isApplyingExternal = false
    }

    private func configureTool(_ canvas: PKCanvasView) {
        if eraserMode {
            // P3(e) 지우개 크기 연동 — 웹 SignatureCanvas.tsx eraser lineWidth = max(8, width*4).
            //   기존 PKEraserTool(.bitmap) 고정폭은 펜 굵기 토글을 무시했다. iOS 16.4+
            //   width: 지정자로 펜 굵기에 비례(thin/med/thick → 8/12/20)해 지우개 폭을 준다.
            let eraserWidth = max(8, penWidth * 4)
            if #available(iOS 16.4, *) {
                canvas.tool = PKEraserTool(.bitmap, width: eraserWidth)
            } else {
                canvas.tool = PKEraserTool(.bitmap)
            }
        } else {
            canvas.tool = PKInkingTool(.pen, color: penColor, width: penWidth)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: SignatureCanvas
        /// 이 캔버스가 마지막으로 바깥에 내보낸 데이터 — 외부 변경(실행취소) 판별 기준.
        var lastEmitted: Data?
        /// 외부 변경을 캔버스에 반영하는 중 — 델리게이트 되먹임 차단.
        var isApplyingExternal = false
        /// 진행 중인 획을 긋기 **직전**의 데이터. didBeginUsingTool 에서 잡아둔다.
        var pendingUndoBase: Data?
        /// 이번 도구 사용에 대한 실행취소 항목을 아직 안 만들었다.
        var hasPendingUndo = false

        init(_ p: SignatureCanvas) { parent = p }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            guard !isApplyingExternal else { return }
            let data = canvasView.drawing.dataRepresentation()
            // 실행취소 항목은 **실제로 그림이 바뀐 이 순간** 만든다(획당 1개).
            //   시작/종료 콜백 타이밍에 기대지 않으므로 순서 경쟁이 원천 차단된다.
            if hasPendingUndo {
                hasPendingUndo = false
                parent.onStrokeCommitted?(pendingUndoBase)
            }
            lastEmitted = data
            parent.signatureData = data
        }

        // 실행취소 기준점 — 획을 긋기 직전의 데이터를 잡아둔다. 여기서는 **아무것도 밀지 않는다**.
        //
        // ⚠️ PencilKit 콜백 순서(실측 로그): begin(strokes=0) → end(strokes=0) → didChange(strokes=1).
        //   즉 didEndUsingTool 시점에도 방금 그은 획이 아직 drawing 에 없다. 예전 구현은
        //   begin 에서 스냅샷을 찍고 end 에서 "변한 게 없으면 취소"를 했는데, end 가 커밋보다
        //   **먼저** 오니 매번 "안 변했다"로 판정해 스냅샷을 되물렸다 → 실행취소가 통째로 죽었다.
        //   (다음 틱으로 미뤄도 didChange 가 그보다 늦게 와서 여전히 경쟁이었다.)
        //   그래서 지금은 "커밋된 순간"인 drawingDidChange 에서만 항목을 만든다.
        //   여기서 base 를 덮어써도 안전하다 — 아무것도 안 그린 탭이었다면 그 사이 데이터가
        //   바뀌지 않았으므로 lastEmitted 가 여전히 올바른 직전 상태다.
        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
            pendingUndoBase = lastEmitted
            hasPendingUndo = true
        }
    }
}

extension SignatureCanvas {
    /// 현재 서명을 UIImage 로 렌더 — 합성용.
    /// 06-photo-flow(a): 저장 합성을 백그라운드 큐로 옮기므로 `UIScreen.main.scale`
    /// 을 내부에서 읽지 않고 호출부(메인)에서 캡처해 넘긴다. 미지정 시에만 main 접근.
    @MainActor
    static func renderImage(from data: Data?, size: CGSize) -> UIImage? {
        renderImage(from: data, size: size, scale: UIScreen.main.scale)
    }

    static func renderImage(from data: Data?, size: CGSize, scale: CGFloat) -> UIImage? {
        guard let data, let drawing = try? PKDrawing(data: data) else { return nil }
        let bounds = CGRect(origin: .zero, size: size)
        // P3(b) 합성측 반전 차단 — PKDrawing.image() 는 주변 trait(다크)를 상속해 검정 잉크를
        //   흰색으로 자동반전한다(캔버스 overrideUserInterfaceStyle 은 화면 표시만 고칠 뿐,
        //   이 오프스크린 렌더는 여전히 반전). 그 결과 저장 합성의 서명이 흰색이 돼 크림 캡션
        //   위에서 소실됐다. .light trait 을 강제해 authored 색(검정)을 그대로 래스터한다.
        let light = UITraitCollection(userInterfaceStyle: .light)
        var image: UIImage?
        light.performAsCurrent {
            image = drawing.image(from: bounds, scale: scale)
        }
        return image
    }
}
