# Framer Motion

> React용 **애니메이션 라이브러리**. Framer 팀이 만듦. 선언적으로 애니메이션을 정의.

## 한 줄 요약

"코드 한 줄로 부드러운 애니메이션을 추가하는 마법 도구"

## 기본 사용법

```tsx
import { motion } from "framer-motion";

// 일반 div → motion.div로 바꾸면 애니메이션 가능
<motion.div
  initial={{ opacity: 0, y: 20 }}   // 시작 상태: 투명하고 20px 아래
  animate={{ opacity: 1, y: 0 }}     // 최종 상태: 보이고 제자리
  // → 자동으로 시작→최종 사이를 부드럽게 애니메이션!
>
  카드 내용
</motion.div>
```

## Figma 프로토타입과의 비교

```
Figma Smart Animate          →    Framer Motion
──────────────────                ──────────────
Initial State (프레임 1)      →    initial={{ opacity: 0 }}
Final State (프레임 2)        →    animate={{ opacity: 1 }}
Transition: Ease In Out       →    transition={{ ease: "easeInOut" }}
Trigger: On Click             →    whileTap={{ scale: 0.97 }}
```

## UpNext에서 사용한 애니메이션들

### 1. 카드 등장 (순차적으로 나타나기)

```tsx
// CardDrawScreen.tsx
{daily.drawnCards.map((card, index) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.1 }}  // 0.1초씩 순서대로
  >
```

### 2. 탭 반응

```tsx
// ChallengeCard.tsx
<motion.div
  whileTap={{ scale: 0.97 }}  // 탭하면 살짝 줄어듦
>
```

### 3. 완료 체크 애니메이션

```tsx
<motion.div
  initial={{ scale: 0 }}     // 0에서 시작
  animate={{ scale: 1 }}     // 1로 팡! 하고 나타남
>
  ✅
</motion.div>
```

## Phase 2에서 추가될 애니메이션

- 카드 뒤집기 (3D flip)
- 카드 팬 아웃 (부채꼴 펼치기)
- 완료 시 파티클/컨페티
- 레전드 카드 빛나는 효과

## 관련 문서

- [[React 컴포넌트]] — motion.div를 사용하는 컴포넌트
- [[Tailwind CSS]] — Framer Motion과 함께 쓰는 스타일링
