# Next.js

> React를 기반으로 한 **웹 프레임워크**. 페이지 라우팅, 서버 렌더링 등을 자동으로 해줌.

## 한 줄 요약

"React만으로는 부족한 것들(페이지 이동, SEO, 성능)을 자동으로 해주는 도구"

## React vs Next.js

```
React만 쓰면:
- 페이지 전환? 직접 설정해야 함
- 빌드/배포? 직접 설정해야 함
- SEO? 추가 작업 필요

Next.js를 쓰면:
- 페이지 전환? 폴더 만들면 자동!
- 빌드/배포? npm run build 한 줄!
- SEO? 기본 지원!
```

## App Router — 폴더 = 페이지

Next.js의 가장 직관적인 기능. **폴더를 만들면 URL이 생김**.

```
src/app/
├── page.tsx              → 주소: /           (홈)
├── collection/
│   └── page.tsx          → 주소: /collection (컬렉션)
└── settings/
    └── page.tsx          → 주소: /settings   (설정)
```

Figma에서 페이지를 추가하면 왼쪽 Pages 패널에 나오는 것처럼,
Next.js에서는 폴더를 추가하면 새 URL(페이지)이 만들어져요.

## layout.tsx — 공통 틀

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Header />        {/* 모든 페이지에 공통 */}
        <main>{children}</main>  {/* ← 여기에 각 페이지 내용이 들어감 */}
        <BottomNav />     {/* 모든 페이지에 공통 */}
      </body>
    </html>
  );
}
```

`{children}`은 각 페이지(`page.tsx`)의 내용이 들어오는 자리예요.
Figma에서 Frame 안에 다른 컴포넌트를 넣는 것과 비슷해요.

## 개발 서버 실행

```bash
npm run dev    # 개발 서버 시작 → localhost:3000에서 확인
npm run build  # 배포용 빌드 (최적화된 버전 생성)
```

## 관련 문서

- [[React 컴포넌트]] — Next.js 안에서 사용하는 컴포넌트
- [[프로젝트 구조]] — app/ 폴더 구조
- [[App Router]] — 라우팅 시스템 상세
