import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as sessionTrace from './index.js';

// Shared by the browser dashboard, the Playwright fixture and the Node MCP
// server: the module must load and run without any browser global.
describe('@craft-ts/session-trace', () => {
  it('normalizes and compares without window or document', () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');
    const trace = sessionTrace.normalizeSessionTrace({ events: [{ kind: 'dom', sequence: 1, payload: { interactionName: 'Page:button:go:click' } }] });
    expect(sessionTrace.compareSessionTraces(trace, [trace]).findings).toEqual([]);
  });

  it('never names a browser or Node global in its sources', () => {
    const directory = new URL('./', import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))) {
      const source = readFileSync(new URL(file, directory), 'utf8');
      expect(source, file).not.toMatch(/\b(window|document|localStorage|process|Buffer)\b|from 'node:/);
    }
  });
});
