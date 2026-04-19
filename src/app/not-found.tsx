"use client";

/**
 * Phase 12 R13 — 404 페이지.
 *
 * Next.js convention: `not-found.tsx` 는 notFound() 호출 또는 매칭 실패
 * route 에서 자동 렌더. 루트 layout 유지.
 *
 * 기존엔 Next.js 기본 404 화면 (흰 바탕) 이 표시돼 retro 세계관 깨짐.
 * 이제 GB 팔레트 + 친화적 문구로 대체.
 */

import Link from "next/link";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{ background: "var(--bg-elevated)" }}
      >
        <PixelIcon name="Search" size={36} color="var(--text-tertiary)" />
      </div>

      <h1 className="typo-title text-text-primary mb-2">
        {t("notFound.title")}
      </h1>

      <p className="typo-caption text-text-tertiary max-w-[320px] mb-6 leading-relaxed">
        {t("notFound.body")}
      </p>

      <Link
        href="/"
        className="w-full max-w-[240px] py-3 rounded-xl bg-accent text-bg-primary typo-body transition-transform active:scale-[0.97] text-center"
      >
        {t("notFound.cta")}
      </Link>
    </main>
  );
}
