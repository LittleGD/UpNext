//
//  UpNextApp.swift
//  UpNext — Native iOS App entry point.
//
//  Firebase iOS SDK 초기화 + SwiftUI Scene 생성.
//  Phase 0.3에서 Capacitor 플러그인을 폐기하고 native Firebase SDK 직통합.
//

import SwiftUI
import FirebaseCore

@main
struct UpNextApp: App {
    init() {
        // Firebase iOS SDK 초기화 — GoogleService-Info.plist를 읽어 FirebaseApp.default 설정.
        // FirebaseAuth/Firestore/Messaging 등 모든 Firebase 서비스가 이 시점 이후 사용 가능.
        FirebaseApp.configure()

        // 커스텀 폰트(April16th-Promise) 런타임 등록 — typography(_:) 모디파이어가 쓰는 폰트.
        AppFont.register()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
