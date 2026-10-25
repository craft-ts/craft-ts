import { describe, expect, it } from 'vitest';
import type { SendContextReplayExport } from '@craft-ts/core';
import { buildDebugSessionResumeManifest } from './debug-session-resume-manifest';

describe('buildDebugSessionResumeManifest', () => {
  it('exports only session-local fingerprints for references', () => {
    const manifest = buildDebugSessionResumeManifest(
      {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 10,
        status: 'ready',
        steps: [],
        problems: [],
        expectedCalls: ['GET /account'],
        substitutions: [],
      },
      {
        format: 'craft-debug-session',
        version: 7,
        referenceCaptureVersion: 1,
        startUrl: 'http://localhost/',
        exportedAt: 0,
        truncated: false,
        events: [{
          id: 'account-response',
          sequence: 1,
          timestamp: 0,
          globalElapsedMs: 5,
          kind: 'http',
          phase: 'succeeded',
          refs: [{ path: '$.token', fingerprint: '0123456789abcdef', direction: 'in' }],
        }],
        clips: [],
      } as SendContextReplayExport,
    );

    expect(manifest.entries.map((entry) => entry.name)).toContain('0123456789abcdef');
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        kind: 'reference',
        name: '0123456789abcdef',
        level: 'informational',
      }),
    );
    expect(manifest.checklistMarkdown).toContain('GET /account');
    expect(manifest.checklistMarkdown).not.toContain('secret-token');
  });
});
