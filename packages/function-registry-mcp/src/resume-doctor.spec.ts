import { describe, expect, it } from 'vitest';
import { diagnoseGuidedResume } from './resume-doctor.js';

const SESSION = '00000000-0000-4000-8000-000000000001';

function logServer(request: unknown) {
  return (async (input: string | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === '/health') return Response.json({ ok: true });
    if (path === '/sessions/resume-requests/latest') return Response.json({ request });
    if (path === `/sessions/${SESSION}`) return Response.json({ startUrl: 'http://localhost:4206/admin' });
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

const bridge = { role: () => 'relay' as const, address: () => ({ host: '127.0.0.1', port: 4335 }) };

describe('resume.doctor', () => {
  it('says the setup is ready with one tab answering the guided resume', async () => {
    const report = await diagnoseGuidedResume({
      fetch: logServer({ sessionId: SESSION, beforeSequence: 627 }),
      logServerUrl: 'http://127.0.0.1:4323',
      bridge,
      request: async (method) =>
        method === 'registry/clients'
          ? [{ clientId: 'tab-a', status: 'ready', pageUrl: 'http://localhost:4206/admin' }]
          : { active: false, writes: [] },
    });

    expect(report).toMatchObject({ ready: true, clientId: 'tab-a', appUrl: 'http://localhost:4206/admin' });
    expect(report.checks.find((check) => check.name === 'bridge')?.detail).toContain('relayés');
  });

  it('tells what to fix: no tab, then a tab without the guided resume, then two tabs', async () => {
    const run = (clients: unknown[], answer: () => unknown) =>
      diagnoseGuidedResume({
        fetch: logServer({ sessionId: SESSION }),
        logServerUrl: 'http://127.0.0.1:4323',
        bridge,
        request: async (method) => (method === 'registry/clients' ? clients : answer()),
      });
    const tab = (clientId: string) => ({ clientId, status: 'ready', pageUrl: `http://localhost:4206/${clientId}` });

    const none = await run([], () => undefined);
    expect(none.ready).toBe(false);
    expect(none.checks.find((check) => check.name === 'tab')?.fix).toContain('http://localhost:4206/admin');

    const notInstalled = await run([tab('a')], () => {
      throw new Error('This app does not answer app/writes.');
    });
    expect(notInstalled.checks.find((check) => check.name === 'guided-resume')?.fix).toContain('provideCraftGuidedResume');

    const two = await run([tab('a'), tab('b')], () => ({}));
    expect(two.ready).toBe(false);
    expect(two.checks.find((check) => check.name === 'tab')?.fix).toContain('clientId');
  });

  it('reports an unreachable log server', async () => {
    const report = await diagnoseGuidedResume({
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
      logServerUrl: 'http://127.0.0.1:4323',
      request: async () => [],
    });
    expect(report.checks[0]).toMatchObject({ name: 'log-server', ok: false, fix: expect.stringContaining('logs:server') });
  });
});
