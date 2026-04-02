# Tailwind CSS

> CSS를 클래스 이름으로 직접 쓰는 **유틸리티 기반(Utility-First)** CSS 프레임워크.

## 한 줄 요약

"CSS를 파일 따로 안 만들고, HTML/JSX에 바로 스타일을 적는 방식"

## 기존 CSS vs Tailwind

```css
/* 기존 CSS — 별도 파일에 스타일 작성 */
.card {
  padding: 16px;
  border-radius: 16px;
  border: 2px solid gray;
  display: flex;
  gap: 12px;
}
```

```tsx
{/* Tailwind — 클래스 이름으로 바로 적용 */}
<div className="p-4 rounded-2xl border-2 border-gray-300 flex gap-3">
```

## 자주 쓰는 Tailwind 클래스 (UpNext 기준)

### 레이아웃
| 클래스 | CSS | 설명 |
|--------|-----|------|
| `flex` | `display: flex` | 가로/세로 정렬 시작 |
| `flex-col` | `flex-direction: column` | 세로 배치 |
| `items-center` | `align-items: center` | 세로 가운데 정렬 |
| `justify-between` | `justify-content: space-between` | 양쪽 끝 배치 |
| `gap-3` | `gap: 12px` | 요소 간 간격 |

### 여백
| 클래스 | CSS | 설명 |
|--------|-----|------|
| `p-4` | `padding: 16px` | 안쪽 여백 (4 × 4px = 16px) |
| `px-4` | `padding-left/right: 16px` | 좌우 여백만 |
| `mt-2` | `margin-top: 8px` | 위쪽 바깥 여백 |

### 크기/모양
| 클래스 | CSS | 설명 |
|--------|-----|------|
| `w-full` | `width: 100%` | 전체 너비 |
| `rounded-2xl` | `border-radius: 16px` | 둥근 모서리 |
| `border-2` | `border-width: 2px` | 테두리 두께 |

### 색상
| 클래스 | CSS | 설명 |
|--------|-----|------|
| `bg-gray-50` | `background: #f9fafb` | 배경색 |
| `text-gray-900` | `color: #111827` | 글자색 |
| `border-blue-400` | `border-color: #60a5fa` | 테두리색 |

### 반응형
| 클래스 | 의미 |
|--------|------|
| `text-sm` | 작은 글자 (14px) |
| `text-lg` | 큰 글자 (18px) |
| `text-[10px]` | 커스텀 크기 (10px) |

## Figma와의 대응

```
Figma Auto Layout    →    Tailwind
──────────────            ─────────
Direction: Vertical  →    flex flex-col
Gap: 12              →    gap-3
Padding: 16          →    p-4
Alignment: Center    →    items-center
Fill Container       →    w-full
```

## 관련 문서

- [[React 컴포넌트]] — Tailwind로 스타일링하는 컴포넌트
- [[프로젝트 구조]] — globals.css 위치
