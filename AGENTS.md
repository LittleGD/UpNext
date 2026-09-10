<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 프로젝트 규칙 (Claude Code / Codex 공통)

### 협업과 git
- 이 체크아웃(`~/Documents/UpNext`)은 여러 에이전트 세션이 동시에 공유한다. `git add -A`, `git commit -a` 금지. 커밋 전 `git status --short`로 내 변경만 골라 경로를 명시해 add 한다. 남의 미커밋 변경은 건드리지 않는다.
- `Localizable.xcstrings`는 여러 세션이 함께 고치는 단일 JSON이다. 커밋 전 HEAD 기준으로 재생성하고 삭제된 키가 0인지 확인한다.
- 리포가 iCloud Drive(~/Documents) 아래라 `" 2.xml"`, `" 2.ts"` 같은 충돌 복사본이 생긴다. 빌드나 lint 오류가 나면 먼저 이 복사본을 찾아 지운다.

### 검증
- "불가능하다" 또는 "고쳤다"고 보고하기 전에 그 동작을 실제로 한 번 실행한다. 조회 결과의 부재는 근거가 아니다. UI 변경은 시뮬레이터 스크린샷으로 확인한 뒤에만 완료로 보고한다.
- Firestore rules는 커밋과 배포가 별개다. `--project upnext-6ca93`으로 수동 배포한다. 거절된 write는 오류 없이 무시된다.

### 디자인
- 아이콘을 배경 박스 안에 넣지 않는다. 카드와 버튼에 border를 쓰지 않는다. 배경색 단계와 글로우로 위계를 만든다. 선택 상태와 등급 표시만 예외.
- 솔로=accentPrimary(라임), 듀오/소셜=accentCyan. CTA 버튼에도 같은 분리를 적용한다.
- iOS 버튼(UNButtonStyle)은 cornerRadius 12, press scale 0.97, disabled opacity 0.5, primary 높이 52. 세그먼트와 토글(Capsule)은 예외.
- 레트로 표현은 아날로그, 필름, 기계식 레퍼런스를 우선한다. LCD, 7-seg, 캠코더 같은 디지털 빈티지는 명시 요청 시에만.
- 사용자에게 보이는 카피와 문서에 em-dash(—)를 쓰지 않는다.
