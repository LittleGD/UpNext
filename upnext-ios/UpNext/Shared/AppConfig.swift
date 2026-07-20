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

    /// 인앱 언어의 `.lproj` 서브번들. `String(localized:bundle:)` 또는
    /// `bundle.localizedString(forKey:)` 의 bundle 인자로 넘기면, 기기 로케일과 무관하게
    /// 이 서브번들의 단일 언어 테이블만 조회되어 인앱 언어로 확정 해석된다.
    ///
    /// 왜 필요한가(10-i18n-leaks(b)): `String(localized:key, locale:)` 의 `locale:` 인자는
    /// 숫자·복수·문법 포매팅에만 쓰이고 *현지화 테이블(.lproj) 선택에는 관여하지 않는다*.
    /// 테이블은 번들 선호언어(기기언어 ∩ 앱 로케일)로 고정 선택되므로, 기기 시스템언어가
    /// 인앱 언어와 다르면(리포터: 기기 영어·인앱 한국어) loc/locRuntime 이 기기언어 테이블을
    /// 읽어 콘텐츠가 기기 언어로 샜다. 서브번들을 직접 지정하면 이를 확정 차단한다.
    /// (SwiftUI `Text`(LocalizedStringKey) 경로는 ContentView 의 `.environment(\.locale)` 로
    ///  테이블을 실제 전환하므로 정상 — 여기서 뷰 밖 헬퍼를 동일 언어로 정합시킨다.)
    /// 언어 키 기반 캐시 — loc/locRuntime 이 매 호출마다 파일시스템 조회(Bundle.main.path)
    /// + Bundle 인스턴스화를 반복하던 비용 제거(코드리뷰 perf-1). `static let` 고정 캐시는
    /// 인앱 언어 변경 시 동결되는 static-freeze 버그 클래스라 금지 — 언어 id 가 바뀌면
    /// 재해석하는 키드 캐시로만. (loc 호출은 사실상 메인스레드 한정이라 락 불필요.)
    private static var bundleCache: (id: String, bundle: Bundle?)?
    static var inAppBundle: Bundle? {
        let id = catalogLocaleIdentifier(sharedDefaults?.string(forKey: languageKey) ?? "ko")
        if let c = bundleCache, c.id == id { return c.bundle }
        let bundle = Bundle.main.path(forResource: id, ofType: "lproj").flatMap { Bundle(path: $0) }
        bundleCache = (id, bundle)
        return bundle
    }

    /// 인앱 언어로 카탈로그 문자열을 해석(뷰 밖 공용 헬퍼). 인앱 언어 `.lproj` 서브번들을
    /// bundle 인자로 직접 지정해 테이블을 확정한다(10-i18n-leaks(b)) — `String.LocalizationValue`
    /// 보간(`%@`/`%lld` 인자)은 네이티브로 유지되고, 숫자 포맷은 currentLocale 을 따른다.
    static func loc(_ key: String.LocalizationValue) -> String {
        String(localized: key, bundle: inAppBundle ?? .main, locale: currentLocale)
    }

    /// 인앱 언어의 .lproj 번들을 직접 로드해 키를 해석. `String(localized:locale:)` 는
    /// 위젯 익스텐션 프로세스에서 테이블 언어를 바꾸지 못해(시스템 언어로 떨어짐) 위젯
    /// chrome 이 데이터와 다른 언어로 나오는 문제가 있다. 번들 직접 조회는 확실히 동작.
    /// 키 자체를 value 로 넘겨, 누락 시 키 대신 깨진 출력 대신 키문자열을 그대로 반환.
    static func locBundled(_ key: String) -> String {
        (inAppBundle ?? .main).localizedString(forKey: key, value: key, table: nil)
    }

    /// 런타임 한국어 콘텐츠 문자열(몬스터·장비·던전·스킬명 등 게임 데이터)을 카탈로그
    /// 키로 해석. 데이터가 한국어 원문을 그대로 보유하고 그 원문이 카탈로그 키로 등록된
    /// 경우 사용. 미등록 키는 원문(한국어)을 그대로 반환(안전 폴백).
    ///
    /// 10-i18n-leaks(b): 인앱 언어 서브번들에서 직접 조회(locBundled)해 기기 로케일이 아닌
    /// 앱 언어로 확정 해석한다(구 구현은 `String(localized:locale:)` 라 기기언어로 샜다).
    static func locRuntime(_ korean: String) -> String {
        korean.isEmpty ? korean : locBundled(korean)
    }

    /// GameStore 가 progress.language 변경 시 호출 — 공유 저장소에 반영.
    static func persistLanguage(_ raw: String) {
        sharedDefaults?.set(raw, forKey: languageKey)
    }
}
