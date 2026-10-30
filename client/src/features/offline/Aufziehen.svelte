<script lang="ts">
  // Rechteck auf der Karte aufziehen (Finger oder Maus), Grösse und MB live, dann bestätigen und laden.
  import type { GeoJSONSource, LngLat, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { getMap } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { oeffne, ui } from '../../lib/ui.svelte.ts';
  import { anzahl, bereiche, formatBytes, masseKm, OFFLINE_KARTEN, schaetzeBytes, type Bbox, type OfflineKarte } from './kacheln.ts';
  import { aktualisiereSpeicher, neuesGebiet, offline } from './zustand.svelte.ts';

  const WLAN_AB = 500 * 1024 ** 2;
  const QUELLE = 'offline-auswahl';
  const m = getMap();

  let bbox = $state<Bbox | null>(offline.vorschlag);
  let karten = $state<OfflineKarte[]>(['farbe']);
  let voll = $state(false); // Luftbild bis Max-Zoom statt LUFTBILD_STANDARD_Z
  let bestaetigen = $state(false);
  let start: LngLat | null = null;

  const bs = $derived(bbox ? bereiche({ bbox, karten, voll }) : []);
  const bytes = $derived(schaetzeBytes(bs));
  const km = $derived(bbox ? masseKm(bbox) : null);
  const frei = $derived(offline.speicher?.frei ?? null);
  const zuWenig = $derived(frei !== null && bytes > frei);
  const fmtKm = (n: number) => n.toLocaleString('de-CH', { maximumFractionDigits: n < 10 ? 1 : 0 });

  void aktualisiereSpeicher();
  if (offline.vorschlag) {
    const [w, s, e, n] = offline.vorschlag;
    m.fitBounds([[w, s], [e, n]], { padding: 60, animate: false });
    offline.vorschlag = null;
  }

  const flaeche = (b: Bbox | null): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: b
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }]
      : [],
  });

  m.addSource(QUELLE, { type: 'geojson', data: flaeche(null) });
  m.addLayer({ id: `${QUELLE}-flaeche`, type: 'fill', source: QUELLE, paint: { 'fill-color': '#ff9f1c', 'fill-opacity': 0.15 } });
  m.addLayer({ id: `${QUELLE}-rand`, type: 'line', source: QUELLE, paint: { 'line-color': '#ff9f1c', 'line-width': 3 } });
  $effect(() => void (m.getSource(QUELLE) as GeoJSONSource | undefined)?.setData(flaeche(bbox)));

  const aufspannen = (a: LngLat, b: LngLat) =>
    (bbox = [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]);

  // Ein Finger bzw. linke Maustaste zieht auf; zwei Finger und Mausrad zoomen weiter (dragPan ist aus)
  const runter = (e: MapMouseEvent | MapTouchEvent) => {
    if (bestaetigen) return;
    if ('points' in e ? e.points.length !== 1 : e.originalEvent.button !== 0) return (start = null);
    start = e.lngLat;
  };
  const zieht = (e: MapMouseEvent | MapTouchEvent) => {
    if (!start) return;
    if ('points' in e && e.points.length !== 1) return (start = null);
    ui.koordinate = null; // Koordinaten-Karte des Langdrucks nicht über dem Aufziehen
    ui.radial = null;
    aufspannen(start, e.lngLat);
  };
  const los = () => (start = null);
  m.dragPan.disable();
  m.on('mousedown', runter);
  m.on('touchstart', runter);
  m.on('mousemove', zieht);
  m.on('touchmove', zieht);
  m.on('mouseup', los);
  m.on('touchend', los);
  m.getCanvas().style.cursor = 'crosshair';

  onDestroy(() => {
    m.off('mousedown', runter);
    m.off('touchstart', runter);
    m.off('mousemove', zieht);
    m.off('touchmove', zieht);
    m.off('mouseup', los);
    m.off('touchend', los);
    m.dragPan.enable();
    m.getCanvas().style.cursor = '';
    for (const id of [`${QUELLE}-rand`, `${QUELLE}-flaeche`]) if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource(QUELLE)) m.removeSource(QUELLE);
  });

  function umschalten(k: OfflineKarte) {
    karten = karten.includes(k) ? karten.filter((x) => x !== k) : OFFLINE_KARTEN.map((d) => d.id).filter((id) => id === k || karten.includes(id));
  }

  function ende() {
    offline.aufziehen = false;
    oeffne('offline');
  }

  function laden() {
    if (!bbox || zuWenig) return;
    const datum = new Date().toLocaleDateString('de-CH');
    neuesGebiet(bbox, karten, `${store.lage?.name ?? 'Gebiet'} · ${datum}`, Date.now(), voll && karten.includes('luftbild'));
    ende();
  }
</script>

<div class="leiste" role="dialog" aria-label="Offline-Gebiet aufziehen">
  {#if !bestaetigen}
    <div class="hinweis">
      {#if bbox && km}
        <span class="mono">{fmtKm(km.breite)} × {fmtKm(km.hoehe)} km</span> · ca. <strong>{formatBytes(bytes)}</strong>
        <span class="leise">({anzahl(bs).toLocaleString('de-CH')} Kacheln)</span>
      {:else}
        Rechteck auf der Karte aufziehen (Finger oder Maus)
      {/if}
    </div>
    <div class="chips" role="group" aria-label="Karten">
      {#each OFFLINE_KARTEN as k (k.id)}
        <button aria-pressed={karten.includes(k.id)} onclick={() => umschalten(k.id)}>{k.label}</button>
      {/each}
    </div>
    {#if karten.includes('luftbild')}
      <div class="chips" role="group" aria-label="Luftbild-Detail">
        <button aria-pressed={!voll} onclick={() => (voll = false)}>Luftbild Standard</button>
        <button aria-pressed={voll} onclick={() => (voll = true)}>Volles Detail</button>
      </div>
    {/if}
    <div class="knoepfe">
      <button onclick={ende}>Abbrechen</button>
      <button class="primaer" disabled={!bbox || karten.length === 0} onclick={() => ((bestaetigen = true), void aktualisiereSpeicher())}>Weiter</button>
    </div>
  {:else}
    <div class="hinweis">ca. {formatBytes(bytes)} laden?</div>
    <div class="leise">
      Frei auf dem Gerät: {frei === null ? 'unbekannt' : formatBytes(frei)} · {karten.map((k) => OFFLINE_KARTEN.find((d) => d.id === k)?.label).join(', ')}
    </div>
    {#if zuWenig}
      <p class="warnung gefahr" role="alert">Zu wenig Speicher. Kleineres Gebiet oder weniger Karten wählen.</p>
    {:else if bytes >= WLAN_AB}
      <p class="warnung" role="note">Grosser Download: WLAN empfohlen.</p>
    {/if}
    <div class="knoepfe">
      <button onclick={() => (bestaetigen = false)}>Zurück</button>
      <button class="primaer" disabled={zuWenig} onclick={laden}>Laden</button>
    </div>
  {/if}
</div>

<style>
  .leiste {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 25;
    display: grid;
    gap: 8px;
    padding: 12px 16px calc(12px + var(--safe-bottom));
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
  }
  .hinweis {
    font-weight: 600;
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
    min-height: var(--haupt);
  }
  .warnung {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--warn);
    color: var(--warn);
    font-weight: 600;
  }
  .warnung.gefahr {
    border-color: var(--danger);
    color: var(--danger);
  }
  /* Daumen-Ränder quer: Leiste nur über der Karte, die Ränder (Alarm!) bleiben frei */
  @media (orientation: landscape) {
    :global(:root:has(.daumen)) .leiste {
      left: var(--links);
      right: var(--rechts);
      padding-top: 8px;
    }
  }
</style>
