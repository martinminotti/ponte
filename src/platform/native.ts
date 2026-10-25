import { Capacitor } from '@capacitor/core';

/**
 * Ponte verso le funzioni del telefono.
 * Sul web usa le API del browser; dentro l'app Android/iOS (Capacitor) usa i plugin nativi,
 * caricati solo quando servono così il bundle web resta leggero.
 */

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform() as 'web' | 'ios' | 'android';

/** iPhone e iPad, nell'app nativa o in Safari (iPadOS si presenta come Mac con touch). */
export function isAppleMobile(): boolean {
  if (platform() === 'ios') return true;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

export async function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'warning') await Haptics.notification({ type: NotificationType.Warning });
      else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if ('vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? [8, 40, 12] : kind === 'medium' ? 12 : 6);
    }
  } catch {
    /* nessun feedback disponibile */
  }
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Scarica il file (web) o lo salva nei Documenti (app). */
export async function saveFile(name: string, blob: Blob): Promise<'saved' | 'shared'> {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: name, files: [res.uri] });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}

export function canShareFiles(): boolean {
  if (isNative()) return true;
  try {
    const f = new File([new Blob(['x'], { type: 'application/pdf' })], 'x.pdf', { type: 'application/pdf' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

/**
 * Condivide un file con il foglio di condivisione del sistema (WhatsApp, Mail, Stampa…).
 * Restituisce 'cancelled' se l'utente chiude il foglio, 'unsupported' se non disponibile.
 */
export async function shareFile(name: string, blob: Blob, text?: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (isNative()) {
    try {
      await saveFile(name, blob);
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const file = new File([blob], name, { type: blob.type || 'application/pdf' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: name, text });
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function openExternal(url: string) {
  // wa.me e tel: aprono l'app giusta sia sul web sia dentro Capacitor
  window.open(url, '_blank', 'noopener');
}

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

export async function initNative(dark: boolean) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (platform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch {
    /* plugin non disponibile */
  }
}

/** Tasto "indietro" di Android: torna alla schermata precedente invece di chiudere l'app. */
export async function bindAndroidBack(goBack: () => boolean) {
  if (platform() !== 'android') return () => {};
  const { App } = await import('@capacitor/app');
  const h = await App.addListener('backButton', () => {
    if (!goBack()) App.exitApp();
  });
  return () => h.remove();
}
