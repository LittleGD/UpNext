//
//  PixelIcon.swift
//  UpNext 디자인 시스템 — 픽셀아트 아이콘.
//
//  웹 src/components/icons/PixelIcon.tsx 대응. pixelarticons npm의 SVG를
//  Assets.xcassets/Icons/에 imageset(template rendering)으로 포팅.
//
//  웹은 string name 동적 로드 → Swift는 enum으로 타입 안전 + 오타 컴파일 차단.
//  사용: PixelIcon(.camera, size: 18, color: .accentPrimary)
//
//  Target: UpNext (App). Widget은 SF Symbols 사용 — 아이콘 에셋이 App 번들에만 있음.
//
//  ════════════════════════════════════════════════════════════════════════════
//  SF Symbol 화이트리스트 (R3 — PixelIcon 표준화)
//  ════════════════════════════════════════════════════════════════════════════
//
//  *PixelIcon 우선 사용*. SF Symbol 은 다음 경우만 허용:
//
//   - `apple.logo` — Apple SIWA 가이드 강제 (커스텀 글리프 불가). LoginView 전용.
//
//  그 외 모든 아이콘은 이 enum 의 케이스 + Assets.xcassets/Icons/ 자산 사용.
//  CI 검증: `scripts/fidelity/icon-audit.sh` 가 PR 마다 차단. 위반 1건이라도 fail.
//

import SwiftUI

/// 앱에서 사용하는 픽셀 아이콘 — Assets.xcassets/Icons/{rawValue}.imageset 와 1:1.
enum PixelIconName: String, CaseIterable {
    case archive        = "Archive"      // R3 마감 — 컬렉션 탭 (NAV_ICONS.collection)
    case arrowUp        = "ArrowUp"
    case bed            = "Bed"          // Phase 6-E — 숙면의 부적 (bed.svg)
    case bookOpen       = "BookOpen"     // R4 신규 — 카드 아이콘 (book-open.svg)
    case camera         = "Camera"
    case cancel         = "Cancel"
    case card           = "Card"
    case chart          = "Chart"        // R3 신규 — chart.svg
    case check          = "Check"
    case chevronDown    = "ChevronDown"
    case chevronLeft    = "ChevronLeft"
    case chevronRight   = "ChevronRight"
    case circle         = "Circle"       // R3 마감 — 설정 모드 라디오 (비선택)
    case circlePile     = "CirclePile"   // Phase 6-E — 선정의 염주 (circle-pile.svg)
    case clipboard      = "Clipboard"    // R3 마감 — productivity 카테고리 (CATEGORY_ICONS)
    case clock          = "Clock"        // R4 신규 — 카드 아이콘 (clock.svg)
    case coffee         = "Coffee"       // R4 신규 — 카드 아이콘 (coffee.svg)
    case coins          = "Coins"
    case cut            = "Cut"          // Phase 6-E — 효율의 도끼 (cut.svg)
    case diamondGem     = "DiamondGem"   // Phase 6-E — 장신구 슬롯 글리프 (diamond-gem.svg)
    case eye            = "Eye"          // R6 신규 — 미니게임 peek2 스킬 아이콘 (eye.svg, 웹 Eye 대체)
    case fire           = "Fire"
    case flag           = "Flag"
    case flame          = "Flame"        // pixelarticons에 flame 없음 → fire.svg 대체
    case gamepad        = "Gamepad"      // R3 신규 — gamepad.svg
    case gift           = "Gift"
    case globe          = "Globe"        // R4 신규 — 카드 아이콘 (globe.svg)
    case grid3x3        = "Grid3x3"      // Phase 6-E — 타임블록 부적 (grid-3x3.svg)
    case hand           = "Hand"         // Phase 6-E — 끈기의 완대 (hand.svg)
    case heart          = "Heart"
    case human          = "Human"        // R5 신규 — fitness 던전 아이콘 (human.svg)
    case image          = "Image"
    case infoBox        = "InfoBox"      // 05-modal-design — GbConfirm 정보 아이콘 (info-box.svg, danger=false)
    case languages      = "Languages"
    case leaf           = "Leaf"         // R3 마감 — nutrition 카테고리 (CATEGORY_ICONS)
    case lightbulb      = "Lightbulb"    // R4 신규 — 카드 아이콘 (lightbulb.svg)
    case link           = "Link"         // R3 마감 — 듀오 초대코드 만들기
    case lock           = "Lock"
    case mapPin         = "MapPin"       // R6 신규 — 미니게임 compass 스킬 아이콘 (map-pin.svg, 웹 MapPin 대체)
    case message        = "Message"      // R4 신규 — 카드 아이콘 (message.svg)
    case messageText    = "MessageText"  // R3 마감 — social 카테고리 (CATEGORY_ICONS)
    case monitor        = "Monitor"
    case moon           = "Moon"
    case moreHorizontal = "MoreHorizontal" // R3 신규 — more-horizontal.svg
    case music          = "Music"        // Phase 6-E — 대화의 류트 (music.svg)
    case note           = "Note"         // Phase 6-E — 책갈피의 부적 (note.svg)
    case penSquare      = "PenSquare"
    case pipette        = "Pipette"      // Phase 6-E — 절제의 수저 (pipette.svg)
    case potion         = "Potion"       // Phase 6-E — 향기의 부적 (potion.svg)
    case play           = "Play"
    case plus           = "Plus"
    case redo           = "Redo"
    case reload         = "Reload"
    case scale          = "Scale"        // Phase 6-E — 균형의 완대 (scale.svg). 에셋명은 ScaleBalance (아래 assetName)
    case search         = "Search"
    case send           = "Send"
    case shield         = "Shield"       // R5 신규 — 아지트 장비 CTA (shield.svg)
    case shirt          = "Shirt"        // Phase 6-E — 침묵의 로브 (shirt.svg)
    case shoppingBag    = "ShoppingBag"  // R5 신규 — 아지트 상점 CTA (shopping-bag.svg)
    case shuffle        = "Shuffle"      // Phase 6-E — 변화의 부적 (shuffle.svg)
    case smile          = "Smile"        // Phase 6-E — 미소의 반지 (smile.svg)
    case sparkle        = "Sparkle"
    case sparkles       = "Sparkles"     // Phase 6-E — 부적 슬롯 글리프 (sparkles.svg)
    case star           = "Star"         // pixelarticons에 star 없음 → sparkle.svg 대체
    case sunglasses     = "Sunglasses"   // Phase 6-E — 지혜의 안경 (sunglasses.svg)
    case sword          = "Sword"        // R4 신규 — 카드 아이콘 (sword.svg)
    case target         = "Target"
    case trash          = "Trash"        // pixelarticons에 trash 없음 → delete.svg 대체
    case treePine       = "TreePine"     // R3 마감 — 플레이 탭 (NAV_ICONS.playground)
    case trophy         = "Trophy"
    case undo           = "Undo"         // 사진 꾸미기 실행취소 (pixelarticons undo.svg)
    case user           = "User"
    case users          = "Users"        // R3 마감 — 듀오 2인 불꽃 (person.2 대체)
    case wall           = "Wall"         // Phase 6-E — 곡물의 갑옷 (wall.svg)
    case warningDiamond = "WarningDiamond"
    case wind           = "Wind"         // R3 마감 — mindfulness 카테고리 (CATEGORY_ICONS)
    case zap            = "Zap"

    /// 카드 데이터의 `icon` 문자열(웹 PixelIcon name)을 안전하게 케이스로 변환.
    /// 웹은 동적 string 로드 — iOS 는 enum 이므로 미지의 이름은 `.card` 로 폴백.
    /// 웹 CardDrawScreen / HandCard 의 `<PixelIcon name={card.icon} />` 동치.
    static func resolve(_ name: String) -> PixelIconName {
        PixelIconName(rawValue: name) ?? .card
    }

    /// Assets.xcassets/Icons 의 imageset 이름. rawValue 는 웹 iconName 과 같아야 하지만
    /// (`resolve` 가 카드/장비 데이터의 문자열을 그대로 받는다), 에셋 이름은 Xcode 가 생성하는
    /// 심볼(`UIImage.<lowerCamel>`)과 충돌하지 않아야 한다 — "Scale" 은 `UIImage.scale`
    /// (인스턴스 프로퍼티) 과 부딪혀 PolaroidFilters 가 컴파일되지 않았다.
    var assetName: String {
        switch self {
        case .scale: return "ScaleBalance"
        default:     return rawValue
        }
    }
}

/// 픽셀아트 아이콘 뷰. 템플릿 렌더링이라 color로 자유롭게 틴팅.
struct PixelIcon: View {
    let name: PixelIconName
    var size: CGFloat = 24
    var color: Color = .textPrimary

    init(_ name: PixelIconName, size: CGFloat = 24, color: Color = .textPrimary) {
        self.name = name
        self.size = size
        self.color = color
    }

    var body: some View {
        Image(name.assetName)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(color)
    }
}

#Preview {
    ScrollView {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 20) {
            ForEach(PixelIconName.allCases, id: \.self) { icon in
                VStack(spacing: 6) {
                    PixelIcon(icon, size: 28, color: .accentPrimary)
                    Text(icon.rawValue)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }
    .background(Color.bgPrimary)
}
