import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import SyncProvider from "@/components/providers/SyncProvider";
import LanguageSync from "@/components/providers/LanguageSync";
import ClientEffects from "@/components/effects/ClientEffects";

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
  title: "UpNext",
  description: "A roguelike challenge for daily achievements",
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
      className={`${april16.variable} dark h-full`}
    >
      <head>
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
        <ClientEffects />
        <SyncProvider>
          <LanguageSync />
          <Header />
          <main className="relative z-[1] flex-1">{children}</main>
          <BottomNav />
        </SyncProvider>
      </body>
    </html>
  );
}
