// PDF je Führungsraster (Juan 30.10.): Seite 1 Luftbild mit Raster, Seite 2 SpotMap (Luftbild mit Taufen und Fassaden)
// mit Raster. Gezeichnet auf ein Canvas (kein WebGL, keine zweite Karte), Luftbild-Kacheln zuerst aus den
// Offline-Gebieten, sonst gedrosselt aus dem Netz. Geometrie und PDF-Aufbau rein in druck.ts / pdf.ts.
import type { Raster, Taufe } from '../../../../shared/protocol.ts';
import { RASTER_NAME, zuLv95 } from '../../../../shared/raster.ts';
import { oeffneSpeicher } from '../../lib/kachelspeicher.ts';
import { BASISKARTEN, kachelUrl } from '../../lib/karten.ts';
import { istApp } from '../../lib/umgebung.ts';
import { drossel, PARALLEL } from '../offline/laden.ts';
import { FASSADE_FARBE } from '../taufe/fassaden.ts';
import { FAMILIE_FARBE, LABEL_RANG, labelAnker, platziere, polygoneVon, taufFeatures, ZIEL_FARBE, type LabelWunsch } from '../taufe/darstellung.ts';
import type { Xy } from './beschriftung.ts';
import { blatt, blattKoepfe, dateiName, massstabText, RAND, TITEL_H, TILE, kachelPlan, type Blatt, type KachelPlan } from './druck.ts';
import { pdfAusJpegs } from './pdf.ts';

/** 200 dpi: A4 quer = 2339 × 1654 px je Seite */
const PX_JE_PT = 200 / 72;
const DUNKEL = '#161b1f';
const SCHRIFT = 'system-ui, sans-serif';
const LUFTBILD = kachelUrl(BASISKARTEN.find((k) => k.id === 'luftbild')!);

type Kacheln = Map<string, ImageBitmap>;
type Pos = [number, number];

/** Luftbild-Kacheln des Plans: Offline-Gebiet, sonst Netz (in der PWA über den Kachel-Cache des Service Workers). */
async function ladeKacheln(plan: KachelPlan): Promise<{ kacheln: Kacheln; fehlen: number }> {
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
      const url = LUFTBILD.replace('{z}', String(plan.z)).replace('{x}', String(x)).replace('{y}', String(y));
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

function zeichneLuftbild(ctx: CanvasRenderingContext2D, plan: KachelPlan, kacheln: Kacheln) {
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

/** Raster: Rahmen kräftig, Zelllinien dünn, Viertel gestrichelt (wenn die Zellen gross genug sind); immer mit weissem Saum. */
function zeichneRaster(ctx: CanvasRenderingContext2D, r: Raster, b: Blatt) {
  const { x, y, w, h } = b.rahmen;
  const zelle = w / r.spalten;
  const senk = (t: number) => [{ x: x + t * zelle, y }, { x: x + t * zelle, y: y + h }];
  const waag = (t: number) => [{ x, y: y + t * zelle }, { x: x + w, y: y + t * zelle }];
  // o = 0: Zellgrenzen, o = 0.5: Viertellinien durch die Zellmitten
  const linien = (o: number) => [
    ...Array.from({ length: o ? r.spalten : r.spalten - 1 }, (_, i) => senk(i + (o || 1))),
    ...Array.from({ length: o ? r.zeilen : r.zeilen - 1 }, (_, i) => waag(i + (o || 1))),
  ];
  if (zelle >= 24)
    for (const l of linien(0.5)) {
      linie(ctx, l, '#fff', 1, 0.7, [2, 2]);
      linie(ctx, l, DUNKEL, 0.45, 1, [2, 2]);
    }
  for (const l of linien(0)) {
    linie(ctx, l, '#fff', 1.4, 0.8);
    linie(ctx, l, DUNKEL, 0.6);
  }
  const ring = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  linie(ctx, ring, '#fff', 3.4);
  linie(ctx, ring, DUNKEL, 1.6);
}

function zeichneKoepfe(ctx: CanvasRenderingContext2D, r: Raster, b: Blatt) {
  ctx.font = `800 8px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of blattKoepfe(r, b)) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.strokeStyle = DUNKEL;
    ctx.lineWidth = 1;
    ctx.strokeRect(k.x, k.y, k.w, k.h);
    ctx.fillStyle = DUNKEL;
    ctx.fillText(k.text, k.x + k.w / 2, k.y + k.h / 2 + 0.5);
  }
}

// --- SpotMap ---------------------------------------------------------------------------------------------

const ALPHA_FLAECHE: Partial<Record<string, number>> = { wald: 0.38, gebaeude: 0.14, gewaesser: 0.28 };

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
      const teile = g.type === 'LineString' ? [g.coordinates as Pos[]] : (g as GeoJSON.MultiLineString).coordinates as Pos[][];
      for (const t of teile) {
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

/** Namen wie auf der Karte (darstellung.platziere): Zielobjekte zuerst, Gebäude mit Führungslinie daneben, Strassen entlang der Achse. */
function zeichneNamen(ctx: CanvasRenderingContext2D, taufen: Taufe[], b: Blatt) {
  const p = ([lon, lat]: Pos): Xy => b.zu(zuLv95({ lat, lon }));
  const k = b.karte;
  const schrift = (t: Taufe) => `${t.familie === 'gewaesser' && !t.ziel ? 'italic ' : ''}800 ${t.familie === 'strasse' ? 7.5 : 7}px ${SCHRIFT}`;
  const liste = [...taufen].sort((a, c) => Number(c.ziel) - Number(a.ziel) || LABEL_RANG[a.familie] - LABEL_RANG[c.familie]);
  const wuensche: (LabelWunsch & { t: Taufe; winkel: number; tw: number })[] = [];
  for (const t of liste) {
    const anker = labelAnker(t.geometrie);
    const a = p(anker.punkt);
    if (a.x < k.x || a.y < k.y || a.x > k.x + k.w || a.y > k.y + k.h) continue;
    ctx.font = schrift(t);
    const tw = ctx.measureText(t.name).width;
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
      ctx.strokeText(t.name, 0, 0.5);
      ctx.fillStyle = farbe;
    };
    if (t.ziel) (box(ZIEL_FARBE, DUNKEL), (ctx.fillStyle = '#111'));
    else if (t.familie === 'gebaeude') (box('#fff', DUNKEL), (ctx.fillStyle = '#111'));
    else if (t.familie === 'wald') (box('rgba(93,58,26,0.88)'), (ctx.fillStyle = '#fff'));
    else if (t.familie === 'flaeche') (box('rgba(255,243,196,0.88)', '#8a6d00'), (ctx.fillStyle = '#3e3000'));
    else halo(t.familie === 'strasse' ? '#e53935' : '#0277bd');
    ctx.fillText(t.name, 0, 0.5);
    ctx.restore();
  });
}

// --- Titelzeile ------------------------------------------------------------------------------------------

function zeichneTitel(ctx: CanvasRenderingContext2D, r: Raster, b: Blatt, lage: string, seite: string, datum: Date) {
  const y = RAND + TITEL_H / 2 - 2;
  const rechts = b.format.w - RAND;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = DUNKEL;
  ctx.textAlign = 'left';
  ctx.font = `800 15px ${SCHRIFT}`;
  const kopf = `${RASTER_NAME[r.art].toUpperCase()} · ${seite}`;
  ctx.fillText(kopf, RAND, y);
  const x = RAND + ctx.measureText(kopf).width + 12;
  ctx.font = `600 11px ${SCHRIFT}`;
  ctx.fillText(lage, x, y);

  // rechts: Nordpfeil, Quadranten-Legende A B / C D, Massstab · Zelle · Grösse · Datum
  const nx = rechts - 6;
  ctx.beginPath();
  ctx.moveTo(nx, y - 11);
  ctx.lineTo(nx + 5, y + 4);
  ctx.lineTo(nx, y + 1);
  ctx.lineTo(nx - 5, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.font = `800 7px ${SCHRIFT}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', nx, y + 10);
  const q = 9;
  const lx = nx - 16 - 2 * q;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = DUNKEL;
  ['A', 'B', 'C', 'D'].forEach((t, i) => {
    const qx = lx + (i % 2) * q;
    const qy = y - q + Math.floor(i / 2) * q;
    ctx.strokeRect(qx, qy, q, q);
    ctx.fillText(t, qx + q / 2, qy + q / 2 + 0.5);
  });
  ctx.textAlign = 'right';
  ctx.font = `600 10px ${SCHRIFT}`;
  const dat = datum.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.fillText(`${massstabText(b.massstab)} (A4) · Zelle ${r.zellM} m · ${r.spalten} × ${r.zeilen} · ${dat}`, lx - 10, y);
}

async function seite(r: Raster, b: Blatt, plan: KachelPlan, kacheln: Kacheln, lage: string, titel: string, taufen: Taufe[] | null, datum: Date): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(b.format.w * PX_JE_PT);
  canvas.height = Math.round(b.format.h * PX_JE_PT);
  const ctx = canvas.getContext('2d')!;
  const basis = () => ctx.setTransform(PX_JE_PT, 0, 0, PX_JE_PT, 0, 0);
  basis();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, b.format.w, b.format.h);
  const { x, y, w, h } = b.karte;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  zeichneLuftbild(ctx, plan, kacheln);
  basis();
  if (taufen) zeichneTaufen(ctx, taufen, b);
  zeichneRaster(ctx, r, b);
  if (taufen) zeichneNamen(ctx, taufen, b);
  ctx.restore();
  basis();
  ctx.strokeStyle = DUNKEL;
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, y, w, h);
  zeichneKoepfe(ctx, r, b);
  zeichneTitel(ctx, r, b, lage, titel, datum);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden');
  return new Uint8Array(await blob.arrayBuffer());
}

/** PDF mit zwei Seiten (Luftbild, SpotMap). `fehlen`: Luftbild-Kacheln, die weder offline noch im Netz da waren. */
export async function rasterPdf(r: Raster, lage: string, taufen: Taufe[], datum = new Date()): Promise<{ blob: Blob; name: string; fehlen: number }> {
  const b = blatt(r);
  const plan = kachelPlan(b, PX_JE_PT);
  const { kacheln, fehlen } = await ladeKacheln(plan);
  try {
    const px = { pxW: Math.round(b.format.w * PX_JE_PT), pxH: Math.round(b.format.h * PX_JE_PT) };
    const seiten = [
      { ...px, jpeg: await seite(r, b, plan, kacheln, lage, 'Luftbild', null, datum) },
      { ...px, jpeg: await seite(r, b, plan, kacheln, lage, 'SpotMap', taufen, datum) },
    ];
    const pdf = pdfAusJpegs(seiten, b.format.w, b.format.h, `${lage} · ${RASTER_NAME[r.art]}`);
    return { blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }), name: dateiName(lage, r.art, datum), fehlen };
  } finally {
    for (const k of kacheln.values()) k.close();
  }
}

/** Android-App: native Brücke aus MainActivity (Teilen-Dialog: speichern, senden, drucken). */
type Bruecke = { teile(base64: string, name: string, typ: string): void };

/** Datei speichern bzw. teilen: in der App über den Teilen-Dialog, im Browser als Download. false: hier nicht möglich. */
export async function speichere(blob: Blob, name: string): Promise<boolean> {
  const nativ = (window as unknown as { LagebildDatei?: Bruecke }).LagebildDatei;
  if (nativ) {
    const url = await new Promise<string>((ok, nok) => {
      const f = new FileReader();
      f.onload = () => ok(f.result as string);
      f.onerror = () => nok(f.error);
      f.readAsDataURL(blob);
    });
    nativ.teile(url.slice(url.indexOf(',') + 1), name, blob.type);
    return true;
  }
  if (istApp()) return false; // ältere App ohne Brücke: Download geht im WebView ins Leere
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
