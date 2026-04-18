"use client";

/**
 * Phase 12 R13 — 앱 최상위 에러 경계.
 *
 * Next.js App Router convention: `error.tsx` 는 같은 segment 의 client
 * component 에서 thrown 된 unhandled error 를 catch. 루트 layout 의
 * html/body 는 유지되므로 Header / BottomNav 등은 그대로, 본문 영역만
 * 이 컴포넌트로 대체.
 *
 * 대상 에러 예:
 *  - Firestore sync 실패 시 throw
 *  - IndexedDB 접근 거부 (private mode / quota 초과)
 *  - 예상치 못한 runtime exception (client)
 *
 * 디자인: GB 팔레트 그대로 사용해 "세계관 깨지지 않음" + 명시적 retry CTA.
 */

import { useEffect } from "react";
import Link from "next/link";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const { t } = useTranslation();
  // 에러 로깅 — 배포 환경에서도 브라우저 콘솔에 stack 이 남도록. Analytics /
  //   Sentry 훅이 생기면 여기서 send_exception 호출.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[error.tsx] Unhandled error:", error);
    }
  }, [error]);

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{ background: "var(--bg-elevated)" }}
      >
        <PixelIcon
          name="WarningDiamond"
          size={36}
          color="var(--accent-secondary)"
        />
      </div>

      <h1 className="typo-title text-text-primary mb-2">
        {t("error.boundary.title")}
      </h1>

      <p className="typo-caption text-text-tertiary max-w-[320px] mb-6 leading-relaxed">
        {t("error.boundary.body")}
      </p>

      {/* 디버그 정보 — production 에서도 digest 는 사용자가 지원팀에 전달
           하기 유용 (server error 식별자). message 는 개발 환경에서만. */}
      {(error.digest || process.env.NODE_ENV !== "production") && (
        <p
          className="typo-micro text-text-tertiary opacity-60 mb-6 tabular-nums max-w-[320px] break-all"
          style={{ letterSpacing: "0.03em" }}
        >
          {error.digest
            ? t("error.boundary.errorId", { id: error.digest })
            : error.message || "Unknown error"}
        </p>
      )}

      <div className="flex flex-col gap-2 w-full max-w-[240px]">
        <button
          type="button"
          onClick={() => reset()}
          className="w-full py-3 rounded-xl bg-accent text-bg-primary typo-body transition-transform active:scale-[0.97]"
        >
          {t("error.boundary.retry")}
        </button>
        <Link
          href="/"
          className="w-full py-3 rounded-xl bg-bg-surface text-text-secondary typo-body transition-colors active:text-text-primary text-center"
        >
          {t("error.boundary.goHome")}
        </Link>
      </div>
    </main>
  );
}
