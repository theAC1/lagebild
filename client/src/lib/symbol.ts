// Taktische Zeichen (APP-6D / 2525D, 20-stellige SIDC) via milsymbol.
// SIDC-Aufbau: 10 | Kontext | Zugehörigkeit | Symbolset(2) | Status | HQ | Grösse(2) | Funktion(6) | Mod1(2) | Mod2(2)
import ms from 'milsymbol';

export type Zugehoerigkeit = 'freund' | 'feind' | 'neutral' | 'unbekannt';
export const ZUGEHOERIGKEITEN: { id: Zugehoerigkeit; label: string; ziffer: string }[] = [
  { id: 'freund', label: 'Freund', ziffer: '3' },
  { id: 'feind', label: 'Feind', ziffer: '6' },
  { id: 'neutral', label: 'Neutral', ziffer: '4' },
  { id: 'unbekannt', label: 'Unbekannt', ziffer: '1' },
];

/** Grösse (Echelon), gilt nur für Truppen-Symbolset 10. */
export const GROESSEN: { id: string; label: string }[] = [
  { id: '00', label: '–' },
  { id: '11', label: 'Trupp' },
  { id: '12', label: 'Gruppe' },
  { id: '14', label: 'Zug' },
  { id: '15', label: 'Kompanie' },
];

/** Kuratierte Funktionen: Symbolset + 6-stellige Funktion. */
export const FUNKTIONEN: { label: string; set: string; funktion: string }[] = [
  { label: 'Infanterie', set: '10', funktion: '121100' },
  { label: 'Mech. Infanterie', set: '10', funktion: '121102' },
  { label: 'Panzer', set: '10', funktion: '120500' },
  { label: 'Aufklärung', set: '10', funktion: '121300' },
  { label: 'Führung / KP', set: '10', funktion: '110000' },
  { label: 'Sanität', set: '10', funktion: '161300' },
  { label: 'Genie / Pionier', set: '10', funktion: '140700' },
  { label: 'Artillerie', set: '10', funktion: '130300' },
  { label: 'Logistik', set: '10', funktion: '160000' },
  { label: 'Transport', set: '10', funktion: '163600' },
  { label: 'Beobachter', set: '10', funktion: '121200' },
  { label: 'Scharfschütze', set: '10', funktion: '121500' },
  { label: 'Unbemannte Systeme', set: '10', funktion: '121900' },
  { label: 'Fahrzeug', set: '15', funktion: '140100' },
  { label: 'Drohne', set: '01', funktion: '110300' },
  { label: 'Zivilperson', set: '11', funktion: '110300' },
  { label: 'Unbestimmt', set: '10', funktion: '000000' },
];

export const STANDARD_SIDC = '10031000001211000000'; // Freund, Infanterie, Gruppe

export interface SidcTeile {
  zugehoerigkeit: Zugehoerigkeit;
  set: string;
  groesse: string;
  funktion: string;
}

export function zerlegeSidc(sidc: string): SidcTeile {
  const z = ZUGEHOERIGKEITEN.find((x) => x.ziffer === sidc[3]);
  return {
    zugehoerigkeit: z?.id ?? (sidc[3] === '5' ? 'feind' : sidc[3] === '2' ? 'freund' : 'unbekannt'),
    set: sidc.slice(4, 6),
    groesse: sidc.slice(8, 10),
    funktion: sidc.slice(10, 16),
  };
}

export function baueSidc(t: SidcTeile): string {
  const ziffer = ZUGEHOERIGKEITEN.find((x) => x.id === t.zugehoerigkeit)!.ziffer;
  const groesse = t.set === '10' ? t.groesse : '00';
  return `100${ziffer}${t.set}00${groesse}${t.funktion}0000`;
}

/** Ersetzt nur die Zugehörigkeit (z.B. Sichtung → Feind). */
export const mitZugehoerigkeit = (sidc: string, z: Zugehoerigkeit) => baueSidc({ ...zerlegeSidc(sidc), zugehoerigkeit: z });

export const funktionLabel = (sidc: string) => {
  const t = zerlegeSidc(sidc);
  return FUNKTIONEN.find((f) => f.set === t.set && f.funktion === t.funktion)?.label ?? 'Eigenes Zeichen';
};

export const istGueltig = (sidc: string) => /^\d{20}$/.test(sidc) && new ms.Symbol(sidc).isValid() === true;

export interface SymbolOpts {
  size?: number; // Grösse in px (milsymbol «size», Rahmenhöhe ≈ size)
  rufname?: string; // als uniqueDesignation (Feld T) neben dem Zeichen
  richtung?: number | null; // Kurs in Grad → Richtungspfeil
}

function symbol(sidc: string, o: SymbolOpts = {}) {
  return new ms.Symbol(sidc, {
    size: o.size ?? 30,
    uniqueDesignation: o.rufname,
    direction: o.richtung ?? undefined,
    infoColor: '#e8eae4',
    infoOutlineColor: '#161b1f',
    infoOutlineWidth: 3,
    outlineColor: '#161b1f',
    outlineWidth: 2,
  });
}

/** SVG-String des Zeichens. */
export function symbolSvg(sidc: string, o: SymbolOpts = {}): string {
  return symbol(sidc, o).asSVG();
}

/**
 * DOM-Element für `new maplibregl.Marker({ element, offset })`. Liefert das Element und den
 * Offset, damit der Ankerpunkt des Zeichens (nicht die Box-Mitte) auf der Koordinate sitzt.
 */
export function symbolElement(sidc: string, o: SymbolOpts = {}): { element: HTMLDivElement; offset: [number, number] } {
  const s = symbol(sidc, o);
  const { width, height } = s.getSize();
  const a = s.getAnchor();
  const element = document.createElement('div');
  element.className = 'symbol';
  element.innerHTML = s.asSVG();
  return { element, offset: [width / 2 - a.x, height / 2 - a.y] };
}

/** Marker-Element für Teilnehmende (BFT): Zeichen mit Statusrahmen (Ring) und Rufname-Label mit Team-Farbe (Rand). */
export function teilnehmerElement(
  sidc: string,
  o: { rufname: string; farbe?: string | null; team?: string | null; richtung?: number | null; klassen?: string[] },
): { element: HTMLDivElement; offset: [number, number] } {
  const { element, offset } = symbolElement(sidc, { size: 26, richtung: o.richtung });
  const sym = document.createElement('div');
  sym.className = 'bft-sym';
  sym.innerHTML = element.innerHTML;
  const label = document.createElement('div');
  label.className = 'bft-label';
  label.textContent = o.rufname;
  element.className = ['bft', ...(o.klassen ?? [])].join(' ');
  element.replaceChildren(sym, label);
  if (o.farbe) element.style.setProperty('--status', o.farbe);
  if (o.team) element.style.setProperty('--team', o.team);
  return { element, offset }; // Rahmen ist symmetrisch → gleicher Ankerversatz wie das nackte Zeichen
}
