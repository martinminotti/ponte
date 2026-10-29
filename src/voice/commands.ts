/**
 * Comandi brevi riconosciuti sul telefono, senza aspettare il modello:
 * «registra», «annulla», «pausa», «sì», «no», «aiuto».
 * Valgono solo per frasi corte, così «registra anche che la spia è accesa» resta una frase da interpretare.
 */
import type { Intent } from './fields';
import { clean } from './spoken';

const words = (t: string) => t.split(' ').filter(Boolean).length;

/** riempitivi e rumori: non sono frasi da interpretare */
export function isFiller(text: string): boolean {
  const t = clean(text)
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return true;
  if (t.replace(/[^a-z]/g, '').length < 2) return true;
  return /^((e+|eh+|ehm+|uhm+|um+|mm+|ah+|oh+|allora|dunque|vediamo|aspetta che (guardo|vedo)|un secondo|cioe|niente|ecco)( |$))+$/.test(t);
}

export function detectCommand(text: string, opts: { awaitingYesNo?: boolean } = {}): Intent | null {
  const t = clean(text)
    .replace(/[.,;:!?«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  const n = words(t);

  if (
    n <= 6 &&
    /^(no )?(annulla|annulla l'?ultima|torna indietro|indietro|cancella (l'?ultima|l'?ultima cosa|quello|quella)|togli (l'?ultima|quello|quella)|ho sbagliato|rimetti come prima)( cosa| modifica| per favore| grazie)?$/.test(
      t,
    )
  )
    return 'undo';
  if (
    n <= 6 &&
    /^(ok |va bene |perfetto |bene )?(registra|registrala|registralo|salva|salvala|salvalo|ho finito|abbiamo finito|fatto|finito|registra (pure|tutto|l'?accettazione|la scheda)|puoi registrare|salva (pure|tutto|la scheda)|conferma (l'?accettazione|la scheda))( grazie| pure)?$/.test(
      t,
    )
  )
    return 'save';
  if (n <= 4 && /^(pausa|aspetta|aspetta un attimo|un attimo|un momento|attimo|fermati|ferma|stop|smetti di ascoltare)( per favore| grazie)?$/.test(t)) return 'pause';
  if (n <= 6 && /\b(aiuto|cosa (posso|devo) dire|come funziona|non so cosa dire)\b/.test(t)) return 'help';
  if (n <= 4 && /^(chiudi|esci)( l'?assistente| la voce| qui)?$/.test(t)) return 'close';

  if (opts.awaitingYesNo && n <= 6) {
    if (
      /^(si|sì|si si|certo|certamente|esatto|esattamente|giusto|corretto|confermo|va bene|ok|okay|perfetto|usali|usa (pure|quelli|i suoi dati)|vai|procedi|si grazie|si si usa|sì usa|si è lui|si e lui|si è lei|si e lei|è giusta|e giusta|è giusto|e giusto)( pure| grazie)?$/.test(
        t,
      )
    )
      return 'yes';
    if (
      /^(no|no no|no grazie|non e giusta|non è giusta|non e giusto|non è giusto|sbagliato|sbagliata|non e lui|non è lui|non e lei|non è lei|lascia stare|lascia perdere|non serve|altro cliente|e un altro|è un altro)( grazie)?$/.test(
        t,
      )
    )
      return 'no';
  }
  return null;
}
