//
//  MinigameGames.swift
//  UpNext — 8개 반사 미니게임 실제 구현 (Fallback 격하 해소).
//
//  웹 src/components/uphero/minigames/* 의 11개 게임 중, MinigameRouter 에서
//  Fallback 으로 통일됐던 8종을 각자의 고유 메커닉으로 분리:
//   - PipeConnect    : 4×4 그리드에서 시작→끝 파이프 연결 (탭으로 회전)
//   - SequenceMemo   : 색 시퀀스 점등 → 사용자가 반복 (Simon-says)
//   - DodgeDrops     : 좌우 이동으로 낙하물 회피 (Swipe)
//   - SortItems      : 색깔별로 아이템 드래그 분류
//   - QuickSum       : 화면 숫자 합산 (탭으로 정답 선택)
//   - SpotDiff       : 두 사진 중 다른 부분 탭
//   - BreathHold     : 정확한 시간 동안 홀드 후 release
//   - TracePath      : 곡선 path 위 손가락 드래그 (이탈 시 fail)
//
//  난이도 1/2/3 에 따라 보드 크기·속도·시간 조정.
//  공통: 모두 (Bool) -> Void onComplete 시그니처. MinigameRouter 가 라우팅.
//

import SwiftUI
import Combine

// MARK: - 1. PipeConnect
//
// 웹 src/components/uphero/minigames/PipeConnect.tsx 1:1 포팅.
//
// 알고리즘 (웹 동치):
//   1) genSolutionPath — (0,0)→(size-1,size-1) DFS 랜덤 경로 1회 보장.
//   2) makeGrid — 경로 위 타일은 in/out 방향이 정확히 맞는 kind 배치, 그 외는
//      난이도별 분포 (straight / corner / cross) 로 채움. 마지막에 모든 타일
//      rotation 을 0..3 무작위로 흩어 사용자가 회전으로 맞추도록.
//   3) isConnected — start(0,0) 의 W (= 그리드 외부에서 들어오는 가상 입구) opening
//      과 end(size-1,size-1) 의 E (= 그리드 외부로 나가는 가상 출구) opening 검증
//      후 DFS. 인접 타일끼리 마주보는 방향(예: 내가 E 열려 있으면 우측 타일이 W
//      열려야 함)이 모두 true 면 연결로 본다.
//
// 방향(Dir) 인덱스: 0=N, 1=E, 2=S, 3=W.

/// 4 방향 opening. [N, E, S, W].
private typealias PipeOpenings = (Bool, Bool, Bool, Bool)

private enum PipeKind {
    case straight, corner, cross, blank
}

private struct PipeTile {
    var kind: PipeKind
    var rotation: Int   // 0..3 (×90° 시계방향)
}

private func pipeBaseOpenings(_ kind: PipeKind) -> PipeOpenings {
    switch kind {
    case .straight: return (true, false, true, false)   // N+S
    case .corner:   return (true, true, false, false)   // N+E
    case .cross:    return (true, true, true, true)
    case .blank:    return (false, false, false, false)
    }
}

private func pipeRotateOpenings(_ ops: PipeOpenings, by rotation: Int) -> PipeOpenings {
    let input = [ops.0, ops.1, ops.2, ops.3]
    var out = [false, false, false, false]
    for i in 0..<4 { out[(i + rotation) % 4] = input[i] }
    return (out[0], out[1], out[2], out[3])
}

private func pipeOpenings(_ tile: PipeTile) -> PipeOpenings {
    pipeRotateOpenings(pipeBaseOpenings(tile.kind), by: tile.rotation)
}

/// 두 방향(d1, d2)을 모두 여는 베이스 타일과 회전을 반환.
/// 웹 tileForDirs 와 같은 매핑.
private func pipeTileForDirs(_ d1: Int, _ d2: Int) -> PipeTile {
    let sorted = [d1, d2].sorted()
    let key = "\(sorted[0]),\(sorted[1])"
    switch key {
    case "0,2": return PipeTile(kind: .straight, rotation: 0)   // N+S
    case "1,3": return PipeTile(kind: .straight, rotation: 1)   // E+W
    case "0,1": return PipeTile(kind: .corner,   rotation: 0)   // N+E
    case "1,2": return PipeTile(kind: .corner,   rotation: 1)   // E+S
    case "2,3": return PipeTile(kind: .corner,   rotation: 2)   // S+W
    case "0,3": return PipeTile(kind: .corner,   rotation: 3)   // W+N
    default:    return PipeTile(kind: .cross,    rotation: 0)
    }
}

/// from→to 의 방향 (인접 cell 가정). 0=N, 1=E, 2=S, 3=W.
private func pipeDirFromTo(_ from: (Int, Int), _ to: (Int, Int)) -> Int {
    let dr = to.0 - from.0
    let dc = to.1 - from.1
    if dr == -1 { return 0 }
    if dc == 1  { return 1 }
    if dr == 1  { return 2 }
    return 3
}

/// (0,0)→(size-1,size-1) 의 보장 경로 1개 (DFS 랜덤). 웹 genSolutionPath 동치.
private func pipeGenSolutionPath(size: Int) -> [(Int, Int)] {
    var visited = Array(repeating: Array(repeating: false, count: size), count: size)
    var path: [(Int, Int)] = []
    func dfs(_ r: Int, _ c: Int) -> Bool {
        visited[r][c] = true
        path.append((r, c))
        if r == size - 1 && c == size - 1 { return true }
        var dirs: [(Int, Int)] = [(0, 1), (1, 0), (0, -1), (-1, 0)]
        // Fisher–Yates shuffle (웹과 같은 i→0 역방향)
        for i in stride(from: dirs.count - 1, to: 0, by: -1) {
            let j = Int.random(in: 0...i)
            dirs.swapAt(i, j)
        }
        for (dr, dc) in dirs {
            let nr = r + dr, nc = c + dc
            if nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc] {
                if dfs(nr, nc) { return true }
            }
        }
        visited[r][c] = false
        path.removeLast()
        return false
    }
    _ = dfs(0, 0)
    return path
}

/// 해법 경로를 깐 후 나머지 타일을 난이도별 분포로 채우고, 마지막에 모든
/// 타일 rotation 을 0..3 랜덤으로 흩는다 (사용자가 회전으로 맞추는 게임).
/// 웹 makeGrid 동치.
private func pipeMakeGrid(size: Int, difficulty: Int) -> [[PipeTile]] {
    let path = pipeGenSolutionPath(size: size)
    var onPath: [String: PipeTile] = [:]
    for i in 0..<path.count {
        let (r, c) = path[i]
        let inDir: Int
        let outDir: Int
        if i == 0 {
            // 시작 cell — 외부 W 에서 들어와 다음 cell 로 나감
            inDir = 3
            outDir = pipeDirFromTo((r, c), path[i + 1])
        } else if i == path.count - 1 {
            // 끝 cell — 이전 cell 에서 들어와 외부 E 로 나감
            inDir = pipeDirFromTo((r, c), path[i - 1])
            outDir = 1
        } else {
            inDir = pipeDirFromTo((r, c), path[i - 1])
            outDir = pipeDirFromTo((r, c), path[i + 1])
        }
        let tile: PipeTile
        if inDir == outDir {
            // 동일 방향 두 개는 표현 불가 — cross 로 폴백 (웹과 동일).
            tile = PipeTile(kind: .cross, rotation: 0)
        } else {
            tile = pipeTileForDirs(inDir, outDir)
        }
        onPath["\(r),\(c)"] = tile
    }

    var grid: [[PipeTile]] = []
    for r in 0..<size {
        var row: [PipeTile] = []
        for c in 0..<size {
            if let onP = onPath["\(r),\(c)"] {
                row.append(onP)
            } else {
                let roll = Double.random(in: 0..<1)
                let kind: PipeKind
                if difficulty == 1 {
                    kind = roll < 0.5 ? .straight : .corner
                } else if difficulty == 2 {
                    kind = roll < 0.4 ? .straight : roll < 0.8 ? .corner : .cross
                } else {
                    kind = roll < 0.3 ? .straight : roll < 0.85 ? .corner : .cross
                }
                row.append(PipeTile(kind: kind, rotation: 0))
            }
        }
        grid.append(row)
    }
    // 모든 타일 회전 흩기 — 사용자가 정렬하는 게임.
    for r in 0..<size {
        for c in 0..<size {
            grid[r][c].rotation = Int.random(in: 0..<4)
        }
    }
    return grid
}

/// (0,0)→(size-1,size-1) 까지 회전 후 opening 이 연결됐는가? 웹 isConnected 동치.
/// - start 의 W (외부 입구) opening 이 false 면 즉시 false.
/// - end   의 E (외부 출구) opening 이 false 면 즉시 false.
/// - 그 외엔 DFS 로 양쪽 마주보는 opening 만 통과.
private func pipeIsConnected(_ grid: [[PipeTile]]) -> Bool {
    let size = grid.count
    guard size > 0 else { return false }
    let startOps = pipeOpenings(grid[0][0])
    let endOps = pipeOpenings(grid[size - 1][size - 1])
    if !startOps.3 { return false }     // W
    if !endOps.1   { return false }     // E
    var visited = Set<String>()
    var stack: [(Int, Int)] = [(0, 0)]
    while let (r, c) = stack.popLast() {
        let key = "\(r),\(c)"
        if visited.contains(key) { continue }
        visited.insert(key)
        if r == size - 1 && c == size - 1 { return true }
        let ops = pipeOpenings(grid[r][c])
        // N
        if ops.0 && r > 0 {
            let adj = pipeOpenings(grid[r - 1][c])
            if adj.2 { stack.append((r - 1, c)) }
        }
        // E
        if ops.1 && c < size - 1 {
            let adj = pipeOpenings(grid[r][c + 1])
            if adj.3 { stack.append((r, c + 1)) }
        }
        // S
        if ops.2 && r < size - 1 {
            let adj = pipeOpenings(grid[r + 1][c])
            if adj.0 { stack.append((r + 1, c)) }
        }
        // W
        if ops.3 && c > 0 {
            let adj = pipeOpenings(grid[r][c - 1])
            if adj.1 { stack.append((r, c - 1)) }
        }
    }
    return false
}

struct PipeConnectGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var grid: [[PipeTile]] = []
    @State private var timeRemaining: Double
    @State private var startedAt: Date?
    @State private var result: Bool? = nil   // success 즉시 마킹 (중복 onComplete 방지)

    /// 웹 동일 — 1=3×3 / 2=4×4 / 3=4×4 (난이도 시간만 짧음).
    private var size: Int { difficulty == 1 ? 3 : 4 }
    /// 웹 동일 — 30/35/25s.
    private var totalSeconds: Double {
        difficulty == 1 ? 30 : difficulty == 2 ? 35 : 25
    }

    init(difficulty: Int, onComplete: @escaping (Bool) -> Void) {
        self.difficulty = difficulty
        self.onComplete = onComplete
        _timeRemaining = State(initialValue: difficulty == 1 ? 30 : difficulty == 2 ? 35 : 25)
    }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text("파이프 연결").typography(.title).foregroundStyle(Color.accentPrimary)
                Spacer()
                Text(String(format: "%.1fs", max(0, timeRemaining)))
                    .typography(.caption).monospacedDigit().foregroundStyle(Color.textSecondary)
            }
            Text("좌상단(◀) → 우하단(▶) 연결되도록 탭으로 회전")
                .typography(.caption).foregroundStyle(Color.textTertiary)
            gridView
            if let r = result {
                Text(r ? "연결 성공!" : "실패")
                    .typography(.body)
                    .foregroundStyle(r ? Color.accentPrimary : Color.colorError)
            }
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear {
            startedAt = Date()
            grid = pipeMakeGrid(size: size, difficulty: difficulty)
        }
        .onReceive(Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt, result == nil else { return }
            let elapsed = Date().timeIntervalSince(s)
            timeRemaining = max(0, totalSeconds - elapsed)
            if timeRemaining <= 0 {
                result = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { onComplete(false) }
                startedAt = nil
            }
        }
    }

    private var gridView: some View {
        VStack(spacing: 4) {
            ForEach(0..<size, id: \.self) { r in
                HStack(spacing: 4) {
                    ForEach(0..<size, id: \.self) { c in
                        Button { rotate(r: r, c: c) } label: {
                            ZStack {
                                Rectangle()
                                    .fill(isStartOrEnd(r, c) ? Color.accentPrimary.opacity(0.4)
                                          : Color.bgElevated)
                                pipeShape(grid[safeRow: r]?[safeCol: c])
                                    .rotationEffect(.degrees(Double(grid[safeRow: r]?[safeCol: c]?.rotation ?? 0) * 90))
                            }
                            .frame(width: 52, height: 52)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .disabled(result != nil)
                        .accessibilityLabel(Text("타일 \(r + 1) 행 \(c + 1) 열"))
                    }
                }
            }
        }
    }

    private func rotate(r: Int, c: Int) {
        guard result == nil, r < grid.count, c < grid[r].count else { return }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardFlip)
        grid[r][c].rotation = (grid[r][c].rotation + 1) % 4
        if pipeIsConnected(grid) {
            result = true
            Haptics.play(.success)
            SoundPlayer.shared.play(.complete)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                onComplete(true)
                startedAt = nil
            }
        }
    }

    /// 타일 모양 — baseOpenings 만 그리고 회전은 rotationEffect 가 처리.
    @ViewBuilder
    private func pipeShape(_ tile: PipeTile?) -> some View {
        if let tile {
            let ops = pipeBaseOpenings(tile.kind)
            ZStack {
                // 중심 hub
                Circle().fill(Color.accentPrimary).frame(width: 10, height: 10)
                // N (위쪽 절반)
                if ops.0 {
                    Rectangle().fill(Color.accentPrimary)
                        .frame(width: 8, height: 26)
                        .offset(y: -13)
                }
                // E (오른쪽 절반)
                if ops.1 {
                    Rectangle().fill(Color.accentPrimary)
                        .frame(width: 26, height: 8)
                        .offset(x: 13)
                }
                // S (아래쪽 절반)
                if ops.2 {
                    Rectangle().fill(Color.accentPrimary)
                        .frame(width: 8, height: 26)
                        .offset(y: 13)
                }
                // W (왼쪽 절반)
                if ops.3 {
                    Rectangle().fill(Color.accentPrimary)
                        .frame(width: 26, height: 8)
                        .offset(x: -13)
                }
            }
        } else {
            EmptyView()
        }
    }

    private func isStartOrEnd(_ r: Int, _ c: Int) -> Bool {
        (r == 0 && c == 0) || (r == size - 1 && c == size - 1)
    }
}

// 안전 인덱싱 (보드 초기화 race 방지).
private extension Array {
    subscript(safeRow row: Int) -> Element? {
        (row >= 0 && row < count) ? self[row] : nil
    }
}
private extension Array where Element == PipeTile {
    subscript(safeCol col: Int) -> PipeTile? {
        (col >= 0 && col < count) ? self[col] : nil
    }
}

// MARK: - 2. SequenceMemo (Simon-says)

struct SequenceMemoGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var sequence: [Int] = []
    @State private var userInput: [Int] = []
    @State private var phase: SMPhase = .show
    @State private var showingIndex: Int = -1
    @State private var lit: Int = -1

    private enum SMPhase { case show, input, done }
    private var length: Int { difficulty == 1 ? 4 : difficulty == 2 ? 6 : 8 }
    private let colors: [Color] = [.accentPrimary, .accentCyan, .accentFushia, .accentSecondary]

    var body: some View {
        VStack(spacing: 16) {
            Text("순서 기억").typography(.title).foregroundStyle(Color.accentPrimary)
            Text(phase == .show ? "점등 순서를 기억하세요"
                 : phase == .input ? "순서대로 탭" : "")
                .typography(.caption).foregroundStyle(Color.textSecondary)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
                ForEach(0..<4, id: \.self) { i in
                    Button {
                        guard phase == .input else { return }
                        Haptics.play(.selection)
                        flash(i)
                        userInput.append(i)
                        if userInput.last != sequence[userInput.count - 1] {
                            onComplete(false); phase = .done
                            return
                        }
                        if userInput.count == sequence.count {
                            onComplete(true); phase = .done
                        }
                    } label: {
                        Circle()
                            .fill(colors[i])
                            .opacity(lit == i ? 1 : 0.4)
                            .frame(width: 100, height: 100)
                            .shadow(color: colors[i].opacity(lit == i ? 0.8 : 0), radius: 16)
                    }
                    .buttonStyle(.plain)
                    .disabled(phase != .input)
                }
            }
            .padding(.horizontal, 32)
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { startSequence() }
    }

    private func startSequence() {
        sequence = (0..<length).map { _ in Int.random(in: 0...3) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { playSequence(idx: 0) }
    }

    private func playSequence(idx: Int) {
        guard idx < sequence.count else { phase = .input; return }
        flash(sequence[idx])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            playSequence(idx: idx + 1)
        }
    }

    private func flash(_ i: Int) {
        lit = i
        SoundPlayer.shared.play(.cardSelect)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            if lit == i { lit = -1 }
        }
    }
}

// MARK: - 3. DodgeDrops

struct DodgeDropsGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var playerX: CGFloat = 0.5
    @State private var drops: [Drop] = []
    @State private var elapsed: Double = 0
    @State private var startedAt: Date?
    @State private var failed: Bool = false

    private var duration: Double { difficulty == 1 ? 10 : difficulty == 2 ? 14 : 18 }
    private var spawnRate: Double { difficulty == 1 ? 0.6 : difficulty == 2 ? 0.4 : 0.28 }
    private var fallSpeed: Double { difficulty == 1 ? 0.25 : difficulty == 2 ? 0.35 : 0.5 }

    private struct Drop: Identifiable { let id = UUID(); var x: Double; var y: Double }

    var body: some View {
        VStack {
            Text("낙하 회피").typography(.title).foregroundStyle(Color.accentPrimary)
            Text(String(format: "%.1fs 남음", max(0, duration - elapsed)))
                .typography(.caption).foregroundStyle(Color.textSecondary).monospacedDigit()
            GeometryReader { geo in
                ZStack {
                    Color.bgElevated
                    // drops
                    ForEach(drops) { d in
                        Circle()
                            .fill(Color.accentSecondary)
                            .frame(width: 16, height: 16)
                            .position(x: geo.size.width * d.x, y: geo.size.height * d.y)
                    }
                    // player
                    Capsule()
                        .fill(Color.accentPrimary)
                        .frame(width: 60, height: 16)
                        .position(x: geo.size.width * playerX, y: geo.size.height - 28)
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .gesture(
                    DragGesture()
                        .onChanged { g in
                            playerX = max(0.05, min(0.95, g.location.x / geo.size.width))
                        }
                )
            }
            .frame(height: 360)
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { startedAt = Date() }
        .onReceive(Timer.publish(every: 1.0/30, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt, !failed else { return }
            elapsed = Date().timeIntervalSince(s)
            // 스폰
            if Double.random(in: 0..<1) < spawnRate / 30 {
                drops.append(Drop(x: Double.random(in: 0.05...0.95), y: 0))
            }
            // 갱신 + 충돌
            var alive: [Drop] = []
            for var d in drops {
                d.y += fallSpeed / 30
                // 플레이어 충돌 (y > 0.92 + x 근접)
                if d.y > 0.88 && abs(d.x - playerX) < 0.08 {
                    failed = true
                    onComplete(false)
                    return
                }
                if d.y < 1.05 { alive.append(d) }
            }
            drops = alive
            if elapsed >= duration {
                onComplete(true)
                startedAt = nil
            }
        }
    }
}

// MARK: - 4. SortItems

struct SortItemsGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var items: [SortItem] = []
    @State private var timeRemaining: Double
    @State private var startedAt: Date?

    private var count: Int { difficulty == 1 ? 6 : difficulty == 2 ? 9 : 12 }

    private struct SortItem: Identifiable {
        let id = UUID()
        let kind: Int  // 0..2 색
        var bin: Int?  // nil=대기, 0/1/2 = 비닐
    }

    init(difficulty: Int, onComplete: @escaping (Bool) -> Void) {
        self.difficulty = difficulty
        self.onComplete = onComplete
        _timeRemaining = State(initialValue: difficulty == 1 ? 20 : difficulty == 2 ? 16 : 12)
    }

    private let binColors: [Color] = [.accentPrimary, .accentCyan, .accentFushia]

    var body: some View {
        VStack(spacing: 16) {
            Text("분류").typography(.title).foregroundStyle(Color.accentPrimary)
            Text(String(format: "%.1fs", max(0, timeRemaining)))
                .typography(.caption).foregroundStyle(Color.textSecondary).monospacedDigit()
            // 미분류 아이템 — 탭하면 빈 토글
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)) {
                ForEach($items) { $item in
                    if item.bin == nil {
                        Button {
                            withAnimation { item.bin = item.kind }
                            Haptics.play(.selection)
                            checkDone()
                        } label: {
                            Circle()
                                .fill(binColors[item.kind])
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Divider().background(Color.textTertiary)
            // 비닐 3개
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { i in
                    VStack {
                        Text("비닐 \(i+1)").typography(.micro).foregroundStyle(Color.textTertiary)
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(binColors[i], lineWidth: 2)
                            .frame(height: 80)
                            .overlay(
                                Text("\(items.filter { $0.bin == i }.count)")
                                    .typography(.heading)
                                    .foregroundStyle(binColors[i])
                            )
                    }
                }
            }
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear {
            items = (0..<count).map { _ in SortItem(kind: Int.random(in: 0...2), bin: nil) }
            startedAt = Date()
        }
        .onReceive(Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt else { return }
            let elapsed = Date().timeIntervalSince(s)
            timeRemaining = max(0, Double(difficulty == 1 ? 20 : difficulty == 2 ? 16 : 12) - elapsed)
            if timeRemaining <= 0 { onComplete(false); startedAt = nil }
        }
    }

    private func checkDone() {
        if items.allSatisfy({ $0.bin != nil }) {
            // 모두 올바르게 분류 (kind == bin)
            let correct = items.allSatisfy { $0.kind == $0.bin }
            onComplete(correct)
            startedAt = nil
        }
    }
}

// MARK: - 5. QuickSum

struct QuickSumGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var question: (a: Int, b: Int) = (0, 0)
    @State private var options: [Int] = []
    @State private var correct: Int = 0
    @State private var round: Int = 0
    @State private var streak: Int = 0
    @State private var timeRemaining: Double
    @State private var startedAt: Date?

    private var rounds: Int { difficulty == 1 ? 5 : difficulty == 2 ? 8 : 12 }
    private var pass: Int { rounds * 70 / 100 }

    init(difficulty: Int, onComplete: @escaping (Bool) -> Void) {
        self.difficulty = difficulty
        self.onComplete = onComplete
        _timeRemaining = State(initialValue: difficulty == 1 ? 60 : difficulty == 2 ? 50 : 40)
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("암산").typography(.title).foregroundStyle(Color.accentPrimary)
                Spacer()
                Text("\(round + 1) / \(rounds)").typography(.caption).foregroundStyle(Color.textSecondary)
            }
            Text("\(question.a) + \(question.b) = ?")
                .typography(.display).foregroundStyle(Color.textPrimary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(options, id: \.self) { opt in
                    Button { answer(opt) } label: {
                        Text("\(opt)")
                            .typography(.heading).foregroundStyle(Color.bgPrimary)
                            .frame(maxWidth: .infinity).frame(height: 56)
                            .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            Text(String(format: "남은 시간 %.0fs · 정답 %d개", max(0, timeRemaining), streak))
                .typography(.micro).foregroundStyle(Color.textTertiary)
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { startedAt = Date(); nextQuestion() }
        .onReceive(Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt else { return }
            timeRemaining = max(0, Double(difficulty == 1 ? 60 : difficulty == 2 ? 50 : 40) - Date().timeIntervalSince(s))
            if timeRemaining <= 0 { onComplete(streak >= pass); startedAt = nil }
        }
    }

    private func nextQuestion() {
        let maxN = difficulty == 1 ? 12 : difficulty == 2 ? 25 : 50
        let a = Int.random(in: 2...maxN)
        let b = Int.random(in: 2...maxN)
        question = (a, b)
        correct = a + b
        var opts = [correct]
        while opts.count < 4 {
            let o = correct + Int.random(in: -10...10)
            if !opts.contains(o) && o != correct { opts.append(o) }
        }
        options = opts.shuffled()
    }

    private func answer(_ pick: Int) {
        if pick == correct {
            streak += 1
            Haptics.play(.success)
        } else {
            Haptics.play(.warning)
        }
        round += 1
        if round >= rounds {
            onComplete(streak >= pass)
            startedAt = nil
        } else {
            nextQuestion()
        }
    }
}

// MARK: - 6. SpotDiff (단순화 — 4 차이 중 3 탭)

struct SpotDiffGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var diffsFound: Set<Int> = []
    @State private var timeRemaining: Double
    @State private var startedAt: Date?

    private var totalDiffs: Int { difficulty == 1 ? 3 : difficulty == 2 ? 4 : 5 }
    private var need: Int { totalDiffs - 1 }  // 1개 놓쳐도 통과
    /// 0..1 좌표 (보드 비례)
    private static let diffPositions: [(Double, Double)] = [
        (0.25, 0.30), (0.65, 0.45), (0.40, 0.70), (0.80, 0.20), (0.15, 0.65)
    ]

    init(difficulty: Int, onComplete: @escaping (Bool) -> Void) {
        self.difficulty = difficulty
        self.onComplete = onComplete
        _timeRemaining = State(initialValue: difficulty == 1 ? 30 : difficulty == 2 ? 24 : 18)
    }

    var body: some View {
        VStack(spacing: 12) {
            Text("틀린 그림 찾기").typography(.title).foregroundStyle(Color.accentPrimary)
            Text("\(diffsFound.count) / \(totalDiffs) 찾음 · \(String(format: "%.0fs", max(0, timeRemaining)))")
                .typography(.caption).foregroundStyle(Color.textSecondary).monospacedDigit()
            GeometryReader { geo in
                ZStack {
                    Color.bgElevated
                    // 배경 무늬
                    ForEach(0..<24, id: \.self) { i in
                        Rectangle()
                            .fill(Color.textTertiary.opacity(0.2))
                            .frame(width: 20, height: 20)
                            .position(
                                x: geo.size.width * Double(i % 6) / 6 + geo.size.width / 12,
                                y: geo.size.height * Double(i / 6) / 4 + geo.size.height / 8
                            )
                    }
                    // 정답 표시 (찾은 것만)
                    ForEach(Array(diffsFound), id: \.self) { idx in
                        Circle()
                            .stroke(Color.accentPrimary, lineWidth: 3)
                            .frame(width: 40, height: 40)
                            .position(
                                x: geo.size.width * Self.diffPositions[idx].0,
                                y: geo.size.height * Self.diffPositions[idx].1
                            )
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .onTapGesture { loc in
                    handleTap(loc, in: geo.size)
                }
            }
            .frame(height: 300)
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { startedAt = Date() }
        .onReceive(Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt else { return }
            timeRemaining = max(0, Double(difficulty == 1 ? 30 : difficulty == 2 ? 24 : 18) - Date().timeIntervalSince(s))
            if timeRemaining <= 0 { onComplete(diffsFound.count >= need); startedAt = nil }
        }
    }

    private func handleTap(_ loc: CGPoint, in size: CGSize) {
        for i in 0..<totalDiffs {
            let cx = size.width * Self.diffPositions[i].0
            let cy = size.height * Self.diffPositions[i].1
            if abs(loc.x - cx) < 24 && abs(loc.y - cy) < 24 {
                diffsFound.insert(i)
                Haptics.play(.success)
                if diffsFound.count >= need {
                    onComplete(true)
                    startedAt = nil
                }
                return
            }
        }
        Haptics.play(.warning)
    }
}

// MARK: - 7. BreathHold

struct BreathHoldGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var holding: Bool = false
    @State private var startTime: Date?
    @State private var elapsed: Double = 0
    @State private var phase: BHPhase = .idle
    @State private var totalDuration: TimeInterval = 0

    private enum BHPhase { case idle, holding, done }

    /// 목표 시간 (초). 난이도 1=3s, 2=5s, 3=8s. 허용 오차 ±0.4s.
    private var target: Double { difficulty == 1 ? 3.0 : difficulty == 2 ? 5.0 : 8.0 }
    private var tolerance: Double { 0.4 }

    var body: some View {
        VStack(spacing: 20) {
            Text("호흡 멈춤").typography(.title).foregroundStyle(Color.accentPrimary)
            Text("목표: \(String(format: "%.1fs", target)) ± \(String(format: "%.1fs", tolerance))")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            Circle()
                .fill(holding ? Color.accentCyan : Color.bgElevated)
                .frame(width: 200, height: 200)
                .scaleEffect(holding ? 1.05 : 1.0)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: holding)
                .overlay(
                    Text(holding ? String(format: "%.1fs", elapsed) : "탭 후 홀드")
                        .typography(.title)
                        .foregroundStyle(Color.bgPrimary)
                )
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in
                            if !holding {
                                holding = true
                                startTime = Date()
                                Haptics.play(.medium)
                            }
                        }
                        .onEnded { _ in
                            if holding {
                                holding = false
                                phase = .done
                                totalDuration = elapsed
                                let diff = abs(elapsed - target)
                                let success = diff <= tolerance
                                Haptics.play(success ? .success : .warning)
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                                    onComplete(success)
                                }
                            }
                        }
                )
            if phase == .done {
                Text(String(format: "%.2fs (목표 %.1fs)", totalDuration, target))
                    .typography(.caption).foregroundStyle(Color.textPrimary)
            }
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onReceive(Timer.publish(every: 1.0/30, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startTime, holding else { return }
            elapsed = Date().timeIntervalSince(s)
        }
    }
}

// MARK: - 8. TracePath

struct TracePathGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var progress: Double = 0
    @State private var failed: Bool = false
    @State private var pathPoints: [CGPoint] = []
    @State private var traceOffset: CGSize = .zero
    @State private var dragging: Bool = false
    @State private var maxDeviation: Double = 0
    @State private var startedAt: Date?

    private var tolerance: Double { difficulty == 1 ? 30 : difficulty == 2 ? 20 : 12 }
    private var totalDuration: Double { difficulty == 1 ? 8 : difficulty == 2 ? 6 : 4 }

    var body: some View {
        VStack(spacing: 12) {
            Text("경로 따라가기").typography(.title).foregroundStyle(Color.accentPrimary)
            Text("녹색 선을 따라 드래그").typography(.caption).foregroundStyle(Color.textSecondary)
            GeometryReader { geo in
                let pts = computePath(in: geo.size)
                ZStack {
                    Color.bgElevated.clipShape(RoundedRectangle(cornerRadius: 12))
                    // 경로
                    Path { p in
                        guard let first = pts.first else { return }
                        p.move(to: first)
                        for pt in pts.dropFirst() { p.addLine(to: pt) }
                    }
                    .stroke(Color.accentPrimary, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    // 시작 마커
                    if let first = pts.first {
                        Circle().fill(Color.accentCyan).frame(width: 24, height: 24)
                            .position(first)
                    }
                    // 진행 마커
                    if progress > 0 && progress < 1 {
                        let idx = min(Int(progress * Double(pts.count - 1)), pts.count - 1)
                        Circle().fill(Color.accentPrimary).frame(width: 14, height: 14)
                            .position(pts[idx])
                    }
                }
                .gesture(
                    DragGesture()
                        .onChanged { g in
                            dragging = true
                            // 현재 진행 위치의 path point 와 사용자 위치 거리 측정
                            let idx = min(Int(progress * Double(pts.count - 1)), pts.count - 1)
                            let target = pts[idx]
                            let dev = hypot(g.location.x - target.x, g.location.y - target.y)
                            maxDeviation = max(maxDeviation, Double(dev))
                            if dev > tolerance {
                                failed = true
                                onComplete(false)
                            } else {
                                // 진행 — drag location 으로부터 가장 가까운 path index 찾기
                                var bestIdx = idx
                                var bestDist: CGFloat = .infinity
                                for i in idx..<min(idx + 30, pts.count) {
                                    let d = hypot(g.location.x - pts[i].x, g.location.y - pts[i].y)
                                    if d < bestDist { bestDist = d; bestIdx = i }
                                }
                                progress = Double(bestIdx) / Double(pts.count - 1)
                                if progress >= 0.98 {
                                    onComplete(true)
                                }
                            }
                        }
                        .onEnded { _ in dragging = false }
                )
            }
            .frame(height: 320)
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { startedAt = Date() }
        .onReceive(Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt else { return }
            if Date().timeIntervalSince(s) > totalDuration && progress < 0.95 {
                onComplete(false)
                startedAt = nil
            }
        }
    }

    /// 사인 곡선 경로 좌→우 + 진동 (난이도별 진폭).
    private func computePath(in size: CGSize) -> [CGPoint] {
        let amp = difficulty == 1 ? 30.0 : difficulty == 2 ? 50.0 : 70.0
        let cycles = Double(difficulty)
        let count = 100
        return (0...count).map { i in
            let t = Double(i) / Double(count)
            let x = 40 + t * (Double(size.width) - 80)
            let y = Double(size.height) / 2 + sin(t * cycles * 2 * .pi) * amp
            return CGPoint(x: x, y: y)
        }
    }
}
