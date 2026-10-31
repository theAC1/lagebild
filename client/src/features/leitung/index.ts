import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import LeitungPanel from './LeitungPanel.svelte';

const feature: Feature = {
  id: 'leitung',
  label: 'Leitung',
  icon: ikon('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  Panel: LeitungPanel,
  rollen: ['leitung', 'gruppenfuehrer'], // Gruppenführer: nur Aufträge und Alarme
};

export default feature;
