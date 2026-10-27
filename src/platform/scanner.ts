import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

/** Lettura di targa e telaio con la fotocamera (VisionKit, ios/App/App/PlateScannerPlugin.swift). */
interface PlateScannerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  scan(o: { kind: 'plate' | 'vin'; country?: 'I' | 'RSM' }): Promise<{ value: string }>;
}
const PlateScanner = registerPlugin<PlateScannerPlugin>('PlateScanner');

let cached: Promise<boolean> | null = null;
export function scannerAvailable(): Promise<boolean> {
  if (!(Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('PlateScanner'))) return Promise.resolve(false);
  cached ??= PlateScanner.isAvailable()
    .then((r) => r.available)
    .catch(() => false);
  return cached;
}

export function useScanner(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    scannerAvailable().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

/** Restituisce il testo letto, null se l'utente chiude; un errore leggibile se la fotocamera non è disponibile. */
export async function scan(kind: 'plate' | 'vin', country: 'I' | 'RSM' = 'I'): Promise<string | null> {
  try {
    return (await PlateScanner.scan({ kind, country })).value;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'CANCELLED') return null;
    throw new Error((e as Error).message || 'Non riesco a usare la fotocamera.', { cause: e });
  }
}
