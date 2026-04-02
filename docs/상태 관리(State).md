# 상태 관리 (State Management)

> 앱에서 **변하는 데이터**를 관리하는 방법. "지금 어떤 카드가 선택되어 있지?"를 추적하는 것.

## State란?

**[[Props]]** = 외부에서 받는 고정된 데이터 (읽기 전용)
**State** = 내부에서 변하는 데이터 (읽기 + 쓰기)

```
Props는 전달받은 이름표 (바꿀 수 없음)
State는 내가 적는 메모장 (수시로 바꿈)

예시:
- Props: "이 카드는 fitness-001이야" → 안 변함
- State: "이 카드가 선택되었어" → 클릭하면 변함
```

## UpNext의 상태 관리: [[Zustand]]

우리는 **Zustand**(쭈스탄트, 독일어로 "상태")라는 라이브러리를 썼어요.

### 왜 Zustand를 쓰나?

React에는 `useState`라는 내장 기능이 있지만, 여러 화면에서 같은 데이터를 공유하기 어려워요.

```
문제 상황:
홈 화면에서 카드를 선택함 → 컬렉션 화면에서 이걸 알아야 함
                          → 헤더에서 스트릭 숫자를 업데이트해야 함
                          → 설정 화면에서 통계를 보여줘야 함
```

Zustand는 **"모든 화면이 공유하는 메모장"** 역할을 해요.

### useGameStore 구조

```typescript
// store/useGameStore.ts 핵심 구조

const useGameStore = create<GameStore>((set, get) => ({
  // ---- 상태 (데이터) ----
  daily: { ... },      // 오늘의 드로우/선택/완료 상태
  progress: { ... },   // 전체 진행도 (스트릭, 해금 등)

  // ---- 액션 (데이터를 바꾸는 함수들) ----
  drawDailyCards: () => { ... },    // 카드 뽑기
  selectCard: (card) => { ... },    // 카드 선택
  completeChallenge: (id) => { ... }, // 챌린지 완료
}));
```

**create** → "새로운 저장소를 만들어줘"
**set** → "데이터를 이렇게 바꿔줘"
**get** → "현재 데이터를 읽어줘"

### 컴포넌트에서 사용하는 방법

```tsx
// 필요한 데이터만 골라서 가져오기 (구독 selector)
const daily = useGameStore((s) => s.daily);
const completeChallenge = useGameStore((s) => s.completeChallenge);
```

`(s) => s.daily`는 **"전체 저장소에서 daily만 가져와"**라는 뜻이에요.
이렇게 하면 daily가 바뀔 때만 이 컴포넌트가 다시 그려져서 성능이 좋아요.

## 데이터 흐름 다이어그램

```
유저 액션        →    Store 업데이트    →    화면 자동 갱신
─────────            ────────────          ──────────────
카드 뽑기 클릭   →   drawDailyCards()  →   6장 카드 표시
카드 선택        →   selectCard()      →   선택된 카드 강조
챌린지 완료 탭   →   completeChallenge()→  ✅ 표시 + 스트릭 증가
```

## LocalStorage와의 연결

```
유저 행동 → Zustand 상태 변경 → 화면 업데이트 (즉시)
                               ↓
                          LocalStorage에 저장 (영구)
                               ↓
앱 다시 열 때 ← LocalStorage에서 복원 ← initialize()
```

모든 상태 변경마다 `saveToStorage()`를 호출해서 브라우저를 닫아도 데이터가 유지돼요.

## 관련 문서

- [[Zustand]] — 상태 관리 라이브러리 상세
- [[LocalStorage]] — 브라우저 저장소
- [[Props]] — Props vs State 차이
- [[React 컴포넌트]] — 상태를 사용하는 컴포넌트
