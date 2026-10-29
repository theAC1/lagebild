import type { Feature } from '../registry.ts';
import { ikon } from '../../lib/ui.svelte.ts';
import AlarmLayer from './AlarmLayer.svelte';
import Detail from './Detail.svelte';
import Halten from './Halten.svelte';
import Panel from './Panel.svelte';
import Toolbar from './Toolbar.svelte';

const feature: Feature = {
  id: 'alarm',
  label: 'Alarm',
  icon: ikon('<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.5v.5"/>'),
  Panel,
  MapLayer: AlarmLayer,
  Kopf: Toolbar,
  // Daumen-Ränder: gedrückt halten statt Panel (Klassisch: Knopf in der Kopfleiste → Panel)
  haupt: { Knopf: Halten },
  Detail,
  detailArt: 'alarm',
  // kein badge: der Knopf steht nicht in der Werkzeugleiste, offene Alarme zeigt das Banner
};

export default feature;
