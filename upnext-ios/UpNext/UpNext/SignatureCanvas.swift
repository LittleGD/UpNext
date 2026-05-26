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

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.backgroundColor = background
        canvas.isOpaque = background != .clear
        canvas.drawingPolicy = .anyInput   // 손가락도 허용
        canvas.delegate = context.coordinator
        configureTool(canvas)
        // 기존 데이터 로드
        if let data = signatureData, let drawing = try? PKDrawing(data: data) {
            canvas.drawing = drawing
        }
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        configureTool(canvas)
    }

    private func configureTool(_ canvas: PKCanvasView) {
        if eraserMode {
            canvas.tool = PKEraserTool(.bitmap)
        } else {
            canvas.tool = PKInkingTool(.pen, color: penColor, width: penWidth)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: SignatureCanvas
        init(_ p: SignatureCanvas) { parent = p }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            parent.signatureData = canvasView.drawing.dataRepresentation()
        }
    }
}

extension SignatureCanvas {
    /// 현재 서명을 UIImage 로 렌더 — 합성용.
    static func renderImage(from data: Data?, size: CGSize) -> UIImage? {
        guard let data, let drawing = try? PKDrawing(data: data) else { return nil }
        let bounds = CGRect(origin: .zero, size: size)
        return drawing.image(from: bounds, scale: UIScreen.main.scale)
    }
}
