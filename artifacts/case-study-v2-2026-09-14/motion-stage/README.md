# UpNext 모션 데모 스테이지 (레퍼런스 문법 재현, 2026-09-14)

레퍼런스 `~/Downloads/app-videodemo-reff.mp4` (720×720, 11초, 30fps, 음악 있음)의 문법을 코드로 옮긴 것이다. 스크린 녹화가 아니라 실제 UI 부품을 잘라내 3D 공간에서 움직이는 방식.

레퍼런스에서 읽은 문법과 UpNext 대응
| 구간 | 레퍼런스 | UpNext 스테이지 |
|---|---|---|
| 0.0~1.3초 | 앱 아이콘 목록이 모션 블러로 스크롤, Maps 아이콘에 초점 | 챌린지 카드 목록이 스크롤, 라임 애스터리스크 아이콘이 선명하게 착지 |
| 1.3~3.7초 | 키네틱 타이포 "Let's Plan / Your [아이콘] Adventure" | "Draw Today / Your [아이콘] Challenge", 단어별 스태거 |
| 3.7~4.9초 | Directions 아이콘 줌, 흰 카드 위 Directions 버튼 | 덱 줌, 보드 카드 "Tap to complete" |
| 4.9~7.7초 | 장소 카드 3장이 블러와 함께 날아들고 파란 경로 선 | 챌린지 카드 3장이 날아들고 라임 스트릭 선이 그려짐 |
| 7.7~10.1초 | 지도 앱 아이콘에서 실제 지도로 줌 | 폴라로이드가 어둠에서 현상되고, 불꽃 카드가 12에서 13일로 켜지며 줌 |
| 10.1~11.2초 | 제작자 로고 | 앱 아이콘 + UpNext + Challenge Card Habits |

기법
- Web Animations API로 타임라인을 만들고 `window.__seek(t)`로 프레임마다 정지시켜 Playwright로 캡처. 결정론적이라 같은 결과가 나온다.
- 모션 블러는 120fps로 렌더한 뒤 ffmpeg `tmix` 4프레임 평균으로 만든다(진짜 시간 블러). 피사계 심도는 CSS blur.
- 소재는 시뮬레이터 3x 캡처를 잘라낸 PNG. 서체는 April16th Promise, 색은 앱 토큰(#CDF564).
- 음악은 앱 자체 BGM `bgm-main.m4a`(CC0 출처, 앱 README 참조) 11.2초, 페이드.

렌더
```bash
cd motion-stage && npm init -y && npm i playwright && npx playwright install chromium
DUR=11.2 SUB=4 OUT=final_nomusic.mp4 node render.js
ffmpeg -i final_nomusic.mp4 -i assets/bgm-main.m4a -filter_complex "[1:a]atrim=0:11.2,afade=t=in:d=0.6,afade=t=out:st=10.0:d=1.2,volume=0.9[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest upnext_demo_11s.mp4
```
SUB=1 이면 블러 없는 빠른 프리뷰(30초). 크기는 stage.html 의 1080×1080 과 render.js 의 viewport 를 함께 바꾼다.

밝은 배경 변형이 필요하면 `#stage` 배경과 그림자만 바꾸면 되지만, 카드 PNG 모서리에 어두운 배경 픽셀이 남아 있어 마스크(border-radius + overflow)를 추가해야 한다.

## 레퍼런스 2 분석 (2026-09-14 오후, `~/Downloads/app-videodemo-reff.mp4` 교체본)

파일: 720×1280 세로, 24fps, 15.9초, 음악 있음. 컷 28개(임계 0.3), 대부분 0.5~0.6초, 헤드라인 구간은 0.17~0.3초의 연타.

| 시간 | 샷 | 문법 |
|---|---|---|
| 0.0~0.6 | 검정 위 "Introducing", 단어 일부만 분홍으로 색 스윕 | 인트로 자막 |
| 0.6~1.2 | 흰 배경, 빨간 워드마크 + 분홍 돼지 마스코트가 찌그러졌다 펴짐 | 로고 스쿼시 |
| 1.2~2.2 | 분홍 블록, 기울어진 폰에서 알림 카드가 3D로 튀어나옴. 다음 컷은 같은 폰 다른 기울기 | 포즈 컷, 부품 돌출 |
| 2.2~3.2 | 흰 배경, 홈 화면 폰에서 잔액 카드가 돌출되고 숫자가 £2,031→£5,428로 카운트업. 검정 배경 컷 | 카운트업, 배경 교체 |
| 3.2~3.75 | 흰 배경, 일러스트 아이콘 3개가 스쿼시로 팝 | 플로리시 |
| 3.75~4.75 | 분홍 블록, Budgeting 폰 크게 기울어짐, 이어서 흰 배경에서 미세하게 다른 각도로 연속 컷 | 포즈 컷 |
| 4.75~5.85 | 헤드라인 "Your new money app" 고정, 배경 블록(파랑·분홍·빨강·노랑·초록)과 폰 화면이 컷마다 교체 | 헤드라인 앵커 + 연타 |
| 5.85~6.9 | 스타터 팩 카드 4장이 3D로 부채꼴, 폰 안으로 들어감, 카드 한 장이 폰 밖으로 돌출 | 부품 돌출 |
| 6.9~8.5 | Invest 폰 + Thrill Seeker 카드 돌출, "Invest effortlessly" 헤드라인 위에 파랑·분홍·노랑 블록 연타 | 헤드라인 앵커 |
| 8.5~9.5 | 관심사 칩 6개가 3D 공간에 흩어졌다가 폰 안으로 | 부품 산포 |
| 9.5~11.0 | "Tailored to you" 고정, 파랑·분홍·빨강·노랑·초록 블록에 서로 다른 화면 연타 | 헤드라인 앵커 + 연타 |
| 11.0~15.9 | 빨강 엔드 카드, 돼지 + "Moolah / Money on easy mode." 길게 유지 | 엔드 카드 |

레퍼런스 1과의 차이: 트윈 대신 하드 컷, 블러 대신 평면 색 블록, 부품이 폰에서 돌출, 헤드라인은 고정하고 주변을 교체, 엔드 카드가 전체의 3분의 1.

UpNext 대응(다크 유지, 16:9, 카피 유지)
- 배경 블록: 검정(#0a0a0a), 딥 퍼플(#241638), 라임(#CDF564, 검정 글자), 시안(#9BF0E1, 검정 글자). 라임·시안 블록은 헤드라인 연타 구간에서만.
- 폰: CSS 베젤 + 시뮬레이터 3x 캡처. 포즈 컷은 회전 -14°/0°/+10°, 스케일 0.92/1/1.06.
- 돌출 부품: 카드 프리뷰, 보드 카드, 폴라로이드, 불꽃 카드(12→13 카운트업), 룬 상자 모달, 위젯 미리보기.
- 헤드라인: "Draw Today / Your ✳ Challenge" 고정. 보조 캡션 후보 "Snap the proof", "Keep the Flame", "Grow your Hero"는 빼도 된다.
- 음악: 앱 BGM 강철 산봉우리(MintoDog Mountain Stage, 165 BPM, CC0). 컷을 박자에 맞춘다.
- 엔드 카드: 아이콘 + UpNext + Challenge Card Habits, 4초 유지.
