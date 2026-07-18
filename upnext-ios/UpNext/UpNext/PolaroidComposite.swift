//
//  PolaroidComposite.swift
//  UpNext — 폴라로이드 합성 → 공유 가능한 UIImage 생성.
//
//  웹 src/lib/polaroidComposite.ts 포팅.
//  600×727px 캔버스에 베이지 배경 + 사진(Kodak 필터) + 날짜 스탬프 + 스티커 + 서명을
//  순서대로 합성. UIGraphicsImageRenderer 사용.
//

import UIKit

struct CompositeSticker {
    let id: String
    let type: StickerType
    let content: String   // emoji char 또는 자산 이름
    /// 폴라로이드 영역 기준 % 좌표 (0-100)
    let x: Double
    let y: Double
    let rotation: Double  // degrees
    let scale: Double
    let zIndex: Int

    enum StickerType { case emoji, image }
}

enum PolaroidComposite {
    private static let width: CGFloat = 600
    private static let height: CGFloat = 727  // 600 * 223/184

    /// 폴라로이드 합성 → UIImage. 06-photo-flow(a): UIGraphicsImageRenderer 는
    /// 오프스크린이라 백그라운드 큐에서 호출해도 안전 (저장 시 메인 블로킹 제거).
    /// signatureImage 는 nil 가능, stickers 빈 배열 가능.
    /// `applyFilter=false` 면 photo 가 이미 Kodak 필터된 것으로 간주해 재필터 생략
    /// (캡처 직후 캐시한 필터 이미지를 재사용 — 이중 CIFilter 방지).
    static func render(
        photo: UIImage,
        timestamp: Date,
        signatureImage: UIImage? = nil,
        stickers: [CompositeSticker] = [],
        frameBg: UIColor = UIColor(red: 0.976, green: 0.973, blue: 0.961, alpha: 1),
        applyFilter: Bool = true
    ) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { ctx in
            let cgCtx = ctx.cgContext

            // 1. 베이지 배경
            cgCtx.setFillColor(frameBg.cgColor)
            cgCtx.fill(CGRect(x: 0, y: 0, width: width, height: height))

            // 2. 사진 영역 — Figma 좌표 (15, 14, 154x157) → 600px 비례
            let photoX = (15.0 / 184.0) * width
            let photoY = (14.0 / 223.0) * height
            let photoW = (154.0 / 184.0) * width
            let photoH = (157.0 / 223.0) * height
            let photoRect = CGRect(x: photoX, y: photoY, width: photoW, height: photoH)

            cgCtx.setFillColor(UIColor.black.cgColor)
            cgCtx.fill(photoRect)

            // 사진 — Kodak 필터 적용 후 object-cover 로 그림 (이미 필터됐으면 그대로).
            let filtered = applyFilter ? (PolaroidFilters.applyKodak(photo) ?? photo) : photo
            drawImageCover(filtered, in: photoRect)

            // 비네팅 (가운데 transparent, 가장자리 어둡게)
            let vignette = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [
                    UIColor.clear.cgColor,
                    UIColor.black.withAlphaComponent(0.22).cgColor,
                ] as CFArray,
                locations: [0.45, 1.0]
            )!
            cgCtx.saveGState()
            cgCtx.clip(to: photoRect)
            let centerPoint = CGPoint(x: photoRect.midX, y: photoRect.midY)
            cgCtx.drawRadialGradient(
                vignette,
                startCenter: centerPoint, startRadius: photoW * 0.25,
                endCenter: centerPoint, endRadius: photoW * 0.75,
                options: []
            )
            cgCtx.restoreGState()

            // 3. 오렌지 날짜 스탬프
            let df = DateFormatter()
            df.dateFormat = "'yy MM dd HH:mm"
            let dateStr = df.string(from: timestamp)
            let stampColor = UIColor(red: 1.0, green: 107/255, blue: 53/255, alpha: 1)
            let stampAttr: [NSAttributedString.Key: Any] = [
                .font: UIFont(name: "Courier-Bold", size: 22) ??
                       UIFont.monospacedSystemFont(ofSize: 22, weight: .bold),
                .foregroundColor: stampColor,
            ]
            let stampSize = (dateStr as NSString).size(withAttributes: stampAttr)
            (dateStr as NSString).draw(
                at: CGPoint(x: photoRect.maxX - stampSize.width - 16,
                            y: photoRect.maxY - stampSize.height - 16),
                withAttributes: stampAttr
            )

            // 4. 스티커 (zIndex 오름차순)
            for sticker in stickers.sorted(by: { $0.zIndex < $1.zIndex }) {
                drawSticker(sticker, in: cgCtx)
            }

            // 5. 서명 (폴라로이드 전체 위)
            if let sig = signatureImage {
                sig.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
            }
        }
    }

    /// object-cover 동치 — 영역을 채우되 종횡비 유지 (잘림 허용).
    private static func drawImageCover(_ image: UIImage, in rect: CGRect) {
        let imgRatio = image.size.width / image.size.height
        let dstRatio = rect.width / rect.height
        var src = CGRect(origin: .zero, size: image.size)
        if imgRatio > dstRatio {
            // 가로 더 길음 — 좌우 잘라냄
            let newW = image.size.height * dstRatio
            src = CGRect(x: (image.size.width - newW) / 2, y: 0,
                         width: newW, height: image.size.height)
        } else {
            let newH = image.size.width / dstRatio
            src = CGRect(x: 0, y: (image.size.height - newH) / 2,
                         width: image.size.width, height: newH)
        }
        guard let cg = image.cgImage?.cropping(to: src) else {
            image.draw(in: rect)
            return
        }
        UIImage(cgImage: cg).draw(in: rect)
    }

    private static func drawSticker(_ s: CompositeSticker, in ctx: CGContext) {
        let cx = (s.x / 100) * Double(width)
        let cy = (s.y / 100) * Double(height)
        let baseSize: CGFloat = s.content == "upnext-logo" ? 64 : 48
        // 600×727 캔버스 (StickerLayer 와 동일한 1:1 좌표계) 기준 그대로 사용.
        // UIGraphicsImageRenderer 가 screen scale 을 자동 적용하므로 추가 ×2 는
        // 이중 적용 — 스티커가 화면보다 두 배 크게 박혀 나가던 버그.
        let size = baseSize * CGFloat(s.scale)

        ctx.saveGState()
        ctx.translateBy(x: cx, y: cy)
        ctx.rotate(by: s.rotation * .pi / 180)

        switch s.type {
        case .emoji:
            let attr: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: size),
            ]
            let textSize = (s.content as NSString).size(withAttributes: attr)
            (s.content as NSString).draw(
                at: CGPoint(x: -textSize.width / 2, y: -textSize.height / 2),
                withAttributes: attr
            )
        case .image:
            // 자산 이름으로 로드 (Assets.xcassets / Bundle).
            if let img = UIImage(named: s.content) {
                img.draw(in: CGRect(x: -size/2, y: -size/2, width: size, height: size))
            }
        }

        ctx.restoreGState()
    }
}

// MARK: - 공유 시트 헬퍼

import SwiftUI

struct PolaroidShareSheet: UIViewControllerRepresentable {
    let image: UIImage

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [image], applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
