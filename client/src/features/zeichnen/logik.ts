// Reine Hilfen: Rechte, Bezeichnungen, Masse, Verschieben.
import type { Ebene, Punkt, Zeichnung, ZeichnungArt } from '../../../../shared/protocol.ts';
import { azimut, distanz, formatDistanz, formatRichtung } from '../../lib/coords.ts';
import { flaeche, formatFlaeche, laenge, type Px } from './geometrie.ts';
import { istGeschlossen, RAUM, umriss } from './darstellung.ts';
import type { ZInhalt } from './verlauf.ts';

export const ART_LABEL: Record<ZeichnungArt, string> = {
  linie: 'Linie', pfeil: 'Pfeil', flaeche: 'Fläche', rechteck: 'Rechteck', kreis: 'Kreis', freihand: 'Freihand', text: 'Text',
  phasenlinie: 'Phasenlinie', grenze: 'Grenze', stossrichtung: 'Stossrichtung', sperre: 'Sperre', raum: 'Raum',
};

export const artLabel = (z: Pick<Zeichnung, 'art' | 'raumArt'>): string => (z.art === 'raum' && z.raumArt ? RAUM[z.raumArt].label : ART_LABEL[z.art]);
export const zeichnungName = (z: Pick<Zeichnung, 'art' | 'raumArt' | 'bezeichnung' | 'text'>): string => z.bezeichnung || (z.art === 'text' ? z.text : '') || artLabel(z);

/** Bearbeiten/Löschen: Ersteller oder Leitung; in gesperrter Ebene nur Leitung (wie der Server prüft). */
export function darfAendern(z: Pick<Zeichnung, 'von' | 'ebeneId'>, ich: string | null, leitung: boolean, ebenen: ReadonlyMap<string, Ebene>): boolean {
  if (leitung) return true;
  return z.von === ich && !ebenen.get(z.ebeneId)?.gesperrt;
}

/** Inhalt ohne Server-Felder (für zeichnung.aendern und Rückgängig). */
export const zuInhalt = (z: Zeichnung | ZInhalt): ZInhalt => ({
  id: z.id,
  ebeneId: z.ebeneId,
  art: z.art,
  ...(z.raumArt ? { raumArt: z.raumArt } : {}),
  punkte: z.punkte.map((p) => ({ lat: p.lat, lon: p.lon })),
  ...(z.radiusM !== undefined ? { radiusM: z.radiusM } : {}),
  text: z.text,
  bezeichnung: z.bezeichnung,
  stil: { ...z.stil },
});

/** Masse einer Form für Details und Live-Anzeige. */
export function masse(z: Pick<Zeichnung, 'art' | 'punkte' | 'radiusM'>): { label: string; wert: string }[] {
  if (z.art === 'text') return [];
  if (z.art === 'kreis') {
    const r = z.radiusM ?? 0;
    return [
      { label: 'Radius', wert: formatDistanz(r) },
      { label: 'Fläche', wert: formatFlaeche(Math.PI * r * r) },
    ];
  }
  if (istGeschlossen(z.art)) {
    const ring = umriss(z);
    return [
      { label: 'Umfang', wert: formatDistanz(laenge(ring, true)) },
      { label: 'Fläche', wert: formatFlaeche(flaeche(ring)) },
    ];
  }
  return [{ label: 'Länge', wert: formatDistanz(laenge(z.punkte)) }];
}

/** Punkte über die Bildschirmprojektion um (dx, dy) Pixel verschieben (masstabstreu auf der Karte). */
export function verschiebePunkte(punkte: Punkt[], dx: number, dy: number, proj: (p: Punkt) => Px, unproj: (p: Px) => Punkt): Punkt[] {
  return punkte.map((p) => {
    const q = proj(p);
    return unproj({ x: q.x + dx, y: q.y + dy });
  });
}

/** Punkt einfügen (nach Index i) bzw. entfernen, ohne die Mindestzahl zu unterschreiten. */
export const mitPunkt = (punkte: Punkt[], nach: number, p: Punkt): Punkt[] => [...punkte.slice(0, nach + 1), p, ...punkte.slice(nach + 1)];
export const ohnePunkt = (punkte: Punkt[], i: number, min: number): Punkt[] | null => (punkte.length <= min ? null : punkte.filter((_, j) => j !== i));
export const ersetzePunkt = (punkte: Punkt[], i: number, p: Punkt): Punkt[] => punkte.map((q, j) => (j === i ? p : q));

/** Gerundete Pixel des Mittelpunkts einer Punktwolke (Einfügen an der Mausposition). */
export function pxMitte(ps: Px[]): Px {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Lokale Sichtbarkeit der Ebenen je Lage. */
export const sichtKey = (lageId: string): string => `lagebild.zeichnen.ausgeblendet.${lageId}`;

/** Zeilen der Live-Masse neben dem Cursor: Form im Bau (`entwurf`) plus Gummiband zur Maus. */
export function liveMasse(art: ZeichnungArt | 'messen', entwurf: Punkt[], maus: Punkt | null): string[] {
  if (!entwurf.length) return [];
  const ps = maus ? [...entwurf, maus] : entwurf;
  const [a, b] = [ps[0], ps.at(-1)!];
  if (art === 'kreis') {
    const r = distanz(a, b);
    return [`Radius ${formatDistanz(r)}`, `Fläche ${formatFlaeche(Math.PI * r * r)}`];
  }
  if (art === 'rechteck') {
    const breite = distanz(a, { lat: a.lat, lon: b.lon });
    const hoehe = distanz(a, { lat: b.lat, lon: a.lon });
    return [`${formatDistanz(breite)} × ${formatDistanz(hoehe)}`, `Fläche ${formatFlaeche(breite * hoehe)}`];
  }
  const zeilen: string[] = [];
  if (ps.length >= 2) zeilen.push(`Segment ${formatDistanz(distanz(ps.at(-2)!, b))} · ${formatRichtung(azimut(ps.at(-2)!, b))}`);
  zeilen.push(`Total ${formatDistanz(laenge(ps))}`);
  if ((art === 'messen' || istGeschlossen(art)) && ps.length >= 3) zeilen.push(`Fläche ${formatFlaeche(flaeche(ps))}`);
  return zeilen;
}
