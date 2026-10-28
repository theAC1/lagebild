// Testhelfer: echter Server auf Zufallsport, REST- und WS-Client.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import type { Beigetreten, ClientMsg, LageErstellt, ServerMsg } from '../../shared/protocol.ts';
import { starteServer } from '../src/http.ts';

export const PASSWORT = 'test-passwort';
export const SIDC = '10031000001211000000';

export async function testServer() {
  const dataDir = mkdtempSync(join(tmpdir(), 'lagebild-test-'));
  const app = await starteServer({ port: 0, host: '127.0.0.1', dataDir, erstellPasswort: PASSWORT, clientDir: join(dataDir, 'kein-client') });
  let ip = 0;
  const api = (pfad: string, init: RequestInit & { token?: string; ip?: string } = {}) =>
    fetch(app.url + pfad, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': init.ip ?? `10.0.0.${++ip}`,
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
  async function lage(name = 'Übung'): Promise<LageErstellt> {
    const r = await api('/api/lage', { method: 'POST', body: JSON.stringify({ name, erstellPasswort: PASSWORT }) });
    if (r.status !== 201) throw new Error(`lage ${r.status}`);
    return r.json();
  }
  async function beitreten(code: string, rufname: string, einheit = 'Zug 1'): Promise<Beigetreten> {
    const r = await api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code, rufname, einheit, funktion: 'Sdt', sidc: SIDC }) });
    if (r.status !== 201) throw new Error(`beitreten ${r.status}`);
    return r.json();
  }
  return {
    ...app,
    api,
    lage,
    beitreten,
    async ende() {
      await app.schliessen();
      rmSync(dataDir, { recursive: true, force: true });
    },
    dataDir,
  };
}

export type Client = Awaited<ReturnType<typeof verbinde>>;

/** Verbindet, sendet hallo und wartet auf den Snapshot. */
export async function verbinde(url: string, token: string) {
  const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
  const empfangen: ServerMsg[] = [];
  const wartende = new Set<() => void>();
  ws.on('message', (d) => {
    empfangen.push(JSON.parse(d.toString()));
    for (const w of wartende) w();
  });
  const geschlossen = new Promise<number>((ok) => ws.on('close', (code) => ok(code)));
  await new Promise((ok, nok) => ws.once('open', ok).once('error', nok));
  const senden = (m: ClientMsg | Record<string, unknown>) => ws.send(JSON.stringify(m));

  /** Wartet auf die erste (noch nicht konsumierte) Nachricht, die passt. */
  function warte<T extends ServerMsg['typ']>(typ: T, pruef: (m: Extract<ServerMsg, { typ: T }>) => boolean = () => true, ms = 2000) {
    return new Promise<Extract<ServerMsg, { typ: T }>>((ok, nok) => {
      const suche = () => {
        const i = empfangen.findIndex((m) => m.typ === typ && pruef(m as Extract<ServerMsg, { typ: T }>));
        if (i < 0) return;
        wartende.delete(suche);
        clearTimeout(timer);
        ok(empfangen.splice(i, 1)[0] as Extract<ServerMsg, { typ: T }>);
      };
      const timer = setTimeout(() => {
        wartende.delete(suche);
        nok(new Error(`Timeout: ${typ}; erhalten: ${empfangen.map((m) => m.typ).join(',')}`));
      }, ms);
      wartende.add(suche);
      suche();
    });
  }
  senden({ typ: 'hallo', token });
  const snapshot = await warte('snapshot');
  return { ws, empfangen, senden, warte, snapshot, geschlossen, zu: () => ws.close() };
}

export const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
