import SwiftUI

enum DuoInviteLink {
    static let origin = "https://up-next-phi.vercel.app"
    static func code(_ raw: String) -> String? {
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return code.range(of: "^[A-Z2-9]{6}$", options: .regularExpression) != nil ? code : nil
    }
    static func url(_ code: String) -> URL { URL(string: "\(origin)/i/\(code)")! }
    static func parse(_ url: URL) -> String? {
        guard url.user == nil, url.password == nil else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "https", url.host == "up-next-phi.vercel.app", (url.port == nil || url.port == 443),
           parts.count == 2, parts[0] == "i" { return code(parts[1]) }
        if url.scheme == "upnext", url.host == "invite", url.port == nil, parts.count == 1 { return code(parts[0]) }
        return nil
    }
    static func text(_ key: String.LocalizationValue) -> String {
        String(localized: key, table: "DuoInvite", bundle: AppConfig.inAppBundle ?? .main,
               locale: AppConfig.currentLocale)
    }
}

struct DuoInvitePresenter: View {
    @EnvironmentObject private var store: GameStore
    @ObservedObject var duo: DuoStore
    var body: some View {
        if case .ready = store.phase, let code = duo.pendingInviteCode,
           !store.showLoginOverlay, store.mergeConflict == nil {
            OverlayContainer {
                VStack(spacing: 20) {
                    HStack(spacing: 22) {
                        PixelIcon(.flame, size: 38, color: .accentCyan)
                        PixelIcon(.plus, size: 16, color: .textTertiary)
                        PixelIcon(.flame, size: 38, color: .accentCyan)
                    }.accessibilityHidden(true)
                    Text(DuoInviteLink.text("title")).typography(.title).foregroundStyle(Color.textPrimary)
                    if duo.activeDuo != nil {
                        Text(DuoInviteLink.text("connected"))
                            .typography(.body).foregroundStyle(Color.textSecondary).multilineTextAlignment(.center)
                    }
                    if let message = duo.message {
                        Text(LocalizedStringKey(message)).typography(.caption).foregroundStyle(Color.textSecondary)
                    }
                    if duo.activeDuo == nil {
                        Button {
                            if store.auth.uid == nil { store.promptLogin() }
                            else { duo.joinInvite(code: code) }
                        } label: {
                            Text(DuoInviteLink.text(store.auth.uid == nil ? "login" : "join"))
                        }
                        .buttonStyle(.un(.primary, tint: .accentCyan))
                        .disabled(duo.isWorking)
                        .accessibilityIdentifier("duoAcceptLinkButton")
                    }
                    Button { duo.dismissInviteLink() } label: {
                        Text(DuoInviteLink.text(duo.activeDuo == nil ? "later" : "done"))
                    }.buttonStyle(.un(.secondary))
                    .accessibilityIdentifier("duoDismissLinkButton")
                }
                .padding(20).frame(maxWidth: 380)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
                .padding(.horizontal, 16)
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.isModal)
            }
            .preferredColorScheme(.dark)
        }
    }
}
