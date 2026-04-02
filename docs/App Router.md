# App Router (앱 라우터)

> [[Next.js]]에서 **URL과 페이지를 연결**하는 시스템. 폴더 구조가 곧 URL 구조.

## 핵심 규칙

1. `app/` 폴더 안에 `page.tsx` 파일이 있으면 → 그 경로가 URL이 됨
2. `layout.tsx`는 해당 폴더와 하위 폴더의 공통 껍데기

```
app/
├── page.tsx              → /
├── layout.tsx            → 모든 페이지 공통 레이아웃
├── collection/
│   └── page.tsx          → /collection
└── settings/
    └── page.tsx          → /settings
```

## Server Component vs Client Component

Next.js App Router의 중요한 개념:

```
Server Component (기본값)
├── 서버에서 HTML을 미리 만들어서 보냄
├── 빠르고 SEO에 좋음
└── 인터랙션(클릭, 입력) 불가

Client Component ("use client")
├── 브라우저에서 JavaScript로 실행
├── 인터랙션(클릭, 입력) 가능
└── "use client" 선언 필요
```

UpNext에서는 거의 모든 페이지가 인터랙션이 필요해서 `"use client"`를 사용합니다.

## 관련 문서

- [[Next.js]] — 프레임워크 전체
- [[프로젝트 구조]] — 폴더 구조
- [[React 컴포넌트]] — 서버/클라이언트 컴포넌트
