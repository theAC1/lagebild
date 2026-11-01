<script lang="ts">
  import { Marker, type GeoJSONSource } from 'maplibre-gl';
  import { onDestroy, untrack } from 'svelte';
  import { getMap, markiereZiel } from '../lib/map.ts';
  import { kreis } from '../lib/coords.ts';
  import { groesse } from '../lib/groesse.svelte.ts';
  import { setzeEinstellung, statusDef, store } from '../lib/store.svelte.ts';
  import { teamFarbe } from '../lib/team.ts';
  import { STANDARD_SIDC, teilnehmerElement } from '../lib/symbol.ts';
  import { ui } from '../lib/ui.svelte.ts';

  const m = getMap();
  const QUELLE = 'ich-genauigkeit';
  const leer: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  m.addSource(QUELLE, { type: 'geojson', data: leer });
  m.addLayer({ id: `${QUELLE}-flaeche`, type: 'fill', source: QUELLE, paint: { 'fill-color': '#8fbcd4', 'fill-opacity': 0.14 } });
  m.addLayer({ id: `${QUELLE}-rand`, type: 'line', source: QUELLE, paint: { 'line-color': '#8fbcd4', 'line-width': 1.5, 'line-opacity': 0.7 } });

  let marker: Marker | null = null;
  let schluessel = '';
  let zentriert = false; // erster Fix nach dem Anmelden: Karte einmal auf mich (sonst startet sie bei der ganzen Schweiz)

  $effect(() => {
    const p = store.meinePos;
    (m.getSource(QUELLE) as GeoJSONSource).setData(p?.ce ? kreis(p, p.ce) : leer);
    if (!p) {
      marker?.remove();
      marker = null;
      return;
    }
    const ich = store.ichSelbst;
    const sidc = ich?.sidc ?? STANDARD_SIDC;
    const farbe = ich ? (statusDef(ich.status)?.farbe ?? null) : null;
    const richtung = p.kurs != null && (p.tempo ?? 0) > 0.5 ? Math.round(p.kurs / 10) * 10 : null;
    const emcon = ich ? !ich.sendetPos : false;
    const ohneGps = store.gpsFehler !== null;
    const team = ich ? teamFarbe(ich.einheit) : null;
    const k = [sidc, ich?.rufname, team, farbe, richtung, emcon, ohneGps, groesse.karte].join('|');
    if (k !== schluessel || !marker) {
      marker?.remove();
      const { element, offset } = teilnehmerElement(sidc, {
        rufname: ich?.rufname ?? 'Ich',
        size: 26 * groesse.karte,
        farbe,
        team,
        richtung,
        klassen: ['ich', ...(emcon ? ['emcon'] : []), ...(ohneGps ? ['kein-gps'] : [])],
      });
      markiereZiel(element, { art: 'ich', id: ich?.id ?? 'ich' });
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', 'Eigenes Symbol: Koordinatenzeile ein/aus');
      // Tippen aufs eigene Symbol schaltet die Koordinatenzeile (gemerkt)
      element.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setzeEinstellung('koordLeiste', !store.einstellungen.koordLeiste);
      });
      marker = new Marker({ element, offset }).setLngLat([p.lon, p.lat]).addTo(m);
      schluessel = k;
    } else marker.setLngLat([p.lon, p.lat]);
    // nur bei neuer Position nachführen; das Einschalten selbst zentriert App.folgen()
    if (!zentriert) {
      zentriert = true;
      // App-Start im Menü (Juan 01.11.): die Karte zeigt die Fähnchen, «Zurück zur Mission» fliegt zum gemerkten Ausschnitt
      if (!untrack(() => ui.menue)) m.jumpTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 14) });
    } else if (untrack(() => ui.folgen)) m.easeTo({ center: [p.lon, p.lat], duration: 600 });
  });

  onDestroy(() => {
    marker?.remove();
    if (!m.getStyle()) return;
    m.removeLayer(`${QUELLE}-flaeche`);
    m.removeLayer(`${QUELLE}-rand`);
    m.removeSource(QUELLE);
  });
</script>
