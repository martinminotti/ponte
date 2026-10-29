/**
 * Controllo leggero: si può dettare su questo dispositivo? Usato per mostrare o no l'ingresso a voce,
 * senza caricare il resto dell'assistente (che arriva solo quando si apre la schermata).
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { VoiceSettings } from '@/domain/types';
import { aiReady, cloudSttPossible } from './config';

type Perm = 'granted' | 'denied' | 'prompt';
interface VoiceInputPlugin {
  isAvailable(): Promise<{ available: boolean; onDevice: boolean; mic: Perm; speech: Perm }>;
  askPermissions(): Promise<{ mic: Perm; speech: Perm }>;
  start(o: { contextualStrings: string[]; silenceMs: number }): Promise<void>;
  stop(): Promise<void>;
  speak(o: { text: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
  openSettings(): Promise<void>;
  addListener(e: 'partial' | 'final', cb: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'level', cb: (d: { value: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'error', cb: (d: { code: string; message: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'interrupted', cb: () => void): Promise<PluginListenerHandle>;
}
export const VoiceInput = registerPlugin<VoiceInputPlugin>('VoiceInput');
export const nativeAvailable = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('VoiceInput');

let nativeInfo: Promise<{ available: boolean; onDevice: boolean } | null> | null = null;
export function nativeCheck() {
  nativeInfo ??= nativeAvailable()
    ? VoiceInput.isAvailable()
        .then((r) => ({ available: r.available, onDevice: r.onDevice }))
        .catch(() => null)
    : Promise.resolve(null);
  return nativeInfo;
}

export function speechRecognitionClass(): unknown {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const simOn = () => typeof window !== 'undefined' && !!(window as Window & { __PONTE_VOICE_SIM__?: boolean }).__PONTE_VOICE_SIM__;

/** c'è un modo di ascoltare, senza crearlo (per mostrare o no l'ingresso a voce) */
export async function canListen(v: VoiceSettings): Promise<boolean> {
  if (!v.enabled) return false;
  if (simOn()) return true;
  if (cloudSttPossible(v) && aiReady(v) && typeof MediaRecorder !== 'undefined') return true;
  const n = await nativeCheck();
  if (n?.available) return true;
  return !!speechRecognitionClass() && Capacitor.getPlatform() === 'web';
}
