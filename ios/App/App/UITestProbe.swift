import UIKit
import WebKit

#if DEBUG
/// Solo nelle build di prova sul simulatore (avvio con -PonteUITest): ogni 0,6 s scrive in tmp/ui.json
/// gli elementi visibili della pagina web (etichetta e riquadro in punti), così lo script di prova può toccarli.
/// Il servizio di accessibilità usato da idb vede i controlli nativi ma non il contenuto della WebView.
final class UITestProbe {
    private var timer: Timer?
    private weak var webView: WKWebView?
    private let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("ui.json")

    private let cmd = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("cmd.js")

    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-PonteUITest") }
    /// con -PonteVoiceSim l'accettazione a voce usa il microfono simulato (il simulatore non ha voce da riconoscere)
    static var voiceSim: Bool { ProcessInfo.processInfo.arguments.contains("-PonteVoiceSim") }

    init(webView: WKWebView) {
        self.webView = webView
        if Self.voiceSim {
            let js = "window.__PONTE_VOICE_SIM__ = true;"
            webView.configuration.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] _ in self?.tick() }
    }

    private let js = """
    (() => {
      const out = [];
      const vh = innerHeight, vw = innerWidth;
      document.querySelectorAll('button,a,input,textarea,[role=button],[role=radio],[role=checkbox],[data-job],h1,h2,h3,[role=dialog]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
        const label = (el.getAttribute('aria-label') || (el.innerText || '').trim() || el.getAttribute('placeholder') || el.value || '').replace(/\\s+/g, ' ').slice(0, 120);
        out.push({ label, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', x: r.left, y: r.top, w: r.width, h: r.height });
      });
      return JSON.stringify({ path: location.hash, scrollY, items: out });
    })()
    """

    private func tick() {
        // comandi dello script di prova (es. ponteVoice.say("…")): un file in tmp, eseguito e cancellato
        if let c = try? String(contentsOf: cmd, encoding: .utf8) {
            try? FileManager.default.removeItem(at: cmd)
            webView?.evaluateJavaScript(c, completionHandler: nil)
        }
        if Self.voiceSim { webView?.evaluateJavaScript("window.__PONTE_VOICE_SIM__ = true;", completionHandler: nil) }
        webView?.evaluateJavaScript(js) { [url] result, _ in
            guard let s = result as? String else { return }
            try? s.write(to: url, atomically: true, encoding: .utf8)
        }
    }
}
#endif
