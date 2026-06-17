//
//  QuotePool.swift
//  UpNext — 카드 디테일 인용문 풀 (웹 src/data/quotePool.ts 1:1 포팅).
//  8 카테고리 × 8개 × 4언어 = 256 문자열. getCardQuote(card,lang) = QUOTE_POOL[cat][simpleHash(id)%8].
//  ※ 자동 생성 (quotePool.ts → Swift). 수동 편집 금지 — 원본 수정 후 재생성.
//

import Foundation

enum QuotePool {
    /// category rawValue → [[ko, en, ja, zh]] (8개씩).
    static let pool: [String: [[String]]] = [
        "fitness": [
            ["한 걸음이 천 리의 시작이에요", "A single step begins a thousand miles", "千里の道も一歩から", "千里之行始于足下"],
            ["어제의 나보다 1%만 더", "Just 1% better than yesterday", "昨日の自分より1%だけ上へ", "只比昨天好1%就够了"],
            ["몸이 기억하는 건 핑계가 아니라 반복이에요", "Your body remembers reps, not excuses", "体が覚えるのは言い訳じゃなく反復", "身体记住的不是借口，而是重复"],
            ["오늘 흘린 땀은 내일의 자신감이에요", "Today's sweat is tomorrow's confidence", "今日の汗は明日の自信", "今天的汗水就是明天的自信"],
            ["완벽한 컨디션은 없어요. 시작이 곧 컨디션.", "There's no perfect condition. Starting IS the condition.", "完璧なコンディションなんてない。始めることがコンディション。", "没有完美的状态，开始就是最好的状态"],
            ["가만히 있으면 근육은 잊어요. 움직여야 기억해요.", "Muscles forget when idle. Move to remember.", "じっとしてると筋肉は忘れる。動いて思い出そう。", "不动就会忘记，运动才能记住"],
            ["운동은 미래의 나에게 보내는 선물이에요", "Exercise is a gift to your future self", "運動は未来の自分への贈り物", "运动是送给未来自己的礼物"],
            ["지금 이 순간, 몸은 당신 편이에요", "Right now, your body is on your side", "今この瞬間、体はあなたの味方", "此刻，身体站在你这一边"],
        ],
        "nutrition": [
            ["좋은 연료, 좋은 기분. 간단한 공식.", "Good fuel, good mood. Simple math.", "良い燃料、良い気分。シンプルな方程式。", "好燃料，好心情。简单公式。"],
            ["한 입 한 입이 작은 투자예요", "Every bite is a small investment", "一口一口が小さな投資", "每一口都是小小的投资"],
            ["오늘 먹은 것이 내일의 에너지예요", "What you ate today powers tomorrow", "今日食べたものが明日のエネルギー", "今天吃的就是明天的能量"],
            ["물 한 잔의 가치를 아는 사람이 진짜 어른", "Knowing the worth of one glass of water — that's maturity", "水一杯の価値を知る人こそ大人", "懂得一杯水价值的人才是真大人"],
            ["배고픔이 아니라 마음이 허할 때도 있어요", "Sometimes it's not hunger — it's the heart that's empty", "お腹じゃなく心が空いてることもある", "有时候不是饿，是心空了"],
            ["감사하며 먹는 밥이 제일 맛있어요", "Food eaten with gratitude tastes the best", "感謝して食べるごはんが一番おいしい", "带着感恩吃的饭最香"],
            ["몸에 좋은 건 혀도 곧 좋아하게 돼요", "Your tongue will learn to love what's good for you", "体に良いものは舌もすぐ好きになる", "对身体好的东西，舌头很快也会喜欢"],
            ["식탁 위의 색이 다양할수록 하루도 풍요로워져요", "The more colors on your plate, the richer your day", "食卓の色が多いほど1日も豊かになる", "餐桌上颜色越多，一天越丰富"],
        ],
        "mindfulness": [
            ["숨을 들이쉬며 가능성을, 내쉬며 걱정을 놓아요", "Breathe in possibility, breathe out doubt", "吸う息で可能性を、吐く息で心配を手放す", "吸入可能性，呼出忧虑"],
            ["지금 이 순간만 존재해요. 충분해요.", "This moment is all there is. It's enough.", "今この瞬間だけが存在する。それで十分。", "此刻就是一切，已经足够"],
            ["생각을 멈추지 않아도 돼요. 흘려보내면 돼요.", "You don't need to stop thinking. Just let thoughts flow.", "考えを止めなくていい。流せばいい。", "不必停止思考，让念头流过就好"],
            ["고요함 속에서 가장 큰 소리가 들려요", "In stillness, you hear the loudest truths", "静けさの中で最も大きな声が聞こえる", "在安静中才能听到最大的声音"],
            ["마음도 근육이에요. 쉬어야 강해져요.", "The mind is a muscle too. Rest makes it stronger.", "心も筋肉。休めば強くなる。", "心也是肌肉，休息才能更强"],
            ["아무것도 안 해도 괜찮은 시간이 필요해요", "Sometimes you need time where nothing is required", "何もしなくていい時間が必要なときもある", "有时候你需要什么都不用做的时间"],
            ["걱정은 내일의 에너지를 오늘 쓰는 거예요", "Worry spends tomorrow's energy today", "心配は明日のエネルギーを今日使うこと", "担忧是把明天的精力花在今天"],
            ["3분의 고요가 하루를 바꿔요", "Three minutes of calm can shift your whole day", "3分の静けさが1日を変える", "3分钟的安静能改变一整天"],
        ],
        "learning": [
            ["뇌가 레벨업 했어요. 아직 모르고 있을 뿐.", "Your brain just leveled up. It doesn't know it yet.", "脳がレベルアップした。まだ気づいてないだけ。", "大脑刚升级了，只是自己还不知道"],
            ["1페이지가 0페이지보다 무한히 나아요", "One page is infinitely better than zero pages", "1ページは0ページより無限に良い", "1页比0页好无限倍"],
            ["모르는 게 있다는 건 성장할 공간이 있다는 뜻", "Not knowing something means there's room to grow", "知らないことがあるのは成長の余地があるということ", "不知道的东西意味着还有成长空间"],
            ["어제 배운 것이 오늘의 무기가 돼요", "What you learned yesterday becomes today's weapon", "昨日学んだことが今日の武器になる", "昨天学的就是今天的武器"],
            ["호기심을 따라가면 길이 보여요", "Follow your curiosity — it knows the way", "好奇心についていけば道が見える", "跟着好奇心走，路自然出现"],
            ["실수도 학습 데이터예요", "Mistakes are training data", "ミスも学習データ", "错误也是训练数据"],
            ["매일 조금씩. 복리의 마법을 믿으세요.", "A little each day. Trust the magic of compounding.", "毎日少しずつ。複利の魔法を信じて。", "每天一点点，相信复利的魔力"],
            ["책 한 줄이 인생을 바꿀 수도 있어요", "A single line in a book can change your life", "本の一行が人生を変えることもある", "一本书里的一行字也许能改变人生"],
        ],
        "social": [
            ["세상 어딘가에 당신 같은 사람이 필요해요", "Someone out there needs exactly your kind of weird", "世界のどこかにあなたみたいな人が必要", "世界某处正需要像你这样的人"],
            ["먼저 안부를 묻는 사람이 세상을 따뜻하게 해요", "The one who asks first warms the world", "先に声をかける人が世界を温める", "先问候的人温暖了世界"],
            ["같이 웃으면 행복이 두 배가 돼요", "Laughter shared is happiness doubled", "一緒に笑えば幸せは倍になる", "一起笑，幸福加倍"],
            ["관계는 Wi-Fi 같아요. 보이진 않지만 연결되어 있어요.", "Relationships are like Wi-Fi — invisible but connected.", "関係はWi-Fiみたい。見えないけど繋がってる。", "关系像WiFi——看不见，但一直连着"],
            ["작은 대화가 큰 외로움을 녹여요", "Small talk melts big loneliness", "小さな会話が大きな孤独を溶かす", "小小的对话融化大大的孤独"],
            ["고마움을 표현하면 두 사람 모두 행복해져요", "Saying thanks makes two people happy", "感謝を伝えると二人とも幸せになる", "说声谢谢，两个人都会开心"],
            ["혼자 가면 빠르지만, 같이 가면 멀리 가요", "Alone you go fast; together you go far", "一人なら速い、一緒なら遠くへ", "一个人走得快，一群人走得远"],
            ["연락은 마음의 물주기예요", "Reaching out is watering your heart", "連絡は心への水やり", "联系就是给心灵浇水"],
        ],
        "productivity": [
            ["완벽보다 완료. 일단 보내.", "Done beats perfect. Ship it.", "完璧より完了。とりあえず出す。", "完成胜过完美，先交出去。"],
            ["정리된 책상은 정리된 머릿속의 시작이에요", "A clear desk is the start of a clear mind", "片付いたデスクは整った頭の始まり", "干净的桌面是清晰头脑的开始"],
            ["5분만 해보세요. 보통 5분 안에 엔진이 걸려요.", "Just 5 minutes. The engine usually starts within 5.", "5分だけやってみて。大体5分でエンジンがかかる。", "先做5分钟，通常5分钟内就能进入状态"],
            ["해야 할 일 목록은 자유를 향한 지도예요", "A to-do list is a map to freedom", "やることリストは自由への地図", "待办清单是通往自由的地图"],
            ["작게 시작하면 크게 끝낼 수 있어요", "Start small, finish big", "小さく始めれば大きく終えられる", "从小开始，大有可为"],
            ["멀티태스킹은 환상이에요. 하나씩.", "Multitasking is a myth. One at a time.", "マルチタスクは幻想。一つずつ。", "多任务是幻觉，一件一件来"],
            ["내일 할 일을 오늘 적어두면, 내일이 가벼워져요", "Write tomorrow's tasks today, and tomorrow feels lighter", "明日のタスクを今日書けば、明日が軽くなる", "今天写下明天的任务，明天就会轻松"],
            ["가장 어려운 일은 시작 버튼을 누르는 거예요", "The hardest part is pressing Start", "一番難しいのはスタートボタンを押すこと", "最难的是按下开始键"],
        ],
        "wellness": [
            ["쉬는 건 보상이 아니라 필수예요", "Rest isn't a reward. It's a requirement.", "休むのはご褒美じゃなく必須", "休息不是奖赏，是必需品"],
            ["오늘 충분히 잘 했어요. 진짜로.", "You did enough today. Really.", "今日は十分頑張った。本当に。", "今天你已经做得够好了，真的"],
            ["자기 자신에게도 친절해야 해요", "Be kind to yourself too", "自分自身にも優しく", "也要对自己温柔一点"],
            ["수면은 최고의 자기계발이에요", "Sleep is the ultimate self-improvement", "睡眠こそ最高の自己投資", "睡眠是最好的自我提升"],
            ["가끔은 천천히 가는 것도 용기예요", "Sometimes going slow takes courage", "ゆっくり進むのも時には勇気", "有时候慢慢来也是一种勇气"],
            ["몸이 보내는 신호를 무시하지 마세요", "Don't ignore what your body is telling you", "体が送るサインを無視しないで", "别忽视身体发出的信号"],
            ["한숨도 깊은 호흡이에요", "A sigh is a deep breath in disguise", "ため息も深呼吸のうち", "叹气也是一种深呼吸"],
            ["아무것도 안 하는 시간도 치유의 시간이에요", "Doing nothing can be healing too", "何もしない時間も癒しの時間", "什么都不做的时间也是疗愈时间"],
        ],
        "trending": [
            ["알고리즘이 대신 해주지 않아요. 터치 그래스.", "The algorithm won't do this for you. Touch grass.", "アルゴリズムは代わりにやってくれない。外に出よう。", "算法不会替你做，出去摸摸草吧"],
            ["갓생은 아침에 일어나는 순간 시작돼요", "Living your best life starts the moment you wake up", "ゴッド生は目覚めた瞬間始まる", "神仙生活从睁眼那一刻开始"],
            ["주 52시간 일하는데 자기계발 30분이 아깝다고요?", "You work 52 hours a week but can't spare 30 min for yourself?", "週52時間働いて自己投資30分が惜しい？", "一周工作52小时，30分钟自我提升都嫌多？"],
            ["인스타 스토리 올리는 시간이면 충분해요", "If you have time to post a Story, you have time for this", "ストーリーを上げる時間があればこれもできる", "有时间发Story就有时间做这个"],
            ["오늘 안 하면 내일의 내가 욕해요", "Skip today and tomorrow-you will curse you", "今日やらないと明日の自分に怒られる", "今天不做，明天的自己会骂你"],
            ["루틴이 곧 럭셔리예요 💅", "Routine IS luxury 💅", "ルーティンこそラグジュアリー 💅", "自律就是奢侈 💅"],
            ["'나중에'는 안 온다는 거 알잖아요", "You know 'later' never actually comes, right?", "「あとで」は来ないって知ってるでしょ", "你知道「以后」永远不会来的吧"],
            ["이 챌린지 클리어하면 경험치 +1 인생", "Clear this challenge: +1 XP in life", "このチャレンジクリアで人生経験値+1", "通关这个挑战，人生经验值+1"],
        ],
    ]

    /// 웹 simpleHash — 32비트 signed 누적 + abs (JS `(hash<<5)-hash | 0` 동치).
    static func simpleHash(_ s: String) -> Int {
        var hash: Int32 = 0
        for u in s.unicodeScalars {
            hash = (hash &<< 5) &- hash &+ Int32(truncatingIfNeeded: Int(u.value))
        }
        return abs(Int(hash))
    }

    /// 카드 + 언어 → 인용문. 웹 getCardQuote 동치 (같은 card.id → 같은 인용문).
    static func quote(for card: ChallengeCard, lang: String) -> String {
        let p = pool[card.category.rawValue] ?? []
        guard !p.isEmpty else { return "" }
        let q = p[simpleHash(card.id) % p.count]
        switch lang {
        case "en": return q[1]
        case "ja": return q[2]
        case "zh": return q[3]
        default:   return q[0]
        }
    }
}
