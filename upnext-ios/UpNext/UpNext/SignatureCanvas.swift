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
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        configureTool(canvas)
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
        init(_ p: SignatureCanvas) { parent = p }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            parent.signatureData = canvasView.drawing.dataRepresentation()
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
