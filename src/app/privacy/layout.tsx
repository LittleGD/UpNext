import type { Metadata } from "next";

// page.tsx 가 클라이언트 컴포넌트라 metadata 를 여기서 내보낸다.
export const metadata: Metadata = {
  title: "개인정보처리방침",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
