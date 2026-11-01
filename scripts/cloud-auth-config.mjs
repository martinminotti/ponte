#!/usr/bin/env node
/**
 * Imposta l'accesso con codice email del progetto Supabase di produzione (API di gestione di Supabase):
 * email in italiano con il codice di 6 cifre, durata del codice, indirizzi da cui si apre l'app.
 * Serve SUPABASE_ACCESS_TOKEN (token personale) e SUPABASE_PROJECT_REF. Facoltativi: PONTE_SITE_URL.
 * L'SMTP (mittente delle email) si imposta una volta nella dashboard: vedi docs/cloud.md.
 */
import { readFileSync } from 'node:fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Mancano SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF');
  process.exit(1);
}
const html = readFileSync(new URL('../supabase/templates/codice.html', import.meta.url), 'utf8');
const subject = 'Il tuo codice per Ponte: {{ .Token }}';
const site = process.env.PONTE_SITE_URL || 'https://martinminotti.github.io/ponte/';
const body = {
  site_url: site,
  uri_allow_list: [site, 'capacitor://localhost', 'https://localhost', 'http://localhost:5173'].join(','),
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
  mailer_subjects_magic_link: subject,
  mailer_templates_magic_link_content: html,
  mailer_subjects_confirmation: subject,
  mailer_templates_confirmation_content: html,
  external_anonymous_users_enabled: false,
  disable_signup: false,
};
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error('Configurazione dell’accesso non riuscita', res.status, await res.text());
  process.exit(1);
}
console.log('Accesso con codice email configurato.');
