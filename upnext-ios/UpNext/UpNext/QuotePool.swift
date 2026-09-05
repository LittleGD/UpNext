//
//  QuotePool.swift
//  UpNext — 카드 디테일 + 오늘의 기운 인용문 풀 (웹 src/data/quotePool.ts 1:1 포팅).
//  8 카테고리 / 총 204개 / 4언어. 이 중 92개는 실존 인물 인용으로 저자가 붙는다.
//
//  ※ 자동 생성 (scripts/gen-ios-quotepool.py). 수동 편집 금지 — 웹 원본 수정 후 재생성.
//
//  인용 하나의 표현: [ko, en, ja, zh, authorKo, authorEn, authorJa, authorZh]
//  앱 오리지널 문구는 뒤 4칸이 빈 문자열이다. text(_:lang:) / author(_:lang:) 로 읽는다.
//

import Foundation

enum QuotePool {
    /// category rawValue → 인용 배열.
    static let pool: [String: [[String]]] = [
        "fitness": [
            ["한 걸음이 천 리의 시작이에요", "A single step begins a thousand miles", "千里の道も一歩から", "千里之行始于足下", "", "", "", ""],
            ["어제의 나보다 1%만 더", "Just 1% better than yesterday", "昨日の自分より1%だけ上へ", "只比昨天好1%就够了", "", "", "", ""],
            ["몸이 기억하는 건 핑계가 아니라 반복이에요", "Your body remembers reps, not excuses", "体が覚えるのは言い訳じゃなく反復", "身体记住的不是借口，而是重复", "", "", "", ""],
            ["오늘 흘린 땀은 내일의 자신감이에요", "Today's sweat is tomorrow's confidence", "今日の汗は明日の自信", "今天的汗水就是明天的自信", "", "", "", ""],
            ["완벽한 컨디션은 없어요. 시작이 곧 컨디션.", "There's no perfect condition. Starting IS the condition.", "完璧なコンディションなんてない。始めることがコンディション。", "没有完美的状态，开始就是最好的状态", "", "", "", ""],
            ["가만히 있으면 근육은 잊어요. 움직여야 기억해요.", "Muscles forget when idle. Move to remember.", "じっとしてると筋肉は忘れる。動いて思い出そう。", "不动就会忘记，运动才能记住", "", "", "", ""],
            ["운동은 미래의 나에게 보내는 선물이에요", "Exercise is a gift to your future self", "運動は未来の自分への贈り物", "运动是送给未来自己的礼物", "", "", "", ""],
            ["지금 이 순간, 몸은 당신 편이에요", "Right now, your body is on your side", "今この瞬間、体はあなたの味方", "此刻，身体站在你这一边", "", "", "", ""],
            ["천 리 길도 발밑에서 시작된다.", "A journey of a thousand miles begins beneath one's feet.", "千里の道も足下より始まる。", "千里之行，始于足下。", "노자", "Laozi", "老子", "老子"],
            ["흐르는 물은 썩지 않고, 여닫는 문지도리는 좀먹지 않는다.", "Running water never goes stale; a turning door hinge is never worm-eaten.", "流れる水は腐らず、動く戸の軸は虫に食われない。", "流水不腐，户枢不蠹。", "여씨춘추", "Lüshi Chunqiu", "呂氏春秋", "吕氏春秋"],
            ["계속하는 것이 곧 힘이다.", "To keep going is itself strength.", "継続は力なり。", "坚持就是力量。", "일본 속담", "Japanese proverb", "日本のことわざ", "日本谚语"],
            ["무슨 생각을 해. 그냥 하는 거지.", "What is there to think about? You just do it.", "何を考えるの。ただやるだけだよ。", "想什么呢，做就是了。", "김연아", "Yuna Kim", "キム・ヨナ", "金妍儿"],
            ["챔피언은 승리가 아니라, 넘어졌을 때 어떻게 일어서는가로 결정된다.", "A champion is defined not by their wins but by how they can recover when they fall.", "チャンピオンを決めるのは勝利ではなく、倒れたときにどう立ち直るかだ。", "衡量冠军的不是胜利，而是跌倒后如何重新站起来。", "세리나 윌리엄스", "Serena Williams", "セリーナ・ウィリアムズ", "塞雷娜·威廉姆斯"],
            ["싸움 없이 얻어지는 승리는 없다.", "The triumph can't be had without the struggle.", "苦闘なしに勝利は手に入らない。", "没有挣扎，就没有胜利。", "윌마 루돌프", "Wilma Rudolph", "ウィルマ・ルドルフ", "威尔玛·鲁道夫"],
            ["근육을 자라게 하는 것은 마지막 서너 번의 반복이다.", "The last three or four reps is what makes the muscle grow.", "筋肉を大きくするのは、最後の3、4回のレップだ。", "让肌肉生长的，是最后那三四次。", "아널드 슈워제네거", "Arnold Schwarzenegger", "アーノルド・シュワルツェネッガー", "阿诺德·施瓦辛格"],
            ["무엇보다도, 걷고 싶은 마음을 잃지 마십시오.", "Above all, do not lose your desire to walk.", "何よりも、歩きたいという気持ちを失わないでください。", "最重要的是，不要失去想走路的愿望。", "쇠렌 키르케고르", "Søren Kierkegaard", "セーレン・キルケゴール", "索伦·克尔凯郭尔"],
            ["어떤 사람이 될 수 있는지 보지도 못한 채, 그저 게을러서 늙어 버리는 것은 부끄러운 일이다.", "It is a disgrace to grow old through sheer carelessness before seeing what manner of man you may become.", "自分がどんな人間になれるかを見ないまま、ただ怠って年老いるのは恥ずべきことだ。", "还没看到自己能成为怎样的人，就因疏懒而老去，是一件可耻的事。", "소크라테스", "Socrates", "ソクラテス", "苏格拉底"],
            ["가장 힘든 건 문을 나서는 일입니다. 나머지는 다리가 알아서 합니다.", "The hardest part is stepping out the door. Your legs handle the rest.", "いちばん大変なのは玄関を出ることです。あとは脚がやってくれます。", "最难的是走出家门。剩下的，交给双腿就好。", "", "", "", ""],
            ["숨이 조금 차오르는 그 지점부터가 오늘의 수확입니다.", "The moment your breath quickens is where today's gain begins.", "少し息が上がってきたところから、今日の収穫が始まります。", "从有点喘的那一刻起，今天的收获才开始。", "", "", "", ""],
            ["몸은 정직합니다. 오늘 쓴 만큼 내일 돌려줍니다.", "The body is honest. It gives back tomorrow whatever you spend today.", "体は正直です。今日使った分だけ、明日返してくれます。", "身体很诚实。今天付出多少，明天就还给你多少。", "", "", "", ""],
            ["한 정거장 먼저 내려 걷는 것도 충분히 훌륭한 운동입니다.", "Getting off one stop early and walking counts as a real workout.", "一駅手前で降りて歩く。それも立派な運動です。", "提前一站下车走回去，也是很棒的运动。", "", "", "", ""],
            ["십 분이면 충분합니다. 움직이기 시작한 몸은 대개 더 하고 싶어집니다.", "Ten minutes is plenty. A body that has started usually wants more.", "十分で十分です。動き出した体は、たいていもっと動きたくなります。", "十分钟就够了。动起来的身体，通常还想再多动一会儿。", "", "", "", ""],
            ["심장이 빠르게 뛰는 소리는, 오늘을 잘 살고 있다는 신호입니다.", "A racing heartbeat is a signal that today is going well.", "心臓が速く打つ音は、今日をちゃんと生きている合図です。", "心跳加速的声音，是你今天活得很好的信号。", "", "", "", ""],
        ],
        "nutrition": [
            ["좋은 연료, 좋은 기분. 간단한 공식.", "Good fuel, good mood. Simple math.", "良い燃料、良い気分。シンプルな方程式。", "好燃料，好心情。简单公式。", "", "", "", ""],
            ["한 입 한 입이 작은 투자예요", "Every bite is a small investment", "一口一口が小さな投資", "每一口都是小小的投资", "", "", "", ""],
            ["오늘 먹은 것이 내일의 에너지예요", "What you ate today powers tomorrow", "今日食べたものが明日のエネルギー", "今天吃的就是明天的能量", "", "", "", ""],
            ["물 한 잔의 가치를 아는 사람이 진짜 어른", "Knowing the worth of one glass of water: that's maturity", "水一杯の価値を知る人こそ大人", "懂得一杯水价值的人才是真大人", "", "", "", ""],
            ["배고픔이 아니라 마음이 허할 때도 있어요", "Sometimes it's not hunger. It's the heart that's empty", "お腹じゃなく心が空いてることもある", "有时候不是饿，是心空了", "", "", "", ""],
            ["감사하며 먹는 밥이 제일 맛있어요", "Food eaten with gratitude tastes the best", "感謝して食べるごはんが一番おいしい", "带着感恩吃的饭最香", "", "", "", ""],
            ["몸에 좋은 건 혀도 곧 좋아하게 돼요", "Your tongue will learn to love what's good for you", "体に良いものは舌もすぐ好きになる", "对身体好的东西，舌头很快也会喜欢", "", "", "", ""],
            ["식탁 위의 색이 다양할수록 하루도 풍요로워져요", "The more colors on your plate, the richer your day", "食卓の色が多いほど1日も豊かになる", "餐桌上颜色越多，一天越丰富", "", "", "", ""],
            ["새로운 요리의 발견은 새로운 별의 발견보다 인류의 행복에 더 크게 이바지한다.", "The discovery of a new dish does more for the happiness of mankind than the discovery of a new star.", "新しい料理の発見は、新しい星の発見よりも人類の幸福に貢献する。", "发现一道新菜肴，比发现一颗新星更能增进人类的幸福。", "장 앙텔므 브리야사바랭", "Jean Anthelme Brillat-Savarin", "ジャン・アンテルム・ブリア＝サヴァラン", "让·安泰尔姆·布里亚-萨瓦兰"],
            ["잘 먹지 않고서는 잘 생각할 수도, 잘 사랑할 수도, 잘 잠들 수도 없다.", "One cannot think well, love well, sleep well, if one has not dined well.", "よく食べなければ、よく考えることも、よく愛することも、よく眠ることもできない。", "没有好好吃饭，就无法好好思考、好好爱、好好睡觉。", "버지니아 울프", "Virginia Woolf", "ヴァージニア・ウルフ", "弗吉尼亚·伍尔夫"],
            ["진짜 음식을 드세요. 너무 많이 말고. 대부분 식물로.", "Eat food. Not too much. Mostly plants.", "本物の食べ物を食べよう。食べすぎず。主に植物を。", "吃真正的食物。别吃太多。以植物为主。", "마이클 폴란", "Michael Pollan", "マイケル・ポーラン", "迈克尔·波伦"],
            ["먹는 일은 곧 농사짓는 일이다.", "Eating is an agricultural act.", "食べることは、農業的な行為である。", "吃，本身就是一种农业行为。", "웬델 베리", "Wendell Berry", "ウェンデル・ベリー", "温德尔·贝里"],
            ["빵을 떼어 나누고 잔을 나눌 때, 우리는 몸 이상의 것을 나눈다.", "There is a communion of more than our bodies when bread is broken and wine drunk.", "パンを分け合い、杯を交わすとき、私たちは体以上のものを分かち合っている。", "当我们掰开面包、共饮一杯时，交融的远不只是身体。", "M.F.K. 피셔", "M.F.K. Fisher", "M・F・K・フィッシャー", "M·F·K·费雪"],
            ["요리하는 사람은 누구도 혼자 요리하지 않는다.", "No one who cooks, cooks alone.", "料理をする人は、誰ひとりとして一人では料理していない。", "下厨的人，没有一个是独自在下厨。", "로리 콜윈", "Laurie Colwin", "ローリー・コルウィン", "劳里·科尔温"],
            ["사과 파이를 맨 처음부터 만들고 싶다면, 먼저 우주를 발명해야 한다.", "If you wish to make an apple pie from scratch, you must first invent the universe.", "アップルパイを一から作りたいなら、まず宇宙を発明しなければならない。", "若想从零开始做一个苹果派，你必须先发明宇宙。", "칼 세이건", "Carl Sagan", "カール・セーガン", "卡尔·萨根"],
            ["사람은 왜 맛있는 것을 찾을까요. 생명을 지키기 쉽게 하기 위해서라고 저는 생각합니다.", "Why do people seek out delicious food? I believe it is to make life easier to protect.", "人はなぜ美味しいものを求めるのか。それはいのちを守りやすくするためだと思います。", "人为什么追求美味？我想，是为了更容易守护生命。", "다쓰미 요시코", "Yoshiko Tatsumi", "辰巳芳子", "辰巳芳子"],
            ["금강산도 식후경.", "Even Mount Geumgang is worth seeing only after a meal.", "金剛山も食後の見物。", "金刚山也要吃饱了再去看。", "한국 속담", "Korean proverb", "韓国のことわざ", "韩国谚语"],
            ["배는 팔 할만 채우면 의사가 필요 없다.", "Eat until you are eighty percent full and you will need no doctor.", "腹八分目に医者いらず。", "饭吃八分饱，不用请医生。", "일본 속담", "Japanese proverb", "日本のことわざ", "日本谚语"],
            ["잘 먹는 것도 오늘의 할 일이에요.", "Eating well is part of today's work, too.", "しっかり食べることも、今日のやることのひとつです。", "好好吃饭，也是今天该做的事之一。", "", "", "", ""],
            ["한 숟갈마다 누군가의 손이 닿아 있어요.", "Every spoonful has passed through someone's hands.", "ひと匙ごとに、誰かの手が触れています。", "每一勺饭里，都留着别人的双手。", "", "", "", ""],
            ["천천히 씹는 동안, 몸이 오늘을 따라와요.", "While you chew slowly, your body catches up with the day.", "ゆっくり噛んでいるあいだに、体が今日に追いついてきます。", "慢慢咀嚼的时候，身体会跟上今天的节奏。", "", "", "", ""],
            ["완벽한 식단보다, 거르지 않은 한 끼가 낫습니다.", "One meal you didn't skip beats a perfect diet.", "完璧な食事より、抜かなかった一食のほうが大切です。", "比起完美的饮食，没有跳过的那一餐更要紧。", "", "", "", ""],
            ["물 한 잔도 몸에게는 큰 선물이에요.", "Even a glass of water is a real gift to your body.", "コップ一杯の水も、体にとっては大きな贈り物です。", "哪怕只是一杯水，对身体也是一份厚礼。", "", "", "", ""],
            ["맛있게 먹은 기억은 오래 남습니다.", "The memory of a meal you truly enjoyed stays with you.", "おいしく食べた記憶は、長く残ります。", "吃得开心的记忆，会留存很久。", "", "", "", ""],
        ],
        "mindfulness": [
            ["숨을 들이쉬며 가능성을, 내쉬며 걱정을 놓아요", "Breathe in possibility, breathe out doubt", "吸う息で可能性を、吐く息で心配を手放す", "吸入可能性，呼出忧虑", "", "", "", ""],
            ["지금 이 순간만 존재해요. 충분해요.", "This moment is all there is. It's enough.", "今この瞬間だけが存在する。それで十分。", "此刻就是一切，已经足够", "", "", "", ""],
            ["생각을 멈추지 않아도 돼요. 흘려보내면 돼요.", "You don't need to stop thinking. Just let thoughts flow.", "考えを止めなくていい。流せばいい。", "不必停止思考，让念头流过就好", "", "", "", ""],
            ["고요함 속에서 가장 큰 소리가 들려요", "In stillness, you hear the loudest truths", "静けさの中で最も大きな声が聞こえる", "在安静中才能听到最大的声音", "", "", "", ""],
            ["마음도 근육이에요. 쉬어야 강해져요.", "The mind is a muscle too. Rest makes it stronger.", "心も筋肉。休めば強くなる。", "心也是肌肉，休息才能更强", "", "", "", ""],
            ["아무것도 안 해도 괜찮은 시간이 필요해요", "Sometimes you need time where nothing is required", "何もしなくていい時間が必要なときもある", "有时候你需要什么都不用做的时间", "", "", "", ""],
            ["걱정은 내일의 에너지를 오늘 쓰는 거예요", "Worry spends tomorrow's energy today", "心配は明日のエネルギーを今日使うこと", "担忧是把明天的精力花在今天", "", "", "", ""],
            ["3분의 고요가 하루를 바꿔요", "Three minutes of calm can shift your whole day", "3分の静けさが1日を変える", "3分钟的安静能改变一整天", "", "", "", ""],
            ["설거지를 할 때는 오직 설거지만 하십시오.", "While washing the dishes one should only be washing the dishes.", "皿を洗うときは、ただ皿を洗いなさい。", "洗碗的时候，就只是洗碗。", "틱낫한", "Thich Nhat Hanh", "ティク・ナット・ハン", "一行禅师"],
            ["마음챙김이란 특별한 방식으로 주의를 기울이는 것이다. 의도적으로, 지금 이 순간에, 판단하지 않고.", "Mindfulness means paying attention in a particular way: on purpose, in the present moment, and nonjudgmentally.", "マインドフルネスとは、特別なやり方で注意を向けることだ。意図的に、今この瞬間に、判断を加えずに。", "正念，就是以一种特别的方式去留意：有意地，在当下这一刻，不加评判。", "존 카밧진", "Jon Kabat-Zinn", "ジョン・カバットジン", "乔恩·卡巴金"],
            ["사람이 자기 영혼 속보다 더 고요하고 평온한 안식처를 찾을 수 있는 곳은 어디에도 없다.", "Nowhere can man find a quieter or more untroubled retreat than in his own soul.", "人が自らの魂の中よりも静かで安らかな隠れ家を見つけられる場所は、どこにもない。", "人无处可寻得比自己的心灵更安静、更无扰的隐居之所。", "마르쿠스 아우렐리우스", "Marcus Aurelius", "マルクス・アウレリウス", "马可·奥勒留"],
            ["우리는 현실에서보다 상상 속에서 더 자주 고통받는다.", "We suffer more often in imagination than in reality.", "私たちは現実よりも想像の中でより多く苦しむ。", "我们在想象中受的苦，往往多于现实。", "세네카", "Seneca", "セネカ", "塞涅卡"],
            ["인간의 모든 불행은 단 한 가지, 방에 고요히 머무를 줄 모르는 데서 온다.", "All the misery of men comes from one thing: not knowing how to remain at rest in a room.", "人間のすべての不幸はただ一つ、部屋に静かにとどまっていられないことから来る。", "人的一切不幸都来自同一件事：不懂得安静地待在房间里。", "블레즈 파스칼", "Blaise Pascal", "ブレーズ・パスカル", "布莱兹·帕斯卡"],
            ["비움이 지극한 데 이르고, 고요함을 도탑게 지켜라.", "Attain utmost emptiness; hold fast to stillness.", "虚を致すこと極まり、静を守ること篤し。", "致虚极，守静笃。", "노자", "Laozi", "老子", "老子"],
            ["지혜로운 사람은 미혹되지 않고, 어진 사람은 근심하지 않으며, 용감한 사람은 두려워하지 않는다.", "The wise are not confused, the humane are not anxious, the brave are not afraid.", "知者は惑わず、仁者は憂えず、勇者は懼れず。", "知者不惑，仁者不忧，勇者不惧。", "공자", "Confucius", "孔子", "孔子"],
            ["저 텅 빈 곳을 보라. 빈 방에서 흰빛이 생겨난다.", "Look into that empty chamber: in the empty room, brightness is born.", "かの空しきところを見よ。虚なる室に白き光が生ずる。", "瞻彼阕者，虚室生白。", "장자", "Zhuangzi", "荘子", "庄子"],
            ["불도를 배운다는 것은 자기를 배우는 것이다. 자기를 배운다는 것은 자기를 잊는 것이다.", "To study the Buddha way is to study the self. To study the self is to forget the self.", "仏道をならふといふは、自己をならふなり。自己をならふといふは、自己をわするるなり。", "学佛道者，即是学自己；学自己者，即是忘自己。", "도겐", "Dōgen", "道元", "道元"],
            ["무슨 생각을 해. 그냥 하는 거지.", "What is there to think about? You just do it.", "何を考えるの。ただやるだけだよ。", "想什么呢，做就是了。", "김연아", "Kim Yuna", "キム・ヨナ", "金妍儿"],
            ["주의를 기울이는 일은 가장 드물고 가장 순수한 형태의 너그러움이다.", "Attention is the rarest and purest form of generosity.", "注意を向けることは、最も稀で最も純粋な寛さのかたちである。", "专注，是最稀有也最纯粹的慷慨。", "시몬 베유", "Simone Weil", "シモーヌ・ヴェイユ", "西蒙娜·薇依"],
            ["마음챙김은 새로운 것을 능동적으로 알아차리는 과정이다.", "Mindfulness is the process of actively noticing new things.", "マインドフルネスとは、新しいことに能動的に気づいていく過程である。", "正念，是主动去留意新事物的过程。", "엘렌 랭어", "Ellen Langer", "エレン・ランガー", "埃伦·兰格"],
            ["거의 모든 것은 몇 분만 플러그를 뽑아두면 다시 작동합니다. 당신도 그렇습니다.", "Almost everything will work again if you unplug it for a few minutes, including you.", "たいていのものは、数分プラグを抜けばまた動き出します。あなたも例外ではありません。", "几乎所有东西，拔掉插头几分钟就能重新运转，包括你自己。", "앤 라모트", "Anne Lamott", "アン・ラモット", "安·拉莫特"],
            ["숨 한 번. 지금 할 수 있는 게 그것뿐이어도 충분합니다.", "One breath. Even if that is all you can do right now, it is enough.", "ひと呼吸。今できるのがそれだけでも、十分です。", "一次呼吸。此刻能做的只有这些，也已经足够。", "", "", "", ""],
            ["생각은 지나가는 구름입니다. 붙잡지 않으면 알아서 흘러갑니다.", "Thoughts are passing clouds. If you do not hold on, they drift away on their own.", "考えは流れる雲です。つかまなければ、ひとりでに過ぎていきます。", "念头是飘过的云。不去抓它，它自己就散了。", "", "", "", ""],
            ["오늘은 아무것도 고치지 않아도 됩니다. 그냥 앉아 계셔도 됩니다.", "Nothing needs fixing today. You are allowed to just sit.", "今日は何も直さなくていいのです。ただ座っていても構いません。", "今天什么都不必修补。只是坐着，也可以。", "", "", "", ""],
            ["마음이 시끄러운 날엔 발바닥에 닿는 바닥을 느껴보세요.", "On noisy days, feel the floor under your feet.", "心が騒がしい日は、足の裏に触れる床を感じてみてください。", "心里吵闹的日子，试着感受脚底下的地面。", "", "", "", ""],
            ["잘 쉬는 것도 하루의 일부입니다. 미뤄둔 숨을 쉬어보세요.", "Resting well is part of the day too. Take the breath you have been putting off.", "よく休むことも一日の一部です。後回しにしていた呼吸を、してみましょう。", "好好休息也是一天的一部分。把一直搁着的那口气，呼出来吧。", "", "", "", ""],
            ["지금 이 순간은 서두르지 않습니다. 당신도 그래도 됩니다.", "This moment is in no hurry. You do not have to be either.", "今この瞬間は急いでいません。あなたも急がなくていいのです。", "此刻并不着急，你也可以不着急。", "", "", "", ""],
        ],
        "learning": [
            ["뇌가 레벨업 했어요. 아직 모르고 있을 뿐.", "Your brain just leveled up. It doesn't know it yet.", "脳がレベルアップした。まだ気づいてないだけ。", "大脑刚升级了，只是自己还不知道", "", "", "", ""],
            ["1페이지가 0페이지보다 무한히 나아요", "One page is infinitely better than zero pages", "1ページは0ページより無限に良い", "1页比0页好无限倍", "", "", "", ""],
            ["모르는 게 있다는 건 성장할 공간이 있다는 뜻", "Not knowing something means there's room to grow", "知らないことがあるのは成長の余地があるということ", "不知道的东西意味着还有成长空间", "", "", "", ""],
            ["어제 배운 것이 오늘의 무기가 돼요", "What you learned yesterday becomes today's weapon", "昨日学んだことが今日の武器になる", "昨天学的就是今天的武器", "", "", "", ""],
            ["호기심을 따라가면 길이 보여요", "Follow your curiosity, it knows the way", "好奇心についていけば道が見える", "跟着好奇心走，路自然出现", "", "", "", ""],
            ["실수도 학습 데이터예요", "Mistakes are training data", "ミスも学習データ", "错误也是训练数据", "", "", "", ""],
            ["매일 조금씩. 복리의 마법을 믿으세요.", "A little each day. Trust the magic of compounding.", "毎日少しずつ。複利の魔法を信じて。", "每天一点点，相信复利的魔力", "", "", "", ""],
            ["책 한 줄이 인생을 바꿀 수도 있어요", "A single line in a book can change your life", "本の一行が人生を変えることもある", "一本书里的一行字也许能改变人生", "", "", "", ""],
            ["배우기만 하고 생각하지 않으면 얻는 것이 없고, 생각만 하고 배우지 않으면 위태롭습니다.", "Learning without thought is labour lost; thought without learning is perilous.", "学びて思わざれば則ち罔し、思いて学ばざれば則ち殆うし。", "学而不思则罔，思而不学则殆。", "공자", "Confucius", "孔子", "孔子"],
            ["세 사람이 길을 가면 그중에 반드시 나의 스승이 있습니다.", "When three walk together, I am sure to find a teacher among them.", "三人行けば、必ず我が師あり。", "三人行，必有我师焉。", "공자", "Confucius", "孔子", "孔子"],
            ["만 권의 책을 읽으면, 붓을 들 때 신이 든 듯합니다.", "Read ten thousand books, and your brush will move as if inspired.", "万巻の書を読み破れば、筆を下ろすに神有るが如し。", "读书破万卷，下笔如有神。", "두보", "Du Fu", "杜甫", "杜甫"],
            ["옛사람의 자취를 좇지 말고, 옛사람이 구하던 것을 구하십시오.", "Do not seek to follow in the footsteps of the old masters; seek what they sought.", "古人の跡を求めず、古人の求めたる所を求めよ。", "莫求古人之迹，当求古人所求。", "마쓰오 바쇼", "Matsuo Bashō", "松尾芭蕉", "松尾芭蕉"],
            ["묻는 것은 한때의 부끄러움, 묻지 않는 것은 평생의 부끄러움입니다.", "Asking is a moment's shame; not asking is a lifetime's shame.", "聞くは一時の恥、聞かぬは一生の恥。", "问是一时之耻，不问是一生之耻。", "일본 속담", "Japanese proverb", "日本のことわざ", "日本谚语"],
            ["구슬이 서 말이라도 꿰어야 보배입니다.", "Even a bushel of pearls must be strung to become a treasure.", "玉が三斗あっても、糸を通してこそ宝になる。", "珠子有三斗，串起来才是宝。", "한국 속담", "Korean proverb", "韓国のことわざ", "韩国谚语"],
            ["저는 진보의 길이 결코 빠르지도, 쉽지도 않다고 배웠습니다.", "I was taught that the way of progress was neither swift nor easy.", "進歩の道は決して速くも容易でもない、と私は教えられました。", "我被教导，进步之路既不迅速，也不容易。", "마리 퀴리", "Marie Curie", "マリ・キュリー", "玛丽·居里"],
            ["첫 번째 원칙은 자신을 속이지 않는 것입니다. 그리고 가장 속이기 쉬운 사람이 바로 자기 자신입니다.", "The first principle is that you must not fool yourself, and you are the easiest person to fool.", "第一の原則は、自分自身をだまさないこと。そして最もだましやすい相手は自分自身です。", "第一原则是不要欺骗自己，而你恰恰是最容易被欺骗的人。", "리처드 파인만", "Richard Feynman", "リチャード・ファインマン", "理查德·费曼"],
            ["교육은 세상을 바꾸는 데 쓸 수 있는 가장 강력한 무기입니다.", "Education is the most powerful weapon which you can use to change the world.", "教育こそが、世界を変えるために使える最も強力な武器です。", "教育是你能用来改变世界的最强大的武器。", "넬슨 만델라", "Nelson Mandela", "ネルソン・マンデラ", "纳尔逊·曼德拉"],
            ["한 명의 아이, 한 명의 선생님, 한 권의 책, 한 자루의 펜이 세상을 바꿀 수 있습니다.", "One child, one teacher, one book and one pen can change the world.", "一人の子ども、一人の教師、一冊の本、一本のペンが世界を変えられます。", "一个孩子，一位老师，一本书，一支笔，就能改变世界。", "말랄라 유사프자이", "Malala Yousafzai", "マララ・ユスフザイ", "马拉拉·优素福扎伊"],
            ["정말 읽고 싶은 책이 아직 쓰이지 않았다면, 당신이 그 책을 써야 합니다.", "If you find a book you really want to read but it hasn't been written yet, then you must write it.", "本当に読みたい本がまだ書かれていないなら、あなたがそれを書かなければなりません。", "如果你真想读的书还没有人写出来，那就该由你来写。", "토니 모리슨", "Toni Morrison", "トニ・モリスン", "托妮·莫里森"],
            ["저에게는 특별한 재능이 없습니다. 그저 열정적으로 호기심이 많을 뿐입니다.", "I have no special talent. I am only passionately curious.", "私には特別な才能はありません。ただ、情熱的に好奇心が強いだけです。", "我没有特别的天赋，我只是有强烈的好奇心。", "알베르트 아인슈타인", "Albert Einstein", "アルベルト・アインシュタイン", "阿尔伯特·爱因斯坦"],
            ["사람은 변화에 알레르기가 있습니다. \"늘 이렇게 해왔잖아\"라는 말을 좋아하죠. 저는 그것과 싸웁니다.", "Humans are allergic to change. They love to say, \"We've always done it this way.\" I try to fight that.", "人は変化にアレルギーがあります。「ずっとこうしてきた」と言いたがる。私はそれと戦っています。", "人类对改变过敏，总爱说“我们一直都是这么做的”。我一直在与此抗争。", "그레이스 호퍼", "Grace Hopper", "グレース・ホッパー", "格蕾丝·霍珀"],
            ["오늘 배운 한 가지가 내일의 나를 조금 다르게 만듭니다.", "One thing you learn today makes tomorrow's you a little different.", "今日学んだひとつが、明日のあなたを少しだけ変えてくれます。", "今天学到的一件小事，会让明天的你稍稍不同。", "", "", "", ""],
            ["모르겠다고 말하는 순간, 배움이 시작됩니다.", "The moment you say \"I don't know,\" learning begins.", "「わからない」と言えた瞬間から、学びは始まります。", "说出“我不知道”的那一刻，学习就开始了。", "", "", "", ""],
            ["한 페이지도 독서입니다. 오늘은 그것으로 충분합니다.", "One page still counts as reading. Today, that is enough.", "1ページでも読書です。今日はそれで十分です。", "一页也是阅读。今天这样就够了。", "", "", "", ""],
            ["궁금해하는 마음은 재능보다 오래갑니다.", "Curiosity lasts longer than talent.", "知りたいという気持ちは、才能よりも長く続きます。", "好奇心比天赋走得更远。", "", "", "", ""],
            ["어제의 나에게 설명할 수 있다면, 제대로 이해한 것입니다.", "If you can explain it to yesterday's you, you have truly understood it.", "昨日の自分に説明できたなら、ちゃんと理解できた証拠です。", "如果你能讲给昨天的自己听，那就是真的懂了。", "", "", "", ""],
            ["이해가 느린 날도 있습니다. 그런 날은 속도를 줄이면 됩니다.", "Some days understanding comes slowly. On those days, it is fine to slow down.", "理解が進まない日もあります。そんな日は、速度を落とせば大丈夫です。", "也有理解得慢的日子。那样的日子，放慢一点就好。", "", "", "", ""],
        ],
        "social": [
            ["세상 어딘가에 당신 같은 사람이 필요해요", "Someone out there needs exactly your kind of weird", "世界のどこかにあなたみたいな人が必要", "世界某处正需要像你这样的人", "", "", "", ""],
            ["먼저 안부를 묻는 사람이 세상을 따뜻하게 해요", "The one who asks first warms the world", "先に声をかける人が世界を温める", "先问候的人温暖了世界", "", "", "", ""],
            ["같이 웃으면 행복이 두 배가 돼요", "Laughter shared is happiness doubled", "一緒に笑えば幸せは倍になる", "一起笑，幸福加倍", "", "", "", ""],
            ["관계는 Wi-Fi 같아요. 보이진 않지만 연결되어 있어요.", "Relationships are like Wi-Fi, invisible but connected.", "関係はWi-Fiみたい。見えないけど繋がってる。", "关系像WiFi，看不见，但一直连着", "", "", "", ""],
            ["작은 대화가 큰 외로움을 녹여요", "Small talk melts big loneliness", "小さな会話が大きな孤独を溶かす", "小小的对话融化大大的孤独", "", "", "", ""],
            ["고마움을 표현하면 두 사람 모두 행복해져요", "Saying thanks makes two people happy", "感謝を伝えると二人とも幸せになる", "说声谢谢，两个人都会开心", "", "", "", ""],
            ["혼자 가면 빠르지만, 같이 가면 멀리 가요", "Alone you go fast; together you go far", "一人なら速い、一緒なら遠くへ", "一个人走得快，一群人走得远", "", "", "", ""],
            ["연락은 마음의 물주기예요", "Reaching out is watering your heart", "連絡は心への水やり", "联系就是给心灵浇水", "", "", "", ""],
            ["벗이 먼 곳에서 찾아오니, 이 또한 즐겁지 아니한가.", "Is it not a joy to have friends come from afar?", "朋あり遠方より来たる、また楽しからずや。", "有朋自远方来，不亦乐乎？", "공자", "Confucius", "孔子", "孔子"],
            ["남을 사랑하는 사람은 남도 늘 그를 사랑하고, 남을 공경하는 사람은 남도 늘 그를 공경한다.", "One who loves others is constantly loved by others; one who respects others is constantly respected.", "人を愛する者は人も恒にこれを愛し、人を敬う者は人も恒にこれを敬う。", "爱人者，人恒爱之；敬人者，人恒敬之。", "맹자", "Mencius", "孟子", "孟子"],
            ["끝없이 먼 곳, 수많은 사람들, 그 모두가 나와 관계가 있다.", "The boundless distance, the countless people, all of them have to do with me.", "無限の彼方、無数の人々、そのすべてが私と関わっている。", "无穷的远方，无数的人们，都和我有关。", "루쉰", "Lu Xun", "魯迅", "鲁迅"],
            ["마음이 같은 사람과 차분히 이야기 나누며 허물없이 마음을 털어놓을 수 있다면, 얼마나 기쁠까.", "How glad one would be to talk quietly with a like-minded person, opening one's heart without reserve.", "同じ心ならん人と、しめやかに物語して、うらなく言ひ慰まんこそうれしかるべき。", "若能与心意相通的人静静交谈，毫无隔阂地彼此慰藉，那该是多么欢喜。", "요시다 겐코", "Yoshida Kenkō", "吉田兼好", "吉田兼好"],
            ["돕는다는 것은 우산을 들어주는 것이 아니라 함께 비를 맞는 것입니다.", "To help someone is not to hold an umbrella over them, but to stand in the rain together.", "助けるとは、傘を差しかけることではなく、一緒に雨に濡れることです。", "所谓帮助，不是替对方撑伞，而是陪他一起淋雨。", "신영복", "Shin Young-bok", "シン・ヨンボク", "申荣福"],
            ["다른 모든 것을 다 가졌다 해도, 친구 없이 살기를 택할 사람은 없다.", "No one would choose to live without friends, even if he had all other goods.", "他のすべてを手にしていても、友なしに生きることを選ぶ人はいない。", "纵然拥有其他一切，也没有人愿意过没有朋友的生活。", "아리스토텔레스", "Aristotle", "アリストテレス", "亚里士多德"],
            ["서로의 삶을 조금 덜 힘들게 해주는 것 말고, 우리가 무엇을 위해 살겠습니까?", "What do we live for, if it is not to make life less difficult to each other?", "互いの人生を少しでも楽にしてあげること以外に、私たちは何のために生きているのでしょう。", "若不是为了让彼此的人生轻松一些，我们究竟为何而活？", "조지 엘리엇", "George Eliot", "ジョージ・エリオット", "乔治·艾略特"],
            ["관심을 기울이는 일은 가장 드물고 가장 순수한 형태의 너그러움이다.", "Attention is the rarest and purest form of generosity.", "注意を向けることは、最も稀で最も純粋な寛大さのかたちである。", "专注地注视他人，是最稀有、最纯粹的慷慨。", "시몬 베유", "Simone Weil", "シモーヌ・ヴェイユ", "西蒙娜·薇依"],
            ["나의 인간됨은 당신의 인간됨과 떼려야 뗄 수 없이 묶여 있습니다.", "My humanity is caught up, is inextricably bound up, in yours.", "私の人間性は、あなたの人間性と分かちがたく結びついている。", "我的人性与你的人性紧密相连，无法分割。", "데즈먼드 투투", "Desmond Tutu", "デズモンド・ツツ", "德斯蒙德·图图"],
            ["혼자서는 할 수 있는 일이 적지만, 함께라면 많은 것을 할 수 있습니다.", "Alone we can do so little; together we can do so much.", "一人でできることはわずかでも、力を合わせれば多くのことができる。", "一个人能做的很少，众人携手却能成就许多。", "헬렌 켈러", "Helen Keller", "ヘレン・ケラー", "海伦·凯勒"],
            ["자유의 쓸모는 다른 누군가를 자유롭게 하는 데 있습니다.", "The function of freedom is to free someone else.", "自由の役割は、ほかの誰かを自由にすることにある。", "自由的意义，在于让另一个人也获得自由。", "토니 모리슨", "Toni Morrison", "トニ・モリスン", "托妮·莫里森"],
            ["말 한마디에 천 냥 빚도 갚는다.", "A single well-spoken word can repay a thousand-nyang debt.", "ひと言のことばで千両の借りも返せる。", "一句好话，能抵千两债。", "한국 속담", "Korean proverb", "韓国のことわざ", "韩国谚语"],
            ["옷깃만 스쳐도 인연입니다.", "Even a brush of sleeves is the fruit of a bond from another life.", "袖振り合うも多生の縁。", "擦肩而过，也是缘分。", "일본 속담", "Japanese proverb", "日本のことわざ", "日本谚语"],
            ["안부를 묻는 데 대단한 이유는 필요하지 않습니다.", "You don't need a good reason to ask how someone is doing.", "元気かと尋ねるのに、大した理由はいりません。", "问一句近来可好，并不需要什么大不了的理由。", "", "", "", ""],
            ["잘 들어주는 것만으로도 충분히 좋은 대화입니다.", "Listening well is already a good conversation.", "よく聞くだけで、もう十分にいい会話です。", "只是好好倾听，就已经是一场很好的对话。", "", "", "", ""],
            ["오늘은 한 사람에게만 다정해도 괜찮습니다.", "It's enough to be kind to just one person today.", "今日はひとりにだけやさしくできれば、それでいいのです。", "今天只对一个人温柔，也很好。", "", "", "", ""],
            ["고맙다는 말에는 유통기한이 없습니다.", "A thank-you never expires.", "ありがとうに、賞味期限はありません。", "一句谢谢，从来不会过期。", "", "", "", ""],
            ["먼저 건넨 한마디가 멀어진 사이를 다시 이어줍니다.", "One word offered first can reconnect what had drifted apart.", "先に掛けたひと言が、遠のいた関係をまたつないでくれます。", "先开口的那一句，能把疏远的关系重新连起来。", "", "", "", ""],
            ["곁에 있어 주는 일에는 특별한 재능이 필요하지 않습니다.", "Being there for someone takes no special talent.", "そばにいてあげることに、特別な才能はいりません。", "陪在身边这件事，不需要什么特别的才能。", "", "", "", ""],
        ],
        "productivity": [
            ["완벽보다 완료. 일단 보내.", "Done beats perfect. Ship it.", "完璧より完了。とりあえず出す。", "完成胜过完美，先交出去。", "", "", "", ""],
            ["정리된 책상은 정리된 머릿속의 시작이에요", "A clear desk is the start of a clear mind", "片付いたデスクは整った頭の始まり", "干净的桌面是清晰头脑的开始", "", "", "", ""],
            ["5분만 해보세요. 보통 5분 안에 엔진이 걸려요.", "Just 5 minutes. The engine usually starts within 5.", "5分だけやってみて。大体5分でエンジンがかかる。", "先做5分钟，通常5分钟内就能进入状态", "", "", "", ""],
            ["해야 할 일 목록은 자유를 향한 지도예요", "A to-do list is a map to freedom", "やることリストは自由への地図", "待办清单是通往自由的地图", "", "", "", ""],
            ["작게 시작하면 크게 끝낼 수 있어요", "Start small, finish big", "小さく始めれば大きく終えられる", "从小开始，大有可为", "", "", "", ""],
            ["멀티태스킹은 환상이에요. 하나씩.", "Multitasking is a myth. One at a time.", "マルチタスクは幻想。一つずつ。", "多任务是幻觉，一件一件来", "", "", "", ""],
            ["내일 할 일을 오늘 적어두면, 내일이 가벼워져요", "Write tomorrow's tasks today, and tomorrow feels lighter", "明日のタスクを今日書けば、明日が軽くなる", "今天写下明天的任务，明天就会轻松", "", "", "", ""],
            ["가장 어려운 일은 시작 버튼을 누르는 거예요", "The hardest part is pressing Start", "一番難しいのはスタートボタンを押すこと", "最难的是按下开始键", "", "", "", ""],
            ["천 리 길도 발밑 한 걸음에서 시작된다.", "A journey of a thousand miles begins beneath one's feet.", "千里の道も一歩から。", "千里之行，始于足下。", "노자", "Laozi", "老子", "老子"],
            ["반걸음을 쌓지 않으면 천 리에 이를 수 없다.", "Without piling up half-steps, no one reaches a thousand miles.", "半歩を積まなければ、千里には至れない。", "不积跬步，无以至千里。", "순자", "Xunzi", "荀子", "荀子"],
            ["서두르면 이르지 못한다.", "Desire for speed brings no attainment.", "速やかならんと欲すれば、則ち達せず。", "欲速则不达。", "공자", "Confucius", "孔子", "孔子"],
            ["학업은 부지런함에서 깊어지고, 노는 데서 무너진다.", "Learning ripens through diligence and rots through idleness.", "学業は勤勉によって深まり、遊びによって荒れる。", "业精于勤，荒于嬉。", "한유", "Han Yu", "韓愈", "韩愈"],
            ["미루는 동안에도 삶은 흘러간다.", "While we are postponing, life speeds by.", "先延ばしにしている間にも、人生は過ぎ去っていく。", "我们拖延之时，人生正飞逝而去。", "세네카", "Seneca", "セネカ", "塞内卡"],
            ["최선은 선의 적이다.", "The best is the enemy of the good.", "最良は善の敵である。", "至善是良善之敌。", "볼테르", "Voltaire", "ヴォルテール", "伏尔泰"],
            ["완벽은 더 보탤 것이 없을 때가 아니라, 더 덜어낼 것이 없을 때 이루어진다.", "Perfection is attained not when there is nothing more to add, but when there is nothing left to take away.", "完璧とは、加えるものがなくなった時ではなく、削るものがなくなった時に達成される。", "完美并非无可增添之时，而是无可删减之时。", "앙투안 드 생텍쥐페리", "Antoine de Saint-Exupéry", "アントワーヌ・ド・サン＝テグジュペリ", "安托万·德·圣埃克苏佩里"],
            ["아예 하지 않아도 될 일을 대단히 효율적으로 해내는 것만큼 쓸모없는 일은 없다.", "There is surely nothing quite so useless as doing with great efficiency what should not be done at all.", "そもそもやるべきでないことを、見事に効率よくやることほど無用なことはない。", "没有什么比极高效率地做根本不该做的事更无用了。", "피터 드러커", "Peter Drucker", "ピーター・ドラッカー", "彼得·德鲁克"],
            ["집중이란 아니라고 말하는 것입니다.", "Focusing is about saying no.", "集中とは、ノーと言うことだ。", "专注，就是学会说不。", "스티브 잡스", "Steve Jobs", "スティーブ・ジョブズ", "史蒂夫·乔布斯"],
            ["완벽주의는 압제자의 목소리이자, 사람들의 적이다.", "Perfectionism is the voice of the oppressor, the enemy of the people.", "完璧主義は抑圧者の声であり、人々の敵である。", "完美主义是压迫者的声音，是人民的敌人。", "앤 라모트", "Anne Lamott", "アン・ラモット", "安·拉莫特"],
            ["천 일의 수련을 단련이라 하고, 만 일의 수련을 연마라 한다.", "A thousand days of practice is forging; ten thousand days is refining.", "千日の稽古を鍛とし、万日の稽古を練とす。", "千日之习为锻，万日之习为炼。", "미야모토 무사시", "Miyamoto Musashi", "宮本武蔵", "宫本武藏"],
            ["완벽한 시작보다, 오늘 쓴 한 줄이 낫습니다.", "One line written today beats a perfect start tomorrow.", "完璧な始まりより、今日書いた一行です。", "与其完美的开始，不如今天写下的一行。", "", "", "", ""],
            ["할 일을 줄이면, 해내는 일이 늘어납니다.", "Shorten the list, and more of it gets done.", "やることを減らすと、やり遂げることが増えます。", "减少要做的事，做成的事反而更多。", "", "", "", ""],
            ["가장 미루고 싶은 하나를 먼저 꺼내 보세요.", "Start with the one you most want to postpone.", "いちばん後回しにしたい一つから始めてみましょう。", "先从最想拖延的那一件开始吧。", "", "", "", ""],
            ["오늘의 목표는 하나면 충분합니다.", "One goal is enough for today.", "今日の目標は、一つで十分です。", "今天，有一个目标就够了。", "", "", "", ""],
            ["정리는 버리는 일이 아니라, 남길 것을 고르는 일입니다.", "Tidying is not throwing away. It is choosing what stays.", "片づけとは、捨てることではなく、残すものを選ぶことです。", "整理不是丢弃，而是挑选要留下的东西。", "", "", "", ""],
            ["5분만 해보고 그만두셔도 괜찮습니다. 대개는 그만두지 않게 됩니다.", "Try five minutes, then quit if you like. You usually won't.", "5分だけやって、やめてもかまいません。たいてい、やめなくなります。", "先做五分钟，想停就停。多半你不会停。", "", "", "", ""],
        ],
        "wellness": [
            ["쉬는 건 보상이 아니라 필수예요", "Rest isn't a reward. It's a requirement.", "休むのはご褒美じゃなく必須", "休息不是奖赏，是必需品", "", "", "", ""],
            ["오늘 충분히 잘 했어요. 진짜로.", "You did enough today. Really.", "今日は十分頑張った。本当に。", "今天你已经做得够好了，真的", "", "", "", ""],
            ["자기 자신에게도 친절해야 해요", "Be kind to yourself too", "自分自身にも優しく", "也要对自己温柔一点", "", "", "", ""],
            ["수면은 최고의 자기계발이에요", "Sleep is the ultimate self-improvement", "睡眠こそ最高の自己投資", "睡眠是最好的自我提升", "", "", "", ""],
            ["가끔은 천천히 가는 것도 용기예요", "Sometimes going slow takes courage", "ゆっくり進むのも時には勇気", "有时候慢慢来也是一种勇气", "", "", "", ""],
            ["몸이 보내는 신호를 무시하지 마세요", "Don't ignore what your body is telling you", "体が送るサインを無視しないで", "别忽视身体发出的信号", "", "", "", ""],
            ["한숨도 깊은 호흡이에요", "A sigh is a deep breath in disguise", "ため息も深呼吸のうち", "叹气也是一种深呼吸", "", "", "", ""],
            ["아무것도 안 하는 시간도 치유의 시간이에요", "Doing nothing can be healing too", "何もしない時間も癒しの時間", "什么都不做的时间也是疗愈时间", "", "", "", ""],
            ["번갈아 쉬지 않는 것은 오래가지 못한다.", "What lacks alternating rest cannot endure.", "交互に休みを取らないものは、長くは続かない。", "缺少张弛交替的休息，便无法持久。", "오비디우스", "Ovid", "オウィディウス", "奥维德"],
            ["마음에는 쉼을 주어야 한다. 쉬고 나면 더 나아지고 더 예리해진다.", "Our minds must relax; they will rise better and keener after a rest.", "心には休息を与えねばならない。休んだあと、心はより良く、より鋭くなる。", "心灵必须得到放松，休息之后它会变得更好、更敏锐。", "세네카", "Seneca", "セネカ", "塞内卡"],
            ["나를 돌보는 일은 자기 방종이 아니라 자기 보존이며, 그것은 정치적 투쟁의 행위다.", "Caring for myself is not self-indulgence, it is self-preservation, and that is an act of political warfare.", "自分をケアすることは自己耽溺ではなく自己保存であり、それは政治的な闘いの行為だ。", "照顾自己不是自我放纵，而是自我保存，这是一种政治斗争的行为。", "오드리 로드", "Audre Lorde", "オードリー・ロード", "奥德蕾·洛德"],
            ["거의 모든 것은 잠시 플러그를 뽑아두면 다시 작동합니다. 당신도 마찬가지예요.", "Almost everything will work again if you unplug it for a few minutes, including you.", "たいていのものは、少しの間プラグを抜けばまた動きます。あなたも同じです。", "几乎所有东西拔掉插头几分钟后都能重新运转，你也一样。", "앤 라모트", "Anne Lamott", "アン・ラモット", "安·拉莫特"],
            ["숨을 들이쉬며 몸을 고요히 하고, 숨을 내쉬며 미소 짓습니다.", "Breathing in, I calm my body. Breathing out, I smile.", "息を吸いながら、体を静める。息を吐きながら、微笑む。", "吸气，让身体平静；呼气，我微笑。", "틱낫한", "Thich Nhat Hanh", "ティク・ナット・ハン", "一行禅师"],
            ["괜찮지 않아도 괜찮고, 그 이야기를 꺼내도 괜찮습니다.", "It's O.K. to not be O.K., and it's O.K. to talk about it.", "大丈夫じゃなくても大丈夫だし、それを話しても大丈夫です。", "不好也没关系，把它说出来也没关系。", "나오미 오사카", "Naomi Osaka", "大坂なおみ", "大坂直美"],
            ["잘 먹지 않고서는 잘 생각할 수도, 잘 사랑할 수도, 잘 잠들 수도 없다.", "One cannot think well, love well, sleep well, if one has not dined well.", "よく食べていなければ、よく考えることも、よく愛することも、よく眠ることもできない。", "没有好好吃饭，就无法好好思考、好好爱人、好好睡觉。", "버지니아 울프", "Virginia Woolf", "ヴァージニア・ウルフ", "弗吉尼亚·伍尔夫"],
            ["누구나 어떤 문제도 마주하지 않고 어떤 해답도 찾지 않는 하루를 누릴 자격이 있다.", "Each person deserves a day away in which no problems are confronted, no solutions searched for.", "誰もが、問題に向き合わず、答えも探さない一日を持つ資格がある。", "每个人都值得拥有这样一天：不面对任何问题，也不寻找任何答案。", "마야 앤절루", "Maya Angelou", "マヤ・アンジェロウ", "玛雅·安杰卢"],
            ["만족할 줄 아는 사람이 부유하다.", "He who knows contentment is rich.", "足るを知る者は富む。", "知足者富。", "노자", "Laozi", "老子", "老子"],
            ["양생의 길은 먼저 마음의 기운을 기르는 것이다.", "The art of nurturing life begins by nurturing the heart and spirit.", "養生の術は、まず心気を養うべし。", "养生之术，首先要养心气。", "가이바라 에키켄", "Kaibara Ekiken", "貝原益軒", "贝原益轩"],
            ["불안, 불확실함, 기다림, 예상, 놀랄지 모른다는 두려움은 어떤 수고보다도 환자를 해친다.", "Apprehension, uncertainty, waiting, expectation, fear of surprise, do a patient more harm than any exertion.", "不安、不確実さ、待つこと、予期、驚かされる恐れは、どんな労苦よりも患者を害する。", "忧虑、不确定、等待、期待、对意外的恐惧，比任何劳累更伤害病人。", "플로렌스 나이팅게일", "Florence Nightingale", "フローレンス・ナイチンゲール", "弗洛伦斯·南丁格尔"],
            ["배는 팔 할만 채우면 의사가 필요 없다.", "Eat until you are eight parts full and you will have no need of a doctor.", "腹八分目に医者いらず。", "饭吃八分饱，不用请医生。", "일본 속담", "Japanese proverb", "日本のことわざ", "日本谚语"],
            ["오늘은 잘 쉬는 것이 오늘의 할 일입니다.", "Today, resting well is the task for today.", "今日は、よく休むことが今日の仕事です。", "今天，好好休息就是今天的功课。", "", "", "", ""],
            ["숨을 한 번 깊게 쉬는 것만으로도 회복은 시작됩니다.", "One deep breath is enough for recovery to begin.", "深く一度呼吸するだけで、回復は始まります。", "只要深深地呼吸一次，恢复就已经开始了。", "", "", "", ""],
            ["쉬는 시간은 버리는 시간이 아니라 채우는 시간입니다.", "Rest is not time thrown away, but time being filled.", "休む時間は、捨てる時間ではなく満たす時間です。", "休息不是被丢掉的时间，而是被填满的时间。", "", "", "", ""],
            ["잘 자는 밤 하나가 내일의 절반을 미리 만들어 둡니다.", "One night of good sleep builds half of tomorrow in advance.", "よく眠れた一晩が、明日の半分を先につくってくれます。", "一个好觉，已经把明天做好了一半。", "", "", "", ""],
            ["아무것도 하지 않은 날에도, 당신은 충분히 잘 지냈습니다.", "Even on a day you did nothing, you did just fine.", "何もしなかった日でも、あなたは十分よくやっています。", "即使是什么都没做的一天，你也过得很好。", "", "", "", ""],
            ["물 한 잔, 창문 한 번. 회복은 이렇게 작게 시작됩니다.", "A glass of water, an open window. Recovery starts this small.", "水を一杯、窓を一度。回復はこんなに小さく始まります。", "一杯水，一扇窗。恢复就是从这么小的事开始的。", "", "", "", ""],
        ],
        "trending": [
            ["알고리즘이 대신 해주지 않아요. 터치 그래스.", "The algorithm won't do this for you. Touch grass.", "アルゴリズムは代わりにやってくれない。外に出よう。", "算法不会替你做，出去摸摸草吧", "", "", "", ""],
            ["갓생은 아침에 일어나는 순간 시작돼요", "Living your best life starts the moment you wake up", "ゴッド生は目覚めた瞬間始まる", "神仙生活从睁眼那一刻开始", "", "", "", ""],
            ["주 52시간 일하는데 자기계발 30분이 아깝다고요?", "You work 52 hours a week but can't spare 30 min for yourself?", "週52時間働いて自己投資30分が惜しい？", "一周工作52小时，30分钟自我提升都嫌多？", "", "", "", ""],
            ["인스타 스토리 올리는 시간이면 충분해요", "If you have time to post a Story, you have time for this", "ストーリーを上げる時間があればこれもできる", "有时间发Story就有时间做这个", "", "", "", ""],
            ["오늘 안 하면 내일의 내가 욕해요", "Skip today and tomorrow-you will curse you", "今日やらないと明日の自分に怒られる", "今天不做，明天的自己会骂你", "", "", "", ""],
            ["루틴이 곧 럭셔리예요 💅", "Routine IS luxury 💅", "ルーティンこそラグジュアリー 💅", "自律就是奢侈 💅", "", "", "", ""],
            ["'나중에'는 안 온다는 거 알잖아요", "You know 'later' never actually comes, right?", "「あとで」は来ないって知ってるでしょ", "你知道「以后」永远不会来的吧", "", "", "", ""],
            ["이 챌린지 클리어하면 경험치 +1 인생", "Clear this challenge: +1 XP in life", "このチャレンジクリアで人生経験値+1", "通关这个挑战，人生经验值+1", "", "", "", ""],
            ["물이 되어라, 친구여.", "Be water, my friend.", "水になれ、友よ。", "像水一样，我的朋友。", "브루스 리 (이소룡)", "Bruce Lee", "ブルース・リー", "李小龙"],
            ["동경하는 건 그만둡시다.", "Let's stop admiring them.", "憧れるのをやめましょう。", "别再仰望他们了。", "오타니 쇼헤이", "Shohei Ohtani", "大谷翔平", "大谷翔平"],
            ["적게 사고, 잘 고르고, 오래 쓰세요.", "Buy less, choose well, make it last.", "買う量を減らし、よく選び、長く使いましょう。", "少买，选好，用久一点。", "비비안 웨스트우드", "Vivienne Westwood", "ヴィヴィアン・ウエストウッド", "薇薇安·韦斯特伍德"],
            ["당신의 이름은 무엇인가요? 당신 자신을 말하세요.", "What is your name? Speak yourself.", "あなたの名前は何ですか。自分自身を語ってください。", "你叫什么名字？说出你自己。", "RM (김남준)", "RM (Kim Nam-joon)", "RM（キム・ナムジュン）", "RM（金南俊）"],
            ["옛사람의 자취를 좇지 말고, 옛사람이 구하던 바를 구하라.", "Do not follow in the footsteps of the old masters; seek what they sought.", "古人の跡を求めず、古人の求めたる所を求めよ。", "不要追寻古人的足迹，要追寻古人所追寻的东西。", "마쓰오 바쇼", "Matsuo Bashō", "松尾芭蕉", "松尾芭蕉"],
            ["세 사람이 길을 가면, 그중에 반드시 나의 스승이 있다.", "When three walk together, one of them is surely my teacher.", "三人で行けば、必ず我が師がいる。", "三人行，必有我师焉。", "공자", "Confucius", "孔子", "孔子"],
            ["천 리 길도 발밑에서 시작된다.", "A journey of a thousand miles begins beneath one's feet.", "千里の道も足下から始まる。", "千里之行，始于足下。", "노자", "Laozi", "老子", "老子"],
            ["조금 엉망일 거예요. 그 엉망을 껴안으세요.", "It will be a little messy, but embrace the mess.", "少し散らかるでしょう。その散らかりごと抱きしめてください。", "会有点乱，但请拥抱这份混乱。", "노라 에프런", "Nora Ephron", "ノーラ・エフロン", "诺拉·艾芙隆"],
            ["미디어가 곧 메시지다.", "The medium is the message.", "メディアはメッセージである。", "媒介即讯息。", "마셜 매클루언", "Marshall McLuhan", "マーシャル・マクルーハン", "马歇尔·麦克卢汉"],
            ["본래 땅 위에 길은 없었다. 걷는 사람이 많아지면 그것이 곧 길이 된다.", "There was no road; where many walk, a road appears.", "もともと地上に道はない。歩く人が多くなれば、それが道になる。", "其实地上本没有路，走的人多了，也便成了路。", "루쉰", "Lu Xun", "魯迅", "鲁迅"],
            ["사진을 모으는 일은 곧 세계를 모으는 일이다.", "To collect photographs is to collect the world.", "写真を集めることは、世界を集めることだ。", "收集照片，就是收集世界。", "수전 손택", "Susan Sontag", "スーザン・ソンタグ", "苏珊·桑塔格"],
            ["유행은 지나가도, 해본 사람은 남아요.", "Trends pass. The person who tried stays.", "流行は過ぎても、やってみた自分は残ります。", "潮流会过去，但试过的自己会留下。", "", "", "", ""],
            ["남들 다 한다는 그거, 오늘은 나도 한번 해봐요.", "That thing everyone's doing? Let's try it today.", "みんながやってるあれ、今日は自分もやってみましょう。", "大家都在玩的那件事，今天你也试一次吧。", "", "", "", ""],
            ["재미없으면 그만둬도 돼요. 해봤다는 건 남으니까요.", "If it's no fun, you can stop. Having tried it still counts.", "つまらなければやめてもいいんです。やってみた事実は残ります。", "不好玩就可以停下。试过这件事，依然算数。", "", "", "", ""],
            ["완벽한 각도보다, 일단 눌러본 셔터가 이겨요.", "The shutter you actually pressed beats the perfect angle.", "完璧な角度より、とりあえず押したシャッターの勝ちです。", "比起完美的角度，先按下的快门更胜一筹。", "", "", "", ""],
            ["따라 해도 괜찮아요. 하다 보면 내 방식이 섞이니까요.", "Copying is fine. Your own way mixes in as you go.", "真似でも大丈夫。続けるうちに自分らしさが混ざります。", "模仿也没关系。做着做着，你的方式就掺进来了。", "", "", "", ""],
            ["오늘의 유행은 내일이면 촌스러워져요. 그래서 오늘인 거예요.", "Today's trend looks dated tomorrow. That's exactly why today.", "今日の流行は明日にはダサくなります。だから今日なんです。", "今天的潮流，明天就过时了。所以就趁今天。", "", "", "", ""],
        ],
    ]

    /// 인용 본문에서 현재 언어를 고른다.
    static func text(_ q: [String], lang: String) -> String {
        guard q.count >= 4 else { return "" }
        switch lang {
        case "en": return q[1]
        case "ja": return q[2]
        case "zh": return q[3]
        default:   return q[0]
        }
    }

    /// 저자명. 앱 오리지널 문구는 nil 을 돌려주므로 호출부에서 아무것도 그리지 않는다.
    static func author(_ q: [String], lang: String) -> String? {
        guard q.count >= 8 else { return nil }
        let name: String
        switch lang {
        case "en": name = q[5]
        case "ja": name = q[6]
        case "zh": name = q[7]
        default:   name = q[4]
        }
        return name.isEmpty ? nil : name
    }

    /// 카드 ID 를 해시하여 카테고리 풀에서 결정적으로 인용을 선택.
    /// 같은 카드를 열면 항상 같은 인용이 표시된다.
    private static func simpleHash(_ str: String) -> Int {
        var hash: Int32 = 0
        for ch in str.unicodeScalars {
            hash = (hash << 5) &- hash &+ Int32(truncatingIfNeeded: Int(ch.value))
        }
        return abs(Int(hash))
    }

    static func quote(for card: ChallengeCard, lang: String) -> String {
        let p = pool[card.category.rawValue] ?? []
        guard !p.isEmpty else { return "" }
        return text(p[simpleHash(card.id) % p.count], lang: lang)
    }
}
