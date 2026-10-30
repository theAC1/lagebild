import { describe, expect, it } from 'vitest';
import { apiUrl, serverBasis, wsUrl } from './umgebung.ts';

describe('Basis-URL', () => {
  it('Browser: same-origin', () => {
    expect(serverBasis(false, 'http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(apiUrl('/api/beitreten', false, 'https://lage.arvuna.ch')).toBe('https://lage.arvuna.ch/api/beitreten');
    expect(wsUrl(false, 'http://127.0.0.1:8080')).toBe('ws://127.0.0.1:8080/ws');
    expect(wsUrl(false, 'https://x.ch')).toBe('wss://x.ch/ws');
  });
  it('App: fester Server, nicht https://localhost', () => {
    expect(apiUrl('/api/foto', true, 'https://localhost')).toBe('https://lage.arvuna.ch/api/foto');
    expect(wsUrl(true, 'https://localhost')).toBe('wss://lage.arvuna.ch/ws');
    expect(serverBasis(true, 'https://localhost', 'https://t.example/')).toBe('https://t.example');
  });
});
