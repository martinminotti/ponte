/**
 * Collegamento al cloud (Supabase). Indirizzo e chiave pubblica arrivano dalla build (variabili VITE_…):
 * senza, l'app funziona come prima, tutta sul dispositivo. La chiave pubblica non è un segreto: l'accesso ai dati
 * lo decidono le regole del database (ogni officina vede solo le sue righe).
 */
export const cloudConfig = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  key: (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim() || '',
};

export const cloudAvailable = (): boolean => !!cloudConfig.url && !!cloudConfig.key;
