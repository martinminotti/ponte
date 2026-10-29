import Foundation
import UIKit
import WebKit
import Capacitor

/// Gesto "indietro" di iOS sulla WebView: si trascina dal bordo sinistro e la schermata precedente segue il dito,
/// come in un UINavigationController. È il gesto vero di WebKit (allowsBackForwardNavigationGestures):
/// interrompibile, con la sua ombra e la sua parallasse.
///
/// JS: Navigation.setSwipeBack({ enabled }) — attivo solo dove c'è un "indietro" e nessun foglio aperto.
///     evento "swipe" { active } quando il gesto inizia e finisce, così la pagina non ripete la transizione.
@objc(NavigationPlugin)
public class NavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavigationPlugin"
    public let jsName = "Navigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSwipeBack", returnType: CAPPluginReturnPromise),
    ]

    private var observed = Set<ObjectIdentifier>()

    @objc func setSwipeBack(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            guard let wv = self.bridge?.webView else { return call.resolve() }
            wv.allowsBackForwardNavigationGestures = enabled
            if enabled { self.observeEdgeGestures(in: wv) }
            call.resolve()
        }
    }

    /// WebKit aggiunge i riconoscitori del bordo quando il gesto viene attivato: li si osserva per sapere quando parte
    private func observeEdgeGestures(in view: UIView) {
        for g in view.gestureRecognizers ?? [] {
            guard let edge = g as? UIScreenEdgePanGestureRecognizer else { continue }
            // solo indietro: il gesto dal bordo destro ("avanti") in un'app non ha senso
            if edge.edges.contains(.right) {
                edge.isEnabled = false
                continue
            }
            let id = ObjectIdentifier(g)
            if observed.contains(id) { continue }
            observed.insert(id)
            g.addTarget(self, action: #selector(onEdge(_:)))
        }
        for sub in view.subviews { observeEdgeGestures(in: sub) }
    }

    @objc private func onEdge(_ g: UIGestureRecognizer) {
        switch g.state {
        case .began:
            notifyListeners("swipe", data: ["active": true])
        case .ended, .cancelled, .failed:
            notifyListeners("swipe", data: ["active": false])
        default:
            break
        }
    }
}
