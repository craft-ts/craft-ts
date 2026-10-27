import { DEBUG_SESSION_EXPORT_VERSION } from '@craft-ts/core';
import type { SendContextEvent, SendContextReplayExport } from '@craft-ts/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEBUG_APP_SNAPSHOT_FORMAT,
  type DebugAppSnapshot,
} from './debug-session-app-snapshot';
import {
  diffWithPoint,
  participantArchive,
  ɵinstallGuidedResumeWriteBarrier,
  ɵreadGuidedResumeWrites,
} from './guided-resume';

function snapshot(
  route: string,
  primitives: Record<string, unknown>,
): DebugAppSnapshot {
  return {
    format: DEBUG_APP_SNAPSHOT_FORMAT,
    version: 1,
    route,
    primitives,
    storage: [],
    warnings: [],
  };
}

const registry = (values: Record<string, unknown>) => ({ capture: () => values });

describe('guided resume', () => {
  it('reports what the live tab lacks to be at the point', () => {
    history.replaceState(null, '', '/admin/products/flat-white?craft-resume=s1');
    const diff = diffWithPoint(
      snapshot('/admin/products/flat-white', {
        'service:session / query:currentUser#1': { id: 'craft-ref:ab12', role: 'admin' },
        'component:ProductEditor#3 / state:draft': { name: 'Flat white', price: 4.5 },
        'component:Toast / state:open': false,
      }),
      {
        registry: registry({
          'service:session / query:currentUser#4': { id: 'u-17', role: 'admin' },
          'component:ProductEditor#9 / state:draft': { name: 'Flat white', price: 4 },
          'component:Footer / state:year': 2026,
        }),
      } as never,
    );

    expect(diff).toMatchObject({
      route: { equal: true },
      equal: 1,
      differences: [
        {
          address: 'component:ProductEditor / state:draft',
          status: 'different',
          expected: { price: 4.5 },
          actual: { price: 4 },
        },
        { address: 'component:Toast / state:open', status: 'missing' },
      ],
      extra: ['component:Footer / state:year'],
    });
  });

  it('follows the tab that acted last before the point', () => {
    const event = (sequence: number, participantId: string): SendContextEvent => ({
      id: `e${sequence}`,
      sequence,
      timestamp: sequence,
      elapsedMs: sequence,
      kind: 'dom',
      phase: 'emitted',
      participantId,
    });
    const participant = (id: string, startUrl: string) => ({
      id,
      title: id,
      startUrl,
      state: 'visible' as const,
      status: 'completed' as const,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    });
    const archive: SendContextReplayExport = {
      format: 'craft-debug-session',
      version: DEBUG_SESSION_EXPORT_VERSION,
      startUrl: 'http://localhost:4300/',
      exportedAt: 0,
      truncated: false,
      events: [event(1, 'shop'), event(2, 'admin'), event(3, 'shop')],
      clips: [],
      participants: [
        participant('shop', 'http://localhost:4300/'),
        participant('admin', 'http://localhost:4300/admin'),
      ],
    };

    const admin = participantArchive(archive, { beforeSequence: 3 });
    expect(admin.startUrl).toBe('http://localhost:4300/admin');
    expect(admin.events.map((item) => item.sequence)).toEqual([2]);
    expect(participantArchive(archive, { participantId: 'shop' }).events).toHaveLength(2);
  });

  describe('write barrier', () => {
    const nativeFetch = globalThis.fetch;
    const nativeSend = XMLHttpRequest.prototype.send;
    const sent: string[] = [];
    afterAll(() => {
      globalThis.fetch = nativeFetch;
      XMLHttpRequest.prototype.send = nativeSend;
    });

    it('holds writes to another origin, by fetch or XHR, and tells reads from writes', async () => {
      globalThis.fetch = async (input, init) => {
        sent.push(`fetch ${init?.method ?? 'GET'} ${new URL(String(input), location.href).href}`);
        return new Response('{}');
      };
      XMLHttpRequest.prototype.send = function () {
        sent.push('xhr sent');
      };
      ɵinstallGuidedResumeWriteBarrier('http://127.0.0.1:4319');
      const serverFunction = (id: string) => ({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-craft-function-id': id },
        body: JSON.stringify({ id, input: {} }),
      });

      await fetch('/__server-functions', serverFunction('shop.admin.overview'));
      await fetch('/__server-functions', serverFunction('shop.product.save'));
      await fetch('/api/products', { method: 'POST', body: '{}' });
      await fetch('https://payments.example.com/charges');
      await expect(
        fetch('https://payments.example.com/charges', { method: 'POST', body: '{}' }),
      ).rejects.toThrow('retenue');
      await fetch('http://127.0.0.1:4319/logs', { method: 'POST', body: '{}' });

      const allowed = new XMLHttpRequest();
      allowed.open('POST', '/__server-functions');
      allowed.send(JSON.stringify({ id: 'shop.auth.login', input: {} }));
      const held = new XMLHttpRequest();
      const failed = new Promise<string>((resolve) => held.addEventListener('error', () => resolve('error')));
      held.open('PUT', 'https://mail.example.com/messages');
      held.send('{}');
      await expect(failed).resolves.toBe('error');

      expect(sent).toEqual([
        `fetch POST ${location.origin}/__server-functions`,
        `fetch POST ${location.origin}/__server-functions`,
        `fetch POST ${location.origin}/api/products`,
        'fetch GET https://payments.example.com/charges',
        'fetch POST http://127.0.0.1:4319/logs',
        'xhr sent',
      ]);
      expect(ɵreadGuidedResumeWrites().map((write) => [write.transport, write.call ?? write.url, write.effect, write.status])).toEqual([
        ['fetch', 'shop.admin.overview', 'read', 'allowed'],
        ['fetch', 'shop.product.save', 'write', 'allowed'],
        ['fetch', `${location.origin}/api/products`, 'write', 'allowed'],
        ['fetch', 'https://payments.example.com/charges', 'write', 'held'],
        ['xhr', 'shop.auth.login', 'write', 'allowed'],
        ['xhr', 'https://mail.example.com/messages', 'write', 'held'],
      ]);
    });
  });
});
