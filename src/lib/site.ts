// 검색엔진·미리보기 크롤러가 보는 정본 도메인. robots/sitemap/OG 가 모두 이 값을 쓴다.
// 미설정 시 Vercel 은 배포별 임시 URL 로 떨어지므로 기본값을 운영 도메인으로 둔다.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://up-next-phi.vercel.app";

export const SITE_TITLE = "UpNext: 챌린지 카드 갓생 | 게임처럼 습관 만들기";
export const SITE_DESCRIPTION =
  "매일 카드 6장을 뽑아 오늘의 챌린지를 고르는 갓생 앱. 불꽃 스트릭으로 습관을 쌓고, 픽셀 RPG 영웅을 키우며 자기계발을 게임처럼 즐겨요.";
