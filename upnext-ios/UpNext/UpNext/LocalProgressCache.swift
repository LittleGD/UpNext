//
//  LocalProgressCache.swift
//  UpNext — 익명 모드 로컬 진행 캐시 (R1 — UI/인터랙션 회복).
//
//  웹 src/lib/storage.ts 의 localStorage 기반 progress/daily/retention 저장을
//  네이티브로 포팅. *익명 모드의 진실의 원천*. 로그인 시 SyncManager 가
//  이 캐시와 클라우드를 머지한다 (MergeConflictDialog 분기).
//
//  저장 위치: Application Support/local-progress.json (단일 파일, atomic write).
//  AppGroup 도 검토했으나 위젯은 widgetState 별도 경로 사용 → 메인 캐시는
//  앱 sandbox 만 (재설치 시 청소되는 게 자연스러움).
//
//  설계 결정:
//   - JSON 단일 파일 — Codable 의 round-trip 동치성 + 디버깅 가독성.
//   - atomic write — 앱이 mid-write 강제 종료돼도 부분 파일 생기지 않음.
//   - decode 실패 시 nil 반환 — 호출부 (GameStore) 가 fresh state 로 폴백.
//

import Foundation

/// 익명 모드에서 사용자 데이터를 로컬에 저장하는 단일 캐시.
/// 로그인 시 이 캐시 ↔ Firestore 의 머지 비교 대상.
struct LocalProgressCache: Codable {
    var progress: UserProgress
    var daily: DailyState
    var retention: RetentionState
    /// 캐시 저장 시점 (ms epoch). 클라우드 머지 시 stale 판단의 보조 정보.
    var savedAt: Int

    init(progress: UserProgress, daily: DailyState, retention: RetentionState,
         savedAt: Int = Int(Date().timeIntervalSince1970 * 1000)) {
        self.progress = progress
        self.daily = daily
        self.retention = retention
        self.savedAt = savedAt
    }
}

enum LocalProgressCacheStore {

    /// 저장 파일 — Application Support/local-progress.json.
    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
        return dir.appendingPathComponent("local-progress.json")
    }

    /// 현재 캐시 로드. 파일이 없거나 손상이면 nil — 호출부가 fresh state 로 폴백.
    static func load() -> LocalProgressCache? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(LocalProgressCache.self, from: data)
    }

    /// 캐시 저장 — atomic. 실패는 silent (best-effort: 익명 모드 진행 보존이 *권장 사항*
    /// 이지 *보장 사항* 은 아님. 영구 보존을 원하면 로그인이 정답).
    static func save(_ cache: LocalProgressCache) {
        ensureDir()
        guard let data = try? JSONEncoder().encode(cache) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// 헬퍼 — progress/daily/retention 3개로 저장.
    static func save(progress: UserProgress, daily: DailyState, retention: RetentionState) {
        save(LocalProgressCache(progress: progress, daily: daily, retention: retention))
    }

    /// 캐시 삭제 — 로그아웃 + 머지 후 "클라우드 선택" 시 호출 (로컬은 더이상 진실 아님).
    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }

    /// 캐시 존재 여부 — handleAuthState .signedOut 에서 익명 부트 분기 판단.
    static func exists() -> Bool {
        FileManager.default.fileExists(atPath: fileURL.path)
    }

    /// 캐시 파일 위치 — Application Support 가 없으면 만들어 둔다 (write 실패 방지).
    private static func ensureDir() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
}
