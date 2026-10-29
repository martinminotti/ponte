import Foundation
import AVFoundation
import Speech
import UIKit
import Capacitor

/// Dettatura per l'accettazione a voce: riconoscimento vocale di Apple (sul dispositivo quando possibile)
/// e voce italiana di sistema per le risposte.
///
/// JS:
///  VoiceInput.isAvailable() → { available, onDevice, mic, speech }
///  VoiceInput.askPermissions() → { mic, speech }  ("granted" | "denied" | "prompt")
///  VoiceInput.start({ contextualStrings, silenceMs })   eventi: partial {text}, final {text}, level {value}, error {code, message}, interrupted
///  VoiceInput.stop()
///  VoiceInput.speak({ text }) → si risolve quando ha finito di parlare
///  VoiceInput.stopSpeaking(), VoiceInput.openSettings()
///
/// Una frase finisce dopo `silenceMs` senza parole nuove: si manda "final" e si riparte con una richiesta nuova,
/// così anche un'accettazione lunga non incontra il limite di durata di una singola richiesta.
@objc(VoiceInputPlugin)
public class VoiceInputPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "VoiceInputPlugin"
    public let jsName = "VoiceInput"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "askPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "it-IT"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var tapInstalled = false
    private var listening = false
    private var lastText = ""
    private var silenceTimer: Timer?
    private var silenceMs: Double = 1300
    private var contextual: [String] = []
    private var lastLevelAt: CFTimeInterval = 0
    /// generazione della richiesta: i risultati di una richiesta già chiusa vengono ignorati
    private var generation = 0
    /// errori di fila senza risultati: oltre una soglia l'ascolto si ferma davvero
    private var errorStreak = 0
    private var errorStreakAt: CFTimeInterval = 0

    private let synth = AVSpeechSynthesizer()
    private var speakCall: CAPPluginCall?
    private var observing = false

    public override func load() {
        synth.delegate = self
    }

    // MARK: disponibilità e permessi

    private func micState() -> String {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    private func speechState() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let r = recognizer
        call.resolve([
            "available": r?.isAvailable ?? false,
            "onDevice": r?.supportsOnDeviceRecognition ?? false,
            "mic": micState(),
            "speech": speechState(),
        ])
    }

    @objc func askPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { _ in
            AVAudioSession.sharedInstance().requestRecordPermission { _ in
                DispatchQueue.main.async {
                    call.resolve(["mic": self.micState(), "speech": self.speechState()])
                }
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    // MARK: ascolto

    @objc func start(_ call: CAPPluginCall) {
        contextual = Array((call.getArray("contextualStrings", String.self) ?? []).prefix(100))
        silenceMs = max(600, min(4000, call.getDouble("silenceMs") ?? 1300))
        DispatchQueue.main.async {
            guard self.micState() == "granted" else { return call.reject("Microfono non consentito", "DENIED_MIC") }
            guard self.speechState() == "granted" else { return call.reject("Riconoscimento vocale non consentito", "DENIED_SPEECH") }
            guard let r = self.recognizer, r.isAvailable else { return call.reject("Riconoscimento vocale non disponibile", "UNAVAILABLE") }
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            do {
                try self.beginAudio()
                self.newRequest()
                self.listening = true
                self.observeInterruptions()
                call.resolve()
            } catch {
                self.teardown()
                call.reject("Microfono non utilizzabile: \(error.localizedDescription)", "AUDIO")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.listening = false
            self.teardown()
            call.resolve()
        }
    }

    private func configureSession() throws {
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .duckOthers])
        try s.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func beginAudio() throws {
        try configureSession()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // senza microfono (simulatore senza ingresso, microfono occupato) il formato ha 0 Hz: installare il tap farebbe crashare
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "Ponte", code: 1, userInfo: [NSLocalizedDescriptionKey: "nessun ingresso audio"])
        }
        if tapInstalled {
            input.removeTap(onBus: 0)
            tapInstalled = false
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.request?.append(buffer)
            self.reportLevel(buffer)
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
    }

    private func newRequest() {
        task?.cancel()
        task = nil
        request?.endAudio()
        generation += 1
        let gen = generation
        lastText = ""
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.taskHint = .dictation
        req.contextualStrings = contextual
        if let r = recognizer, r.supportsOnDeviceRecognition {
            // sul telefono: niente audio in rete, funziona anche senza connessione
            req.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16.0, *) {
            req.addsPunctuation = true
        }
        request = req
        task = recognizer?.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, gen == self.generation, self.listening else { return }
                if let result {
                    self.errorStreak = 0
                    let text = result.bestTranscription.formattedString
                    if text != self.lastText {
                        self.lastText = text
                        self.notifyListeners("partial", data: ["text": text])
                        self.armSilence()
                    }
                    if result.isFinal { self.finishUtterance() }
                    return
                }
                if let error {
                    self.handle(error)
                }
            }
        }
    }

    private func armSilence() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceMs / 1000, repeats: false) { [weak self] _ in
            self?.finishUtterance()
        }
    }

    /// la frase è finita: si consegna e si apre subito una richiesta nuova per la prossima
    private func finishUtterance() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        let text = lastText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            notifyListeners("final", data: ["text": text])
        }
        if listening { newRequest() }
    }

    private func handle(_ error: Error) {
        let ns = error as NSError
        let benign = (ns.domain == "kAFAssistantErrorDomain" && [1110, 216, 301, 203, 1101, 1107].contains(ns.code)) || (ns.domain == "kLSRErrorDomain" && [102, 201, 301].contains(ns.code))
        if !lastText.isEmpty {
            finishUtterance()
            return
        }
        // errori passeggeri (silenzio, richiesta chiusa): si riparte; se si ripetono di fila senza risultati, ci si ferma
        let now = CACurrentMediaTime()
        if now - errorStreakAt > 6 { errorStreak = 0 }
        errorStreakAt = now
        errorStreak += 1
        if listening && (benign ? errorStreak < 20 : errorStreak < 3) {
            newRequest()
            return
        }
        let code = (ns.domain == NSURLErrorDomain || ns.code == 1700) ? "NETWORK" : "UNAVAILABLE"
        listening = false
        teardown()
        notifyListeners("error", data: ["code": code, "message": ns.localizedDescription])
    }

    private func reportLevel(_ buffer: AVAudioPCMBuffer) {
        let now = CACurrentMediaTime()
        guard now - lastLevelAt > 0.07, let ch = buffer.floatChannelData?[0] else { return }
        lastLevelAt = now
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sum: Float = 0
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(n))
        let db = 20 * log10(max(rms, 0.000_01))
        // da -50 dB (silenzio) a -12 dB (voce forte vicino al telefono)
        let v = max(0, min(1, (db + 50) / 38))
        DispatchQueue.main.async { self.notifyListeners("level", data: ["value": v]) }
    }

    private func teardown() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        generation += 1
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        if engine.isRunning { engine.stop() }
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        if !synth.isSpeaking {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    private func observeInterruptions() {
        guard !observing else { return }
        observing = true
        NotificationCenter.default.addObserver(self, selector: #selector(onInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    @objc private func onInterruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            guard self.listening else { return }
            self.listening = false
            self.teardown()
            self.notifyListeners("interrupted", data: [:])
        }
    }

    @objc private func onBackground() {
        DispatchQueue.main.async {
            guard self.listening else { return }
            self.listening = false
            self.teardown()
            self.notifyListeners("interrupted", data: [:])
        }
    }

    // MARK: voce

    private lazy var voice: AVSpeechSynthesisVoice? = {
        let it = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "it-IT" }
        // la voce migliore installata (Premium o Migliorata se l'utente l'ha scaricata)
        return it.max(by: { $0.quality.rawValue < $1.quality.rawValue }) ?? AVSpeechSynthesisVoice(language: "it-IT")
    }()

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async {
            guard !text.isEmpty else { return call.resolve() }
            // il microfono si chiude prima: l'assistente non deve ascoltare se stesso
            if self.listening {
                self.listening = false
                self.teardown()
            }
            self.speakCall?.resolve()
            self.speakCall = call
            try? self.configureSession()
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            let u = AVSpeechUtterance(string: text)
            u.voice = self.voice
            u.rate = AVSpeechUtteranceDefaultSpeechRate * 1.02
            u.preUtteranceDelay = 0.05
            self.synth.speak(u)
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.finishSpeaking()
            call.resolve()
        }
    }

    private func finishSpeaking() {
        let c = speakCall
        speakCall = nil
        c?.resolve()
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.finishSpeaking() }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.finishSpeaking() }
    }
}
