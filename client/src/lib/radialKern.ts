// Kern-Knöpfe des Radial-Menüs. Wird einmal von App importiert; Features melden ihre Knöpfe selbst an.
import { features } from '../features/registry.ts';
import { spuren, zeige } from '../features/spuren/zustand.svelte.ts';
import { folgeMir, folgeTeilnehmer, registriereRadialAktion, type RadialZiel } from './map.ts';
import { send, setzeEinstellung, store } from './store.svelte.ts';
import { ikon, oeffne, toast, ui, waehle } from './ui.svelte.ts';

/** Teilnehmer-ID hinter dem Ziel ('ich' → eigene ID). */
const personVon = (z: RadialZiel): string => (z.art === 'ich' ? (store.ich ?? z.id) : z.id);

/** Details zum Ziel öffnen – auch für den Doppelklick auf ein Symbol. */
export function zeigeDetails(z: RadialZiel): void {
  if (z.art === 'ich' || z.art === 'teilnehmer') waehle('teilnehmer', personVon(z));
  else if (features.some((f) => f.detailArt === z.art)) waehle(z.art, z.id);
}

const darfMarkerAendern = (z: RadialZiel): boolean => {
  const m = store.marker.get(z.id);
  return !!m && (store.istLeitung || m.von === store.ich);
};

registriereRadialAktion({
  fuer: ['teilnehmer', 'ich', 'marker', 'sichtung', 'zeichnung'],
  label: 'Details',
  icon: ikon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  aktion: zeigeDetails,
  sichtbar: (z) => z.art === 'ich' || z.art === 'teilnehmer' || features.some((f) => f.detailArt === z.art),
});

registriereRadialAktion({
  fuer: ['teilnehmer', 'marker', 'sichtung'],
  label: 'R&B',
  icon: ikon('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5l11-11" stroke-dasharray="2 3"/>'),
  aktion: (z) => oeffne('rangebearing', { ziel: { art: z.art, id: z.id } }),
});

registriereRadialAktion({
  fuer: 'ich',
  label: () => (store.einstellungen.koordLeiste ? 'Koord. aus' : 'Koord. ein'),
  icon: ikon('<path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="4"/>'),
  aktion: () => setzeEinstellung('koordLeiste', !store.einstellungen.koordLeiste),
});

registriereRadialAktion({
  fuer: ['teilnehmer', 'ich'],
  label: (z) => ((z.art === 'ich' ? ui.folgen : ui.folgtTeilnehmer === z.id) ? 'Nicht folgen' : 'Folgen'),
  icon: ikon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  aktion: (z) => {
    if (z.art === 'ich') {
      if (ui.folgen) ui.folgen = false;
      else folgeMir();
    } else if (ui.folgtTeilnehmer === z.id) ui.folgtTeilnehmer = null;
    else folgeTeilnehmer(z.id);
  },
  sichtbar: (z) => z.art === 'ich' || !!store.teilnehmer.get(z.id)?.pos,
});

registriereRadialAktion({
  fuer: ['teilnehmer', 'ich'],
  label: (z) => (spuren.sichtbar.has(personVon(z)) ? 'Spur aus' : 'Spur ein'),
  icon: ikon('<path d="M4 20c3-1 4-5 7-6s5 1 9-8" stroke-dasharray="3 3"/><circle cx="20" cy="6" r="1.5"/>'),
  aktion: (z) => {
    const id = personVon(z);
    zeige([id], !spuren.sichtbar.has(id));
  },
});

registriereRadialAktion({
  fuer: 'teilnehmer',
  label: 'Chat',
  icon: ikon('<path d="M4 5h16v11H9l-5 4z"/>'),
  aktion: (z) => oeffne('chat', { an: { art: 'person', id: z.id } }),
});

registriereRadialAktion({
  fuer: 'ich',
  label: 'Marker hier',
  icon: ikon('<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><path d="M12 7v6M9 10h6"/>'),
  aktion: () => store.meinePos && oeffne('marker', { neu: { lat: store.meinePos.lat, lon: store.meinePos.lon } }),
  sichtbar: () => !!store.meinePos,
});

registriereRadialAktion({
  fuer: 'marker',
  label: 'Bearbeiten',
  icon: ikon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  aktion: (z) => oeffne('marker', { bearbeiten: z.id }),
  sichtbar: darfMarkerAendern,
});

registriereRadialAktion({
  fuer: 'marker',
  label: 'Löschen',
  icon: ikon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  aktion: (z) => {
    const m = store.marker.get(z.id);
    if (!m || !confirm(`Marker «${m.bezeichnung || 'ohne Bezeichnung'}» endgültig löschen?`)) return;
    if (!send({ typ: 'marker.loeschen', id: z.id })) return toast('Keine Verbindung – Marker nicht gelöscht.');
    toast('Marker gelöscht');
  },
  sichtbar: darfMarkerAendern,
});

// Leere Karte (Ziel 'punkt'): Koordinate kommt vom Kern, Marker/Sichtung/R&B/Bloodhound melden die Features an
registriereRadialAktion({
  fuer: 'punkt',
  label: 'Koordinate',
  icon: ikon('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  aktion: (z) => (ui.koordinate = z.punkt ?? null),
});
