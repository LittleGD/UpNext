import type { Language } from "@/types/game";

// 패치 노트 한 항목 — 4개 언어 동일 구조 유지
export interface PatchNoteEntry {
  icon?: string;      // pixelarticons 이름 (선택)
  title: string;
  description: string;
}

export interface PatchNote {
  version: string;              // "2026.04.14" — lastSeenPatchVersion 비교 키
  date: string;                 // 배포일 "2026-04-14"
  headline: Record<Language, string>;     // 상단 하이라이트 한 줄
  entries: Record<Language, PatchNoteEntry[]>;  // 변경 항목들
}

// 최신 순으로 맨 앞에 쌓기 — LATEST_PATCH는 항상 PATCH_NOTES[0]
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "2026.04.26",
    date: "2026-04-26",
    headline: {
      ko: "카드팩 등급 + 컬렉션 보상 + 사진 챌린지 — 매 레벨업이 더 짜릿해집니다",
      en: "Pack tiers, collection rewards, photo challenges — every level-up gets sharper",
      ja: "パック等級＋コンプ報酬＋写真チャレンジ — レベルアップがもっと刺激的に",
      zh: "卡包等级 + 图鉴奖励 + 摄影挑战 — 每次升级都更有冲击力",
    },
    entries: {
      ko: [
        {
          icon: "Gift",
          title: "레벨업 카드팩 — 등급 시스템",
          description: "레벨업할 때마다 일반/레어/유니크/레전드 등급이 굴려집니다 (50/30/15/5%). 등급에 따라 2~5 장의 카드를 받고, 등급이 올라갈수록 오픈 연출이 화려해져요. 레전드 팩은 풀스크린 플래시와 확장 링까지 등장합니다.",
        },
        {
          icon: "Trophy",
          title: "도감 완성 — 컬렉션 100% 보상",
          description: "모든 카드를 모으면 '도감 완성자' 칭호와 1회성 큰 보너스(+500 XP, +2000 영웅 코인) 를 받아요. 이후 레벨업/보너스 카드 이벤트는 등급별 환산 보상으로 자동 전환됩니다. 새 카드가 추가되면 다시 모을 수 있어요.",
        },
        {
          icon: "Camera",
          title: "사진 발견 챌린지 8장",
          description: "야생화 한 송이, 황금시간 풍경, 오늘의 하늘, 그림자 한 컷, 길 위의 작은 발견, 음식 톱뷰, 오늘의 컬러 헌트, 정돈된 책상 — 일상을 사진으로 기록하는 챌린지가 추가되었습니다.",
        },
        {
          icon: "Clock",
          title: "카드매치 — 카운트다운 + 이름 표시",
          description: "카드매치 미니게임이 시작 전 3-2-1-시작 카운트다운으로 시작합니다. 카드 뒷면에 짧은 이름(다이아/별/하트 등) 이 함께 표시되어 매칭이 한눈에 보여요.",
        },
        {
          icon: "Sword",
          title: "영웅 보상 화면 스크롤 수정",
          description: "탐험에서 7개 이상의 장비를 획득해도 보상 화면이 정상 스크롤되고 확인 버튼이 항상 보입니다.",
        },
        {
          icon: "Lock",
          title: "백업 안전성 강화 — 데이터 손실 방어",
          description: "로그인 직후 일부 사용자에게 진행도가 0일차로 보이던 race condition 을 차단했어요. 미로그인 사용자에게 백업 안내 배너를 추가했고, 설정 화면에 마지막 백업 시각이 '몇 분 전' 형태로 표시됩니다.",
        },
      ],
      en: [
        {
          icon: "Gift",
          title: "Level-up packs — tier system",
          description: "Every level-up rolls a tier (Normal/Rare/Unique/Legend at 50/30/15/5%) that decides how many cards (2–5) and how flashy the opening gets. Legend packs come with a full-screen flash and expanding rings.",
        },
        {
          icon: "Trophy",
          title: "Collection complete — 100% reward",
          description: "Collect every card to earn the 'Card Collector' title plus a one-time bonus (+500 XP, +2000 Hero Coins). After that, level-up and bonus-card events auto-convert into tiered rewards. New cards in updates put the goal back in reach.",
        },
        {
          icon: "Camera",
          title: "8 photo discovery challenges",
          description: "Wildflower, golden hour, today's sky, shadow play, tiny find on the road, top-down plate, color hunt, tidy desk — challenges that turn everyday moments into photos.",
        },
        {
          icon: "Clock",
          title: "Pair match — countdown & card names",
          description: "The pair-match minigame now starts with a 3-2-1-GO countdown. Each card shows a short name (Diamond, Star, Heart…) so matches read at a glance.",
        },
        {
          icon: "Sword",
          title: "Hero reward screen scroll fix",
          description: "Reward screens with 7+ items now scroll cleanly and the confirm button stays visible at the bottom.",
        },
        {
          icon: "Lock",
          title: "Cloud backup safety hardening",
          description: "Fixed a race condition where some users saw their progress drop to 'day 0' right after signing in. Signed-out users now see a gentle reminder banner, and Settings shows when the last backup happened (e.g. \"3 minutes ago\").",
        },
      ],
      ja: [
        {
          icon: "Gift",
          title: "レベルアップパック — 等級システム",
          description: "レベルアップごとにノーマル/レア/ユニーク/レジェンド (50/30/15/5%) を抽選。等級により2~5枚のカードを獲得し、上位等級ほどオープン演出が華やかに。レジェンドはフルスクリーンフラッシュ＋拡張リングまで出現します。",
        },
        {
          icon: "Trophy",
          title: "図鑑コンプリート — 100%報酬",
          description: "すべてのカードを集めると「カード収集家」称号と1回限りのボーナス(+500 XP、+2000 勇者コイン)を獲得。以降のレベルアップ/ボーナスカードイベントは等級別報酬に自動変換されます。新カード追加で再挑戦も可能。",
        },
        {
          icon: "Camera",
          title: "写真発見チャレンジ8枚",
          description: "野花、ゴールデンアワー、今日の空、影遊び、道での小さな発見、料理を真上から、カラーハント、整った机 — 日常を写真で記録するチャレンジが追加されました。",
        },
        {
          icon: "Clock",
          title: "ペアマッチ — カウントダウン＋名前表示",
          description: "ペアマッチミニゲームが3-2-1-スタートのカウントダウンで開始。カード裏面に短い名前(ダイヤ/星/ハートなど)も表示され、マッチが一目で分かります。",
        },
        {
          icon: "Sword",
          title: "勇者報酬画面のスクロール修正",
          description: "探検で7個以上の装備を獲得しても報酬画面が正常にスクロールし、確認ボタンが常に表示されます。",
        },
        {
          icon: "Lock",
          title: "クラウドバックアップ安全性の強化",
          description: "ログイン直後に進行度が「0日目」と表示される競合状態を修正。未ログインユーザーにはバックアップ案内バナーを表示し、設定画面に最終バックアップ時刻が「数分前」形式で表示されます。",
        },
      ],
      zh: [
        {
          icon: "Gift",
          title: "升级卡包 — 等级系统",
          description: "每次升级都会抽取等级 (普通/稀有/独特/传说 50/30/15/5%)，根据等级获得2~5张卡牌，等级越高开包演出越华丽。传说包带有全屏闪光和扩散光环。",
        },
        {
          icon: "Trophy",
          title: "图鉴全收集 — 100%奖励",
          description: "集齐所有卡牌可获得「卡牌收藏家」称号和一次性大奖励 (+500 XP，+2000 英雄币)。之后的升级/奖励卡事件会自动转换为按等级折算的奖励。新卡更新后可再次挑战。",
        },
        {
          icon: "Camera",
          title: "8张摄影发现挑战",
          description: "一朵野花、黄金时刻风景、今天的天空、光影一刻、路上的小发现、美食俯拍、今日色彩猎手、整洁书桌 — 用照片记录日常的挑战已加入。",
        },
        {
          icon: "Clock",
          title: "配对游戏 — 倒计时＋卡牌名称",
          description: "配对小游戏现在以 3-2-1-开始 倒计时启动。卡牌背面会显示简短名称 (钻石/星/心等)，匹配一目了然。",
        },
        {
          icon: "Sword",
          title: "勇者奖励界面滚动修复",
          description: "探险获得7个以上装备时奖励界面也能正常滚动，确认按钮始终可见。",
        },
        {
          icon: "Lock",
          title: "云端备份安全性增强",
          description: "修复了登录后部分用户进度显示为「第0天」的竞态问题。未登录用户会显示备份提示横幅，设置页面会以「几分钟前」的形式显示最后一次备份时间。",
        },
      ],
    },
  },
  {
    version: "2026.04.18",
    date: "2026-04-18",
    headline: {
      ko: "폴라로이드 사진과 갓생 영웅 — 매일이 모험이 됩니다",
      en: "Polaroid photos & Up Hero — every day becomes an adventure",
      ja: "ポラロイド写真と神生活の勇者 — 毎日が冒険に",
      zh: "宝丽来照片与崛起勇者 — 让每一天都成为冒险",
    },
    entries: {
      ko: [
        {
          icon: "Camera",
          title: "챌린지 인증 사진 — 폴라로이드 카메라",
          description: "챌린지를 완료할 때 그 순간을 사진으로 남겨보세요. 서명을 그리고, 스티커를 붙이고, 메모를 적을 수 있어요. 촬영 순간의 플래시 / 노출까지 실제로 반영됩니다.",
        },
        {
          icon: "Image",
          title: "앨범 — 기울이는 폴라로이드",
          description: "컬렉션의 앨범 탭에서 촬영한 사진을 모아볼 수 있어요. 기기를 기울이면 폴라로이드도 함께 기울어지고, 뒤집어 메모를 확인하거나 친구에게 공유할 수 있습니다.",
        },
        {
          icon: "Heart",
          title: "사진 부적 — 추억을 장비로",
          description: "찍은 사진을 '바인딩 의식' 으로 부적 장비로 만들어보세요. 영웅 탐험에서 능력치 보너스를 주고, +10 까지 강화할 수 있습니다.",
        },
        {
          icon: "Sword",
          title: "갓생 영웅 — 8 던전 로그라이크",
          description: "챌린지를 완료하면 탐험권을 얻어 8 개 테마 던전에 입장할 수 있어요. F30 보스까지 자동 전투 + 이벤트 선택 + 미니게임으로 진행됩니다. 운동 / 학습 / 명상 / 식단 / 소통 / 생산성 / 건강 / 트렌딩 — 각 세계관이 따로 준비되어 있어요.",
        },
        {
          icon: "Moon",
          title: "Lv30 클래스 각성 — 8 클래스",
          description: "레벨 30 에서 가장 많이 완료한 카테고리에 따라 영웅이 전사 / 마법사 / 수도승 / 드루이드 / 음유시인 / 시간술사 / 사제 / 환영술사 로 분화됩니다. 각 클래스는 고유 자원 (분노 / 마나 / 기 …) 과 패시브를 가집니다.",
        },
        {
          icon: "Flame",
          title: "스킬트리 — 32 스킬 수동 해금",
          description: "레벨업마다 스킬 포인트를 얻어 T1~T4 스킬을 해금할 수 있어요. 자동 발동 / 수동 발동 전환 가능. 클래스마다 4 스킬 = 총 32 스킬.",
        },
        {
          icon: "WarningDiamond",
          title: "주간 악몽 — affix 도전",
          description: "매주 월요일 KST 09:00 에 11 affix 중 하나가 선택됩니다. 유리 대포 / 시간의 압박 / 긴 행군 등 — 한 주간 전세계 유저가 같은 변이에 도전하고 리더보드에 기록합니다.",
        },
        {
          icon: "BookOpen",
          title: "도감 — 몬스터 & 장비 수집",
          description: "만난 몬스터와 주운 장비가 도감에 자동 기록됩니다. 각 몬스터의 lore 와 던전 출처까지 확인 가능. 미발견 항목은 실루엣으로 표시돼 스포일러를 피합니다.",
        },
        {
          icon: "Sparkle",
          title: "장비 강화 — pity streak 포함",
          description: "드롭한 장비를 +10 까지 강화할 수 있어요. 실패가 누적되면 보너스 확률이 가산되는 pity 시스템으로 legend / unique 강화도 체계적으로 도전 가능.",
        },
      ],
      en: [
        {
          icon: "Camera",
          title: "Polaroid capture — verify with a photo",
          description: "Capture the moment when you finish a challenge. Sign it, add stickers, leave a memo. Flash and exposure are actually applied to the saved shot.",
        },
        {
          icon: "Image",
          title: "Album — tilt-responsive polaroids",
          description: "Browse your captures in the Album tab. Tilt the device and each polaroid tilts with you. Flip to check the memo or share with friends.",
        },
        {
          icon: "Heart",
          title: "Photo talisman — bind memories as gear",
          description: "Run a binding ritual to turn a photo into a talisman. Grants stat bonuses during hero expeditions and can be enhanced up to +10.",
        },
        {
          icon: "Sword",
          title: "Up Hero — 8-dungeon roguelike",
          description: "Completing challenges earns expedition passes that unlock 8 themed dungeons. Auto-combat, event choices, and minigames take you from F1 to the F30 boss. Fitness / Learning / Mindfulness / Nutrition / Social / Productivity / Wellness / Trending — each with its own world.",
        },
        {
          icon: "Moon",
          title: "Class awakening at Lv30 — 8 classes",
          description: "At level 30, your hero awakens as Warrior / Mage / Monk / Druid / Bard / Chronomancer / Priest / Illusionist based on your most-completed category. Each class has a unique resource (Rage / Mana / Chi…) and passive.",
        },
        {
          icon: "Flame",
          title: "Skill tree — 32 skills, manual unlock",
          description: "Earn a skill point every level and unlock tier 1-4 skills. Toggle between auto-cast and manual. 4 skills per class × 8 classes = 32 total.",
        },
        {
          icon: "WarningDiamond",
          title: "Weekly nightmare — affix challenge",
          description: "Every Monday at 09:00 KST, one of 11 affixes is selected. Glass Cannon / Time Pressure / Long March… — the whole world tackles the same variant for a week and posts to the leaderboard.",
        },
        {
          icon: "BookOpen",
          title: "Codex — collect monsters & gear",
          description: "Every monster you meet and every drop you pick up is logged. Check each monster's lore and home dungeon. Unseen entries stay in silhouette to avoid spoilers.",
        },
        {
          icon: "Sparkle",
          title: "Enhancement — with pity streaks",
          description: "Enhance dropped gear up to +10. Streaks of failures pile on a bonus via the pity system, so legend / unique enhancement stays approachable.",
        },
      ],
      ja: [
        {
          icon: "Camera",
          title: "チャレンジ認証写真 — ポラロイドカメラ",
          description: "チャレンジを完了したその瞬間を写真に残そう。サインを描いて、ステッカーを貼って、メモも添えられる。撮影時のフラッシュ / 露出も実際に反映されます。",
        },
        {
          icon: "Image",
          title: "アルバム — 傾くポラロイド",
          description: "コレクションのアルバムタブで撮影写真をまとめて見られます。端末を傾けるとポラロイドも一緒に傾き、裏返してメモを確認したり、友人にシェアできます。",
        },
        {
          icon: "Heart",
          title: "写真のお守り — 思い出を装備に",
          description: "撮った写真を「バインディング儀式」でお守り装備に変えよう。勇者の探索でステータスボーナスを与え、+10 まで強化可能。",
        },
        {
          icon: "Sword",
          title: "神生活の勇者 — 8 ダンジョン ローグライク",
          description: "チャレンジを完了すると探検券を獲得し、8 つのテーマダンジョンに入場できます。F30 ボスまで自動戦闘 + イベント選択 + ミニゲームで進行。運動 / 学習 / 瞑想 / 食事 / 社交 / 生産性 / 健康 / トレンド — 各世界観が別々に用意されています。",
        },
        {
          icon: "Moon",
          title: "Lv30 クラス覚醒 — 8 クラス",
          description: "レベル 30 で最も完了したカテゴリに応じて、勇者が 戦士 / 魔法使い / 武僧 / ドルイド / 吟遊詩人 / 時術師 / 司祭 / 幻術師 に分化。各クラスは固有の資源 (怒り / マナ / 気 …) とパッシブを持ちます。",
        },
        {
          icon: "Flame",
          title: "スキルツリー — 32 スキル手動解放",
          description: "レベルアップごとにスキルポイントを獲得し、T1~T4 スキルを解放。自動発動 / 手動発動 切替可能。各クラス 4 スキル = 計 32 スキル。",
        },
        {
          icon: "WarningDiamond",
          title: "週間悪夢 — affix チャレンジ",
          description: "毎週月曜 KST 09:00 に 11 affix のうち 1 つが選ばれます。ガラスの大砲 / 時間の圧迫 / 長き行軍 など — 一週間世界中のプレイヤーが同じ変異に挑戦し、ランキングに記録。",
        },
        {
          icon: "BookOpen",
          title: "図鑑 — モンスター & 装備収集",
          description: "出会ったモンスターと拾った装備が図鑑に自動記録されます。各モンスターの lore と登場ダンジョンも確認可能。未発見項目はシルエットでネタバレ防止。",
        },
        {
          icon: "Sparkle",
          title: "装備強化 — pity streak 対応",
          description: "ドロップした装備を +10 まで強化できます。失敗が積み重なるとボーナス確率が加算される pity システムで、legend / unique の強化も計画的に挑戦可能。",
        },
      ],
      zh: [
        {
          icon: "Camera",
          title: "挑战认证照片 — 宝丽来相机",
          description: "完成挑战时把那一刻留成照片。签名、贴贴纸、写备忘。拍摄瞬间的闪光灯与曝光也真实反映到成片中。",
        },
        {
          icon: "Image",
          title: "相册 — 可倾斜的宝丽来",
          description: "在收藏的相册标签里集中浏览拍摄的照片。倾斜设备时宝丽来也会一起倾斜,翻过来查看备忘或分享给朋友。",
        },
        {
          icon: "Heart",
          title: "照片护符 — 把回忆变成装备",
          description: "通过「绑定仪式」把拍摄的照片变成护符装备。在勇者探险中提供属性加成,最高可强化至 +10。",
        },
        {
          icon: "Sword",
          title: "崛起勇者 — 8 地下城肉鸽",
          description: "完成挑战就能获得探险券,解锁 8 个主题地下城。自动战斗 + 事件选择 + 小游戏一路推到 F30 首领。运动 / 学习 / 冥想 / 饮食 / 社交 / 效率 / 健康 / 潮流 — 每个世界各有独特氛围。",
        },
        {
          icon: "Moon",
          title: "Lv30 职业觉醒 — 8 职业",
          description: "30 级时按你完成最多的类别觉醒为 战士 / 法师 / 武僧 / 德鲁伊 / 吟游诗人 / 时之法师 / 祭司 / 幻术师。每个职业都有专属资源 (愤怒 / 法力 / 气 …) 与被动。",
        },
        {
          icon: "Flame",
          title: "技能树 — 32 技能手动解锁",
          description: "每次升级获得技能点,解锁 T1~T4 技能。可切换自动 / 手动触发。每职业 4 技能 × 8 职业 = 共 32 技能。",
        },
        {
          icon: "WarningDiamond",
          title: "周噩梦 — affix 挑战",
          description: "每周一 KST 09:00 从 11 个 affix 中随机选择一个。玻璃大炮 / 时间压迫 / 漫长行军 等 — 一周内全球玩家挑战同一变异并上榜。",
        },
        {
          icon: "BookOpen",
          title: "图鉴 — 怪物与装备收集",
          description: "遇到的怪物和拾取的装备会自动记录到图鉴。可查看每只怪物的 lore 和所属地下城。未发现项目以剪影显示,避免剧透。",
        },
        {
          icon: "Sparkle",
          title: "装备强化 — 含 pity 机制",
          description: "掉落装备最高强化至 +10。连续失败会累积 pity 奖励概率,传说 / 独特强化也能按计划挑战。",
        },
      ],
    },
  },
  {
    version: "2026.04.16",
    date: "2026-04-16",
    headline: {
      ko: "카드 디테일 다듬기 + 앱 실행 연출 개선",
      en: "Card detail polish + smoother app launch",
      ja: "カードディテール改善 + アプリ起動演出の向上",
      zh: "卡片细节打磨 + 启动动画优化",
    },
    entries: {
      ko: [
        {
          icon: "Card",
          title: "카드 디테일 레이아웃 다듬기",
          description: "카드를 탭하면 제목→설명→명언이 자연스러운 순서로 나타나요. 기울임에 따라 각 영역이 살짝 다른 깊이로 떠오르는 깊이감도 추가. 컬렉션에서 한 장 열어보세요.",
        },
        {
          icon: "Trophy",
          title: "레벨업 연출 강화",
          description: "XP 바가 가득 찬 후 리셋되며 새 레벨로 다시 차오르는 JRPG식 연출. 레벨 숫자도 정수 단위로 천천히 롤링합니다. 다음 레벨업에서 확인해보세요.",
        },
        {
          icon: "Sparkle",
          title: "스플래시 화면 정중앙 정렬",
          description: "워드마크가 살짝 아래로 밀려 보이던 문제를 수정. 이제 앱 실행 시 화면 한가운데에 정확히 표시됩니다.",
        },
        {
          icon: "Zap",
          title: "스플래시 종료 트랜지션",
          description: "스플래시가 걷히는 동안 상단 레벨 바와 하단 내비게이션이 함께 슬라이드인. 스플래시 위로 겹쳐 보이던 잔상도 제거.",
        },
      ],
      en: [
        {
          icon: "Card",
          title: "Card detail layout refined",
          description: "Tap a card and the title, description, and quote now appear in a natural sequence. Each zone rises to a subtly different depth as you tilt. Open one from your collection to try it.",
        },
        {
          icon: "Trophy",
          title: "Richer level-up sequence",
          description: "A JRPG-style flourish — the XP bar fills to 100%, resets, and refills for the new level. The level number also rolls up one integer at a time. Catch it on your next level-up.",
        },
        {
          icon: "Sparkle",
          title: "Splash screen centered",
          description: "Fixed the wordmark sitting slightly below center. Now perfectly centered when you launch the app.",
        },
        {
          icon: "Zap",
          title: "Splash exit transition",
          description: "The top level bar and bottom nav now slide in as the splash fades out, and no longer peek through during the splash.",
        },
      ],
      ja: [
        {
          icon: "Card",
          title: "カードディテールのレイアウト調整",
          description: "カードをタップするとタイトル→説明→名言が自然な順序で登場。傾きに応じて各領域がわずかに異なる深さで浮かび上がる奥行き感も追加。コレクションから一枚開いてみてください。",
        },
        {
          icon: "Trophy",
          title: "レベルアップ演出の強化",
          description: "XPバーが満タンになってからリセットされ、新レベルで再び満ちていくJRPG風の演出。レベル数字も整数単位でゆっくりロールします。次のレベルアップで確認してみてください。",
        },
        {
          icon: "Sparkle",
          title: "スプラッシュ画面の中央配置",
          description: "ワードマークが少し下にずれて見えていた問題を修正。アプリ起動時に画面のど真ん中に表示されます。",
        },
        {
          icon: "Zap",
          title: "スプラッシュ終了演出",
          description: "スプラッシュがフェードアウトする間に上部レベルバーと下部ナビが一緒にスライドイン。スプラッシュ越しに覗いていた表示も解消。",
        },
      ],
      zh: [
        {
          icon: "Card",
          title: "卡片细节布局调整",
          description: "点击卡片时,标题→说明→名言按自然顺序依次出现。倾斜时各区域以略微不同的深度浮起,增添立体感。快从收藏里打开一张试试。",
        },
        {
          icon: "Trophy",
          title: "升级演出强化",
          description: "XP 条先填满再重置、以新等级再次填充的 JRPG 式演出。等级数字也以整数为单位慢慢滚动。下次升级时留意一下。",
        },
        {
          icon: "Sparkle",
          title: "启动画面居中",
          description: "修复了标志略微偏下的问题。现在启动应用时完美居中。",
        },
        {
          icon: "Zap",
          title: "启动结束过渡",
          description: "启动画面淡出的同时,顶部等级条与底部导航栏一起滑入。启动画面期间透出的残影也已消除。",
        },
      ],
    },
  },
  {
    version: "2026.04.15",
    date: "2026-04-15",
    headline: {
      ko: "글로벌 트렌드 챌린지 + 3D 카드 뷰어",
      en: "Global Trend Challenges + 3D Card Viewer",
      ja: "グローバルトレンドチャレンジ + 3Dカードビューアー",
      zh: "全球趋势挑战 + 3D卡片查看器",
    },
    entries: {
      ko: [
        {
          icon: "Globe",
          title: "트렌딩 카테고리 신설",
          description: "한국·일본·중국·미국 Z세대 갓생 트렌드에서 엄선한 32장의 챌린지 카드. 75:25 러닝, 하루 한 줄 일기, 도파민 디톡스 등.",
        },
        {
          icon: "Card",
          title: "3D 카드 디테일 뷰어",
          description: "컬렉션과 카드뽑기에서 카드를 탭하면 포켓몬카드처럼 3D로 감상. 드래그 회전, 자이로센서 연동, 홀로그래픽 효과, 카테고리별 명언까지.",
        },
        {
          icon: "Zap",
          title: "자이로센서 기본 활성화",
          description: "카드 뷰어의 자이로가 이제 디폴트로 켜집니다. 기기를 기울여 카드를 자연스럽게 조작하세요.",
        },
        {
          icon: "Check",
          title: "버그 수정 및 성능 개선",
          description: "레벨업 숫자 롤링 애니메이션 수정, 자이로 60fps 리렌더 제거, Safe-area 패딩 개선, 미사용 코드 정리.",
        },
      ],
      en: [
        {
          icon: "Globe",
          title: "Trending Category",
          description: "32 challenge cards curated from Gen-Z wellness trends in Korea, Japan, China & the US. 75:25 Running, One-Line Journaling, Dopamine Detox, and more.",
        },
        {
          icon: "Card",
          title: "3D Card Detail Viewer",
          description: "Tap a card in Collection or Card Draw to view it in 3D — drag to rotate, gyroscope tilt, holographic effects, and category-themed quotes.",
        },
        {
          icon: "Zap",
          title: "Gyroscope Enabled by Default",
          description: "The card viewer gyroscope is now on by default. Tilt your device to naturally interact with cards.",
        },
        {
          icon: "Check",
          title: "Bug Fixes & Performance",
          description: "Level-up number rolling animation fix, gyro 60fps re-render elimination, safe-area padding improvements, dead code cleanup.",
        },
      ],
      ja: [
        {
          icon: "Globe",
          title: "トレンディングカテゴリ新設",
          description: "韓国・日本・中国・米国のZ世代ウェルネストレンドから厳選した32枚のチャレンジカード。75:25ランニング、一行日記、ドーパミンデトックスなど。",
        },
        {
          icon: "Card",
          title: "3Dカードビューアー",
          description: "コレクションやカードドローでカードをタップするとポケカのように3D鑑賞。ドラッグ回転、ジャイロセンサー連動、ホログラフィック効果、カテゴリ別名言も表示。",
        },
        {
          icon: "Zap",
          title: "ジャイロセンサーのデフォルト有効化",
          description: "カードビューアーのジャイロがデフォルトでオンに。デバイスを傾けて自然にカードを操作しよう。",
        },
        {
          icon: "Check",
          title: "バグ修正とパフォーマンス改善",
          description: "レベルアップ数字ローリングアニメーション修正、ジャイロ60fps再レンダリング除去、セーフエリアパディング改善、未使用コード整理。",
        },
      ],
      zh: [
        {
          icon: "Globe",
          title: "新增趋势类别",
          description: "精选韩国·日本·中国·美国Z世代健康趋势的32张挑战卡。75:25跑步、一行日记、多巴胺排毒等。",
        },
        {
          icon: "Card",
          title: "3D卡片查看器",
          description: "在收藏和抽卡中点击卡片即可3D鉴赏——拖拽旋转、陀螺仪联动、全息效果,还有分类名言。",
        },
        {
          icon: "Zap",
          title: "陀螺仪默认启用",
          description: "卡片查看器的陀螺仪现已默认开启。倾斜设备即可自然操控卡片。",
        },
        {
          icon: "Check",
          title: "修复与性能优化",
          description: "升级数字滚动动画修复、陀螺仪60fps重渲染消除、安全区域内边距改进、无用代码清理。",
        },
      ],
    },
  },
  {
    version: "2026.04.14",
    date: "2026-04-14",
    headline: {
      ko: "새로운 챌린지 카드 28장 추가",
      en: "28 new challenge cards added",
      ja: "新しいチャレンジカードを28枚追加",
      zh: "新增28张挑战卡",
    },
    entries: {
      ko: [
        {
          icon: "Trophy",
          title: "카드매치 미니게임",
          description: "티켓을 소모해 3라운드 카드매치 런을 돌리고 보상 카드를 획득하세요.",
        },
        {
          icon: "Sparkle",
          title: "챌린지 카드 확장",
          description: "운동/식단/마음챙김/학습/소통/생산성/건강 7개 카테고리 × 4등급, 총 28장 추가.",
        },
        {
          icon: "Check",
          title: "클라우드 sync 안정화",
          description: "기기 간 진행도 충돌 처리 개선, 재시도 백오프로 네트워크 복구 후 자동 재동기화.",
        },
      ],
      en: [
        {
          icon: "Trophy",
          title: "Card Match Minigame",
          description: "Spend tickets to run a 3-round card match and earn reward cards.",
        },
        {
          icon: "Sparkle",
          title: "Challenge Card Expansion",
          description: "28 new cards across 7 categories × 4 rarities (Fitness, Nutrition, Mindfulness, Learning, Social, Productivity, Wellness).",
        },
        {
          icon: "Check",
          title: "Cloud Sync Hardening",
          description: "Better cross-device progress conflict handling and auto-retry with exponential backoff after network recovery.",
        },
      ],
      ja: [
        {
          icon: "Trophy",
          title: "カードマッチミニゲーム",
          description: "チケットを使って3ラウンドのカードマッチを回し、報酬カードを獲得しよう。",
        },
        {
          icon: "Sparkle",
          title: "チャレンジカード拡張",
          description: "運動・食事・マインドフルネス・学習・交流・生産性・ウェルネスの7カテゴリ×4レアリティ、計28枚を追加。",
        },
        {
          icon: "Check",
          title: "クラウド同期の安定化",
          description: "デバイス間の進行度コンフリクト処理を改善、指数バックオフでネットワーク復旧後に自動再同期。",
        },
      ],
      zh: [
        {
          icon: "Trophy",
          title: "卡片匹配小游戏",
          description: "使用门票进行3轮卡片匹配,获取奖励卡。",
        },
        {
          icon: "Sparkle",
          title: "挑战卡扩充",
          description: "运动/饮食/正念/学习/社交/生产力/健康 7个类别 × 4个稀有度,共新增28张卡。",
        },
        {
          icon: "Check",
          title: "云同步稳定化",
          description: "改进多设备进度冲突处理,网络恢复后以指数退避自动重试同步。",
        },
      ],
    },
  },
];

export const LATEST_PATCH: PatchNote = PATCH_NOTES[0];
