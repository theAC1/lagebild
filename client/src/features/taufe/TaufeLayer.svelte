<script lang="ts">
  // Geländetaufe auf der Karte: Layer «Geländetaufe» (SpotMap-Darstellung), Taufmodus mit unsichtbarer Vektorebene,
  // Antippen → Familie → Namenswahl im Panel, Strassen verlängern, Fassaden umfärben, Fläche zeichnen.
  import { Marker, type GeoJSONSource, type LayerSpecification, type MapMouseEvent, type PointLike } from 'maplibre-gl';
  import { MAX_TAUF_PUNKTE, type Taufe } from '../../../../shared/protocol.ts';
  import { onDestroy } from 'svelte';
  import { getMap } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { istOffen, oeffne, schliesse, toast, ui, waehle } from '../../lib/ui.svelte.ts';
  import { FAMILIE_FARBE, fassadenKanten, LABEL_RANG, labelAnker, platziere, polygoneVon, taufFeatures, ZIEL_FARBE, type LabelWunsch } from './darstellung.ts';
  import { FAMILIE_LABEL, istLinienLayer, waehleTreffer } from './familien.ts';
  import { abschnitt, alsGeometrie, vereineFlaeche, type XY } from './geo.ts';
  import Modus from './Modus.svelte';
  import { flaechenStuecke, fuegeVektorHinzu, linienStuecke, VT, VT_LAYER, VT_TREFFER, welt, weltJePixel, zeigeVektor } from './vektor.ts';
  import { beendeModus, faerbeUm, MIN_ZOOM, sammleTeil, tz, verlaengere } from './zustand.svelte.ts';

  const m = getMap();
  const Q = 'taufe';
  const HILFE = 'taufe-hilfe';
  const KANTEN = 'taufe-kanten';
  const leer: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const rolle = (r: string | string[]) => (Array.isArray(r) ? ['in', ['get', 'rolle'], ['literal', r]] : ['==', ['get', 'rolle'], r]) as never;
  const familie = (f: string) => ['==', ['get', 'familie'], f] as never;
  const farbeJeFamilie = ['match', ['get', 'familie'], ...Object.entries(FAMILIE_FARBE).flat(), '#ffffff'] as never;

  const layer: LayerSpecification[] = [
    { id: 'taufe-fuellung', type: 'fill', source: Q, filter: rolle('flaeche'), paint: { 'fill-color': farbeJeFamilie, 'fill-opacity': ['match', ['get', 'familie'], 'wald', 0.38, 'gebaeude', 0.14, 'gewaesser', 0.28, 0.2] } },
    // Gebäude: weiss umrandet mit dunklem Saum (lesbar auf Luftbild und Landeskarte)
    { id: 'taufe-umriss-saum', type: 'line', source: Q, filter: ['all', rolle('flaeche'), familie('gebaeude')], layout: { 'line-join': 'round' }, paint: { 'line-color': '#161b1f', 'line-width': 4.5, 'line-opacity': 0.55 } },
    { id: 'taufe-umriss', type: 'line', source: Q, filter: rolle('flaeche'), layout: { 'line-join': 'round' }, paint: { 'line-color': farbeJeFamilie, 'line-width': ['match', ['get', 'familie'], 'gebaeude', 2.2, 1.6], 'line-opacity': ['match', ['get', 'familie'], 'gebaeude', 1, 0.85] } },
    { id: 'taufe-linie-saum', type: 'line', source: Q, filter: rolle('linie'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#161b1f', 'line-width': 6, 'line-opacity': 0.35 } },
    { id: 'taufe-linie', type: 'line', source: Q, filter: rolle('linie'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': farbeJeFamilie, 'line-width': 3, 'line-opacity': 0.75 } },
    { id: 'taufe-linie-treffer', type: 'line', source: Q, filter: rolle('linie'), paint: { 'line-color': '#000', 'line-width': 18, 'line-opacity': 0 } },
    // Fassaden: weiss/schwarz/rot/grün; Saum hell unter Schwarz, sonst dunkel
    { id: 'taufe-fassade-saum', type: 'line', source: Q, filter: rolle('fassade'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'fassade'], 'schwarz', '#ffffff', '#161b1f'], 'line-width': 8, 'line-opacity': 0.75 } },
    { id: 'taufe-fassade', type: 'line', source: Q, filter: rolle('fassade'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'farbe'], 'line-width': 5 } },
    { id: 'taufe-pfeil-saum', type: 'line', source: Q, filter: rolle('pfeil'), layout: { 'line-cap': 'round' }, paint: { 'line-color': '#161b1f', 'line-width': 7, 'line-opacity': 0.6 } },
    { id: 'taufe-pfeil', type: 'line', source: Q, filter: rolle('pfeil'), layout: { 'line-cap': 'round' }, paint: { 'line-color': ZIEL_FARBE, 'line-width': 4 } },
    { id: 'taufe-pfeilspitze', type: 'fill', source: Q, filter: rolle('pfeilspitze'), paint: { 'fill-color': ZIEL_FARBE, 'fill-outline-color': '#161b1f' } },
    // Taufmodus: gewähltes Objekt, Fläche im Bau
    { id: 'taufe-hilfe-flaeche', type: 'fill', source: HILFE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ZIEL_FARBE, 'fill-opacity': 0.25 } },
    { id: 'taufe-hilfe-linie', type: 'line', source: HILFE, filter: ['!=', ['geometry-type'], 'Point'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ZIEL_FARBE, 'line-width': 4, 'line-dasharray': [2, 1] } },
    { id: 'taufe-hilfe-punkt', type: 'circle', source: HILFE, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': ZIEL_FARBE, 'circle-stroke-color': '#161b1f', 'circle-stroke-width': 2 } },
    { id: 'taufe-kanten-treffer', type: 'line', source: KANTEN, paint: { 'line-color': '#000', 'line-width': 22, 'line-opacity': 0 } },
  ];
  const ANZEIGE = layer.filter((l) => 'source' in l && l.source === Q).map((l) => l.id);

  fuegeVektorHinzu(m);
  for (const q of [Q, HILFE, KANTEN]) m.addSource(q, { type: 'geojson', data: leer });
  for (const l of layer) m.addLayer(l);
  const quelle = (q: string) => m.getSource(q) as GeoJSONSource;

  const sichtbar = $derived(store.einstellungen.taufe || tz.modus || !!tz.umfaerben);

  // Taufmodus: Vektorebene an/aus (aus = keine Kacheln, nichts antippbar), kein Doppelklick-Zoom beim Antippen
  $effect(() => {
    const an = tz.modus;
    zeigeVektor(m, an);
    if (an) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
    document.body.classList.toggle('taufmodus', an);
  });
  $effect(() => {
    for (const id of ANZEIGE) m.setLayoutProperty(id, 'visibility', sichtbar ? 'visible' : 'none');
    quelle(Q).setData({ type: 'FeatureCollection', features: sichtbar ? taufFeatures(store.taufen.values()) : [] });
  });
  $effect(() => {
    const f: GeoJSON.Feature[] = [];
    if (tz.wahl) f.push({ type: 'Feature', properties: {}, geometry: tz.wahl.geometrie as GeoJSON.Geometry });
    const ps = tz.zeichnen;
    if (ps?.length) {
      f.push(...ps.map((p): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })));
      if (ps.length >= 2) f.push({ type: 'Feature', properties: {}, geometry: ps.length >= 3 ? { type: 'Polygon', coordinates: [[...ps, ps[0]]] } : { type: 'LineString', coordinates: ps } });
    }
    quelle(HILFE).setData({ type: 'FeatureCollection', features: f });
  });
  $effect(() => {
    const t = tz.umfaerben ? store.taufen.get(tz.umfaerben) : undefined;
    quelle(KANTEN).setData({ type: 'FeatureCollection', features: t ? fassadenKanten(t) : [] });
    if (tz.umfaerben && (!t || t.stoss === null)) tz.umfaerben = null;
  });
  // Wahl abgebrochen (Panel zu) → Hervorhebung weg
  $effect(() => {
    if (tz.wahl && !istOffen('taufe')) tz.wahl = null;
  });

  // --- Beschriftung: HTML-Kästchen mit Führungslinie, kollisionsarm (siehe darstellung.platziere) -------------
  type Label = { marker: Marker; box: HTMLElement; linie: SVGLineElement; schluessel: string; t: Taufe };
  const labels = new Map<string, Label>();
  const SVG = 'http://www.w3.org/2000/svg';

  function neuesLabel(t: Taufe): Label {
    const el = document.createElement('div');
    el.className = 'tf-anker';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'tf-fuehrung');
    const linie = document.createElementNS(SVG, 'line');
    svg.append(linie);
    const box = document.createElement('div');
    box.className = `tf-label tf-${t.familie}${t.ziel ? ' tf-ziel' : ''}`;
    box.textContent = t.name;
    el.append(svg, box);
    const a = labelAnker(t.geometrie).punkt;
    return { marker: new Marker({ element: el, anchor: 'center' }).setLngLat(a).addTo(m), box, linie, schluessel: '', t };
  }

  function synchronisiere() {
    const gesehen = new Set<string>();
    if (sichtbar)
      for (const t of store.taufen.values()) {
        gesehen.add(t.id);
        const schluessel = `${t.name}|${t.familie}|${t.ziel}|${t.geaendertAm}`;
        let l = labels.get(t.id);
        if (l && l.schluessel !== schluessel) {
          l.marker.remove();
          l = undefined;
        }
        if (!l) {
          l = neuesLabel(t);
          l.schluessel = schluessel;
          labels.set(t.id, l);
        }
      }
    for (const [id, l] of labels)
      if (!gesehen.has(id)) {
        l.marker.remove();
        labels.delete(id);
      }
    ordne();
  }

  /** Platzierung neu: bei Datenänderung und am Ende jeder Kartenbewegung (Pan verschiebt die Marker selbst). */
  function ordne() {
    const r = m.getContainer().getBoundingClientRect();
    const zoom = m.getZoom();
    const wuensche: (LabelWunsch & { winkel: number })[] = [];
    const liste = [...labels.values()].sort((a, b) => Number(b.t.ziel) - Number(a.t.ziel) || LABEL_RANG[a.t.familie] - LABEL_RANG[b.t.familie]);
    // Erst alle Sichtbarkeiten setzen, dann messen: abwechselnd schreiben und offsetWidth lesen erzwang je Taufe ein Layout
    const sichtbare = liste.flatMap((l) => {
      const anker = labelAnker(l.t.geometrie);
      const p = m.project(anker.punkt);
      const imBild = p.x > -100 && p.y > -100 && p.x < r.width + 100 && p.y < r.height + 100;
      const zeigen = imBild && (zoom >= 13 || l.t.ziel);
      l.box.parentElement!.style.display = zeigen ? '' : 'none';
      return zeigen ? [{ l, anker, p }] : [];
    });
    for (const { l, anker, p } of sichtbare) {
      const { t } = l;
      const w = l.box.offsetWidth;
      const h = l.box.offsetHeight;
      let winkel = 0;
      let objekt: { w: number; h: number } | undefined;
      if (anker.richtung) {
        const [a, b] = anker.richtung.map((q) => m.project(q));
        winkel = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (winkel > 90) winkel -= 180;
        if (winkel < -90) winkel += 180;
      } else {
        const ring = polygoneVon(t.geometrie)[0][0].map((q) => m.project(q as [number, number]));
        const xs = ring.map((q) => q.x);
        const ys = ring.map((q) => q.y);
        objekt = { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      const rad = (winkel * Math.PI) / 180;
      const bw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
      const bh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
      wuensche.push({ id: t.id, x: p.x, y: p.y, w: bw, h: bh, objekt, immer: t.ziel, fuehrung: t.familie === 'gebaeude', winkel });
    }
    const plaetze = platziere(wuensche);
    plaetze.forEach((pl, i) => {
      const l = labels.get(pl.id)!;
      const anker = l.box.parentElement!;
      if ('weg' in pl) {
        anker.style.display = 'none';
        return;
      }
      l.box.style.transform = `translate(-50%, -50%) translate(${pl.dx}px, ${pl.dy}px) rotate(${wuensche[i].winkel}deg)`;
      l.linie.setAttribute('x2', String(pl.dx));
      l.linie.setAttribute('y2', String(pl.dy));
      l.linie.style.display = pl.fuehrung ? '' : 'none';
    });
  }

  $effect(synchronisiere);
  let rahmen = 0;
  const spaeter = () => {
    cancelAnimationFrame(rahmen);
    rahmen = requestAnimationFrame(ordne);
  };
  const zoomEnde = () => (tz.zoom = m.getZoom());
  m.on('moveend', spaeter);
  m.on('zoomend', zoomEnde);
  zoomEnde();

  // --- Antippen ------------------------------------------------------------------------------------------

  const umTipp = (p: { x: number; y: number }, r: number): [PointLike, PointLike] => [
    [p.x - r, p.y - r],
    [p.x + r, p.y + r],
  ];

  function nimmObjekt(e: MapMouseEvent): void {
    if (m.getZoom() < MIN_ZOOM - 0.01) return toast(`Näher zoomen: Objekte sind ab Stufe ${MIN_ZOOM} antippbar.`);
    const treffer = m.queryRenderedFeatures(umTipp(e.point, 12), { layers: VT_TREFFER }).map((f) => ({ sourceLayer: f.sourceLayer ?? '', properties: f.properties, f }));
    const w = waehleTreffer(treffer);
    const ziel = tz.verlaengern ? store.taufen.get(tz.verlaengern) : undefined;
    if (!w) return toast(ziel ? 'Hier ist kein Abschnitt zum Anhängen.' : 'Hier ist nichts taufbar – fehlt das Objekt, «Fläche zeichnen».');
    const tipp: XY = welt(e.lngLat);
    const sl = w.k.sourceLayer;
    const objektart = `${sl}/${w.k.properties.class ?? ''}`;
    if (istLinienLayer(sl)) {
      const l = abschnitt(linienStuecke(m, sl), tipp, 14 * weltJePixel(m.getZoom()));
      if (!l) return toast('Abschnitt nicht gefunden – näher zoomen.');
      if (ziel) {
        if (ziel.familie !== w.familie) return toast(`«${ziel.name}» ist ${FAMILIE_LABEL[ziel.familie]}: nur solche Abschnitte anhängen.`);
        return void verlaengere(ziel.id, l);
      }
      tz.wahl = { familie: w.familie, geometrie: alsGeometrie({ linien: [l] }, MAX_TAUF_PUNKTE), quelle: 'vt', objektart, vorlage: (w.k.properties.name as string) || undefined, familieWaehlbar: false };
    } else {
      if (ziel) return toast('Beim Verlängern nur Strassen- bzw. Gewässerabschnitte antippen – «Fertig» beendet es.');
      const stuecke = flaechenStuecke(m, sl, w.k.properties.class);
      let polygone = vereineFlaeche(stuecke, tipp);
      // Tipp knapp neben dem Umriss (Trefferbox): mit einem Punkt im getippten Stück nochmals
      if (!polygone.length && w.k.f.geometry.type === 'Polygon') polygone = vereineFlaeche(stuecke, welt({ lng: w.k.f.geometry.coordinates[0][0][0], lat: w.k.f.geometry.coordinates[0][0][1] }));
      if (!polygone.length) return toast('Umriss nicht gefunden – näher zoomen.');
      if (w.familie === 'gebaeude') {
        if (!sammleTeil(polygone, tipp, objektart)) return schliesse('taufe');
      } else tz.wahl = { familie: w.familie, geometrie: alsGeometrie({ polygone }, MAX_TAUF_PUNKTE), quelle: 'vt', objektart, familieWaehlbar: false };
    }
    oeffne('taufe');
  }

  function klick(e: MapMouseEvent) {
    if (ui.punktWahl || (!tz.modus && !tz.umfaerben)) return;
    if (tz.umfaerben) {
      const t = store.taufen.get(tz.umfaerben);
      const k = m.queryRenderedFeatures(umTipp(e.point, 6), { layers: ['taufe-kanten-treffer'] })[0];
      if (t && k) faerbeUm(t, Number(k.properties.kante));
      return;
    }
    if (tz.zeichnen) {
      tz.zeichnen = [...tz.zeichnen, [e.lngLat.lng, e.lngLat.lat]];
      return;
    }
    if (!tz.verlaengern) {
      const bestehend = m.queryRenderedFeatures(umTipp(e.point, 4), { layers: ['taufe-fuellung', 'taufe-linie-treffer'] })[0];
      if (bestehend) {
        tz.wahl = null;
        return waehle('taufe', String(bestehend.properties.id));
      }
    }
    nimmObjekt(e);
  }
  m.on('click', klick);

  function taste(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || ui.radial || ui.koordinate || ui.punktWahl) return;
    if (tz.zeichnen) tz.zeichnen = null;
    else if (tz.umfaerben) tz.umfaerben = null;
    else if (tz.modus && !ui.panels.length) beendeModus();
    else return;
    e.preventDefault();
  }
  addEventListener('keydown', taste, true);

  onDestroy(() => {
    m.off('click', klick);
    m.off('moveend', spaeter);
    m.off('zoomend', zoomEnde);
    removeEventListener('keydown', taste, true);
    cancelAnimationFrame(rahmen);
    for (const l of labels.values()) l.marker.remove();
    labels.clear();
    beendeModus();
    tz.umfaerben = null;
    if (istOffen('taufe')) schliesse('taufe');
    document.body.classList.remove('taufmodus');
    m.doubleClickZoom.enable();
    if (!m.getStyle()) return;
    for (const l of [...layer, ...VT_LAYER]) if (m.getLayer(l.id)) m.removeLayer(l.id);
    for (const q of [Q, HILFE, KANTEN, VT]) if (m.getSource(q)) m.removeSource(q);
  });
</script>

<Modus />

<style>
  :global(.tf-anker) {
    width: 0;
    height: 0;
    pointer-events: none;
  }
  :global(.tf-fuehrung) {
    position: absolute;
    overflow: visible;
    width: 1px;
    height: 1px;
  }
  :global(.tf-fuehrung line) {
    stroke: #fff;
    stroke-width: 1.5;
    filter: drop-shadow(0 0 1px #161b1f) drop-shadow(0 0 1px #161b1f);
  }
  :global(.tf-label) {
    position: absolute;
    left: 0;
    top: 0;
    white-space: nowrap;
    font-size: calc(12px * var(--karte));
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: 0.01em;
  }
  /* Gebäude: Namenskästchen weiss, Zielobjekt gelb (Juans SpotMap) */
  :global(.tf-label.tf-gebaeude) {
    padding: 1px 5px;
    background: #fff;
    color: #111;
    border: 1px solid #161b1f;
    border-radius: 2px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
  }
  :global(.tf-label.tf-ziel) {
    background: #ffeb3b;
    color: #111;
    border: 1.5px solid #161b1f;
    padding: 1px 5px;
    border-radius: 2px;
    box-shadow: 0 0 0 2px rgb(255 235 59 / 0.45), 0 1px 3px rgb(0 0 0 / 0.5);
  }
  /* Strassen: rote Schrift entlang der Achse mit hellem Rand */
  :global(.tf-label.tf-strasse:not(.tf-ziel)) {
    color: #e53935;
    font-size: calc(13px * var(--karte));
    text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff;
  }
  :global(.tf-label.tf-gewaesser:not(.tf-ziel)) {
    color: #0277bd;
    font-style: italic;
    text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff;
  }
  :global(.tf-label.tf-wald:not(.tf-ziel)) {
    padding: 1px 5px;
    color: #fff;
    background: rgb(93 58 26 / 0.88);
    border-radius: 3px;
  }
  :global(.tf-label.tf-flaeche:not(.tf-ziel)) {
    padding: 1px 5px;
    color: #3e3000;
    background: rgb(255 243 196 / 0.88);
    border: 1px dashed #8a6d00;
    border-radius: 3px;
  }
</style>
