//
//  ContentView.swift
//  UpNext — 앱 루트 뷰.
//
//  현재는 마이그레이션 검증용 2탭:
//   - 디자인 시스템 갤러리 (Phase 1 산출물)
//   - Auth / Sync 검증 (Phase 3 산출물 — Phase 0.4 FirebaseCheckView 후속)
//
//  Phase 4에서 실제 Daily Home / Collection / Camp 등 화면으로 교체될 예정.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            DesignSystemGallery()
                .tabItem { Label("디자인", systemImage: "paintpalette") }

            SyncDevView()
                .tabItem { Label("Auth/Sync", systemImage: "person.crop.circle.badge.checkmark") }
        }
        .tint(Color.accentPrimary)
    }
}

#Preview {
    ContentView()
}
