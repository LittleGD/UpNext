# UpNext 1.1.0 (빌드 19) 릴리스 노트

App Store Connect 의 "이번 버전의 새로운 기능"(whatsNew) 에 로케일별로 붙여넣는다.
용어는 인앱 카탈로그와 일치시켰다: 아지트 = Hideout / アジト / 据点, 던전 = Dungeon / ダンジョン / 地牢, 카드팩 = Card Pack / カードパック / 卡包, 오늘의 기운 = Today's Fortune / 今日の運気 / 今日运势.

---

## ko

오늘의 기운이 도착했어요.

• 하루에 한 번, 내 덱에서 오늘의 카드와 색, 문구를 뽑아요. 명언도 204개로 늘렸어요.
• 폴라로이드 사진 꾸미기를 크게 손봤어요. 꾸민 그대로 앨범에 저장돼요.
• 낙서와 스티커에 실행취소, 다시실행이 생겼어요.
• 사진 뒷면 메모가 줄에 맞춰 또박또박 써져요.
• 사진 공유가 바로 열려요.
• 카드매치를 하다가 화면을 쓸어내리면 티켓만 사라지던 문제를 고쳤어요.

---

## en

Today's Fortune has arrived.

• Once a day, draw today's card, color, and phrase from your own deck. The quote pool now holds 204 entries.
• Polaroid photo decorating got a big overhaul. What you decorate is exactly what lands in your album.
• Doodles and stickers now support undo and redo.
• Notes on the back of a photo now sit neatly on the ruled lines.
• Sharing a photo opens right away.
• Fixed a bug where swiping away from Card Match consumed your ticket without any reward.

---

## ja

今日の運気が届きました。

• 1日1回、自分のデッキから今日のカード・色・ひとことを引きます。名言も204個に増えました。
• ポラロイド写真のデコレーションを大きく改善しました。飾ったとおりにアルバムへ保存されます。
• 落書きとステッカーに、取り消しとやり直しが加わりました。
• 写真の裏のメモが罫線にきちんと沿って書けます。
• 写真の共有がすぐに開きます。
• カードマッチ中に画面を下にはらうとチケットだけ消えていた問題を修正しました。

---

## zh-Hans

今日运势来了。

• 每天一次，从自己的卡组中抽取今天的卡片、颜色和短句。名言库也扩充到 204 条。
• 大幅改进了拍立得照片装饰。装饰成什么样，相册里就是什么样。
• 涂鸦和贴纸现在支持撤销与重做。
• 照片背面的备忘现在能整齐地写在横线上。
• 照片分享可以立即打开。
• 修复了玩卡片配对时向下滑走会白白消耗门票的问题。

---

## 심사 노트 갱신 필요 여부

**리워드 광고가 이번 버전에서 처음 들어간다.** 아래 항목은 ASC 에서 사람이 확인해야 한다.

1. **App Privacy(데이터 수집) 신고 갱신** — Google Mobile Ads SDK 가 들어가면서 기기 식별자·사용 데이터 수집 항목이 달라질 수 있다. 현재 신고 내용이 1.0.1 기준이라면 갱신하지 않으면 심사에서 걸린다.
2. **광고 정책 확인** — 옵트인 리워드 광고만 사용(자동 재생·배너·전면 없음), maxAdContentRating=general 고정, ATT 미사용(NSUserTrackingUsageDescription 없음), 비동의 시 npa=1.
3. **심사 노트에 광고 동작 설명 추가** — 리워드 광고 3자리(리롤/코인주머니/오늘의 기운) 위치와 각각의 대체 경로. **단, 오늘의 기운은 현재 대체 경로가 없다**(아래 참조).
