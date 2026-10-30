// Versionsangabe der Android-App (`/app/version.json`, vom Server geliefert) und Vergleich mit der installierten Version.
export interface AppVersion {
  versionCode: number;
  versionName: string;
}

/** Prüft die Antwort von /app/version.json; undefined bei allem, was nicht passt. */
export function liesAppVersion(roh: unknown): AppVersion | undefined {
  if (typeof roh !== 'object' || roh === null) return undefined;
  const { versionCode, versionName } = roh as Record<string, unknown>;
  if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode < 1) return undefined;
  return { versionCode, versionName: typeof versionName === 'string' ? versionName.slice(0, 32) : String(versionCode) };
}

/** true, wenn der Server eine neuere App anbietet als die installierte (`eigen` = versionCode). */
export const istNeuer = (eigen: number, angebot: AppVersion | undefined): boolean => !!angebot && Number.isFinite(eigen) && angebot.versionCode > eigen;
