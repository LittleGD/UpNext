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

    /// 디스크 IO 전용 serial 큐 — encode + atomic write / clear 를 메인스레드 밖에서.
    /// 14-completion-delay: 익명 완료 틱마다 progress/daily/retention didSet →
    ///   persistLocalIfAnonymous 가 메인에서 encode + atomic write(temp+fsync+rename)를
    ///   돌려 완료 틱 메인스레드를 붙잡던 비용을 오프메인. save 와 clear 를 같은 serial
    ///   큐로 태워 FIFO 순서를 보장 → clear 뒤 도착한 stale save 가 파일을 되살리지 않게 한다.
    private static let ioQueue = DispatchQueue(
        label: "com.littlegd.upnext.localcache.persist", qos: .utility)

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
    /// 메인에서는 값 스냅샷(cache — 순수 Codable struct)만 받고, 인코딩·atomic write 는
    /// background serial 큐로 넘긴다.
    static func save(_ cache: LocalProgressCache) {
        // 인코딩은 호출 컨텍스트(메인)에서 — @MainActor 격리 Codable 을 nonisolated 큐에서
        // 쓰지 않도록. 무거운 atomic 파일쓰기만 background serial 큐로 (Data 는 Sendable).
        let url = fileURL
        guard let data = try? JSONEncoder().encode(cache) else { return }
        ioQueue.async {
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url, options: .atomic)
        }
    }

    /// 헬퍼 — progress/daily/retention 3개로 저장.
    static func save(progress: UserProgress, daily: DailyState, retention: RetentionState) {
        save(LocalProgressCache(progress: progress, daily: daily, retention: retention))
    }

    /// 캐시 삭제 — 로그아웃 + 머지 후 "클라우드 선택" 시 호출 (로컬은 더이상 진실 아님).
    /// save 와 동일 serial 큐로 태워 pending save 뒤에 순서대로 실행(파일 되살아남 방지).
    static func clear() {
        let url = fileURL
        ioQueue.async { try? FileManager.default.removeItem(at: url) }
    }

    /// 캐시 존재 여부 — handleAuthState .signedOut 에서 익명 부트 분기 판단.
    static func exists() -> Bool {
        FileManager.default.fileExists(atPath: fileURL.path)
    }
}
