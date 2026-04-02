import type { Metadata, Viewport } from "next";
import { Orbit } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import SyncProvider from "@/components/providers/SyncProvider";
import LanguageSync from "@/components/providers/LanguageSync";
import PixelStars from "@/components/effects/PixelStars";
import AmbientBackground from "@/components/effects/AmbientBackground";

const orbit = Orbit({
  variable: "--font-orbit",
  subsets: ["latin"],
  weight: "400",
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
    <html lang="ko" className={`${orbit.variable} dark h-full`}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/cdr3qvu.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=WDXL+Lubrifont+JP+N&family=ZCOOL+QingKe+HuangYou&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-bg-primary font-sans antialiased">
        <AmbientBackground />
        <PixelStars />
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
