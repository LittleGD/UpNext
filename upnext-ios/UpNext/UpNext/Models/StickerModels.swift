//
//  StickerModels.swift
//  UpNext 모델 — 폴라로이드 스티커 데이터 (Codable).
//
//  StickerLayer.swift(뷰)에서 분리 — PhotoMeta(GrowthModels)가 [Sticker] 를 담으므로
//  모델 레이어(CLI swiftc 동치성 검증 포함)에서 뷰 파일 없이 컴파일 가능해야 한다.
//  제스처/렌더링은 StickerLayer.swift 에 그대로 있다.
//

import Foundation

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
