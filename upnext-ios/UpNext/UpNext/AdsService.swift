//
//  AdsService.swift
//  UpNext — 리워드 광고 3슬롯 (AdMob, Google Mobile Ads SDK 12.x + UMP 3.x).
//
//  웹 src/lib/ads.ts 와 동일한 계약:
//   AdSlot   = reroll | coinPouch | fortune
//   AdResult = rewarded | dismissed | unavailable
//
//  정책 (docs/AdMob 광고 셋업-2026-08-25.md):
//   - 옵트인 전용: 사용자가 직접 고른 경우에만 호출. 자동 재생/배너/전면 금지.
//   - 광고가 유일한 경로가 되면 안 된다 (리롤은 코인 경로가 병존한다).
//   - App Store 9+ 등급이므로 maxAdContentRating 을 가장 낮은 등급으로 고정한다.
//     미설정 시 성인 등급 광고가 서빙되어 심사 가이드라인 2.5.18 위반 위험.
//   - 추적(ATT)은 하지 않는다. NSUserTrackingUsageDescription 을 넣지 않으며,
//     개인화 동의(UMP)를 실제로 받은 경우가 아니면 npa=1 로 요청한다.
//   - DEBUG 빌드는 구글 공식 테스트 광고 단위만 사용 (실광고 셀프 클릭/노출은
//     AdMob 계정 정지 사유), Release 만 실제 단위.
//

import GoogleMobileAds
import UIKit
import UserMessagingPlatform

/// 광고를 띄우는 자리. 지금은 세 자리 모두 같은 보상형 단위를 쓰지만,
/// 자리별 성과를 나눠 보려면 adUnitID(for:) 만 갈라 주면 된다.
enum AdSlot {
    case reroll      // 오늘의 뽑기 다시 뽑기 (코인 경로와 병존)
    case coinPouch   // 아지트 상점 데일리 코인 주머니 2배
    case fortune     // 오늘의 기운 열기
}

enum AdResult {
    case rewarded      // 끝까지 시청, 보상 조건 충족
    case dismissed     // 중도 이탈, 또는 이미 다른 광고가 떠 있음 — 조용히 복귀
    case unavailable   // 로드/표시 실패 (no fill, 계정 미승인, 오프라인, 동의 거부)
}

/// 리워드 광고의 동의→로드→표시→종료를 한 번의 async 호출로 감싼 서비스.
/// 광고가 닫히는 시점(delegate didDismiss)에 결과가 확정된다.
@MainActor
final class AdsService: NSObject {
    static let shared = AdsService()

    #if DEBUG
    /// 구글 공식 iOS 보상형 테스트 광고 단위
    private static let testAdUnitID = "ca-app-pub-3940256099942544/1712485313"
    #else
    /// AdMob iOS 보상형 광고 단위 (support_reward) — docs/AdMob 광고 셋업-2026-08-25.md
    private static let liveAdUnitID = "ca-app-pub-7625755758671333/4315153052"
    #endif

    private var started = false
    /// 이번 앱 세션에서 동의 정보 갱신(requestConsentInfoUpdate)이 성공했는지.
    /// 성공 전에는 canRequestAds 가 항상 false 라 판단 근거로 쓸 수 없다.
    private var consentResolved = false
    /// 동시 호출 가드 — 이미 한 편이 진행 중이면 새 요청은 조용히 물러난다.
    private var presenting = false
    /// present 중인 광고를 delegate 콜백까지 살려두는 참조
    private var currentAd: RewardedAd?
    private var rewarded = false
    private var finishContinuation: CheckedContinuation<Void, Never>?

    /// 광고 선택지를 UI 에 노출해도 되는지.
    /// 동의 갱신 전에는 알 수 없으므로 낙관적으로 true 를 돌려주고,
    /// 갱신까지 마친 뒤 광고 요청 자체가 막힌 경우(동의 거부)에만 false 가 된다.
    /// 실제 가용 여부는 showRewardedAd 의 .unavailable 로 확정된다.
    var isAvailable: Bool {
        guard consentResolved else { return true }
        return ConsentInformation.shared.canRequestAds
    }

    /// 리워드 광고 1회 재생. 로드까지 끝난 뒤 전체 화면으로 뜨며,
    /// 광고가 닫히는 시점에 결과가 확정된다.
    func showRewardedAd(slot: AdSlot) async -> AdResult {
        // 동시 호출 가드 — 두 카드를 연달아 탭해도 광고는 한 편만 뜬다.
        guard !presenting else { return .dismissed }
        presenting = true
        defer { presenting = false }

        startIfNeeded()

        // 동의(UMP)는 첫 광고 시점에 게으르게 처리한다. 앱 실행만으로 폼을 띄우지 않는다.
        guard await ensureConsent() else { return .unavailable }

        let request = Request()
        if ConsentInformation.shared.consentStatus != .obtained {
            // 개인화 동의를 실제로 받지 못한 상태 — 비개인화(npa=1)로 요청한다.
            // 동의를 받았다면 npa 를 붙이지 않는다.
            let extras = Extras()
            extras.additionalParameters = ["npa": "1"]
            request.register(extras)
        }

        let ad: RewardedAd
        do {
            ad = try await RewardedAd.load(with: Self.adUnitID(for: slot), request: request)
        } catch {
            return .unavailable
        }

        guard let root = Self.rootViewController() else { return .unavailable }

        ad.fullScreenContentDelegate = self
        currentAd = ad
        rewarded = false

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            finishContinuation = continuation
            ad.present(from: root) { [weak self] in
                // 보상 지급 시점 (광고 화면은 아직 열려 있음) — 닫힘은 delegate 가 처리
                self?.rewarded = true
            }
        }

        currentAd = nil
        return rewarded ? .rewarded : .dismissed
    }

    // MARK: - SDK 초기화

    private func startIfNeeded() {
        guard !started else { return }
        started = true

        // 9+ 앱이므로 가장 낮은 등급으로 상한을 건다. 초기화/로드보다 먼저 설정해야
        // 첫 요청부터 반영된다.
        MobileAds.shared.requestConfiguration.maxAdContentRating = .general

        // 완료를 기다릴 필요는 없다 — 이후 load 가 초기화 완료를 알아서 대기한다.
        MobileAds.shared.start(completionHandler: nil)
    }

    // MARK: - 동의 (UMP)

    /// 동의 정보를 갱신하고, 필요하면 동의 폼을 띄운다.
    /// canRequestAds 는 requestConsentInfoUpdate 이전에는 항상 false 이므로 순서가 중요하다.
    /// - Returns: 광고를 요청해도 되는지 여부.
    private func ensureConsent() async -> Bool {
        if consentResolved && ConsentInformation.shared.canRequestAds { return true }

        let parameters = RequestParameters()
        // 미성년 태그는 붙이지 않는다. 9+ 는 아동 대상(COPPA/13세 미만) 앱이 아니다.

        let updated: Bool = await withCheckedContinuation { continuation in
            ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { error in
                continuation.resume(returning: error == nil)
            }
        }

        // 갱신에 실패했으면(오프라인 등) 폼을 띄우지 않고, 이전 세션에서 남은
        // canRequestAds 값으로만 판단한다. 다음 호출에서 다시 시도한다.
        guard updated else { return ConsentInformation.shared.canRequestAds }
        consentResolved = true

        // EEA 등 동의가 필요한 지역에서만 폼이 뜬다. 그 외 지역은 즉시 반환된다.
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            ConsentForm.loadAndPresentIfRequired(from: Self.rootViewController()) { _ in
                continuation.resume()
            }
        }

        return ConsentInformation.shared.canRequestAds
    }

    // MARK: - 도우미

    private static func adUnitID(for slot: AdSlot) -> String {
        #if DEBUG
        // 슬롯과 무관하게 테스트 단위 — 실광고 노출 자체를 막는다.
        _ = slot
        return testAdUnitID
        #else
        // 지금은 세 자리가 하나의 보상형 단위를 공유한다.
        switch slot {
        case .reroll, .coinPouch, .fortune:
            return liveAdUnitID
        }
        #endif
    }

    private static func rootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}

extension AdsService: FullScreenContentDelegate {
    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        finishContinuation?.resume()
        finishContinuation = nil
    }

    func ad(
        _ ad: FullScreenPresentingAd,
        didFailToPresentFullScreenContentWithError error: Error
    ) {
        // 표시 실패 — rewarded=false 로 종료 (호출부에선 dismissed 와 동일하게 조용히 복귀)
        finishContinuation?.resume()
        finishContinuation = nil
    }
}
