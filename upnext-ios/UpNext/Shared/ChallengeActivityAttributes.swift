//
//  ChallengeActivityAttributes.swift
//  Live Activity 데이터 모델 — App + Widget Extension 양쪽 타깃에 추가 필수.
//
//  Xcode 우측 File Inspector → Target Membership: App ✅ + UpNextWidget ✅
//

import Foundation
import ActivityKit

@available(iOS 16.1, *)
public struct ChallengeActivityAttributes: ActivityAttributes {
    /// 챌린지 진행 중 변하는 상태값. 만료 시각은 카운트다운 렌더링에 사용.
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var expiresAt: Date

        public init(title: String, expiresAt: Date) {
            self.title = title
            self.expiresAt = expiresAt
        }
    }

    /// Activity 시작 시점에 고정되는 식별자 — JS의 challenge.id와 매칭
    public var challengeId: String

    public init(challengeId: String) {
        self.challengeId = challengeId
    }
}
