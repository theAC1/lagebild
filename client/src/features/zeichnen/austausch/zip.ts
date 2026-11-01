// ZIP lesen und schreiben, so weit .milxlyz/.kmz es brauchen: Deflate über die native (De)CompressionStream, keine Abhängigkeit.

const u16 = (d: DataView, o: number): number => d.getUint16(o, true);
const u32 = (d: DataView, o: number): number => d.getUint32(o, true);

function verbinde(teile: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let o = 0;
  for (const t of teile) {
    out.set(t, o);
    o += t.length;
  }
  return out;
}

/** Bytes durch einen (De)Kompressions-Strom; bricht über `max` Bytes ab (ZIP-Bombe). */
async function strom(daten: Uint8Array, s: CompressionStream | DecompressionStream, max = Infinity): Promise<Uint8Array> {
  const leser = new Blob([daten as BlobPart]).stream().pipeThrough(s).getReader();
  const teile: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await leser.cancel();
      throw new Error('Datei entpackt zu gross');
    }
    teile.push(value);
  }
  return verbinde(teile);
}

/** Inhalt der ersten Datei im ZIP mit dieser Endung (z.B. «.milxly»), höchstens `max` Bytes entpackt. */
export async function entpackeEine(zip: Uint8Array, endung: string, max: number): Promise<Uint8Array> {
  try {
    const d = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let e = zip.length - 22; // Ende des Zentralverzeichnisses, von hinten gesucht (Kommentar am Schluss erlaubt)
    while (e >= 0 && u32(d, e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Keine ZIP-Datei');
    for (let i = 0, o = u32(d, e + 16); i < u16(d, e + 10); i++) {
      if (u32(d, o) !== 0x02014b50) throw new Error('ZIP-Datei beschädigt');
      const [flags, methode, groesse, nl] = [u16(d, o + 8), u16(d, o + 10), u32(d, o + 20), u16(d, o + 28)];
      const name = new TextDecoder().decode(zip.subarray(o + 46, o + 46 + nl));
      if (name.toLowerCase().endsWith(endung)) {
        if (flags & 1) throw new Error('Verschlüsselte ZIP-Datei');
        const lokal = u32(d, o + 42);
        const start = lokal + 30 + u16(d, lokal + 26) + u16(d, lokal + 28);
        const roh = zip.subarray(start, start + groesse);
        if (methode === 8) return await strom(roh, new DecompressionStream('deflate-raw'), max);
        if (methode === 0 && roh.length <= max) return roh;
        throw new Error(methode === 0 ? 'Datei entpackt zu gross' : `ZIP-Methode ${methode} nicht unterstützt`);
      }
      o += 46 + nl + u16(d, o + 30) + u16(d, o + 32);
    }
    throw new Error(`Keine ${endung}-Datei im ZIP`);
  } catch (e) {
    throw e instanceof RangeError ? new Error('ZIP-Datei beschädigt') : e;
  }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(b: Uint8Array): number {
  let c = ~0;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** Little-Endian-Felder [Wert, Bytes]. */
function felder(...f: [number, 2 | 4][]): Uint8Array {
  const b = new Uint8Array(f.reduce((n, [, w]) => n + w, 0));
  const d = new DataView(b.buffer);
  let o = 0;
  for (const [v, w] of f) {
    if (w === 2) d.setUint16(o, v, true);
    else d.setUint32(o, v, true);
    o += w;
  }
  return b;
}

/** ZIP mit Deflate; Namen in UTF-8 (Flag 11). */
export async function packe(dateien: { name: string; daten: Uint8Array }[], jetzt = new Date()): Promise<Uint8Array> {
  const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | (jetzt.getSeconds() >> 1);
  const datum = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
  const teile: Uint8Array[] = [];
  const zentral: Uint8Array[] = [];
  let o = 0;
  for (const f of dateien) {
    const name = new TextEncoder().encode(f.name);
    const roh = await strom(f.daten, new CompressionStream('deflate-raw'));
    const gemeinsam: [number, 2 | 4][] = [[20, 2], [0x0800, 2], [8, 2], [zeit, 2], [datum, 2], [crc32(f.daten), 4], [roh.length, 4], [f.daten.length, 4], [name.length, 2], [0, 2]];
    teile.push(felder([0x04034b50, 4], ...gemeinsam), name, roh);
    zentral.push(felder([0x02014b50, 4], [20, 2], ...gemeinsam, [0, 2], [0, 2], [0, 2], [0, 4], [o, 4]), name);
    o += 30 + name.length + roh.length;
  }
  const groesse = zentral.reduce((n, b) => n + b.length, 0);
  return verbinde([...teile, ...zentral, felder([0x06054b50, 4], [0, 2], [0, 2], [dateien.length, 2], [dateien.length, 2], [groesse, 4], [o, 4], [0, 2])]);
}
