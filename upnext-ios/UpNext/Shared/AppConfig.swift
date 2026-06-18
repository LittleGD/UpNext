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

    // MARK: - 인앱 언어 (뷰 밖에서도 읽는 단일 진실의 원천)

    /// App Group 에 저장된 인앱 언어 raw 코드("ko"/"en"/"ja"/"zh").
    /// SwiftUI `.environment(\.locale)` 는 뷰 트리 안에서만 유효하므로, 서비스·알림·
    /// 위젯 등 환경 밖 코드는 이 값을 통해 사용자가 고른 언어를 읽는다.
    static let languageKey = "appLanguageRaw"

    /// 카탈로그 로케일 식별자로 변환 — 중국어는 카탈로그가 "zh-Hans" 로 저장하므로
    /// raw "zh" 를 그대로 쓰면 zh-Hans.lproj 매칭이 보장되지 않는다. 명시 매핑.
    static func catalogLocaleIdentifier(_ raw: String) -> String {
        raw == "zh" ? "zh-Hans" : raw
    }

    /// 저장된 인앱 언어를 카탈로그용 Locale 로. `String(localized:locale:)` 의 locale
    /// 인자로 넘기면 기기 로케일이 아닌 *앱에서 고른 언어*로 카탈로그를 해석한다.
    static var currentLocale: Locale {
        let raw = sharedDefaults?.string(forKey: languageKey) ?? "ko"
        return Locale(identifier: catalogLocaleIdentifier(raw))
    }

    /// 인앱 언어로 카탈로그 문자열을 해석(뷰 밖 공용 헬퍼). 기기 로케일을 쓰는
    /// `String(localized:)` 의 인앱-언어 무시 버그를 한 곳에서 차단.
    static func loc(_ key: String.LocalizationValue) -> String {
        String(localized: key, locale: currentLocale)
    }

    /// 런타임 한국어 콘텐츠 문자열(몬스터·장비·던전·스킬명 등 게임 데이터)을 카탈로그
    /// 키로 해석. 데이터가 한국어 원문을 그대로 보유하고 그 원문이 카탈로그 키로 등록된
    /// 경우 사용. 미등록 키는 원문(한국어)을 그대로 반환(안전 폴백).
    static func locRuntime(_ korean: String) -> String {
        korean.isEmpty ? korean
            : String(localized: String.LocalizationValue(korean), locale: currentLocale)
    }

    /// GameStore 가 progress.language 변경 시 호출 — 공유 저장소에 반영.
    static func persistLanguage(_ raw: String) {
        sharedDefaults?.set(raw, forKey: languageKey)
    }
}
