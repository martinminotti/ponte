import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { getSettings } from '@/data/repo';
import { DEFAULT_SETTINGS, type Job, type Settings } from '@/domain/types';
import { applyThemeMeta } from '@/platform/brand';

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Tutte le schede, dalla più recente. undefined mentre l'archivio si apre. */
export function useJobs(): Job[] | undefined {
  return useLiveQuery(() => db.jobs.orderBy('createdAt').reverse().toArray(), []);
}

/** Una scheda. undefined mentre carica, null se non esiste. */
export function useJob(id: string | undefined): Job | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.jobs.get(id)) ?? null) : null), [id]);
}

export function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export const useWide = () => useMedia('(min-width: 1024px)');

/** Applica tema (chiaro/scuro/sistema) e colore dell'officina all'intero documento. */
export function useThemeSync(s: Settings): boolean {
  const sysDark = useMedia('(prefers-color-scheme: dark)');
  const dark = s.theme === 'dark' || (s.theme === 'system' && sysDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('ro:theme', dark ? 'dark' : 'light');
    } catch {
      /* non disponibile */
    }
    applyThemeMeta(dark);
  }, [dark]);
  return dark;
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
