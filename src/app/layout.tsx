import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import SyncProvider from "@/components/providers/SyncProvider";
import LanguageSync from "@/components/providers/LanguageSync";
import MotionProvider from "@/components/providers/MotionProvider";
import ClientEffects from "@/components/effects/ClientEffects";
import NativeSplashHide from "@/components/native/NativeSplashHide";
import ServiceWorkerRegistrar from "@/components/providers/ServiceWorkerRegistrar";
import WidgetSync from "@/components/providers/WidgetSync";
import AccountLevelUpOverlay from "@/components/uphero/AccountLevelUpOverlay";
import { Analytics } from "@vercel/analytics/next";
import { BOOT_COVER_ID, BOOT_COVER_INIT_SCRIPT, BOOT_COVER_STYLE } from "@/lib/bootCover";

// ── April16Promise 로컬 셀프호스팅 ──
// display: "optional" → 100ms 내 로딩 못하면 시스템 폰트 유지
// → LCP = FCP (폰트 swap으로 인한 LCP 지연 제거)
// → 재방문 시 캐시에서 즉시 로딩되어 커스텀 폰트 적용
const april16 = localFont({
  src: "./fonts/April16th-Promise.woff2",
  variable: "--font-april16",
  display: "optional",
  weight: "400",
});

// JA/ZH 폰트: next/font/google 제거 → LanguageSync에서 동적 로딩
// next/font/google은 preload:false여도 @font-face CSS가 메인 번들에 포함되어
// 렌더 블로킹 CSS를 비대화시킴 (170ms→330ms)

export const metadata: Metadata = {
  // OG 이미지 파일 규칙은 상대 경로로 생성된다 — 미리보기 크롤러가 읽으려면 절대 URL 이
  // 필요하므로 기준 도메인을 명시한다. 미설정 시 Vercel 은 배포별 임시 URL 로 떨어진다.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://up-next-phi.vercel.app"
  ),
  title: "UpNext",
  description: "A roguelike challenge for daily achievements",
  appleWebApp: {
    capable: true,
    title: "UpNext",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "UpNext",
    description: "A roguelike challenge for daily achievements",
    siteName: "UpNext",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "UpNext",
    description: "A roguelike challenge for daily achievements",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${april16.variable} dark h-full`}
    >
      <head>
        {/* SSR 부트 커버 (src/lib/bootCover.ts): standalone / Capacitor 문맥의 콜드 스타트에서
            첫 페인트 ~ 모션 스플래시 마운트 사이의 OnboardingFlow 프레임을 다크로 가린다.
            style → 일반 script 순서로 head 맨 앞에 두어 파싱 중 동기 실행(첫 페인트 전).
            next/script 가 아닌 이유: afterInteractive 는 하이드레이션 뒤라 이미 늦다. */}
        <style id="boot-cover-style" dangerouslySetInnerHTML={{ __html: BOOT_COVER_STYLE }} />
        <script id="boot-cover-init" dangerouslySetInnerHTML={{ __html: BOOT_COVER_INIT_SCRIPT }} />
        {/* Typekit (EN 폰트) 비동기 로딩 */}
        <Script id="typekit-loader" strategy="afterInteractive">{`
          (function(){
            var l=document.createElement('link');
            l.rel='stylesheet';
            l.href='https://use.typekit.net/cdr3qvu.css';
            document.head.appendChild(l);
          })();
        `}</Script>
      </head>
      <body className="min-h-full flex flex-col bg-bg-primary font-sans antialiased">
        {/* 부트 커버 노드. 표시 여부는 html 클래스(boot-cover / boot-cover-done)와 CSS 가 결정하고,
            NativeSplashHide 가 걷는다. React 소유라 DOM 에서 제거하지 않는다. */}
        <div id={BOOT_COVER_ID} aria-hidden="true" />
        <ClientEffects />
        <NativeSplashHide />
        <ServiceWorkerRegistrar />
        <WidgetSync />
        <MotionProvider>
          <SyncProvider>
            <LanguageSync />
            <Header />
            <main className="relative z-[1] flex-1">{children}</main>
            <BottomNav />
            {/* Phase 2-A — 계정 레벨업 축하 오버레이. 셸에 1회 마운트 (모든 경로 공통). */}
            <AccountLevelUpOverlay />
          </SyncProvider>
        </MotionProvider>
        <Analytics />
      </body>
    </html>
  );
}
