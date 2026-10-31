<script lang="ts">
  // Karten-Teil und Steuerung von Bloodhound: Linie(n), Radial-Aktionen (Symbole und leere Karte), Auftrags-Annahme,
  // Ziel-weg- und Erreicht-Erkennung. Die Anzeige selbst ist Leiste.svelte.
  import type { GeoJSONSource } from 'maplibre-gl';
  import { onDestroy, untrack } from 'svelte';
  import { getMap, registriereRadialAktion } from '../../lib/map.ts';
  import { beiNachricht, darfAuftrag, store } from '../../lib/store.svelte.ts';
  import { ikon, oeffne, toast } from '../../lib/ui.svelte.ts';
  import Leiste from './Leiste.svelte';
  import { ErreichtWaechter, istErsetzt, STUFE_FARBE } from './logik.ts';
  import { bh, endeLokal, fuettere, ladeFuer, meldeErreicht, messe, rufname, starte, tempoVon, uebernimm, vergissTempo, zielDa, zielName, zielPunkt } from './zustand.svelte.ts';

  const m = getMap();
  const QUELLE = 'bloodhound';
  const LEITUNG = 'bloodhound-leitung';
  const leer = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
  m.addSource(QUELLE, { type: 'geojson', data: leer });
  m.addSource(LEITUNG, { type: 'geojson', data: leer });
  m.addLayer({ id: `${LEITUNG}-linie`, type: 'line', source: LEITUNG, paint: { 'line-color': '#9db4c4', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.9 } });
  m.addLayer({ id: `${QUELLE}-rand`, type: 'line', source: QUELLE, paint: { 'line-color': '#161b1f', 'line-width': 7, 'line-opacity': 0.6 } });
  m.addLayer({ id: `${QUELLE}-linie`, type: 'line', source: QUELLE, paint: { 'line-color': ['get', 'farbe'], 'line-width': 3.5 } });

  const abmelden = [
    registriereRadialAktion({
      fuer: ['teilnehmer', 'marker', 'sichtung'],
      label: 'Bloodhound',
      icon: ikon('<circle cx="12" cy="12" r="8.5"/><path d="M12 5.5l2.5 6.5-2.5-1.2L9.5 12z" fill="currentColor"/><path d="M12 18.5v-4"/>'),
      aktion: (z) => starte({ art: z.art as 'teilnehmer' | 'marker' | 'sichtung', id: z.id }),
      phasen: ['lv'],
      sichtbar: (z) => z.art !== 'teilnehmer' || z.id !== store.ich,
    }),
    registriereRadialAktion({
      fuer: 'teilnehmer',
      label: 'BH-Auftrag', // kurz: Ring-Beschriftungen werden bei ~10 Zeichen gekürzt
      icon: ikon('<path d="M5 20V4M5 5h11l-2 3.5 2 3.5H5"/>'),
      aktion: (z) => oeffne('leitung', { tab: 'auftraege', an: z.id }),
      phasen: ['lv'],
      sichtbar: (z) => darfAuftrag(z.id) && z.id !== store.ich && store.teilnehmer.get(z.id)?.rolle !== 'beobachter',
    }),
    registriereRadialAktion({
      fuer: 'punkt',
      label: 'Bloodhound', // wie auf Symbolen; «Bloodhound hierhin» passt nicht in den Ring
      icon: ikon('<circle cx="12" cy="12" r="8.5"/><path d="M12 5.5l2.5 6.5-2.5-1.2L9.5 12z" fill="currentColor"/><path d="M12 18.5v-4"/>'),
      aktion: (z) => starte({ art: 'punkt', punkt: { lat: z.punkt!.lat, lon: z.punkt!.lon } }),
      phasen: ['lv'],
    }),
  ];

  const bereit = $derived(store.verbindung === 'verbunden' && store.lage !== null);

  $effect(() => ladeFuer(store.lage?.id ?? null));

  // Tempo: eigene Live-Position, für die Leitung die Positionen der Empfänger offener Aufträge
  $effect(() => {
    const p = store.meinePos;
    if (p) untrack(() => fuettere('ich', p));
  });
  $effect(() => {
    for (const a of store.bloodhound.values()) {
      if (!darfAuftrag(a.an)) continue;
      const p = store.teilnehmer.get(a.an)?.pos;
      if (p) untrack(() => fuettere(a.an, p));
    }
  });

  // Auftrag der Leitung an mich: automatisch übernehmen; verschwindet er (z.B. Aufhebung während ich offline war), lokal enden
  $effect(() => {
    if (store.wiedergabeZeit !== null) return; // Wiedergabe (AN): frühere Aufträge nur als Linie
    const mein = [...store.bloodhound.values()].find((a) => a.an === store.ich && a.ende === null);
    const aktiv = untrack(() => bh.aktiv);
    untrack(() => {
      if (mein) {
        if (aktiv?.auftragId !== mein.id) uebernimm(mein);
      } else if (aktiv?.auftragId && bereit) endeLokal('Auftrag von Leitung beendet');
    });
  });

  // Ziel verschwindet: Hinweis und Ende
  $effect(() => {
    const a = bh.aktiv;
    if (!a || !bereit || zielDa(a.ziel)) return;
    untrack(() => endeLokal('Ziel nicht mehr vorhanden – Bloodhound beendet'));
  });

  // Erreicht (≤ 25 m): Auftrag automatisch melden, einmalig
  const waechter = new ErreichtWaechter();
  $effect(() => {
    const a = bh.aktiv;
    if (!a) return waechter.vergiss('persoenlich');
    const dist = messe(store.meinePos, a.ziel, null)?.dist ?? null;
    untrack(() => {
      if (a.auftragId) {
        const id = a.auftragId;
        if (waechter.pruefe(id, dist, false) && meldeErreicht(id)) waechter.pruefe(id, dist);
      } else if (waechter.pruefe('persoenlich', dist)) toast(`Ziel erreicht: ${zielName(a.ziel)}`);
    });
  });

  // Ende eines Auftrags: Empfänger sieht den Grund, die Leitung bekommt einen Toast
  const stopp = beiNachricht((msg) => {
    if (msg.typ !== 'bloodhound') return;
    const a = msg.auftrag;
    const ende = a.ende;
    if (ende === null) return;
    // Aufheben und Ersetzen sind für den Server dasselbe: die Meldung erst zeigen, wenn kein neuer Auftrag nachkommt
    const spaeter = (text: string) => (ende === 'aufgehoben' ? void setTimeout(() => !istErsetzt(store.bloodhound.values(), a) && toast(text), 600) : toast(text));
    if (a.an === store.ich && bh.aktiv?.auftragId === a.id) {
      const text = { aufgehoben: 'Auftrag von Leitung aufgehoben', beendet: undefined, erreicht: 'Ziel erreicht – Auftrag abgeschlossen' }[ende];
      endeLokal();
      if (text) spaeter(text);
    } else if (darfAuftrag(a.an)) {
      const wer = rufname(a.an);
      spaeter({ aufgehoben: `Auftrag an ${wer} aufgehoben`, beendet: `${wer} hat Bloodhound beendet`, erreicht: `${wer} hat das Ziel erreicht` }[ende]);
    }
  });

  // Linien
  $effect(() => {
    const feature = (von: { lat: number; lon: number }, bis: { lat: number; lon: number }, farbe?: string): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { farbe },
      geometry: { type: 'LineString', coordinates: [[von.lon, von.lat], [bis.lon, bis.lat]] },
    });
    const eigene: GeoJSON.Feature[] = [];
    const a = bh.aktiv;
    const ziel = a ? zielPunkt(a.ziel) : null;
    if (a && ziel && store.meinePos) {
      const ms = messe(store.meinePos, a.ziel, tempoVon('ich'));
      eigene.push(feature(store.meinePos, ziel, STUFE_FARBE[ms?.stufe ?? 'neutral']));
    }
    const leitung: GeoJSON.Feature[] = [];
    for (const au of store.bloodhound.values()) {
      const von = store.teilnehmer.get(au.an)?.pos;
      const bis = zielPunkt(au.ziel);
      if (von && bis && au.an !== store.ich) leitung.push(feature(von, bis)); // fremde Aufträge: dünn gestrichelt, für alle
    }
    (m.getSource(QUELLE) as GeoJSONSource).setData({ type: 'FeatureCollection', features: eigene });
    (m.getSource(LEITUNG) as GeoJSONSource).setData({ type: 'FeatureCollection', features: leitung });
  });

  // Tempo der Empfänger vergessen, sobald ihr Auftrag weg ist
  let bekannt = new Set<string>();
  $effect(() => {
    const jetzt = new Set([...store.bloodhound.values()].map((x) => x.an));
    for (const id of bekannt) if (!jetzt.has(id)) untrack(() => vergissTempo(id));
    bekannt = jetzt;
  });

  onDestroy(() => {
    stopp();
    for (const ab of abmelden) ab();
    if (!m.getStyle()) return;
    for (const l of [`${QUELLE}-linie`, `${QUELLE}-rand`, `${LEITUNG}-linie`]) m.removeLayer(l);
    m.removeSource(QUELLE);
    m.removeSource(LEITUNG);
  });
</script>

<Leiste />
