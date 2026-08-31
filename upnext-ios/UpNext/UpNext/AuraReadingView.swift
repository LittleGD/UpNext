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

    /// 등급의 **문자열** 판. 접근성 값처럼 다른 문장 안에 끼워 넣을 때만 쓴다.
    /// 화면에 그릴 때는 위의 `tier(_:)`(Text 판)를 쓴다 — Text 를 Text 리터럴 키 안에
    /// 보간할 수는 없고, 반대로 String 을 그냥 `Text(...)` 에 넘기면 Text(String)
    /// 오버로드가 잡혀 카탈로그를 타지 않는다.
    static func tierName(_ tier: AuraTier) -> String {
        switch tier {
        case .great: return AppConfig.loc("대길")
        case .good: return AppConfig.loc("길")
        case .fair: return AppConfig.loc("평")
        case .care: return AppConfig.loc("잔잔")
        }
    }

    /// 조짐 — 파라미터가 없는 리터럴 한 줄. 실측 수치는 여기까지 오지 않는다.
    /// 키는 기운별로 갈린다(웹 aura.omen.{kind}.{omen}.{variant}) — 같은 "모임"의
    /// 조짐도 재물과 관계에서 다른 문장으로 읽혀야 세 리딩이 복붙으로 안 보인다.
    /// 같은 조짐 안에서도 reading.variant 로 표현이 갈린다.
    static func omen(_ reading: AuraReading) -> Text {
        let table: [String: [Text]] = [
            "wealth.closing": [
            Text("매듭의 기운이 손끝에 와 있어요. 오래 끈 일이 오늘 끝을 허락합니다"),
            Text("벌여둔 장부가 정리되려는 결이에요. 셈이 맞아떨어지는 날"),
            Text("시작한 일이 마무리 쪽으로 기울어요. 끝낸 자리에 다음 것이 들어옵니다"),
        ],
            "wealth.gathering": [
            Text("흩어져 있던 몫이 한 곳으로 모이는 중이에요"),
            Text("일의 초점이 좁아지고 있어요. 하나에 깊게 들어가기 좋습니다"),
            Text("여기저기 걸쳐둔 힘이 당신 책상 위로 당겨지고 있어요"),
        ],
            "wealth.rhythm": [
            Text("손에 익은 박자가 일을 끌고 가는 시기예요"),
            Text("애쓰지 않아도 일머리가 돌아가는 결이에요"),
            Text("매일 반복해온 그 순서가 오늘의 밑천이 됩니다"),
        ],
            "wealth.carried": [
            Text("쌓아온 것이 이자처럼 조용히 붙고 있어요"),
            Text("지난날 해둔 일이 지금 값을 하는 중이에요"),
            Text("묵혀둔 공이 헛되지 않았어요. 발밑이 든든합니다"),
        ],
            "wealth.resting": [
            Text("곳간을 닫아두는 것도 재물의 일이에요. 지금은 지키는 때"),
            Text("멈춘 게 아니에요. 다음 일의 값을 매기는 중입니다"),
            Text("비워둔 손에 다음 몫이 들어올 자리가 생겼어요"),
        ],
            "wealth.unformed": [
            Text("아직 셈이 시작되기 전이에요. 첫 줄을 적는 사람이 판을 잡습니다"),
            Text("빈 장부 같은 날이에요. 무엇을 적어도 첫 기록이 됩니다"),
            Text("일의 결이 아직 무르네요. 오늘 만지는 대로 모양이 잡힙니다"),
        ],
            "relationship.closing": [
            Text("오래 걸려 있던 마음 하나가 매듭을 원하고 있어요"),
            Text("미뤄둔 대답이 제자리를 찾아가는 결이에요"),
            Text("어긋났던 사이가 정리 쪽으로 기울어요. 화해든 마침표든 가벼워집니다"),
        ],
            "relationship.gathering": [
            Text("흩어졌던 사람들이 당신 쪽으로 모이는 기운이에요"),
            Text("연락의 실들이 한 곳으로 당겨지고 있어요. 오늘 닿는 인연이 진합니다"),
            Text("곁의 온기가 한 사람에게로 좁혀지는 시기예요. 깊어지기 좋습니다"),
        ],
            "relationship.rhythm": [
            Text("주고받는 박자가 잘 맞는 시기예요. 말이 곱게 얹힙니다"),
            Text("애쓰지 않아도 대화가 굴러가는 결이에요"),
            Text("늘 하던 안부가 오늘은 더 멀리 갑니다"),
        ],
            "relationship.carried": [
            Text("그동안 건넨 마음들이 당신 곁을 지키고 있어요"),
            Text("오래된 인연이 조용히 힘이 되어주는 날이에요"),
            Text("지켜온 약속들이 보이지 않는 울타리가 되어 있어요"),
        ],
            "relationship.resting": [
            Text("잠시 혼자인 시간도 관계가 숨을 고르는 방식이에요"),
            Text("멀어진 게 아니라 각자의 자리에서 쉬는 중이에요"),
            Text("비워둔 곁에 새 사람이 앉을 자리가 마련되고 있어요"),
        ],
            "relationship.unformed": [
            Text("아직 이름 붙지 않은 인연이 근처를 지나고 있어요"),
            Text("관계의 결이 무른 날이에요. 오늘 건네는 말이 모양을 만듭니다"),
            Text("백지 같은 사이일수록 첫 획이 오래 남는 때예요"),
        ],
            "health.closing": [
            Text("몸이 하루를 잘 닫으려 하고 있어요. 끝맺는 잠이 보약이 됩니다"),
            Text("오래 끌던 피로가 빠져나갈 문을 찾은 결이에요"),
            Text("미뤄둔 회복이 마무리되는 시기예요. 몸이 제자리를 찾습니다"),
        ],
            "health.gathering": [
            Text("흩어졌던 기력이 몸 가운데로 모이고 있어요"),
            Text("숨이 한곳으로 고이는 중이에요. 깊게 쉬기 좋은 날"),
            Text("몸의 초점이 또렷해지는 시기예요. 움직임에 힘이 실립니다"),
        ],
            "health.rhythm": [
            Text("몸의 박자가 맞아 들어가는 시기예요. 자고 깨는 결이 곱습니다"),
            Text("애쓰지 않아도 걸음이 가벼운 날이에요"),
            Text("반복해온 습관이 몸 안에서 당신 편을 들고 있어요"),
        ],
            "health.carried": [
            Text("돌봐온 시간이 뼈대처럼 당신을 받치고 있어요"),
            Text("지난 계절의 관리가 지금의 체력으로 돌아오는 중이에요"),
            Text("쌓아둔 잠과 걸음이 조용히 일하고 있어요"),
        ],
            "health.resting": [
            Text("몸이 스스로 속도를 낮추고 있어요. 따라가 주는 게 회복입니다"),
            Text("멈춘 게 아니라 아무는 중이에요"),
            Text("비워둔 하루가 다음 체력을 빚고 있어요"),
        ],
            "health.unformed": [
            Text("몸의 흐름이 아직 잡히기 전이에요. 오늘 들인 습관이 결이 됩니다"),
            Text("컨디션이 백지 같은 날이에요. 무엇을 얹느냐에 달렸습니다"),
            Text("리듬이 아직 정해지지 않았어요. 첫 끼와 첫 걸음이 하루를 그립니다"),
        ],
        ]
        let key = "\(reading.kind.rawValue).\(reading.omen.rawValue)"
        guard let variants = table[key], !variants.isEmpty else { return Text("") }
        return variants[min(max(reading.variant, 0), variants.count - 1)]
    }

    /// 조언 — 낮은 점수에도 "지금부터 할 수 있다" 로만 쓴다.
    /// 조언 문장 — 기운·등급에 조언 전용 변주(0..5, `Aura.adviceVariant`)를 더해 고른다.
    /// `AuraReading.variant`(0..2)는 조짐 몫이고, 조언은 별도 해시가 6종을 돈다 —
    /// 같은 등급이 이어져도 조언까지 어제와 같은 문장이 나오는 날을 줄인다
    /// (웹 aura.advice.{kind}.{tier}.{0..5} 대응).
    static func advice(_ reading: AuraReading, variant: Int) -> Text {
        let table: [String: [Text]] = [
            "wealth.great": [
            Text("미뤄둔 일 하나를 오늘 끝내기 좋은 흐름이에요"),
            Text("가장 무거운 것부터 손대도 되는 날이에요"),
            Text("벌여둔 것을 하나 접어보세요"),
            Text("오래 망설인 제안을 오늘 꺼내도 괜찮아요"),
            Text("판을 조금 키워도 감당되는 날이에요"),
            Text("생각만 하던 일을 오늘 시작해도 좋아요"),
        ],
            "wealth.good": [
            Text("작은 것 하나를 마무리하면 흐름이 더 단단해져요"),
            Text("오늘 한 칸만 더 나아가 보세요"),
            Text("어제 멈춘 자리에서 이어가면 됩니다"),
            Text("다듬다 만 부분을 오늘 매만져 보세요"),
            Text("탄력이 붙었을 때 조금만 더 밀어보세요"),
            Text("지금 하는 방식 그대로 밀고 가도 좋아요"),
        ],
            "wealth.fair": [
            Text("가장 작은 일부터 치워보세요"),
            Text("책상 위 하나만 정리해도 충분해요"),
            Text("오늘은 완성보다 착수가 중요해요"),
            Text("새 일을 벌이기보다 있는 것을 돌봐 주세요"),
            Text("쓰던 것을 손보는 데 오늘을 써도 좋아요"),
            Text("나가는 것과 들어오는 것을 가만히 살펴보세요"),
        ],
            "wealth.care": [
            Text("오늘은 시작만 해도 충분해요"),
            Text("아무것도 못 해도 내일이 사라지지 않아요"),
            Text("한 줄만 적어두고 덮어도 좋아요"),
            Text("큰 결정은 하루만 미뤄두어도 늦지 않아요"),
            Text("덜어낸 만큼 내일이 가벼워져요"),
            Text("오늘은 지키는 것만으로도 잘한 거예요"),
        ],
            "relationship.great": [
            Text("먼저 연락하기 좋은 날이에요"),
            Text("오래 미룬 안부를 꺼내도 좋아요"),
            Text("당신이 여는 쪽이 되면 잘 풀려요"),
            Text("마음에 둔 말을 오늘 전해도 좋아요"),
            Text("새로운 자리에 나가보기 좋은 날이에요"),
            Text("먼저 웃는 쪽이 되어보세요"),
        ],
            "relationship.good": [
            Text("안부 한 줄이 오늘을 바꿔요"),
            Text("고맙다는 말을 아끼지 마세요"),
            Text("짧게라도 답을 보내두면 좋아요"),
            Text("들은 이야기를 기억했다가 되물어 보세요"),
            Text("칭찬은 내일로 미루지 마세요"),
            Text("밥 한 끼를 청해보기 좋은 날이에요"),
        ],
            "relationship.fair": [
            Text("오늘은 듣는 쪽이 되어보세요"),
            Text("설명하기보다 물어보는 게 나아요"),
            Text("말을 줄이면 오해도 줄어요"),
            Text("결론을 서두르지 말고 한 박자 쉬어보세요"),
            Text("오늘은 맞장구만으로도 충분해요"),
            Text("보내기 전에 한 번 더 읽어보면 좋아요"),
        ],
            "relationship.care": [
            Text("혼자 있는 시간도 관계의 일부예요"),
            Text("답하지 않아도 되는 날이 있어요"),
            Text("멀어진 게 아니라 쉬는 중이에요"),
            Text("무리해서 맞추지 않아도 괜찮아요"),
            Text("거리를 두는 것도 마음을 지키는 방법이에요"),
            Text("오늘의 서운함은 오늘 판단하지 않아도 돼요"),
        ],
            "health.great": [
            Text("몸이 잘 따라오는 날이에요"),
            Text("평소보다 한 걸음 더 가도 괜찮아요"),
            Text("숨이 깊어지는 걸 느껴보세요"),
            Text("미뤄둔 운동을 다시 꺼내기 좋은 날이에요"),
            Text("햇빛 아래를 걷는 시간을 늘려보세요"),
            Text("몸이 원하는 만큼 움직여도 괜찮아요"),
        ],
            "health.good": [
            Text("물 한 잔과 가벼운 스트레칭으로 이어가세요"),
            Text("어깨를 한 번 내려보세요"),
            Text("오늘은 조금 일찍 눕는 걸 목표로"),
            Text("계단을 만나면 반갑게 올라보세요"),
            Text("허리를 펴고 먼 곳을 한 번 바라보세요"),
            Text("따뜻한 것을 챙겨 마시며 이어가세요"),
        ],
            "health.fair": [
            Text("무리하지 말고 가볍게 시작하세요"),
            Text("절반만 해도 오늘은 성공이에요"),
            Text("몸이 보내는 신호를 먼저 들으세요"),
            Text("오늘은 속도를 지키는 게 실력이에요"),
            Text("허기와 피로가 오기 전에 미리 챙기세요"),
            Text("가볍게 걷는 정도면 오늘은 충분해요"),
        ],
            "health.care": [
            Text("오늘은 쉬는 게 최선일 수 있어요"),
            Text("눕는 것도 오늘의 할 일이에요"),
            Text("회복은 아무것도 안 할 때 일어나요"),
            Text("몸이 쉬자고 하면 이유를 묻지 마세요"),
            Text("따뜻하게 하고 하루를 일찍 접어도 좋아요"),
            Text("오늘 아낀 힘은 사라지지 않고 쌓여요"),
        ],
        ]
        let key = "\(reading.kind.rawValue).\(reading.tier.rawValue)"
        guard let variants = table[key], !variants.isEmpty else { return Text("") }
        return variants[min(max(variant, 0), variants.count - 1)]
    }

    /// 타로 UI 라벨 — 웹 aura.tarot.prompt / aura.tarot.locked.
    static let tarotPrompt = Text("마음이 머무는 카드를 한 장 뒤집어보세요")
    static let tarotLocked = Text("오늘 뽑은 카드는 내일까지 함께합니다")

    /// 섹션 라벨 — 웹 aura.hint.label / aura.caution.label.
    static let hintLabel = Text("오늘의 실마리")
    static let cautionLabel = Text("흘려보낼 것")

    /// 오늘의 실마리 — 기운별 6종(웹 aura.hint.{kind}.{i}), 인덱스는 Aura.hintIndex.
    static func hint(_ kind: AuraKind, _ index: Int) -> Text {
        let table: [AuraKind: [Text]] = [
            .wealth: [
            Text("오전의 첫 한 시간, 책상 위 가장 오래 묵은 일 하나가 유난히 잘 풀립니다"),
            Text("해 지기 전에 끝낸 일 하나가 내일의 짐을 반으로 줄여줍니다"),
            Text("가방 속 영수증을 정리하다 잊고 있던 몫을 발견할 수 있어요"),
            Text("점심 무렵 떠오르는 생각 하나를 적어두세요. 나중에 값을 합니다"),
            Text("큰일보다 잠깐이면 끝나는 일부터 손대세요. 작게 끝낸 하나가 물꼬를 틉니다"),
            Text("잠들기 전 내일 할 일의 첫 줄만 적어두면 아침 기운이 그 줄을 따라옵니다"),
        ],
            .relationship: [
            Text("해 지기 전, 가장 오래 미룬 연락 하나가 길을 엽니다"),
            Text("오늘 스치는 안부에 평소보다 한 마디를 더 얹어보세요. 거기서 문이 열립니다"),
            Text("점심시간에 떠오르는 얼굴이 있다면 그 사람이 오늘의 인연입니다"),
            Text("먼저 고맙다고 말하는 쪽에 좋은 기운이 붙는 날이에요"),
            Text("익숙한 장소에서 뜻밖의 대화가 시작될 수 있어요. 귀를 열어두세요"),
            Text("밤이 오기 전에 보낸 짧은 답장 하나가 오래 남을 인연을 붙잡습니다"),
        ],
            .health: [
            Text("아침의 첫 물 한 잔이 오늘 몸의 물길을 정합니다"),
            Text("오후에 몸이 무거워지면 그늘보다 햇빛 쪽으로 잠깐 걸어보세요"),
            Text("어깨가 먼저 신호를 보내는 날이에요. 알아챈 순간 한 번 내려놓으면 됩니다"),
            Text("한 정거장 먼저 내려 걷는 길에 좋은 기운이 깔려 있어요"),
            Text("해가 있는 동안 몸을 움직여두면 밤잠이 값을 합니다"),
            Text("잠들기 전 불을 일찍 끄는 것만으로 내일 아침의 결이 달라집니다"),
        ],
        ]
        guard let variants = table[kind], !variants.isEmpty else { return Text("") }
        return variants[min(max(index, 0), variants.count - 1)]
    }

    /// 흘려보낼 것 — 기운별 6종(웹 aura.caution.{kind}.{i}), 인덱스는 Aura.cautionIndex.
    static func caution(_ kind: AuraKind, _ index: Int) -> Text {
        let table: [AuraKind: [Text]] = [
            .wealth: [
            Text("오늘 다 끝내야 한다는 조급함은 흘려보내세요. 흐름은 이어집니다"),
            Text("남의 속도와 비교하는 마음을 내려놓으세요. 당신의 셈은 따로 갑니다"),
            Text("이미 지나간 선택을 다시 셈하는 일은 오늘 몫이 아니에요"),
            Text("한 번에 크게 이루려는 마음은 잠시 접어두세요. 작게 굴러가는 게 오늘의 길입니다"),
            Text("손대지 못한 일에 대한 자책은 두고 가세요. 자리는 사라지지 않습니다"),
            Text("완벽하게 정리하고 시작하려는 마음을 흘려보내세요. 지금 그대로 시작해도 됩니다"),
        ],
            .relationship: [
            Text("읽고 답 없는 침묵의 의미를 재지 마세요. 그저 바쁜 날일 때가 많습니다"),
            Text("모두에게 좋은 사람이려는 마음은 오늘 내려놓아도 됩니다"),
            Text("그때 그 말을 곱씹는 일은 흘려보내세요. 상대는 이미 지나갔습니다"),
            Text("누가 먼저 연락하나 재는 마음을 두고 가세요. 무게만 남습니다"),
            Text("멀어지는 인연을 억지로 붙잡으려는 힘을 빼보세요. 남을 것은 남습니다"),
            Text("오늘의 침묵을 서운함으로 번역하지 마세요. 쉼표일 뿐입니다"),
        ],
            .health: [
            Text("어제 못 잔 잠에 대한 걱정은 내려놓으세요. 오늘 밤이 갚을 기회입니다"),
            Text("몸이 무거운 날 스스로를 게으르다 부르는 버릇은 흘려보내세요"),
            Text("한 번에 되돌리려는 조급함을 내려놓으세요. 회복은 조용히 옵니다"),
            Text("남들만큼 해야 한다는 기준은 오늘 문밖에 두고 오세요"),
            Text("잠들기 전 화면을 붙드는 손을 오늘은 한 박자 먼저 놓아보세요"),
            Text("몸을 다그치는 마음은 잠시 내려놓으세요. 오늘은 돌보는 쪽에 서보세요"),
        ],
        ]
        guard let variants = table[kind], !variants.isEmpty else { return Text("") }
        return variants[min(max(index, 0), variants.count - 1)]
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
    /// 오늘의 색 — 열린 칸의 등급을 이 색으로 찍는다(웹 AuraSection 의 `colorHex`).
    let accent: Color
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
        // 이미 연 기운은 오늘의 등급을 칸에 그대로 찍는다(웹 AuraSection 과 같은 계약).
        // 아이콘만 두면 "뭘 봤는지"가 남지 않아 확인하려면 다시 열어야 한다.
        let tier: AuraTier? = opened ? state.snapshot?[kind].tier : nil
        // "이미 봤다"의 흐릿함은 아이콘과 이름에만 건다. 칸 전체에 걸면 방금 더한 등급까지
        // 같이 흐려지는데, 등급은 오늘의 색(24종)으로 찍히는 텍스트라 어두운 색에서 곧바로
        // 본문 대비 4.5:1 아래로 떨어진다(#F037A5 3.16:1, #8A7BFF 3.48:1 … 7/24 미달).
        // 흐리게 할 것은 "다 본 칸"이라는 신호이지, 보러 온 정보가 아니다.
        // 웹 AuraSection 이 잠금 흐림을 이름 텍스트에만 거는 것과 같은 처리다.
        let seenDim: Double = opened ? 0.72 : 1

        return Button {
            onPick(kind)
        } label: {
            VStack(spacing: 6) {
                if busy {
                    ProgressView()
                        .tint(Color.textTertiary)
                        .scaleEffect(0.7)
                        .frame(height: 16)
                        .opacity(seenDim)
                        // 상태는 아래 accessibilityValue 한 곳에서만 읽힌다.
                        .accessibilityHidden(true)
                } else {
                    PixelIcon(icon, size: 16,
                              color: (opened || locked) ? Color.textTertiary : Color.accentPrimary)
                        .frame(height: 16)
                        .opacity(seenDim)
                        .accessibilityHidden(true)
                }
                AuraCopy.name(kind)
                    .typography(.caption)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .opacity(seenDim)
                // 상태 줄 — 웹의 `min-h-[18px]` 자리. 열린 칸만 등급을 찍고 나머지는 빈
                // 자리로 남긴다. 늘 같은 높이를 차지해야 하나를 열어도 세 칸이 함께
                // 튀어오르지 않는다(열림 여부로 줄 높이가 바뀌면 레이아웃이 흔들린다).
                ZStack {
                    if let tier {
                        AuraCopy.tier(tier)
                            .typography(.micro)
                            .foregroundStyle(accent)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(minHeight: 18)
                .accessibilityHidden(true)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 6)
            // 세 칸을 같은 높이로 — 줄에서 가장 큰 칸이 기준이 된다.
            .frame(maxWidth: .infinity, minHeight: CardHeights.auraPickChip, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(UNPressStyle())
        .background(Color.bgSurface.opacity(0.92), in: RoundedRectangle(cornerRadius: 12))
        .disabled(loading != nil)
        // 상태는 **화면에 문구를 늘리지 않고** 여기로만 싣는다. 아이콘·스피너·등급 줄을
        // 다 숨겨 놨으므로 라벨은 기운 이름 하나로 남고, 열림/잠김/무료/대기가 값으로 갈린다.
        // (문구를 화면에 되살리는 것은 금지 — 대체 채널은 접근성 값뿐이다.)
        .accessibilityValue(Self.a11yValue(opened: opened, locked: locked, busy: busy, tier: tier))
    }

    /// VoiceOver 전용 상태 문구. 화면에는 절대 나오지 않는다.
    /// 세 상태(열림·잠김·무료)가 같게 읽히던 자리 — 값이 없으면 커서가 세 칸을 똑같이 읽어
    /// "이미 본 것"과 "광고를 봐야 하는 것"을 구분할 수 없다.
    private static func a11yValue(opened: Bool, locked: Bool,
                                  busy: Bool, tier: AuraTier?) -> Text {
        if busy { return Text("광고를 불러오는 중이에요") }
        if opened {
            guard let tier else { return Text("이미 확인했어요") }
            // 보간 인자는 미리 인앱 언어로 해석해 넘긴다. Text(String) 오버로드에 걸리지
            // 않도록 리터럴 키 안에서만 보간한다.
            return Text("이미 확인했어요, 오늘의 결과는 \(AuraCopy.tierName(tier))")
        }
        if locked { return Text("잠겨 있어요, 광고를 보면 열려요") }
        return Text("지금 바로 열 수 있어요")
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
    /// 공개 이펙트 — "문질러 드러난 순간"에만 튄다. 재열람 마운트에서 또 터지면
    /// 보상 연출이 헐값이 되고, 등급 차등(잔잔~대길)의 의미도 무뎌진다(웹 fx state).
    @State private var fxTier: AuraTier?
    /// 오늘 이 기운에서 뒤집은 타로 카드 id. 미선택이면 nil. 저장(AuraStore)이 진실의
    /// 원천이고 이 상태는 그 반영이다 — markTarot 은 이미 있으면 덮지 않고 기존 값을
    /// 돌려주므로(하루 고정), 화면은 그 반환값을 그대로 따라간다(웹 handleTarotPick).
    @State private var tarotCardId: Int?

    init(reading: AuraReading, accent: Color, needsRitual: Bool,
         allOpened: Bool, onBack: @escaping () -> Void) {
        self.reading = reading
        self.accent = accent
        self.needsRitual = needsRitual
        self.allOpened = allOpened
        self.onBack = onBack
        // 재진입 마운트는 이미 뒤집힌 채로 서야 한다(웹 initial={false} 계약).
        // onAppear 에서 읽으면 첫 프레임에 엎어진 면이 한 번 비쳤다 바뀌므로 init 에서 읽는다.
        let day = AuraStore.snapshotDay() ?? GameStore.todayString()
        _tarotCardId = State(initialValue: AuraStore.state(today: day).tarot[reading.kind])
    }

    /// 실마리·흘려보낼 것·타로 제시의 날짜 시드 — 스냅샷이 고정된 날짜(auraDate).
    /// 이 오버레이는 ensureSnapshot 직후에만 뜨므로 웹의 `daily.date` 와 같은 값이다.
    private var readingDay: String { AuraStore.snapshotDay() ?? GameStore.todayString() }

    var body: some View {
        ZStack {
            Color.backdropImmersive
                .ignoresSafeArea()
                // 뒤(폴라로이드)의 탭 제스처가 새어 나가지 않게 막는다.
                .contentShape(Rectangle())
                .onTapGesture { }

            // 타로가 붙어 카드가 길어졌다 — 작은 화면에서는 해설 문단까지 열리면 한
            // 화면을 넘는다. 짧을 때는 minHeight 로 가운데에 서고(기존 레이아웃 그대로),
            // 넘칠 때만 스크롤이 생긴다(FortuneCardView 의 minHeight 패턴).
            GeometryReader { geo in
                ScrollView {
                    VStack(spacing: 18) {
                        card
                            .overlay {
                                if !revealed {
                                    AuraRitualCover(accent: accent, onReveal: reveal)
                                }
                            }
                            .overlay {
                                // 공개 이펙트 — 카드 안에서만 논다. 카드 밖으로 튀면
                                // 인화지의 물성(한 장의 사진)이 깨진다(웹 RevealFx 와 같은 계약).
                                if let tier = fxTier {
                                    AuraRevealFx(tier: tier, accent: accent, reduced: reduceMotion)
                                        .allowsHitTesting(false)
                                        .accessibilityHidden(true)
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
                    .padding(.vertical, 24)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height)
                }
                .scrollIndicators(.hidden)
                // 문지르는 동안에는 스크롤을 끈다 — minimumDistance 0 드래그(문지르기)와
                // 스크롤이 터치를 다투면 의식이 뚝뚝 끊긴다. 긴 내용(해설 문단)은 공개
                // 후에만 생기므로 그때 열면 충분하다.
                .scrollDisabled(!revealed)
            }
        }
        // 리딩이 떠 있는 동안 VoiceOver 커서를 여기 가둔다. 이 오버레이는 항상 최상단이라
        // 조건 없이 건다 — 아래 폴라로이드 쪽이 자기 모달 스코프를 내려놓는다
        // (FortuneRevealOverlay.auraOpen). 모달 형제가 둘이면 스코프가 성립하지 않는다.
        .accessibilityAddTraits(.isModal)
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
        // 공개 햅틱은 성공 패턴(웹 handleReveal 의 complete→success). reduced-motion
        // 탭 폴백도 이 함수를 그대로 타므로 그 경로에서도 유지된다. great 만 한 박자
        // 뒤 한 번 더 — "대길"의 무게를 손끝으로 반복해 준다(웹 220ms).
        Haptics.play(.success)
        if reading.tier == .great {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                Haptics.play(.success)
            }
        }
        // 공개 이펙트 — 수명이 다하면 노드를 내려 렌더 부하를 없앤다(웹 FX_LIFETIME_MS).
        fxTier = reading.tier
        DispatchQueue.main.asyncAfter(deadline: .now() + AuraRevealFx.lifetime) {
            fxTier = nil
        }
        withAnimation(.easeOut(duration: reduceMotion ? 0.01 : 0.32)) { revealed = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
            withAnimation(.easeOut(duration: 0.34)) { settled = true }
        }
    }

    /// 타로 선택 — 저장이 진실의 원천이다. markTarot 은 이미 있으면 덮지 않고 기존 값을
    /// 돌려주므로(하루 고정), 화면 상태는 그 반환값을 그대로 따라간다(웹 handleTarotPick).
    /// 뒤집기 0.55s(웹 rotateY ease [0.16,1,0.3,1]) / reduced-motion 은 0.25s 페이드 교차.
    private func pickTarot(_ cardId: Int) {
        guard revealed, tarotCardId == nil else { return }
        SoundPlayer.shared.play(.cardFlip)
        Haptics.play(.light)   // 웹 triggerHaptic("cardFlip") == light 임팩트
        let fixed = AuraStore.markTarot(today: readingDay, kind: reading.kind, cardId: cardId)
        withAnimation(reduceMotion
                      ? .easeOut(duration: 0.25)
                      : .timingCurve(0.16, 1, 0.3, 1, duration: 0.55)) {
            tarotCardId = fixed
        }
    }

    // MARK: 리딩 카드 (인화지)

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 기운 이름은 머리말이다. 오늘의 답은 그 아래 등급 한 단어.
            // 이름·등급은 문지르기 중에도 걷힌 칸 틈으로 보인다 — 의식의 보상은 등급이고,
            // 문장들은 공개 후에 순서대로 온다(웹: 가림막 아래에서도 보인다).
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

            // 정보 위계: 조짐 > 조언 > 실마리 > 흘려보낼 것 (웹과 같은 순서·같은 stagger).
            // 조짐 — 실측 신호가 고른 문장 한 줄. 수치는 인용하지 않는다.
            staggered(order: 0) {
                AuraCopy.omen(reading)
                    .typography(.caption)
                    .foregroundStyle(AuraPaper.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            staggered(order: 1) {
                AuraCopy.advice(reading, variant: Aura.adviceVariant(
                    today: readingDay, salt: Fortune.salt, kind: reading.kind))
                    .typography(.body)
                    .foregroundStyle(AuraPaper.inkStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }

            // 오늘의 실마리 — 라벨은 옅은 잉크로 급을 낮추고 본문이 조언보다 아래 선다.
            staggered(order: 2) {
                VStack(alignment: .leading, spacing: 3) {
                    AuraCopy.hintLabel
                        .typography(.micro)
                        .foregroundStyle(AuraPaper.inkFaint)
                    AuraCopy.hint(reading.kind, Aura.hintIndex(
                        today: readingDay, salt: Fortune.salt, kind: reading.kind))
                        .typography(.caption)
                        .foregroundStyle(AuraPaper.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 14)
            }

            // 흘려보낼 것 — 가장 낮은 위계. 내려놓으라는 말이라 목소리도 낮춘다.
            staggered(order: 3) {
                VStack(alignment: .leading, spacing: 3) {
                    AuraCopy.cautionLabel
                        .typography(.micro)
                        .foregroundStyle(AuraPaper.inkFaint)
                    AuraCopy.caution(reading.kind, Aura.cautionIndex(
                        today: readingDay, salt: Fortune.salt, kind: reading.kind))
                        .typography(.caption)
                        .foregroundStyle(AuraPaper.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 12)
            }

            // 타로 — 읽어 내려가는 리듬의 마지막 박자. 제시 3장은 결정론(tarotOffer)이지만
            // 무엇을 뒤집을지는 여기서 유일하게 유저 몫이다(하루 고정, 재선택 불가).
            staggered(order: 4) {
                AuraTarotBlock(
                    offer: Aura.tarotOffer(today: readingDay, salt: Fortune.salt,
                                           kind: reading.kind),
                    selectedId: tarotCardId,
                    tier: reading.tier,
                    accent: accent,
                    // 가림막을 걷어낸 뒤에만 만질 수 있다(히트테스트 게이트). opacity 0 으로
                    // 숨어 있는 동안 탭이 새면 공개 의식이 무의미해진다(웹 active=revealed).
                    active: revealed,
                    reduced: reduceMotion,
                    onPick: pickTarot
                )
                .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(paperGround)
        // 의식을 통과하기 전에는 VoiceOver 에도 내용이 새지 않게 한다
        // (대체 경로는 덮개의 accessibilityAction 이 담당한다).
        .accessibilityHidden(!revealed)
    }

    /// 읽어 내려가는 점괘 리듬 — 공개 후 0.3s 간격으로 문장이 순서대로 떠오른다
    /// (웹 block(order): delay 0.3 + order*0.3). 문지르는 동안엔 opacity 0 으로만
    /// 숨겨 카드 높이가 흔들리지 않고, 걷힌 칸 틈으로 문장이 미리 새지 않는다.
    /// reduceMotion: 이동 없이 짧은 페이드(웹 0.05 + order*0.1)로 강등.
    private func staggered<Content: View>(
        order: Int, @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .opacity(settled ? 1 : 0)
            .offset(y: settled || reduceMotion ? 0 : 7)
            .animation(
                .easeOut(duration: reduceMotion ? 0.2 : 0.45)
                    .delay((reduceMotion ? 0.05 : 0.3)
                           + Double(order) * (reduceMotion ? 0.1 : 0.3)),
                value: settled)
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

    /// 문지르기 틱 최소 간격(s). 이보다 잦으면 진동이 뭉개져 소음이 된다(웹 TICK_MIN_MS).
    private static let tickMinInterval: TimeInterval = 0.04
    /// 틱 하나가 요구하는 이동 거리(pt). 시간·거리 둘 다 채워야 틱이 나간다(웹 TICK_MIN_DIST).
    private static let tickMinDistance: CGFloat = 24
    /// 공개 임계 대비 이 비율(80%)을 넘으면 한 단계 무거운 틱으로 "임박"을 알린다(웹 NEAR_TICK_RATIO).
    private static let nearTickRatio = 0.8

    @State private var visited: Set<Int> = []
    @State private var finished = false

    // 문지르기 틱 스로틀 — 시간과 이동거리 둘 다 본다. 시간만 보면 제자리에서 떠는
    // 손가락에도 틱이 나가고, 거리만 보면 빠른 스와이프 한 번에 틱이 몰려 진동이
    // 한 덩어리로 뭉개진다(웹 AuraScratch 의 scratchTick 과 같은 규칙).
    @State private var lastTickAt: TimeInterval = 0
    @State private var lastPoint: CGPoint?
    @State private var tickDistance: CGFloat = 0
    @State private var nearTicked = false

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
                                  onRub: { point in rub(point, cellW: cellW, cellH: cellH) },
                                  onRubEnd: endRub))
        }
        // 제스처 시작과 재생 사이 지연을 없앤다 — 문지르기 틱(selection)·임박 틱(light)·
        // 공개 성공 패턴(success)을 미리 워밍한다(Apple 권장 prepare 패턴).
        .onAppear {
            Haptics.prepare(.selection)
            Haptics.prepare(.light)
            Haptics.prepare(.success)
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
        let onRubEnd: () -> Void

        func body(content: Content) -> some View {
            if reduceMotion {
                content.onTapGesture { onTap() }
            } else {
                content.gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in onRub(value.location) }
                        .onEnded { _ in onRubEnd() }
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
        scratchTick(point)
        let col = Int(point.x / cellW)
        let row = Int(point.y / cellH)
        guard col >= 0, col < Self.cols, row >= 0, row < Self.rows else { return }
        let index = row * Self.cols + col
        guard !visited.contains(index) else { return }
        visited.insert(index)

        // 임박 신호 — selection 보다 한 단계 무거운 light 임팩트. 공개 직전의
        // "거의 다 왔다"를 손끝으로 먼저 알린다. 정확히 1회(웹 nearTicked 와 동일).
        let goal = Double(Self.cols * Self.rows) * Self.threshold
        let count = Double(visited.count)
        if !nearTicked, count >= goal * Self.nearTickRatio, count < goal {
            nearTicked = true
            Haptics.play(.light)
        }
        if progress >= Self.threshold { finish() }
    }

    /// 문지르기 틱 — 은박이 손끝에서 갈리는 "사각사각"의 촉각 버전.
    /// 첫 접촉은 즉답 틱 하나, 이후에는 시간(40ms)·거리(24pt)를 둘 다 채워야 나간다.
    /// Haptics.play 가 설정의 hapticEnabled 게이트를 이미 문다(웹 hapticEnabled 대응).
    private func scratchTick(_ point: CGPoint) {
        guard let last = lastPoint else {
            // 첫 접촉 틱 — "여기가 문질러지는 곳"이라는 즉답. 이후 틱의 기준점도 여기.
            lastPoint = point
            tickDistance = 0
            lastTickAt = Date.timeIntervalSinceReferenceDate
            Haptics.play(.selection)
            return
        }
        lastPoint = point
        tickDistance += hypot(point.x - last.x, point.y - last.y)
        let now = Date.timeIntervalSinceReferenceDate
        guard tickDistance >= Self.tickMinDistance,
              now - lastTickAt >= Self.tickMinInterval else { return }
        tickDistance = 0
        lastTickAt = now
        Haptics.play(.selection)
    }

    /// 손을 뗀 순간 — 다음 접촉이 다시 "첫 접촉"이 되도록 스로틀 기준점을 비운다.
    private func endRub() {
        lastPoint = nil
        tickDistance = 0
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

// MARK: - 타로 (리딩의 마지막 박자 — 유일하게 유저가 고르는 한 장)

/// 타로 3장 + 선택 해설(웹 TarotBlock 1:1). 제시 3장은 결정론(Aura.tarotOffer)이지만
/// 무엇을 뒤집을지는 유저 몫이고, 선택은 하루 고정이다(AuraStore.markTarot — 재선택 불가).
/// 엎어진 면은 필름 프레임 결, 뒤집힌 면은 미니 폴라로이드 — 오늘의 색은 여기서도
/// 사진 영역(어두운 바탕)에만 싣는다.
@MainActor
struct AuraTarotBlock: View {
    /// 오늘 이 기운에 제시된 카드 id 3장 — Aura.tarotOffer 산출, 서로 다름 보장
    let offer: [Int]
    /// 오늘 이미 뒤집은 카드 id. 미선택이면 nil.
    let selectedId: Int?
    /// 해설은 그날 그 기운의 등급을 따른다 — readings[tier]
    let tier: AuraTier
    let accent: Color
    /// 가림막을 걷어낸 뒤에만 만질 수 있다(히트테스트 게이트)
    let active: Bool
    let reduced: Bool
    let onPick: (Int) -> Void

    /// 인앱 언어 raw("ko"/"en"/"ja"/"zh"). TarotPool 은 카탈로그 키가 아니라
    /// 4언어 인라인 콘텐츠(fortunePool 선례)라 이 값으로 직접 고른다.
    private var lang: String {
        AppConfig.sharedDefaults?.string(forKey: AppConfig.languageKey) ?? "ko"
    }

    /// 빈 문자열이면 ko 폴백 — 콘텐츠가 뒤 단계에서 채워지는 기간의 방어(웹 l10n).
    private func name(_ card: TarotCard) -> String {
        let s = TarotPool.name(card, lang: lang)
        return s.isEmpty ? (card.name.first ?? "") : s
    }

    private func readingText(_ card: TarotCard) -> String {
        let s = TarotPool.reading(card, tier: tier, lang: lang)
        return s.isEmpty ? TarotPool.reading(card, tier: tier, lang: "ko") : s
    }

    /// 저장이 0..39 를 보장하지만(관용 디코드) 인덱싱 한 번은 방어적으로.
    private var selected: TarotCard? {
        guard let selectedId else { return nil }
        return TarotPool.card(forId: selectedId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            (selected != nil ? AuraCopy.tarotLocked : AuraCopy.tarotPrompt)
                .typography(.micro)
                .foregroundStyle(AuraPaper.inkFaint)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 8) {
                ForEach(Array(offer.enumerated()), id: \.element) { i, cardId in
                    if let card = TarotPool.card(forId: cardId) {
                        AuraTarotFlipCard(
                            card: card,
                            name: name(card),
                            up: selectedId == cardId,
                            dimmed: selected != nil && selectedId != cardId,
                            disabled: !active || selected != nil,
                            accent: accent,
                            reduced: reduced,
                            index: i,
                            onPick: { onPick(cardId) }
                        )
                    }
                }
            }
            .padding(.top, 6)

            // 해설 — 카드가 뒤집히고 한 박자 뒤에 떠오른다(웹 delay 0.3). 등급별 해설이라
            // 같은 카드도 그날 하늘(tier)에 따라 다르게 읽힌다. 재진입 마운트는 초기
            // 콘텐츠라 transition 이 돌지 않는다(웹 initial={false} 계약).
            if let selected {
                Text(verbatim: readingText(selected))
                    .typography(.caption)
                    .foregroundStyle(AuraPaper.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .transition(reduced
                        ? .opacity.animation(.easeOut(duration: 0.2).delay(0.1))
                        : .opacity.combined(with: .offset(y: 6))
                            .animation(.easeOut(duration: 0.45).delay(0.3)))
            }
        }
    }
}

/// 뒤집히는 타로 카드 한 장(웹 TarotFlipCard 1:1). 앞뒤 두 면을 반대 각도로 겹쳐
/// 회전시키고, 90° 를 지나며 opacity 를 교차해 뒷면 비침을 막는다.
/// reduced-motion 은 회전 없이 페이드 교차만. 애니메이션 트랜잭션은 호출부
/// (pickTarot 의 withAnimation)가 건다 — 재진입 마운트는 트랜잭션이 없어 무애니메이션.
@MainActor
struct AuraTarotFlipCard: View {
    let card: TarotCard
    /// 현재 언어로 해석된 카드 이름(빈 값 ko 폴백까지 끝난 문자열)
    let name: String
    let up: Bool
    /// 다른 카드가 선택됨 — 흐리게, 재선택 불가
    let dimmed: Bool
    let disabled: Bool
    let accent: Color
    let reduced: Bool
    /// 제시 순서(0..2) — 엎어진 면의 접근성 라벨("엎어진 카드 N")에만 쓴다
    let index: Int
    let onPick: () -> Void

    /// 필름 프레임의 먹색 — 웹 #20201e.
    private static let filmBase = Color(red: 0.125, green: 0.125, blue: 0.118)
    /// 미니 폴라로이드의 인화지 — 웹 #e9e8e4. 큰 카드(#f2f1ee)보다 반 톤 어둡다.
    private static let miniPaper = Color(red: 0.914, green: 0.910, blue: 0.894)

    var body: some View {
        Button(action: onPick) {
            ZStack {
                if reduced {
                    // reduced-motion — 뒤집기 대신 페이드 교차(웹 0.25s 경로).
                    back.opacity(up ? 0 : 1)
                    front.opacity(up ? 1 : 0)
                } else {
                    back
                        .rotation3DEffect(.degrees(up ? 180 : 0),
                                          axis: (x: 0, y: 1, z: 0), perspective: 0.6)
                        .opacity(up ? 0 : 1)
                    front
                        .rotation3DEffect(.degrees(up ? 0 : -180),
                                          axis: (x: 0, y: 1, z: 0), perspective: 0.6)
                        .opacity(up ? 1 : 0)
                }
            }
            .aspectRatio(5.0 / 7.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(UNPressStyle())
        .disabled(disabled)
        // 흐림은 "다른 카드가 뽑혔다"는 신호 — 웹 transition-opacity 300ms.
        .opacity(dimmed ? 0.4 : 1)
        .animation(.easeOut(duration: 0.3), value: dimmed)
        // 뒤집힌 카드는 이름으로, 엎어진 카드는 자리 번호로 읽힌다. 선택이 끝난 뒤의
        // 잠금은 disabled 상태가 이미 전달한다(VoiceOver "흐리게 표시됨").
        .accessibilityLabel(Text(verbatim:
            up ? name : AppConfig.loc("엎어진 카드") + " \(index + 1)"))
    }

    /// 엎어진 면 — 필름 프레임 결. 위아래 퍼포레이션이 "같은 롤의 한 프레임"을 말한다.
    private var back: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 2)
                .fill(Self.filmBase)
            VStack {
                perforation
                Spacer()
                perforation
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            PixelIcon(.sparkle, size: 16, color: accent)
                .opacity(0.75)
        }
    }

    /// 퍼포레이션 한 줄 — 4점이 양끝 정렬로 흩어진다(웹 justify-between).
    private var perforation: some View {
        HStack(spacing: 0) {
            ForEach(0..<4, id: \.self) { i in
                if i > 0 { Spacer(minLength: 0) }
                RoundedRectangle(cornerRadius: 1)
                    .fill(AuraPaper.paper.opacity(0.2))
                    .frame(width: 3, height: 3)
            }
        }
    }

    /// 뒤집힌 면 — 미니 폴라로이드. 오늘의 색은 사진 영역(어두운 바탕)에만 싣는다.
    private var front: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.bgPrimary
                RadialGradient(colors: [accent, .clear],
                               center: .center, startRadius: 0, endRadius: 56)
                    .opacity(0.3)
                PixelIcon(PixelIconName.resolve(card.icon), size: 20, color: accent)
            }
            .clipped()
            Text(verbatim: name)
                .typography(.micro)
                .foregroundStyle(AuraPaper.inkSoft)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 3)
                .padding(.bottom, 2)
                .frame(maxWidth: .infinity)
        }
        .padding(4)
        .background(Self.miniPaper, in: RoundedRectangle(cornerRadius: 2))
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

// MARK: - 공개 이펙트 (등급 차등)

/// 등급이 하늘의 답이라면, 이펙트는 그 답의 크기다 — 웹 RevealFx 의 SwiftUI 판.
/// care=어스름 가라앉음(입자 없음), fair=반짝임 5점, good=입자 링 10개+글로우,
/// great=흰 플래시+글로우 펄스+입자 버스트 14개. 전부 1회성 장식이라 호출부가
/// allowsHitTesting(false)·accessibilityHidden(true)를 걸고, lifetime 뒤 노드를 내린다.
/// reduceMotion 은 등급별 세기만 다른 글로우 페이드로 강등(웹과 같은 규칙).
/// 프로젝트 관례를 따라 KeyframeAnimator 대신 @State + withAnimation 스텝 체인.
struct AuraRevealFx: View {
    let tier: AuraTier
    let accent: Color
    let reduced: Bool

    /// 이펙트가 화면에 머무는 시간(s). 웹 FX_LIFETIME_MS(1900) 와 동일.
    static let lifetime: TimeInterval = 1.9

    var body: some View {
        if reduced {
            // reduced-motion 강등 — 움직임 없이 글로우가 한 번 부풀었다 잦아드는 페이드.
            // 등급 차이는 페이드의 세기로만 남긴다(웹 peak 0.5/0.36/0.24/0.14).
            let peak: Double = switch tier {
            case .great: 0.5
            case .good: 0.36
            case .fair: 0.24
            case .care: 0.14
            }
            AuraFadePulse(peak: peak, up: 0.33, down: 0.77) {
                RadialGradient(colors: [accent, .clear],
                               center: .center, startRadius: 0, endRadius: 150)
            }
        } else {
            switch tier {
            case .care: AuraCareFx(accent: accent)
            case .fair: AuraFairFx(accent: accent)
            case .good: AuraGoodFx(accent: accent)
            case .great: AuraGreatFx(accent: accent)
            }
        }
    }
}

/// 두 박자 페이드 — 나타났다(up) 사라진다(down). 웹 keyframes [0, peak, 0] 의 근사.
private struct AuraFadePulse<Content: View>: View {
    let peak: Double
    let up: TimeInterval
    let down: TimeInterval
    var delay: TimeInterval = 0
    @ViewBuilder var content: () -> Content

    @State private var level: Double = 0

    var body: some View {
        content()
            .opacity(level)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.easeInOut(duration: up)) { level = peak }
                    DispatchQueue.main.asyncAfter(deadline: .now() + up) {
                        withAnimation(.easeInOut(duration: down)) { level = 0 }
                    }
                }
            }
    }
}

/// 중심에서 흩어지는 입자 하나 — 이동은 강한 easeOut(웹 [0.16,1,0.3,1]), 밝기는 in-out.
private struct AuraFxParticle: View {
    let color: Color
    let glow: Color
    let size: CGFloat
    /// 목적지 오프셋(중심 기준)
    let target: CGSize
    let duration: TimeInterval
    let delay: TimeInterval

    @State private var flown = false
    @State private var lit = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .shadow(color: glow, radius: size * 1.5)
            .shadow(color: glow.opacity(0.65), radius: size * 3)
            .scaleEffect(flown ? 1 : 0.4)
            .offset(flown ? target : .zero)
            .opacity(lit ? 1 : 0)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: duration)) {
                        flown = true
                    }
                    withAnimation(.easeOut(duration: duration * 0.3)) { lit = true }
                    DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.45) {
                        withAnimation(.easeIn(duration: duration * 0.55)) { lit = false }
                    }
                }
            }
    }
}

/// care — 차분한 가라앉음. 어스름이 한 번 내려앉았다 걷힌다. 입자 없음.
/// "나쁨"의 연출이 아니라 "고요함"의 연출이어야 한다(운세가 아니라 렌즈).
private struct AuraCareFx: View {
    let accent: Color
    @State private var dropped = false

    /// 어스름의 먹색 — 웹 #16161a.
    private static let dusk = Color(red: 0.086, green: 0.086, blue: 0.102)

    var body: some View {
        ZStack {
            AuraFadePulse(peak: 0.3, up: 0.6, down: 0.9) {
                LinearGradient(colors: [.clear, Self.dusk],
                               startPoint: .top, endPoint: .bottom)
            }
            .offset(y: dropped ? 8 : -10)
            AuraFadePulse(peak: 0.18, up: 0.68, down: 0.82) {
                RadialGradient(colors: [accent, .clear],
                               center: UnitPoint(x: 0.5, y: 0.62),
                               startRadius: 0, endRadius: 140)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5)) { dropped = true }
        }
    }
}

/// fair — 잔잔한 반짝임. 몇 점이 순서대로 깜빡이고 만다.
/// 좌표는 결정론적 고정(%) — 리렌더마다 흔들리지 않는다(웹 FX_TWINKLES).
private struct AuraFairFx: View {
    let accent: Color

    private static let twinkles: [(x: CGFloat, y: CGFloat, s: CGFloat)] = [
        (0.24, 0.30, 3), (0.68, 0.22, 2), (0.46, 0.60, 3), (0.82, 0.58, 2), (0.32, 0.74, 2),
    ]

    var body: some View {
        GeometryReader { geo in
            ForEach(Array(Self.twinkles.enumerated()), id: \.offset) { i, t in
                AuraFadePulse(peak: 1, up: 0.3, down: 0.55, delay: 0.1 + Double(i) * 0.14) {
                    Circle()
                        .fill(Color.white)
                        .frame(width: t.s, height: t.s)
                        .shadow(color: accent, radius: t.s * 1.5)
                        .shadow(color: accent.opacity(0.65), radius: t.s * 3)
                }
                .position(x: geo.size.width * t.x, y: geo.size.height * t.y)
            }
        }
    }
}

/// good — 입자 링. 중심에서 고리 하나가 번져 나간다(웹 rb-frag-emanate 의 1회성 판).
private struct AuraGoodFx: View {
    let accent: Color
    @State private var bloomed = false

    var body: some View {
        ZStack {
            // 중심 글로우 — 부풀며 잦아든다 (opacity 0.5→0, scale 0.35→1.5).
            RadialGradient(colors: [accent.opacity(0.33), accent.opacity(0.13), .clear],
                           center: .center, startRadius: 0, endRadius: 48)
                .frame(width: 96, height: 96)
                .scaleEffect(bloomed ? 1.5 : 0.35)
                .opacity(bloomed ? 0 : 0.5)
            // 입자 10개가 반경 62 로 균등하게.
            ForEach(0..<10, id: \.self) { i in
                let angle = Double(i) / 10 * 2 * .pi
                let s: CGFloat = 3 + CGFloat(i % 2)
                AuraFxParticle(color: accent, glow: accent, size: s,
                               target: CGSize(width: cos(angle) * 62, height: sin(angle) * 62),
                               duration: 0.85, delay: 0.05)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.9)) { bloomed = true }
        }
    }
}

/// great — 버스트 + 빛 번쩍임. 흰 플래시가 먼저 치고, 오늘의 색 글로우가 부풀며,
/// 입자가 두 겹 반경으로 흩어진다. legend 급 어휘의 1회성 압축(웹과 같은 구성).
private struct AuraGreatFx: View {
    let accent: Color
    @State private var bloomed = false

    var body: some View {
        ZStack {
            // 흰 플래시 — 제일 먼저, 짧게 (opacity 0→0.85→0, 0.55s).
            AuraFadePulse(peak: 0.85, up: 0.1, down: 0.45) {
                Color.white
            }
            // 오늘의 색 글로우 펄스 (opacity 0.8→0, scale 0.3→1.9).
            RadialGradient(colors: [accent, accent.opacity(0.27), .clear],
                           center: .center, startRadius: 0, endRadius: 64)
                .frame(width: 128, height: 128)
                .scaleEffect(bloomed ? 1.9 : 0.3)
                .opacity(bloomed ? 0 : 0.8)
            // 입자 버스트 14개 — 두 겹 반경(58~106), 셋에 하나는 흰 점.
            ForEach(0..<14, id: \.self) { i in
                let angle = Double(i) / 14 * 2 * .pi + Double(i % 3) * 0.11
                let dist = 58.0 + Double(i % 4) * 16
                let s: CGFloat = 3 + CGFloat(i % 3)
                AuraFxParticle(color: i % 3 == 0 ? .white : accent, glow: accent, size: s,
                               target: CGSize(width: cos(angle) * dist, height: sin(angle) * dist),
                               duration: 1.0, delay: 0.08 + Double(i % 4) * 0.04)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.1)) { bloomed = true }
        }
    }
}
