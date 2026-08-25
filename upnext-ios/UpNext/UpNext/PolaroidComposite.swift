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
        // 픽셀 스케일 고정 2x — 기본 포맷은 기기 screen scale(3x)이라 출력이 1800×2181
        // (디코드 시 장당 ≈15.7MB)로 부풀었다. 사진 소스가 ≤960px 프리뷰라 3x 는 순수
        // 업스케일 낭비. 2x 는 사진 영역(502pt→1004px)이 소스와 1:1 로 정합해 디테일
        // 손실 없이 메모리·인코드·이후 앨범 디코드 비용을 절반 이하로 줄인다
        // (실기기 촬영/앨범 반복 시 메모리 압박 렉의 배율 항).
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 2
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height),
                                               format: fmt)
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
            //   웹 polaroidComposite.ts 포맷 `'YY MM DD HH:mm`. Unicode 패턴에서 리터럴
            //   아포스트로피는 `''`. 닫히지 않은 `'yy…`는 "yy MM dd HH:mm" 리터럴로 찍히던 버그.
            let df = DateFormatter()
            df.locale = Locale(identifier: "en_US_POSIX")
            df.dateFormat = "''yy MM dd HH:mm"
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
            if s.content == "upnext-logo" {
                // P3(g) 브랜드 스티커 합성 — 화면 StickerLayer 와 동일한 흰 카드 + 워드마크.
                //   기존 UIImage(named:"upnext-logo") 는 asset 부재로 nil → 저장본에서 소실됐다.
                let cardW = size * 1.3
                let cardH = size * 0.55
                let logo = brandLogoImage(cardW: cardW, cardH: cardH)
                logo.draw(in: CGRect(x: -cardW / 2, y: -cardH / 2, width: cardW, height: cardH))
            } else if let img = UIImage(named: s.content) {
                // 그 외 자산 이름으로 로드 (Assets.xcassets / Bundle).
                img.draw(in: CGRect(x: -size/2, y: -size/2, width: size, height: size))
            }
        }

        ctx.restoreGState()
    }

    /// 브랜드 로고 스티커 — 흰 둥근 카드 위 UpNext 워드마크(#212727)를 오프스크린 렌더.
    /// 웹 StickerLayer 의 흰 카드 + UpNextLogoMark 와 시각 일치. 합성 컨텍스트 안에서
    /// 회전/이동 CTM 아래 draw 되도록 UIImage 로 만들어 넘긴다.
    private static func brandLogoImage(cardW: CGFloat, cardH: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: cardW, height: cardH)).image { _ in
            let cardRect = CGRect(x: 0, y: 0, width: cardW, height: cardH)
            UIColor.white.setFill()
            UIBezierPath(roundedRect: cardRect, cornerRadius: 8).fill()

            guard let wm = UIImage(named: "Wordmark") else { return }
            let padX = cardW * 0.10
            let padY = cardH * 0.16
            let avail = CGRect(x: padX, y: padY,
                               width: cardW - 2 * padX, height: cardH - 2 * padY)
            let aspect = wm.size.height > 0 ? wm.size.width / wm.size.height : 2.673
            var dw = avail.width
            var dh = dw / aspect
            if dh > avail.height { dh = avail.height; dw = dh * aspect }
            let drawRect = CGRect(x: avail.midX - dw / 2, y: avail.midY - dh / 2,
                                  width: dw, height: dh)
            let tint = UIColor(red: 33.0 / 255, green: 39.0 / 255, blue: 39.0 / 255, alpha: 1)
            wm.withTintColor(tint, renderingMode: .alwaysOriginal).draw(in: drawRect)
        }
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
