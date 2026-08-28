//
//  AuraReadingView.swift
//  UpNext — 오늘의 기운 3종 리딩(재물·관계·건강) 선택 → 문지르기 의식 → 리딩.
//
//  웹 web-aura 와 같은 흐름:
//   1) 폴라로이드를 본 뒤 세 기운 중 하나를 고른다.
//   2) **첫 번째는 이미 광고를 봤으니 무료**, 나머지 둘은 각각 광고를 봐야 열린다.
//      이미 연 기운은 광고 없이 다시 볼 수 있다(하루 안에서 값도 불변 — AuraStore 스냅샷).
//   3) 리딩은 처음 열 때 **문질러서** 드러낸다. 토스 복권 같은 의식이 "진짜 점을 본다"는
//      감각을 만든다. 재열람은 의식 없이 바로 보여준다 — 같은 의식을 반복시키면 절차가 된다.
//
//  접근성: accessibilityReduceMotion 이거나 VoiceOver 로 접근하면 **탭 1회**로 대체한다.
//  문지르기를 강제하면 운동 장애가 있는 유저가 기능 자체를 못 쓴다. 대체 경로는 필수다.
//
//  톤: **수치를 화면에 인용하지 않는다.** "최근 14일 중 9일…" 같은 문장은 점집을
//  대시보드로 만든다. 점수는 등급(대길·길·평·잔잔)으로만 드러나고, 근거는 조짐(omen)
//  문장 하나로 고른다. 막대·게이지·퍼센트는 한 개도 그리지 않는다 — 숫자를 보여주면
//  유저가 역산하려 들고 그 순간 점집이 성적표가 된다. 낮은 등급에도 꾸짖는 문구는 없다.
//

import SwiftUI

// MARK: - 문구 (카탈로그에 이미 있는 리터럴만 사용)

/// 기운 문구 모음. 모두 Localizable.xcstrings 에 있는 한국어 키를 그대로 쓴다
/// (Text 리터럴 → LocalizedStringKey → 인앱 언어 테이블).
enum AuraCopy {

    static func name(_ kind: AuraKind) -> Text {
        switch kind {
        case .wealth: return Text("재물기운")
        case .relationship: return Text("관계기운")
        case .health: return Text("건강기운")
        }
    }

    static func tier(_ tier: AuraTier) -> Text {
        switch tier {
        case .great: return Text("대길")
        case .good: return Text("길")
        case .fair: return Text("평")
        case .care: return Text("잔잔")
        }
    }

    /// 조짐 — 파라미터가 없는 리터럴 한 줄. 실측 수치는 여기까지 오지 않는다.
    /// 웹 `aura.omen.*` 와 같은 문장이며, 보간이 없어 번역이 어순에 자유롭다.
    /// 조짐 문장 — 같은 조짐 안에서도 reading.variant 로 표현이 갈린다.
    static func omen(_ reading: AuraReading) -> Text {
        let table: [AuraOmen: [Text]] = [
            .closing: [
            Text("끝맺음의 기운이 붙어 있어요. 시작한 것이 마무리로 이어집니다"),
            Text("매듭이 잘 지어지는 결이에요"),
            Text("벌여둔 것들이 제자리를 찾아가는 때예요"),
        ],
            .gathering: [
            Text("힘이 한 방향으로 모이고 있어요"),
            Text("흩어져 있던 것이 한 곳으로 당겨집니다"),
            Text("초점이 좁아지는 시기예요. 깊어지기 좋습니다"),
        ],
            .rhythm: [
            Text("리듬이 몸에 배어 있는 시기예요"),
            Text("애쓰지 않아도 박자가 맞아떨어져요"),
            Text("반복이 당신 편에 서 있어요"),
        ],
            .carried: [
            Text("이어온 시간이 지금의 당신을 받치고 있어요"),
            Text("지나온 날들이 발밑에 깔려 있어요"),
            Text("쌓아둔 것이 조용히 일하고 있어요"),
        ],
            .resting: [
            Text("쉼이 다음을 준비하고 있어요"),
            Text("비워둔 자리에 힘이 고이는 중이에요"),
            Text("멈춘 것이 아니라 물러나 있는 거예요"),
        ],
            .unformed: [
            Text("아직 흐름이 잡히기 전이에요. 지금이 그 시작점입니다"),
            Text("백지에 가까운 날이에요. 무엇을 그려도 됩니다"),
            Text("결이 정해지지 않았어요. 오늘의 선택이 결을 만듭니다"),
        ],
        ]
        guard let variants = table[reading.omen], !variants.isEmpty else { return Text("") }
        return variants[min(max(reading.variant, 0), variants.count - 1)]
    }

    /// 조언 — 낮은 점수에도 "지금부터 할 수 있다" 로만 쓴다.
    /// 조언 문장 — 기운·등급에 표현 번호를 더해 고른다.
    static func advice(_ reading: AuraReading) -> Text {
        let table: [String: [Text]] = [
            "wealth.great": [
            Text("미뤄둔 일 하나를 오늘 끝내기 좋은 흐름이에요"),
            Text("가장 무거운 것부터 손대도 되는 날이에요"),
            Text("벌여둔 것을 하나 접어보세요"),
        ],
            "wealth.good": [
            Text("작은 것 하나를 마무리하면 흐름이 더 단단해져요"),
            Text("오늘 한 칸만 더 나아가 보세요"),
            Text("어제 멈춘 자리에서 이어가면 됩니다"),
        ],
            "wealth.fair": [
            Text("가장 작은 일부터 치워보세요"),
            Text("책상 위 하나만 정리해도 충분해요"),
            Text("오늘은 완성보다 착수가 중요해요"),
        ],
            "wealth.care": [
            Text("오늘은 시작만 해도 충분해요"),
            Text("아무것도 못 해도 내일이 사라지지 않아요"),
            Text("한 줄만 적어두고 덮어도 좋아요"),
        ],
            "relationship.great": [
            Text("먼저 연락하기 좋은 날이에요"),
            Text("오래 미룬 안부를 꺼내도 좋아요"),
            Text("당신이 여는 쪽이 되면 잘 풀려요"),
        ],
            "relationship.good": [
            Text("안부 한 줄이 오늘을 바꿔요"),
            Text("고맙다는 말을 아끼지 마세요"),
            Text("짧게라도 답을 보내두면 좋아요"),
        ],
            "relationship.fair": [
            Text("오늘은 듣는 쪽이 되어보세요"),
            Text("설명하기보다 물어보는 게 나아요"),
            Text("말을 줄이면 오해도 줄어요"),
        ],
            "relationship.care": [
            Text("혼자 있는 시간도 관계의 일부예요"),
            Text("답하지 않아도 되는 날이 있어요"),
            Text("멀어진 게 아니라 쉬는 중이에요"),
        ],
            "health.great": [
            Text("몸이 잘 따라오는 날이에요"),
            Text("평소보다 한 걸음 더 가도 괜찮아요"),
            Text("숨이 깊어지는 걸 느껴보세요"),
        ],
            "health.good": [
            Text("물 한 잔과 가벼운 스트레칭으로 이어가세요"),
            Text("어깨를 한 번 내려보세요"),
            Text("오늘은 조금 일찍 눕는 걸 목표로"),
        ],
            "health.fair": [
            Text("무리하지 말고 가볍게 시작하세요"),
            Text("절반만 해도 오늘은 성공이에요"),
            Text("몸이 보내는 신호를 먼저 들으세요"),
        ],
            "health.care": [
            Text("오늘은 쉬는 게 최선일 수 있어요"),
            Text("눕는 것도 오늘의 할 일이에요"),
            Text("회복은 아무것도 안 할 때 일어나요"),
        ],
        ]
        let key = "\(reading.kind.rawValue).\(reading.tier.rawValue)"
        guard let variants = table[key], !variants.isEmpty else { return Text("") }
        return variants[min(max(reading.variant, 0), variants.count - 1)]
    }
}

// MARK: - 종이 팔레트 (폴라로이드와 같은 인화지 톤)

enum AuraPaper {
    static let paper = Color(red: 0.949, green: 0.945, blue: 0.933)      // #f2f1ee
    static let inkStrong = Color(red: 0.165, green: 0.165, blue: 0.157)  // #2a2a28
    static let inkSoft = Color(red: 0.420, green: 0.420, blue: 0.400)    // #6b6b66
    static let inkFaint = Color(red: 0.604, green: 0.604, blue: 0.580)   // #9a9a94
}

// MARK: - 기운 고르기 패널

/// 폴라로이드 아래에 붙는 3종 선택.
///
/// 첫 칸은 무료(폴라로이드 광고값)고, 그 뒤 칸은 광고를 봐야 열린다. 잠금은 **자물쇠
/// 아이콘 하나로만** 말한다 — 칸마다 광고 문구를 박아 두면 세 칸이 광고 진열대로 읽히고,
/// 옵트인이라는 사실보다 "광고를 봐라"는 인상이 앞선다. 광고는 눌러야만 뜬다는 계약은
/// 그대로다(누르기 전에는 아무것도 재생되지 않는다).
///
/// 세 칸의 높이는 항상 같다. 언어에 따라 기운 이름이 두 줄로 접히면 칸 하나만 키가
/// 커져 줄이 어긋나는데, 나란한 선택지에서 크기 차이는 곧 위계로 읽힌다.
@MainActor
struct AuraPickPanel: View {
    let state: AuraState
    /// 광고 대기 중인 기운 (스피너 표시)
    let loading: AuraKind?
    let onPick: (AuraKind) -> Void


    private static let pickTitle: LocalizedStringKey = "이루고 싶은 것을 생각하며 궁금한 기운을 확인해보세요"
    private static let doneTitle: LocalizedStringKey = "오늘의 기운을 모두 확인했어요"

    var body: some View {
        VStack(spacing: 12) {
            // 웹 AuraSection 과 같은 계약 — 한 줄이 상태에 따라 갈린다(aura.done / aura.pick.title).
            // 두 줄을 겹쳐 쓰면 다 본 뒤에도 고르라는 말이 남아 안내가 서로 부딪힌다.
            // LocalizedStringKey 로 못 박는다. 삼항의 결과를 그냥 넘기면 Text(String)
            // 오버로드가 잡혀 카탈로그를 타지 않고 한국어가 그대로 나간다.
            Text(state.allOpened ? Self.doneTitle : Self.pickTitle)
                .typography(.caption)
                .foregroundStyle(state.allOpened ? Color.textTertiary : Color.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // .top 정렬 + 칸의 maxHeight: .infinity — 가장 큰 칸이 줄 높이를 정하고
            // 나머지 둘이 거기에 맞춰 늘어난다.
            HStack(alignment: .top, spacing: 10) {
                ForEach(AuraKind.allCases, id: \.self) { kind in
                    chip(kind)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func chip(_ kind: AuraKind) -> some View {
        let opened = state.opened.contains(kind)
        // 첫 리딩은 이미 폴라로이드 광고를 봤으니 무료. 그 다음부터는 잠긴다.
        let locked = !opened && !state.opened.isEmpty
        let busy = loading == kind
        // 열림=체크, 잠김=자물쇠, 지금 열 수 있음=반짝임. 문구 없이 아이콘 하나로 상태가 갈린다.
        let icon: PixelIconName = opened ? .check : (locked ? .lock : .sparkle)

        return Button {
            onPick(kind)
        } label: {
            VStack(spacing: 6) {
                if busy {
                    ProgressView()
                        .tint(Color.textTertiary)
                        .scaleEffect(0.7)
                        .frame(height: 16)
                } else {
                    PixelIcon(icon, size: 16,
                              color: (opened || locked) ? Color.textTertiary : Color.accentPrimary)
                        .frame(height: 16)
                }
                AuraCopy.name(kind)
                    .typography(.caption)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 6)
            // 세 칸을 같은 높이로 — 줄에서 가장 큰 칸이 기준이 된다.
            .frame(maxWidth: .infinity, minHeight: CardHeights.auraPickChip, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(UNPressStyle())
        .background(Color.bgSurface.opacity(0.92), in: RoundedRectangle(cornerRadius: 12))
        .opacity(opened ? 0.72 : 1)
        .disabled(loading != nil)
    }
}

// MARK: - 리딩 오버레이 (의식 → 리딩)

/// 기운 한 종의 리딩. 처음 여는 것이면 문지르기 의식을 먼저 통과해야 한다.
@MainActor
struct AuraReadingOverlay: View {
    let reading: AuraReading
    /// 오늘의 색 — 폴라로이드와 같은 액센트라 두 화면이 한 벌로 읽힌다.
    let accent: Color
    /// 처음 여는 리딩인지 (재열람은 의식을 반복하지 않는다)
    let needsRitual: Bool
    let allOpened: Bool
    /// 기운 고르기로 돌아가기
    let onBack: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var revealed = false
    /// 공개 후 본문이 떠오르는 단계 — 의식 직후 한 틱 뒤에 켠다.
    @State private var settled = false

    var body: some View {
        ZStack {
            Color.backdropImmersive
                .ignoresSafeArea()
                // 뒤(폴라로이드)의 탭 제스처가 새어 나가지 않게 막는다.
                .contentShape(Rectangle())
                .onTapGesture { }

            VStack(spacing: 18) {
                card
                    .overlay {
                        if !revealed {
                            AuraRitualCover(accent: accent, onReveal: reveal)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .shadow(color: .black.opacity(0.45), radius: 24, y: 10)

                if revealed {
                    VStack(spacing: 8) {
                        if allOpened {
                            Text("오늘의 기운을 모두 확인했어요")
                                .typography(.micro)
                                .foregroundStyle(Color.textTertiary)
                        }
                        Button { onBack() } label: {
                            Text("다른 기운 보기")
                                .typography(.caption)
                                .foregroundStyle(Color.textSecondary)
                                .padding(.vertical, 10)
                                .padding(.horizontal, 18)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(UNPressStyle())
                    }
                    .opacity(settled ? 1 : 0)
                }
            }
            .padding(.horizontal, 28)
        }
        .onAppear {
            guard !needsRitual else { return }
            // 재열람은 의식 없이 바로. 같은 틱에서 두 상태를 함께 켜면 애니메이션이
            // 병합돼 사라지므로 본문 등장은 다음 틱으로 넘긴다.
            revealed = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                withAnimation(.easeOut(duration: 0.28)) { settled = true }
            }
        }
    }

    /// 의식 통과 — 덮개가 걷힌 뒤 본문이 떠오른다.
    private func reveal() {
        SoundPlayer.shared.play(.polaroidSlide)
        Haptics.play(.medium)
        withAnimation(.easeOut(duration: reduceMotion ? 0.01 : 0.32)) { revealed = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
            withAnimation(.easeOut(duration: 0.34)) { settled = true }
        }
    }

    // MARK: 리딩 카드 (인화지)

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 기운 이름은 머리말이다. 오늘의 답은 그 아래 등급 한 단어.
            AuraCopy.name(reading.kind)
                .typography(.caption)
                .foregroundStyle(AuraPaper.inkSoft)

            // 주인공. 점수를 그리지 않으므로 이 한 단어가 리딩의 전부를 말한다.
            AuraCopy.tier(reading.tier)
                .typography(.display)
                .foregroundStyle(AuraPaper.inkStrong)
                .padding(.top, 2)

            // 인화지에 그은 괘선 한 줄. 테두리가 아니라 종이의 결이다.
            Rectangle()
                .fill(AuraPaper.inkFaint.opacity(0.3))
                .frame(height: 1)
                .padding(.vertical, 16)

            AuraCopy.omen(reading)
                .typography(.caption)
                .foregroundStyle(AuraPaper.inkSoft)
                .fixedSize(horizontal: false, vertical: true)

            AuraCopy.advice(reading)
                .typography(.body)
                .foregroundStyle(AuraPaper.inkStrong)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(paperGround)
        // 의식을 통과하기 전에는 VoiceOver 에도 내용이 새지 않게 한다
        // (대체 경로는 덮개의 accessibilityAction 이 담당한다).
        .accessibilityHidden(!revealed)
    }

    /// 인화지 바탕 + 위쪽에 스민 오늘의 색. 폴라로이드와 같은 액센트를 옅게 흘려
    /// 두 화면이 한 벌로 읽힌다. 채워진 결일 뿐 눈금이 아니다 — 읽어낼 수치가 없다.
    private var paperGround: some View {
        ZStack(alignment: .top) {
            AuraPaper.paper
            LinearGradient(colors: [accent.opacity(0.22), accent.opacity(0)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 110)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - 문지르기 의식

/// 리딩 위를 덮은 인화 코팅. 손가락이 지나간 격자 칸(7×5)을 기록해
/// 45% 를 넘으면 나머지가 한꺼번에 걷힌다.
///
/// 접근성: reduceMotion 이면 문지르기 제스처를 **아예 달지 않고 탭 1회**로 걷는다.
/// 둘을 함께 달면 minimumDistance 0 인 드래그가 터치다운을 먼저 채가 탭이 인식되지
/// 않는다 — 대체 경로가 있는 척만 하는 상태가 되므로 분기 자체를 나눈다.
/// VoiceOver 는 언제나 accessibilityAction(기본 활성화 제스처)으로 같은 경로를 탄다.
@MainActor
struct AuraRitualCover: View {
    let accent: Color
    let onReveal: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let cols = 7
    private static let rows = 5
    /// 공개 임계치 — 너무 높으면 노동이 되고, 너무 낮으면 의식이 되지 않는다.
    private static let threshold: Double = 0.45

    @State private var visited: Set<Int> = []
    @State private var finished = false

    private var progress: Double {
        Double(visited.count) / Double(Self.cols * Self.rows)
    }

    var body: some View {
        GeometryReader { geo in
            let cellW: CGFloat = geo.size.width / CGFloat(Self.cols)
            let cellH: CGFloat = geo.size.height / CGFloat(Self.rows)

            ZStack {
                // 코팅 — 인화지 위에 덮인 은박. 지나간 칸부터 벗겨진다.
                ForEach(0..<(Self.cols * Self.rows), id: \.self) { index in
                    let col = index % Self.cols
                    let row = index / Self.cols
                    Rectangle()
                        .fill(Self.coating)
                        .frame(width: cellW + 1, height: cellH + 1)
                        .position(x: (CGFloat(col) + 0.5) * cellW,
                                  y: (CGFloat(row) + 0.5) * cellH)
                        .opacity(visited.contains(index) ? 0 : 1)
                        .animation(.easeOut(duration: 0.22), value: visited)
                }

                // 남은 면적을 알리는 결 — 액센트가 코팅 위를 얇게 흐른다
                LinearGradient(colors: [accent.opacity(0.14), .clear, accent.opacity(0.10)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .allowsHitTesting(false)
                    .opacity(finished ? 0 : 1)

                VStack(spacing: 6) {
                    PixelIcon(.sparkle, size: 18, color: accent)
                    hint
                }
                .opacity(max(0, 1 - progress * 1.8))
                .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            // 접근성 대체 경로 — 문지르기를 못 하는 유저도 같은 결과에 닿아야 한다.
            .modifier(RevealInput(reduceMotion: reduceMotion,
                                  onTap: finish,
                                  onRub: { point in rub(point, cellW: cellW, cellH: cellH) }))
        }
        .accessibilityElement(children: .ignore)
        // VoiceOver 는 문지르기가 아니라 활성화 제스처로 연다 — 라벨도 그 동작을 말한다.
        .accessibilityLabel(Text("탭하여 공개"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { finish() }
    }

    /// 공개 입력. reduceMotion 여부로 **한쪽만** 단다.
    private struct RevealInput: ViewModifier {
        let reduceMotion: Bool
        let onTap: () -> Void
        let onRub: (CGPoint) -> Void

        func body(content: Content) -> some View {
            if reduceMotion {
                content.onTapGesture { onTap() }
            } else {
                content.gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in onRub(value.location) }
                )
            }
        }
    }

    /// 은박 코팅 — 필름 현상 전의 무광 회색.
    private static let coating = LinearGradient(
        colors: [Color(red: 0.20, green: 0.20, blue: 0.19),
                 Color(red: 0.28, green: 0.28, blue: 0.27),
                 Color(red: 0.17, green: 0.17, blue: 0.16)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    /// 안내 문구. reduceMotion 이면 실제로 되는 동작(탭)을 말한다 —
    /// 못 하는 동작을 안내하면 대체 경로가 있어도 못 찾는다.
    @ViewBuilder private var hint: some View {
        if progress >= 0.28 {
            Text("조금만 더")
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)
        } else if reduceMotion {
            Text("탭하여 공개")
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
        } else {
            Text("손가락으로 문질러 기운을 드러내세요")
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
        }
    }

    /// 손가락이 지나간 칸을 기록. 임계치를 넘으면 나머지가 한꺼번에 걷힌다.
    private func rub(_ point: CGPoint, cellW: CGFloat, cellH: CGFloat) {
        guard !finished, cellW > 0, cellH > 0 else { return }
        let col = Int(point.x / cellW)
        let row = Int(point.y / cellH)
        guard col >= 0, col < Self.cols, row >= 0, row < Self.rows else { return }
        let index = row * Self.cols + col
        guard !visited.contains(index) else { return }
        visited.insert(index)
        Haptics.play(.selection, intensity: 0.6)
        if progress >= Self.threshold { finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        // 남은 칸을 한꺼번에 걷는다. 상태를 켜는 틱과 공개 콜백 틱을 나눠야
        // 걷히는 애니메이션이 병합되지 않는다.
        withAnimation(.easeOut(duration: reduceMotion ? 0.01 : 0.30)) {
            visited = Set(0..<(Self.cols * Self.rows))
        }
        let delay: Double = reduceMotion ? 0.02 : 0.26
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { onReveal() }
    }
}

// MARK: - 입력 조립

enum AuraFlow {
    /// 스토어의 원시 신호를 알고리즘 입력으로. 지어낸 값은 하나도 넣지 않는다.
    /// salt 는 오늘의 기운과 같은 기기 고정값 — 하루치 흔들림 시드다(웹 `readFortuneState().salt`).
    @MainActor
    static func input(store: GameStore, today: String) -> AuraInput {
        AuraInput(
            history: store.progress?.completionHistory ?? [],
            checkInDates: store.retention?.checkInDates ?? [],
            usedSaverDates: store.retention?.usedSaverDates ?? [],
            streak: store.retention?.currentLightStreak ?? 0,
            // 웹은 memberIds 가 2명일 때만 성립으로 본다. 초대만 만들어 둔 1인 duo 를
            // 성립으로 세면 관계기운에 가중치 2가 그냥 붙어 양 플랫폼 등급이 갈린다.
            duoActive: (store.duo.activeDuo?.memberIds.count ?? 0) >= 2,
            today: today,
            salt: Fortune.salt
        )
    }
}
