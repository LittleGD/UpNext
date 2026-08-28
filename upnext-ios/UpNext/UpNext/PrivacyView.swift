//
//  PrivacyView.swift
//  UpNext — 개인정보 처리방침 화면 (Phase 4 슬라이스 4).
//
//  웹 src/app/privacy/page.tsx 를 포팅. 설정 화면에서 sheet 로 표시된다.
//
//  본문은 네이티브 앱 기준으로 정정됨: 웹 전용 표현(IndexedDB·Vercel Analytics)
//  제거, 저장소를 '기기 내부', 인증을 'Apple/Google'로 표기. 법적 고지 문서이므로
//  서비스 변경 시 함께 갱신할 것.
//
//  본문 전체가 카탈로그 키(한국어 원문)로 등록돼 있다. 뷰 밖 헬퍼가 아니라 뷰 안이지만
//  AppConfig.loc 을 쓰는 이유: Text(LocalizedStringKey) 는 리터럴만 키로 잡아 주고,
//  여기처럼 [Clause] 배열에 담긴 String 은 잡지 못한다. 문구를 고칠 때는 카탈로그의
//  en/ja/zh-Hans 번역도 반드시 함께 갱신할 것.
//

import SwiftUI

struct PrivacyView: View {
    @Environment(\.dismiss) private var dismiss

    private struct Clause {
        let title: String
        let body: String
    }

    // 인앱 언어를 바꾸면 다시 해석돼야 하므로 저장 프로퍼티가 아니라 계산 프로퍼티로 둔다.
    private var lastUpdated: String { AppConfig.loc("최종 수정일: 2026년 8월 26일") }

    private var clauses: [Clause] {
        [
            Clause(
                title: AppConfig.loc("1. 개요"),
                body: AppConfig.loc(
                    "UpNext(이하 '앱')는 사용자의 개인정보를 소중히 다룹니다. 본 방침은 앱이 어떤 데이터를 수집하고 어떻게 활용하는지 설명합니다.")),
            Clause(
                title: AppConfig.loc("2. 수집하는 데이터"),
                body: AppConfig.loc(
                    "앱은 챌린지 진행 상황, 설정값, 사진 등 앱 이용에 필요한 데이터를 기기 내 로컬 저장소에 보관합니다. Apple 또는 Google 로그인을 사용할 경우 이메일 주소와 표시 이름이 인증 목적으로 수집됩니다. 주간 악몽 던전 리더보드에 참여하면 표시 이름·점수·층수·영웅 레벨·클래스가 다른 이용자에게 공개됩니다 (로그인하지 않으면 미참여, 로컬 기록만 유지). 광고를 시청하면 Google AdMob SDK가 기기 및 앱 정보, 대략적인 위치(IP 주소 기반 국가 수준), 광고 상호작용 기록을 수집합니다. 앱은 추적 권한(App Tracking Transparency)을 요청하지 않으므로 기기 광고 식별자(IDFA)에 접근하지 않습니다. 앱은 이름, 생년월일, 나이, 연락처, 정확한 위치 정보를 수집하지 않습니다.")),
            Clause(
                title: AppConfig.loc("3. 데이터 이용 목적"),
                body: AppConfig.loc(
                    "수집된 데이터는 챌린지 기록 저장, 기기 간 동기화, 리더보드 순위 산정, 앱 기능 개선, 그리고 앱 내 광고 제공에 사용됩니다. 광고는 이용자가 직접 선택해 시청하는 보상형 광고이며 자동으로 재생되지 않습니다. 앱은 비개인화 광고를 기본으로 요청하며, 이 경우에도 노출 빈도 제한, 집계 리포팅, 부정 클릭 방지를 위해 기기 식별 정보가 사용될 수 있습니다. 개인 맞춤 광고는 이용자가 동의한 경우에만 제공됩니다. 앱은 개인정보를 판매하지 않습니다.")),
            Clause(
                title: AppConfig.loc("4. 제3자 제공"),
                body: AppConfig.loc(
                    "앱은 사용자의 개인정보를 제3자에게 판매하지 않습니다. 단, 다음 서비스 제공자를 사용합니다. Firebase(Google): 로그인, 클라우드 동기화, 리더보드 저장. Google AdMob: 보상형 광고 제공 및 측정. 각 서비스의 개인정보 처리방침이 적용됩니다. 사진 파일은 기기 내부에만 저장되며 외부로 전송되지 않습니다.")),
            Clause(
                title: AppConfig.loc("5. 데이터 삭제와 광고 설정"),
                body: AppConfig.loc(
                    "설정 화면의 '데이터 초기화' 버튼을 통해 모든 로컬 및 클라우드 데이터를 삭제할 수 있습니다. 앱을 삭제하면 기기 내 데이터가 자동으로 제거됩니다. 유럽경제지역(EEA), 영국, 스위스 이용자에게는 첫 광고를 재생하기 직전에 Google 동의 관리 플랫폼(UMP)의 동의 화면이 표시되며, 여기서 선택한 내용에 따라 개인 맞춤 광고 제공 여부가 결정됩니다. 동의하지 않으면 개인 맞춤 광고가 제공되지 않고 광고 시청 보상 기능을 이용하지 못할 수 있으나, 광고와 무관한 기능은 그대로 이용할 수 있습니다. 선택을 바꾸려면 앱을 삭제하고 다시 설치하면 동의 화면이 다시 표시됩니다.")),
            Clause(
                title: AppConfig.loc("6. 문의"),
                body: AppConfig.loc(
                    "개인정보 관련 문의는 jmjplearner@gmail.com으로 연락해 주세요.")),
        ]
    }

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
