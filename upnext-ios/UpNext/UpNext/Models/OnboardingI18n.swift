//
//  OnboardingI18n.swift
//  UpNext — 온보딩 4개국어 문자열 (웹 src/i18n/{ko,en,ja,zh}.ts 의 onboarding.* 1:1).
//
//  온보딩은 신규 유저가 언어를 고르는 첫 화면이라, 선택 언어(progress.language)로
//  즉시 전환돼야 한다. SwiftUI 자동 로컬라이즈(xcstrings)는 키 누락/문구 불일치 위험이
//  있어, 웹과 동일 문구를 명시 보유한 단일 출처로 둔다(StarterPack.localizedName 패턴).
//

import Foundation

enum OnboardingI18n {
    static func pick(_ l: Language, ko: String, en: String, ja: String, zh: String) -> String {
        switch l { case .ko: return ko; case .en: return en; case .ja: return ja; case .zh: return zh }
    }

    // 공통
    static func next(_ l: Language) -> String { pick(l, ko: "다음", en: "Next", ja: "次へ", zh: "下一步") }
    static func start(_ l: Language) -> String { pick(l, ko: "시작하기", en: "Get Started", ja: "はじめる", zh: "开始") }

    // 스플래시 태그라인 — SplashView 는 ContentView 의 `.environment(\.locale)` 밖(형제)이라
    // 카탈로그 `Text(LocalizedStringKey)` 로 두면 인앱 언어가 아닌 *기기 로케일*로 해석돼
    // (미지원 기기어는 개발 지역 ko 로 폴백) 앱 본문과 언어가 어긋난다(19-i18n-mixed).
    // 온보딩과 동일하게 인앱 언어(Language.current, 부트 시 App Group 선반영)로 명시 해석.
    // 문구는 카탈로그(Localizable.xcstrings)의 동일 키 번역과 1:1.
    static func splashTagline(_ l: Language) -> String {
        pick(l,
             ko: "로그라이크 챌린지 카드로\n매일 갓생을 시작하세요",
             en: "Start your go-getter life every day\nwith roguelike Challenge cards",
             ja: "ローグライクなチャレンジカードで\n毎日、理想の毎日を始めましょう",
             zh: "用 Roguelike 挑战卡牌\n每天开启你的充实生活")
    }
    static func levelShort(_ l: Language, _ lv: Int) -> String {
        pick(l, ko: "Lv.\(lv)", en: "Lv.\(lv)", ja: "Lv.\(lv)", zh: "Lv.\(lv)")
    }

    // 인트로 1 — 덱 구성
    static func desc1Title(_ l: Language) -> String { pick(l, ko: "매일 새로운 덱을", en: "Build a new deck", ja: "毎日新しいデッキを", zh: "每天组建新卡组") }
    static func desc1Accent(_ l: Language) -> String { pick(l, ko: "짜고 실천하세요", en: "every single day", ja: "組んで実践しよう", zh: "并付诸行动") }
    static func desc1Body(_ l: Language) -> String { pick(l, ko: "카드를 뽑고 오늘의 챌린지 덱을 구성해보세요!", en: "Draw cards and build your daily challenge deck!", ja: "カードを引いて今日のチャレンジデッキを作ろう!", zh: "抽取卡牌，组建今日挑战卡组吧！") }

    // 인트로 2 — 도전/레벨업
    static func desc2Title(_ l: Language) -> String { pick(l, ko: "당신의 갓생에", en: "Take on your", ja: "理想の毎日に", zh: "向充实生活") }
    static func desc2Accent(_ l: Language) -> String { pick(l, ko: "도전하세요", en: "best life challenge", ja: "チャレンジしよう", zh: "发起挑战") }
    static func desc2Body(_ l: Language) -> String { pick(l, ko: "모드를 선택해 난이도를 고르고, 완료하여 레벨업해보세요!", en: "Pick a difficulty, complete challenges, and level up!", ja: "モードを選んで難易度を決めて、クリアしてレベルアップ!", zh: "选择难度，完成挑战，提升等级！") }

    // 인트로 3 — 아지트 영웅 성장 + 불꽃(연속 기록)
    static func desc3Title(_ l: Language) -> String { pick(l, ko: "영웅을 키우고", en: "Grow your hero,", ja: "ヒーローを育て", zh: "培养你的勇者") }
    static func desc3Accent(_ l: Language) -> String { pick(l, ko: "불꽃을 이어가세요", en: "keep the flame alive", ja: "炎を燃やし続けよう", zh: "让火苗不灭") }
    static func desc3Body(_ l: Language) -> String { pick(l, ko: "아지트에서 영웅이 자라고, 매일 챌린지를 이어가면 불꽃이 더 크게 타올라요!", en: "Level up your hero in the Hideout, and keep your daily flame growing with every streak!", ja: "アジトでヒーローが成長し、毎日続けるほど炎が大きく燃え上がる!", zh: "在据点培养勇者，每日坚持挑战，火苗会越燃越旺！") }
    static func streakDays(_ l: Language, _ n: Int) -> String {
        pick(l, ko: "\(n)일 연속", en: "\(n)-day streak", ja: "\(n)日連続", zh: "连续\(n)天")
    }

    // 난이도
    static func diffHeading(_ l: Language) -> String { pick(l, ko: "난이도를 선택하세요", en: "Choose your difficulty", ja: "難易度を選んでください", zh: "选择难度") }
    static func diffSub(_ l: Language) -> String { pick(l, ko: "매일 선택할 챌린지 카드 수를 정해요", en: "Set how many challenge cards you pick each day", ja: "毎日選ぶチャレンジカードの枚数を決めます", zh: "决定每天要选择的挑战卡牌数量") }
    static func diffNormal(_ l: Language) -> String { pick(l, ko: "일반", en: "Normal", ja: "ノーマル", zh: "普通") }
    static func diffNormalDesc(_ l: Language) -> String { pick(l, ko: "가볍게 시작하고 싶다면", en: "Start light and easy", ja: "気軽に始めたいなら", zh: "轻松入门") }
    static func diffGodlife(_ l: Language) -> String { pick(l, ko: "갓생", en: "Go-getter", ja: "理想の毎日", zh: "充实") }
    static func diffGodlifeDesc(_ l: Language) -> String { pick(l, ko: "적당한 도전을 원한다면", en: "A balanced challenge", ja: "ほどよいチャレンジを求めるなら", zh: "适度挑战") }
    static func diffUltra(_ l: Language) -> String { pick(l, ko: "초갓생", en: "Ultra", ja: "ウルトラ", zh: "极限") }
    static func diffUltraDesc(_ l: Language) -> String { pick(l, ko: "하드코어 챌린저를 위해", en: "For hardcore challengers", ja: "ハードコアチャレンジャー向け", zh: "硬核挑战者专属") }
    static func cardsPerDay(_ l: Language, _ n: Int) -> String {
        pick(l, ko: "\(n)장/일", en: "\(n)/day", ja: "\(n)枚/日", zh: "\(n)张/日")
    }

    // 스타터 팩
    static func starterHeading(_ l: Language) -> String { pick(l, ko: "스타터 팩을 뽑아보세요", en: "Pick your Starter Pack", ja: "スターターパックを引こう", zh: "抽取你的新手卡包") }
    static func starterSub(_ l: Language) -> String { pick(l, ko: "뽑은 팩의 6장 카드로 챌린지를 시작해요", en: "Begin your journey with 6 challenge cards", ja: "引いたパックの6枚のカードでチャレンジ開始!", zh: "用抽到的6张卡牌开启挑战之旅") }
    static func starterReveal(_ l: Language) -> String { pick(l, ko: "6장의 챌린지 카드를 획득했어요!", en: "You got 6 challenge cards!", ja: "6枚のチャレンジカードを獲得しました!", zh: "获得了6张挑战卡牌！") }
    static func starterOpenPack(_ l: Language) -> String { pick(l, ko: "카드팩 열기", en: "Open Pack", ja: "カードパックを開く", zh: "开启卡包") }

    // 인트로 헤드라인(설명 강조형) — 인트로 점 3개 대체 헤더에는 미사용; 캐러셀이 desc1/2 사용.
}
