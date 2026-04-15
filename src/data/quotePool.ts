/**
 * 카테고리별 명언·유머 풀.
 * 카드 디테일 모달에서 챌린지에 어울리는 한 마디를 표시할 때 사용.
 * 8 카테고리 × 8개 × 4언어 = 256 문자열.
 */

import type { Category } from "@/types/card";
import type { ChallengeCard } from "@/types/card";
import type { Language } from "@/types/game";

interface Quote {
  ko: string;
  en: string;
  ja: string;
  zh: string;
}

export const QUOTE_POOL: Record<Category, Quote[]> = {
  // ── FITNESS ── 파워풀, 응원
  fitness: [
    { ko: "한 걸음이 천 리의 시작이에요", en: "A single step begins a thousand miles", ja: "千里の道も一歩から", zh: "千里之行始于足下" },
    { ko: "어제의 나보다 1%만 더", en: "Just 1% better than yesterday", ja: "昨日の自分より1%だけ上へ", zh: "只比昨天好1%就够了" },
    { ko: "몸이 기억하는 건 핑계가 아니라 반복이에요", en: "Your body remembers reps, not excuses", ja: "体が覚えるのは言い訳じゃなく反復", zh: "身体记住的不是借口，而是重复" },
    { ko: "오늘 흘린 땀은 내일의 자신감이에요", en: "Today's sweat is tomorrow's confidence", ja: "今日の汗は明日の自信", zh: "今天的汗水就是明天的自信" },
    { ko: "완벽한 컨디션은 없어요. 시작이 곧 컨디션.", en: "There's no perfect condition. Starting IS the condition.", ja: "完璧なコンディションなんてない。始めることがコンディション。", zh: "没有完美的状态，开始就是最好的状态" },
    { ko: "가만히 있으면 근육은 잊어요. 움직여야 기억해요.", en: "Muscles forget when idle. Move to remember.", ja: "じっとしてると筋肉は忘れる。動いて思い出そう。", zh: "不动就会忘记，运动才能记住" },
    { ko: "운동은 미래의 나에게 보내는 선물이에요", en: "Exercise is a gift to your future self", ja: "運動は未来の自分への贈り物", zh: "运动是送给未来自己的礼物" },
    { ko: "지금 이 순간, 몸은 당신 편이에요", en: "Right now, your body is on your side", ja: "今この瞬間、体はあなたの味方", zh: "此刻，身体站在你这一边" },
  ],

  // ── NUTRITION ── 따뜻, 감사
  nutrition: [
    { ko: "좋은 연료, 좋은 기분. 간단한 공식.", en: "Good fuel, good mood. Simple math.", ja: "良い燃料、良い気分。シンプルな方程式。", zh: "好燃料，好心情。简单公式。" },
    { ko: "한 입 한 입이 작은 투자예요", en: "Every bite is a small investment", ja: "一口一口が小さな投資", zh: "每一口都是小小的投资" },
    { ko: "오늘 먹은 것이 내일의 에너지예요", en: "What you ate today powers tomorrow", ja: "今日食べたものが明日のエネルギー", zh: "今天吃的就是明天的能量" },
    { ko: "물 한 잔의 가치를 아는 사람이 진짜 어른", en: "Knowing the worth of one glass of water — that's maturity", ja: "水一杯の価値を知る人こそ大人", zh: "懂得一杯水价值的人才是真大人" },
    { ko: "배고픔이 아니라 마음이 허할 때도 있어요", en: "Sometimes it's not hunger — it's the heart that's empty", ja: "お腹じゃなく心が空いてることもある", zh: "有时候不是饿，是心空了" },
    { ko: "감사하며 먹는 밥이 제일 맛있어요", en: "Food eaten with gratitude tastes the best", ja: "感謝して食べるごはんが一番おいしい", zh: "带着感恩吃的饭最香" },
    { ko: "몸에 좋은 건 혀도 곧 좋아하게 돼요", en: "Your tongue will learn to love what's good for you", ja: "体に良いものは舌もすぐ好きになる", zh: "对身体好的东西，舌头很快也会喜欢" },
    { ko: "식탁 위의 색이 다양할수록 하루도 풍요로워져요", en: "The more colors on your plate, the richer your day", ja: "食卓の色が多いほど1日も豊かになる", zh: "餐桌上颜色越多，一天越丰富" },
  ],

  // ── MINDFULNESS ── 고요, 철학적
  mindfulness: [
    { ko: "숨을 들이쉬며 가능성을, 내쉬며 걱정을 놓아요", en: "Breathe in possibility, breathe out doubt", ja: "吸う息で可能性を、吐く息で心配を手放す", zh: "吸入可能性，呼出忧虑" },
    { ko: "지금 이 순간만 존재해요. 충분해요.", en: "This moment is all there is. It's enough.", ja: "今この瞬間だけが存在する。それで十分。", zh: "此刻就是一切，已经足够" },
    { ko: "생각을 멈추지 않아도 돼요. 흘려보내면 돼요.", en: "You don't need to stop thinking. Just let thoughts flow.", ja: "考えを止めなくていい。流せばいい。", zh: "不必停止思考，让念头流过就好" },
    { ko: "고요함 속에서 가장 큰 소리가 들려요", en: "In stillness, you hear the loudest truths", ja: "静けさの中で最も大きな声が聞こえる", zh: "在安静中才能听到最大的声音" },
    { ko: "마음도 근육이에요. 쉬어야 강해져요.", en: "The mind is a muscle too. Rest makes it stronger.", ja: "心も筋肉。休めば強くなる。", zh: "心也是肌肉，休息才能更强" },
    { ko: "아무것도 안 해도 괜찮은 시간이 필요해요", en: "Sometimes you need time where nothing is required", ja: "何もしなくていい時間が必要なときもある", zh: "有时候你需要什么都不用做的时间" },
    { ko: "걱정은 내일의 에너지를 오늘 쓰는 거예요", en: "Worry spends tomorrow's energy today", ja: "心配は明日のエネルギーを今日使うこと", zh: "担忧是把明天的精力花在今天" },
    { ko: "3분의 고요가 하루를 바꿔요", en: "Three minutes of calm can shift your whole day", ja: "3分の静けさが1日を変える", zh: "3分钟的安静能改变一整天" },
  ],

  // ── LEARNING ── 호기심, 유쾌
  learning: [
    { ko: "뇌가 레벨업 했어요. 아직 모르고 있을 뿐.", en: "Your brain just leveled up. It doesn't know it yet.", ja: "脳がレベルアップした。まだ気づいてないだけ。", zh: "大脑刚升级了，只是自己还不知道" },
    { ko: "1페이지가 0페이지보다 무한히 나아요", en: "One page is infinitely better than zero pages", ja: "1ページは0ページより無限に良い", zh: "1页比0页好无限倍" },
    { ko: "모르는 게 있다는 건 성장할 공간이 있다는 뜻", en: "Not knowing something means there's room to grow", ja: "知らないことがあるのは成長の余地があるということ", zh: "不知道的东西意味着还有成长空间" },
    { ko: "어제 배운 것이 오늘의 무기가 돼요", en: "What you learned yesterday becomes today's weapon", ja: "昨日学んだことが今日の武器になる", zh: "昨天学的就是今天的武器" },
    { ko: "호기심을 따라가면 길이 보여요", en: "Follow your curiosity — it knows the way", ja: "好奇心についていけば道が見える", zh: "跟着好奇心走，路自然出现" },
    { ko: "실수도 학습 데이터예요", en: "Mistakes are training data", ja: "ミスも学習データ", zh: "错误也是训练数据" },
    { ko: "매일 조금씩. 복리의 마법을 믿으세요.", en: "A little each day. Trust the magic of compounding.", ja: "毎日少しずつ。複利の魔法を信じて。", zh: "每天一点点，相信复利的魔力" },
    { ko: "책 한 줄이 인생을 바꿀 수도 있어요", en: "A single line in a book can change your life", ja: "本の一行が人生を変えることもある", zh: "一本书里的一行字也许能改变人生" },
  ],

  // ── SOCIAL ── 온정, 관계
  social: [
    { ko: "세상 어딘가에 당신 같은 사람이 필요해요", en: "Someone out there needs exactly your kind of weird", ja: "世界のどこかにあなたみたいな人が必要", zh: "世界某处正需要像你这样的人" },
    { ko: "먼저 안부를 묻는 사람이 세상을 따뜻하게 해요", en: "The one who asks first warms the world", ja: "先に声をかける人が世界を温める", zh: "先问候的人温暖了世界" },
    { ko: "같이 웃으면 행복이 두 배가 돼요", en: "Laughter shared is happiness doubled", ja: "一緒に笑えば幸せは倍になる", zh: "一起笑，幸福加倍" },
    { ko: "관계는 Wi-Fi 같아요. 보이진 않지만 연결되어 있어요.", en: "Relationships are like Wi-Fi — invisible but connected.", ja: "関係はWi-Fiみたい。見えないけど繋がってる。", zh: "关系像WiFi——看不见，但一直连着" },
    { ko: "작은 대화가 큰 외로움을 녹여요", en: "Small talk melts big loneliness", ja: "小さな会話が大きな孤独を溶かす", zh: "小小的对话融化大大的孤独" },
    { ko: "고마움을 표현하면 두 사람 모두 행복해져요", en: "Saying thanks makes two people happy", ja: "感謝を伝えると二人とも幸せになる", zh: "说声谢谢，两个人都会开心" },
    { ko: "혼자 가면 빠르지만, 같이 가면 멀리 가요", en: "Alone you go fast; together you go far", ja: "一人なら速い、一緒なら遠くへ", zh: "一个人走得快，一群人走得远" },
    { ko: "연락은 마음의 물주기예요", en: "Reaching out is watering your heart", ja: "連絡は心への水やり", zh: "联系就是给心灵浇水" },
  ],

  // ── PRODUCTIVITY ── 펀치, 추진력
  productivity: [
    { ko: "완벽보다 완료. 일단 보내.", en: "Done beats perfect. Ship it.", ja: "完璧より完了。とりあえず出す。", zh: "完成胜过完美，先交出去。" },
    { ko: "정리된 책상은 정리된 머릿속의 시작이에요", en: "A clear desk is the start of a clear mind", ja: "片付いたデスクは整った頭の始まり", zh: "干净的桌面是清晰头脑的开始" },
    { ko: "5분만 해보세요. 보통 5분 안에 엔진이 걸려요.", en: "Just 5 minutes. The engine usually starts within 5.", ja: "5分だけやってみて。大体5分でエンジンがかかる。", zh: "先做5分钟，通常5分钟内就能进入状态" },
    { ko: "해야 할 일 목록은 자유를 향한 지도예요", en: "A to-do list is a map to freedom", ja: "やることリストは自由への地図", zh: "待办清单是通往自由的地图" },
    { ko: "작게 시작하면 크게 끝낼 수 있어요", en: "Start small, finish big", ja: "小さく始めれば大きく終えられる", zh: "从小开始，大有可为" },
    { ko: "멀티태스킹은 환상이에요. 하나씩.", en: "Multitasking is a myth. One at a time.", ja: "マルチタスクは幻想。一つずつ。", zh: "多任务是幻觉，一件一件来" },
    { ko: "내일 할 일을 오늘 적어두면, 내일이 가벼워져요", en: "Write tomorrow's tasks today, and tomorrow feels lighter", ja: "明日のタスクを今日書けば、明日が軽くなる", zh: "今天写下明天的任务，明天就会轻松" },
    { ko: "가장 어려운 일은 시작 버튼을 누르는 거예요", en: "The hardest part is pressing Start", ja: "一番難しいのはスタートボタンを押すこと", zh: "最难的是按下开始键" },
  ],

  // ── WELLNESS ── 편안, 셀프케어
  wellness: [
    { ko: "쉬는 건 보상이 아니라 필수예요", en: "Rest isn't a reward. It's a requirement.", ja: "休むのはご褒美じゃなく必須", zh: "休息不是奖赏，是必需品" },
    { ko: "오늘 충분히 잘 했어요. 진짜로.", en: "You did enough today. Really.", ja: "今日は十分頑張った。本当に。", zh: "今天你已经做得够好了，真的" },
    { ko: "자기 자신에게도 친절해야 해요", en: "Be kind to yourself too", ja: "自分自身にも優しく", zh: "也要对自己温柔一点" },
    { ko: "수면은 최고의 자기계발이에요", en: "Sleep is the ultimate self-improvement", ja: "睡眠こそ最高の自己投資", zh: "睡眠是最好的自我提升" },
    { ko: "가끔은 천천히 가는 것도 용기예요", en: "Sometimes going slow takes courage", ja: "ゆっくり進むのも時には勇気", zh: "有时候慢慢来也是一种勇气" },
    { ko: "몸이 보내는 신호를 무시하지 마세요", en: "Don't ignore what your body is telling you", ja: "体が送るサインを無視しないで", zh: "别忽视身体发出的信号" },
    { ko: "한숨도 깊은 호흡이에요", en: "A sigh is a deep breath in disguise", ja: "ため息も深呼吸のうち", zh: "叹气也是一种深呼吸" },
    { ko: "아무것도 안 하는 시간도 치유의 시간이에요", en: "Doing nothing can be healing too", ja: "何もしない時間も癒しの時間", zh: "什么都不做的时间也是疗愈时间" },
  ],

  // ── TRENDING ── Z세대 유머, 밈풍
  trending: [
    { ko: "알고리즘이 대신 해주지 않아요. 터치 그래스.", en: "The algorithm won't do this for you. Touch grass.", ja: "アルゴリズムは代わりにやってくれない。外に出よう。", zh: "算法不会替你做，出去摸摸草吧" },
    { ko: "갓생은 아침에 일어나는 순간 시작돼요", en: "Living your best life starts the moment you wake up", ja: "ゴッド生は目覚めた瞬間始まる", zh: "神仙生活从睁眼那一刻开始" },
    { ko: "주 52시간 일하는데 자기계발 30분이 아깝다고요?", en: "You work 52 hours a week but can't spare 30 min for yourself?", ja: "週52時間働いて自己投資30分が惜しい？", zh: "一周工作52小时，30分钟自我提升都嫌多？" },
    { ko: "인스타 스토리 올리는 시간이면 충분해요", en: "If you have time to post a Story, you have time for this", ja: "ストーリーを上げる時間があればこれもできる", zh: "有时间发Story就有时间做这个" },
    { ko: "오늘 안 하면 내일의 내가 욕해요", en: "Skip today and tomorrow-you will curse you", ja: "今日やらないと明日の自分に怒られる", zh: "今天不做，明天的自己会骂你" },
    { ko: "루틴이 곧 럭셔리예요 💅", en: "Routine IS luxury 💅", ja: "ルーティンこそラグジュアリー 💅", zh: "自律就是奢侈 💅" },
    { ko: "'나중에'는 안 온다는 거 알잖아요", en: "You know 'later' never actually comes, right?", ja: "「あとで」は来ないって知ってるでしょ", zh: "你知道「以后」永远不会来的吧" },
    { ko: "이 챌린지 클리어하면 경험치 +1 인생", en: "Clear this challenge: +1 XP in life", ja: "このチャレンジクリアで人生経験値+1", zh: "通关这个挑战，人生经验值+1" },
  ],
};

/**
 * 카드 ID 를 해시하여 카테고리 풀에서 결정적으로 명언을 선택.
 * 같은 카드를 열면 항상 같은 명언이 표시됨.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getCardQuote(card: ChallengeCard, lang: Language): string {
  const pool = QUOTE_POOL[card.category];
  const index = simpleHash(card.id) % pool.length;
  return pool[index][lang];
}
