//
//  WidgetBridge.swift
//  Capacitor 커스텀 플러그인 — JS ↔ WidgetKit/ActivityKit 데이터 브릿지.
//
//  역할:
//   1. JS에서 호출한 위젯 상태 payload를 App Group 공유 UserDefaults에 기록
//   2. WidgetCenter.reloadAllTimelines() 호출로 위젯 즉시 갱신
//   3. (Part C) Live Activity start/end — 4시간 챌린지 카운트다운
//
//  App Group: group.com.littlegd.upnext (양쪽 타깃에 capability 등록 필수)
//

import Foundation
import Capacitor
import WidgetKit
import ActivityKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startChallengeActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endChallengeActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAllActivities", returnType: CAPPluginReturnPromise),
    ]

    private static let appGroupId = "group.com.littlegd.upnext"
    private static let widgetStateKey = "widgetState"
    private static let activityIdMapKey = "challengeActivityIdMap"

    // MARK: - Widget state push

    @objc func updateWidget(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
            call.reject("App Group UserDefaults init failed — check entitlements")
            return
        }

        // JS payload는 { streak: number, todayCount: number, todayDone: number, xp: number, level: number, levelTitle?: string }
        // CAPPluginCall.options를 [String: Any]로 캐스팅해서 그대로 직렬화. 필드 명세는 WidgetState.swift에서 강제.
        let payload: [String: Any] = [
            "streak": call.getInt("streak") ?? 0,
            "todayCount": call.getInt("todayCount") ?? 0,
            "todayDone": call.getInt("todayDone") ?? 0,
            "xp": call.getInt("xp") ?? 0,
            "xpForNext": call.getInt("xpForNext") ?? 140,
            "level": call.getInt("level") ?? 1,
            "levelTitle": call.getString("levelTitle") ?? "",
            "mainChallengeTitle": call.getString("mainChallengeTitle") ?? "",
            "updatedAt": Date().timeIntervalSince1970,
        ]

        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            defaults.set(data, forKey: Self.widgetStateKey)
            // iOS 14+: WidgetCenter는 모든 family/configuration의 timeline을 다시 요청
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve(["ok": true])
        } else {
            call.reject("payload serialization failed")
        }
    }

    // MARK: - Live Activity (iOS 16.1+)

    @objc func startChallengeActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            // 사용자가 시스템 설정에서 Live Activity 비활성화함 — 조용히 성공 반환
            call.resolve(["supported": true, "enabled": false])
            return
        }
        guard let challengeId = call.getString("challengeId"),
              let title = call.getString("title"),
              let expiresAtMs = call.getDouble("expiresAt") else {
            call.reject("challengeId, title, expiresAt 필수")
            return
        }
        let expiresAt = Date(timeIntervalSince1970: expiresAtMs / 1000.0)

        let attributes = ChallengeActivityAttributes(challengeId: challengeId)
        let initialState = ChallengeActivityAttributes.ContentState(
            title: title,
            expiresAt: expiresAt
        )

        do {
            let activity = try Activity<ChallengeActivityAttributes>.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: expiresAt),
                pushType: nil
            )
            // challengeId → activity.id 매핑을 App Group에 저장 (end할 때 lookup)
            saveActivityId(activity.id, for: challengeId)
            call.resolve(["activityId": activity.id, "supported": true, "enabled": true])
        } catch {
            call.reject("Live Activity 시작 실패: \(error.localizedDescription)")
        }
    }

    @objc func endChallengeActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        guard let challengeId = call.getString("challengeId") else {
            call.reject("challengeId 필수")
            return
        }

        Task {
            // challengeId로 매핑된 activity를 종료
            let targetId = self.lookupActivityId(for: challengeId)
            for activity in Activity<ChallengeActivityAttributes>.activities {
                if activity.attributes.challengeId == challengeId || activity.id == targetId {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            self.removeActivityId(for: challengeId)
            call.resolve(["ok": true])
        }
    }

    @objc func endAllActivities(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        Task {
            for activity in Activity<ChallengeActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.clearActivityIdMap()
            call.resolve(["ok": true])
        }
    }

    // MARK: - Helpers

    private func saveActivityId(_ activityId: String, for challengeId: String) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return }
        var map = defaults.dictionary(forKey: Self.activityIdMapKey) as? [String: String] ?? [:]
        map[challengeId] = activityId
        defaults.set(map, forKey: Self.activityIdMapKey)
    }

    private func lookupActivityId(for challengeId: String) -> String? {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return nil }
        let map = defaults.dictionary(forKey: Self.activityIdMapKey) as? [String: String] ?? [:]
        return map[challengeId]
    }

    private func removeActivityId(for challengeId: String) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return }
        var map = defaults.dictionary(forKey: Self.activityIdMapKey) as? [String: String] ?? [:]
        map.removeValue(forKey: challengeId)
        defaults.set(map, forKey: Self.activityIdMapKey)
    }

    private func clearActivityIdMap() {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return }
        defaults.removeObject(forKey: Self.activityIdMapKey)
    }
}
