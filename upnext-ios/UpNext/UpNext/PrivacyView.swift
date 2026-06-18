//
//  PrivacyView.swift
//  UpNext — 개인정보 처리방침 화면 (Phase 4 슬라이스 4).
//
//  웹 src/app/privacy/page.tsx 를 포팅. 설정 화면에서 sheet 로 표시된다.
//
//  본문은 네이티브 앱 기준으로 정정됨 — 웹 전용 표현(IndexedDB·Vercel Analytics)
//  제거, 저장소를 '기기 내부', 인증을 'Apple/Google'로 표기. 법적 고지 문서이므로
//  서비스 변경 시 함께 갱신할 것.
//

import SwiftUI

struct PrivacyView: View {
    @Environment(\.dismiss) private var dismiss

    private struct Clause {
        let title: String
        let body: String
    }

    private let lastUpdated = "최종 수정일: 2026년 4월 17일"

    private let clauses: [Clause] = [
        Clause(
            title: "1. 개요",
            body: "UpNext(이하 '앱')는 사용자의 개인정보를 소중히 다룹니다. 본 방침은 앱이 어떤 데이터를 수집하고 어떻게 활용하는지 설명합니다."),
        Clause(
            title: "2. 수집하는 데이터",
            body: "앱은 챌린지 진행 상황, 설정값, 사진 등 앱 이용에 필요한 데이터를 기기 내 로컬 저장소에 보관합니다. Apple 또는 Google 로그인을 사용할 경우 이메일 주소와 표시 이름이 인증 목적으로 수집됩니다. 주간 악몽 던전 리더보드에 참여하면 표시 이름·점수·층수·영웅 레벨·클래스가 다른 이용자에게 공개됩니다 (로그인하지 않으면 미참여, 로컬 기록만 유지)."),
        Clause(
            title: "3. 데이터 이용 목적",
            body: "수집된 데이터는 챌린지 기록 저장, 기기 간 동기화, 리더보드 순위 산정, 앱 기능 개선 목적으로만 사용됩니다. 광고나 마케팅 목적으로 사용되지 않습니다."),
        Clause(
            title: "4. 제3자 제공",
            body: "앱은 사용자의 개인정보를 제3자에게 판매하지 않습니다. 단, 다음 서비스 제공자를 사용합니다. Firebase(Google) — 로그인, 클라우드 동기화, 리더보드 저장. 해당 서비스의 개인정보 처리방침이 적용됩니다. 사진 파일은 기기 내부에만 저장되며 외부로 전송되지 않습니다."),
        Clause(
            title: "5. 데이터 삭제",
            body: "설정 화면의 '데이터 초기화' 버튼을 통해 모든 로컬 및 클라우드 데이터를 삭제할 수 있습니다. 앱을 삭제하면 기기 내 데이터가 자동으로 제거됩니다."),
        Clause(
            title: "6. 문의",
            body: "개인정보 관련 문의는 jmjplearner@gmail.com으로 연락해 주세요."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(lastUpdated)
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                    ForEach(clauses, id: \.title) { clause in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(clause.title)
                                .typography(.body)
                                .foregroundStyle(Color.textPrimary)
                            Text(clause.body)
                                .typography(.caption)
                                .foregroundStyle(Color.textSecondary)
                        }
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    private var header: some View {
        HStack {
            Text("개인정보 처리방침")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Button("닫기") { dismiss() }
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }
}
