//
//  GrowthStore.swift
//  UpNext — Growth(인증 사진) 스토어 (Phase 4 슬라이스 28 · Phase 4.5 시작).
//
//  웹 src/store/useGrowthStore.ts 재설계. 웹은 메타를 localStorage, 이미지 blob 을
//  IndexedDB 에 분리 저장 — 네이티브는 메타를 JSON 파일, 이미지를 JPEG 파일로
//  (Application Support/growth/). 사진도 Up Hero 처럼 기기 로컬 전용.
//
//  슬라이스 28 — 저장 + 앨범. 캡처 플로우(폴라로이드 편집·메모)와 챌린지 완료
//  연동, 사진 부적은 이후 슬라이스. 지금은 PhotosPicker 로 자유 추가/삭제만.
//

import SwiftUI
import Combine  // ObservableObject / @Published

@MainActor
final class GrowthStore: ObservableObject {

    /// 인증 사진 메타 — 최신이 앞. 화면은 이걸 구독.
    @Published private(set) var photoMetas: [PhotoMeta] = []

    /// 로드된 이미지 메모리 캐시 — 그리드가 매 렌더 디스크를 안 읽도록.
    private var imageCache: [String: UIImage] = [:]

    init() {
        photoMetas = Self.loadMetas()
    }

    // MARK: - 액션

    /// 사진 추가 — 이미지를 JPEG 로 재인코딩해 파일로 저장하고 메타를 등록. 웹 addPhoto.
    /// memo·challenge 메타는 슬라이스 28 에선 비움 (자유 추가 사진).
    func addPhoto(imageData: Data) {
        guard let image = UIImage(data: imageData),
              let jpeg = image.jpegData(compressionQuality: 0.85) else { return }
        let id = "vp_\(UpHeroStore.nowMillis())"
        guard Self.saveImage(jpeg, id: id) else { return }
        let meta = PhotoMeta(
            id: id, challengeCardId: nil, challengeTitle: nil, category: nil,
            date: GameStore.todayString(), timestamp: UpHeroStore.nowMillis(), memo: "")
        imageCache[id] = image
        photoMetas.insert(meta, at: 0)   // 최신이 앞
        Self.saveMetas(photoMetas)
    }

    /// 사진 삭제 — 메타·캐시·파일 모두 제거. 웹 deletePhoto.
    func deletePhoto(_ id: String) {
        photoMetas.removeAll { $0.id == id }
        imageCache[id] = nil
        Self.deleteImage(id: id)
        Self.saveMetas(photoMetas)
    }

    /// 사진 이미지 로드 (메모리 캐시). 파일이 없으면 nil.
    func image(for id: String) -> UIImage? {
        if let cached = imageCache[id] { return cached }
        guard let img = UIImage(contentsOfFile: Self.imageURL(id).path) else { return nil }
        imageCache[id] = img
        return img
    }

    // MARK: - 파일 저장 (Application Support/growth/)

    private static var dir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("growth", isDirectory: true)
    }
    private static func imageURL(_ id: String) -> URL {
        dir.appendingPathComponent("\(id).jpg")
    }
    private static var metasURL: URL {
        dir.appendingPathComponent("metas.json")
    }

    private static func ensureDir() {
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
    }

    /// 이미지 JPEG 데이터를 파일로 기록. 성공 여부 반환.
    private static func saveImage(_ jpeg: Data, id: String) -> Bool {
        ensureDir()
        do {
            try jpeg.write(to: imageURL(id), options: .atomic)
            return true
        } catch {
            return false
        }
    }

    private static func deleteImage(id: String) {
        try? FileManager.default.removeItem(at: imageURL(id))
    }

    /// 메타 목록 복원. 파일이 없거나 손상되면 빈 배열.
    private static func loadMetas() -> [PhotoMeta] {
        guard let data = try? Data(contentsOf: metasURL),
              let metas = try? JSONDecoder().decode([PhotoMeta].self, from: data)
        else { return [] }
        return metas
    }

    /// 메타 목록을 JSON 파일로 기록. 실패는 무시 (best-effort).
    private static func saveMetas(_ metas: [PhotoMeta]) {
        ensureDir()
        guard let data = try? JSONEncoder().encode(metas) else { return }
        try? data.write(to: metasURL, options: .atomic)
    }
}
