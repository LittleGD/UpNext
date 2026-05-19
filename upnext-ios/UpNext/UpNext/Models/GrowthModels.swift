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
//  웹의 Sticker(폴라로이드 데코)는 "추후 확장용"이라 condensed.
//

import Foundation

/// 인증 사진 메타데이터. 웹 `PhotoMeta`.
struct PhotoMeta: Codable, Identifiable, Equatable {
    let id: String                  // "vp_{timestamp}"
    var challengeCardId: String?    // 챌린지 인증 사진이면 그 카드 id
    var challengeTitle: String?     // 카드 제목 스냅샷 (아카이브 라벨)
    var category: Category?         // 챌린지 카테고리
    var date: String                // "2026-05-18" (로컬 날짜)
    var timestamp: Int              // epoch ms
    var memo: String                // 뒷면 메모 (최대 200자)
}
