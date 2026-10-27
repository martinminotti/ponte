import Foundation
import UIKit
import AVFoundation
import VisionKit
import Capacitor

/// Legge targa o telaio con la fotocamera (VisionKit, Live Text).
/// JS: PlateScanner.isAvailable() → { available }, PlateScanner.scan({ kind: "plate" | "vin", country: "I" | "RSM" }) → { value }
@objc(PlateScannerPlugin)
public class PlateScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlateScannerPlugin"
    public let jsName = "PlateScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    @objc public func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 16.0, *) {
                call.resolve(["available": DataScannerViewController.isSupported])
            } else {
                call.resolve(["available": false])
            }
        }
    }

    @objc public func scan(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "plate"
        let country = call.getString("country") ?? "I"
        guard #available(iOS 16.0, *) else {
            call.reject("La lettura con la fotocamera richiede iOS 16.", "UNAVAILABLE")
            return
        }
        DispatchQueue.main.async {
            guard DataScannerViewController.isSupported else {
                call.reject("Questo iPhone non supporta la lettura del testo.", "UNAVAILABLE")
                return
            }
            self.withCameraAccess { granted in
                guard granted else {
                    call.reject("Consenti l'accesso alla fotocamera in Impostazioni → Ponte.", "DENIED")
                    return
                }
                guard let host = self.bridge?.viewController else {
                    call.reject("Nessuna schermata disponibile.", "UNAVAILABLE")
                    return
                }
                let vc = PlateScannerController(kind: kind, country: country) { value in
                    if let value { call.resolve(["value": value]) } else { call.reject("Annullato", "CANCELLED") }
                }
                vc.modalPresentationStyle = .fullScreen
                host.present(vc, animated: true)
            }
        }
    }

    private func withCameraAccess(_ done: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: done(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { done(ok) } }
        default: done(false)
        }
    }
}

/// Riconoscimento: testo normalizzato (maiuscolo, senza spazi e trattini) confrontato con i formati attesi.
enum PlateFormat {
    static func normalize(_ s: String) -> String {
        String(s.uppercased().filter { ($0.isASCII && $0.isLetter) || $0.isNumber })
    }

    static func match(_ raw: String, kind: String, country: String) -> String? {
        let n = normalize(raw)
        if kind == "vin" {
            // 17 caratteri, senza I, O, Q
            return n.range(of: "^[A-HJ-NPR-Z0-9]{17}$", options: .regularExpression) != nil ? n : nil
        }
        if country == "RSM" {
            // San Marino: una lettera e fino a quattro cifre (es. A4721)
            return n.range(of: "^[A-Z][0-9]{1,4}$", options: .regularExpression) != nil ? n : nil
        }
        // Italia, formato dal 1994: AA 000 AA (senza I, O, Q, U)
        return n.range(of: "^[A-HJ-NPR-TV-Z]{2}[0-9]{3}[A-HJ-NPR-TV-Z]{2}$", options: .regularExpression) != nil ? n : nil
    }
}

@available(iOS 16.0, *)
final class PlateScannerController: UIViewController, DataScannerViewControllerDelegate {
    private let kind: String
    private let country: String
    private var finish: ((String?) -> Void)?
    private var seen: [String: Int] = [:]
    private let scanner: DataScannerViewController
    private let hint = UILabel()
    private let feedback = UINotificationFeedbackGenerator()

    init(kind: String, country: String, finish: @escaping (String?) -> Void) {
        self.kind = kind
        self.country = country
        self.finish = finish
        var types: Set<DataScannerViewController.RecognizedDataType> = [.text()]
        if kind == "vin" { types.insert(.barcode(symbologies: [.code39, .code128, .dataMatrix, .qr])) }
        scanner = DataScannerViewController(
            recognizedDataTypes: types,
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        scanner.delegate = self
        addChild(scanner)
        scanner.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scanner.view)
        NSLayoutConstraint.activate([
            scanner.view.topAnchor.constraint(equalTo: view.topAnchor),
            scanner.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scanner.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scanner.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        scanner.didMove(toParent: self)

        // titolo in alto, sotto la status bar
        let title = UILabel()
        title.text = kind == "vin" ? "Inquadra il telaio" : "Inquadra la targa"
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = .white
        title.translatesAutoresizingMaskIntoConstraints = false

        let close = UIButton(type: .system)
        var cfg = UIButton.Configuration.filled()
        cfg.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .bold))
        cfg.baseBackgroundColor = UIColor.white.withAlphaComponent(0.18)
        cfg.baseForegroundColor = .white
        cfg.cornerStyle = .capsule
        close.configuration = cfg
        close.accessibilityLabel = "Chiudi"
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false

        hint.text = kind == "vin"
            ? "Il telaio è alla base del parabrezza, sul montante della porta o sul libretto. Tocca il codice se non parte da solo."
            : "Tieni la targa dritta e ben illuminata. Tocca il testo evidenziato se non parte da solo."
        hint.numberOfLines = 0
        hint.textAlignment = .center
        hint.font = .preferredFont(forTextStyle: .subheadline)
        hint.adjustsFontForContentSizeCategory = true
        hint.textColor = UIColor.white.withAlphaComponent(0.9)
        let hintBox = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
        hintBox.layer.cornerRadius = 18
        hintBox.clipsToBounds = true
        hintBox.translatesAutoresizingMaskIntoConstraints = false
        hint.translatesAutoresizingMaskIntoConstraints = false
        hintBox.contentView.addSubview(hint)

        view.addSubview(title)
        view.addSubview(close)
        view.addSubview(hintBox)
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: g.topAnchor, constant: 8),
            close.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            close.widthAnchor.constraint(equalToConstant: 44),
            close.heightAnchor.constraint(equalToConstant: 44),
            title.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintBox.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            hintBox.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            hintBox.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -12),
            hint.topAnchor.constraint(equalTo: hintBox.contentView.topAnchor, constant: 14),
            hint.bottomAnchor.constraint(equalTo: hintBox.contentView.bottomAnchor, constant: -14),
            hint.leadingAnchor.constraint(equalTo: hintBox.contentView.leadingAnchor, constant: 16),
            hint.trailingAnchor.constraint(equalTo: hintBox.contentView.trailingAnchor, constant: -16),
        ])
        feedback.prepare()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        do { try scanner.startScanning() } catch {
            hint.text = "Non riesco ad avviare la fotocamera."
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        scanner.stopScanning()
    }

    @objc private func cancel() { done(nil) }

    private func done(_ value: String?) {
        guard let f = finish else { return }
        finish = nil
        scanner.stopScanning()
        if value != nil { feedback.notificationOccurred(.success) }
        dismiss(animated: true) { f(value) }
    }

    private func text(of item: RecognizedItem) -> String? {
        switch item {
        case .text(let t): return t.transcript
        case .barcode(let b): return b.payloadStringValue
        @unknown default: return nil
        }
    }

    /// Un candidato valido visto in due fotogrammi di fila basta: niente letture accidentali da un riflesso.
    private func consider(_ items: [RecognizedItem]) {
        for item in items {
            guard let raw = text(of: item) else { continue }
            // anche le righe con più parole: "AB 123 CD" arriva spesso come un'unica riga
            let candidates = [raw] + raw.components(separatedBy: .newlines)
            for c in candidates {
                if let v = PlateFormat.match(c, kind: kind, country: country) {
                    seen[v, default: 0] += 1
                    if seen[v]! >= 2 { done(v); return }
                }
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        consider(allItems)
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        consider(allItems)
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
        guard let raw = text(of: item) else { return }
        if let v = PlateFormat.match(raw, kind: kind, country: country) { done(v); return }
        // tocco esplicito: accetta il testo così com'è se ha una forma plausibile
        let n = PlateFormat.normalize(raw)
        if n.count >= 4 && n.count <= 17 { done(n) }
    }
}
