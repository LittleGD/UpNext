"use client";

import { useEffect } from "react";

/**
 * 문자·SNS 공유용 브리지. 크롤러(iMessage 링크 미리보기 등)는 JS 를 실행하지 않으므로
 * 서버가 내려준 OG 태그를 그대로 읽고, 사람은 이 훅으로 App Store 로 넘어간다.
 * 서버 리다이렉트를 쓰면 크롤러까지 애플 페이지로 따라가 우리 썸네일이 무시된다.
 */
export default function RedirectToStore({ href }: { href: string }) {
  useEffect(() => {
    // replace — 뒤로가기 시 이 브리지로 되돌아오는 루프 방지.
    window.location.replace(href);
  }, [href]);

  return null;
}
