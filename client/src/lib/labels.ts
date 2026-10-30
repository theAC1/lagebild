// Rufname-Labels der Kartensymbole entzerren: DOM-Marker kennen keine Kollision, nahe Kräfte überdecken sich sonst.
export type Box = { x: number; y: number; w: number; h: number };
export type Platz = 'unten' | 'oben' | 'weg';

const schneidet = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Greedy nach Priorität (Reihenfolge der Eingabe): Label unter dem Symbol, sonst darüber, sonst ausblenden.
 * `hindernisse` (Symbole) zählen nur fremde: das eigene Symbol schneidet sein Label nie.
 */
export function platziere(labels: { unten: Box; oben: Box }[], hindernisse: Box[] = []): Platz[] {
  const belegt: Box[] = [];
  return labels.map((l, i) => {
    const frei = (b: Box) => !belegt.some((x) => schneidet(x, b)) && !hindernisse.some((x, j) => j !== i && schneidet(x, b));
    const platz: Platz = frei(l.unten) ? 'unten' : frei(l.oben) ? 'oben' : 'weg';
    if (platz !== 'weg') belegt.push(platz === 'unten' ? l.unten : l.oben);
    return platz;
  });
}

const box = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/** Wendet `platziere` auf alle `.bft` im Container an; das eigene Symbol hat Vorrang. */
export function entzerre(container: HTMLElement): void {
  const els = [...container.querySelectorAll<HTMLElement>('.bft')].sort((a, b) => Number(b.classList.contains('ich')) - Number(a.classList.contains('ich')));
  // Klassen erst nach dem Messen und nur bei Änderung setzen: Umschalten vor dem Messen erzwang bei jeder Position
  // ein Layout aller Kartenmarker. «unten» ist der Platz ohne Klasse: 2 px unter dem Symbol (app.css .bft-label).
  const mass = els.map((el) => {
    const sym = el.getBoundingClientRect();
    const label = (el.querySelector('.bft-label') ?? el).getBoundingClientRect();
    return { sym: box(sym), unten: { ...box(label), y: sym.bottom + 2 }, oben: { ...box(label), y: sym.top - 2 - label.height } };
  });
  const plaetze = platziere(mass, mass.map((m) => m.sym));
  els.forEach((el, i) => {
    el.classList.toggle('label-oben', plaetze[i] === 'oben');
    el.classList.toggle('label-weg', plaetze[i] === 'weg');
  });
}
