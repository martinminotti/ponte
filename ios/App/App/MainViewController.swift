import UIKit
import Capacitor

/// Contenitore della WebView: registra i plugin nativi scritti per Ponte.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeBarPlugin())
        bridge?.registerPluginInstance(PlateScannerPlugin())
        bridge?.registerPluginInstance(VoiceInputPlugin())
        bridge?.registerPluginInstance(NavigationPlugin())
        // come in un'app: niente anteprima dei link con la pressione prolungata
        webView?.allowsLinkPreview = false
        #if DEBUG
        if UITestProbe.enabled, let wv = webView {
            probe = UITestProbe(webView: wv)
            probe?.start()
        }
        #endif
    }

    #if DEBUG
    private var probe: UITestProbe?
    #endif
}
