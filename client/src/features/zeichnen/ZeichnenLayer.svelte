<script lang="ts">
  // Zeichnungen in MapLibre-Layern (GeoJSON), Entwurf, Griffe, Fang, Lasso, Messung; Beschriftungen als HTML-Marker.
  import { Marker, type GeoJSONSource, type LayerSpecification } from 'maplibre-gl';
  import { STANDARD_STIL } from '../../../../shared/protocol.ts';
  import { onDestroy, untrack } from 'svelte';
  import { distanz, formatDistanz } from '../../lib/coords.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { getMap, registriereRadialAktion, type RadialZiel } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { ikon, oeffne, toast } from '../../lib/ui.svelte.ts';
  import { beobachteEcho, kopiere, loesche } from './aktionen.ts';
  import { darstelle, istGeschlossen, musterBild, umriss, type Beschriftung, type Form, type Muster } from './darstellung.ts';
  import { flaeche, formatFlaeche, laenge, meterJePixel } from './geometrie.ts';
  import Eingabe from './Eingabe.svelte';
  import { bearbeite, griffeVon, griffForm, starteInteraktion, zeichnetGerade } from './interaktion.ts';
  import KoordBox from './KoordBox.svelte';
  import { zeichnungName } from './logik.ts';
  import LiveMasse from './LiveMasse.svelte';
  import MobilLeiste from './MobilLeiste.svelte';
  import Palette from './Palette.svelte';
  import { werkzeug } from './werkzeuge.ts';
  import { anzeige, darf, istDesktop, labelElemente, ladeSichtbarkeit, setzeWerkzeug, zn, zuruecksetzen } from './zustand.svelte.ts';

  const m = getMap();
  const Q = 'zeichnen';
  const ENTWURF = 'zeichnen-entwurf';
  const HILFE = 'zeichnen-hilfe';
  const AUSWAHL_FARBE = '#4fc3f7';
  const leer: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  const STRICHE: [string, number[] | null, 'round' | 'butt'][] = [
    ['voll', null, 'round'],
    ['gestrichelt', [3, 2], 'butt'],
    ['gepunktet', [0.1, 2], 'round'],
    ['strichpunkt', [5, 1.6, 1, 1.6], 'butt'],
  ];
  const fuellLayer = (q: string): LayerSpecification[] => [
    { id: `${q}-fuellung`, type: 'fill', source: q, filter: ['has', 'fuellung'], paint: { 'fill-color': ['get', 'fuellung'], 'fill-opacity': ['get', 'deckkraft'] } },
    { id: `${q}-muster`, type: 'fill', source: q, filter: ['has', 'muster'], paint: { 'fill-pattern': ['get', 'muster'] } },
  ];
  const linienLayer = (q: string): LayerSpecification[] => [
    // dunkler Saum: Linien bleiben auf Landeskarte und Luftbild lesbar
    { id: `${q}-saum`, type: 'line', source: q, filter: ['!=', ['get', 'strich'], 'keiner'], layout: { 'line-join': 'round' }, paint: { 'line-color': '#161b1f', 'line-width': ['+', ['get', 'breite'], 3], 'line-opacity': 0.35 } },
    ...STRICHE.map(([s, dash, cap]): LayerSpecification => ({
      id: `${q}-${s}`,
      type: 'line',
      source: q,
      filter: ['==', ['get', 'strich'], s],
      layout: { 'line-join': 'round', 'line-cap': cap },
      paint: { 'line-color': ['get', 'farbe'], 'line-width': ['get', 'breite'], ...(dash ? { 'line-dasharray': dash } : {}) },
    })),
  ];
  const hilfeLayer: LayerSpecification[] = [
    { id: `${HILFE}-saum`, type: 'line', source: HILFE, filter: ['==', ['get', 'rolle'], 'linie'], paint: { 'line-color': '#161b1f', 'line-width': 4, 'line-opacity': 0.6 } },
    { id: `${HILFE}-linie`, type: 'line', source: HILFE, filter: ['==', ['get', 'rolle'], 'linie'], paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [2, 1.5] } },
    { id: `${HILFE}-entwurfpunkte`, type: 'circle', source: HILFE, filter: ['==', ['get', 'rolle'], 'entwurf'], paint: { 'circle-radius': 3.5, 'circle-color': '#fff', 'circle-stroke-color': '#161b1f', 'circle-stroke-width': 1.5 } },
    {
      id: `${HILFE}-griffe`,
      type: 'circle',
      source: HILFE,
      filter: ['==', ['get', 'rolle'], 'griff'],
      paint: {
        'circle-radius': ['get', 'r'],
        'circle-color': ['match', ['get', 'typ'], 'mitte', AUSWAHL_FARBE, 'aktiv', '#ffeb3b', '#ffffff'],
        'circle-opacity': ['match', ['get', 'typ'], 'mitte', 0.75, 1],
        'circle-stroke-color': '#161b1f',
        'circle-stroke-width': 1.5,
      },
    },
    { id: `${HILFE}-fang`, type: 'circle', source: HILFE, filter: ['==', ['get', 'rolle'], 'fang'], paint: { 'circle-radius': 9, 'circle-opacity': 0, 'circle-stroke-color': '#ffeb3b', 'circle-stroke-width': 2.5 } },
  ];

  for (const q of [Q, ENTWURF, HILFE]) m.addSource(q, { type: 'geojson', data: leer });
  for (const l of [
    ...fuellLayer(Q),
    // Auswahl-Hervorhebung unter den Linien: die Form selbst bleibt lesbar
    { id: `${HILFE}-auswahl`, type: 'line', source: HILFE, filter: ['==', ['get', 'rolle'], 'auswahl'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': AUSWAHL_FARBE, 'line-width': ['+', ['get', 'breite'], 8], 'line-opacity': 0.5 } } as LayerSpecification,
    ...linienLayer(Q),
    ...fuellLayer(ENTWURF),
    ...linienLayer(ENTWURF),
    ...hilfeLayer,
  ])
    m.addLayer(l);

  const quelle = (q: string) => m.getSource(q) as GeoJSONSource;
  const mpp = () => meterJePixel(m.getCenter().lat, m.getZoom());
  const zoomEnde = () => zn.zoomStand++;
  m.on('zoomend', zoomEnde);

  /** Füllmuster als Bitmap je Farbe nachladen, bevor ein Feature es braucht. */
  function sichereMuster(features: GeoJSON.Feature[]) {
    for (const f of features) {
      const name = f.properties?.muster as string | undefined;
      if (!name || m.hasImage(name)) continue;
      const [, art, farbe] = name.split('-');
      m.addImage(name, musterBild(art as Muster, `#${farbe}`));
    }
  }

  // --- Beschriftungen ---
  const labels = new Map<string, { marker: Marker; schluessel: string }>();
  function labelElement(b: Beschriftung, farbe: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `zn-label zn-${b.art}`;
    el.style.setProperty('--zn-farbe', farbe);
    if (b.ueber) {
      const s = document.createElement('small');
      s.textContent = b.ueber;
      el.append(s);
    }
    const t = document.createElement('span');
    t.textContent = b.text;
    el.append(t);
    return el;
  }
  function zeigeLabels(liste: { b: Beschriftung; farbe: string }[]) {
    const gesehen = new Set<string>();
    const proId = new Map<string, HTMLElement[]>();
    const zaehler = new Map<string, number>();
    for (const { b, farbe } of liste) {
      const n = zaehler.get(b.id) ?? 0;
      zaehler.set(b.id, n + 1);
      const key = `${b.id}:${n}`;
      const drehung = Math.round(b.drehung ?? 0);
      const schluessel = `${b.art}|${b.ueber ?? ''}|${b.text}|${farbe}|${drehung}`;
      gesehen.add(key);
      let e = labels.get(key);
      if (e && e.schluessel !== schluessel) {
        e.marker.remove();
        e = undefined;
      }
      if (!e) {
        const marker = new Marker({ element: labelElement(b, farbe), anchor: b.art === 'pl' ? 'bottom' : 'center', rotation: drehung, rotationAlignment: b.drehung === undefined ? 'auto' : 'map' });
        e = { marker: marker.setLngLat([b.punkt.lon, b.punkt.lat]).addTo(m), schluessel };
        labels.set(key, e);
      } else e.marker.setLngLat([b.punkt.lon, b.punkt.lat]);
      const el = e.marker.getElement();
      el.classList.toggle('gewaehlt', zn.auswahl.has(b.id));
      proId.set(b.id, [...(proId.get(b.id) ?? []), el]);
    }
    for (const [key, e] of labels) {
      if (gesehen.has(key)) continue;
      e.marker.remove();
      labels.delete(key);
    }
    labelElemente.clear();
    for (const [id, els] of proId) labelElemente.set(id, els);
  }

  // Bestand: bei jeder Änderung, Vorschau, Sichtbarkeit und Zoomende neu (ponytail: alles neu, reicht für Hunderte Formen)
  $effect(() => {
    void zn.zoomStand;
    const masstab = mpp();
    const features: GeoJSON.Feature[] = [];
    const beschriftungen: { b: Beschriftung; farbe: string }[] = [];
    for (const z of anzeige()) {
      const d = darstelle(z, masstab);
      features.push(...d.features);
      for (const b of d.beschriftungen) beschriftungen.push({ b, farbe: z.stil.farbe });
    }
    sichereMuster(features);
    quelle(Q).setData({ type: 'FeatureCollection', features });
    zeigeLabels(beschriftungen);
  });

  // Entwurf mit Gummiband: dieselbe Darstellung wie die fertige Form
  $effect(() => {
    void zn.zoomStand;
    const w = zn.werkzeug ? werkzeug(zn.werkzeug) : null;
    const ps = zn.entwurf;
    let form: Form | null = null;
    if (w?.art && ps.length) {
      const mit = zn.maus ? [...ps, zn.maus] : ps;
      const basis = { id: 'entwurf', art: w.art, raumArt: w.raumArt, text: '', bezeichnung: '', stil: istDesktop() ? zn.stil : STANDARD_STIL };
      if (w.art === 'kreis') form = { ...basis, punkte: [ps[0]], radiusM: Math.max(1, distanz(ps[0], mit.at(-1)!)) };
      else if (w.art === 'rechteck') form = { ...basis, punkte: [ps[0], mit.at(-1)!] };
      else form = { ...basis, punkte: mit };
    }
    const features = form ? darstelle(form, mpp()).features : [];
    sichereMuster(features);
    quelle(ENTWURF).setData({ type: 'FeatureCollection', features });
  });

  // Hilfsgeometrie: Auswahl, Griffe, Fang, Lasso, Messung, Vorschau-Kreuz
  $effect(() => {
    const f: GeoJSON.Feature[] = [];
    const ll = (p: { lat: number; lon: number }): [number, number] => [p.lon, p.lat];
    const pt = (p: { lat: number; lon: number }, props: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: ll(p) } });
    const li = (ps: { lat: number; lon: number }[], props: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: ps.map(ll) } });
    for (const z of anzeige()) {
      if (!zn.auswahl.has(z.id) || z.art === 'text') continue;
      const r = umriss(z);
      f.push(li(istGeschlossen(z.art) ? [...r, r[0]] : r, { rolle: 'auswahl', breite: z.stil.breite }));
    }
    const gf = griffForm();
    if (gf) {
      const gross = !istDesktop();
      for (const g of griffeVon(gf)) {
        const aktiv = zn.griff?.id === gf.id && zn.griff.art === g.art && zn.griff.i === g.i;
        f.push(pt(g.p, { rolle: 'griff', typ: aktiv ? 'aktiv' : g.art === 'mitte' ? 'mitte' : 'punkt', r: (gross ? 14 : g.art === 'mitte' ? 4 : 5.5) * groesse.ui }));
      }
    }
    if (zn.werkzeug && zn.werkzeug !== 'messen') for (const p of zn.entwurf) f.push(pt(p, { rolle: 'entwurf' }));
    const messen = zn.werkzeug === 'messen' && zn.entwurf.length ? [...zn.entwurf, ...(zn.maus ? [zn.maus] : [])] : zn.messung;
    if (messen && messen.length >= 2) {
      f.push(li(messen, { rolle: 'linie' }));
      for (const p of messen) f.push(pt(p, { rolle: 'entwurf' }));
    }
    if (zn.lasso && zn.lasso.length > 1) {
      const geo = zn.lasso.map((q) => m.unproject([q.x, q.y])).map((l) => ({ lat: l.lat, lon: l.lng }));
      f.push(li([...geo, geo[0]], { rolle: 'linie' }));
    }
    if (zn.fang) f.push(pt(zn.fang.geo, { rolle: 'fang' }));
    if (zn.koordVorschau) {
      const q = m.project([zn.koordVorschau.lon, zn.koordVorschau.lat]);
      const u = (dx: number, dy: number) => {
        const l = m.unproject([q.x + dx, q.y + dy]);
        return { lat: l.lat, lon: l.lng };
      };
      f.push(li([u(-14, 0), u(14, 0)], { rolle: 'linie' }), li([u(0, -14), u(0, 14)], { rolle: 'linie' }), pt(zn.koordVorschau, { rolle: 'fang' }));
    }
    quelle(HILFE).setData({ type: 'FeatureCollection', features: f });
  });

  // Ergebnis der Messung am letzten Punkt
  let messLabel: Marker | null = null;
  $effect(() => {
    const ps = zn.messung;
    messLabel?.remove();
    messLabel = null;
    if (!ps) return;
    const el = document.createElement('div');
    el.className = 'zn-label zn-mess mono';
    el.textContent = [`Strecke ${formatDistanz(laenge(ps))}`, ps.length >= 3 ? `Fläche ${formatFlaeche(flaeche(ps))}` : ''].filter(Boolean).join(' · ');
    messLabel = new Marker({ element: el, anchor: 'top-left', offset: [10, 6] }).setLngLat([ps.at(-1)!.lon, ps.at(-1)!.lat]).addTo(m);
  });

  // Modus: Desktop arbeitet standardmässig mit der Auswahl, mobil wird nur angesehen
  $effect(() => {
    const desktop = istDesktop();
    untrack(() => {
      setzeWerkzeug(desktop ? 'auswahl' : null);
      zn.mobilBearbeiten = null;
    });
  });
  $effect(() => {
    const id = store.lage?.id ?? null;
    untrack(() => ladeSichtbarkeit(id));
  });
  // Beim Zeichnen: kein Doppelklick-Zoom, Symbole (DOM-Marker) lassen Klicks zur Karte durch
  $effect(() => {
    const an = zeichnetGerade();
    if (an) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
    document.body.classList.toggle('zn-zeichnet', an);
  });

  const abInteraktion = starteInteraktion(m);
  const abEcho = beobachteEcho();

  const darfZiel = (z: RadialZiel): boolean => {
    const x = store.zeichnungen.get(z.id);
    return !!x && darf(x);
  };
  const abRadial = [
    registriereRadialAktion({ fuer: 'zeichnung', label: 'Bearbeiten', icon: ikon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'), aktion: (z) => bearbeite(z.id), sichtbar: darfZiel, phasen: ['ap', 'lv'] }),
    registriereRadialAktion({
      fuer: 'zeichnung',
      label: 'Stil',
      icon: ikon('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/>'),
      aktion: (z) => {
        bearbeite(z.id);
        oeffne('zeichnen', { tab: 'eigenschaften' });
      },
      sichtbar: (z) => istDesktop() && darfZiel(z),
      phasen: ['ap', 'lv'],
    }),
    registriereRadialAktion({
      fuer: 'zeichnung',
      label: 'Ebene',
      icon: ikon('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
      aktion: (z) => {
        bearbeite(z.id);
        oeffne('zeichnen', { tab: 'eigenschaften', fokus: 'ebene' });
      },
      sichtbar: (z) => istDesktop() && darfZiel(z),
      phasen: ['ap', 'lv'],
    }),
    registriereRadialAktion({ fuer: 'zeichnung', label: 'Kopieren', icon: ikon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'), aktion: (z) => kopiere([z.id]), sichtbar: () => istDesktop(), phasen: ['ap', 'lv'] }),
    registriereRadialAktion({
      fuer: 'zeichnung',
      label: 'Löschen',
      icon: ikon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
      aktion: (z) => {
        const x = store.zeichnungen.get(z.id);
        if (!x) return;
        if (!istDesktop() && !confirm(`«${zeichnungName(x)}» endgültig löschen?`)) return;
        void loesche([z.id]);
        toast(istDesktop() ? 'Zeichnung gelöscht – Ctrl+Z macht rückgängig' : 'Zeichnung gelöscht');
      },
      sichtbar: darfZiel,
      phasen: ['ap', 'lv'],
    }),
  ];

  onDestroy(() => {
    abInteraktion();
    abEcho();
    for (const ab of abRadial) ab();
    m.off('zoomend', zoomEnde);
    for (const e of labels.values()) e.marker.remove();
    labels.clear();
    labelElemente.clear();
    messLabel?.remove();
    document.body.classList.remove('zn-zeichnet');
    m.doubleClickZoom.enable(); // Abmelden mitten im Zeichnen: Karte nicht ohne Doppelklick-Zoom zurücklassen
    zuruecksetzen();
    if (!m.getStyle()) return;
    for (const l of m.getStyle().layers.filter((l) => 'source' in l && [Q, ENTWURF, HILFE].includes(l.source as string))) m.removeLayer(l.id);
    for (const q of [Q, ENTWURF, HILFE]) m.removeSource(q);
  });
</script>

{#if istDesktop()}
  <Palette />
  <KoordBox />
  <LiveMasse />
{:else}
  <MobilLeiste />
{/if}
{#if zn.eingabe}<Eingabe {...zn.eingabe} />{/if}

<style>
  /* Beschriftungen: nie klickbar (Treffer prüft die Rechtecke selbst), damit die Karte darunter bedienbar bleibt */
  :global(.zn-label) {
    pointer-events: none;
    display: grid;
    justify-items: center;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgb(22 27 31 / 0.82);
    border: 1.5px solid var(--zn-farbe);
    color: #fff;
    font-size: calc(12px * var(--karte));
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
  }
  :global(.zn-label small) {
    font-size: calc(9.5px * var(--karte));
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #cfd6d1;
  }
  :global(.zn-label.zn-pl) {
    margin-bottom: 4px;
    background: var(--zn-farbe);
    border-color: #161b1f;
    letter-spacing: 0.03em;
  }
  :global(.zn-label.zn-raum) {
    background: rgb(22 27 31 / 0.7);
    font-size: calc(13px * var(--karte));
  }
  /* Text-Zeichnung: Schrift in der Zeichnungsfarbe mit dunklem Rand, ohne Kasten */
  :global(.zn-label.zn-text) {
    background: none;
    border: 0;
    color: var(--zn-farbe);
    font-size: calc(16px * var(--karte));
    text-shadow: 0 0 2px #161b1f, 0 0 2px #161b1f, 0 0 4px #161b1f;
  }
  /* Grenze: Namen entlang der Linie, klein in Versalien in der Linienfarbe; Stufe im weissen Kästchen auf der Linie */
  :global(.zn-label.zn-grenze) {
    background: none;
    border: 0;
    padding: 0;
    color: var(--zn-farbe);
    font-size: calc(10px * var(--karte));
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff;
  }
  :global(.zn-label.zn-stufe) {
    padding: 0 4px;
    border-radius: 2px;
    background: #fff;
    border-width: 1px;
    color: var(--zn-farbe);
    font-size: calc(9px * var(--karte));
    line-height: 1.2;
    letter-spacing: 0.05em;
  }
  :global(.zn-label.gewaehlt) {
    outline: 2px solid #4fc3f7;
    outline-offset: 2px;
  }
  :global(.zn-label.zn-mess) {
    border-color: #fff;
    font-weight: 600;
  }
  :global(body.zn-zeichnet .maplibregl-marker) {
    pointer-events: none;
  }
</style>
