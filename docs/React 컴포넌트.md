# React 컴포넌트 (Component)

> 화면을 구성하는 **재사용 가능한 블록**. Figma의 Component와 같은 개념.

## 컴포넌트란?

Figma에서 버튼을 Component로 만들면, 여러 곳에 재사용할 수 있죠?
React도 똑같아요. UI를 작은 블록(컴포넌트)으로 나누고, 조합해서 화면을 만듭니다.

```
UpNext 앱 화면 구성:
┌─────────────────────┐
│     Header          │  ← Header 컴포넌트
├─────────────────────┤
│  ┌───────────────┐  │
│  │ ChallengeCard │  │  ← ChallengeCard 컴포넌트
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ ChallengeCard │  │  ← 같은 컴포넌트 재사용!
│  └───────────────┘  │
├─────────────────────┤
│     BottomNav       │  ← BottomNav 컴포넌트
└─────────────────────┘
```

## UpNext에서 만든 컴포넌트들

### ChallengeCard — 챌린지 카드

```tsx
// components/cards/ChallengeCard.tsx
export default function ChallengeCard({ card, isSelected, onSelect }: Props) {
  return (
    <div className="rounded-2xl border-2 p-4">
      <span>{card.emoji}</span>
      <h3>{card.title}</h3>
    </div>
  );
}
```

**분석:**
- `function ChallengeCard` → 컴포넌트 이름 (항상 대문자로 시작)
- `{ card, isSelected, onSelect }` → [[Props]] (외부에서 받는 데이터)
- `return (...)` → 화면에 보여줄 **JSX** (HTML처럼 생긴 코드)
- `export default` → 다른 파일에서 이 컴포넌트를 가져다 쓸 수 있게 내보내기

### "use client" 지시어

```tsx
"use client"; // 파일 맨 위에 이걸 쓰면

// 이 컴포넌트는 브라우저(클라이언트)에서 실행됩니다
```

**왜 필요해?**
[[Next.js]]는 기본적으로 서버에서 HTML을 미리 만들어요 (서버 컴포넌트).
하지만 버튼 클릭, 애니메이션 같은 **인터랙션**이 필요하면 브라우저에서 실행해야 하니까
`"use client"`를 붙여서 "이건 브라우저에서 돌려줘"라고 알려주는 거예요.

## 컴포넌트 = Figma Component

| Figma | React |
|-------|-------|
| Component | function 컴포넌트 |
| Component Properties | [[Props]] |
| Variant | props로 분기 (isSelected, isCompleted) |
| Instance | `<ChallengeCard />` |
| Auto Layout | Flexbox/CSS |
| Detach Instance | 코드를 복사해서 수정 |

## 관련 문서

- [[Props]] — 컴포넌트에 데이터를 전달하는 방법
- [[TypeScript]] — 컴포넌트 타입 정의
- [[Tailwind CSS]] — 컴포넌트 스타일링
- [[상태 관리(State)]] — 컴포넌트에서 변하는 데이터 관리
