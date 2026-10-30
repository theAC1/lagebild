import { expect, it } from 'vitest';
import { veralteteKeys } from './speicher.ts';

it('entfernt nur Lage-Schlüssel fremder Lagen, nie Codes oder Einstellungen', () => {
  const keys = ['lagebild.chat.gelesen.A', 'lagebild.chat.gelesen.B', 'lagebild.bloodhound.A', 'lagebild.rb.B', 'lagebild.zeichnen.ausgeblendet.B', 'lagebild.codes.B', 'lagebild.einstellungen', 'fremd.B'];
  expect(veralteteKeys(keys, 'A')).toEqual(['lagebild.chat.gelesen.B', 'lagebild.rb.B', 'lagebild.zeichnen.ausgeblendet.B']);
});
