import type { DailyState, UserProgress } from "@/types/game";
import { getNativePlatform } from "@/lib/platform";

/**
 * 앱 평가 요청 모달의 노출 조건과 스토어 링크.
 *
 * 노출 시점: "챌린지를 완료한 서로 다른 날"이 2일에 도달했을 때 1회.
 * 첫날 완료만으로는 뜨지 않는다 — 하루 써보고 판단할 시간을 준 뒤 묻는다.
 */
export const REVIEW_PROMPT_MIN_DAYS = 2;

/** iOS — 리뷰 작성 시트가 바로 열리는 딥링크. StoreKit 네이티브 팝업 대신 쓴다. */
export const APP_STORE_REVIEW_URL =
  "https://apps.apple.com/app/id6762550135?action=write-review";

/** Android — Play 스토어 리스팅(리뷰 섹션). */
export const PLAY_STORE_REVIEW_URL =
  "https://play.google.com/store/apps/details?id=app.vercel.upnext&showAllReviews=true";

/**
 * 챌린지를 완료한 서로 다른 날의 수.
 *
 * completionHistory 는 날짜가 넘어갈 때 비로소 기록되므로(useGameStore.initialize),
 * 오늘 몫은 daily 에서 직접 센다. 둘을 합쳐야 "오늘이 2일째"를 당일에 판정할 수 있다.
 */
export function countCompletedDays(
  progress: UserProgress,
  daily: DailyState,
): number {
  const past = progress.completionHistory.filter(
    (record) => record.completedCardIds.length > 0,
  ).length;
  const today = daily.completedIds.length > 0 ? 1 : 0;
  return past + today;
}

/** 지금 평가 모달을 띄워야 하는가. 이미 띄운 적이 있으면 영구히 false. */
export function shouldShowReviewPrompt(
  progress: UserProgress,
  daily: DailyState,
): boolean {
  if (progress.reviewPromptShownAt) return false;
  return countCompletedDays(progress, daily) >= REVIEW_PROMPT_MIN_DAYS;
}

/**
 * 현재 플랫폼에 맞는 리뷰 링크. Capacitor 안드로이드는 Play, 그 외(iOS 웹뷰·브라우저)는
 * App Store 로 보낸다. 순수 웹 방문자도 App Store 로 — 웹앱에는 스토어 리뷰가 없다.
 */
export function reviewUrlForPlatform(): string {
  return getNativePlatform() === "android"
    ? PLAY_STORE_REVIEW_URL
    : APP_STORE_REVIEW_URL;
}
