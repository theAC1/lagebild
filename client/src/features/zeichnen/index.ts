import { OHNE_BEOBACHTER } from '../../../../shared/regeln/rollen.ts';
import type { Feature } from '../registry.ts';
import Austausch from './austausch/Austausch.svelte';
import Detail from './Detail.svelte';
import { IKON_ZEICHNEN } from './ikonen.ts';
import Panel from './Panel.svelte';
import ZeichnenLayer from './ZeichnenLayer.svelte';
import { ebenenListe, setzeSichtbar, zn } from './zustand.svelte.ts';

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
  // Juan 01.11.: alle Ebenen der Mission für alle sichtbar und ein-/ausschaltbar (pro Gerät), mit Export – auch Beobachter und AN
  ebenen: () => ebenenListe().map((e) => ({ label: e.name, an: !zn.ausgeblendet.has(e.id), schalten: () => setzeSichtbar(e.id, zn.ausgeblendet.has(e.id)) })),
  EbenenZusatz: Austausch,
};

export default feature;
