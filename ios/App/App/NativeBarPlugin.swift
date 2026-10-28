import UIKit
import Capacitor

/// Barra in basso nativa, in Liquid Glass vero su iOS 26 (UIGlassEffect), materiale traslucido sulle versioni precedenti.
/// Sta sopra la WebView: il contenuto web scorre sotto e il vetro lo rifrange.
///
/// JS:
///   NativeBar.configure({ mode: "tabs", tabs: [{ id, label, symbol }], selected, accessory: { id, symbol, label }, dark })
///   NativeBar.configure({ mode: "actions", actions: [{ id, label, symbol, style: "primary" | "wa" | "plain", disabled }], dark })
///   NativeBar.configure({ mode: "hidden" })
///   NativeBar.configure({ mode: "search", text, placeholder, dark })  campo di ricerca nativo sopra la tastiera
///   NativeBar.setCompact({ compact })
///   evento "select" { id }, evento "search" { text, end }
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
        let b = GlassBar(
            onSelect: { [weak self] id in self?.notifyListeners("select", data: ["id": id]) },
            onSearch: { [weak self] text, end in self?.notifyListeners("search", data: ["text": text, "end": end]) }
        )
        b.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(b)
        NSLayoutConstraint.activate([
            b.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            b.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            b.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            // copre tutta la schermata (i tocchi fuori dai controlli passano alla pagina): serve quando la ricerca sale sopra la tastiera
            b.topAnchor.constraint(equalTo: host.topAnchor),
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
        let text = call.getString("text") ?? ""
        let placeholder = call.getString("placeholder") ?? "Cerca"
        DispatchQueue.main.async {
            self.install()
            guard let bar = self.bar else { return call.resolve() }
            if let dark { bar.overrideUserInterfaceStyle = dark ? .dark : .light }
            bar.superview?.bringSubviewToFront(bar)
            switch mode {
            case "tabs": bar.showTabs(tabs, selected: selected, accessory: accessory)
            case "actions": bar.showActions(actions)
            case "search": bar.showSearch(text: text, placeholder: placeholder)
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

    init(id: String, label: String, symbol: String, style: String = "plain", disabled: Bool = false) {
        self.id = id
        self.label = label
        self.symbol = symbol
        self.style = style
        self.disabled = disabled
    }

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
    private let onSearch: (String, Bool) -> Void
    private let row = PassthroughStack()
    private var rowHeight: NSLayoutConstraint!
    private var bottomSafe: NSLayoutConstraint!
    private var bottomKeyboard: NSLayoutConstraint!
    private weak var searchField: UITextField?
    private var mode = "hidden"
    private var tabs: [BarItem] = []
    private var actions: [BarItem] = []
    private var accessory: BarItem?
    private var compact = false
    private weak var tabsView: TabsView?
    private let tick = UISelectionFeedbackGenerator()

    init(onSelect: @escaping (String) -> Void, onSearch: @escaping (String, Bool) -> Void) {
        self.onSelect = onSelect
        self.onSearch = onSearch
        super.init(frame: .zero)
        row.axis = .horizontal
        row.spacing = 10
        row.alignment = .fill
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        rowHeight = row.heightAnchor.constraint(equalToConstant: 62)
        bottomSafe = row.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -4)
        // in ricerca la riga segue la tastiera (sopra di lei quando è aperta, in basso quando si chiude)
        bottomKeyboard = row.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor, constant: -8)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -14),
            bottomSafe,
            rowHeight,
        ])
        row.alpha = 0
        row.isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    // MARK: modi

    private func dock(keyboard: Bool) {
        if keyboard {
            bottomSafe.isActive = false
            bottomKeyboard.isActive = true
        } else {
            bottomKeyboard.isActive = false
            bottomSafe.isActive = true
        }
    }

    private func leaveSearch() {
        searchField?.resignFirstResponder()
        searchField = nil
        dock(keyboard: false)
    }

    /// Ricerca nativa: capsula di vetro con il campo, e il pulsante per chiudere. Sale con la tastiera.
    func showSearch(text: String, placeholder: String) {
        if mode == "search", let f = searchField {
            if !f.isFirstResponder { f.becomeFirstResponder() }
            return
        }
        mode = "search"
        tabs = []
        actions = []
        accessory = nil
        rebuild {
            let box = Glass.view(radius: 26)
            let field = SearchTextField()
            field.text = text
            field.placeholder = placeholder
            field.font = .preferredFont(forTextStyle: .body)
            field.adjustsFontForContentSizeCategory = true
            field.textColor = Ponte.ink
            field.tintColor = Ponte.accentInk
            field.returnKeyType = .search
            field.autocorrectionType = .no
            field.spellCheckingType = .no
            field.autocapitalizationType = .none
            field.clearButtonMode = .whileEditing
            field.enablesReturnKeyAutomatically = false
            let icon = UIImageView(image: UIImage(systemName: "magnifyingglass", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .medium)))
            icon.tintColor = Ponte.ink.withAlphaComponent(0.6)
            icon.contentMode = .center
            icon.frame = CGRect(x: 0, y: 0, width: 40, height: 24)
            field.leftView = icon
            field.leftViewMode = .always
            field.translatesAutoresizingMaskIntoConstraints = false
            field.addAction(UIAction { [weak self, weak field] _ in self?.onSearch(field?.text ?? "", false) }, for: .editingChanged)
            field.addAction(UIAction { [weak field] _ in field?.resignFirstResponder() }, for: .editingDidEndOnExit)
            box.contentView.addSubview(field)
            NSLayoutConstraint.activate([
                field.leadingAnchor.constraint(equalTo: box.contentView.leadingAnchor, constant: 4),
                field.trailingAnchor.constraint(equalTo: box.contentView.trailingAnchor, constant: -10),
                field.topAnchor.constraint(equalTo: box.contentView.topAnchor),
                field.bottomAnchor.constraint(equalTo: box.contentView.bottomAnchor),
            ])
            let close = GlassButton(item: BarItem(id: "search-close", label: "Chiudi la ricerca", symbol: "xmark"), tint: nil, foreground: Ponte.ink, round: true) { [weak self] in
                self?.leaveSearch()
                self?.onSearch("", true)
            }
            close.widthAnchor.constraint(equalTo: close.heightAnchor).isActive = true
            self.row.addArrangedSubview(box)
            self.row.addArrangedSubview(close)
            self.rowHeight.constant = 52
            self.dock(keyboard: true)
            self.searchField = field
            field.becomeFirstResponder()
        }
    }

    func showTabs(_ items: [BarItem], selected: String?, accessory acc: BarItem?) {
        if mode == "tabs", items == tabs, acc == accessory, let tv = tabsView {
            tv.select(selected, animated: true)
            return
        }
        if mode == "search" { leaveSearch() }
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
        if mode == "search" { leaveSearch() }
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
        if mode == "search" { leaveSearch() }
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

/// La "lente" sotto la sezione attiva: si arrotonda da sola a ogni dimensione, anche durante le animazioni.
final class LensView: UIView {
    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}

final class TabsView: UIView {
    private let glass = Glass.view(radius: 31)
    private let lens = LensView()
    /// la lente è agganciata con i vincoli al pulsante scelto: segue la barra quando si compatta o si allarga
    private var lensPins: [NSLayoutConstraint] = []
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
        lens.translatesAutoresizingMaskIntoConstraints = false
        lens.isUserInteractionEnabled = false
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
        pinLens()
        if animated, window != nil {
            UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
                self.layoutIfNeeded()
            }
        } else {
            setNeedsLayout()
        }
    }

    private func pinLens() {
        NSLayoutConstraint.deactivate(lensPins)
        lensPins = []
        guard let i = items.firstIndex(where: { $0.id == selected }), i < buttons.count else {
            lens.isHidden = true
            return
        }
        let b = buttons[i]
        lensPins = [
            lens.leadingAnchor.constraint(equalTo: b.leadingAnchor),
            lens.trailingAnchor.constraint(equalTo: b.trailingAnchor),
            lens.topAnchor.constraint(equalTo: b.topAnchor),
            lens.bottomAnchor.constraint(equalTo: b.bottomAnchor),
        ]
        NSLayoutConstraint.activate(lensPins)
        lens.isHidden = false
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

/// Campo di testo con un po' di respiro attorno al testo e al pulsante per cancellare.
final class SearchTextField: UITextField {
    override func clearButtonRect(forBounds bounds: CGRect) -> CGRect {
        super.clearButtonRect(forBounds: bounds).offsetBy(dx: -2, dy: 0)
    }
}
