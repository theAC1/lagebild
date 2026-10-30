import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ch.arvuna.lagebild',
  appName: 'Lagebild',
  webDir: 'client/dist-app',
  android: {
    // Pflicht für @capacitor-community/background-geolocation: sonst stoppen Updates nach 5 min im Hintergrund
    useLegacyBridge: true,
  },
  backgroundColor: '#161b1f',
};

export default config;
