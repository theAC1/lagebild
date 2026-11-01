// Datei speichern bzw. teilen (Raster-PDF, MilX/KML-Export); eigenes Modul, damit das PDF-Modul lazy bleibt.
import { istApp } from './umgebung.ts';

/** Android-App: native Brücke aus MainActivity (Teilen-Dialog: speichern, senden, drucken). */
type Bruecke = { teile(base64: string, name: string, typ: string): void };

/** Datei speichern bzw. teilen: in der App über den Teilen-Dialog, im Browser als Download. false: hier nicht möglich. */
export async function speichere(blob: Blob, name: string): Promise<boolean> {
  const nativ = (window as unknown as { LagebildDatei?: Bruecke }).LagebildDatei;
  if (nativ) {
    const url = await new Promise<string>((ok, nok) => {
      const f = new FileReader();
      f.onload = () => ok(f.result as string);
      f.onerror = () => nok(f.error);
      f.readAsDataURL(blob);
    });
    nativ.teile(url.slice(url.indexOf(',') + 1), name, blob.type);
    return true;
  }
  if (istApp()) return false; // ältere App ohne Brücke: Download geht im WebView ins Leere
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
