import { createClient, type SupportedStorage, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { cloudConfig } from './config';

/**
 * Sessione salvata nelle Preferenze native su iPhone e Android (il sistema non le svuota come può fare con lo
 * spazio della WebView), nel localStorage sul web.
 */
const nativeStorage: SupportedStorage = {
  getItem: async (k) => (await Preferences.get({ key: k })).value,
  setItem: async (k, v) => void (await Preferences.set({ key: k, value: v })),
  removeItem: async (k) => void (await Preferences.remove({ key: k })),
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const native = Capacitor.isNativePlatform();
  client = createClient(cloudConfig.url, cloudConfig.key, {
    auth: {
      storage: native ? nativeStorage : undefined,
      storageKey: 'ponte-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-ponte-client': `ponte/${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}` } },
  });
  // nell'app il rinnovo del token si ferma in sfondo e riparte al ritorno (come raccomanda Supabase)
  if (native) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    }).catch(() => {});
  }
  return client;
}
