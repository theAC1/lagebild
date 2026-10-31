import { OHNE_BEOBACHTER } from '../../../../shared/regeln/rollen.ts';
import type { Feature } from '../registry.ts';
import Detail from './Detail.svelte';
import { IKON_ZEICHNEN } from './ikonen.ts';
import Panel from './Panel.svelte';
import ZeichnenLayer from './ZeichnenLayer.svelte';

const feature: Feature = {
  id: 'zeichnen',
  label: 'Zeichnen',
  icon: IKON_ZEICHNEN,
  Panel,
  MapLayer: ZeichnenLayer,
  Detail,
  detailArt: 'zeichnung',
  phasen: ['ap', 'lv'],
  rollen: OHNE_BEOBACHTER,
};

export default feature;
