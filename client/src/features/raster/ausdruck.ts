// PDF je Führungsraster (Juan 30.10., Aufbau nach seiner Vorlage): Luftbild, SpotMap (Luftbild mit Taufen und
// Fassaden) und Landeskarte, je mit Raster. Gezeichnet auf ein Canvas (kein WebGL, keine zweite Karte), Kacheln zuerst
// aus den Offline-Gebieten, sonst gedrosselt aus dem Netz. Geometrie, Tabellenfelder und PDF-Aufbau rein in druck.ts / pdf.ts.
import type { Raster, Taufe } from '../../../../shared/protocol.ts';
import { RASTER_NAME, zuLv95 } from '../../../../shared/raster.ts';
import { oeffneSpeicher } from '../../lib/kachelspeicher.ts';
import { BASISKARTEN, kachelUrl, type Basiskarte } from '../../lib/karten.ts';
import { drossel, PARALLEL } from '../offline/laden.ts';
import { FASSADE_FARBE } from '../taufe/fassaden.ts';
import { FAMILIE_FARBE, LABEL_RANG, labelAnker, platziere, polygoneVon, taufFeatures, ZIEL_FARBE, type LabelWunsch } from '../taufe/darstellung.ts';
import type { Xy } from './beschriftung.ts';
import { A4_QUER, blatt, blattFelder, dateiName, TILE, kachelPlan, type Blatt, type Feld, type KachelPlan, type Format, type SeitenArt } from './druck.ts';
import { pdfAusJpegs } from './pdf.ts';

/** 200 dpi: A4 quer = 2339 × 1654 px je Seite, A3 quer 3308 × 2339 */
const PX_JE_PT = 200 / 72;
const DUNKEL = '#161b1f';
/** Grau der Kopffelder (Vorlage) */
const GRAU = '#9e9e9e';
const SCHRIFT = 'system-ui, sans-serif';
const fett = (px: number) => `700 ${px}px ${SCHRIFT}`;

type Kacheln = Map<string, ImageBitmap>;
type Pos = [number, number];

/** Kacheln des Plans für eine Basiskarte: Offline-Gebiet, sonst Netz (in der PWA über den Kachel-Cache des Service Workers). */
async function ladeKacheln(plan: KachelPlan, karte: Basiskarte): Promise<{ kacheln: Kacheln; fehlen: number }> {
  const vorlage = kachelUrl(BASISKARTEN.find((k) => k.id === karte)!);
  const speicher = await oeffneSpeicher();
  // ponytail: eigene Drossel je Ausdruck (wie ein Offline-Download); läuft gleichzeitig ein Download, teilen sie sich das Limit nicht
  const warte = drossel({ schlafe: (ms) => new Promise((r) => setTimeout(r, ms)), jetzt: () => Date.now() });
  const liste: Xy[] = [];
  for (let y = plan.y0; y <= plan.y1; y++) for (let x = plan.x0; x <= plan.x1; x++) liste.push({ x, y });
  const kacheln: Kacheln = new Map();
  let i = 0;
  async function arbeiter() {
    while (i < liste.length) {
      const { x, y } = liste[i++];
      const url = vorlage.replace('{z}', String(plan.z)).replace('{x}', String(x)).replace('{y}', String(y));
      try {
        let r = await speicher?.match(url).catch(() => undefined);
        if (!r) {
          await warte(url);
          r = await fetch(url);
        }
        if (r.ok) kacheln.set(`${x}/${y}`, await createImageBitmap(await r.blob()));
      } catch {
        // ohne Netz und nicht offline gespeichert: bleibt grau
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));
  return { kacheln, fehlen: liste.length - kacheln.size };
}

function zeichneKacheln(ctx: CanvasRenderingContext2D, plan: KachelPlan, kacheln: Kacheln) {
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, 1e4, 1e4);
  ctx.transform(...plan.matrix);
  for (const [k, bild] of kacheln) {
    const [x, y] = k.split('/').map(Number);
    ctx.drawImage(bild, (x - plan.x0) * TILE, (y - plan.y0) * TILE, TILE + 0.6, TILE + 0.6); // leicht überlappend: keine Haarlinien
  }
}

function linie(ctx: CanvasRenderingContext2D, punkte: Xy[], farbe: string, breite: number, alpha = 1, strich: number[] = []) {
  ctx.beginPath();
  punkte.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = farbe;
  ctx.lineWidth = breite;
  ctx.setLineDash(strich);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

/** Zelllinien dünn schwarz wie in der Vorlage (ohne Viertel, ohne Saum); den Rahmen zeichnet die Tabelle. */
function zeichneRaster(ctx: CanvasRenderingContext2D, r: Raster, b: Blatt) {
  const { x, y, w, h } = b.rahmen;
  const zelle = w / r.spalten;
  ctx.beginPath();
  for (let i = 1; i < r.spalten; i++) (ctx.moveTo(x + i * zelle, y), ctx.lineTo(x + i * zelle, y + h));
  for (let j = 1; j < r.zeilen; j++) (ctx.moveTo(x, y + j * zelle), ctx.lineTo(x + w, y + j * zelle));
  ctx.strokeStyle = DUNKEL;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

/** Nordpfeil als Windrose mit N, E, S, W wie in der Vorlage. */
function nordrose(ctx: CanvasRenderingContext2D, f: Feld) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const R = Math.min(f.w, f.h) / 2 - 7;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const l = i % 2 ? R * 0.28 : R;
    ctx.lineTo(cx + l * Math.cos(a), cy + l * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = DUNKEL;
  ctx.fill();
  ctx.font = fett(5);
  for (const [t, dx, dy] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]] as const) ctx.fillText(t, cx + dx * (R + 3.5), cy + dy * (R + 3.5) + 0.3);
}

/** Massstabsbalken: Doppelpfeil über `n` Zellen mit der Länge darin (Vorlage), daneben die Massstabszahl. */
function massstabsbalken(ctx: CanvasRenderingContext2D, f: Feld, b: Blatt) {
  const l = f.meter! * b.ptJeM;
  const x0 = f.x + 2;
  const x1 = f.x + l - 2;
  const cy = f.y + f.h / 2;
  const s = f.h * 0.18;
  const k = Math.min(f.h * 0.45, (x1 - x0) / 3);
  ctx.beginPath();
  ctx.moveTo(x0, cy);
  for (const [x, y] of [[x0 + k, cy - 2 * s], [x0 + k, cy - s], [x1 - k, cy - s], [x1 - k, cy - 2 * s], [x1, cy], [x1 - k, cy + 2 * s], [x1 - k, cy + s], [x0 + k, cy + s], [x0 + k, cy + 2 * s]]) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = DUNKEL;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = DUNKEL;
  ctx.font = fett(Math.min(7, s * 1.8));
  ctx.fillText(`${f.meter} m`, (x0 + x1) / 2, cy + 0.3, x1 - x0 - 2 * k);
  const rest = f.x + f.w - (f.x + l);
  if (rest < 22) return;
  ctx.fillStyle = '#fff';
  ctx.font = fett(9);
  ctx.fillText(f.text, f.x + l + rest / 2, cy + 0.5, rest - 4);
}

/** Tabelle rund ums Kartenfeld (druck.blattFelder), Rahmen kräftig. */
function zeichneFelder(ctx: CanvasRenderingContext2D, r: Raster, b: Blatt, felder: Feld[], lage: string, datum: Date) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of felder) {
    ctx.fillStyle = f.stil === 'hell' ? '#fff' : GRAU;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = DUNKEL;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = f.stil === 'hell' ? DUNKEL : '#fff';
    const cy = f.y + f.h / 2 + 0.5;
    if (f.art === 'nord') nordrose(ctx, f);
    else if (f.art === 'massstab') massstabsbalken(ctx, f, b);
    else if (f.art === 'lage') {
      ctx.fillStyle = DUNKEL;
      ctx.font = fett(12);
      ctx.fillText(lage, f.x + f.w / 2, cy, f.w * 0.5);
      ctx.font = fett(8);
      ctx.textAlign = 'left';
      ctx.fillText(`Zelle ${r.zellM} m · ${r.spalten} × ${r.zeilen}`, f.x + 6, cy, f.w * 0.22);
      ctx.textAlign = 'right';
      ctx.fillText(datum.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }), f.x + f.w - 6, cy, f.w * 0.22);
      ctx.textAlign = 'center';
    } else if (f.text) {
      ctx.font = fett(Math.min(12, f.h * 0.6));
      ctx.fillText(f.text, f.mitte ?? f.x + f.w / 2, cy, f.w - 2);
    }
  }
  const { tabelle: t, rahmen: k } = b;
  ctx.strokeStyle = DUNKEL;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(k.x, k.y, k.w, k.h);
  ctx.lineWidth = 1.8;
  ctx.strokeRect(t.x, t.y, t.w, t.h);
}

// --- SpotMap ---------------------------------------------------------------------------------------------

const ALPHA_FLAECHE: Partial<Record<string, number>> = { wald: 0.38, gebaeude: 0.14, gewaesser: 0.28 };

const teile = (g: GeoJSON.Geometry): Pos[][] => (g.type === 'LineString' ? [g.coordinates as Pos[]] : (g as GeoJSON.MultiLineString).coordinates as Pos[][]);

function zeichneTaufen(ctx: CanvasRenderingContext2D, taufen: Taufe[], b: Blatt) {
  const p = ([lon, lat]: Pos): Xy => b.zu(zuLv95({ lat, lon }));
  const pfad = (ringe: Pos[][]) => {
    ctx.beginPath();
    for (const ring of ringe) ring.map(p).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  };
  for (const f of taufFeatures(taufen)) {
    const { rolle, familie } = f.properties as { rolle: string; familie: string; farbe?: string; fassade?: string };
    const farbe = FAMILIE_FARBE[familie as keyof typeof FAMILIE_FARBE];
    const g = f.geometry;
    if (rolle === 'flaeche') {
      const polys = g.type === 'Polygon' ? [g.coordinates as Pos[][]] : (g as GeoJSON.MultiPolygon).coordinates as Pos[][][];
      for (const ringe of polys) {
        pfad(ringe);
        ctx.globalAlpha = ALPHA_FLAECHE[familie] ?? 0.2;
        ctx.fillStyle = farbe;
        ctx.fill('evenodd');
        ctx.globalAlpha = 1;
        for (const ring of ringe) {
          const q = ring.map(p);
          if (familie === 'gebaeude') linie(ctx, q, DUNKEL, 2.4, 0.55);
          linie(ctx, q, farbe, familie === 'gebaeude' ? 1.2 : 0.9, familie === 'gebaeude' ? 1 : 0.85);
        }
      }
    } else if (rolle === 'linie') {
      if (familie === 'strasse') {
        // dünne Linie unter der roten Schrift: zeigt die Ausdehnung langer Abschnitte
        for (const t of teile(g)) (linie(ctx, t.map(p), '#fff', 2.2, 0.45), linie(ctx, t.map(p), farbe, 0.9, 0.8));
        continue;
      }
      for (const t of teile(g)) {
        linie(ctx, t.map(p), DUNKEL, 3.2, 0.35);
        linie(ctx, t.map(p), farbe, 1.6, 0.75);
      }
    } else if (rolle === 'fassade' || rolle === 'pfeil') {
      const q = (g as GeoJSON.LineString).coordinates.map((c) => p(c as Pos));
      const fassade = (f.properties as { fassade?: string }).fassade;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      linie(ctx, q, fassade === 'schwarz' ? '#fff' : DUNKEL, rolle === 'fassade' ? 4.4 : 3.8, rolle === 'fassade' ? 0.75 : 0.6);
      linie(ctx, q, rolle === 'fassade' ? FASSADE_FARBE[fassade as keyof typeof FASSADE_FARBE] : ZIEL_FARBE, rolle === 'fassade' ? 2.8 : 2.2);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    } else if (rolle === 'pfeilspitze') {
      pfad((g as GeoJSON.Polygon).coordinates as Pos[][]);
      ctx.fillStyle = ZIEL_FARBE;
      ctx.fill();
      ctx.strokeStyle = DUNKEL;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

/**\n * Namen wie auf der Karte (darstellung.platziere): Zielobjekte zuerst, Gebäude mit Führungslinie daneben, Strassen entlang\n * der Achse. Schreibweise und Kästchen wie in der Vorlage: Grossbuchstaben, Gebäude braun mit weisser Schrift.\n */
function zeichneNamen(ctx: CanvasRenderingContext2D, taufen: Taufe[], b: Blatt) {
  const p = ([lon, lat]: Pos): Xy => b.zu(zuLv95({ lat, lon }));
  const k = b.rahmen;
  const schrift = (t: Taufe) => `${t.familie === 'gewaesser' && !t.ziel ? 'italic ' : ''}800 ${t.familie === 'strasse' ? 7.5 : 7}px ${SCHRIFT}`;
  const liste = [...taufen].sort((a, c) => Number(c.ziel) - Number(a.ziel) || LABEL_RANG[a.familie] - LABEL_RANG[c.familie]);
  const wuensche: (LabelWunsch & { t: Taufe; winkel: number; tw: number })[] = [];
  const text = (t: Taufe) => t.name.toUpperCase();
  for (const t of liste) {
    const anker = labelAnker(t.geometrie);
    const a = p(anker.punkt);
    if (a.x < k.x || a.y < k.y || a.x > k.x + k.w || a.y > k.y + k.h) continue;
    ctx.font = schrift(t);
    const tw = ctx.measureText(text(t)).width;
    const w = tw + 6;
    const h = 10;
    let winkel = 0;
    let objekt: { w: number; h: number } | undefined;
    if (anker.richtung) {
      const [q1, q2] = anker.richtung.map(p);
      winkel = Math.atan2(q2.y - q1.y, q2.x - q1.x);
      if (winkel > Math.PI / 2) winkel -= Math.PI;
      if (winkel < -Math.PI / 2) winkel += Math.PI;
    } else {
      const ring = polygoneVon(t.geometrie)[0][0].map((c) => p(c as Pos));
      const xs = ring.map((q) => q.x);
      const ys = ring.map((q) => q.y);
      objekt = { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    const bw = Math.abs(w * Math.cos(winkel)) + Math.abs(h * Math.sin(winkel));
    const bh = Math.abs(w * Math.sin(winkel)) + Math.abs(h * Math.cos(winkel));
    wuensche.push({ id: t.id, x: a.x, y: a.y, w: bw, h: bh, objekt, immer: t.ziel, fuehrung: t.familie === 'gebaeude', t, winkel, tw });
  }
  platziere(wuensche, 8).forEach((pl, i) => {
    if ('weg' in pl) return;
    const { t, x, y, winkel, tw } = wuensche[i];
    const cx = x + pl.dx;
    const cy = y + pl.dy;
    if (pl.fuehrung) {
      linie(ctx, [{ x, y }, { x: cx, y: cy }], DUNKEL, 2, 0.8);
      linie(ctx, [{ x, y }, { x: cx, y: cy }], '#fff', 0.9);
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(winkel);
    ctx.font = schrift(t);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const box = (fuell: string, rand?: string) => {
      ctx.fillStyle = fuell;
      ctx.fillRect(-tw / 2 - 3, -5, tw + 6, 10);
      if (rand) {
        ctx.strokeStyle = rand;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-tw / 2 - 3, -5, tw + 6, 10);
      }
    };
    const halo = (farbe: string) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.strokeText(text(t), 0, 0.5);
      ctx.fillStyle = farbe;
    };
    if (t.ziel) (box(ZIEL_FARBE, DUNKEL), (ctx.fillStyle = '#111'));
    else if (t.familie === 'gebaeude') (box('rgba(140,98,66,0.92)', DUNKEL), (ctx.fillStyle = '#fff'));
    else if (t.familie === 'wald') (box('rgba(93,58,26,0.88)'), (ctx.fillStyle = '#fff'));
    else if (t.familie === 'flaeche') (box('rgba(255,243,196,0.88)', '#8a6d00'), (ctx.fillStyle = '#3e3000'));
    else halo(t.familie === 'strasse' ? '#e53935' : '#0277bd');
    ctx.fillText(text(t), 0, 0.5);
    ctx.restore();
  });
}

// --- Seiten ---------------------------------------------------------------------------------------------

type Karte = { plan: KachelPlan; kacheln: Kacheln };

async function seite(r: Raster, b: Blatt, karte: Karte, art: SeitenArt, lage: string, taufen: Taufe[], datum: Date): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(b.format.w * PX_JE_PT);
  canvas.height = Math.round(b.format.h * PX_JE_PT);
  const ctx = canvas.getContext('2d')!;
  const px = PX_JE_PT * b.format.k; // Pixel je Layoutpunkt
  const basis = () => ctx.setTransform(px, 0, 0, px, 0, 0);
  basis();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, b.format.w / b.format.k, b.format.h / b.format.k);
  const { x, y, w, h } = b.rahmen;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  zeichneKacheln(ctx, karte.plan, karte.kacheln);
  basis();
  if (art === 'spotmap') zeichneTaufen(ctx, taufen, b);
  zeichneRaster(ctx, r, b);
  if (art === 'spotmap') zeichneNamen(ctx, taufen, b);
  ctx.restore();
  basis();
  zeichneFelder(ctx, r, b, blattFelder(r, b, art), lage, datum);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Seiten je Basiskarte in der Reihenfolge der Vorlage; die Kacheln einer Karte liegen nur so lange im Speicher, wie ihre Seiten brauchen. */
const SEITEN: [Basiskarte, SeitenArt[]][] = [
  ['luftbild', ['luftbild', 'spotmap']],
  ['farbe', ['landeskarte']],
];

/** PDF mit drei Seiten (Luftbild, SpotMap, Landeskarte). `fehlen`: Kacheln, die weder offline noch im Netz da waren. */
export async function rasterPdf(r: Raster, lage: string, taufen: Taufe[], datum = new Date(), format: Format = A4_QUER): Promise<{ blob: Blob; name: string; fehlen: number }> {
  const b = blatt(r, format);
  const plan = kachelPlan(b, PX_JE_PT * format.k);
  const px = { pxW: Math.round(b.format.w * PX_JE_PT), pxH: Math.round(b.format.h * PX_JE_PT) };
  const seiten = [];
  let fehlen = 0;
  for (const [basiskarte, arten] of SEITEN) {
    const { kacheln, fehlen: f } = await ladeKacheln(plan, basiskarte);
    fehlen += f;
    try {
      for (const art of arten) seiten.push({ ...px, jpeg: await seite(r, b, { plan, kacheln }, art, lage, taufen, datum) });
    } finally {
      for (const k of kacheln.values()) k.close();
    }
  }
  const pdf = pdfAusJpegs(seiten, b.format.w, b.format.h, `${lage} · ${RASTER_NAME[r.art]}`);
  return { blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }), name: dateiName(lage, r.art, datum), fehlen };
}
