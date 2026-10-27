import UIKit
import Capacitor

/// Contenitore della WebView: registra i plugin nativi scritti per Ponte.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeBarPlugin())
        bridge?.registerPluginInstance(PlateScannerPlugin())
    }
}
