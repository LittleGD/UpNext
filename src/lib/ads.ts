/**
 * 리워드 광고 레이어 (AdMob) — 3개 슬롯이 공유한다.
 *
 *  - "reroll"    : 오늘의 카드 다시 뽑기 (코인 결제 경로와 병존)
 *  - "coinPouch" : 아지트 상점 데일리 코인 주머니 2배 수령
 *  - "fortune"   : 오늘의 기운 공개
 *
 * 지원 플랫폼: 안드로이드 Capacitor 네이티브만 (@capacitor-community/admob 8.x).
 *  - iOS 는 네이티브 앱(upnext-ios/AdsService.swift)이 Google Mobile Ads SDK 로 별도 구현.
 *  - 순수 웹 브라우저는 모바일 광고 SDK 가 없어 광고 진입점 자체를 숨긴다.
 *    (개발 모드는 UI 검증용 목 광고로 흐름만 시뮬레이트)
 *
 * AdMob 정책 (호출하는 UI 쪽에서 반드시 지킬 것):
 *  - 광고는 항상 옵트인. 자동 재생·자동 노출 금지.
 *  - 광고가 유일한 경로가 되면 안 된다. 리롤은 코인 경로가 반드시 병존한다.
 *  - 버튼 문구는 "제공되는 보상"만 서술한다. 개발자 응원·후원·도와주기 류 표현은 정책 위반.
 *
 * 그 밖의 정책 결정 (docs/AdMob 광고 셋업-2026-08-25.md):
 *  - 실제 광고 단위는 프로덕션 도메인(PROD_AD_HOST)에서만 사용. 로컬·프리뷰 배포는
 *    전부 구글 공식 테스트 ID (실제 광고 셀프 클릭은 AdMob 계정 정지 사유).
 *  - EEA/UK/스위스 동의는 UMP 로 처리. 부팅 시가 아니라 광고를 실제로 띄우는
 *    순간에 lazy 하게 물어본다 (동의 폼이 앱 첫 인상을 가리지 않도록).
 *  - 개인화 동의를 받았으면 npa 를 붙이지 않는다 (비개인화 고정은 eCPM 손실).
 */
import { isAndroidNative } from "@/lib/platform";

export type AdSlot = "reroll" | "coinPouch" | "fortune";
export type AdResult = "rewarded" | "dismissed" | "unavailable";

/**
 * 실광고를 켜는 유일한 호스트. 웹 프로덕션 배포 도메인이자, Capacitor iOS/안드로이드
 * 앱이 리모트로 로드하는 주소다 (ios-app/capacitor.config.ts 의 server.url).
 *
 * 왜 호스트로 게이트하나:
 *  - 배포 환경변수를 넣을 수 없는 상황에서도 프로덕션에서만 실광고가 켜져야 한다.
 *  - localhost, Vercel 프리뷰(*.vercel.app 브랜치 별칭)는 호스트가 달라 자동으로
 *    테스트 광고로 떨어진다. 개발자가 자기 광고를 눌러도 무효 트래픽이 되지 않는다.
 *  - Capacitor 안드로이드 스토어 빌드는 이 도메인을 그대로 로드하므로, 앱에 아무 설정을
 *    넣지 않아도 실광고가 자동으로 켜진다.
 */
const PROD_AD_HOST = "up-next-phi.vercel.app";

/**
 * 슬롯별 AdMob 안드로이드 보상형 광고 단위.
 * 현재 콘솔에 발급된 안드로이드 보상형 단위가 하나(support_reward)뿐이라 셋이 공유한다.
 * 슬롯별 수익/노출을 따로 보려면 콘솔에서 단위를 3개로 쪼개고 여기만 바꾸면 된다.
 */
const PROD_REWARD_AD_IDS: Record<AdSlot, string> = {
  reroll: "ca-app-pub-7625755758671333/6191341509",
  coinPouch: "ca-app-pub-7625755758671333/6191341509",
  fortune: "ca-app-pub-7625755758671333/6191341509",
};
/** 구글 공식 안드로이드 보상형 테스트 광고 단위 */
const TEST_REWARD_AD_ID = "ca-app-pub-3940256099942544/5224354917";

export type AdUnitMode = "production" | "test";

/**
 * 실광고 단위를 쓸지 테스트 단위를 쓸지 결정한다. 우선순위는 세 단계.
 *
 *  1. NEXT_PUBLIC_ADS_ENV="production" : 실광고 (호스트와 무관한 명시 오버라이드)
 *  2. NEXT_PUBLIC_ADS_ENV="test"       : 테스트 광고 (프로덕션 호스트에서도 강제, QA 탈출구)
 *  3. env 미설정                        : 호스트가 PROD_AD_HOST 일 때만 실광고, 그 외 전부 테스트
 *
 * NODE_ENV 를 쓰지 않는 이유: Vercel 프리뷰 배포도, 로컬 `next build && next start` 도
 * NODE_ENV 는 production 이다. 그 빌드로 개발자가 자기 광고를 클릭하는 순간
 * 무효 트래픽으로 잡히고, 최악의 경우 AdMob 계정이 정지된다.
 *
 * hostname 은 window 가 없는 SSR 경로에서 undefined 로 들어오고, 그때는 테스트 단위로
 * 떨어진다 (판정은 순수 함수라 테스트에서 세 분기를 그대로 검증한다).
 */
export function resolveAdUnitMode(
  adsEnv: string | undefined,
  hostname: string | undefined,
): AdUnitMode {
  if (adsEnv === "production") return "production";
  if (adsEnv === "test") return "test";
  return hostname === PROD_AD_HOST ? "production" : "test";
}

/**
 * 슬롯에 실제로 요청할 광고 단위 ID.
 *
 * 모듈 로드 시점 상수가 아니라 호출 시점에 평가한다. 이 모듈은 SSR 로도 import 되므로
 * 로드 시점에는 window 가 없을 수 있고, 실제 광고 호출은 항상 클라이언트에서 일어난다.
 * (NEXT_PUBLIC_ 접두사는 빌드 시점에 인라인된다. 값을 바꾸면 재배포가 필요하다)
 */
function adUnitId(slot: AdSlot): string {
  const hostname =
    typeof window === "undefined" ? undefined : window.location.hostname;
  const mode = resolveAdUnitMode(process.env.NEXT_PUBLIC_ADS_ENV, hostname);
  return mode === "production" ? PROD_REWARD_AD_IDS[slot] : TEST_REWARD_AD_ID;
}

/**
 * AdMob 테스트 기기 등록 옵션. NEXT_PUBLIC_ADMOB_TEST_DEVICES 에 기기 광고 ID 를
 * 콤마로 구분해 넣으면 그 기기는 실광고 단위를 요청해도 테스트 광고를 받는다
 * (실 단위로만 재현되는 문제를 실기기에서 확인할 때 쓰는 안전장치).
 *
 * 미설정이면 undefined 를 돌려 옵션 자체를 넘기지 않는다 (플러그인 기본 동작 유지).
 */
function testDeviceOptions():
  | { initializeForTesting: true; testingDevices: string[] }
  | undefined {
  const raw = process.env.NEXT_PUBLIC_ADMOB_TEST_DEVICES;
  if (!raw) return undefined;
  const testingDevices = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (testingDevices.length === 0) return undefined;
  return { initializeForTesting: true, testingDevices };
}

/**
 * 광고 진입점을 노출할지 여부. 안드로이드 네이티브(실광고) 또는
 * 개발 모드(목 광고, 디자인 검증용)에서만 true.
 *
 * false 여도 코인 경로 같은 대체 수단은 그대로 살아 있어야 한다.
 */
export function isAdAvailable(): boolean {
  if (isAndroidNative()) return true;
  return process.env.NODE_ENV === "development";
}

let initialized = false;
/**
 * 광고 재생 동시 호출 가드. 슬롯이 셋으로 늘면서 서로 다른 화면이 겹쳐 뜰 수 있고,
 * 같은 버튼 더블탭도 이중 집계(코인 2배 지급 등)를 만든다.
 */
let inFlight = false;

/**
 * 리워드 광고 1회 재생. 로드(prepare)까지 끝난 뒤 전체 화면으로 뜨며,
 * 광고가 닫히는 시점(Dismissed)에 결과가 확정된다.
 *
 *  - "rewarded": 끝까지 시청해 보상 조건 충족 → 보상 지급으로 이어감
 *  - "dismissed": 중도 이탈 → 아무 일도 없던 것처럼 복귀 (보상 없음, 소모도 없음)
 *  - "unavailable": 로드/표시 실패 (no fill, 계정 미승인, 네트워크, 동의 거부 등)
 */
export async function showRewardedAd(slot: AdSlot): Promise<AdResult> {
  // 이미 광고가 진행 중이면 두 번째 호출은 조용히 무시한다.
  // "unavailable" 이 아니라 "dismissed" 인 이유: 실제로는 광고가 정상 로딩/표시
  // 중이라 "지금은 보여줄 광고가 없어요" 안내가 거짓말이 된다.
  if (inFlight) return "dismissed";

  if (!isAndroidNative()) {
    if (process.env.NODE_ENV !== "development") return "unavailable";
    inFlight = true;
    try {
      return await mockAd(slot);
    } finally {
      inFlight = false;
    }
  }

  inFlight = true;
  try {
    return await runRewardedAd(adUnitId(slot));
  } finally {
    inFlight = false;
  }
}

/** 광고 요청 가능 여부 + 개인화 광고 동의 여부. 세션 동안 캐시한다. */
type ConsentDecision = { canRequestAds: boolean; personalized: boolean };
let consentCache: ConsentDecision | null = null;

/**
 * 실제 로드→표시 흐름. 슬롯 대신 광고 단위 ID 를 받는다(레거시 래퍼와 공용).
 */
async function runRewardedAd(adId: string): Promise<AdResult> {
  try {
    const {
      AdMob,
      RewardAdPluginEvents,
      AdmobConsentStatus,
      MaxAdContentRating,
    } = await import("@capacitor-community/admob");

    if (!initialized) {
      await AdMob.initialize({
        // 이 앱은 App Store 9+ 등급이다. 플러그인이 지원하는 가장 낮은 상한인
        // General("G", 전체 이용가) 로 고정해 등급 초과 광고를 아예 받지 않는다.
        maxAdContentRating: MaxAdContentRating.General,
        // 테스트 기기가 등록돼 있을 때만 키 두 개가 붙는다.
        ...testDeviceOptions(),
      });
      initialized = true;
    }

    // EEA/UK/스위스 동의(UMP). initialize 직후, 광고를 요청하기 전에 해결한다.
    if (!consentCache?.canRequestAds) {
      consentCache = await resolveConsent(AdMob, AdmobConsentStatus);
    }
    // 동의를 못 받아 광고 요청 자체가 막힌 상태 — 로드해봐야 실패한다.
    // (AdMob 콘솔에 GDPR 메시지가 없으면 EEA 사용자는 항상 여기로 떨어진다)
    if (!consentCache.canRequestAds) return "unavailable";

    await AdMob.prepareRewardVideoAd({
      adId,
      // 동의를 받았거나 애초에 필요 없는 지역이면 개인화 광고를 그대로 받는다.
      npa: !consentCache.personalized,
    });

    // show 의 resolve 는 "보상 획득" 시점(광고가 아직 열려 있음)이고, 조기 이탈 시의
    // settle 동작은 문서화돼 있지 않다. 그래서 Dismissed 이벤트를 종료 신호의 기본으로
    // 삼고, show 의 resolve(보상)/reject(표시 실패)도 race 에 함께 태운다.
    let rewarded = false;
    let showFailed = false;

    const rewardHandle = await AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      () => {
        rewarded = true;
      },
    );
    let resolveDismissed: () => void = () => {};
    const dismissed = new Promise<void>((resolve) => {
      resolveDismissed = resolve;
    });
    const dismissHandle = await AdMob.addListener(
      RewardAdPluginEvents.Dismissed,
      () => resolveDismissed(),
    );

    try {
      const shown = AdMob.showRewardVideoAd().then(
        () => {
          rewarded = true;
        },
        () => {
          showFailed = true;
        },
      );
      await Promise.race([dismissed, shown]);
    } finally {
      void rewardHandle.remove();
      void dismissHandle.remove();
    }

    if (showFailed) return "unavailable";
    return rewarded ? "rewarded" : "dismissed";
  } catch {
    // prepare 실패 (no fill / 미승인 / 오프라인) — 호출한 UI 가 안내 문구로 처리
    return "unavailable";
  }
}

/**
 * UMP 동의 해결. status 가 REQUIRED(=EEA/UK/스위스 등 규제 지역인데 아직 미응답)이고
 * 동의 폼이 준비돼 있으면 폼을 띄우고, 그 결과로 광고 요청 가능 여부를 판단한다.
 *
 * 개인화 판단: NOT_REQUIRED(규제 지역 아님) 또는 OBTAINED(동의함) 일 때만 개인화 광고.
 * 나머지(REQUIRED 유지, UNKNOWN)는 npa 를 붙인다.
 */
async function resolveConsent(
  AdMob: typeof import("@capacitor-community/admob").AdMob,
  AdmobConsentStatus: typeof import("@capacitor-community/admob").AdmobConsentStatus,
): Promise<ConsentDecision> {
  try {
    let info = await AdMob.requestConsentInfo();
    if (
      info.status === AdmobConsentStatus.REQUIRED &&
      info.isConsentFormAvailable
    ) {
      info = await AdMob.showConsentForm();
    }
    return {
      canRequestAds: info.canRequestAds,
      personalized:
        info.status === AdmobConsentStatus.NOT_REQUIRED ||
        info.status === AdmobConsentStatus.OBTAINED,
    };
  } catch {
    // UMP 자체가 실패(오프라인 등) — 동의를 확인하지 못했으므로 광고를 띄우지 않는다.
    // 다음 호출에서 캐시 없이 다시 시도한다.
    return { canRequestAds: false, personalized: false };
  }
}

/** 개발 모드 목 광고 — 2초 "시청" 후 보상. 네이티브 SDK 없이 UI 흐름 검증용. */
async function mockAd(slot: AdSlot): Promise<AdResult> {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.info(`[ads] mock rewarded ad watched: ${slot}`);
  return "rewarded";
}
