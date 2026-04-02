# TypeScript (타입스크립트)

> JavaScript에 **타입(Type)** 시스템을 추가한 언어. 코드의 "맞춤법 검사기" 역할.

## 왜 TypeScript를 쓰나?

JavaScript는 자유롭지만 실수를 잡아주지 않아요:

```javascript
// JavaScript — 에러 없이 실행되지만, 버그!
let userName = "JM";
userName = 42; // 이름이 갑자기 숫자가 됨 😱
```

TypeScript는 이런 실수를 **코드를 실행하기 전에** 잡아줍니다:

```typescript
// TypeScript — 에러를 미리 알려줌
let userName: string = "JM";
userName = 42; // ❌ 빨간줄! "number는 string에 할당할 수 없습니다"
```

## UpNext에서 사용한 TypeScript 개념들

### 1. `type` — 타입 별칭 (Type Alias)

```typescript
// card.ts에서
type Rarity = "normal" | "rare" | "unique" | "legend";
```

**이게 뭔데?**
`Rarity`라는 이름표를 만들어서, "이 값은 반드시 이 4개 중 하나여야 해"라고 정한 거예요.
`|`는 "또는"이라는 뜻이에요.

Figma에서 Auto Layout 방향을 "horizontal | vertical" 중 하나만 선택할 수 있는 것과 같아요.

### 2. `interface` — 인터페이스 (객체의 설계도)

```typescript
// card.ts에서
interface ChallengeCard {
  id: string;
  title: string;
  rarity: Rarity;
  emoji: string;
}
```

**이게 뭔데?**
"챌린지 카드는 반드시 id, title, rarity, emoji를 가져야 해"라는 **설계도**예요.
Figma의 Component Properties처럼, 이 컴포넌트가 가져야 하는 속성들을 정의하는 거예요.

### 3. `?` — 선택적 속성 (Optional Property)

```typescript
interface ChallengeCard {
  title: string;        // 필수
  target?: number;      // 선택 (있어도 되고 없어도 됨)
}
```

`?`가 붙으면 "있으면 좋고, 없어도 괜찮아"라는 뜻이에요.

### 4. `Record<K, V>` — 딕셔너리 타입

```typescript
const MODE_CARD_COUNT: Record<GameMode, number> = {
  normal: 1,
  godlife: 2,
  ultra: 3,
};
```

`Record<GameMode, number>`는 "GameMode를 키로, number를 값으로 가지는 객체"라는 뜻이에요.
모든 GameMode에 대해 빠짐없이 값을 넣어야 하니까, 실수로 하나를 빼먹으면 에러가 나요.

## 관련 문서

- [[React 컴포넌트]] — TypeScript와 함께 쓰는 컴포넌트
- [[Props]] — 타입으로 정의하는 컴포넌트 속성
- [[상태 관리(State)]] — 타입이 있는 상태 관리
