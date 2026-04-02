# LocalStorage (로컬 스토리지)

> 브라우저에 내장된 **간단한 저장소**. 앱을 닫았다 열어도 데이터가 유지됨.

## 한 줄 요약

"브라우저 안에 있는 작은 메모장. 껐다 켜도 안 지워짐."

## 기본 개념

```
메모리 (RAM)         vs    LocalStorage
──────────                ──────────────
앱 끄면 사라짐             앱 꺼도 남아있음
빠름                       약간 느림
용량 큰 데이터 OK          5MB 제한
```

## JavaScript 기본 사용법

```javascript
// 저장하기
localStorage.setItem("name", "JM");

// 불러오기
const name = localStorage.getItem("name"); // "JM"

// 삭제하기
localStorage.removeItem("name");
```

## 문제: 문자열만 저장 가능

LocalStorage는 **문자열(string)** 만 저장할 수 있어요.
카드 데이터 같은 객체(object)를 저장하려면 변환이 필요해요:

```javascript
// 객체 → 문자열 (저장할 때)
const data = { streak: 5, mode: "godlife" };
localStorage.setItem("progress", JSON.stringify(data));
// 저장된 값: '{"streak":5,"mode":"godlife"}'

// 문자열 → 객체 (불러올 때)
const loaded = JSON.parse(localStorage.getItem("progress"));
// loaded = { streak: 5, mode: "godlife" }
```

## UpNext의 storage.ts

우리가 만든 헬퍼 함수들이 이 과정을 자동으로 해줘요:

```typescript
// lib/storage.ts
saveToStorage("progress", { streak: 5 });  // 자동으로 JSON.stringify
loadFromStorage("progress");               // 자동으로 JSON.parse
```

### typeof window === "undefined" 체크는 뭔데?

```typescript
if (typeof window === "undefined") return null;
```

[[Next.js]]는 서버에서도 코드를 실행하는데, 서버에는 브라우저가 없어서
`localStorage`도 없어요. 그래서 "브라우저에서만 실행해"라고 체크하는 거예요.

## Chrome에서 LocalStorage 확인하기

1. 앱을 연 상태에서 `F12` (개발자 도구 열기)
2. **Application** 탭 클릭
3. 왼쪽에서 **Local Storage** → `localhost:3000` 선택
4. `upnext_daily`, `upnext_progress` 키를 확인할 수 있음

## 관련 문서

- [[상태 관리(State)]] — Zustand와 LocalStorage의 연결
- [[Zustand]] — 상태를 LocalStorage에 자동 저장
