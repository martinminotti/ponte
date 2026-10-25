import { db } from './db';
import { getSettings, normalizeJob } from './repo';
import type { Job, StatusKey } from '@/domain/types';
import { uid } from '@/domain/format';

const H = 3_600_000;
const D = 24 * H;

function it(desc: string, euro: number) {
  return { id: uid('i'), desc, amount: Math.round(euro * 100) };
}

function iso(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hist(path: StatusKey[], start: number, step: number) {
  return path.map((s, i) => ({ s, t: start + i * step }));
}

/** Schede di esempio, segnate con demo: true per poterle eliminare in un colpo. */
export async function seedDemo(): Promise<number> {
  const now = Date.now();
  const s = await getSettings();
  const ditta = {
    name: 'Trasporti Gualdi S.r.l.',
    vat: 'SM24518',
    cf: '',
    addr: 'Strada del Marano 41, 47899 Serravalle RSM',
    sdi: '',
  };
  const raw: Partial<Job>[] = [
    {
      plate: 'GK482TR', make: 'Volkswagen', model: 'Golf 2.0 TDI', km: '128.400', owner: 'Marco Bianchi', phone: '335 812 4471',
      services: ['Meccanica'], request: 'Tagliando e rumore dai freni anteriori in frenata.', notes: 'Graffio sul paraurti posteriore sx. Spia service accesa.',
      status: 'lavorazione', history: hist(['accettato', 'diagnosi', 'lavorazione'], now - 5 * H, H),
      items: [it('Tagliando completo', 189), it('Pastiglie freni anteriori', 96.5), it("Mano d'opera", 70)],
      workers: ['Luca', 'Davide'], createdAt: now - 5 * H, dueDate: iso(now + D),
    },
    {
      plate: 'A4721', plateCountry: 'RSM', make: 'Fiat', model: 'Panda Cross', km: '64.120', owner: 'Giulia Terenzi', phone: '+378 0549 887 120',
      services: ['Gomme'], tyres: '185/65 R15', request: 'Cambio gomme invernali.', status: 'pronto',
      history: hist(['accettato', 'lavorazione', 'pronto'], now - 26 * H, 2 * H), closedAt: now - 22 * H,
      items: [it('Cambio gomme (4)', 48), it('Equilibratura', 32)], deposit: 0, workers: ['Davide'], createdAt: now - 26 * H, dueDate: iso(now),
    },
    {
      plate: 'FX903LM', make: 'BMW', model: 'X3 xDrive20d', km: '91.870', owner: 'Andrea Gasperoni', phone: '338 220 9013',
      services: ['Elettrauto'], request: 'Batteria scarica la mattina, avviamento difficile.', status: 'ricambi',
      history: hist(['accettato', 'diagnosi', 'ricambi'], now - 2 * D, 3 * H), items: [it('Diagnosi elettronica', 45)],
      deposit: 5000, workers: ['Luca'], createdAt: now - 2 * D, dueDate: iso(now - D),
    },
    {
      plate: 'EZ215KB', make: 'Iveco', model: 'Daily 35S14', km: '211.300', client: 'azienda', company: ditta, owner: 'Paolo Gualdi', phone: '335 760 1180',
      services: ['Meccanica'], request: 'Kit distribuzione e controllo frizione.', status: 'consegnato',
      history: hist(['accettato', 'lavorazione', 'pronto', 'consegnato'], now - 9 * D, D), closedAt: now - 7 * D, deliveredAt: now - 6 * D,
      items: [it('Kit distribuzione', 420), it("Mano d'opera", 260)], vatRate: 17, vatIncl: false, billing: 'mensile', workers: ['Luca', 'Davide'], createdAt: now - 9 * D,
    },
    {
      plate: 'FA118GS', make: 'Ford', model: 'Transit Custom', km: '154.020', client: 'azienda', company: ditta, owner: 'Paolo Gualdi', phone: '335 760 1180',
      services: ['Gomme', 'Meccanica'], tyres: '215/65 R16C', request: 'Gomme e convergenza.', status: 'pronto',
      history: hist(['accettato', 'lavorazione', 'pronto'], now - 3 * D, 4 * H), closedAt: now - 3 * D + 8 * H,
      items: [it('Cambio gomme (4)', 520), it('Convergenza', 55)], vatRate: 17, vatIncl: false, billing: 'mensile', workers: ['Davide'], createdAt: now - 3 * D,
    },
    {
      plate: 'DP774XC', make: 'Toyota', model: 'Yaris Hybrid', km: '77.900', owner: 'Elena Casadei', phone: '347 559 0021',
      services: ['Meccanica'], request: 'Ricarica climatizzatore.', status: 'consegnato',
      history: hist(['accettato', 'pronto', 'consegnato'], now - 12 * D, 6 * H), closedAt: now - 12 * D + 6 * H, deliveredAt: now - 12 * D + 12 * H,
      items: [it('Ricarica climatizzatore', 85)], paid: true, paidAt: now - 12 * D + 12 * H, paidAmount: 8500, payMethod: 'Carta / POS', createdAt: now - 12 * D,
    },
    {
      plate: 'GB650NV', make: 'Renault', model: 'Clio TCe', km: '38.410', owner: 'Simone Righi', phone: '331 908 7765',
      services: ['Elettrauto'], request: 'Alternatore rumoroso.', status: 'consegnato',
      history: hist(['accettato', 'lavorazione', 'pronto', 'consegnato'], now - 4 * D, 5 * H), closedAt: now - 3 * D, deliveredAt: now - 2 * D,
      items: [it('Alternatore', 310), it("Mano d'opera", 90)], deposit: 10000, workers: ['Luca'], createdAt: now - 4 * D,
    },
    {
      plate: 'GN037HD', make: 'Peugeot', model: '208', km: '12.050', owner: 'Chiara Valentini', phone: '339 412 6650',
      services: ['Meccanica'], request: 'Primo tagliando.', status: 'accettato', history: hist(['accettato'], now - 40 * 60_000, 1),
      items: [], createdAt: now - 40 * 60_000,
    },
  ];
  // storico: lavori consegnati e pagati nelle ultime settimane, per dare vita a Oggi e ai grafici
  const storico: [string, string, string, string, number, number, string][] = [
    ['FG219PL', 'Audi', 'A4 Avant', 'Nicola Ugolini', 6, 412, 'Carta / POS'],
    ['EK330ST', 'Fiat', 'Ducato', 'Stefano Guidi', 13, 265, 'Contanti'],
    ['GA771MM', 'Mini', 'Cooper S', 'Laura Michelotti', 17, 138, 'Bonifico'],
    ['DZ402AR', 'Opel', 'Corsa', 'Roberto Zonzini', 24, 96, 'Contanti'],
    ['FK118BN', 'Volvo', 'XC60 B4', 'Marta Berardi', 30, 640, 'Carta / POS'],
    ['GC905TT', 'Kia', 'Sportage', 'Davide Muccioli', 37, 228, 'Carta / POS'],
    ['EH644CV', 'Lancia', 'Ypsilon', 'Anna Selva', 44, 74, 'Contanti'],
    ['FP287LK', 'Skoda', 'Octavia', 'Paolo Casali', 47, 352, 'Bonifico'],
  ];
  for (const [plate, make, model, owner, daysAgo, euro, payMethod] of storico) {
    const t0 = now - daysAgo * D - 2 * D;
    const paidAt = now - daysAgo * D;
    raw.push({
      plate, make, model, owner, phone: '', services: ['Meccanica'], status: 'consegnato',
      history: hist(['accettato', 'lavorazione', 'pronto', 'consegnato'], t0, 12 * H), closedAt: paidAt - 6 * H, deliveredAt: paidAt,
      items: [it('Tagliando completo', euro * 0.7), it("Mano d'opera", euro * 0.3)], paid: true, paidAt, paidAmount: Math.round(euro * 100), payMethod, createdAt: t0,
    });
  }

  const sorted = raw.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let n = Math.max(s.nextNumber || 1, ((await db.jobs.orderBy('number').last())?.number ?? 0) + 1);
  const jobs = sorted.map((j) =>
    normalizeJob({
      vatRate: s.vat,
      warrantyMonths: s.warranty,
      ...j,
      id: uid('j'),
      number: n++,
      updatedAt: j.createdAt || now,
      demo: true,
    }),
  );
  await db.transaction('rw', db.jobs, db.settings, async () => {
    await db.jobs.bulkAdd(jobs);
    const workers = Array.from(new Set([...(s.workers || []), 'Luca', 'Davide']));
    await db.settings.put({ ...s, workers, nextNumber: n, key: 'main' });
  });
  return jobs.length;
}
