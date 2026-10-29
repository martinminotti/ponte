import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/domain/draft';
import { applyPatch } from './fields';
import { localInterpret } from './local';
import { detectCommand, isFiller } from './commands';
import { compose, greeting, missingForSave, nextAsk } from './dialog';
import { fmtPhone, matchBrand, numberWord, parseDate, parseKm, parsePhone, parsePlate, parseTyre, parseVin, properName, similarity, vatChecksumOk } from './spoken';

// giovedì 29 ottobre 2026
const NOW = new Date(2026, 9, 29, 10, 0);

describe('numeri a parole', () => {
  it.each([
    ['tre', 3],
    ['ventitre', 23],
    ['ventuno', 21],
    ['ventotto', 28],
    ['centotto', 108],
    ['centottanta', 180],
    ['trecentotrentacinque', 335],
    ['duemila', 2000],
    ['mille', 1000],
    ['centoventimila', 120000],
    ['centoventimilatrecento', 120300],
    ['milleduecento', 1200],
    ['diciassette', 17],
  ])('%s → %d', (w, n) => expect(numberWord(w)).toBe(n));
  it('non scambia parole qualsiasi per numeri', () => {
    expect(numberWord('duetre')).toBeNull();
    expect(numberWord('golf')).toBeNull();
    expect(numberWord('trenino')).toBeNull();
  });
});

describe('targa', () => {
  it.each([
    ['gi kappa quattro otto due ti erre', 'GK482TR'],
    ['G come Genova K come Kursaal 482 T come Torino R come Roma', 'GK482TR'],
    ['GK 482 TR', 'GK482TR'],
    ['gk482tr', 'GK482TR'],
    ['effe a uno uno uno a a', 'FA111AA'],
    ['la targa è EZ 215 KB', 'EZ215KB'],
    ['doppia vu emme 123 zeta zeta', 'WM123ZZ'],
    ['ics ipsilon cinquecento ottanta erre esse', 'XY580RS'],
  ])('%s → %s', (t, p) => expect(parsePlate(t, 'I')).toBe(p));
  it('San Marino', () => {
    expect(parsePlate('a quattro sette due uno', 'RSM')).toBe('A4721');
    expect(parsePlate('targa di San Marino B 1234', 'RSM')).toBe('B1234');
  });
  it('si ferma quando la targa è completa', () => {
    const p = localInterpret('targa GK 482 TR e il proprietario è Marco Bianchi', emptyDraft(), { now: NOW });
    expect(p.plate).toBe('GK482TR');
    expect(p.owner).toBe('marco bianchi');
  });
});

describe('telefono, telaio, chilometri, gomme', () => {
  it('telefono', () => {
    expect(parsePhone('tre tre cinque otto uno due quattro quattro sette uno')).toBe('3358124471');
    expect(parsePhone('335 812 4471')).toBe('3358124471');
    expect(parsePhone('più tre nove tre tre cinque otto uno due quattro quattro sette uno')).toBe('+393358124471');
    expect(parsePhone('zero cinque quattro nove novecentoundici sei sei')).toBe('054991166');
    expect(fmtPhone('3358124471')).toBe('335 812 4471');
    expect(fmtPhone('+3783358124')).toBe('+378 335 8124');
    expect(fmtPhone('0549991166')).toBe('0549 991166');
  });
  it('telaio: niente I, O, Q', () => {
    expect(parseVin('WVW ZZZ 1K Z 6W 000 001')).toBe('WVWZZZ1KZ6W000001');
    expect(parseVin('wvwzzz1kzoW000001')).toBe('WVWZZZ1KZ0W000001');
  });
  it('chilometri', () => {
    expect(parseKm('120.000 km')).toBe(120000);
    expect(parseKm('centoventimila chilometri')).toBe(120000);
    expect(parseKm('ha 85 mila km')).toBe(85000);
    expect(parseKm('chilometri 45000')).toBe(45000);
  });
  it('gomme', () => {
    expect(parseTyre('205 55 16')).toBe('205/55 R16');
    expect(parseTyre('gomme 225/45 R17 91 v')).toBe('225/45 R17 91V');
    expect(parseTyre('duecentocinque cinquantacinque erre sedici')).toBe('205/55 R16');
    expect(parseTyre('ha 85 mila km')).toBe('');
  });
});

describe('date', () => {
  it.each([
    ['oggi in giornata', '2026-10-29'],
    ['per domani', '2026-10-30'],
    ['dopodomani', '2026-10-31'],
    ['la vuole venerdì', '2026-10-30'],
    ['per giovedì', '2026-11-05'],
    ['lunedì', '2026-11-02'],
    ['fra tre giorni', '2026-11-01'],
    ['il 5 novembre', '2026-11-05'],
    ['entro il cinque novembre', '2026-11-05'],
    ['5/11', '2026-11-05'],
    ['il 3 gennaio', '2027-01-03'],
    ['venerdì della settimana prossima', '2026-11-06'],
  ])('%s → %s', (t, iso) => expect(parseDate(t, NOW)).toBe(iso));
});

describe('marche e nomi', () => {
  it('marche storpiate', () => {
    expect(matchBrand('volkswagen')).toBe('Volkswagen');
    expect(matchBrand('wolkswagen')).toBe('Volkswagen');
    expect(matchBrand('mercedes')).toBe('Mercedes-Benz');
    expect(matchBrand('peugeut')).toBe('Peugeot');
    expect(matchBrand('citroen')).toBe('Citroën');
    expect(matchBrand('golf')).toBe('');
    expect(matchBrand('freni')).toBe('');
  });
  it('nomi', () => {
    expect(properName('il signor marco bianchi')).toBe('Marco Bianchi');
    expect(properName("giulia d'angelo")).toBe("Giulia D'Angelo");
  });
  it('partita IVA', () => {
    expect(vatChecksumOk('01234567897')).toBe(true);
    expect(vatChecksumOk('01234567890')).toBe(false);
  });
});

describe('interprete di base, frasi da banco', () => {
  it('la frase completa di esempio', () => {
    const p = localInterpret('Golf grigia targa GK 482 TR, è di Marco Bianchi, telefono 335 812 4471, fa rumore ai freni, la vuole venerdì', emptyDraft(), { now: NOW });
    expect(p.plate).toBe('GK482TR');
    expect(p.make).toBe('Volkswagen');
    expect(p.model).toBe('golf');
    expect(p.owner).toBe('marco bianchi');
    expect(p.phone).toBe('3358124471');
    expect(p.request).toContain('rumore ai freni');
    expect(p.dueDate).toBe('2026-10-30');
    expect(p.servicesAdd).toContain('Meccanica');
    const a = applyPatch(emptyDraft(), p, NOW);
    expect(a.draft.plate).toBe('GK482TR');
    expect(a.draft.owner).toBe('Marco Bianchi');
    expect(a.draft.phone).toBe('335 812 4471');
    expect(a.draft.model).toBe('Golf');
    expect(a.draft.request).toBe('Fa rumore ai freni');
    expect(a.issues).toEqual([]);
  });
  it('marca e modello', () => {
    const p = localInterpret('una volkswagen polo 1.2 bianca', emptyDraft(), { now: NOW });
    expect(p.make).toBe('Volkswagen');
    expect(p.model).toBe('polo 1.2');
  });
  it('risposte secche alla domanda', () => {
    expect(localInterpret('Marco Bianchi', emptyDraft(), { expect: 'owner' }).owner).toBe('marco bianchi');
    expect(localInterpret('tre tre cinque otto uno due quattro quattro sette uno', emptyDraft(), { expect: 'phone' }).phone).toBe('3358124471');
    expect(localInterpret('gi kappa 482 ti erre', emptyDraft(), { expect: 'plate' }).plate).toBe('GK482TR');
    expect(localInterpret('il tagliando e controllare le luci', emptyDraft(), { expect: 'request' }).request).toContain('tagliando');
  });
  it('note all’arrivo separate dai lavori', () => {
    const p = localInterpret('ha un graffio sul paraurti posteriore, mezzo serbatoio. Deve fare il tagliando', emptyDraft(), { now: NOW });
    expect(p.notes).toContain('graffio sul paraurti');
    expect(p.notes).toContain('mezzo serbatoio');
    expect(p.request).toContain('tagliando');
  });
  it('ditta con partita IVA', () => {
    const p = localInterpret('è della ditta Edil Rossi srl, partita iva 01234567897', emptyDraft(), { now: NOW });
    expect(p.client).toBe('azienda');
    expect(p.companyVat).toBe('01234567897');
    const a = applyPatch(emptyDraft(), p, NOW);
    expect(a.draft.company.name).toBe('Edil Rossi Srl');
    expect(a.issues).toEqual([]);
  });
  it('«di Nome Cognome» dopo targa o modello', () => {
    expect(localInterpret('targa AB 123 CD di Luca Verdi', emptyDraft(), { now: NOW }).owner).toBe('luca verdi');
    expect(localInterpret('una Panda di Anna Neri', emptyDraft(), { now: NOW }).owner).toBe('anna neri');
    expect(localInterpret('rumore di freni anteriori', emptyDraft(), { now: NOW }).owner).toBeUndefined();
  });
  it('modello seguito dalla targa', () => {
    const p = localInterpret('Ducato targa EZ 215 KB', emptyDraft(), { now: NOW });
    expect(p.make).toBe('Fiat');
    expect(p.model).toBe('ducato');
    expect(p.plate).toBe('EZ215KB');
  });
  it('partita IVA ripetuta dopo la domanda: non è un telefono', () => {
    const p = localInterpret('zero uno due tre quattro cinque sei sette otto nove sette', emptyDraft('azienda'), { expect: 'cvat' });
    expect(p.companyVat).toBe('01234567897');
    expect(p.phone).toBeUndefined();
  });
  it('niente WhatsApp e chilometri', () => {
    const p = localInterpret('ha 120.000 km, niente whatsapp', emptyDraft(), { now: NOW });
    expect(p.km).toBe('120000');
    expect(p.wa).toBe(false);
  });
  it('lavoro e graffio nella stessa frase: due campi, accenti conservati', () => {
    const p = localInterpret("Fa rumore ai freni anteriori e c'è un graffio sul paraurti, la vuole venerdì", emptyDraft(), { now: NOW });
    expect(p.request).toBe('Fa rumore ai freni anteriori');
    expect(p.notes).toBe("c'è un graffio sul paraurti");
    expect(p.dueDate).toBe('2026-10-30');
  });
  it('gomme invernali con misura', () => {
    const p = localInterpret('cambio gomme invernali 205 55 16', emptyDraft(), { now: NOW });
    expect(p.tyres).toBe('205/55 R16');
    expect(p.servicesAdd).toContain('Gomme');
  });
  it('chiacchiere: nessun dato', () => {
    const p = localInterpret('sì sì si accomodi pure, arrivo subito', emptyDraft(), { now: NOW });
    expect(p.plate).toBeUndefined();
    expect(p.owner).toBeUndefined();
    expect(p.phone).toBeUndefined();
  });
});

describe('applicazione dei campi: controlli', () => {
  it('targa insolita: si chiede conferma', () => {
    const a = applyPatch(emptyDraft(), { plate: 'MI 1A2345' }, NOW);
    expect(a.draft.plate).toBe('MI1A2345');
    expect(a.issues[0].code).toBe('plate_unusual');
  });
  it('telefono troppo corto: non si scrive e si richiede', () => {
    const a = applyPatch(emptyDraft(), { phone: '335 81' }, NOW);
    expect(a.draft.phone).toBe('');
    expect(a.issues[0].code).toBe('phone_short');
  });
  it('partita IVA che non torna', () => {
    const a = applyPatch(emptyDraft(), { companyVat: '01234567890' }, NOW);
    expect(a.draft.client).toBe('azienda');
    expect(a.issues[0].code).toBe('vat_checksum');
  });
  it('COE di San Marino accettato', () => {
    const a = applyPatch(emptyDraft(), { companyName: 'Officine Titano', companyVat: '12345' }, NOW);
    expect(a.issues).toEqual([]);
  });
  it('consegna nel passato rifiutata', () => {
    const a = applyPatch(emptyDraft(), { dueDate: '2026-10-01' }, NOW);
    expect(a.draft.dueDate).toBe('');
    expect(a.issues[0].code).toBe('date_past');
  });
  it('lavori aggiunti senza doppioni, oppure sostituiti', () => {
    let d = applyPatch(emptyDraft(), { request: 'tagliando' }, NOW).draft;
    d = applyPatch(d, { request: 'Tagliando' }, NOW).draft;
    expect(d.request).toBe('Tagliando');
    d = applyPatch(d, { request: 'controllare i freni' }, NOW).draft;
    expect(d.request).toBe('Tagliando. Controllare i freni');
    d = applyPatch(d, { request: 'solo il tagliando', requestMode: 'replace' }, NOW).draft;
    expect(d.request).toBe('Solo il tagliando');
  });
  it('valori dettati a parole passati dal modello', () => {
    const a = applyPatch(emptyDraft(), { plate: 'gi kappa quattro otto due ti erre', phone: 'tre tre cinque otto uno due quattro quattro sette uno', km: 'centoventimila' }, NOW);
    expect(a.draft.plate).toBe('GK482TR');
    expect(a.draft.phone).toBe('335 812 4471');
    expect(a.draft.km).toBe('120.000');
  });
  it('cancellare un campo', () => {
    const d = applyPatch(emptyDraft(), { phone: '3358124471' }, NOW).draft;
    expect(applyPatch(d, { clear: ['phone'] }, NOW).draft.phone).toBe('');
  });
  it('modello e marca normalizzati', () => {
    const d = applyPatch(emptyDraft(), { make: 'wolkswagen', model: 'golf 2.0 tdi' }, NOW).draft;
    expect(d.make).toBe('Volkswagen');
    expect(d.model).toBe('Golf 2.0 TDI');
  });
});

describe('comandi', () => {
  it.each([
    ['registra', 'save'],
    ['ok registra pure', 'save'],
    ['ho finito', 'save'],
    ['annulla', 'undo'],
    ['annulla l’ultima', 'undo'],
    ['un attimo', 'pause'],
    ['cosa posso dire?', 'help'],
  ])('%s → %s', (t, c) => expect(detectCommand(t)).toBe(c));
  it('sì e no solo quando c’è una domanda', () => {
    expect(detectCommand('sì')).toBeNull();
    expect(detectCommand('sì', { awaitingYesNo: true })).toBe('yes');
    expect(detectCommand('no non è lui', { awaitingYesNo: true })).toBeNull();
    expect(detectCommand('non è lui', { awaitingYesNo: true })).toBe('no');
  });
  it('frasi lunghe non sono comandi', () => {
    expect(detectCommand('registra anche che la spia del motore è accesa')).toBeNull();
  });
  it('riempitivi', () => {
    expect(isFiller('ehm')).toBe(true);
    expect(isFiller('allora vediamo')).toBe(true);
    expect(isFiller('Golf')).toBe(false);
  });
});

describe('dialogo', () => {
  it('chiede prima la targa, poi il proprietario, poi i facoltativi una volta', () => {
    const d = emptyDraft();
    expect(nextAsk(d)?.field).toBe('plate');
    const d2 = { ...d, plate: 'GK482TR' };
    expect(nextAsk(d2)?.field).toBe('owner');
    const d3 = { ...d2, owner: 'Marco' };
    expect(nextAsk(d3)?.field).toBe('request');
    expect(nextAsk(d3, { request: 1 })?.field).toBe('phone');
    expect(nextAsk(d3, { request: 1, phone: 1, make: 1 })).toBeNull();
  });
  it('azienda: ragione sociale e partita IVA', () => {
    const d = { ...emptyDraft('azienda'), plate: 'GK482TR' };
    expect(nextAsk(d)?.field).toBe('cname');
    expect(missingForSave(d)).toBe('il nome della ditta e la partita IVA');
  });
  it('risposta: conferma la targa lettera per lettera e chiede il resto', () => {
    const a = applyPatch(emptyDraft(), { plate: 'GK482TR' }, NOW);
    const r = compose(a.changes, a.issues, nextAsk(a.draft));
    expect(r.say).toBe('Targa G, K, 4, 8, 2, T, R. Di chi è il veicolo? Nome e cognome.');
    expect(r.expect).toBe('owner');
  });
  it('saluto con i dati del cliente che torna', () => {
    const r = greeting({ ...emptyDraft(), plate: 'GK482TR', owner: 'Marco Bianchi' });
    expect(r.say).toContain('Ho già i dati di Marco Bianchi.');
    expect(r.expect).toBe('request');
  });
  it('eco della voce dell’assistente', () => {
    expect(similarity('Di chi è il veicolo? Nome e cognome.', 'di chi è il veicolo nome e cognome')).toBeGreaterThan(0.8);
    expect(similarity('Di chi è il veicolo?', 'Marco Bianchi')).toBe(0);
  });
});
