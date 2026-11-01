// MilX (gs-soft, .milxly/.milxlyz) ↔ Zeichnungen (Spec v8). Ein MilX-Zeichen ist eine Symbol-XML
// `<Symbol ID="15-stelliger APP-6A-Code"><Attribute ID="T">…</Attribute>…</Symbol>` mit Punkten in LV03; dieselbe Symbol-XML
// steht im KML in `App6aXmlTxt`. Importierte Zeichnungen behalten sie in `milx`, der Export gibt sie unverändert zurück.
import { PUNKTE_JE_ART, STANDARD_STIL, Stufe, ZeichnungInput, type Punkt, type Stil, type Zeichnung, type ZeichnungArt } from '../../../../../shared/protocol.ts';
import { vonLv03, zuLv03 } from '../../../lib/coords.ts';
import { vereinfache } from '../../taufe/geo.ts';
import { GRENZE_TRENNER, grenzNamen } from '../darstellung.ts';
import { lokal } from '../geometrie.ts';
import { artLabel } from '../logik.ts';

/** Zeichnung aus einer Datei, noch ohne Ebene und IDs. */
export type Teil = Omit<ZeichnungInput, 'ebeneId' | 'id' | 'von'>;
/** Ebene aus einer Datei: abbildbare Zeichnungen, nicht abbildbare benannt, Anzahl vereinfachter Linien. */
export type DateiEbene = { name: string; zeichnungen: Teil[]; nicht: string[]; vereinfacht: number };
/** Ebene zum Export. */
export type ExportEbene = { name: string; zeichnungen: Zeichnung[] };

/** Schweizer Zusatzzeichen (XE «9SCHT…», Bedeutung ohne Katalog unbekannt): ruhige eigene Farbe. */
export const FARBE_ZUSATZ = '#78909c';
/** Basiscode der Zusatzzeichen → Art (aus den Beispielen; andere bleiben «nicht abbildbar»). */
const ZUSATZ: [RegExp, ZeichnungArt][] = [[/^G.GPGL/, 'linie'], [/^G.TP/, 'linie'], [/^G.8P/, 'flaeche']];

// --- XML ------------------------------------------------------------------------------------

/** XML sicher lesen: ohne DTD (keine Entities), Parserfehler als lesbare Meldung. */
export function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Datei mit DTD wird nicht gelesen');
  let d: Document;
  try {
    d = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new Error('Keine gültige XML-Datei');
  }
  if (!d.documentElement || d.getElementsByTagName('parsererror').length) throw new Error('Keine gültige XML-Datei');
  return d;
}
/** Direkte Kind-Elemente mit diesem Namen (Namensraum egal). */
export const kinder = (el: Element | undefined, name: string): Element[] =>
  el ? Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name) : [];
export const kind = (el: Element | undefined, name: string): Element | undefined => kinder(el, name)[0];
export const wert = (el: Element | undefined, name: string): string => kind(el, name)?.textContent?.trim() ?? '';
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const klemme = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));
const rund2 = (x: number): number => Math.round(x * 100) / 100;

// --- Symbol ↔ Zeichnung -------------------------------------------------------------------

/** Farbe nach Zugehörigkeit (2. Stelle des Codes): Feind rot, neutral grün, unbekannt gelb, sonst (eigene) blau. */
const farbeFuer = (z: string): string => ('HSJK'.includes(z) ? '#d32f2f' : 'NL'.includes(z) ? '#2e7d32' : 'UPGW'.includes(z) ? '#f9a825' : '#1565c0');

/** MilX-Farbe «$AABBGGRR» (AA = Transparenz) → «#rrggbb». */
export const vonDollar = (v: string | null): string | undefined =>
  v && /^\$[0-9a-f]{8}$/i.test(v) ? `#${v.slice(7, 9)}${v.slice(5, 7)}${v.slice(3, 5)}`.toLowerCase() : undefined;
const zuDollar = (farbe: string, transparenz: number): string =>
  `$${Math.round(transparenz * 255).toString(16).padStart(2, '0')}${farbe.slice(5, 7)}${farbe.slice(3, 5)}${farbe.slice(1, 3)}`.toUpperCase();

/**
 * Füllung ohne eigene Linienfarbe (MilX «$00000000», KML rgba(0,0,0,1)) zeigt das Quell-Tool ohne sichtbaren Umriss:
 * dann strich «keiner» und die Linienfarbe = Füllfarbe. ponytail: ein eigener schwarzer Umriss mit Füllung geht so verloren.
 */
export const ohneUmriss = (linie: string | undefined, fuellung: string | undefined): boolean => !!fuellung && (!linie || linie === '#000000');

/** Stil aus dem Attribut XM einer Zeichnung (G.9.AP): Linie mit Breite und Farbe, Füllung mit Transparenz in %. */
function stilAusXm(xm: Element | undefined): Stil {
  const [linie, fuell] = [kind(xm, 'Line'), kind(xm, 'Fill')];
  const transparenz = Number(fuell?.getAttribute('Transparency') ?? NaN);
  const fuellung = vonDollar(fuell?.getAttribute('Color') ?? null);
  const farbe = vonDollar(linie?.getAttribute('Color') ?? null);
  const ohne = ohneUmriss(farbe, fuellung);
  return {
    farbe: (ohne ? fuellung : farbe) ?? '#212121',
    breite: klemme(Math.round(Number(linie?.getAttribute('Width')) / 20) || 1, 1, 12), // Width 20 ≙ KML WidthQty 1
    strich: ohne ? 'keiner' : 'voll',
    deckkraft: Number.isFinite(transparenz) ? rund2(1 - klemme(transparenz, 0, 100) / 100) : STANDARD_STIL.deckkraft,
    ...(fuellung ? { fuellung } : {}),
  };
}

/** Symbol-XML + Punkte → Zeichnung, oder warum nicht abbildbar. */
export function ausSymbol(milx: string, punkte: Punkt[]): Teil | string {
  let s: Element;
  try {
    s = xml(milx).documentElement;
  } catch {
    return 'Symbol nicht lesbar';
  }
  const code = (s.getAttribute('ID') ?? '').toUpperCase();
  const attr = (id: string) => kinder(s, 'Attribute').find((a) => a.getAttribute('ID') === id);
  const t = (id: string) => attr(id)?.textContent?.trim() ?? '';
  const xe = t('XE').toUpperCase().replace(/-+$/, '');
  const basis = { punkte, text: '', bezeichnung: t('T').slice(0, 200), stil: { ...STANDARD_STIL, farbe: farbeFuer(code[1] ?? '') }, milx };
  if (/^G.GPGLP/.test(code)) return { ...basis, art: 'phasenlinie' };
  if (/^G.GPGLB/.test(code)) {
    const stufe = Stufe.safeParse(code[11]);
    return { ...basis, art: 'grenze', bezeichnung: [t('T'), t('T1')].filter(Boolean).join(GRENZE_TRENNER).slice(0, 200), ...(stufe.success ? { stufe: stufe.data } : {}) };
  }
  if (/^G.GPGAA/.test(code)) return { ...basis, art: 'raum', raumArt: 'bereitstellung' };
  if (/^G\.9\.AP/.test(code)) return { ...basis, art: 'flaeche', stil: stilAusXm(attr('XM')) };
  const zusatz = xe.startsWith('9SCHT') ? ZUSATZ.find(([re]) => re.test(code))?.[1] : undefined;
  if (zusatz) {
    const stil: Stil = { farbe: FARBE_ZUSATZ, breite: 2, strich: 'voll', deckkraft: 0.15, ...(zusatz === 'flaeche' ? { fuellung: FARBE_ZUSATZ } : {}) };
    return { ...basis, art: zusatz, bezeichnung: (t('T') || xe.slice(5)).slice(0, 200), stil };
  }
  return [code || 'Symbol ohne Code', xe, t('T') && `«${t('T')}»`].filter(Boolean).join(' ');
}

const sym = (code: string, namen: [string, string][], roh = ''): string =>
  `<Symbol ID="${code}">${namen.filter(([, v]) => v).map(([id, v]) => `<Attribute ID="${id}">${esc(v)}</Attribute>`).join('')}${roh}</Symbol>`;

/** Code für eigene Zeichnungen, wo er aus den Beispielen bekannt ist; sonst null (fehlt im MilX-Export). */
function symbolFuer(z: Zeichnung): string | null {
  const s = z.stil;
  switch (z.art) {
    case 'phasenlinie':
      return sym('GFGPGLP--------', [['T', z.bezeichnung]]);
    case 'grenze': {
      const [a, b] = grenzNamen(z.bezeichnung);
      return sym(`GFGPGLB----${z.stufe ?? '-'}---`, [['T', a], ['T1', b]]);
    }
    case 'raum':
      return z.raumArt === 'bereitstellung' ? sym('GFGPGAA--------', [['T', z.bezeichnung]]) : null;
    case 'flaeche': {
      const t = Math.round((1 - s.deckkraft) * 100);
      const fill = s.fuellung ? `<Fill Color="${zuDollar(s.fuellung, t / 100)}" Transparency="${t}" />` : '';
      const linie = zuDollar(s.strich === 'keiner' ? '#000000' : s.farbe, 0);
      return sym('G.9.AP---------', [['T', z.bezeichnung]], `<Attribute ID="XM"><Line Width="${s.breite * 20}" Color="${linie}"/>${fill}</Attribute>`);
    }
    default:
      return null;
  }
}

/** Symbol-XML mit neuen Namen (T, bei Grenzen auch T1) und Stufe; übrige Attribute und Code bleiben. */
function angepasst(milx: string, z: Zeichnung): string {
  const d = xml(milx);
  const s = d.documentElement;
  const namen = z.art === 'grenze' ? grenzNamen(z.bezeichnung) : [z.bezeichnung.trim()];
  if (z.art === 'grenze') s.setAttribute('ID', (s.getAttribute('ID') ?? '').padEnd(15, '-').replace(/^(.{11})./, `$1${z.stufe ?? '-'}`));
  namen.forEach((wert, i) => {
    const id = ['T', 'T1'][i];
    const alt = kinder(s, 'Attribute').find((a) => a.getAttribute('ID') === id);
    if (!wert) {
      if (alt) s.removeChild(alt);
      return;
    }
    const a = alt ?? s.appendChild(d.createElement('Attribute'));
    a.setAttribute('ID', id);
    a.textContent = wert;
  });
  return new XMLSerializer().serializeToString(d);
}

/**
 * Symbol-XML für den Export: die importierte unverändert, solange Art, Namen und Stufe gleich sind (geänderte werden
 * eingesetzt), sonst der bekannte Code der Art; null = kein Code bekannt.
 */
export function symbolExport(z: Zeichnung): string | null {
  const aus = z.milx ? ausSymbol(z.milx, z.punkte) : null;
  if (z.milx && aus && typeof aus !== 'string' && aus.art === z.art && aus.raumArt === z.raumArt) {
    return aus.bezeichnung === z.bezeichnung && aus.stufe === z.stufe ? z.milx : angepasst(z.milx, z);
  }
  return symbolFuer(z);
}

// --- Punkte und Grenzen -------------------------------------------------------------------

/** Punkte an die Art anpassen: Ring ohne Schlusspunkt, zu viele vereinfacht (Douglas-Peucker in Metern), zu wenige → Grund. */
function passe(t: Teil): { teil: Teil; vereinfacht: boolean } | string {
  const [min, max] = PUNKTE_JE_ART[t.art];
  const ring = (t.art === 'flaeche' || t.art === 'raum') && t.punkte.length > 1;
  const [a, b] = [t.punkte[0], t.punkte.at(-1)];
  const ps = ring && a.lat === b?.lat && a.lon === b.lon ? t.punkte.slice(0, -1) : t.punkte;
  if (ps.length < min) return [artLabel(t), t.bezeichnung && `«${t.bezeichnung}»`, `mit ${ps.length} Punkt(en)`].filter(Boolean).join(' ');
  if (ps.length <= max) return { teil: { ...t, punkte: ps }, vereinfacht: false };
  const ebene = lokal(ps[0]);
  const xy = ps.map(ebene.hin);
  for (let tol = 0.5; ; tol *= 2) {
    const v = vereinfache(xy, tol);
    if (v.length <= max) return { teil: { ...t, punkte: v.map(ebene.zurueck) }, vereinfacht: true };
  }
}

/** Ebene aus Zeichnungen und Gründen; was der Vertrag nicht annimmt (z.B. Koordinaten ausserhalb), gilt als nicht abbildbar. */
export function ebeneAus(name: string, stuecke: (Teil | string)[]): DateiEbene {
  const zeichnungen: Teil[] = [];
  const nicht: string[] = [];
  let vereinfacht = 0;
  for (const s of stuecke) {
    const p = typeof s === 'string' ? s : passe(s);
    if (typeof p === 'string') {
      nicht.push(p);
      continue;
    }
    const ok = ZeichnungInput.safeParse({ ...p.teil, ebeneId: 'pruefen' });
    if (!ok.success) nicht.push(`${artLabel(p.teil)}: ${ok.error.issues[0]?.message ?? 'ungültig'}`);
    else {
      zeichnungen.push(p.teil);
      if (p.vereinfacht) vereinfacht++;
    }
  }
  return { name: name.trim().slice(0, 60) || 'Import', zeichnungen, nicht, vereinfacht };
}

// --- MilX-Dokument ------------------------------------------------------------------------

/** .milxly lesen: je `MilXLayer` eine Ebene; nur LV03. */
export function leseMilx(text: string): DateiEbene[] {
  const w = xml(text).documentElement;
  if (w.localName !== 'MilXDocument_Layer') throw new Error('Keine MilX-Ebenendatei');
  return kinder(w, 'MilXLayer').map((l) => {
    const sys = wert(l, 'CoordSystemType');
    const grafiken = kinder(kind(l, 'GraphicList'), 'MilXGraphic');
    const stuecke = grafiken.map((g) =>
      sys === 'SwissLv03'
        ? ausSymbol(wert(g, 'MssStringXML'), kinder(kind(g, 'PointList'), 'Point').map((p) => vonLv03(Number(wert(p, 'X')), Number(wert(p, 'Y')))))
        : `Koordinatensystem «${sys || 'fehlt'}» nicht unterstützt`,
    );
    return ebeneAus(wert(l, 'Name'), stuecke);
  });
}

/** Zeichnungen ohne MilX-Code (fehlen im MilX-Export). */
export const ohneMilxCode = (zs: Zeichnung[]): Zeichnung[] => zs.filter((z) => symbolExport(z) === null);

/** .milxly schreiben (LV03 wie die Quelle; Zeilenenden wie MilX unter Windows). */
export function schreibeMilx(ebenen: ExportEbene[]): string {
  const grafik = (z: Zeichnung, s: string): string => {
    const ps = /ID=["']G\.9\./.test(s) ? [...z.punkte, z.punkte[0]] : z.punkte; // Zeichnungen (G.9.*) mit geschlossenem Ring
    const punkte = ps.map((p) => zuLv03(p)).map(({ e, n }) => `\t\t\t\t\t<Point>\r\n\t\t\t\t\t\t<X>${e.toFixed(3)}</X>\r\n\t\t\t\t\t\t<Y>${n.toFixed(3)}</Y>\r\n\t\t\t\t\t</Point>`);
    return `\t\t\t<MilXGraphic>\r\n\t\t\t\t<MssStringXML>${esc(s)}</MssStringXML>\r\n\t\t\t\t<PointList>\r\n${punkte.join('\r\n')}\r\n\t\t\t\t</PointList>\r\n\t\t\t</MilXGraphic>`;
  };
  const ebene = (e: ExportEbene): string => {
    const gs = e.zeichnungen.flatMap((z) => {
      const s = symbolExport(z);
      return s ? [grafik(z, s)] : [];
    });
    return `\t<MilXLayer>\r\n\t\t<Name>${esc(e.name)}</Name>\r\n\t\t<LayerType>Normal</LayerType>\r\n\t\t<GraphicList>\r\n${gs.map((g) => `${g}\r\n`).join('')}\t\t</GraphicList>\r\n\t\t<CoordSystemType>SwissLv03</CoordSystemType>\r\n\t\t<SymbolSize>33</SymbolSize>\r\n\t</MilXLayer>`;
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\r\n<MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r\n\t<MssLibraryVersionTag>2025.02.20</MssLibraryVersionTag>\r\n${ebenen.map(ebene).join('\r\n')}\r\n</MilXDocument_Layer>\r\n`;
}
