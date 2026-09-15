# UpNext 모션 데모 16:9 (레퍼런스 2 문법, 2026-09-14)

1920×1080, 30fps, 16초. 하드 컷을 8비트 BGM(강철 산봉우리, 169 BPM 측정, 첫 다운비트 0.917초)의 박자에 맞췄다. 비디오의 박자 그리드는 0.60초 + n×0.355초이고, 음악은 0.317초 앞당겨 첫 다운비트가 0.60초에 오게 했다.

| 시간 | 샷 | 배경 | 내용 |
|---|---|---|---|
| 0.00~0.96 | 인트로 | 검정 | "Introducing" 라임 스윕 |
| 0.96~1.67 | 로고 | 다크 | 아이콘 스쿼시 + UpNext |
| 1.67~2.38 | 포즈 컷 | 퍼플 | 덱 홀드 화면, 폰 -12° |
| 2.38~3.09 | 돌출 | 다크 | 6장 펼침 + 카드 프리뷰가 폰 밖으로 |
| 3.09~3.80 | 돌출 | 퍼플 | 보드 + "Tap to complete" 카드 돌출 |
| 3.80~5.22 | 헤드라인 A | 다크→라임→시안→다크 | "Draw Today / Your ✳ Challenge", 폰 화면 박자마다 교체 |
| 5.22~5.93 | 연타 | 퍼플·다크·라임·다크 | 완료 배너, 카메라, 꾸미기, 앨범 (반 박자) |
| 5.93~6.64 | 돌출 | 다크 | 카메라 폰 + 폴라로이드 돌출, 캡션 "Snap the proof" |
| 6.64~7.35 | 팝 | 퍼플 | 앨범 폰 + 저장본 폴라로이드 팝 |
| 7.35~8.77 | 헤드라인 B | 다크→라임 | "Keep the Flame", 불꽃 카드 12→13 팝 |
| 8.77~10.19 | 헤드라인 C | 퍼플→시안→다크 | "Grow your Hero", 룬 상자 모달 돌출, 전투 |
| 10.19~11.61 | 연타 | 8색 교대 | 메인 카피 재등장, 위젯·알림·기운·앨범 반 박자 컷 |
| 11.61~16.0 | 엔드 카드 | 다크 | 아이콘 + UpNext + Challenge Card Habits |

렌더
```bash
cd motion-stage-16x9 && npm init -y && npm i playwright && npx playwright install chromium
DUR=16 SUB=3 OUT=final_nomusic.mp4 node render2.js
ffmpeg -i final_nomusic.mp4 -ss 0.317 -i assets/bgm-fitness.m4a -filter_complex "[1:a]atrim=0:16,afade=t=in:d=0.15,afade=t=out:st=14.0:d=2.0,volume=0.85[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest upnext_demo_16x9.mp4
```
소재: `assets/screens/`는 시뮬레이터 캡처(3x 정지 이미지와 클립 프레임), `assets/parts/`는 돌출용 부품. 폰 프레임은 CSS 베젤이라 실제 기기 사진이 아니다(목업 표기 필요).
