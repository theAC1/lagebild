import { describe, expect, it } from 'vitest';
import { skaliere } from './uiSkala.ts';

describe('skaliere (px → Bediengrösse)', () => {
  it('rechnet Masse in --u und Schriftgrössen in --s um; Haarlinien, Rahmen, Schatten und bewusst skalierte Werte bleiben', () => {
    expect(skaliere('height', '48px')).toBe('calc(48 * var(--u))');
    expect(skaliere('font-size', '12px')).toBe('calc(12 * var(--s))');
    expect(skaliere('translate', '-50% -22px')).toBe('-50% calc(-22 * var(--u))');
    expect(skaliere('--rand-b', 'calc(84px + env(safe-area-inset-left, 0px))')).toBe('calc(calc(84 * var(--u)) + env(safe-area-inset-left, 0px))');
    // Haarlinien, Rahmen, Schatten und bewusst skalierte Werte bleiben stehen
    expect(skaliere('padding', '1px 6px')).toBe('1px calc(6 * var(--u))');
    expect(skaliere('border', '2px solid red')).toBe('2px solid red');
    expect(skaliere('box-shadow', '0 2px 8px #000')).toBe('0 2px 8px #000');
    expect(skaliere('border-radius', '12px')).toBe('calc(12 * var(--u))');
    expect(skaliere('font-size', 'calc(12px * var(--karte))')).toBe('calc(12px * var(--karte))');
    expect(skaliere('height', 'min(calc(44 * var(--u)), 56px)')).toBe('min(calc(44 * var(--u)), 56px)');
    expect(skaliere('width', '50%')).toBe('50%');
  });
});
