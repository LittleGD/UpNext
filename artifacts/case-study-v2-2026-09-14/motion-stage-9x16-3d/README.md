# v5.1 수정 (2026-09-14)

사용자 피드백 세 가지: 엔드카드에 스토어 배지와 Download Now, 워드마크 그림자 제거, 헤드라인 중앙 정렬 후 폰과 한 그룹으로.

- 워드마크 그림자 제거. `wordmark()`가 흰색 SVG 한 겹만 그린다. 로고 샷과 엔드카드 모두 적용.
- 헤드라인 중앙 정렬. `.h`를 프레임 전체 폭의 flex 행으로 바꾸고 단어 사이는 `column-gap`으로 띄운다.
- 헤드라인 위치를 폰 기준으로 계산. `HEAD={y:1330,s:.86,gap:98}` 한 곳에서 헤드라인 샷 폰의 중심, 크기, 글자와 폰 사이 간격을 정하고, `headline()`이 폰 윗변에서 위로 줄 위치를 잡는다. 시각 간격 약 70px, 글자 위 여백 약 300px이라 글자와 폰이 한 그룹으로 읽힌다. 이전에는 글자가 좌측 top 150px, 폰 윗변이 942px로 간격이 약 540px였다.
- 단어 등장 버그 수정. 단어 span이 자기 시작 시간 전에 최종 위치에 잠깐 보였다. 단어 배우의 기본값을 `op:0, y:-150`으로 두고 show 구간을 없애 매 프레임 값이 적용되게 했다.
- 엔드카드: 마스코트, 워드마크, "Challenge Card Habits", "Download Now"(라임 64px), App Store와 Google Play 배지(높이 100px, 간격 28px). 12, 15, 17프레임 지연으로 차례로 팝.
  - App Store 배지는 애플 공식 SVG다. Adobe Acrobat 번들에 들어 있던 `Download_on_the_App_Store_Badge_en_135x40.svg`를 로컬 복사했다.
  - Google Play 배지는 구글 공식 PNG다. 구글 배지 페이지의 `en_badge_web_generic.png`(646×250, 4,904바이트)를 사용자 승인 후 받았고, 투명 여백만 잘라 `google-play-en.png`(564×168)로 쓴다. 아트워크 자체는 손대지 않았다.
  - Play 공개 페이지(`app.vercel.upnext`)가 2026-09-14 기준 404라서 Google Play 배지 아래에 회색 "Coming soon" 캡션을 달았다. 배지가 착지한 뒤(엔드카드 시작 +24프레임) on-fours로 튀어나온다. 프로덕션이 열리면 `.soon` 요소만 지우면 된다.
- 퇴장 거리 축소(P4, P7, P12, P15, 헤드라인 샷 폰). 폰이 움직이는 도중에 컷이 떨어지고 모션블러 계단이 줄었다. 최종 렌더는 SUB=12.
- 렌더러 겹침 검사 대상을 `.h .w,.intro span,.wm,.sub,.cta,.badges img`로 바꿨다. 헤드라인 행이 전체 폭이 되어 행 자체를 검사하면 항상 걸리기 때문이다.
- `shot.js`: 원하는 시각 몇 장만 풀해상도로 찍는 확인용 스크립트. `node shot.js 6.0 10.0`
- 렌더러 종료 처리. Playwright가 SIGTERM을 가로채 브라우저만 닫으면 렌더 루프가 브라우저를 다시 띄워 계속 돌았다. pkill로 멈춘 줄 알았던 렌더가 같은 frames 폴더에 계속 쓰던 사고가 있었다. 이제 `render4.js`가 SIGTERM, SIGINT에서 바로 종료한다. 이어서 렌더할 때는 `RESUME=1`로 첫 빈 프레임부터 재개한다.

최종 렌더
```bash
STAGE=stage5.html FPS=30 SUB=12 CHUNK=150 OUT=final51_nomusic.mp4 node render4.js   # 약 25분
ffmpeg -i final51_nomusic.mp4 -ss 0.317 -i assets/bgm-fitness.m4a -filter_complex "[1:a]atrim=0:16,afade=t=in:d=0.15,afade=t=out:st=14.0:d=2.0,volume=0.85[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest upnext_motion_demo_9x16_v51_lowpoly.mp4
```

---

# UpNext 모션 데모 9:16 v5, 로우폴리 폰 + 카메라 리그 + 매치컷 (2026-09-14)

v4.1에서 지적된 네 가지(워드마크, 폰 모서리, 완급, 배경·카메라·매치컷)를 레퍼런스 컷 분석을 기준으로 다시 짰다. 파일: `stage5.html`(타임라인), `phone5.js`(로우폴리 폰), `assets/parts2/`(매치컷용 부품), `assets/screens/*_nocard.png`(부품이 빠진 화면), `assets/wordmark.svg`(`src/app/logo.svg` 복사본).

## 1. 레퍼런스(Moolah 세로 프로모) 컷 분석

프레임 차분으로 컷을 잡고(24fps, 15.8초) 샷마다 배경색·샷 내 에너지·퇴장 가속을 쟀다. 컨택트 시트는 `../sheets/ref2_shots_*.png`.

| 샷 | 시작 | 길이 | 배경 | 내용 |
|---|---|---|---|---|
| 0 | 0.00 | 0.58 | 검정 | "Introducing" 글자색 스윕 |
| 1 | 0.58 | 0.58 | 흰 | 워드마크 + 돼지 마스코트 팝 |
| 2 | 1.17 | 0.42 | 핑크 | ECU. 폰 모서리가 프레임을 가로지르고 화면에 알림 카드 |
| 3 | 1.58 | 0.58 | 흰 | 폰이 기울었다 정면으로. 알림 카드가 화면에서 떠올라 날아감 (컴포넌트 OUT) |
| 4 | 2.17 | 0.58 | 흰 | 잔액 카드가 왼쪽에서 날아와 화면에 착지, 착지하며 카운트업 (컴포넌트 IN) |
| 5 | 2.75 | 0.46 | 검정 | 홈 화면 폰이 옆으로 돌아가는 턴 홀드 |
| 6 | 3.21 | 0.54 | 흰 | 스티커(쇼핑백) 하나만 팝 |
| 7 | 3.75 | 1.00 | 흰 | 매치컷. 같은 스티커가 들어 있는 예산 화면, 폰이 프레임보다 크고 카메라가 오빗 |
| 8 | 4.75 | 0.58 | 파랑 | 헤드라인 "Your new money app" 단어별 등장, 폰은 하단에 작게 |
| 9-11 | 5.33 | 0.17×3 | 핑크/빨강/노랑 | 버스트. 헤드라인 유지, 화면과 폰 각도만 교체 |
| 12 | 5.83 | 0.50 | 초록 | Awards 화면, 폰이 카메라 쪽으로 기울어짐 |
| 13 | 6.33 | 0.58 | 흰 | 스타터팩 카드 4장이 날아와 쌓임 (컴포넌트) |
| 14 | 6.92 | 0.33 | 핑크 | 매치컷. 같은 카드들이 폰 리스트에 |
| 15 | 7.25 | 1.25 | 흰 | Thrill Seeker 카드가 리스트에서 떠오르고, 화면이 상세로 바뀌고, 카드가 그 위에 착지. 폰 회전 |
| 16 | 8.50 | 0.38 | 파랑 | 헤드라인 "Invest effortlessly" |
| 17 | 8.88 | 0.58 | 핑크→노랑 | 빠른 컬러컷 2회, 헤드라인 유지 |
| 18 | 9.46 | 0.58 | 흰 | 관심사 칩 7개가 흩어져 들어옴 (컴포넌트) |
| 19 | 10.04 | 1.00 | 흰 | 매치컷. 칩이 폰 화면에 정렬, 폰이 돌다가 퇴장 |
| 20 | 11.04 | 0.58 | 파랑 | 헤드라인 "Tailored to you" |
| 21-25 | 11.62 | 0.17×6 | 핑크/빨강/노랑/초록/파랑/핑크 | 버스트 |
| 26 | 12.62 | 3.17 | 빨강 | 엔드카드. 마스코트 idle + 워드마크 + 슬로건 |

숫자로 보면
- 27샷, 중앙값 0.54초. 0.5초 넘는 샷 14개, 0.3초 미만 7개는 전부 버스트 안에 있다. 완급은 "긴 무빙 홀드 → 짧은 헤드라인 → 4프레임 버스트"의 반복이다.
- 배경 변경 23회 중 12회가 버스트, 4회가 헤드라인 진입이다. 컴포넌트·매치컷·오빗 같은 내러티브 샷은 전부 흰색이다. 색은 문장 부호처럼만 쓴다.
- 카메라: 긴 샷에서는 폰이 프레임보다 크고(모서리가 잘림) 카메라가 30~40도 오빗한다. 헤드라인 샷은 폰이 하단에 작게, 아래가 잘린다. ECU는 폰 모서리 하나만 보인다.
- 매치컷 5종: 알림 OUT, 잔액 IN(카운트업), 스티커→화면, 카드 더미→리스트→리프트·착지, 칩→화면. 전부 하드컷이고 페이드가 없다.

v4.1은 배경 세그먼트 30개가 1~2비트마다 균등하게 바뀌었고(와이프까지 붙어서 변화가 더 크게 보였다), 폰은 늘 정면 중앙에 통째로 있었고, 카메라는 고정이었다. 컴포넌트→목업 장면은 없었다.

## 2. v5에서 바꾼 것

- 배경 23세그먼트로 레퍼런스와 같은 수지만 뭉쳐 놓았다. DARK가 흰색 역할(내러티브 10샷), LIME은 ECU와 매치컷 스틸 3샷, PURPLE은 헤드라인 3샷, 나머지 11컷은 버스트. 와이프를 없애고 전부 하드컷.
- 카메라 리그(`rig` 배우: yaw·pitch·dist·target). 긴 샷마다 오빗 30도와 돌리 인, ECU는 푸시 인, 헤드라인은 고정. 샷 사이즈 4종: ECU(폰 1.9배, 모서리만), CU(1.22배, 아래 잘림), BIG(1.42배, 위아래 잘림), HEAD(0.8배, 하단).
- 로우폴리 폰(`phone5.js`). 코너당 3면 모따기 + 1단 베벨을 ExtrudeGeometry로 뽑고 flatShading으로 면을 살렸다. 측면 버튼 4개, 후면 카메라 아일랜드(6각 렌즈). RoundedBox의 코너 노멀 보간 얼룩이 사라졌다. 확인 렌더: `lowpoly_phone_test.png`.
- 워드마크는 `src/app/logo.svg`를 그대로 인라인(흰색 + 라임 하드 섀도우). 로고 샷은 워드마크 outBack 팝 + 마스코트가 "t" 위에 on-fours로 착지. 엔드카드도 같은 조합.
- 매치컷 5종을 UpNext 재료로 옮겼다.
  1. 완료 카드 OUT: ECU(LIME) → 기울어진 폰이 정면이 되며 "Today's Challenge complete!" 카드가 화면에서 떠올라 날아감. 화면은 `complete_board_nocard`로 교체.
  2. 불꽃 카드 IN: 같은 포즈로 점프컷, 12일 불꽃 카드가 왼쪽에서 날아와 화면에 착지, 착지 오실레이션 + 0→12 카운트업(13프레임).
  3. 손패 6장이 날아와 쌓임(DARK) → LIME 매치컷(폰의 손패) → CU에서 "Read the News" 카드가 손패에서 떠올라 플립하며 프리뷰 카드가 되고, 화면이 보드로 바뀌면 다시 플립해 보드 카드로 착지.
  4. 스티커 8개가 흩어져 들어옴(DARK) → LIME 매치컷(데코 화면의 스티커 팔레트) → CU에서 폴라로이드가 떠오르고 화면이 앨범으로 바뀌며 앨범 슬롯에 착지.
  5. 히어로 스프라이트 팝(DARK, 아이콘 스파클) → BIG 던전 화면. `solveXY()`가 폰 위치를 풀어서 화면 속 스프라이트가 직전 샷의 스프라이트와 같은 프레임 좌표에서 시작한다(포지셔널 매치컷). 이어서 룬 상자 모달 팝, 전투 화면.
- 부품은 폰 로컬 좌표에 붙였다(`lpart`). 텍스처 픽셀 좌표를 `tl(cx,cy)`로 변환하므로 화면 위 슬롯에 정확히 앉는다. 슬롯 좌표는 템플릿 매칭으로 잡았다.

## 3. v5 샷 리스트 (비트 0.355초, k(n)=0.60+0.355n)

| 구간 | 배경 | 내용 |
|---|---|---|
| 0~k0 | DARK | Introducing 스윕 |
| k0~k2 | DARK | 워드마크 + 마스코트 |
| k2~k3 | LIME | ECU, 완료 카드 |
| k3~k5 | DARK | 폰 정면화, 완료 카드 OUT |
| k5~k7 | DARK | 불꽃 카드 IN + 카운트업, 퇴장은 턴 |
| k7~k9 | DARK | 손패 6장 쌓임 |
| k9~k10 | LIME | 매치컷 손패 화면 |
| k10~k14 | DARK | CU 오빗, 카드 리프트·플립·보드 착지 |
| k14~k16 | PURPLE | 헤드라인 Draw Today / Your ✳ Challenge |
| k16~k18 | CYAN/LIME/PURPLE/CYAN | 버스트 4컷 |
| k18~k20 | DARK | 스티커 8개 |
| k20~k21 | LIME | 매치컷 데코 화면 |
| k21~k25 | DARK | CU 오빗, 폴라로이드 리프트·앨범 착지 |
| k25~k27 | PURPLE/CYAN/LIME | 헤드라인 Keep the Flame + 빠른 컷 2 |
| k27~k29 | DARK | 히어로 스프라이트 팝 |
| k29~k32 | DARK | BIG 오빗 던전, 룬 상자 모달, 전투 |
| k32~k34 | PURPLE | 헤드라인 Grow your Hero |
| k34~k36 | LIME/CYAN/PURPLE/LIME | 버스트 4컷 |
| k36~16.0 | DARK | 엔드카드 |

## 4. 렌더

```bash
cd motion-stage-9x16-3d && npm i playwright three && npx playwright install chromium
STAGE=stage5.html FPS=10 SUB=1 OUT=preview5.mp4 node render4.js                 # 프리뷰, 약 70초
STAGE=stage5.html FPS=30 SUB=6 CHUNK=150 OUT=final5_nomusic.mp4 node render4.js  # 최종, 약 10분 (로우폴리라 v4보다 2배 빠름)
ffmpeg -i final5_nomusic.mp4 -ss 0.317 -i assets/bgm-fitness.m4a -filter_complex "[1:a]atrim=0:16,afade=t=in:d=0.15,afade=t=out:st=14.0:d=2.0,volume=0.85[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest upnext_motion_demo_9x16_v5_lowpoly.mp4
```

DOM 배우는 `.dom.on` 클래스로 켜고 끈다. 인라인 display를 지우면 `.center{display:flex}` 규칙이 `.dom{display:none}`를 이겨서 로고가 끝까지 남는 버그가 있었다(`.dom:not(.on){display:none!important}`로 고정).

## 5. 남은 것

- 진짜 GLB로 바꾸고 싶으면 Poly Pizza "Phone" by Quaternius(CC0, 224 tris, `bb788859-3dca-4a80-b4da-f5f26e6148f6.glb`, 15KB). 다운로드 승인이 필요하다. 다만 스크린 UV를 손봐야 해서, 지금의 절차형 로우폴리 폰이 화면 매핑과 치수 제어에는 더 낫다.
- 카메라 앱 화면은 시뮬레이터라 뷰파인더가 검다. 실기기 캡처로 교체 예정.
- 헤드라인 "Keep the Flame", "Grow your Hero"는 제거 가능한 보조 카피.

---

# UpNext 모션 데모 9:16 v4, three.js 3D 목업 + 12원칙 타임라인 (2026-09-14)

v3와 달라진 것
- 폰이 진짜 3D다. three.js RoundedBoxGeometry(752×1620×36) 본체에 MeshPhysicalMaterial(금속 .9, 거칠기 .28, 클리어코트 .7), RoomEnvironment 환경맵 반사, 키·림·헤미 라이트, 베젤과 둥근 스크린 평면(시뮬레이터 3x 캡처 텍스처), 접촉 그림자. 기울이면 두께와 반사가 실제 원근으로 보인다.
- 돌출 부품(카드 프리뷰, 보드 카드, 폴라로이드, 불꽃 카드, 룬 상자)도 같은 3D 공간의 평면이라 폰과 원근이 맞는다.
- 타임라인 엔진을 직접 짰다(WAAPI 대신). 배우(Actor)마다 x·y·z·rx·ry·rz·s·sx·sy·op 파라미터를 트윈으로 쌓고, 프레임 단위(1/30초)로 타이밍을 지정한다. 이징: outExpo, outBack(오버슈트), inCubic, 감쇠 스프링, steps.
- 12원칙 매핑은 `motion-stage-9x16/README.md`의 "v4 모션 규칙" 참조. 핵심은 등장 6~9프레임 정착(페이드 없음), 무빙 홀드(감속 드리프트), 퇴장 7~8프레임 가속, 예비 동작(폰 반동), 부차 동작(부품 부유), 스쿼시·스트레치, 아크, on-fours 스텝, 팔로우 스루(2행 2프레임 지연, 스파클 3프레임 지연).
- 불꽃 카드 위에 0→12 카운트업 오버레이(레퍼런스의 잔액 카운트업 대응).

렌더
```bash
cd motion-stage-9x16-3d && npm init -y && npm i playwright three && npx playwright install chromium
DUR=16 FPS=30 SUB=2 OUT=final4_nomusic.mp4 node render4.js     # 소프트웨어 GL이라 프레임당 약 1초
ffmpeg -i final4_nomusic.mp4 -ss 0.317 -i assets/bgm-fitness.m4a -filter_complex "[1:a]atrim=0:16,afade=t=in:d=0.15,afade=t=out:st=14.0:d=2.0,volume=0.85[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest upnext_demo_9x16_v4.mp4
```
프리뷰는 `FPS=12 SUB=1`. ES 모듈이라 file:// 대신 `serve.js`가 로컬 HTTP로 띄운다. 헤드리스 크로미움은 `--use-angle=swiftshader`로 WebGL을 돌린다.

GLB 모델로 교체하려면
- `GLTFLoader`로 불러와 본체 메시를 `makePhone()`의 RoundedBox 대신 넣고, 스크린 메시의 재질에 화면 텍스처를 입힌다. 모델의 스크린 영역 크기에 맞춰 `rrect(720,1565,98)` 좌표를 조정한다.
- 후보: adrianhajdin/iphone 저장소의 `public/models/scene.glb`(866KB, 라이선스 표기 없음, 튜토리얼용), Poly Pizza의 스마트폰 모델(CC0·CC-BY, 로우폴리), Sketchfab 무료 모델(로그인 다운로드, 모델별 라이선스 확인).
