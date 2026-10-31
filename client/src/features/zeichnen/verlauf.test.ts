import { describe, expect, it } from 'vitest';
import { ClientMsg, MAX_NACHRICHT, STANDARD_STIL } from '../../../../shared/protocol.ts';
import { MAX_VERLAUF, nachrichten, stuecke, Verlauf, type ZInhalt } from './verlauf.ts';

const z = (id: string, lat = 47): ZInhalt => ({
  id,
  ebeneId: 'L-allgemein',
  art: 'linie',
  punkte: [{ lat, lon: 7 }, { lat, lon: 7.1 }],
  text: '',
  bezeichnung: '',
  stil: STANDARD_STIL,
});

describe('Verlauf', () => {
  it('neu/ändern/löschen: rückgängig kehrt um (gleiche ID, alte Fassung), wiederholen stellt wieder her', () => {
    const v = new Verlauf();
    v.tue({ typ: 'neu', zeichnungen: [z('a')] });
    expect(v.rueckgaengig()!.msgs).toEqual([{ typ: 'zeichnung.loeschen', ids: ['a'] }]);
    expect(v.kannZurueck).toBe(false);
    expect(v.wiederholen()!.msgs).toEqual([{ typ: 'zeichnung.neu', zeichnungen: [z('a')] }]);
    expect(v.kannVor).toBe(false);
    v.tue({ typ: 'aendern', vorher: [z('a', 47)], nachher: [z('a', 46)] });
    expect(v.rueckgaengig()!.msgs).toEqual([{ typ: 'zeichnung.aendern', zeichnungen: [z('a', 47)] }]);
    expect(v.wiederholen()!.msgs).toEqual([{ typ: 'zeichnung.aendern', zeichnungen: [z('a', 46)] }]);
    expect(nachrichten({ typ: 'loeschen', zeichnungen: [z('a')] }, 'zurueck')).toEqual([{ typ: 'zeichnung.neu', zeichnungen: [z('a')] }]);
  });
  it('Reihenfolge: zuletzt Getanes zuerst zurück; neue Aktion verwirft Wiederholen; abgelehnter Eintrag fliegt raus; höchstens MAX_VERLAUF', () => {
    const v2 = new Verlauf();
    v2.tue({ typ: 'neu', zeichnungen: [z('a')] });
    v2.tue({ typ: 'neu', zeichnungen: [z('b')] });
    expect(v2.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['b'] });
    v2.tue({ typ: 'neu', zeichnungen: [z('c')] });
    expect(v2.kannVor).toBe(false);
    expect(v2.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['c'] });
    expect(v2.rueckgaengig()!.msgs[0]).toMatchObject({ ids: ['a'] });
    expect(v2.rueckgaengig()).toBeNull();
    const e = { typ: 'neu' as const, zeichnungen: [z('x')] };
    v2.tue(e);
    v2.entferne(e);
    expect(v2.kannZurueck || v2.kannVor).toBe(false);
    for (let i = 0; i < MAX_VERLAUF + 5; i++) v2.tue({ typ: 'neu', zeichnungen: [z(`x${i}`)] });
    let n = 0;
    while (v2.rueckgaengig()) n++;
    expect(n).toBe(MAX_VERLAUF);
  });
  it('löschen → rückgängig behält den Ersteller (von) der Zeichnung (Regression)', () => {
    const msgs = nachrichten({ typ: 'loeschen', zeichnungen: [{ ...z('a'), von: 'fremd' }] }, 'zurueck');
    expect(msgs[0]).toMatchObject({ typ: 'zeichnung.neu', zeichnungen: [{ id: 'a', von: 'fremd' }] });
    expect(ClientMsg.safeParse(msgs[0]).success).toBe(true);
  });
  it('Stückelung: höchstens 100 je Nachricht und unter der Servergrenze, alle IDs in Reihenfolge', () => {
    const viele = Array.from({ length: 250 }, (_, i) => z(`z${i}`));
    const msgs = nachrichten({ typ: 'neu', zeichnungen: viele }, 'vor');
    expect(msgs.map((m) => (m.typ === 'zeichnung.neu' ? m.zeichnungen.length : 0))).toEqual([100, 100, 50]);
    for (const m of [...msgs, ...nachrichten({ typ: 'neu', zeichnungen: viele }, 'zurueck')]) expect(ClientMsg.safeParse(m).success).toBe(true);
    expect(stuecke([], 100)).toEqual([]);
    const punkte = Array.from({ length: 2000 }, (_, i) => ({ lat: -46.123456789012 - i / 1e6, lon: -7.123456789012 - i / 1e6 }));
    const gross = Array.from({ length: 6 }, (_, i) => ({ ...z(`f${i}`), art: 'freihand' as const, punkte }));
    const gm = nachrichten({ typ: 'neu', zeichnungen: gross }, 'vor');
    expect(gm.length).toBeGreaterThan(1);
    expect(gm.flatMap((m) => (m.typ === 'zeichnung.neu' ? m.zeichnungen.map((x) => x.id) : []))).toEqual(gross.map((x) => x.id));
    for (const m of gm) expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThan(MAX_NACHRICHT);
  });
});
