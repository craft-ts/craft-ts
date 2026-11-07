import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GoldenSetManifest } from '@craft-ts/session-trace';
import { GOLDEN_SET_FILE, proposeGoldenSet } from './golden-set-tool.js';

const manifest = (sessions: GoldenSetManifest['sessions'] = []): GoldenSetManifest => ({
  format: 'craft-golden-set', schemaVersion: 1, app: 'demo-ecommerce', traceSchemaVersion: 2, sessions, toRecapture: [],
});

describe('proposeGoldenSet', () => {
  let appDir: string;
  let sent: Record<string, unknown> | undefined;
  const answer = (status: number, body: unknown): typeof fetch => async (_url, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(body), { status });
  };

  beforeEach(() => {
    appDir = mkdtempSync(join(tmpdir(), 'golden-set-tool-'));
    sent = undefined;
  });
  afterEach(() => rmSync(appDir, { recursive: true, force: true }));

  it('sends the set in force and the unproven behaviours, then writes the proposal', async () => {
    mkdirSync(join(appDir, '.craft'));
    const previous = manifest([{ sessionId: 'a', recordedAt: '2026-11-01', traceHash: 'h', status: 'active', units: ['invocation:cart.add'], uniqueUnits: ['invocation:cart.add'] }]);
    writeFileSync(join(appDir, GOLDEN_SET_FILE), JSON.stringify(previous));
    writeFileSync(join(appDir, '.craft/behavior-coverage.json'), JSON.stringify({ version: 1, behaviors: [
      { status: 'unproven', match: { step: 'server-fn', id: 'ecommerce.checkout' } },
      { status: 'proven', match: { step: 'invocation', outcome: 'succeeded', target: 'cart.add' } },
      { status: 'unproven', match: { step: 'invocation', outcome: 'failed', exception: 'CartFullError' } },
    ] }));
    const proposed = manifest();
    const result = await proposeGoldenSet({ origin: 'http://localhost:4204', appDir, write: true }, answer(200, { manifest: proposed, rejected: [], uncovered: [] }));
    expect(sent).toEqual({ origin: 'http://localhost:4204', app: 'demo-ecommerce', previous, priorityUnits: ['exception:CartFullError', 'server-fn:ecommerce.checkout:ok'] });
    expect(result).toMatchObject({ written: join(appDir, GOLDEN_SET_FILE) });
    expect(JSON.parse(readFileSync(join(appDir, GOLDEN_SET_FILE), 'utf8'))).toEqual(proposed);
  });

  it('writes nothing without appDir, and says why the server refused', async () => {
    await expect(proposeGoldenSet({ origin: 'http://localhost:4204', write: true })).rejects.toThrow('`write` needs `appDir`.');
    await expect(proposeGoldenSet({ origin: 'http://localhost:4204' }, answer(400, { error: 'Expected { origin }' }))).rejects.toThrow('HTTP 400');
    await expect(proposeGoldenSet({ origin: 'http://localhost:4204' }, answer(200, { manifest: { format: 'other' } }))).rejects.toThrow('valid golden-set manifest');
  });

  it('refuses a file that is not a manifest instead of overwriting it', async () => {
    mkdirSync(join(appDir, '.craft'));
    writeFileSync(join(appDir, GOLDEN_SET_FILE), '{"format":"something-else"}');
    await expect(proposeGoldenSet({ origin: 'http://localhost:4204', appDir, write: true }, answer(200, { manifest: manifest() }))).rejects.toThrow('is not a golden-set manifest');
    expect(readFileSync(join(appDir, GOLDEN_SET_FILE), 'utf8')).toBe('{"format":"something-else"}');
  });
});
