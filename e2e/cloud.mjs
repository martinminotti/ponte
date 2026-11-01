/**
 * Prova dell'app vera nel browser contro Supabase locale (CI): il titolare entra con il codice email, crea
 * l'officina, registra un'accettazione e invita un dipendente; il dipendente entra con l'invito e vede la scheda
 * arrivare. Screenshot in e2e/out per controllare a occhio.
 *
 * Uso: APP_URL=http://localhost:4173/ SUPABASE_MAIL_URL=http://127.0.0.1:54324 node e2e/cloud.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:4173/';
const MAIL = process.env.SUPABASE_MAIL_URL || 'http://127.0.0.1:54324';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

async function codeFor(email) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
      if (r.ok) {
        const code = (await r.json()).messages?.[0]?.Subject.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('nessun codice per ' + email);
}

const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? '✅' : '❌'} ${what}`);
  if (!ok) fails.push(what);
};

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'it-IT' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name}] ERRORE`, e.message));
  p.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console`, m.text().slice(0, 300)));
  p.shot = (n) => p.screenshot({ path: `${OUT}${name}-${n}.png` });
  return p;
}

async function signIn(p, email) {
  await p.goto(APP);
  await p.waitForSelector('#acc-email', { timeout: 20000 });
  await p.shot('01-accesso');
  await p.fill('#acc-email', email);
  await p.getByRole('button', { name: 'Ricevi il codice' }).click();
  await p.getByText('Scrivi il codice').waitFor({ timeout: 15000 });
  await p.shot('02-codice');
  await p.getByLabel('Codice di 6 cifre').fill(await codeFor(email));
}

const browser = await chromium.launch();
try {
  const run = Math.random().toString(36).slice(2, 7);
  // ---------------- titolare
  const a = await phone(browser, 'titolare');
  await signIn(a, `mario-${run}@prova.ponte`);
  await a.getByText('Crea la tua officina').waitFor({ timeout: 15000 });
  await a.shot('03-scelta');
  await a.getByText('Crea la tua officina').click();
  await a.fill('#acc-shop', 'Autofficina Prova');
  await a.fill('#acc-me', 'Mario');
  await a.getByRole('button', { name: 'Crea officina' }).click();
  await a.waitForURL(/#\/$/, { timeout: 20000 }).catch(() => {});
  await a.waitForTimeout(1500);
  await a.shot('04-oggi');
  check(!(await a.locator('#acc-email').count()), 'titolare: dopo la creazione si entra nell’app');

  // accettazione dal modulo
  await a.goto(APP + '#/nuova?cl=privato');
  await a.waitForSelector('#f-plate', { timeout: 15000 });
  await a.fill('#f-plate', 'GK482TR');
  await a.fill('#f-owner', 'Marco Bianchi');
  await a.fill('#f-make', 'Volkswagen');
  await a.fill('#f-model', 'Golf');
  await a.getByRole('button', { name: 'Registra accettazione' }).last().click();
  await a.waitForURL(/#\/schede/, { timeout: 15000 });
  await a.waitForTimeout(2500);
  await a.shot('05-schede');
  check((await a.getByText('N. 0001', { exact: false }).count()) > 0, 'titolare: la scheda ha il numero 0001 assegnato dal server');

  // invito
  await a.goto(APP + '#/impostazioni');
  await a.getByRole('button', { name: 'Invita un dipendente' }).click();
  await a.fill('#inv-name', 'Luca');
  await a.getByRole('button', { name: 'Crea il codice' }).click();
  const codeEl = a.locator('p.tnum', { hasText: /^[A-Z2-9]{4}-[A-Z2-9]{4}$/ });
  await codeEl.waitFor({ timeout: 15000 });
  const invite = (await codeEl.textContent()).trim();
  await a.shot('06-invito');
  check(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(invite), `titolare: codice d’invito ${invite}`);
  await a.keyboard.press('Escape');

  // ---------------- dipendente
  const b = await phone(browser, 'dipendente');
  await signIn(b, `luca-${run}@prova.ponte`);
  await b.getByText('Ho un codice d’invito').waitFor({ timeout: 15000 });
  await b.getByText('Ho un codice d’invito').click();
  await b.fill('#acc-code', invite.toLowerCase());
  await b.fill('#acc-name', 'Luca');
  await b.shot('07-invito');
  await b.getByRole('button', { name: 'Entra nell’officina' }).click();
  await b.waitForURL(/#\/schede/, { timeout: 20000 }).catch(() => {});
  await b.getByText('Volkswagen Golf', { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
  await b.shot('08-schede');
  check((await b.getByText('Volkswagen Golf', { exact: false }).count()) > 0, 'dipendente: la scheda del titolare è arrivata');

  // il dipendente cambia lo stato, il titolare lo vede
  await b.getByText('Volkswagen Golf', { exact: false }).first().click();
  await b.waitForTimeout(1200);
  await b.shot('09-scheda');
  await b.goto(APP + '#/impostazioni');
  await b.waitForTimeout(1500);
  await b.shot('10-impostazioni');
  check((await b.getByText('Dipendente', { exact: false }).count()) > 0, 'dipendente: in Impostazioni il ruolo è dipendente');

  await a.goto(APP + '#/impostazioni');
  await a.waitForTimeout(2500);
  await a.shot('11-squadra');
  check((await a.getByText('Luca', { exact: true }).count()) > 0, 'titolare: Luca compare nella squadra');
} catch (e) {
  console.log('❌ interrotto:', e.message);
  fails.push(e.message);
} finally {
  await browser.close();
}
console.log(fails.length ? `${fails.length} controlli falliti` : 'tutti i controlli superati');
process.exit(fails.length ? 1 : 0);
