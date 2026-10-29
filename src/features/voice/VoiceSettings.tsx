import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { getSettings, saveSettings } from '@/data/repo';
import type { Settings, VoiceProvider, VoiceSettings } from '@/domain/types';
import { openExternal } from '@/platform/native';
import { AutoInput, Button, Field, Note, Section, Segmented, Switch } from '@/ui/controls';
import { PROVIDERS, aiReady, cloudSttPossible, modelOf, voiceSettings } from '@/voice/config';
import { aiErrorText, testConnection, type TestResult } from '@/voice/providers';

const OPTIONS: { v: VoiceProvider; l: string; d: string }[] = [
  { v: 'base', l: 'Base, sul telefono', d: 'Senza AI e senza costi: capisce targa, telefono, chilometri, consegna e le frasi più semplici.' },
  { v: 'openai', l: 'OpenAI', d: 'Modelli GPT. Serve una chiave API di platform.openai.com.' },
  { v: 'anthropic', l: 'Anthropic (Claude)', d: 'Modelli Claude. Serve una chiave API della Console Anthropic.' },
  { v: 'gemini', l: 'Google Gemini', d: 'Modelli Gemini. Serve una chiave di Google AI Studio.' },
  { v: 'compatible', l: 'Altro compatibile con OpenAI', d: 'Groq, Mistral, OpenRouter, un server nell’officina: indirizzo, chiave e modello.' },
];

/** le modifiche si mettono in fila e partono dal valore salvato: due campi cambiati di seguito non si sovrascrivono */
let chain: Promise<void> = Promise.resolve();
function saveVoice(p: Partial<VoiceSettings>) {
  chain = chain.then(async () => {
    const cur = await getSettings();
    await saveSettings({ voice: { ...voiceSettings(cur), ...p } });
  });
  return chain;
}

/** Impostazioni → Assistente vocale (solo titolare). Qui si collega il modello: fornitore, chiave, prova. */
export function VoiceSettingsSection({ s }: { s: Settings }) {
  const v = voiceSettings(s);
  const save = saveVoice;
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<TestResult | 'running' | null>(null);
  const ai = v.provider !== 'base';
  const info = ai ? PROVIDERS[v.provider as Exclude<VoiceProvider, 'base'>] : null;

  const runTest = async () => {
    setTest('running');
    setTest(await testConnection(v));
  };

  return (
    <Section
      title="Assistente vocale"
      action={
        ai && aiReady(v) ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[0.8125rem] font-semibold text-accent-ink">
            <Sparkles size={13} /> AI collegata
          </span>
        ) : undefined
      }
    >
      <Switch checked={v.enabled} onChange={(on) => save({ enabled: on })} label="Accettazione a voce" description="Nel + e nel modulo compare il microfono: si detta la scheda parlando." />

      {v.enabled && (
        <>
          <Field label="Chi capisce le frasi" htmlFor="v-provider" hint={OPTIONS.find((o) => o.v === v.provider)?.d}>
            <select
              id="v-provider"
              className="ctl"
              value={v.provider}
              onChange={(e) => {
                setTest(null);
                save({ provider: e.target.value as VoiceProvider, model: '', stt: e.target.value === 'anthropic' ? 'device' : v.stt });
              }}
            >
              {OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Field>

          {ai && info && (
            <>
              <Segmented
                size="sm"
                label="Collegamento"
                value={v.connection}
                onChange={(c) => {
                  setTest(null);
                  save({ connection: c });
                }}
                options={[
                  { v: 'key', l: 'Chiave su questo dispositivo' },
                  { v: 'proxy', l: 'Server ponte' },
                ]}
              />

              {v.connection === 'key' ? (
                <>
                  {v.provider === 'compatible' && (
                    <Field label="Indirizzo dell’API" htmlFor="v-base" hint="Es. https://api.groq.com/openai/v1 oppure https://api.mistral.ai/v1">
                      <AutoInput
                        id="v-base"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://…/v1"
                        value={v.baseUrl}
                        onCommit={(x) => save({ baseUrl: x.trim() })}
                      />
                    </Field>
                  )}
                  <Field
                    label="Chiave API"
                    htmlFor="v-key"
                    hint={
                      <>
                        Resta solo su questo dispositivo e non finisce nei backup.{' '}
                        {info.keyUrl && (
                          <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-accent-ink" onClick={() => openExternal(info.keyUrl)}>
                            Crea una chiave <ExternalLink size={13} />
                          </button>
                        )}
                      </>
                    }
                  >
                    <div className="relative">
                      <AutoInput
                        id="v-key"
                        type={show ? 'text' : 'password'}
                        autoComplete="off"
                        spellCheck={false}
                        autoCapitalize="off"
                        className="!pr-12 font-mono text-[0.9375rem]"
                        placeholder={info.keyHint}
                        value={v.apiKey}
                        onCommit={(x) => {
                          setTest(null);
                          save({ apiKey: x.trim() });
                        }}
                      />
                      <button
                        type="button"
                        aria-label={show ? 'Nascondi la chiave' : 'Mostra la chiave'}
                        onClick={() => setShow((x) => !x)}
                        className="press absolute top-1/2 right-1.5 grid size-10 -translate-y-1/2 place-items-center rounded-[10px] text-ink-3 hover:bg-surface-3"
                      >
                        {show ? <EyeOff size={19} /> : <Eye size={19} />}
                      </button>
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Indirizzo del server ponte" htmlFor="v-proxy" hint="Il server tiene la chiave al posto dei telefoni (vedi docs/assistente-vocale.md). Consigliato con più dispositivi.">
                    <AutoInput
                      id="v-proxy"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://ponte-ai.tuo-nome.workers.dev"
                      value={v.proxyUrl}
                      onCommit={(x) => save({ proxyUrl: x.trim() })}
                    />
                  </Field>
                  <Field label="Codice dell’officina" htmlFor="v-token" hint="Lo stesso impostato sul server: impedisce ad altri di usarlo.">
                    <AutoInput id="v-token" type="password" autoComplete="off" spellCheck={false} value={v.proxyToken} onCommit={(x) => save({ proxyToken: x.trim() })} />
                  </Field>
                </>
              )}

              <Field label="Modello" htmlFor="v-model" hint={info.model ? `Vuoto = ${info.model}, veloce ed economico.` : 'Il nome del modello sul servizio scelto.'}>
                <AutoInput
                  id="v-model"
                  list="v-models"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder={info.model || 'nome-del-modello'}
                  value={v.model}
                  onCommit={(x) => save({ model: x.trim() })}
                />
                <datalist id="v-models">
                  {info.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>

              <Field
                label="Trascrizione della voce"
                hint={
                  v.stt === 'cloud'
                    ? 'L’audio va al servizio scelto: utile sui telefoni senza riconoscimento vocale (Android) o nel rumore.'
                    : 'Riconoscimento di Apple o del browser: sull’iPhone, quando possibile, senza rete e senza inviare l’audio.'
                }
              >
                <Segmented
                  size="sm"
                  label="Trascrizione della voce"
                  value={v.stt}
                  onChange={(x) => save({ stt: x })}
                  options={[{ v: 'device', l: 'Sul dispositivo' }, ...(cloudSttPossible(v) ? [{ v: 'cloud' as const, l: 'Nel cloud' }] : [])]}
                />
              </Field>

              <div className="flex flex-col gap-2.5">
                <Button
                  variant="outline"
                  onClick={runTest}
                  disabled={!aiReady(v) || test === 'running'}
                  icon={test === 'running' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                >
                  {test === 'running' ? 'Provo…' : 'Prova l’assistente'}
                </Button>
                {!aiReady(v) && (
                  <p className="text-[0.875rem] text-ink-3">
                    {v.connection === 'proxy' ? 'Inserisci l’indirizzo del server ponte.' : v.provider === 'compatible' ? 'Inserisci indirizzo, chiave e modello.' : 'Inserisci la chiave API.'}
                  </p>
                )}
                {test &&
                  test !== 'running' &&
                  (test.ok ? (
                    <Note tone="ok" icon={<CheckCircle2 size={18} />}>
                      Funziona: {modelOf(v)} ha capito «Golf targa GK 482 TR di Mario Rossi» in {(test.ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s.
                    </Note>
                  ) : (
                    <Note tone="danger" icon={<XCircle size={18} />}>
                      {aiErrorText(test.error)}
                      {test.error.detail && <span className="mt-1 block text-[0.8125rem] font-normal break-words opacity-85">{test.error.detail}</span>}
                    </Note>
                  ))}
              </div>

              <Note icon={<ShieldCheck size={18} />}>
                Le frasi dettate e i campi della scheda in compilazione vanno a {info.label} per essere interpretati. L’archivio dei clienti e le foto restano sul dispositivo. Ricordalo
                nell’informativa privacy dell’officina.
              </Note>
            </>
          )}

          <Switch
            checked={v.speak}
            onChange={(on) => save({ speak: on })}
            label="Risposte a voce"
            description="L’assistente conferma la targa e chiede quello che manca. Si può zittire anche dalla schermata."
          />
        </>
      )}
    </Section>
  );
}
