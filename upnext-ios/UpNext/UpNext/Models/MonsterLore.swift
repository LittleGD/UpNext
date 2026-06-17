//
//  MonsterLore.swift
//  UpNext — 몬스터 도감 lore(설명) 데이터.
//
//  웹 src/i18n/*.ts 의 `uphero.monster.<id>.lore` 한국어 항목을 그대로 옮김.
//  웹도 미존재 언어는 한국어로 fallback 하므로(upHeroI18n.monsterLore), iOS 도
//  한국어 단일 소스로 충실. 자동 생성 — 원본은 ko.ts.
//

enum MonsterLore {
    static func lore(for templateId: String) -> String? { table[templateId] }

    static let table: [String: String] = [
        "fit_wolf": "산악의 험준한 길을 순찰하는 회색 사냥꾼. 달이 뜨면 무리가 불어난다.",
        "fit_bear": "겨울잠을 건너온 돌산의 왕. 한 걸음에 길이 갈라진다.",
        "fit_goblin": "절벽 사이 좁은 길목에 돌을 쌓아 덫을 놓는 교활한 놈.",
        "fit_golem": "오래된 봉우리의 파편이 모여 스스로 걷기 시작한 존재.",
        "fit_eagle": "깃털이 녹슨 쇠처럼 단단한 맹금. 급강하 한 번에 말고삐가 끊긴다.",
        "boss_mountain_wolf": "수십 마리 무리를 이끄는 은빛 대공. 눈동자엔 수백 겨울의 기억이 있다.",
        "boss_stone_golem": "신전 입구를 천 년 동안 지켜온 고대 조각상. 말이 없지만 노여움은 뜨겁다.",
        "boss_mountain_giant": "능선 그 자체가 걷는다고 전해지는 전설. 비가 올 때만 모습을 드러낸다.",
        "lrn_book": "읽어주지 않으면 분노하는 이름 모를 책. 표지가 이를 드러낸다.",
        "lrn_scroll": "수백 년 잉크 속에 갇힌 영혼. 만지면 종이처럼 바스라진다.",
        "lrn_inkblot": "누군가 쏟은 잉크가 뭉쳐 걸어다닌다. 닿으면 이름이 지워진다.",
        "lrn_scholar": "끝내지 못한 논문에 집착해 도서관을 떠도는 망령.",
        "lrn_riddle": "답하지 못하는 질문만 던지는 투명한 인형.",
        "boss_book_spirit": "누구도 읽지 않는 책의 저자. 자신의 이름을 되찾기 위해 싸운다.",
        "boss_ancient_scholar": "모든 것을 알고 싶었던 자. 이제는 아무것도 기억하지 못한다.",
        "boss_lich_of_ignorance": "질문을 거부한 자에게 내려지는 저주의 화신.",
        "mnd_wisp": "등잔 뒤에서 흔들리는 그림자. 돌아보면 이미 다른 곳에 있다.",
        "mnd_sprite": "고요한 호숫가에 잠깐 머물다 사라지는 빛. 잡으려 하면 꺼진다.",
        "mnd_echo": "과거의 후회가 소리로 응집된 것. 제 목소리를 들으면 상처가 된다.",
        "mnd_distraction": "천 개의 꼬리를 가진 작은 악마. 시선을 빼앗아 길을 잃게 한다.",
        "mnd_doubt": "결심을 갉아먹는 안개 같은 존재.",
        "boss_shadow_wisp": "자신의 가장 깊은 곳에서 올라오는 반사. 이기려 할수록 커진다.",
        "boss_silent_monk": "천 년 동안 한 마디도 않은 수행자. 그 침묵만으로 상처가 된다.",
        "boss_distraction_demon": "수만 개의 유혹을 동시에 내거는 암흑 군주.",
        "ntr_sprout": "뽑히지 않기 위해 이빨을 만든 어린 풀.",
        "ntr_corn": "밭의 끝에서 걸어 나온 낟알의 거인. 껍질 아래 노란 분노가 숨어 있다.",
        "ntr_pumpkin": "수확을 잊은 밭에서 자라난 괴물. 안쪽에서 벌레가 운다.",
        "ntr_pepper": "잎맥이 붉게 타오르는 매운 복수자.",
        "ntr_broccoli": "초록 투구를 쓴 야채 기사. 명예 외엔 아무것도 먹지 않는다.",
        "boss_grain_sprite": "모든 수확의 어머니. 배고픈 자를 시험한다.",
        "boss_giant_vegetable": "수십 년 묵은 뿌리가 하나로 합쳐진 존재.",
        "boss_gluttony_titan": "절제를 잊은 자에게 나타나 끝없이 먹이는 저주.",
        "soc_thief": "그림자 사이로 사라지는 빠른 손. 지갑만큼 이야기도 훔친다.",
        "soc_clown": "웃음을 파는 방랑자. 그 웃음 뒤에 무엇이 있는지 아무도 모른다.",
        "soc_gossip": "말 한마디로 도시를 뒤흔드는 속삭임. 퍼지면 막을 수 없다.",
        "soc_swindler": "진실처럼 들리는 거짓을 파는 장사치. 도망갈 뒷문을 항상 준비한다.",
        "soc_outcast": "마을에서 쫓겨난 자의 잔영. 이제는 누구의 이름도 부르지 않는다.",
        "boss_street_thief": "도시의 모든 그림자를 거느리는 왕. 그가 사라질 때 밤이 온다.",
        "boss_jester": "거꾸로 뒤집힌 웃음. 그가 박수칠 때 누군가는 울고 있다.",
        "boss_loneliness_phantom": "홀로 있는 자에게만 보이는 그림자. 말을 걸면 이미 늦었다.",
        "prd_gear": "거대한 기계에서 떨어져 나온 한 조각. 여전히 헛돌고 있다.",
        "prd_clockbot": "정시를 지키기 위해 설계된 자동인형. 시간이 틀어지면 미쳐간다.",
        "prd_timesink": "눈치채지 못하는 사이 하루를 삼키는 작은 악마.",
        "prd_drone": "명령이 끝난 지 오래인데 아직도 순찰을 도는 녹슨 기사.",
        "prd_pendulum": "멈추지 않는 진자. 이 소리를 들으면 시간이 느려진다.",
        "boss_clockwork_drone": "대시계의 심장. 그의 박자를 놓치면 세상이 잠시 멈춘다.",
        "boss_time_thief": "타인의 하루를 훔쳐 자신의 영생을 짜는 악당.",
        "boss_procrastination_lord": "내일을 연기하는 주문을 가진 시간의 파괴자.",
        "wel_mist": "새벽 호수 위를 떠도는 흰 실. 지나간 자리엔 쓸쓸함만 남는다.",
        "wel_slime": "온천 바닥에 고인 증기가 덩어리로 굳은 것.",
        "wel_naiad": "따뜻한 물을 지키는 물의 요정. 함부로 들어오면 불같이 덥힌다.",
        "wel_lotus": "흰 꽃잎 뒤에 독을 품은 아름다운 덫.",
        "wel_cold": "온기가 사라진 자리에 몰려드는 투명한 손.",
        "boss_mist_spirit": "대산의 안개가 한곳에 응집된 존재. 길 잃은 자를 영원히 붙든다.",
        "boss_river_naiad": "온천 전체를 지배하는 물의 여왕. 그녀의 한숨이 수증기를 만든다.",
        "boss_lethargy_fog": "움직일 의욕을 앗아가는 회색 구름. 빠지면 돌아오지 못한다.",
        "trd_mini": "누군가의 화면에서 튀어나온 단일 점. 이름이 계속 바뀐다.",
        "trd_meme": "수천 번 복제되며 본래 모습을 잃은 이미지.",
        "trd_glitch": "세계의 틈에서 깜빡이는 오류. 만지면 기억도 깜빡인다.",
        "trd_holo": "더 이상 송출되지 않는 채널의 마지막 장면.",
        "trd_viral": "접촉한 모든 것에 이름을 새기는 전염성 구슬.",
        "boss_mutant_minor": "어떤 유행이든 몇 초 만에 따라 하는 모사꾼.",
        "boss_mutant_mid": "잊혀진 트렌드들의 시체가 엉겨 붙은 덩어리.",
        "boss_trend_chameleon": "세상의 모든 유행을 삼킨 최종 변종. 누구의 얼굴도 자신의 것이 아니다.",
    ]
}
