import { describe, expect, it, vi } from 'vitest';
import type { DebugSessionResumeManifest } from './debug-session-resume-manifest';
import { runDebugSessionResumePreflight } from './debug-session-resume-preflight';

const manifest: DebugSessionResumeManifest = {
  format: 'craft-debug-session-resume-manifest',
  version: 1,
  entries: [
    { level: 'required', kind: 'reference', name: 'session-ref' },
    { level: 'expected', kind: 'call', name: 'GET /catalog' },
  ],
  checklistMarkdown: '',
};

describe('runDebugSessionResumePreflight', () => {
  it('passes when the read-only backend inventory contains required facts', async () => {
    const readFacts = vi.fn(async () => [{ kind: 'reference', name: 'session-ref' }]);
    await expect(runDebugSessionResumePreflight(manifest, { readFacts })).resolves.toMatchObject({
      status: 'passed',
      missing: [],
    });
    expect(readFacts).toHaveBeenCalledOnce();
  });

  it('fails before any write-capable operation when a required fact is absent', async () => {
    const readFacts = vi.fn(async () => []);
    const result = await runDebugSessionResumePreflight(manifest, { readFacts });
    expect(result).toMatchObject({
      status: 'failed',
      missing: [{ kind: 'reference', name: 'session-ref' }],
    });
    expect(readFacts).toHaveBeenCalledOnce();
  });
});

describe('persona preflight', () => {
  const withPersona: DebugSessionResumeManifest = {
    format: 'craft-debug-session-resume-manifest',
    version: 1,
    entries: [{ level: 'required', kind: 'persona', name: 'admin', detail: 'camille' }],
    checklistMarkdown: '',
  };

  it('checks required personas locally, before the backend', async () => {
    const readFacts = vi.fn(async () => []);
    await expect(
      runDebugSessionResumePreflight(withPersona, { readFacts }, {
        personas: [{ role: 'admin', id: 'camille' }],
      }),
    ).resolves.toMatchObject({ status: 'passed' });
    await expect(
      runDebugSessionResumePreflight(withPersona, { readFacts }, {
        personas: [{ role: 'client', id: 'leo' }],
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      missing: [{ kind: 'persona', name: 'admin', detail: 'camille' }],
    });
  });
});
