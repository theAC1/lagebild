import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import BloodhoundLayer from './BloodhoundLayer.svelte';

// Kein eigenes Panel: der Tab «Aufträge» der Leitung (leitung/LeitungPanel) bindet Auftraege.svelte ein.
const feature: Feature = {
  id: 'bloodhound',
  label: 'Bloodhound',
  icon: ikon('<circle cx="12" cy="12" r="8.5"/><path d="M12 5.5l2.5 6.5-2.5-1.2L9.5 12z" fill="currentColor"/>'),
  MapLayer: BloodhoundLayer,
};

export default feature;
