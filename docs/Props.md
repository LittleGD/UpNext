# Props (프롭스)

> 컴포넌트에 외부에서 전달하는 데이터. Figma의 **Component Properties**와 같은 개념.

## Props란?

Figma에서 버튼 Component에 "Label", "State", "Icon" 같은 Properties를 만들죠?
React에서는 이걸 **Props**라고 불러요.

```
Figma Component Properties    →    React Props
─────────────────────────          ──────────
Label: "시작하기"                   title: "시작하기"
State: Default/Hover/Active        isSelected: true/false
ShowIcon: true/false               emoji: "🚶"
```

## UpNext에서의 Props 예시

### ChallengeCard의 Props

```typescript
// 이 인터페이스가 "이 컴포넌트에 뭘 넘겨줄 수 있는지" 정의
interface ChallengeCardProps {
  card: CardType;        // 필수: 카드 데이터
  isSelected?: boolean;  // 선택: 선택된 상태인지 (기본 false)
  isCompleted?: boolean; // 선택: 완료된 상태인지 (기본 false)
  onSelect?: () => void; // 선택: 클릭했을 때 실행할 함수
  disabled?: boolean;    // 선택: 비활성화 상태인지
}
```

### 사용하는 쪽 (부모 컴포넌트)

```tsx
// CardDrawScreen.tsx에서 ChallengeCard를 사용할 때
<ChallengeCard
  card={card}              // 카드 데이터 전달
  isSelected={true}        // "이 카드는 선택된 상태야"
  onSelect={() => 클릭시실행할함수()}
/>
```

## `() => void`가 뭔데?

```typescript
onSelect?: () => void;
```

이건 **"함수를 넘겨줄 수 있어"**라는 뜻이에요.
- `()` → 인자(입력값) 없음
- `=>` → 화살표 함수 표기
- `void` → 반환값 없음 (그냥 실행만 하면 됨)

Figma에서 프로토타입 인터랙션을 설정하는 것과 비슷해요:
"이 버튼 누르면 → 다음 프레임으로 이동" 처럼,
"이 카드 클릭하면 → onSelect 함수를 실행" 이런 거예요.

## Props 기본값 설정

```typescript
function ChallengeCard({
  card,
  isSelected = false,  // 안 넘기면 기본값 false
  isCompleted = false,
  disabled = false,
}: ChallengeCardProps) {
```

Figma Component에서 Property 기본값을 설정하는 것과 동일해요.

## 관련 문서

- [[React 컴포넌트]] — Props를 받는 컴포넌트
- [[TypeScript]] — Props 타입 정의
- [[상태 관리(State)]] — Props vs State의 차이
