//
//  DecorationToolbar.swift
//  UpNext — 폴라로이드 꾸미기 도구 모음.
//
//  웹 src/components/growth/DecorationToolbar.tsx 포팅.
//  3개 도구: 펜(색/두께), 스티커 팔레트, 지우개 모드.
//  스티커 풀: 7개 emoji + UpNext 로고.
//

import SwiftUI

enum DecorationTool: Equatable {
    case pen, eraser, sticker
}

struct DecorationToolbar: View {
    @Binding var currentTool: DecorationTool
    @Binding var penColor: PenColor
    @Binding var penWidth: PenWidth
    let onPickSticker: (Sticker) -> Void

    var body: some View {
        VStack(spacing: 10) {
            // 도구 선택 (펜/지우개/스티커)
            HStack(spacing: 12) {
                toolButton(.pen, icon: .penSquare, label: "펜")
                toolButton(.eraser, icon: .trash, label: "지우개")
                toolButton(.sticker, icon: .sparkle, label: "스티커")
            }

            // 도구별 보조 패널
            switch currentTool {
            case .pen:
                penSubpanel
            case .eraser:
                Text("드래그하여 지워요").typography(.micro).foregroundStyle(Color.textTertiary)
                    .padding(.vertical, 8)
            case .sticker:
                stickerSubpanel
            }
        }
        .padding(12)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - 도구 버튼

    private func toolButton(_ tool: DecorationTool, icon: PixelIconName, label: String) -> some View {
        let active = currentTool == tool
        return Button {
            withAnimation(.easeInOut(duration: 0.15)) { currentTool = tool }
            Haptics.play(.selection)
        } label: {
            VStack(spacing: 4) {
                PixelIcon(icon, size: 18, color: active ? Color.bgPrimary : Color.textSecondary)
                Text(label).typography(.micro)
                    .foregroundStyle(active ? Color.bgPrimary : Color.textTertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(active ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 펜 보조 (색 + 두께)

    private var penSubpanel: some View {
        VStack(spacing: 8) {
            // 색 5개
            HStack(spacing: 10) {
                ForEach(PenColor.allCases, id: \.self) { c in
                    Button {
                        penColor = c
                        Haptics.play(.selection)
                    } label: {
                        Circle()
                            .fill(c.color)
                            .frame(width: 28, height: 28)
                            .overlay(
                                Circle()
                                    .stroke(penColor == c ? Color.accentPrimary : Color.clear,
                                            lineWidth: 2)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            // 두께 3개
            HStack(spacing: 14) {
                ForEach(PenWidth.allCases, id: \.self) { w in
                    Button {
                        penWidth = w
                        Haptics.play(.selection)
                    } label: {
                        Circle()
                            .fill(Color.textPrimary)
                            .frame(width: w.dot, height: w.dot)
                            .overlay(
                                Circle()
                                    .stroke(penWidth == w ? Color.accentPrimary : Color.clear,
                                            lineWidth: 2)
                                    .frame(width: 22, height: 22)
                            )
                            .frame(width: 22, height: 22)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - 스티커 보조 (7 emoji + 1 logo)

    private var stickerSubpanel: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            ForEach(Self.emojiPool, id: \.self) { emoji in
                Button {
                    onPickSticker(Sticker(type: .emoji, content: emoji, x: 50, y: 40))
                    Haptics.play(.selection)
                } label: {
                    Text(emoji)
                        .font(.system(size: 28))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
            // UpNext 로고
            Button {
                onPickSticker(Sticker(type: .image, content: "upnext-logo", x: 50, y: 50))
                Haptics.play(.selection)
            } label: {
                Text("U↗")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color.accentPrimary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
    }

    private static let emojiPool: [String] = ["⭐️", "❤️", "🔥", "✨", "🌿", "🎵", "💡"]
}

// MARK: - 펜 옵션

enum PenColor: CaseIterable {
    case black, red, blue, green, purple

    var color: Color {
        switch self {
        case .black:  return Color.inkWarmBlack
        case .red:    return Color.inkRed
        case .blue:   return Color.inkBlue
        case .green:  return Color.inkGreen
        case .purple: return Color.inkPurple
        }
    }

    var uiColor: UIColor {
        UIColor(color)
    }
}

enum PenWidth: CaseIterable {
    case thin, medium, thick

    var dot: CGFloat {
        switch self {
        case .thin:   return 4
        case .medium: return 8
        case .thick:  return 12
        }
    }

    var stroke: CGFloat {
        switch self {
        case .thin:   return 1.5
        case .medium: return 3.0
        case .thick:  return 5.0
        }
    }
}
