import type { jsPDF as JsPDF } from 'jspdf';
import type { Job, Settings } from '@/domain/types';
import { DEFAULT_ACCENT } from '@/domain/types';
import { amount, fmtDate, fmtPlate, jobNumber, monthLabel } from '@/domain/format';
import { calc, custName, daSaldare, isAz, monthlyPending, scadenza, totale, veic } from '@/domain/logic';
import { jobDate, monthTotals, rateKeys, type CompanyGroup } from '@/domain/monthly';
import { hexToRgb, inkOn, okHex } from '@/platform/brand';
import { imageSize } from '@/platform/images';

type RGB = [number, number, number];
const INK: RGB = [22, 26, 31];
const MUT: RGB = [104, 112, 122];
const LINE: RGB = [214, 219, 224];
const CARD: RGB = [244, 245, 247];
const GRP: RGB = [234, 237, 241];

const W = 210;
const M = 16;
const R = W - M;
const BOTTOM = 272;

/* jsPDF con i font standard usa WinAnsi: niente simboli fuori da Latin-1 (es. "−", "–", "•"). */
const safe = (s: string) =>
  String(s ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF€\n]/g, '');

const money = (c: number) => `€ ${amount(c)}`;

class Doc {
  d: JsPDF;
  y = 0;
  ac: RGB;
  onAc: RGB;
  constructor(d: JsPDF, accent: string) {
    this.d = d;
    this.ac = hexToRgb(okHex(accent) ? accent : DEFAULT_ACCENT);
    this.onAc = inkOn(this.ac) === '#FFFFFF' ? [255, 255, 255] : [14, 17, 20];
  }
  t(text: string | string[], x: number, y: number, o?: Parameters<JsPDF['text']>[3]) {
    this.d.text(Array.isArray(text) ? text.map(safe) : safe(text), x, y, o);
  }
  col(c: RGB) {
    this.d.setTextColor(c[0], c[1], c[2]);
  }
  font(st: 'normal' | 'bold' | 'italic', sz: number) {
    this.d.setFont('helvetica', st);
    this.d.setFontSize(sz);
  }
  fill(c: RGB) {
    this.d.setFillColor(c[0], c[1], c[2]);
  }
  box(x: number, y: number, w: number, h: number) {
    this.fill(CARD);
    this.d.roundedRect(x, y, w, h, 2.2, 2.2, 'F');
  }
  lab(text: string, x: number, y: number) {
    this.font('bold', 7.5);
    this.col(this.ac);
    this.d.setCharSpace(0.25);
    this.t(text.toUpperCase(), x, y);
    this.d.setCharSpace(0);
  }
  hr(y: number, x1 = M, x2 = R) {
    this.d.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.d.setLineWidth(0.3);
    this.d.line(x1, y, x2, y);
  }
  lines(text: string, w: number, max?: number): string[] {
    const l = this.d.splitTextToSize(safe(text), w) as string[];
    return max ? l.slice(0, max) : l;
  }

  plate(plate: string, cc: Job['plateCountry'], x: number, y: number) {
    const d = this.d;
    const rsm = cc === 'RSM';
    const pw = 44;
    const ph = 11;
    const sw = rsm ? 10 : 7;
    const txt = fmtPlate(plate, cc) || '- - -';
    d.setFillColor(255, 255, 255);
    d.setDrawColor(20, 22, 26);
    d.setLineWidth(0.55);
    d.roundedRect(x, y, pw, ph, 1.6, 1.6, 'FD');
    if (rsm) {
      this.font('bold', 6.5);
      d.setTextColor(46, 98, 184);
      this.t('RSM', x + 0.6 + sw / 2, y + 6.9, { align: 'center' });
    } else {
      d.setFillColor(28, 63, 165);
      d.rect(x + 0.5, y + 0.5, sw, ph - 1, 'F');
      d.rect(x + pw - 0.5 - 5, y + 0.5, 5, ph - 1, 'F');
      this.font('bold', 8);
      d.setTextColor(255, 255, 255);
      this.t('I', x + 0.5 + sw / 2, y + 8.6, { align: 'center' });
      d.setFillColor(255, 212, 0);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        d.circle(x + 0.5 + sw / 2 + Math.cos(a) * 2, y + 3.6 + Math.sin(a) * 2, 0.28, 'F');
      }
    }
    let fs = 14;
    this.font('bold', fs);
    const room = pw - sw - (rsm ? 4 : 9);
    while (fs > 8 && d.getTextWidth(txt) > room) this.font('bold', --fs);
    if (rsm) d.setTextColor(30, 79, 160);
    else d.setTextColor(17, 18, 20);
    this.t(txt, x + sw + 1 + room / 2 + (rsm ? 1 : 0.5), y + 7.8, { align: 'center' });
  }

  async header(s: Settings, title: string, right: string[]) {
    const d = this.d;
    this.fill(this.ac);
    d.rect(0, 0, W, 5, 'F');
    let lx = M;
    if (s.logo) {
      try {
        const z = await imageSize(s.logo);
        const bx = 22;
        const sc = Math.min(bx / z.w, bx / z.h);
        d.addImage(s.logo, /^data:image\/png/.test(s.logo) ? 'PNG' : 'JPEG', M + (bx - z.w * sc) / 2, 12 + (bx - z.h * sc) / 2, z.w * sc, z.h * sc);
        lx = M + bx + 6;
      } catch {
        lx = M;
      }
    }
    this.font('bold', 16);
    this.col(INK);
    const shopL = this.lines(s.shop || 'Officina', 104 - (lx - M), 2);
    this.t(shopL, lx, 20);
    let sy = 20 + (shopL.length - 1) * 6.4 + 5.2;
    this.font('normal', 8.5);
    this.col(MUT);
    for (const x of [s.shopAddr, [s.shopVat ? `P.IVA/COE ${s.shopVat}` : '', s.shopPhone ? `Tel. ${s.shopPhone}` : ''].filter(Boolean).join('   ')].filter(Boolean)) {
      this.t(this.lines(x, 104 - (lx - M), 1), lx, sy);
      sy += 4.2;
    }
    this.font('bold', 14);
    this.col(this.ac);
    this.t(title, R, 19.5, { align: 'right' });
    this.font('normal', 8.5);
    this.col(MUT);
    right.forEach((r, i) => this.t(r, R, 25.5 + i * 4.6, { align: 'right' }));
    this.y = Math.max(40, sy + 3, 25.5 + right.length * 4.6 + 2);
    this.hr(this.y);
    this.y += 8;
  }

  tableHead() {
    this.fill(this.ac);
    this.d.rect(M, this.y, W - 2 * M, 8, 'F');
    this.font('bold', 8.5);
    this.d.setTextColor(this.onAc[0], this.onAc[1], this.onAc[2]);
    this.t('Descrizione', M + 3.5, this.y + 5.4);
    this.t('Importo', R - 3.5, this.y + 5.4, { align: 'right' });
    this.y += 8;
  }

  ensure(h: number, head = false) {
    if (this.y + h > BOTTOM) {
      this.d.addPage();
      this.y = M;
      if (head) this.tableHead();
    }
  }

  totRow(l: string, v: string, tx: number) {
    this.font('normal', 9.5);
    this.col(INK);
    this.t(l, tx, this.y);
    this.t(v, R, this.y, { align: 'right' });
    this.y += 6.2;
  }

  footer(s: Settings, note: string) {
    const n = this.d.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      this.d.setPage(p);
      this.hr(284);
      this.font('normal', 7.5);
      this.col(MUT);
      this.t([s.shop, note].filter(Boolean).join('  -  '), M, 289);
      this.t(`Pagina ${p} di ${n}`, R, 289, { align: 'right' });
    }
  }
}

async function newDoc(s: Settings) {
  const { jsPDF } = await import('jspdf');
  const d = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  d.setProperties({ creator: 'Ponte', author: s.shop || 'Officina' });
  return new Doc(d, s.accent);
}

/* ---------------- conto della singola scheda ---------------- */

export async function buildJobPdf(j: Job, s: Settings): Promise<Blob> {
  const doc = await newDoc(s);
  const d = doc.d;
  const az = isAz(j);
  d.setProperties({ title: `Conto ${fmtPlate(j.plate, j.plateCountry) || veic(j)}` });
  await doc.header(s, az ? 'CONTO PER FATTURA' : 'CONTO LAVORI', [
    `Scheda N. ${jobNumber(j.number)}`,
    fmtDate(j.deliveredAt || j.closedAt || Date.now()),
    ...(j.invoiceNo ? [`Fattura n. ${j.invoiceNo}`] : []),
  ]);

  /* intestatario e veicolo */
  const by = doc.y;
  const bw = (W - 2 * M - 6) / 2;
  const rx = M + bw + 6;
  const info: string[] = [];
  if (az) {
    const c = j.company;
    if (c.vat) info.push(`P.IVA/COE ${c.vat}`);
    if (c.cf) info.push(`C.F. ${c.cf}`);
    if (c.addr) doc.lines(c.addr, bw - 10, 2).forEach((x) => info.push(x));
    if (c.sdi) info.push(`SDI/PEC ${c.sdi}`);
    if (j.owner) info.push(`Rif. ${j.owner}`);
  }
  if (j.phone) info.push(`Tel. ${j.phone}`);
  doc.font('bold', 11.5);
  const nameL = doc.lines(custName(j) || '-', bw - 10, 2);
  const bh = Math.max(44, 18 + (nameL.length - 1) * 5.2 + info.length * 4.4 + 5);
  doc.box(M, by, bw, bh);
  doc.box(rx, by, bw, bh);
  doc.lab(az ? 'Intestatario fattura' : 'Cliente', M + 5, by + 7.5);
  doc.font('bold', 11.5);
  doc.col(INK);
  doc.t(nameL, M + 5, by + 14.5);
  let oy = by + 14.5 + (nameL.length - 1) * 5.2 + 5.6;
  doc.font('normal', 8.8);
  doc.col(MUT);
  info.forEach((x) => {
    doc.t(doc.lines(x, bw - 10, 1), M + 5, oy);
    oy += 4.4;
  });
  doc.lab('Veicolo', rx + 5, by + 7.5);
  doc.plate(j.plate, j.plateCountry, rx + 5, by + 11);
  let vy = by + 29;
  doc.font('bold', 11);
  doc.col(INK);
  doc.t(doc.lines(veic(j), bw - 10, 1), rx + 5, vy);
  vy += 5.2;
  doc.font('normal', 8.5);
  doc.col(MUT);
  if (j.vin) {
    doc.t(`Telaio ${j.vin}`, rx + 5, vy);
    vy += 4.4;
  }
  doc.t(`${j.km ? `${j.km} km  -  ` : ''}Entrata ${fmtDate(j.createdAt)}`, rx + 5, vy);
  doc.y = by + bh + 8;

  if (j.workers?.length) {
    doc.font('bold', 9);
    doc.col(INK);
    const wl = 'Lavoro eseguito da  ';
    doc.t(wl, M, doc.y);
    const ww = d.getTextWidth(wl);
    doc.font('normal', 9);
    doc.t(doc.lines(j.workers.join(', '), W - 2 * M - ww, 2), M + ww, doc.y);
    doc.y += 7;
  }
  if (j.request) {
    doc.lab('Lavori richiesti', M, doc.y);
    doc.font('normal', 9.2);
    doc.col(INK);
    const rl = doc.lines(j.request, W - 2 * M, 4);
    doc.t(rl, M, doc.y + 5);
    doc.y += 5 + rl.length * 4.2 + 5;
  }

  /* voci */
  const items = (j.items || []).filter((i) => i.desc || i.amount);
  doc.ensure(26);
  doc.tableHead();
  if (!items.length) {
    doc.font('italic', 9.5);
    doc.col(MUT);
    doc.t('Nessuna voce inserita', M + 3.5, doc.y + 5.6);
    doc.y += 9;
  }
  items.forEach((it, n) => {
    doc.font('normal', 9.8);
    const dl = doc.lines(it.desc || 'Voce', W - 2 * M - 48);
    const rh = Math.max(8, dl.length * 4.6 + 3.6);
    doc.ensure(rh, true);
    if (n % 2 === 1) {
      doc.fill(CARD);
      d.rect(M, doc.y, W - 2 * M, rh, 'F');
    }
    doc.col(INK);
    doc.t(dl, M + 3.5, doc.y + 5.5);
    doc.t(money(it.amount), R - 3.5, doc.y + 5.5, { align: 'right' });
    doc.y += rh;
  });
  doc.hr(doc.y);
  doc.y += 5;
  if (az) {
    doc.font('italic', 8.3);
    doc.col(MUT);
    doc.t(`Importi delle voci IVA ${j.vatIncl === false ? 'esclusa' : 'inclusa'}`, M, doc.y);
  }
  doc.y += 6;

  /* totali */
  const tot = totale(j);
  const due = daSaldare(j);
  doc.ensure(46);
  const tx = R - 82;
  if (az) {
    const c = calc(j);
    doc.totRow('Imponibile', money(c.net), tx);
    doc.totRow(`IVA ${c.rate}%`, money(c.vat), tx);
  }
  doc.totRow(az ? 'Totale documento' : 'Totale lavori', money(tot), tx);
  if (j.deposit > 0) doc.totRow('Acconto versato', `- ${money(j.deposit)}`, tx);
  doc.hr(doc.y - 2.6, tx, R);
  doc.font('bold', 10.5);
  doc.col(INK);
  doc.t(j.paid ? 'Saldato' : 'Da saldare', tx, doc.y + 4.4);
  doc.font('bold', 17);
  doc.col(doc.ac);
  doc.t(money(j.paid ? j.paidAmount ?? tot : due), R, doc.y + 4.6, { align: 'right' });
  doc.y += 15;

  /* pagamento e garanzia */
  doc.ensure(34);
  const y = doc.y;
  doc.box(M, y, bw, 28);
  doc.box(rx, y, bw, 28);
  doc.lab('Pagamento', M + 5, y + 7.5);
  doc.font('bold', 11.5);
  doc.col(INK);
  doc.t(j.paid ? 'Saldato' : monthlyPending(j) ? 'Fattura di fine mese' : due > 0 ? 'Da saldare' : 'Nessun importo', M + 5, y + 15);
  doc.font('normal', 9);
  doc.col(MUT);
  const pl = j.paid ? `${fmtDate(j.paidAt)}${j.payMethod ? `  -  ${j.payMethod}` : ''}` : monthlyPending(j) ? 'Incluso nella fattura mensile' : j.payMethod ? `Metodo: ${j.payMethod}` : '';
  if (pl) doc.t(doc.lines(pl, bw - 10, 2), M + 5, y + 21);
  doc.lab('Garanzia lavori', rx + 5, y + 7.5);
  doc.font('bold', 11.5);
  doc.col(INK);
  doc.t(j.warrantyMonths > 0 ? `${j.warrantyMonths} mesi` : 'Nessuna', rx + 5, y + 15);
  if (j.warrantyMonths > 0) {
    doc.font('normal', 9);
    doc.col(MUT);
    doc.t(doc.lines(`Fino al ${fmtDate(scadenza(j))}${j.warrantyNote ? `  -  ${j.warrantyNote}` : ''}`, bw - 10, 2), rx + 5, y + 21);
  }

  doc.footer(s, az ? 'Riepilogo per la fatturazione, non è una fattura' : 'Riepilogo lavori, non valido ai fini fiscali');
  return d.output('blob');
}

/* ---------------- conto mensile per ditta ---------------- */

export async function buildMonthPdf(co: CompanyGroup, list: Job[], ym: string, no: string, s: Settings): Promise<Blob> {
  const doc = await newDoc(s);
  const d = doc.d;
  const T = monthTotals(list);
  d.setProperties({ title: `Conto mensile ${co.name} ${monthLabel(ym)}` });
  await doc.header(s, 'CONTO MENSILE', [monthLabel(ym), `${list.length} ${list.length === 1 ? 'lavoro' : 'lavori'}`, ...(no ? [`Fattura n. ${no}`] : [])]);

  const c = co.company;
  const info: string[] = [];
  if (c.vat) info.push(`P.IVA/COE ${c.vat}`);
  if (c.cf) info.push(`C.F. ${c.cf}`);
  if (c.addr) doc.lines(c.addr, W - 2 * M - 10, 2).forEach((x) => info.push(x));
  if (c.sdi) info.push(`SDI/PEC ${c.sdi}`);
  const bh = 17 + info.length * 4.4 + 3;
  doc.box(M, doc.y, W - 2 * M, bh);
  doc.lab('Intestatario fattura', M + 5, doc.y + 7.5);
  doc.font('bold', 11.5);
  doc.col(INK);
  doc.t(doc.lines(co.name, W - 2 * M - 10, 1), M + 5, doc.y + 14.5);
  doc.font('normal', 8.8);
  doc.col(MUT);
  info.forEach((x, i) => doc.t(x, M + 5, doc.y + 20 + i * 4.4));
  doc.y += bh + 8;

  doc.tableHead();
  for (const j of list) {
    doc.ensure(24, true);
    doc.fill(GRP);
    d.rect(M, doc.y, W - 2 * M, 7.5, 'F');
    doc.font('bold', 9.2);
    doc.col(INK);
    doc.t(doc.lines(`${fmtDate(jobDate(j))}  -  ${fmtPlate(j.plate, j.plateCountry) || 'senza targa'}  -  ${veic(j)}  -  scheda ${jobNumber(j.number)}`, W - 2 * M - 8, 1), M + 3.5, doc.y + 5.1);
    doc.y += 7.5;
    const items = (j.items || []).filter((i) => i.desc || i.amount);
    for (const it of items) {
      doc.font('normal', 9.8);
      const dl = doc.lines(it.desc || 'Voce', W - 2 * M - 48);
      const rh = Math.max(7.5, dl.length * 4.6 + 3);
      doc.ensure(rh, true);
      doc.col(INK);
      doc.t(dl, M + 3.5, doc.y + 5.1);
      doc.t(money(it.amount), R - 3.5, doc.y + 5.1, { align: 'right' });
      doc.y += rh;
    }
    if (!items.length) {
      doc.font('italic', 9.2);
      doc.col(MUT);
      doc.t('Nessuna voce', M + 3.5, doc.y + 5.1);
      doc.y += 7.5;
    }
    doc.ensure(8, true);
    doc.font('italic', 8.6);
    doc.col(MUT);
    doc.t(`Totale lavoro con IVA ${calc(j).rate}%${j.vatIncl === false ? ' (voci sopra IVA esclusa)' : ''}`, M + 3.5, doc.y + 5);
    doc.font('bold', 9.4);
    doc.col(INK);
    doc.t(money(calc(j).gross), R - 3.5, doc.y + 5, { align: 'right' });
    doc.y += 8;
    doc.hr(doc.y - 1);
  }
  doc.y += 7;

  doc.ensure(22 + 6.2 * (3 + rateKeys(T).length));
  const tx = R - 86;
  doc.totRow('Imponibile', money(T.net), tx);
  rateKeys(T).forEach((r) => doc.totRow(`IVA ${r}% su ${amount(T.by[r].net)}`, money(T.by[r].vat), tx));
  doc.totRow('Totale documento', money(T.gross), tx);
  if (T.dep > 0) doc.totRow('Acconti versati', `- ${money(T.dep)}`, tx);
  doc.hr(doc.y - 2.6, tx, R);
  doc.font('bold', 10.5);
  doc.col(INK);
  doc.t(T.due > 0 ? 'Da saldare' : 'Saldato', tx, doc.y + 4.4);
  doc.font('bold', 17);
  doc.col(doc.ac);
  doc.t(money(T.due > 0 ? T.due : T.gross), R, doc.y + 4.6, { align: 'right' });

  doc.footer(s, 'Riepilogo per la fatturazione, non è una fattura');
  return d.output('blob');
}

export function jobPdfName(j: Job) {
  const pl = String(j.plate || 'veicolo').replace(/[^A-Za-z0-9]/g, '') || 'veicolo';
  return `Conto-${jobNumber(j.number)}-${pl}.pdf`;
}
export function monthPdfName(co: CompanyGroup, ym: string) {
  const nm =
    co.name
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'ditta';
  return `Conto-${nm}-${ym}.pdf`;
}
