"use client";

import { useTranslation } from "@/hooks/useTranslation";
import Link from "next/link";

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="typo-body text-text-tertiary hover:text-text-primary transition-colors"
        >
          &larr;
        </Link>
        <h2 className="typo-title text-text-primary">{t("privacy.title")}</h2>
      </div>

      <div className="space-y-4 typo-caption text-text-secondary leading-relaxed">
        <p>{t("privacy.lastUpdated")}</p>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section1.title")}</h3>
          <p>{t("privacy.section1.body")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section2.title")}</h3>
          <p>{t("privacy.section2.body")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section3.title")}</h3>
          <p>{t("privacy.section3.body")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section4.title")}</h3>
          <p>{t("privacy.section4.body")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section5.title")}</h3>
          <p>{t("privacy.section5.body")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="typo-body text-text-primary">{t("privacy.section6.title")}</h3>
          <p>{t("privacy.section6.body")}</p>
        </section>
      </div>
    </div>
  );
}
