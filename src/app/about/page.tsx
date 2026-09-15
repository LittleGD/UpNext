import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AboutLanguageSelect from "./AboutLanguageSelect";
import UpNextLogoMark from "@/components/growth/UpNextLogoMark";
import en from "@/i18n/en";
import ja from "@/i18n/ja";
import ko from "@/i18n/ko";
import zh from "@/i18n/zh";
import { IOS_STORE_URL } from "@/lib/duoInviteLink";
import { SITE_URL } from "@/lib/site";
import type { Language } from "@/types/game";

/**
 * /about: 검색 유입용 소개 페이지.
 *
 * "/" 는 온보딩부터 시작하는 앱 화면이라 크롤러가 읽을 글이 거의 없다(버튼 몇 개).
 * 이 페이지는 서버에서 완성된 HTML 로 내려가 "갓생 앱", "습관 만들기 앱" 같은 검색어에
 * 걸릴 본문을 제공하고, 방문자를 App Store 또는 웹 앱으로 보낸다.
 * 언어는 /about?lang=en 같은 검색 파라미터로 선택해 서버에서 번역된 HTML을 렌더링한다.
 */

const LANGUAGE_CODES = ["ko", "en", "ja", "zh"] as const satisfies readonly Language[];
const LANGUAGE_LOCALES: Record<Language, string> = {
  ko: "ko_KR",
  en: "en_US",
  ja: "ja_JP",
  zh: "zh_CN",
};

const DICTIONARIES: Record<Language, Record<string, string>> = {
  ko,
  en,
  ja,
  zh,
};

type AboutPageProps = {
  searchParams: Promise<{ lang?: string | string[] | undefined }>;
};

function isLanguage(value: string): value is Language {
  return LANGUAGE_CODES.includes(value as Language);
}

function resolveLanguage(value: string | string[] | undefined): Language {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isLanguage(candidate) ? candidate : "ko";
}

function getCopy(language: Language) {
  return DICTIONARIES[language];
}

export async function generateMetadata({ searchParams }: AboutPageProps): Promise<Metadata> {
  const { lang } = await searchParams;
  const language = resolveLanguage(lang);
  const copy = getCopy(language);

  return {
    title: { absolute: copy["about.metadata.title"] },
    description: copy["about.metadata.description"],
    alternates: { canonical: "/about" },
    itunes: { appId: "6762550135" },
    openGraph: {
      url: "/about",
      locale: LANGUAGE_LOCALES[language],
      title: copy["about.metadata.title"],
      description: copy["about.metadata.description"],
    },
  };
}

const FEATURES = [
  {
    img: "/landing/02-card-draw.webp",
    altKey: "about.feature.daily.alt",
    titleKey: "about.feature.daily.title",
    bodyKey: "about.feature.daily.body",
  },
  {
    img: "/landing/01-challenge.webp",
    altKey: "about.feature.reward.alt",
    titleKey: "about.feature.reward.title",
    bodyKey: "about.feature.reward.body",
  },
  {
    img: "/landing/04-flame-streak.webp",
    altKey: "about.feature.flame.alt",
    titleKey: "about.feature.flame.title",
    bodyKey: "about.feature.flame.body",
  },
  {
    img: "/landing/05-hero-hideout.webp",
    altKey: "about.feature.hero.alt",
    titleKey: "about.feature.hero.title",
    bodyKey: "about.feature.hero.body",
  },
] as const;

const EXTRAS = [
  { titleKey: "about.extra.album.title", bodyKey: "about.extra.album.body" },
  { titleKey: "about.extra.widget.title", bodyKey: "about.extra.widget.body" },
  { titleKey: "about.extra.languages.title", bodyKey: "about.extra.languages.body" },
] as const;

const FAQ = [
  { questionKey: "about.faq.app.question", answerKey: "about.faq.app.answer" },
  { questionKey: "about.faq.free.question", answerKey: "about.faq.free.answer" },
  { questionKey: "about.faq.android.question", answerKey: "about.faq.android.answer" },
  { questionKey: "about.faq.consistency.question", answerKey: "about.faq.consistency.answer" },
] as const;

function StoreButton({ label }: { label: string }) {
  return (
    <a
      href={IOS_STORE_URL}
      className="inline-flex h-[52px] items-center justify-center rounded-[12px] bg-accent px-6 typo-body font-semibold text-bg-primary shadow-[0_0_28px_rgba(205,245,100,0.28)] transition-transform active:scale-[0.97]"
    >
      {label}
    </a>
  );
}

function Screenshot({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={660}
      height={1434}
      priority={priority}
      sizes="(min-width: 768px) 300px, 70vw"
      className="w-[70vw] max-w-[300px] rounded-[28px] shadow-[0_0_48px_rgba(205,245,100,0.12)]"
    />
  );
}

export default async function AboutPage({ searchParams }: AboutPageProps) {
  const { lang } = await searchParams;
  const language = resolveLanguage(lang);
  const copy = getCopy(language);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: "UpNext",
    alternateName: copy["about.metadata.title"],
    description: copy["about.metadata.description"],
    url: `${SITE_URL}/about`,
    downloadUrl: IOS_STORE_URL,
    installUrl: IOS_STORE_URL,
    operatingSystem: "iOS",
    applicationCategory: "LifestyleApplication",
    inLanguage: language,
    image: `${SITE_URL}/icons/icon-512x512.png`,
    screenshot: FEATURES.map((feature) => `${SITE_URL}${feature.img}`),
    offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
    publisher: { "@type": "Organization", name: "JML.Studio", url: "https://littlegd.github.io" },
  };

  return (
    <div className="mx-auto max-w-5xl px-5 pb-[calc(env(safe-area-inset-bottom)+48px)] text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="flex items-center justify-between gap-4 pt-[calc(env(safe-area-inset-top)+20px)]">
        <UpNextLogoMark width={88} color="var(--text-primary)" />
        <div className="flex items-center gap-3">
          <AboutLanguageSelect language={language} label={copy["about.languageLabel"]} />
          <Link href="/" className="typo-caption text-text-secondary hover:text-text-primary">
            {copy["about.header.webStart"]}
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-xl flex-col items-center gap-5 pt-16 text-center md:pt-24">
        <p className="typo-caption text-accent">{copy["about.hero.eyebrow"]}</p>
        <h1 className="typo-display md:text-[48px]">{copy["about.hero.title"]}</h1>
        <p className="typo-body text-text-secondary">{copy["about.hero.body"]}</p>
        <div className="flex flex-col items-center gap-4 pt-2">
          <StoreButton label={copy["about.hero.storeCta"]} />
          <Link href="/" className="typo-caption text-text-secondary underline underline-offset-4 hover:text-text-primary">
            {copy["about.hero.webCta"]}
          </Link>
        </div>
      </section>

      <div className="space-y-24 pt-24">
        {FEATURES.map((feature, index) => (
          <section
            key={feature.titleKey}
            className={`flex flex-col items-center gap-8 md:justify-around ${index % 2 ? "md:flex-row-reverse" : "md:flex-row"}`}
          >
            <div className="max-w-md space-y-3 text-center md:text-left">
              <h2 className="typo-title">{copy[feature.titleKey]}</h2>
              <p className="typo-body text-text-secondary">{copy[feature.bodyKey]}</p>
            </div>
            <Screenshot src={feature.img} alt={copy[feature.altKey]} priority={index === 0} />
          </section>
        ))}
      </div>

      <section className="grid gap-3 pt-24 md:grid-cols-3">
        {EXTRAS.map((extra) => (
          <div key={extra.titleKey} className="space-y-1 rounded-[16px] bg-bg-surface p-5">
            <h2 className="typo-heading">{copy[extra.titleKey]}</h2>
            <p className="typo-caption text-text-secondary">{copy[extra.bodyKey]}</p>
          </div>
        ))}
      </section>

      <section className="pt-24">
        <h2 className="typo-title pb-5">{copy["about.faq.title"]}</h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details key={item.questionKey} className="rounded-[16px] bg-bg-surface px-5 py-4 open:bg-bg-elevated">
              <summary className="cursor-pointer list-none typo-body">{copy[item.questionKey]}</summary>
              <p className="typo-caption pt-3 text-text-secondary">{copy[item.answerKey]}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-5 pt-24 text-center">
        <h2 className="typo-title">{copy["about.final.title"]}</h2>
        <StoreButton label={copy["about.hero.storeCta"]} />
      </section>

      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-20 typo-micro text-text-tertiary">
        <Link href="/privacy" className="hover:text-text-secondary">{copy["about.footer.privacy"]}</Link>
        <a href="https://littlegd.github.io" className="hover:text-text-secondary">{copy["about.footer.studio"]}</a>
      </footer>
    </div>
  );
}
