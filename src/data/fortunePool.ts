/**
 * 오늘의 기운 — 카테고리별 색·문구 풀.
 *
 * 하루 1회, 유저 컬렉션에서 뽑은 카드 1장에 맞춰 "오늘의 색 / 오늘의 문구 /
 * 오늘의 명언" 세 가지를 보여준다. 명언은 기존 QUOTE_POOL 을 그대로 재사용하므로
 * 이 파일은 색과 문구만 담는다.
 *
 * 4언어 인라인 구조는 QUOTE_POOL(src/data/quotePool.ts) 관례를 그대로 따른다.
 * i18n 딕셔너리 키로 빼지 않는 이유: 8 카테고리 × (색 3 + 문구 4) × 4언어 = 224
 * 문자열이라 딕셔너리에 넣으면 키 관리 비용이 콘텐츠 가치보다 커진다.
 *
 * 색 선정 기준 — 브랜드가 아날로그/필름 레퍼런스이므로 이름은 색상환 용어가 아니라
 * 필름·인화·시간대의 언어로 짓는다. 모든 hex 는 #141414(bg-surface) 위에서
 * 스와치로 읽히는 명도만 사용한다(순수 원색·초저명도 금지).
 * accent-secondary(#FF4632)는 에러 전용 토큰이라 여기서 쓰지 않는다.
 */

import type { Category } from "@/types/card";

/** 4언어 문자열 묶음 — QUOTE_POOL 의 Quote 와 동일 형태 */
export interface L10nText {
  ko: string;
  en: string;
  ja: string;
  zh: string;
}

export interface FortuneColor {
  /** 스와치로 칠할 색 */
  hex: string;
  /** 색 이름 (필름/시간대 언어) */
  name: L10nText;
}

/** 카테고리별 오늘의 색 — 각 3종 */
export const FORTUNE_COLORS: Record<Category, FortuneColor[]> = {
  fitness: [
    { hex: "#FF7A3D", name: { ko: "노을 태우는 주황", en: "Burning Sunset Orange", ja: "夕焼けを焦がすオレンジ", zh: "燃烧晚霞的橙" } },
    { hex: "#FFB03A", name: { ko: "정오의 호박빛", en: "Midday Amber", ja: "真昼の琥珀", zh: "正午的琥珀" } },
    { hex: "#E8674A", name: { ko: "달아오른 구리", en: "Heated Copper", ja: "熱を帯びた銅", zh: "灼热的铜" } },
  ],
  nutrition: [
    { hex: "#C7E86B", name: { ko: "새순 연두", en: "First Sprout Green", ja: "新芽の若草", zh: "新芽嫩绿" } },
    { hex: "#F2C14E", name: { ko: "버터 옐로", en: "Butter Yellow", ja: "バターイエロー", zh: "黄油黄" } },
    { hex: "#E0995A", name: { ko: "구운 살구", en: "Roasted Apricot", ja: "焼き杏", zh: "烤杏色" } },
  ],
  mindfulness: [
    { hex: "#9BF0E1", name: { ko: "새벽 물빛", en: "Dawn Water", ja: "夜明けの水色", zh: "黎明水色" } },
    { hex: "#8FB8DB", name: { ko: "안개 낀 하늘", en: "Misted Sky", ja: "霧のかかった空", zh: "薄雾天空" } },
    { hex: "#B8A9D9", name: { ko: "저녁 라벤더", en: "Evening Lavender", ja: "夕暮れのラベンダー", zh: "黄昏薰衣草" } },
  ],
  learning: [
    { hex: "#7E9BE8", name: { ko: "잉크 블루", en: "Ink Blue", ja: "インクブルー", zh: "墨水蓝" } },
    { hex: "#9E8CE8", name: { ko: "밑줄 보라", en: "Underline Violet", ja: "傍線のすみれ", zh: "下划线紫" } },
    { hex: "#6FB5D6", name: { ko: "도서관 창가", en: "Library Window", ja: "図書館の窓辺", zh: "图书馆窗边" } },
  ],
  social: [
    { hex: "#F58BA8", name: { ko: "홍조 핑크", en: "Blushed Pink", ja: "頬染めピンク", zh: "微红粉" } },
    { hex: "#FF9E7A", name: { ko: "따뜻한 코랄", en: "Warm Coral", ja: "あたたかいコーラル", zh: "温暖珊瑚" } },
    { hex: "#E86BA0", name: { ko: "필름 로즈", en: "Film Rose", ja: "フィルムローズ", zh: "胶片玫瑰" } },
  ],
  productivity: [
    { hex: "#CDF564", name: { ko: "형광 라임", en: "Fluorescent Lime", ja: "蛍光ライム", zh: "荧光青柠" } },
    { hex: "#7FD1B9", name: { ko: "정리된 민트", en: "Tidied Mint", ja: "片づいたミント", zh: "整理过的薄荷" } },
    { hex: "#D8D8D2", name: { ko: "빈 책상 화이트", en: "Empty Desk White", ja: "空っぽの机の白", zh: "空桌白" } },
  ],
  wellness: [
    { hex: "#B7D9C4", name: { ko: "이불 속 연두", en: "Under-Blanket Green", ja: "布団の中の若草", zh: "被窝里的浅绿" } },
    { hex: "#D9C7B8", name: { ko: "따뜻한 모래", en: "Warm Sand", ja: "あたたかい砂", zh: "温暖沙色" } },
    { hex: "#C9A9C4", name: { ko: "낮잠 분홍", en: "Afternoon Nap Pink", ja: "昼寝のピンク", zh: "午睡粉" } },
  ],
  trending: [
    { hex: "#F037A5", name: { ko: "Y2K 마젠타", en: "Y2K Magenta", ja: "Y2Kマゼンタ", zh: "Y2K洋红" } },
    { hex: "#8A7BFF", name: { ko: "울트라 바이올렛", en: "Ultra Violet", ja: "ウルトラバイオレット", zh: "极致紫" } },
    { hex: "#FF8ED4", name: { ko: "버블검 핑크", en: "Bubblegum Pink", ja: "バブルガムピンク", zh: "泡泡糖粉" } },
  ],
};

/**
 * 카테고리별 오늘의 문구 — 각 4종.
 * 포춘쿠키 톤: 명령이 아니라 관찰. "해라" 가 아니라 "오늘은 이렇더라".
 * 갓생앱 원칙상 운세처럼 결과를 단정하지 않는다 — 하루를 해석할 렌즈만 준다.
 */
export const FORTUNE_PHRASES: Record<Category, L10nText[]> = {
  fitness: [
    { ko: "몸이 먼저 움직이면 마음은 따라옵니다", en: "Move the body first; the mind follows", ja: "体が先に動けば心はついてくる", zh: "身体先动，心自然跟上" },
    { ko: "오늘의 숨이 조금 깊어질 겁니다", en: "Your breath runs a little deeper today", ja: "今日は呼吸が少し深くなる", zh: "今天的呼吸会深一些" },
    { ko: "가볍게 시작한 것이 가장 멀리 갑니다", en: "What starts light travels farthest", ja: "軽く始めたものが一番遠くまで行く", zh: "轻松开始的，走得最远" },
    { ko: "지친 곳이 아니라 쓰지 않은 곳이 아픕니다", en: "It aches where unused, not where tired", ja: "疲れた所ではなく使っていない所が痛む", zh: "疼的不是累的地方，是没用过的地方" },
  ],
  nutrition: [
    { ko: "오늘 고른 한 끼가 내일의 기분을 정합니다", en: "Today's one meal sets tomorrow's mood", ja: "今日選んだ一食が明日の気分を決める", zh: "今天选的一餐决定明天的心情" },
    { ko: "천천히 먹은 것만 몸에 남습니다", en: "Only what's eaten slowly stays", ja: "ゆっくり食べたものだけが体に残る", zh: "只有慢慢吃的才留得住" },
    { ko: "물 한 잔이 오늘의 첫 번째 정답입니다", en: "A glass of water is today's first right answer", ja: "水一杯が今日の最初の正解", zh: "一杯水是今天第一个正确答案" },
    { ko: "색이 많은 접시가 좋은 하루를 만듭니다", en: "A colorful plate makes a good day", ja: "色の多い皿が良い一日をつくる", zh: "色彩丰富的餐盘造就好日子" },
  ],
  mindfulness: [
    { ko: "멈춘 자리에서 가장 멀리 보입니다", en: "You see farthest from where you stop", ja: "立ち止まった場所から一番遠くが見える", zh: "停下的地方看得最远" },
    { ko: "오늘은 서두르지 않아도 늦지 않습니다", en: "Today you won't be late, even unhurried", ja: "今日は急がなくても遅れない", zh: "今天不赶也不会迟" },
    { ko: "숨을 세는 동안은 아무것도 잃지 않습니다", en: "Nothing is lost while you count your breath", ja: "呼吸を数える間は何も失わない", zh: "数呼吸的时候，什么也不会失去" },
    { ko: "조용한 순간이 오늘의 가장 큰 사건입니다", en: "The quiet moment is today's biggest event", ja: "静かな瞬間が今日一番の出来事", zh: "安静的片刻是今天最大的事" },
  ],
  learning: [
    { ko: "한 페이지가 어제와 다른 사람을 만듭니다", en: "One page makes you different from yesterday", ja: "一ページが昨日と違う自分をつくる", zh: "一页书造就与昨天不同的你" },
    { ko: "모르는 것을 적어두면 반은 배운 겁니다", en: "Write down what you don't know — that's half of learning", ja: "分からないことを書けば半分は学んだこと", zh: "写下不懂的，就学会了一半" },
    { ko: "오늘 붙잡은 문장이 오래 남습니다", en: "The sentence you catch today stays long", ja: "今日つかまえた一文は長く残る", zh: "今天抓住的句子会留得很久" },
    { ko: "이해는 늦게 오지만 반드시 옵니다", en: "Understanding comes late, but it comes", ja: "理解は遅れて来るが必ず来る", zh: "理解来得晚，但一定会来" },
  ],
  social: [
    { ko: "먼저 건넨 한마디가 오늘을 바꿉니다", en: "The first word you offer changes today", ja: "先にかけた一言が今日を変える", zh: "先说出的那句话会改变今天" },
    { ko: "안부를 묻는 쪽이 더 많이 받습니다", en: "The one who asks receives more", ja: "安否を尋ねる側がより多く受け取る", zh: "先问候的人收获更多" },
    { ko: "오늘은 듣는 일이 말하는 일보다 큽니다", en: "Today, listening outweighs speaking", ja: "今日は聞くことが話すことより大きい", zh: "今天，听比说更重要" },
    { ko: "잊고 있던 이름이 떠오르면 좋은 신호입니다", en: "A forgotten name resurfacing is a good sign", ja: "忘れていた名前が浮かべば良い兆し", zh: "想起遗忘的名字是好兆头" },
  ],
  productivity: [
    { ko: "가장 작은 일부터 치우면 길이 열립니다", en: "Clear the smallest thing and the path opens", ja: "一番小さいことから片づけると道が開く", zh: "先清掉最小的事，路就开了" },
    { ko: "오늘은 시작이 완성보다 중요합니다", en: "Today, starting matters more than finishing", ja: "今日は始めることが仕上げより大事", zh: "今天，开始比完成更重要" },
    { ko: "정리된 책상만큼 머리도 정리됩니다", en: "A tidy desk tidies the mind", ja: "片づいた机の分だけ頭も片づく", zh: "桌子整理多少，脑子就整理多少" },
    { ko: "미룬 일 하나가 오늘의 무게 전부입니다", en: "One postponed task is today's entire weight", ja: "先延ばした一つが今日の重さのすべて", zh: "拖延的那一件就是今天全部的重量" },
  ],
  wellness: [
    { ko: "쉬는 것도 오늘 해야 할 일입니다", en: "Resting is also today's task", ja: "休むことも今日やるべきこと", zh: "休息也是今天该做的事" },
    { ko: "일찍 눕는 것이 가장 빠른 회복입니다", en: "Lying down early is the fastest recovery", ja: "早く横になるのが一番早い回復", zh: "早点躺下是最快的恢复" },
    { ko: "몸이 보내는 신호는 늦게 오지 않습니다", en: "The body's signals are never late", ja: "体が送る信号は遅れて来ない", zh: "身体发出的信号从不迟到" },
    { ko: "아무것도 안 한 시간이 내일을 만듭니다", en: "The hour spent doing nothing builds tomorrow", ja: "何もしなかった時間が明日をつくる", zh: "什么都没做的时间造就明天" },
  ],
  trending: [
    { ko: "남들이 하니까 말고, 궁금하니까 해봅니다", en: "Not because others do it — because you're curious", ja: "みんながやるからではなく、気になるからやる", zh: "不是因为别人做，是因为你好奇" },
    { ko: "새로 해본 것만 이야깃거리가 됩니다", en: "Only the new thing becomes a story", ja: "新しく試したことだけが話の種になる", zh: "只有新尝试才会变成谈资" },
    { ko: "오늘의 유행은 내일의 기록입니다", en: "Today's trend is tomorrow's record", ja: "今日の流行は明日の記録", zh: "今天的流行是明天的记录" },
    { ko: "어색한 첫 시도가 가장 선명하게 남습니다", en: "The awkward first try stays sharpest", ja: "ぎこちない最初の一回が一番鮮明に残る", zh: "笨拙的第一次留下最清晰的印象" },
  ],
};
