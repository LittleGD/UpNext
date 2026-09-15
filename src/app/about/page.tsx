import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import UpNextLogoMark from "@/components/growth/UpNextLogoMark";
import { IOS_STORE_URL } from "@/lib/duoInviteLink";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";

/**
 * /about: 검색 유입용 소개 페이지.
 *
 * "/" 는 온보딩부터 시작하는 앱 화면이라 크롤러가 읽을 글이 거의 없다(버튼 몇 개).
 * 이 페이지는 서버에서 완성된 HTML 로 내려가 "갓생 앱", "습관 만들기 앱" 같은 검색어에
 * 걸릴 본문을 제공하고, 방문자를 App Store 또는 웹 앱으로 보낸다.
 * 카피 출처: Appstore-img/ios/metadata.md (ko).
 */

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/about" },
  // 사파리 방문자에게 App Store 스마트 배너를 띄운다.
  itunes: { appId: "6762550135" },
  openGraph: { url: "/about" },
};

const FEATURES = [
  {
    img: "/landing/02-card-draw.webp",
    alt: "카드 6장을 펼쳐 오늘의 챌린지를 고르는 화면",
    title: "매일 6장, 오늘의 나를 뽑아요",
    body: "덱을 길게 눌러 카드 6장을 부채꼴로 펼치고 오늘 실천할 챌린지를 골라요. 1000보 걷기, 5분 스트레칭처럼 지금 바로 할 수 있는 작은 도전이 운동, 식단, 마음, 학습 카테고리로 준비돼 있어요.",
  },
  {
    img: "/landing/01-challenge.webp",
    alt: "고른 챌린지를 완료하고 XP를 받는 화면",
    title: "깨면 XP, 레벨업, 카드팩",
    body: "완료할 때마다 XP와 카드팩 보상이 따라오고 추가 챌린지, 슈퍼 챌린지로 이어져요. 난이도는 모드로 정해요. 일반은 1장, 갓생은 2장, 초갓생은 3장이에요.",
  },
  {
    img: "/landing/04-flame-streak.webp",
    alt: "연속 기록을 보여 주는 불꽃 스트릭 히트맵",
    title: "불꽃 스트릭으로 작심삼일 끊기",
    body: "매일 체크인으로 연속 기록을 쌓고 히트맵으로 한눈에 봐요. 하루 빠져도 스트릭 방패가 기록을 지켜 주고, 친구와 2인 불꽃을 이어 서로 응원할 수 있어요.",
  },
  {
    img: "/landing/05-hero-hideout.webp",
    alt: "픽셀 RPG 영웅을 키우는 아지트 화면",
    title: "아지트에서 픽셀 영웅 키우기",
    body: "습관이 쌓일수록 영웅이 자라요. 스탯과 스킬트리로 성장시키고 던전을 공략하며, 장비 파밍과 몬스터 도감, 미니게임까지 즐길 거리가 가득해요.",
  },
] as const;

const EXTRAS = [
  { title: "성장앨범", body: "챌린지 인증 사진을 폴라로이드로 남기고 필터, 스티커, 서명으로 꾸며요." },
  { title: "홈 위젯", body: "앱을 열지 않아도 오늘 할 일이 홈 화면에 보여요." },
  { title: "4개 언어", body: "한국어, 영어, 일본어, 중국어를 지원해요." },
] as const;

const FAQ = [
  {
    q: "UpNext는 어떤 앱인가요?",
    a: "매일 카드를 뽑아 오늘의 챌린지를 정하고, 완료하면 레벨이 오르는 습관 만들기 앱이에요. 자기계발을 로그라이크 게임처럼 즐기도록 만들었어요.",
  },
  {
    q: "무료인가요?",
    a: "네, App Store에서 무료로 받을 수 있어요.",
  },
  {
    q: "안드로이드에서도 쓸 수 있나요?",
    a: "안드로이드 앱은 준비 중이에요. 지금은 휴대폰 브라우저에서 웹으로 바로 시작할 수 있어요.",
  },
  {
    q: "작심삼일인데 도움이 될까요?",
    a: "하루 목표를 카드 1장부터 시작할 수 있어요. 불꽃 스트릭과 스트릭 방패가 꾸준함을 이어 주고, 기록이 쌓일수록 영웅이 자라서 다시 열 이유가 생겨요.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "UpNext",
  alternateName: "UpNext: 챌린지 카드 갓생",
  description: SITE_DESCRIPTION,
  url: `${SITE_URL}/about`,
  downloadUrl: IOS_STORE_URL,
  installUrl: IOS_STORE_URL,
  operatingSystem: "iOS",
  applicationCategory: "LifestyleApplication",
  inLanguage: ["ko", "en", "ja", "zh"],
  image: `${SITE_URL}/icons/icon-512x512.png`,
  screenshot: FEATURES.map((f) => `${SITE_URL}${f.img}`),
  offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
  publisher: { "@type": "Organization", name: "JML.Studio", url: "https://littlegd.github.io" },
};

function StoreButton() {
  return (
    <a
      href={IOS_STORE_URL}
      className="inline-flex h-[52px] items-center justify-center rounded-[12px] bg-accent px-6 typo-body font-semibold text-bg-primary shadow-[0_0_28px_rgba(205,245,100,0.28)] transition-transform active:scale-[0.97]"
    >
      App Store에서 받기
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

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-[calc(env(safe-area-inset-bottom)+48px)] text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+20px)]">
        <UpNextLogoMark width={88} color="var(--text-primary)" />
        <Link href="/" className="typo-caption text-text-secondary hover:text-text-primary">
          웹에서 시작하기
        </Link>
      </header>

      <section className="mx-auto flex max-w-xl flex-col items-center gap-5 pt-16 text-center md:pt-24">
        <p className="typo-caption text-accent">게임처럼 습관 만들기</p>
        <h1 className="typo-display md:text-[48px]">카드 한 장으로 시작하는 갓생</h1>
        <p className="typo-body text-text-secondary">
          오늘도 작심삼일? UpNext는 자기계발을 로그라이크 게임으로 바꿔요. 카드를 뽑고,
          오늘의 챌린지를 깨고, 레벨을 올리며 성장하는 재미를 느껴 보세요.
        </p>
        <div className="flex flex-col items-center gap-4 pt-2">
          <StoreButton />
          <Link href="/" className="typo-caption text-text-secondary underline underline-offset-4 hover:text-text-primary">
            설치 없이 웹에서 해 보기
          </Link>
        </div>
      </section>

      <div className="space-y-24 pt-24">
        {FEATURES.map((f, i) => (
          <section
            key={f.title}
            className={`flex flex-col items-center gap-8 md:justify-around ${i % 2 ? "md:flex-row-reverse" : "md:flex-row"}`}
          >
            <div className="max-w-md space-y-3 text-center md:text-left">
              <h2 className="typo-title">{f.title}</h2>
              <p className="typo-body text-text-secondary">{f.body}</p>
            </div>
            <Screenshot src={f.img} alt={f.alt} priority={i === 0} />
          </section>
        ))}
      </div>

      <section className="grid gap-3 pt-24 md:grid-cols-3">
        {EXTRAS.map((e) => (
          <div key={e.title} className="space-y-1 rounded-[16px] bg-bg-surface p-5">
            <h2 className="typo-heading">{e.title}</h2>
            <p className="typo-caption text-text-secondary">{e.body}</p>
          </div>
        ))}
      </section>

      <section className="pt-24">
        <h2 className="typo-title pb-5">자주 묻는 질문</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-[16px] bg-bg-surface px-5 py-4 open:bg-bg-elevated">
              <summary className="cursor-pointer list-none typo-body">{f.q}</summary>
              <p className="typo-caption pt-3 text-text-secondary">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-5 pt-24 text-center">
        <h2 className="typo-title">오늘 카드 한 장부터 뽑아 보세요</h2>
        <StoreButton />
      </section>

      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-20 typo-micro text-text-tertiary">
        <Link href="/privacy" className="hover:text-text-secondary">개인정보처리방침</Link>
        <a href="https://littlegd.github.io" className="hover:text-text-secondary">JML.Studio</a>
      </footer>
    </div>
  );
}
