// Browser (PWA) oder Android-App (Capacitor): Basis-URL für REST und WebSocket.
// Im Browser same-origin wie bisher; in der App liegt die Oberfläche lokal (https://localhost), der Server ist fern.
import { Capacitor } from '@capacitor/core';

/** Server, den die Android-App anspricht (Build-Zeit überschreibbar: VITE_SERVER_URL). */
export const APP_SERVER: string = import.meta.env.VITE_SERVER_URL ?? 'https://lage.arvuna.ch';

export const istApp = (): boolean => Capacitor.isNativePlatform();

/** Basis ohne Schrägstrich am Ende: in der App der feste Server, sonst der eigene Ursprung. */
export const serverBasis = (app: boolean, origin: string, server = APP_SERVER): string => (app ? server : origin).replace(/\/+$/, '');

/** Absolute URL für einen Serverpfad (`/api/…`). */
export const apiUrl = (pfad: string, app = istApp(), origin = location.origin): string => serverBasis(app, origin) + pfad;

/** WebSocket-URL (`wss://…/ws`, bei http-Ursprung `ws://`). */
export const wsUrl = (app = istApp(), origin = location.origin): string => serverBasis(app, origin).replace(/^http/, 'ws') + '/ws';
