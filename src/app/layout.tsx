import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { WDXL_Lubrifont_JP_N, ZCOOL_QingKe_HuangYou } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import SyncProvider from "@/components/providers/SyncProvider";
import LanguageSync from "@/components/providers/LanguageSync";
import ClientEffects from "@/components/effects/ClientEffects";

// ── Phase 1A: April16Promise 로컬 셀프호스팅 ──
const april16 = localFont({
  src: "./fonts/April16th-Promise.woff2",
  variable: "--font-april16",
  display: "swap",
  weight: "400",
});

// ── Phase 1B: Google Fonts → next/font/google (JA/ZH) ──
const wdxlLubrifont = WDXL_Lubrifont_JP_N({
  variable: "--font-wdxl",
  display: "swap",
  weight: "400",
  preload: false,
});

const zcoolQingKe = ZCOOL_QingKe_HuangYou({
  variable: "--font-zcool",
  display: "swap",
  weight: "400",
  preload: false,
});

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
      className={`${april16.variable} ${wdxlLubrifont.variable} ${zcoolQingKe.variable} dark h-full`}
    >
      <head>
        {/* Phase 1C: Typekit (EN 폰트) 비동기 로딩 — 렌더 블로킹 제거 */}
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
