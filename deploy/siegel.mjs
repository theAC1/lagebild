// Siegel der Live-Update-Stände (von deploy/web.sh aufgerufen): ECDSA P-256 mit SHA-256 über siegelNachricht() aus
// client/src/lib/webUpdate.ts, Signatur IEEE P1363 (r||s, 64 Byte) als base64url. Der private Schlüssel liegt nur auf dem
// Host neben dem Keystore (nie im Git, nie auf LXC 124); die App prüft mit dem öffentlichen in updateSchluessel.ts.
//   node deploy/siegel.mjs schluessel  → Schlüssel einmalig erzeugen (falls fehlt), öffentlichen als JWK ausgeben
//   node deploy/siegel.mjs <webCode> <webName> <minNativeCode> <stufe> <sha256>  → gesiegeltes web.json ausgeben
//     (Protokoll aus shared/protocol.ts; so steht in web.json genau, was signiert ist)
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PFAD = process.env.SIEGEL_SCHLUESSEL ?? '/root/.config/lagebild/update-signatur.pem';
const fehler = (text) => (console.error(text), process.exit(1));
const args = process.argv.slice(2);

if (args[0] === 'schluessel') {
  if (!existsSync(PFAD)) {
    mkdirSync(dirname(PFAD), { recursive: true, mode: 0o700 });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(PFAD, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    console.error(`Neuer Siegel-Schlüssel: ${PFAD} (sichern!)`);
  }
  console.log(JSON.stringify(createPublicKey(createPrivateKey(readFileSync(PFAD))).export({ format: 'jwk' })));
  process.exit(0);
}

const [webCode, webName, minNativeCode, stufe, sha256] = args;
if (args.length !== 5 || !/^\d+$/.test(webCode) || !/^[\w.-]{1,32}$/.test(webName) || !/^\d+$/.test(minNativeCode) || !/^[0-9a-f]{64}$/.test(sha256)) {
  fehler('Aufruf: node deploy/siegel.mjs <webCode> <webName> <minNativeCode> <stufe> <sha256>');
}
if (!existsSync(PFAD)) fehler(`Siegel-Schlüssel ${PFAD} fehlt (README Betrieb)`);

const { STUFEN, liesWebManifest, siegelNachricht } = await import('../client/src/lib/webUpdate.ts');
const { UPDATE_SCHLUESSEL } = await import('../client/src/lib/updateSchluessel.ts');
const { PROTOKOLL_VERSION } = await import('../shared/protocol.ts');
if (!STUFEN.includes(stufe)) fehler(`STUFE muss ${STUFEN.join(' | ')} sein`);
const m = { webCode: Number(webCode), webName, minNativeCode: Number(minNativeCode), url: `/app/web-${webCode}.zip`, sha256, stufe, protokoll: PROTOKOLL_VERSION };
const nachricht = Buffer.from(siegelNachricht(m));
const sig = sign('sha256', nachricht, { key: createPrivateKey(readFileSync(PFAD)), dsaEncoding: 'ieee-p1363' });
// Gegenprobe mit dem Schlüssel in der App: ein falscher Schlüssel würde Stände ausliefern, die keine App annimmt
const pub = createPublicKey({ key: UPDATE_SCHLUESSEL, format: 'jwk' });
if (!verify('sha256', nachricht, { key: pub, dsaEncoding: 'ieee-p1363' }, sig)) {
  fehler(`${PFAD} passt nicht zum öffentlichen Schlüssel in client/src/lib/updateSchluessel.ts`);
}
const json = { ...m, sig: sig.toString('base64url') };
if (!liesWebManifest(json)) fehler('web.json wäre für die App ungültig');
console.log(JSON.stringify(json));
