// Ereignisliste der Nachbearbeitung (Spec v6): eine Zeile je Ereignis in LV, mit Autor, Ort und Rasterzelle; CSV-Export.
import { phaseVon, type Lage, type Notiz, type Protokoll, type Punkt, type Rolle, type ServerMsg, type Teilnehmer } from '../../../../shared/protocol.ts';
import { ansprache, RASTER_NAME, zelleVon } from '../../../../shared/raster.ts';
import { leererStand, lvFenster, posBei, uebernimm, type Stand } from './logik.ts';

export type Zeile = { t: number; von: string; rufname: string; einheit: string; ereignis: string; details: string; punkt: Punkt | null; zelle: string };
type Roh = Pick<Zeile, 'ereignis' | 'details'> & { punkt?: Punkt | null };

const ALARM = { notfall: 'Notfall', kontakt: 'Feindkontakt' } as const;
const ENDE = { aufgehoben: 'aufgehoben', beendet: 'beendet', erreicht: 'Ziel erreicht' } as const;
const gross = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Zeilen eines Deltas, gemessen am Stand davor (neu/geändert/gelöscht). Bloodhound nur für Leitung und Empfänger. */
function zeilenAus(d: ServerMsg, s: Stand, a: { lage: Lage; name: (id: string) => string; ich: { id: string; rolle: Rolle } }): Roh[] {
  switch (d.typ) {
    case 'marker': {
      const m = d.marker;
      return [{ ereignis: s.marker.has(m.id) ? 'Marker geändert' : 'Marker gesetzt', details: m.bezeichnung || 'ohne Bezeichnung', punkt: m }];
    }
    case 'marker.geloescht': {
      const m = s.marker.get(d.id);
      return [{ ereignis: 'Marker gelöscht', details: m?.bezeichnung || 'ohne Bezeichnung', punkt: m ?? null }];
    }
    case 'sichtung': {
      const x = d.sichtung;
      return [{ ereignis: 'Sichtung', details: [x.groesse, x.taetigkeit, x.einheit, x.ausruestung, x.bemerkung, x.vertrauen].filter(Boolean).join(', '), punkt: x }];
    }
    case 'zeichnungen':
      return d.zeichnungen.map((z) => ({ ereignis: s.zeichnungen.has(z.id) ? 'Zeichnung geändert' : 'Zeichnung', details: [gross(z.art), z.bezeichnung || z.text].filter(Boolean).join(': '), punkt: z.punkte[0] }));
    case 'zeichnungen.geloescht':
      return d.ids.map((id) => {
        const z = s.zeichnungen.get(id);
        return { ereignis: 'Zeichnung gelöscht', details: z ? [gross(z.art), z.bezeichnung || z.text].filter(Boolean).join(': ') : '', punkt: z?.punkte[0] ?? null };
      });
    case 'taufe': {
      const [lon, lat] = d.taufe.geometrie.coordinates.flat(3) as number[];
      return [{ ereignis: s.taufen.has(d.taufe.id) ? 'Taufe geändert' : 'Taufe', details: d.taufe.name, punkt: { lat, lon } }];
    }
    case 'taufe.geloescht':
      return [{ ereignis: 'Taufe gelöscht', details: s.taufen.get(d.id)?.name ?? '' }];
    case 'raster': {
      const r = d.raster;
      const alt = s.raster.get(r.art);
      const was = !alt ? 'gesetzt' : alt.fixiert !== r.fixiert ? (r.fixiert ? 'fixiert' : 'gelöst') : 'geändert';
      return [{ ereignis: `Raster ${was}`, details: `${RASTER_NAME[r.art]} ${r.spalten} × ${r.zeilen} à ${r.zellM} m` }];
    }
    case 'raster.geloescht':
      return [{ ereignis: 'Raster gelöscht', details: RASTER_NAME[d.art] }];
    case 'chat': {
      const an = d.chat.an;
      const wem = an.art === 'alle' ? 'alle' : an.art === 'einheit' ? an.einheit : a.name(an.id);
      return [{ ereignis: 'Chat', details: `an ${wem}: ${d.chat.text}` }];
    }
    case 'alarm': {
      const x = d.alarm;
      const alt = s.alarme.get(x.id);
      const punkt = x.lat !== null && x.lon !== null ? { lat: x.lat, lon: x.lon } : null;
      if (!alt) return [{ ereignis: `Alarm ${ALARM[x.art]}`, details: `von ${a.name(x.von)}`, punkt }];
      if (alt.aufgehobenAm === null && x.aufgehobenAm !== null) return [{ ereignis: 'Alarm aufgehoben', details: `${ALARM[x.art]} von ${a.name(x.von)}`, punkt }];
      if (x.quittiertVon.length > alt.quittiertVon.length) return [{ ereignis: 'Alarm quittiert', details: `${ALARM[x.art]} von ${a.name(x.von)}` }];
      return [];
    }
    case 'bloodhound': {
      const x = d.auftrag;
      if (a.ich.rolle !== 'leitung' && x.an !== a.ich.id) return [];
      const punkt = x.ziel.punkt ?? null;
      if (!s.bloodhound.has(x.id) && x.ende === null) return [{ ereignis: 'Bloodhound-Auftrag', details: `an ${a.name(x.an)}`, punkt }];
      if (x.ende !== null) return [{ ereignis: `Bloodhound ${ENDE[x.ende]}`, details: `Auftrag an ${a.name(x.an)}`, punkt }];
      return x.quittiertAm !== null && s.bloodhound.get(x.id)?.quittiertAm === null ? [{ ereignis: 'Bloodhound quittiert', details: `Auftrag an ${a.name(x.an)}` }] : [];
    }
    case 'meldung': {
      const m = d.meldung;
      if (m.status !== null) {
        const label = a.lage.statusSet.find((x) => x.key === m.status)?.label ?? m.status;
        return [{ ereignis: 'Status', details: m.text ? `${label} – ${m.text}` : label }];
      }
      return m.text.startsWith('Phase: ') ? [{ ereignis: 'Phase', details: m.text.slice(7) }] : [];
    }
    case 'teilnehmer.weg':
      return [{ ereignis: 'Teilnehmer entfernt', details: a.name(d.id) }];
    default:
      return [];
  }
}

/** Rasterzelle des Punkts: Piccolo vor Grande; leer ohne Raster oder ausserhalb. */
function zelle(s: Stand, p: Punkt | null): string {
  if (!p) return '';
  for (const art of ['piccolo', 'grande'] as const) {
    const r = s.raster.get(art);
    const z = r && zelleVon(r, p);
    if (z) return `${RASTER_NAME[art]} ${ansprache(z)}`;
  }
  return '';
}

export function ereignisListe(a: { protokoll: Protokoll; lage: Lage; notizen: Notiz[]; ich: { id: string; rolle: Rolle } }): Zeile[] {
  const { protokoll: p, lage } = a;
  const fenster = lvFenster(lage.phasen, phaseVon(lage) === 'lv' ? Date.now() : (lage.phasen.at(-1)?.t ?? 0));
  const inLv = (t: number) => fenster.some((f) => t >= f.von && t <= f.bis);
  const tn = new Map<string, Teilnehmer>(p.teilnehmer.map((x) => [x.id, x]));
  const name = (id: string) => tn.get(id)?.rufname ?? 'Unbekannt';
  const s = leererStand([]);
  const zeilen: Zeile[] = [];
  const zeile = (t: number, von: string, r: Roh): void => {
    const punkt = r.punkt === undefined || r.punkt === null ? posBei(p.spuren[von], t) : r.punkt;
    const ort = punkt ? { lat: punkt.lat, lon: punkt.lon } : null;
    zeilen.push({ t, von, rufname: name(von), einheit: tn.get(von)?.einheit ?? '', ereignis: r.ereignis, details: r.details, punkt: ort, zelle: zelle(s, ort) });
  };
  const notizen = [...a.notizen].filter((n) => inLv(n.t)).sort((x, y) => x.t - y.t);
  for (const e of p.ereignisse) {
    while (notizen.length && notizen[0].t < e.t) {
      const n = notizen.shift()!;
      zeile(n.t, n.von, { ereignis: 'Notiz', details: n.text, punkt: null });
    }
    if (inLv(e.t)) for (const r of zeilenAus(e.d, s, { lage, name, ich: a.ich })) zeile(e.t, e.von, r);
    uebernimm(s, e.d);
  }
  for (const n of notizen) zeile(n.t, n.von, { ereignis: 'Notiz', details: n.text, punkt: null });
  return zeilen;
}

/** «31.10.2026 14:03:27» (Ortszeit) */
export const zeitText = (t: number): string =>
  new Date(t).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '');

export const SPALTEN = ['Zeit', 'Rufname', 'Einheit', 'Ereignis', 'Details', 'Koordinate', 'Rasterzelle'];

/** Zeile als Texte in der Reihenfolge von SPALTEN. */
export const felder = (z: Zeile, koord: (p: Punkt) => string, zeit: (t: number) => string = zeitText): string[] =>
  [zeit(z.t), z.rufname, z.einheit, z.ereignis, z.details, z.punkt ? koord(z.punkt) : '', z.zelle];

/** CSV für Excel (de-CH): Semikolon, CRLF, UTF-8 mit BOM. */
export function csv(zeilen: Zeile[], koord: (p: Punkt) => string, zeit: (t: number) => string = zeitText): string {
  const feld = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [SPALTEN, ...zeilen.map((z) => felder(z, koord, zeit))].map((r) => r.map(feld).join(';')).join('\r\n') + '\r\n';
}
