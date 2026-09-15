# 케이스스터디 v2 촬영 산출물 (2026-09-14, 1차)

조건: iOS 시뮬레이터 iPhone 17 Pro, 빌드 1.3.0(32) Debug, 영어 UI, 상태 표시줄 9:41 고정. 원본 1206×2622 h264를 602×1310, 30fps로 줄이고 조작 사이의 정지 구간을 0.9초로 압축했다. 원본(정지 구간 포함)은 세션 스크래치패드에만 있으므로 필요하면 다시 녹화한다.

| 파일 | 장면 | 길이 | 표기해야 할 것 |
|---|---|---|---|
| clips/s1_showcase_sim_draft.mp4 | 1 쇼케이스 초안 | 24.9초 | 시뮬레이터 캡처, 사진은 갤러리 폴백(시뮬레이터 기본 사진). 실기기 본편으로 교체 예정 |
| clips/s7_rune_chest_after.mp4 | 7 룬 상자(후) | 19.8초 | 시드 `UITestSeedDungeon UITestSeedRuneChest`. 5~8초로 다듬을 것. 전 상태(굴림틀)는 웹 옛 커밋에서 별도 녹화 |
| clips/s6_reminder_after_first_completion.mp4 | 6 첫 완료 뒤 알림 | 11.1초 | 시스템 권한 알림, 저녁 8시 예약 확인까지 |
| clips/s6_widget_practice_after_second_completion.mp4 | 6 두 번째 완료 뒤 위젯 | 13.1초 | 연습 3단계, 실제 추가 안내, "먼저 추가하세요" 확인 상태까지 |
| clips/s5_fortune_reveal_with_test_ad.mp4 | 5 오늘의 기운 | 15.3초 | Google 테스트 광고 구간 포함. 편집에서 광고를 잘라내고 공개 연출만 남길 것 |
| clips/s8_decorate_save_album.mp4 | 8 꾸미기, 저장, 앨범 | 21.8초 | 갤러리 폴백. 낙서와 스티커 위치가 앨범 저장본과 같은지 보여주는 클립 |
| stills/s8_decorate_vs_album.png | 8 대표 정지 | | 왼쪽 꾸미기 화면, 오른쪽 앨범 저장본 |
| stills/s1_deck_home.png | 1 보조 | | 덱 홈 |
| sheets/*.png | 대표 프레임 고르기용 | | 클립을 1초 간격으로 늘어놓은 시트 |

남은 촬영: 장면 1 실기기 본편(카메라 포함), 장면 3 웹·iOS 나란히(웹 Playwright 녹화), 장면 7 전 상태(웹 커밋 1164bcd), 장면 8 전 상태 인화 화면(웹 30171e7 직전), 정적 자료(장면 2, 4, 9).

## 모션 데모 (9:16, 1080×1920, 16초, 음악 포함)

| 파일 | 상태 | 비고 |
|---|---|---|
| clips/upnext_motion_demo_9x16_v51_lowpoly.mp4 | 현재 | v5에 엔드카드 Download Now와 스토어 배지 추가, 워드마크 그림자 제거, 헤드라인 중앙 정렬 후 폰과 그룹핑. App Store, Google Play 모두 공식 배지. Play는 아직 공개 전이라 배지 아래 "Coming soon" |
| clips/upnext_motion_demo_9x16_v5_lowpoly.mp4 | 이전 | 로우폴리 3D 폰, 카메라 리그(오빗·돌리), 하드컷, 매치컷 5종, 워드마크 logo.svg. 레퍼런스 컷 분석과 샷 리스트는 `motion-stage-9x16-3d/README.md` |
| clips/upnext_motion_demo_9x16_v41_3d.mp4 | 이전 | RoundedBox 폰(코너 얼룩), 배경 30세그먼트 균등 배치, 카메라 고정 |
| clips/upnext_motion_demo_9x16_v4_3d.mp4, v3, 16x9_v1/v2, 11s | 이전 단계 | 스테이지 소스는 motion-stage*/ 폴더 |
