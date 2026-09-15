import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 색인 대상은 소개 페이지·홈·개인정보처리방침뿐이다. 나머지는 로그인 상태에 따라 비어 보이는
// 앱 화면이라 검색 결과에 나오면 "빈 페이지"로 보인다.
// /get, /i/ 는 막지 않는다: X(트위터) 봇 등 미리보기 크롤러가 robots 를 지켜서 썸네일이 사라진다.
// 두 경로는 각자 noindex 로 색인만 뺀다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/settings",
        "/collection",
        "/flame",
        "/minigame",
        "/playground",
        "/retention-qa",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
