import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import { getNativePlatform } from "@/lib/platform";

/**
 * 앱 평가 모달의 부정 응답 경로에서 받은 피드백을 Firestore `/feedback` 에 남긴다.
 *
 * 규칙(firestore.rules)상 create 전용이라 클라이언트는 자기 글도 되읽지 못한다.
 * 로그인 필수 — 미인증 쓰기를 열면 외부에서 문서를 무한 생성해 과금을 올릴 수 있다.
 */

/** 객관식 사유 slug. 화면 문구는 i18n(`review.reason.*`)에서 가져온다. */
export const FEEDBACK_REASONS = [
  "boring",       // 챌린지가 재미없거나 나와 안 맞음
  "difficult",    // 어렵거나 복잡함
  "bug",          // 버그·오류
  "performance",  // 느리거나 자주 멈춤
  "notifications", // 알림이 과함
  "design",       // 디자인이 아쉬움
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export interface FeedbackSubmission {
  reasons: FeedbackReason[];
  comment: string;
  locale: string;
}

export type FeedbackResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "signed-out" | "failed" };

/** 앱 버전 — 규칙상 20자 이하. 빌드에 주입된 값이 없으면 생략한다. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION?.slice(0, 20);

export async function submitFeedback(
  submission: FeedbackSubmission,
): Promise<FeedbackResult> {
  if (!isFirebaseConfigured) return { ok: false, reason: "unconfigured" };

  try {
    const { auth, db } = await getFirebase();
    const user = auth.currentUser;
    // 게스트는 uid 가 없어 규칙에서 거부된다. 호출측이 로그인 안내를 띄우도록 구분해 반환.
    if (!user) return { ok: false, reason: "signed-out" };

    const { addDoc, collection } = await import("firebase/firestore");

    // 규칙의 필드 allowlist 와 정확히 일치시킨다 — 알 수 없는 키가 하나라도 있으면
    // 전체 write 가 거부되고, Firestore 거부는 조용해서 원인 추적이 어렵다.
    const payload: Record<string, unknown> = {
      uid: user.uid,
      reasons: submission.reasons.slice(0, 6),
      platform: getNativePlatform(),
      locale: submission.locale.slice(0, 10),
      createdAt: Date.now(),
    };
    const comment = submission.comment.trim().slice(0, 500);
    if (comment) payload.comment = comment;
    if (APP_VERSION) payload.appVersion = APP_VERSION;

    await addDoc(collection(db, "feedback"), payload);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
