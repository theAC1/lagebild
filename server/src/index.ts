// Start: Env prüfen, Server starten, sauber beenden.
import { resolve } from 'node:path';
import { starteServer } from './http.ts';
import { log } from './sicherheit.ts';

const erstellPasswort = process.env.LAGE_ERSTELL_PASSWORT;
if (!erstellPasswort) {
  log('error', 'LAGE_ERSTELL_PASSWORT fehlt, Start abgebrochen');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  log('error', 'PORT ungültig', { port: process.env.PORT });
  process.exit(1);
}

const app = await starteServer({
  port,
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  erstellPasswort,
  clientDir: resolve(import.meta.dirname, '../../client/dist'),
});
log('info', 'gestartet', { port: Number(new URL(app.url).port) });

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    log('info', 'beende', { signal });
    app.schliessen().then(() => process.exit(0));
  });
