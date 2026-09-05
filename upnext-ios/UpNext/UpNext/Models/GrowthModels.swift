//
//  GrowthModels.swift
//  UpNext 모델 — Growth(인증 사진) 시스템 (Phase 4 슬라이스 28 · Phase 4.5 시작).
//
//  웹 src/types/growth.ts 의 PhotoMeta 포팅. 이미지 자체는 파일로 저장되고
//  (GrowthStore) 여기엔 경량 메타데이터만 — 웹의 IndexedDB blob + localStorage meta
//  분리 구조를 네이티브 파일 시스템으로 옮긴 것.
//
//  challengeCardId 등 챌린지 인증 필드는 Optional 로 둔다 — 슬라이스 28 의 앨범은
//  챌린지에 묶이지 않은 자유 사진도 담는다. 챌린지 완료 → 사진 연결은 이후 슬라이스.
//  Sticker(폴라로이드 데코)도 여기 둔다 — PhotoMeta 가 저장하는 순수 값 타입이라 웹
//  src/types/growth.ts 와 같은 자리. 화면 조작(드래그·핀치)은 StickerLayer.swift.
//
//  이 파일은 Foundation 전용이어야 한다 — scripts/verify-equivalence.sh 의 sync 스위트가
//  FirestoreModels → Retention → PhotoMeta 체인으로 이 파일을 swiftc 단독 컴파일한다.
//  (뷰·스토어 타입을 참조하면 그 스위트가 깨진다.)
//

import Foundation

/// 폴라로이드 위 스티커 한 장. 웹 `Sticker`(src/types/growth.ts).
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

/// epoch ms — UpHeroStore.nowMillis() 와 같은 값. 스토어를 참조하지 않으려고 여기 둔다.
private func nowMillis() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
}

/// 인증 사진 메타데이터. 웹 `PhotoMeta`.
struct PhotoMeta: Codable, Identifiable, Equatable {
    let id: String                  // "vp_{timestamp}"
    var kind: PhotoKind = .free     // 자유 사진 vs 챌린지 로그
    var challengeCardId: String? = nil  // 챌린지 인증 사진이면 그 카드 id
    var challengeTitle: String? = nil   // 카드 제목 스냅샷 (아카이브 라벨)
    var category: Category? = nil       // 챌린지 카테고리
    var date: String                // "2026-05-18" (로컬 날짜)
    var timestamp: Int              // epoch ms
    var memo: String                // 뒷면 메모 (최대 200자)
    var timeSlot: String? = nil     // "09:00" 등 2초 로그 타임슬롯
    var caption: String? = nil      // 짧은 로그 캡션
    var weekId: String? = nil       // 월요일 시작 주간 key

    // P0-4 — 폴라로이드 데코 메타 (옵셔널). 이전 버전 PhotoMeta(JSON) 에는 이 필드가
    // 없으므로 디코더가 nil/빈배열로 폴백 (커스텀 init(from:) 에서 처리). 기존 사진은
    // 변환·삭제 없이 그대로 로드되므로 마이그레이션 안전.
    var signatureData: Data? = nil  // PKDrawing.dataRepresentation() — 서명
    var stickers: [Sticker] = []    // 폴라로이드 위 스티커 배치
}

extension PhotoMeta {
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? "vp_\(nowMillis())"
        kind = (try? c.decode(PhotoKind.self, forKey: .kind)) ?? .free
        challengeCardId = try? c.decode(String.self, forKey: .challengeCardId)
        challengeTitle = try? c.decode(String.self, forKey: .challengeTitle)
        category = try? c.decode(Category.self, forKey: .category)
        date = (try? c.decode(String.self, forKey: .date)) ?? AppClock.todayString()
        timestamp = (try? c.decode(Int.self, forKey: .timestamp)) ?? nowMillis()
        memo = (try? c.decode(String.self, forKey: .memo)) ?? ""
        timeSlot = try? c.decode(String.self, forKey: .timeSlot)
        caption = try? c.decode(String.self, forKey: .caption)
        weekId = try? c.decode(String.self, forKey: .weekId)
        // P0-4 — 신규 옵셔널 필드. 이전 버전 JSON 에는 없으므로 nil/빈배열 폴백.
        signatureData = try? c.decode(Data.self, forKey: .signatureData)
        stickers = (try? c.decode([Sticker].self, forKey: .stickers)) ?? []
    }
}
