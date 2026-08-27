//
//  FortunePool.swift
//  UpNext — 오늘의 기운 색·문구 풀 (웹 src/data/fortunePool.ts 1:1 포팅).
//  8 카테고리 × (색 3 + 문구 4) × 4언어. 명언은 QuotePool 을 그대로 재사용한다.
//  ※ 자동 생성 (fortunePool.ts → Swift). 수동 편집 금지 — 원본 수정 후 재생성.
//

import Foundation

/// 오늘의 색 — 스와치 hex + 4언어 색 이름.
struct FortuneColor: Hashable {
    /// 스와치로 칠할 색 ("#RRGGBB")
    let hex: String
    /// 색 이름 [ko, en, ja, zh]
    let name: [String]
}

enum FortunePool {

    /// category rawValue → 오늘의 색 3종.
    static let colors: [String: [FortuneColor]] = [
        "fitness": [
            FortuneColor(hex: "#FF7A3D", name: ["노을 태우는 주황", "Burning Sunset Orange", "夕焼けを焦がすオレンジ", "燃烧晚霞的橙"]),
            FortuneColor(hex: "#FFB03A", name: ["정오의 호박빛", "Midday Amber", "真昼の琥珀", "正午的琥珀"]),
            FortuneColor(hex: "#E8674A", name: ["달아오른 구리", "Heated Copper", "熱を帯びた銅", "灼热的铜"]),
        ],
        "nutrition": [
            FortuneColor(hex: "#C7E86B", name: ["새순 연두", "First Sprout Green", "新芽の若草", "新芽嫩绿"]),
            FortuneColor(hex: "#F2C14E", name: ["버터 옐로", "Butter Yellow", "バターイエロー", "黄油黄"]),
            FortuneColor(hex: "#E0995A", name: ["구운 살구", "Roasted Apricot", "焼き杏", "烤杏色"]),
        ],
        "mindfulness": [
            FortuneColor(hex: "#9BF0E1", name: ["새벽 물빛", "Dawn Water", "夜明けの水色", "黎明水色"]),
            FortuneColor(hex: "#8FB8DB", name: ["안개 낀 하늘", "Misted Sky", "霧のかかった空", "薄雾天空"]),
            FortuneColor(hex: "#B8A9D9", name: ["저녁 라벤더", "Evening Lavender", "夕暮れのラベンダー", "黄昏薰衣草"]),
        ],
        "learning": [
            FortuneColor(hex: "#7E9BE8", name: ["잉크 블루", "Ink Blue", "インクブルー", "墨水蓝"]),
            FortuneColor(hex: "#9E8CE8", name: ["밑줄 보라", "Underline Violet", "傍線のすみれ", "下划线紫"]),
            FortuneColor(hex: "#6FB5D6", name: ["도서관 창가", "Library Window", "図書館の窓辺", "图书馆窗边"]),
        ],
        "social": [
            FortuneColor(hex: "#F58BA8", name: ["홍조 핑크", "Blushed Pink", "頬染めピンク", "微红粉"]),
            FortuneColor(hex: "#FF9E7A", name: ["따뜻한 코랄", "Warm Coral", "あたたかいコーラル", "温暖珊瑚"]),
            FortuneColor(hex: "#E86BA0", name: ["필름 로즈", "Film Rose", "フィルムローズ", "胶片玫瑰"]),
        ],
        "productivity": [
            FortuneColor(hex: "#CDF564", name: ["형광 라임", "Fluorescent Lime", "蛍光ライム", "荧光青柠"]),
            FortuneColor(hex: "#7FD1B9", name: ["정리된 민트", "Tidied Mint", "片づいたミント", "整理过的薄荷"]),
            FortuneColor(hex: "#D8D8D2", name: ["빈 책상 화이트", "Empty Desk White", "空っぽの机の白", "空桌白"]),
        ],
        "wellness": [
            FortuneColor(hex: "#B7D9C4", name: ["이불 속 연두", "Under-Blanket Green", "布団の中の若草", "被窝里的浅绿"]),
            FortuneColor(hex: "#D9C7B8", name: ["따뜻한 모래", "Warm Sand", "あたたかい砂", "温暖沙色"]),
            FortuneColor(hex: "#C9A9C4", name: ["낮잠 분홍", "Afternoon Nap Pink", "昼寝のピンク", "午睡粉"]),
        ],
        "trending": [
            FortuneColor(hex: "#F037A5", name: ["Y2K 마젠타", "Y2K Magenta", "Y2Kマゼンタ", "Y2K洋红"]),
            FortuneColor(hex: "#8A7BFF", name: ["울트라 바이올렛", "Ultra Violet", "ウルトラバイオレット", "极致紫"]),
            FortuneColor(hex: "#FF8ED4", name: ["버블검 핑크", "Bubblegum Pink", "バブルガムピンク", "泡泡糖粉"]),
        ],
    ]

    /// category rawValue → 오늘의 문구 4종 ([ko, en, ja, zh]).
    static let phrases: [String: [[String]]] = [
        "fitness": [
            ["몸이 먼저 움직이면 마음은 따라옵니다", "Move the body first; the mind follows", "体が先に動けば心はついてくる", "身体先动，心自然跟上"],
            ["오늘의 숨이 조금 깊어질 겁니다", "Your breath runs a little deeper today", "今日は呼吸が少し深くなる", "今天的呼吸会深一些"],
            ["가볍게 시작한 것이 가장 멀리 갑니다", "What starts light travels farthest", "軽く始めたものが一番遠くまで行く", "轻松开始的，走得最远"],
            ["지친 곳이 아니라 쓰지 않은 곳이 아픕니다", "It aches where unused, not where tired", "疲れた所ではなく使っていない所が痛む", "疼的不是累的地方，是没用过的地方"],
        ],
        "nutrition": [
            ["오늘 고른 한 끼가 내일의 기분을 정합니다", "Today's one meal sets tomorrow's mood", "今日選んだ一食が明日の気分を決める", "今天选的一餐决定明天的心情"],
            ["천천히 먹은 것만 몸에 남습니다", "Only what's eaten slowly stays", "ゆっくり食べたものだけが体に残る", "只有慢慢吃的才留得住"],
            ["물 한 잔이 오늘의 첫 번째 정답입니다", "A glass of water is today's first right answer", "水一杯が今日の最初の正解", "一杯水是今天第一个正确答案"],
            ["색이 많은 접시가 좋은 하루를 만듭니다", "A colorful plate makes a good day", "色の多い皿が良い一日をつくる", "色彩丰富的餐盘造就好日子"],
        ],
        "mindfulness": [
            ["멈춘 자리에서 가장 멀리 보입니다", "You see farthest from where you stop", "立ち止まった場所から一番遠くが見える", "停下的地方看得最远"],
            ["오늘은 서두르지 않아도 늦지 않습니다", "Today you won't be late, even unhurried", "今日は急がなくても遅れない", "今天不赶也不会迟"],
            ["숨을 세는 동안은 아무것도 잃지 않습니다", "Nothing is lost while you count your breath", "呼吸を数える間は何も失わない", "数呼吸的时候，什么也不会失去"],
            ["조용한 순간이 오늘의 가장 큰 사건입니다", "The quiet moment is today's biggest event", "静かな瞬間が今日一番の出来事", "安静的片刻是今天最大的事"],
        ],
        "learning": [
            ["한 페이지가 어제와 다른 사람을 만듭니다", "One page makes you different from yesterday", "一ページが昨日と違う自分をつくる", "一页书造就与昨天不同的你"],
            ["모르는 것을 적어두면 반은 배운 겁니다", "Write down what you don't know: that's half of learning", "分からないことを書けば半分は学んだこと", "写下不懂的，就学会了一半"],
            ["오늘 붙잡은 문장이 오래 남습니다", "The sentence you catch today stays long", "今日つかまえた一文は長く残る", "今天抓住的句子会留得很久"],
            ["이해는 늦게 오지만 반드시 옵니다", "Understanding comes late, but it comes", "理解は遅れて来るが必ず来る", "理解来得晚，但一定会来"],
        ],
        "social": [
            ["먼저 건넨 한마디가 오늘을 바꿉니다", "The first word you offer changes today", "先にかけた一言が今日を変える", "先说出的那句话会改变今天"],
            ["안부를 묻는 쪽이 더 많이 받습니다", "The one who asks receives more", "安否を尋ねる側がより多く受け取る", "先问候的人收获更多"],
            ["오늘은 듣는 일이 말하는 일보다 큽니다", "Today, listening outweighs speaking", "今日は聞くことが話すことより大きい", "今天，听比说更重要"],
            ["잊고 있던 이름이 떠오르면 좋은 신호입니다", "A forgotten name resurfacing is a good sign", "忘れていた名前が浮かべば良い兆し", "想起遗忘的名字是好兆头"],
        ],
        "productivity": [
            ["가장 작은 일부터 치우면 길이 열립니다", "Clear the smallest thing and the path opens", "一番小さいことから片づけると道が開く", "先清掉最小的事，路就开了"],
            ["오늘은 시작이 완성보다 중요합니다", "Today, starting matters more than finishing", "今日は始めることが仕上げより大事", "今天，开始比完成更重要"],
            ["정리된 책상만큼 머리도 정리됩니다", "A tidy desk tidies the mind", "片づいた机の分だけ頭も片づく", "桌子整理多少，脑子就整理多少"],
            ["미룬 일 하나가 오늘의 무게 전부입니다", "One postponed task is today's entire weight", "先延ばした一つが今日の重さのすべて", "拖延的那一件就是今天全部的重量"],
        ],
        "wellness": [
            ["쉬는 것도 오늘 해야 할 일입니다", "Resting is also today's task", "休むことも今日やるべきこと", "休息也是今天该做的事"],
            ["일찍 눕는 것이 가장 빠른 회복입니다", "Lying down early is the fastest recovery", "早く横になるのが一番早い回復", "早点躺下是最快的恢复"],
            ["몸이 보내는 신호는 늦게 오지 않습니다", "The body's signals are never late", "体が送る信号は遅れて来ない", "身体发出的信号从不迟到"],
            ["아무것도 안 한 시간이 내일을 만듭니다", "The hour spent doing nothing builds tomorrow", "何もしなかった時間が明日をつくる", "什么都没做的时间造就明天"],
        ],
        "trending": [
            ["남들이 하니까 말고, 궁금하니까 해봅니다", "Not because others do it, but because you're curious", "みんながやるからではなく、気になるからやる", "不是因为别人做，是因为你好奇"],
            ["새로 해본 것만 이야깃거리가 됩니다", "Only the new thing becomes a story", "新しく試したことだけが話の種になる", "只有新尝试才会变成谈资"],
            ["오늘의 유행은 내일의 기록입니다", "Today's trend is tomorrow's record", "今日の流行は明日の記録", "今天的流行是明天的记录"],
            ["어색한 첫 시도가 가장 선명하게 남습니다", "The awkward first try stays sharpest", "ぎこちない最初の一回が一番鮮明に残る", "笨拙的第一次留下最清晰的印象"],
        ],
    ]

    /// [ko, en, ja, zh, ...] 묶음에서 현재 언어를 고른다. QuotePool.quote 의 언어 분기와 동일.
    /// 인용 배열은 뒤에 저자 4칸이 더 붙어 8칸이므로 == 4 로 막으면 안 된다(전부 한국어로 폴백된다).
    static func text(_ quad: [String], lang: Language) -> String {
        guard quad.count >= 4 else { return quad.first ?? "" }
        switch lang {
        case .en: return quad[1]
        case .ja: return quad[2]
        case .zh: return quad[3]
        case .ko: return quad[0]
        }
    }

    /// 인용의 저자명. 실존 인물 인용에만 값이 있고 앱 오리지널 문구는 nil 이다.
    static func author(_ quote: [String], lang: Language) -> String? {
        QuotePool.author(quote, lang: lang.rawValue)
    }
}
