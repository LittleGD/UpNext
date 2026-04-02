# Zustand (쭈스탄트)

> 독일어로 "상태"라는 뜻. React 앱에서 **전역 상태**를 쉽게 관리하는 라이브러리.

## 한 줄 요약

"모든 화면이 함께 쓰는 공유 메모장"

## 왜 필요한가?

```
❌ 없으면: 각 화면이 따로따로 데이터를 가짐 → 동기화 어려움
✅ 있으면: 하나의 저장소에서 모든 화면이 같은 데이터를 읽음
```

## 기본 사용법

```typescript
// 1. 저장소(Store) 만들기
import { create } from "zustand";

const useCountStore = create((set) => ({
  count: 0,                              // 상태
  increase: () => set((s) => ({          // 상태를 바꾸는 함수
    count: s.count + 1
  })),
}));

// 2. 컴포넌트에서 사용하기
function Counter() {
  const count = useCountStore((s) => s.count);
  const increase = useCountStore((s) => s.increase);

  return <button onClick={increase}>{count}</button>;
}
```

## UpNext에서의 활용

`useGameStore`가 관리하는 데이터:

```
📋 daily (오늘의 상태)
├── drawnCards      → 뽑힌 6장
├── selectedCards   → 선택한 카드들
├── completedIds    → 완료한 카드 ID들
└── isDrawComplete  → 오늘 뽑기 했는지

📊 progress (전체 진행도)
├── currentStreak   → 현재 연속일수
├── unlockedCardIds → 해금된 카드 목록
└── mode            → 일반/갓생/초갓생
```

## `(s) => s.daily` 패턴이 뭔데?

이건 **selector(셀렉터)**라고 불러요.
"전체 저장소에서 내가 필요한 부분만 꺼내 쓸게"라는 뜻이에요.

```typescript
// 전체 다 가져오기 (비추천 - 뭐 하나만 바뀌어도 다시 그려짐)
const store = useGameStore();

// 필요한 것만 가져오기 (추천 - daily가 바뀔 때만 다시 그려짐)
const daily = useGameStore((s) => s.daily);
```

## 관련 문서

- [[상태 관리(State)]] — State 개념 전체
- [[LocalStorage]] — Zustand와 함께 데이터 영구 저장
- [[React 컴포넌트]] — Store를 사용하는 컴포넌트
