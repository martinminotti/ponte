import UIKit
import Capacitor

/// Barra in basso nativa, in Liquid Glass vero su iOS 26 (UIGlassEffect), materiale traslucido sulle versioni precedenti.
/// Sta sopra la WebView: il contenuto web scorre sotto e il vetro lo rifrange.
///
/// JS:
///   NativeBar.configure({ mode: "tabs", tabs: [{ id, label, symbol }], selected, accessory: { id, symbol, label }, dark })
///   NativeBar.configure({ mode: "actions", actions: [{ id, label, symbol, style: "primary" | "wa" | "plain", disabled }], dark })
///   NativeBar.configure({ mode: "hidden" })
///   NativeBar.setCompact({ compact })
///   evento "select" { id }
@objc(NativeBarPlugin)
public class NativeBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeBarPlugin"
    public let jsName = "NativeBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCompact", returnType: CAPPluginReturnPromise),
    ]

    private var bar: GlassBar?

    override public func load() {
        DispatchQueue.main.async { self.install() }
    }

    private func install() {
        guard bar == nil, let host = bridge?.viewController?.view else { return }
        let b = GlassBar { [weak self] id in self?.notifyListeners("select", data: ["id": id]) }
        b.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(b)
        NSLayoutConstraint.activate([
            b.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            b.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            b.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            b.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -110),
        ])
        bar = b
    }

    @objc public func configure(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "hidden"
        let dark = call.getBool("dark")
        let tabs: [BarItem] = (call.options["tabs"] as? [[String: Any]] ?? []).compactMap { BarItem($0) }
        let actions: [BarItem] = (call.options["actions"] as? [[String: Any]] ?? []).compactMap { BarItem($0) }
        let accessory = (call.options["accessory"] as? [String: Any]).flatMap { BarItem($0) }
        let selected = call.getString("selected")
        DispatchQueue.main.async {
            self.install()
            guard let bar = self.bar else { return call.resolve() }
            if let dark { bar.overrideUserInterfaceStyle = dark ? .dark : .light }
            bar.superview?.bringSubviewToFront(bar)
            switch mode {
            case "tabs": bar.showTabs(tabs, selected: selected, accessory: accessory)
            case "actions": bar.showActions(actions)
            default: bar.hide()
            }
            call.resolve()
        }
    }

    @objc public func setCompact(_ call: CAPPluginCall) {
        let compact = call.getBool("compact") ?? false
        DispatchQueue.main.async {
            self.bar?.setCompact(compact)
            call.resolve()
        }
    }
}

struct BarItem: Equatable {
    let id: String
    let label: String
    let symbol: String
    let style: String
    let disabled: Bool

    init?(_ d: [String: Any]) {
        guard let id = d["id"] as? String else { return nil }
        self.id = id
        label = d["label"] as? String ?? ""
        symbol = d["symbol"] as? String ?? ""
        style = d["style"] as? String ?? "plain"
        disabled = d["disabled"] as? Bool ?? false
    }
}

// MARK: - colori Ponte

enum Ponte {
    static let accent = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0xFF7A2E) : UIColor(hex: 0xFF6A13) }
    static let accentInk = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0xFF8A47) : UIColor(hex: 0xB54300) }
    static let onAccent = UIColor(hex: 0x1C1B19)
    static let wa = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x25C26A) : UIColor(hex: 0x0F7F43) }
    static let onWa = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x04210F) : .white }
    static let ink = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0xF3F1ED) : UIColor(hex: 0x1C1B19) }
    static let lens = UIColor { $0.userInterfaceStyle == .dark ? UIColor.white.withAlphaComponent(0.14) : UIColor.black.withAlphaComponent(0.07) }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

// MARK: - materiale

enum Glass {
    /// Liquid Glass se compilato con l'SDK di iOS 26 e in esecuzione su iOS 26; altrimenti il materiale cromato di sistema.
    static func effect(tint: UIColor? = nil) -> UIVisualEffect {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let g = UIGlassEffect()
            g.tintColor = tint
            g.isInteractive = true
            return g
        }
        #endif
        return UIBlurEffect(style: .systemChromeMaterial)
    }

    static var isLiquid: Bool {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }

    static func view(tint: UIColor? = nil, radius: CGFloat) -> UIVisualEffectView {
        let v = UIVisualEffectView(effect: effect(tint: tint))
        v.layer.cornerRadius = radius
        v.layer.cornerCurve = .continuous
        if !isLiquid {
            v.clipsToBounds = true
            // senza vetro liquido il colore va su uno strato pieno, non sul materiale
            if let tint { v.contentView.backgroundColor = tint }
            v.layer.borderWidth = 0.5
            v.layer.borderColor = UIColor.white.withAlphaComponent(0.35).cgColor
        }
        return v
    }
}

// MARK: - vista che lascia passare i tocchi fuori dai controlli

class PassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let v = super.hitTest(point, with: event)
        return v === self ? nil : v
    }
}

/// Riga di controlli: i tocchi negli spazi fra un controllo e l'altro arrivano alla pagina sotto.
final class PassthroughStack: UIStackView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let v = super.hitTest(point, with: event)
        return v === self ? nil : v
    }
}

// MARK: - barra

final class GlassBar: PassthroughView {
    private let onSelect: (String) -> Void
    private let row = PassthroughStack()
    private var rowHeight: NSLayoutConstraint!
    private var mode = "hidden"
    private var tabs: [BarItem] = []
    private var actions: [BarItem] = []
    private var accessory: BarItem?
    private var compact = false
    private weak var tabsView: TabsView?
    private let tick = UISelectionFeedbackGenerator()

    init(onSelect: @escaping (String) -> Void) {
        self.onSelect = onSelect
        super.init(frame: .zero)
        row.axis = .horizontal
        row.spacing = 10
        row.alignment = .fill
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        rowHeight = row.heightAnchor.constraint(equalToConstant: 62)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -14),
            row.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -4),
            rowHeight,
        ])
        row.alpha = 0
        row.isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    // MARK: modi

    func showTabs(_ items: [BarItem], selected: String?, accessory acc: BarItem?) {
        if mode == "tabs", items == tabs, acc == accessory, let tv = tabsView {
            tv.select(selected, animated: true)
            return
        }
        mode = "tabs"
        tabs = items
        accessory = acc
        rebuild {
            let tv = TabsView(items: items, compact: self.compact) { [weak self] id in
                self?.tick.selectionChanged()
                self?.onSelect(id)
            }
            tv.select(selected, animated: false)
            self.tabsView = tv
            self.row.addArrangedSubview(tv)
            if let acc {
                let plus = GlassButton(item: acc, tint: Ponte.accent, foreground: Ponte.onAccent, round: true) { [weak self] in self?.onSelect(acc.id) }
                plus.widthAnchor.constraint(equalTo: plus.heightAnchor).isActive = true
                self.row.addArrangedSubview(plus)
            }
            self.rowHeight.constant = self.compact ? 52 : 62
        }
    }

    func showActions(_ items: [BarItem]) {
        if mode == "actions", items == actions { return }
        let sameShape = mode == "actions" && items.map(\.id) == actions.map(\.id)
        mode = "actions"
        actions = items
        let build = {
            for it in items {
                let tint: UIColor? = it.style == "primary" ? Ponte.accent : it.style == "wa" ? Ponte.wa : nil
                let fg: UIColor = it.style == "primary" ? Ponte.onAccent : it.style == "wa" ? Ponte.onWa : Ponte.ink
                let b = GlassButton(item: it, tint: tint, foreground: fg, round: false) { [weak self] in self?.onSelect(it.id) }
                // l'azione principale prende lo spazio, le altre stanno alla loro misura
                b.setContentHuggingPriority(it.style == "primary" ? .defaultLow : .required, for: .horizontal)
                b.setContentCompressionResistancePriority(.required, for: .horizontal)
                self.row.addArrangedSubview(b)
            }
            self.rowHeight.constant = 56
        }
        if sameShape {
            // stesso schema, testo diverso (es. "Segna: Pronto" → "Segna: Consegnato"): nessuna dissolvenza
            row.arrangedSubviews.forEach { $0.removeFromSuperview() }
            build()
        } else {
            rebuild(build)
        }
    }

    func hide() {
        guard mode != "hidden" else { return }
        mode = "hidden"
        tabs = []
        actions = []
        accessory = nil
        UIView.animate(withDuration: 0.22, delay: 0, options: [.beginFromCurrentState, .curveEaseIn]) {
            self.row.alpha = 0
            self.row.transform = CGAffineTransform(translationX: 0, y: 24).scaledBy(x: 0.96, y: 0.96)
        } completion: { _ in
            if self.mode == "hidden" {
                self.row.isHidden = true
                self.row.arrangedSubviews.forEach { $0.removeFromSuperview() }
            }
        }
    }

    func setCompact(_ c: Bool) {
        guard c != compact else { return }
        compact = c
        guard mode == "tabs" else { return }
        tabsView?.setCompact(c)
        rowHeight.constant = c ? 52 : 62
        springs { self.layoutIfNeeded() }
    }

    // MARK: transizioni

    /// Sostituisce il contenuto: la barra si "materializza" dal basso con una molla senza rimbalzo.
    private func rebuild(_ build: @escaping () -> Void) {
        let wasHidden = row.isHidden || row.alpha < 0.01
        let swap = {
            self.row.arrangedSubviews.forEach { $0.removeFromSuperview() }
            build()
            self.row.isHidden = false
            self.layoutIfNeeded()
            self.row.alpha = 0
            self.row.transform = CGAffineTransform(translationX: 0, y: 18).scaledBy(x: 0.97, y: 0.97)
            self.springs {
                self.row.alpha = 1
                self.row.transform = .identity
            }
        }
        if wasHidden {
            swap()
        } else {
            UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState]) {
                self.row.alpha = 0
            } completion: { _ in swap() }
        }
    }

    private func springs(_ body: @escaping () -> Void) {
        UIView.animate(withDuration: 0.42, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: body)
    }
}

// MARK: - capsula delle sezioni

final class TabsView: UIView {
    private let glass = Glass.view(radius: 31)
    private let lens = UIView()
    private let stack = UIStackView()
    private var buttons: [UIButton] = []
    private let items: [BarItem]
    private var selected: String?
    private var compact: Bool
    private let onSelect: (String) -> Void

    init(items: [BarItem], compact: Bool, onSelect: @escaping (String) -> Void) {
        self.items = items
        self.compact = compact
        self.onSelect = onSelect
        super.init(frame: .zero)
        glass.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glass)
        NSLayoutConstraint.activate([
            glass.topAnchor.constraint(equalTo: topAnchor),
            glass.bottomAnchor.constraint(equalTo: bottomAnchor),
            glass.leadingAnchor.constraint(equalTo: leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        lens.backgroundColor = Ponte.lens
        lens.layer.cornerCurve = .continuous
        glass.contentView.addSubview(lens)

        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        glass.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: glass.contentView.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor, constant: -4),
            stack.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 4),
            stack.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -4),
        ])
        for it in items {
            let b = UIButton(type: .custom)
            b.accessibilityLabel = it.label
            b.accessibilityIdentifier = it.id
            b.addAction(UIAction { [weak self] _ in self?.tap(it.id) }, for: .touchUpInside)
            stack.addArrangedSubview(b)
            buttons.append(b)
        }
        restyle()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    private func tap(_ id: String) {
        if id != selected { select(id, animated: true) }
        onSelect(id)
    }

    func select(_ id: String?, animated: Bool) {
        selected = id
        restyle()
        if animated {
            UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
                self.placeLens()
            }
        } else {
            setNeedsLayout()
        }
    }

    func setCompact(_ c: Bool) {
        compact = c
        restyle()
    }

    private func restyle() {
        for (i, b) in buttons.enumerated() {
            let it = items[i]
            let on = it.id == selected
            var cfg = UIButton.Configuration.plain()
            cfg.image = UIImage(systemName: it.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: compact ? 18 : 19, weight: on ? .semibold : .regular))
            cfg.imagePlacement = .top
            cfg.imagePadding = 3
            cfg.contentInsets = .zero
            cfg.baseForegroundColor = on ? Ponte.accentInk : Ponte.ink
            if !compact {
                var t = AttributedString(it.label)
                t.font = .systemFont(ofSize: 10.5, weight: on ? .semibold : .medium)
                cfg.attributedTitle = t
            }
            b.configuration = cfg
            b.accessibilityTraits = on ? [.button, .selected] : .button
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        glass.layer.cornerRadius = bounds.height / 2
        placeLens()
    }

    private func placeLens() {
        guard let i = items.firstIndex(where: { $0.id == selected }), i < buttons.count else {
            lens.alpha = 0
            return
        }
        stack.layoutIfNeeded()
        let f = stack.convert(buttons[i].frame, to: glass.contentView)
        lens.frame = f
        lens.layer.cornerRadius = f.height / 2
        lens.alpha = 1
    }
}

// MARK: - pulsante di vetro (azioni e "+")

final class GlassButton: UIView {
    private let glass: UIVisualEffectView
    private let button = UIButton(type: .custom)
    private let round: Bool

    init(item: BarItem, tint: UIColor?, foreground: UIColor, round: Bool, action: @escaping () -> Void) {
        self.round = round
        glass = Glass.view(tint: tint, radius: 28)
        super.init(frame: .zero)
        glass.translatesAutoresizingMaskIntoConstraints = false
        button.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glass)
        glass.contentView.addSubview(button)
        NSLayoutConstraint.activate([
            glass.topAnchor.constraint(equalTo: topAnchor),
            glass.bottomAnchor.constraint(equalTo: bottomAnchor),
            glass.leadingAnchor.constraint(equalTo: leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: trailingAnchor),
            button.topAnchor.constraint(equalTo: glass.contentView.topAnchor),
            button.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor),
            button.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor),
        ])
        var cfg = UIButton.Configuration.plain()
        if !item.symbol.isEmpty {
            cfg.image = UIImage(systemName: item.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: round ? 22 : 17, weight: .semibold))
        }
        if !round && !item.label.isEmpty {
            var t = AttributedString(item.label)
            t.font = .systemFont(ofSize: 17, weight: .semibold)
            cfg.attributedTitle = t
            cfg.imagePadding = 8
        }
        cfg.baseForegroundColor = foreground
        cfg.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: round ? 0 : 20, bottom: 0, trailing: round ? 0 : 20)
        button.configuration = cfg
        button.isEnabled = !item.disabled
        alpha = item.disabled ? 0.45 : 1
        button.accessibilityLabel = item.label
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        // risposta immediata alla pressione, al tocco e non al rilascio
        button.addAction(UIAction { [weak self] _ in self?.press(true) }, for: [.touchDown, .touchDragEnter])
        button.addAction(UIAction { [weak self] _ in self?.press(false) }, for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    private func press(_ down: Bool) {
        UIView.animate(withDuration: down ? 0.12 : 0.3, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.transform = down ? CGAffineTransform(scaleX: 0.96, y: 0.96) : .identity
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        glass.layer.cornerRadius = bounds.height / 2
    }
}
