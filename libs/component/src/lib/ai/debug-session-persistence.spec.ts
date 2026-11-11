import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSendContextSession, type SendContextSession } from '@craft-ts/core';
import { connectDebugSessionPersistence } from './debug-session-persistence';

type Message = Record<string, unknown>;

/** A socket the test opens and answers by hand. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: Message[] = [];
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Message);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', {});
  }

  /** Opens, then answers the sync with the id the server keeps. */
  accept(id?: string): void {
    this.readyState = FakeSocket.OPEN;
    this.emit('open', {});
    const sync = this.sent.find((message) => message['type'] === 'session:sync');
    this.emit('message', { data: JSON.stringify({ type: 'session:ready', id: id ?? sync?.['id'] }) });
  }

  receive(message: Message): void {
    this.emit('message', { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const MINUTE = 60_000;
const IDLE = 30 * MINUTE;
const origin = location.origin;
const sharedKey = `craft-debug-session-id:${origin}`;
const activityKey = `${sharedKey}:activity`;
const lastSocket = (): FakeSocket => FakeSocket.instances.at(-1)!;
const syncOf = (socket: FakeSocket) => socket.sent.find((message) => message['type'] === 'session:sync')!;
const historyOf = (socket: FakeSocket) =>
  socket.sent.flatMap((message) => (message['type'] === 'session:events' ? (message['events'] as Message[]) : []));
const input = (type = 'pointerdown') => window.dispatchEvent(new Event(type));
const checkIdle = () => document.dispatchEvent(new Event('visibilitychange'));

describe('debug session persistence after a pause', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const keepaliveFinishes: string[] = [];
  const disconnects: Array<() => void> = [];
  let clock = Date.parse('2026-11-11T08:00:00.000Z');
  const now = () => clock;

  const record = (): SendContextSession => {
    const session = createSendContextSession();
    session.startRecord('Application session');
    return session;
  };
  const connect = (session: SendContextSession) => {
    disconnects.push(connectDebugSessionPersistence(session, 'ws://127.0.0.1:4319/ws', { now }));
  };

  beforeEach(() => {
    FakeSocket.instances = [];
    localStorage.clear();
    sessionStorage.clear();
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    keepaliveFinishes.length = 0;
    // jsdom has no media queries; the tab's environment reads one.
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
    globalThis.fetch = (async (url: string | URL) => {
      keepaliveFinishes.push(String(url));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
  });

  afterEach(() => {
    for (const disconnect of disconnects.splice(0)) disconnect();
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    history.replaceState(null, '', '/');
  });

  it('ends the session after half an hour without input, and starts the next one on the next input', () => {
    const session = record();
    connect(session);
    const first = lastSocket();
    first.accept();
    const firstId = syncOf(first)['id'] as string;
    const catalog = { source: 'browser-fetch', method: 'POST', url: '/__server-functions', body: '{"id":"catalog"}' };
    for (const [operationId, products] of [['fetch-1', ['croissant']], ['fetch-2', ['croissant', 'chocolatine']]] as const) {
      session.capture('http', 'started', { operationId, payload: catalog });
      session.capture('http', 'succeeded', { operationId, payload: { status: 200, body: JSON.stringify(products) } });
    }
    session.capture('custom', 'emitted', { name: 'before the pause' });

    clock += IDLE - MINUTE;
    checkIdle();
    expect(first.sent.some((message) => message['type'] === 'session:finish')).toBe(false);

    // Only heartbeats while nobody is there: they do not keep it open.
    session.capture('performance', 'emitted', { name: 'browser.heartbeat' });
    clock += MINUTE;
    checkIdle();
    expect(first.sent.filter((message) => message['type'] === 'session:finish')).toEqual([
      { type: 'session:finish', id: firstId, participantId: expect.any(String) },
    ]);
    expect(first.readyState).toBe(3);
    // Said again over HTTP, in case the socket was already gone.
    expect(keepaliveFinishes.at(-1)).toBe(`http://127.0.0.1:4319/sessions/${firstId}/finish`);
    // Still away: nothing reconnects.
    clock += 10 * MINUTE;
    input('pointermove');
    expect(FakeSocket.instances).toHaveLength(1);

    history.replaceState(null, '', '/cart?step=2');
    input('pointerdown');
    session.capture('dom', 'emitted', { name: 'checkout:click' });
    const second = lastSocket();
    expect(second).not.toBe(first);
    second.accept();

    const sync = syncOf(second);
    expect(sync['id']).not.toBe(firstId);
    expect(sync['session']).toMatchObject({ continuesFrom: firstId, startUrl: `${origin}/cart?step=2` });
    // The new session begins where the user came back. A replay loads the page
    // again: its requests get what the server answered last.
    expect(historyOf(second).map((event) => [event['kind'], event['phase'], event['operationId'] ?? event['name']])).toEqual([
      ['http', 'started', 'fetch-2'],
      ['http', 'succeeded', 'fetch-2'],
      ['participant', 'emitted', 'state'],
      ['dom', 'emitted', 'checkout:click'],
    ]);
    expect(localStorage.getItem(sharedKey)).toBe(sync['id']);
  });

  it('keeps the session while any tab has input', () => {
    const session = record();
    connect(session);
    const socket = lastSocket();
    socket.accept();
    const id = syncOf(socket)['id'];

    clock += IDLE - MINUTE;
    // Another tab of the same session was used a minute ago.
    localStorage.setItem(activityKey, JSON.stringify({ id, at: clock }));
    clock += 2 * MINUTE;
    checkIdle();

    expect(socket.sent.some((message) => message['type'] === 'session:finish')).toBe(false);
  });

  it('opens a page into the session in use, and into a new one that continues it once it went quiet', () => {
    const inUse = crypto.randomUUID();
    localStorage.setItem(sharedKey, inUse);
    localStorage.setItem(activityKey, JSON.stringify({ id: inUse, at: clock - MINUTE }));
    connect(record());
    lastSocket().accept();
    expect(syncOf(lastSocket())['id']).toBe(inUse);
    expect(syncOf(lastSocket())['session']).not.toHaveProperty('continuesFrom');
    for (const disconnect of disconnects.splice(0)) disconnect();

    // An hour later, or left by a tab that never said when it was last used.
    for (const activity of [{ id: inUse, at: clock - 2 * IDLE }, undefined]) {
      localStorage.setItem(sharedKey, inUse);
      if (activity) localStorage.setItem(activityKey, JSON.stringify(activity));
      else localStorage.removeItem(activityKey);
      connect(record());
      lastSocket().accept();
      const sync = syncOf(lastSocket());
      expect(sync['id']).not.toBe(inUse);
      expect(sync['session']).toMatchObject({ continuesFrom: inUse });
      for (const disconnect of disconnects.splice(0)) disconnect();
    }
  });

  it('joins the session another tab began after the pause, without carrying its old history there', () => {
    const session = record();
    connect(session);
    const first = lastSocket();
    first.accept();
    const firstId = syncOf(first)['id'] as string;
    session.capture('custom', 'emitted', { name: 'before the pause' });

    // Another tab came back first: its new session continues this one.
    clock += IDLE + MINUTE;
    const next = crypto.randomUUID();
    localStorage.setItem(activityKey, JSON.stringify({ id: next, at: clock, continuesFrom: firstId }));
    localStorage.setItem(sharedKey, next);
    window.dispatchEvent(new StorageEvent('storage', { key: sharedKey, newValue: next }));

    expect(first.sent.at(-1)).toMatchObject({ type: 'session:finish', id: firstId });
    expect(FakeSocket.instances).toHaveLength(1);

    input('keydown');
    const second = lastSocket();
    second.accept();
    expect(syncOf(second)).toMatchObject({ id: next, session: { continuesFrom: firstId } });
    expect(historyOf(second).map((event) => event['name'])).not.toContain('before the pause');
  });

  it('waits for input once the server ended the session without this tab', () => {
    // The other tab was closed; nobody used this one.
    const session = record();
    connect(session);
    const first = lastSocket();
    first.accept();
    const firstId = syncOf(first)['id'] as string;

    first.receive({ type: 'session:ended', id: firstId });
    expect(first.readyState).toBe(3);
    // Nothing said back: the session is over.
    expect(first.sent.some((message) => message['type'] === 'session:finish')).toBe(false);
    session.capture('performance', 'emitted', { name: 'browser.heartbeat' });
    expect(FakeSocket.instances).toHaveLength(1);

    input('pointerdown');
    const second = lastSocket();
    second.accept();
    expect(syncOf(second)['session']).toMatchObject({ continuesFrom: firstId });
    expect(syncOf(second)['id']).not.toBe(firstId);
  });

  it('does not follow an id a tab writes without saying it uses it', () => {
    // A tab of an older version, left open, rejoins after a server restart.
    connect(record());
    const socket = lastSocket();
    socket.accept();
    const id = syncOf(socket)['id'];
    const stray = crypto.randomUUID();
    localStorage.setItem(sharedKey, stray);
    window.dispatchEvent(new StorageEvent('storage', { key: sharedKey, newValue: stray }));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.readyState).toBe(FakeSocket.OPEN);

    // One a tab uses is followed.
    const used = crypto.randomUUID();
    localStorage.setItem(activityKey, JSON.stringify({ id: used, at: clock }));
    localStorage.setItem(sharedKey, used);
    window.dispatchEvent(new StorageEvent('storage', { key: sharedKey, newValue: used }));
    expect(lastSocket()).not.toBe(socket);
    expect(id).not.toBe(used);
  });

  it('never splits a recording made by a test', () => {
    (globalThis as { __CRAFT_E2E_SESSION__?: unknown }).__CRAFT_E2E_SESSION__ = {
      id: crypto.randomUUID(),
      test: { id: 'cart' },
    };
    try {
      connect(record());
      const socket = lastSocket();
      socket.accept();
      clock += 3 * IDLE;
      checkIdle();
      expect(socket.sent.some((message) => message['type'] === 'session:finish')).toBe(false);
    } finally {
      delete (globalThis as { __CRAFT_E2E_SESSION__?: unknown }).__CRAFT_E2E_SESSION__;
    }
  });
});
