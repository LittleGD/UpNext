//
//  AppConfig.swift
//  UpNext — App + Widget Extension 양쪽 타깃이 공유하는 설정 상수.
//
//  Target Membership: UpNext ✅ + UpNextWidgetExtension ✅
//  매직 스트링(App Group ID, Firestore 경로 등)의 단일 진실의 원천.
//  새로 공유가 필요한 상수가 생기면 여기에 추가.
//

import Foundation

enum AppConfig {
    /// App Group — App과 Widget Extension이 UserDefaults를 공유하는 컨테이너.
    /// ⚠️ 이 값은 UpNext.entitlements / UpNextWidget.entitlements의
    ///    com.apple.security.application-groups 항목과 반드시 문자 단위로 일치해야 함.
    static let appGroupId = "group.com.littlegd.upnext"

    /// App Group 공유 UserDefaults — Widget 데이터 read/write 공용 채널.
    /// nil이면 entitlement 누락 (개발 중 빌드 설정 오류) — 호출부에서 guard.
    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // MARK: - Firestore 스키마 (웹 src/lib/sync.ts와 동일)

    /// 최상위 유저 컬렉션. 유저 progress/daily가 /users/{uid} 단일 문서에 저장됨.
    static let firestoreUsersCollection = "users"
}
