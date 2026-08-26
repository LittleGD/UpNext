import type { Metadata } from "next";
import RedirectToStore from "./RedirectToStore";

/**
 * /get — 문자·SNS 로 뿌리는 공유 링크.
 *
 * apps.apple.com 링크를 그대로 보내면 미리보기 이미지는 애플이 정한다(앱 아이콘을
 * 흰 배경에 얹은 1200x630). 개발자가 바꿀 수 없다. 그래서 우리가 OG 태그를 통제할 수
 * 있는 이 경로를 대신 공유하고, 사람만 App Store 로 넘긴다.
 * 썸네일은 같은 폴더의 opengraph-image.png / twitter-image.png 파일 규칙으로 붙는다.
 */
const APP_STORE_URL = "https://apps.apple.com/app/id6762550135";

const TITLE = "UpNext: Small steps. Big wins.";
const DESCRIPTION =
  "매일 6장을 뽑아 오늘의 챌린지를 고르세요. 사진으로 남기고 캐릭터를 키우는 갓생 게임.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "UpNext",
    type: "website",
    url: "/get",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // 브리지 경로는 검색 색인 대상이 아니다 — 미리보기 크롤러는 robots 와 무관하게 읽는다.
  robots: { index: false, follow: false },
};

export default function GetPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        textAlign: "center",
      }}
    >
      <RedirectToStore href={APP_STORE_URL} />
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>UpNext</h1>
      <p style={{ fontSize: 15, color: "#808080", maxWidth: 320 }}>
        App Store 로 이동하고 있어요. 자동으로 넘어가지 않으면 아래를 눌러 주세요.
      </p>
      <a
        href={APP_STORE_URL}
        style={{
          background: "#CDF564",
          color: "#0A0A0A",
          fontSize: 15,
          fontWeight: 600,
          padding: "12px 24px",
          borderRadius: 999,
          textDecoration: "none",
        }}
      >
        App Store 에서 열기
      </a>
    </main>
  );
}
