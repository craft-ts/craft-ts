import { describe, expect, it, vi } from 'vitest';
import {
  createSendContextSession,
  defaultSendContextRedactor,
} from './send-context-to-ai.tokens';
import { createSendContextToAiBuffer } from './send-context-to-ai';
import { craftUse } from './craft-use';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { AppSnapshotRegistry } from './take-app-snapshot';

describe('send context session', () => {
  it('keeps an ordered circular timeline and marks evicted clips', () => {
    const session = createSendContextSession({
      retentionPolicy: { maxEvents: 2 },
    });
    const clip = session.startRecord('interaction');

    session.capture('custom', 'emitted', { name: 'one' });
    session.capture('custom', 'emitted', { name: 'two' });
    session.capture('custom', 'emitted', { name: 'three' });

    expect(session.events.map((event) => event.name)).toEqual(['two', 'three']);
    expect(session.selectClip(clip.id)?.eventIds).toHaveLength(2);
    expect(session.selectClip(clip.id)?.truncated).toBe(true);
  });

  it('redacts sensitive values and serializes cycles', () => {
    const value: Record<string, unknown> = { token: 'secret' };
    value.self = value;
    const session = createSendContextSession();

    session.capture('custom', 'emitted', { payload: value });

    expect(session.events[0]?.payload).toEqual({
      token: '[REDACTED]',
      self: '[Circular]',
    });
  });

  it('composes filters and enrichers before serializing', () => {
    const enrich = vi.fn((event) => ({ ...event, correlationId: 'corr-1' }));
    const session = createSendContextSession({
      enrichers: [enrich],
      filters: [(event) => event.name !== 'ignored'],
    });

    session.capture('custom', 'emitted', { name: 'kept' });
    session.capture('custom', 'emitted', { name: 'ignored' });

    expect(enrich).toHaveBeenCalledTimes(2);
    expect(session.events).toHaveLength(1);
    expect(session.events[0]?.correlationId).toBe('corr-1');
  });

  it('exports a selected clip and publishes observable snapshots', () => {
    const session = createSendContextSession();
    const values: unknown[][] = [];
    session.events$.subscribe((events) => values.push([...events]));
    const clip = session.startRecord('export');
    session.capture('http', 'started', { operationId: 'op-1' });
    session.stopRecord();

    expect(values.at(-1)).toHaveLength(1);
    expect(session.exportJson(clip.id)).toContain('op-1');
    expect(session.exportSummary(clip.id)).toContain('[started] http');
  });

  it('redacts sensitive object keys recursively', () => {
    expect(
      defaultSendContextRedactor({ nested: { password: 'x', ok: 1 } }),
    ).toEqual({
      nested: { password: '[REDACTED]', ok: 1 },
    });
  });

  it('reads the current app snapshot when the AI payload asks for it', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
    const buffer = createSendContextToAiBuffer(registry);
    registry.registerSnapshotReader('state', ['component:root'], () => 1);

    expect(buffer.snapshot()).toEqual([
      { source: 'state', from: ['component:root'], state: 1 },
    ]);
    injector.destroy();
  });
});
