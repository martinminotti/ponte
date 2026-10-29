/**
 * Ascolto e voce, su ogni piattaforma, dietro la stessa interfaccia.
 *  - iPhone: plugin nativo VoiceInput (Speech di Apple, sul dispositivo quando possibile; AVSpeechSynthesizer).
 *  - Browser con riconoscimento vocale (Chrome, Edge, Safari): Web Speech API.
 *  - Altrove (Android, Firefox) o se scelto: registrazione a pezzi e trascrizione nel cloud del fornitore.
 *  - Test: trascrittore simulato comandato da window.ponteVoice.
 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { VoiceInput, nativeAvailable, nativeCheck, speechRecognitionClass } from './support';
import type { VoiceSettings } from '@/domain/types';
import { aiReady, cloudSttPossible } from './config';
import { transcribeCloud } from './providers';

export type SttErrorKind = 'permission' | 'unavailable' | 'network' | 'audio' | 'interrupted';

export class SttError extends Error {
  constructor(
    public kind: SttErrorKind,
    message: string,
    /** l'utente può risolvere da Impostazioni del telefono */
    public settings = false,
  ) {
    super(message);
    this.name = 'SttError';
  }
}

export interface ListenHandlers {
  partial(text: string): void;
  final(text: string): void;
  level(v: number): void;
  error(e: SttError): void;
}

export interface ListenOptions {
  vocabulary: string[];
  /** silenzio dopo cui la frase è finita */
  silenceMs: number;
}

export interface Transcriber {
  kind: 'native' | 'web' | 'cloud' | 'sim';
  /** il riconoscimento avviene sul telefono (niente audio in rete) */
  onDevice: boolean;
  /** chiede i permessi senza iniziare ad ascoltare */
  prepare(): Promise<void>;
  start(h: ListenHandlers, o: ListenOptions): Promise<void>;
  stop(): Promise<void>;
}

export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
}

/* ------------------------------------------------------------------ iPhone (plugin nativo) */

function nativeError(code: string | undefined, message?: string): SttError {
  switch (code) {
    case 'DENIED_MIC':
      return new SttError('permission', 'Ponte non ha il permesso di usare il microfono.', true);
    case 'DENIED_SPEECH':
      return new SttError('permission', 'Ponte non ha il permesso di usare il riconoscimento vocale.', true);
    case 'NETWORK':
      return new SttError('network', 'Il riconoscimento vocale ha bisogno di connessione su questo iPhone.');
    case 'AUDIO':
      return new SttError('audio', 'Non riesco a usare il microfono. Forse lo sta usando un’altra app o una chiamata.');
    case 'INTERRUPTED':
      return new SttError('interrupted', 'L’ascolto si è fermato per una chiamata o un’altra app.');
    default:
      return new SttError('unavailable', message || 'Il riconoscimento vocale non è disponibile.');
  }
}

class NativeTranscriber implements Transcriber {
  kind = 'native' as const;
  onDevice = false;
  private subs: PluginListenerHandle[] = [];
  constructor(onDevice: boolean) {
    this.onDevice = onDevice;
  }
  async prepare() {
    const p = await VoiceInput.askPermissions();
    if (p.mic !== 'granted') throw nativeError('DENIED_MIC');
    if (p.speech !== 'granted') throw nativeError('DENIED_SPEECH');
  }
  async start(h: ListenHandlers, o: ListenOptions) {
    await this.unsubscribe();
    this.subs = await Promise.all([
      VoiceInput.addListener('partial', (d) => h.partial(d.text)),
      VoiceInput.addListener('final', (d) => h.final(d.text)),
      VoiceInput.addListener('level', (d) => h.level(d.value)),
      VoiceInput.addListener('error', (d) => h.error(nativeError(d.code, d.message))),
      VoiceInput.addListener('interrupted', () => h.error(nativeError('INTERRUPTED'))),
    ]);
    try {
      await VoiceInput.start({ contextualStrings: o.vocabulary, silenceMs: o.silenceMs });
    } catch (e) {
      await this.unsubscribe();
      throw nativeError((e as { code?: string }).code, (e as Error).message);
    }
  }
  async stop() {
    await VoiceInput.stop().catch(() => {});
    await this.unsubscribe();
  }
  private async unsubscribe() {
    const s = this.subs;
    this.subs = [];
    await Promise.all(s.map((x) => x.remove().catch(() => {})));
  }
}

const nativeSpeaker: Speaker = {
  speak: (text) => VoiceInput.speak({ text }).catch(() => {}),
  cancel: () => void VoiceInput.stopSpeaking().catch(() => {}),
};

export function openAppSettings() {
  if (nativeAvailable()) VoiceInput.openSettings().catch(() => {});
}

/* ------------------------------------------------------------------ browser (Web Speech API) */

interface SRResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
const SRClass = speechRecognitionClass as () => (new () => SR) | null;

class WebTranscriber implements Transcriber {
  kind = 'web' as const;
  onDevice = false;
  private rec: SR | null = null;
  private active = false;
  private silence = 0;
  private consumed = 0;
  private decay = 0;
  private lvl = 0;
  async prepare() {
    /* il browser chiede il permesso al primo ascolto */
  }
  async start(h: ListenHandlers, o: ListenOptions) {
    const C = SRClass();
    if (!C) throw new SttError('unavailable', 'Questo browser non riconosce la voce. Usa Chrome, Edge o Safari.');
    this.active = true;
    this.consumed = 0;
    const rec = new C();
    this.rec = rec;
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let text = '';
    const flush = () => {
      window.clearTimeout(this.silence);
      const t = text.trim();
      text = '';
      if (t) h.final(t);
    };
    rec.onresult = (e) => {
      let s = '';
      for (let i = this.consumed; i < e.results.length; i++) s += e.results[i][0].transcript;
      text = s;
      h.partial(s.trim());
      // il browser non dà il livello del microfono: un battito a ogni parola
      this.lvl = Math.min(1, this.lvl + 0.5);
      h.level(this.lvl);
      window.clearTimeout(this.silence);
      this.silence = window.setTimeout(() => {
        this.consumed = e.results.length;
        flush();
      }, o.silenceMs);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.active = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        h.error(new SttError('permission', 'Il browser non ha il permesso di usare il microfono. Consentilo dall’icona accanto all’indirizzo.'));
      else if (e.error === 'network') h.error(new SttError('network', 'Il riconoscimento vocale del browser ha bisogno di connessione.'));
      else if (e.error === 'audio-capture') h.error(new SttError('audio', 'Non trovo un microfono collegato.'));
      else h.error(new SttError('unavailable', `Il riconoscimento vocale si è fermato (${e.error}).`));
    };
    rec.onend = () => {
      // Chrome e Safari chiudono l'ascolto dopo un po' di silenzio: si riparte finché serve
      if (text.trim()) flush();
      if (this.active && this.rec === rec) {
        this.consumed = 0;
        try {
          rec.start();
        } catch {
          /* già ripartito */
        }
      }
    };
    window.clearInterval(this.decay);
    this.decay = window.setInterval(() => {
      this.lvl *= 0.72;
      h.level(this.lvl);
    }, 90);
    try {
      rec.start();
    } catch {
      throw new SttError('unavailable', 'Il riconoscimento vocale non è partito. Riprova.');
    }
  }
  async stop() {
    this.active = false;
    window.clearTimeout(this.silence);
    window.clearInterval(this.decay);
    const r = this.rec;
    this.rec = null;
    try {
      r?.abort();
    } catch {
      /* già fermo */
    }
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => /^it([-_]|$)/i.test(v.lang));
  if (!all.length) return null;
  const pref = [/premium|enhanced|migliorat/i, /alice|federica|emma|luca|paola|google italiano|elsa|isabella/i];
  for (const re of pref) {
    const v = all.find((x) => re.test(x.name));
    if (v) return v;
  }
  return all.find((v) => v.localService) || all[0];
}

const webSpeaker: Speaker = {
  speak: (text) =>
    new Promise<void>((resolve) => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'it-IT';
        const v = pickVoice();
        if (v) u.voice = v;
        u.rate = 1.04;
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          resolve();
        };
        u.onend = end;
        u.onerror = end;
        // Safari a volte non chiama onend: un limite di tempo in base alla lunghezza
        window.setTimeout(end, 2500 + text.length * 85);
        speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    }),
  cancel: () => {
    try {
      speechSynthesis.cancel();
    } catch {
      /* niente da fermare */
    }
  },
};

/* ------------------------------------------------------------------ registrazione + trascrizione nel cloud */

class CloudTranscriber implements Transcriber {
  kind = 'cloud' as const;
  onDevice = false;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private rec: MediaRecorder | null = null;
  private timer = 0;
  private active = false;
  private ctl: AbortController | null = null;
  constructor(private v: VoiceSettings) {}

  async prepare() {
    if (!navigator.mediaDevices?.getUserMedia) throw new SttError('unavailable', 'Questo dispositivo non permette di registrare l’audio.');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      throw this.micError(e);
    }
  }

  private micError(e: unknown) {
    const n = (e as DOMException)?.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return new SttError('permission', 'Ponte non ha il permesso di usare il microfono.', true);
    if (n === 'NotFoundError') return new SttError('audio', 'Non trovo un microfono.');
    return new SttError('audio', 'Non riesco a usare il microfono.');
  }

  async start(h: ListenHandlers, o: ListenOptions) {
    if (typeof MediaRecorder === 'undefined') throw new SttError('unavailable', 'Questo dispositivo non registra l’audio.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      throw this.micError(e);
    }
    this.active = true;
    this.ctl = new AbortController();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';

    let chunks: Blob[] = [];
    let startedAt = 0;
    let voiced = false;
    let lastVoice = 0;
    let floor = 0.01;
    const begin = () => {
      chunks = [];
      voiced = false;
      startedAt = performance.now();
      const r = new MediaRecorder(this.stream!, mime ? { mimeType: mime } : undefined);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        const had = voiced;
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
        if (this.active) begin();
        if (!had || blob.size < 2000) return;
        h.partial('…');
        transcribeCloud(this.v, blob, this.ctl?.signal)
          .then((t) => {
            h.partial('');
            if (t) h.final(t);
          })
          .catch((e) => {
            h.partial('');
            if ((e as { kind?: string }).kind !== 'cancelled') h.error(new SttError('network', 'Trascrizione non riuscita'));
          });
      };
      r.start(250);
      this.rec = r;
    };
    begin();
    this.timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (!voiced) floor = floor * 0.95 + rms * 0.05;
      const thr = Math.max(0.012, floor * 2.6);
      const now = performance.now();
      h.level(Math.min(1, rms / (thr * 4)));
      if (rms > thr) {
        if (!voiced) h.partial('…');
        voiced = true;
        lastVoice = now;
      }
      const r = this.rec;
      if (!r || r.state !== 'recording') return;
      // fine frase: silenzio dopo la voce; oppure un pezzo troppo lungo; oppure troppo silenzio senza voce
      if ((voiced && now - lastVoice > o.silenceMs) || now - startedAt > 28_000 || (!voiced && now - startedAt > 15_000)) r.stop();
    }, 60);
  }

  async stop() {
    this.active = false;
    window.clearInterval(this.timer);
    this.ctl?.abort();
    try {
      if (this.rec?.state === 'recording') this.rec.stop();
    } catch {
      /* già fermo */
    }
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/* ------------------------------------------------------------------ simulato (test) */

type SimWindow = Window & { __PONTE_VOICE_SIM__?: boolean; ponteVoice?: { say(t: string): void; partial(t: string): void; level(v: number): void; listening(): boolean } };

class SimTranscriber implements Transcriber {
  kind = 'sim' as const;
  onDevice = true;
  private h: ListenHandlers | null = null;
  constructor() {
    const w = window as SimWindow;
    w.ponteVoice = {
      say: (t) => {
        this.h?.partial(t);
        window.setTimeout(() => this.h?.final(t), 120);
      },
      partial: (t) => this.h?.partial(t),
      level: (v) => this.h?.level(v),
      listening: () => !!this.h,
    };
  }
  async prepare() {}
  async start(h: ListenHandlers) {
    this.h = h;
  }
  async stop() {
    this.h = null;
  }
}

/* ------------------------------------------------------------------ scelta */

export const simEnabled = () => typeof window !== 'undefined' && !!(window as SimWindow).__PONTE_VOICE_SIM__;

export interface Support {
  transcriber: Transcriber | null;
  speaker: Speaker | null;
  /** perché non si può ascoltare (se transcriber è null) */
  reason?: string;
}

/** Il modo migliore di ascoltare con le impostazioni attuali, oppure il motivo per cui non si può. */
export async function voiceSupport(v: VoiceSettings): Promise<Support> {
  const speaker: Speaker | null = nativeAvailable() ? nativeSpeaker : typeof speechSynthesis !== 'undefined' ? webSpeaker : null;
  if (simEnabled()) return { transcriber: new SimTranscriber(), speaker: (window as SimWindow).__PONTE_VOICE_SIM__ ? null : speaker };
  const cloudOk = cloudSttPossible(v) && aiReady(v) && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  if (v.stt === 'cloud' && cloudOk) return { transcriber: new CloudTranscriber(v), speaker };
  const n = await nativeCheck();
  if (n?.available) return { transcriber: new NativeTranscriber(n.onDevice), speaker };
  if (SRClass() && Capacitor.getPlatform() === 'web') return { transcriber: new WebTranscriber(), speaker };
  if (cloudOk) return { transcriber: new CloudTranscriber(v), speaker };
  return {
    transcriber: null,
    speaker,
    reason:
      n && !n.available
        ? 'Il riconoscimento vocale di Apple non è disponibile su questo iPhone (controlla Siri e dettatura in Impostazioni).'
        : 'Su questo dispositivo serve un servizio AI con trascrizione: il titolare lo collega in Impostazioni → Assistente vocale.',
  };
}

export { canListen } from './support';
