import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  resumePrerequisites,
  resumeRecordedCall,
  resumeStory,
  resumeTarget,
  type ResumeArchive,
} from './resume-context.js';

function fixture(id: string): ResumeArchive {
  return JSON.parse(
    gunzipSync(readFileSync(new URL(`./__fixtures__/${id}.session.json.gz`, import.meta.url))).toString('utf8'),
  ) as ResumeArchive;
}

const adminEdit = fixture('admin.edit-product');

describe('resumeStory', () => {
  it('tells the session as interactions, calls and routes', () => {
    const story = resumeStory(adminEdit);
    const labels = story.steps.map((step) => `${step.kind} ${step.label}`);
    expect(labels).toEqual(
      expect.arrayContaining([
        'route /admin',
        'interaction EcommerceLoginPanel:button:quick-sign-in:click',
        'call ecommerce.auth.login',
        'call ecommerce.admin.overview',
        'interaction EcommerceAdminDashboard:button:stock-up:click',
      ]),
    );
    expect(story.steps.find((step) => step.label === 'ecommerce.auth.login')?.detail).toEqual({ status: 200 });
  });

  it('stops before the chosen event and keeps the latest steps under the limit', () => {
    const story = resumeStory(adminEdit, { beforeSequence: 40, limit: 2 });
    expect(story.steps.every((step) => step.sequence < 40)).toBe(true);
    expect(story.steps).toHaveLength(2);
    expect(story.omitted).toBeGreaterThan(0);
  });
});

describe('resumePrerequisites probes', () => {
  it('prefers the recorded read that answered who was signed in', () => {
    const call = (sequence: number, id: string, input: unknown, answer: unknown) => [
      { sequence, kind: 'http', phase: 'started', operationId: `op-${sequence}`, payload: { method: 'POST', url: 'http://localhost:4206/__server-functions', headers: { 'content-type': 'application/json', 'x-craft-function-id': id, cookie: 'secret' }, body: JSON.stringify({ id, input }) } },
      { sequence: sequence + 1, kind: 'http', phase: 'succeeded', operationId: `op-${sequence}`, response: { status: 200, body: JSON.stringify(JSON.stringify(answer)) } },
    ];
    const archive: ResumeArchive = {
      events: [
        { sequence: 1, kind: 'primitive', name: 'primitive-change', payload: { address: 'service:session / state:currentSession#1' }, state: { 'service:session / state:currentSession#1': { token: '[REDACTED]', user: { id: 'ines', role: 'product-manager' } } } },
        ...call(2, 'shop.auth.me', { token: 'craft-ref:aa' }, { token: 'craft-ref:aa', user: { id: 'ines', role: 'product-manager' } }),
        ...call(4, 'shop.admin.overview', { token: 'craft-ref:aa' }, { products: [] }),
      ],
    };

    const [probe] = resumePrerequisites(archive).probes;

    expect(probe).toMatchObject({
      from: 'shop.auth.me',
      url: '/__server-functions',
      body: { input: { token: '{{state service:session / state:currentSession token}}' } },
      expect: { status: 200, match: ['"role":"product-manager"'] },
    });
    expect(probe?.headers).toEqual({ 'content-type': 'application/json', 'x-craft-function-id': 'shop.auth.me' });
  });
});

describe('resumeStory polling', () => {
  it('tells a poll once until the next gesture, with how often it repeated', () => {
    let sequence = 0;
    const poll = (status: number) => {
      const operationId = `poll-${++sequence}`;
      return [
        { sequence: ++sequence, kind: 'http', phase: 'started', operationId, payload: { method: 'POST', url: '/__server-functions', body: JSON.stringify({ id: 'shop.admin.overview', input: {} }) } },
        { sequence: ++sequence, kind: 'http', phase: 'succeeded', operationId, response: { status, body: '"{}"' } },
      ];
    };
    const archive: ResumeArchive = {
      events: [
        ...poll(200),
        ...poll(200),
        ...poll(200),
        { sequence: ++sequence, kind: 'dom', name: 'Admin:button:edit-product:click', payload: {} },
        ...poll(200),
        ...poll(500),
      ],
    };

    const story = resumeStory(archive);

    expect(story.steps.map((step) => [step.kind, step.label, step.detail?.['repeated'] ?? 1, step.detail?.['status']])).toEqual([
      ['call', 'shop.admin.overview', 3, 200],
      ['interaction', 'Admin:button:edit-product:click', 1, undefined],
      ['call', 'shop.admin.overview', 1, 200],
      ['call', 'shop.admin.overview', 1, 500],
    ]);
    expect(story.steps[0]?.detail?.['lastSequence']).toBeGreaterThan(story.steps[0]!.sequence);
  });
});

describe('resumePrerequisites', () => {
  it('finds who was signed in from the recorded answers and the state', () => {
    const prerequisites = resumePrerequisites(adminEdit);
    expect(prerequisites.identities[0]).toMatchObject({ role: 'admin', id: 'camille' });
    expect(prerequisites.session.open).toBe(true);
    // The recorded token is masked: the AI waits for a real one after handing off.
    expect(prerequisites.session.signedInWhen).toMatchObject({ path: 'token', unmasked: true });
    expect(prerequisites.session.signedInWhen?.address).toMatch(/session/);
    const kinds = prerequisites.entities.map((entity) => `${entity.kind}:${entity.id}`);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(prerequisites.writes.map((write) => write.call)).toContain('ecommerce.auth.login');
    // A ready probe: a recorded read the token opened, sent with the live token.
    expect(prerequisites.probes).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/__server-functions',
        from: 'ecommerce.admin.overview',
        body: { id: 'ecommerce.admin.overview', input: { token: `{{state ${prerequisites.session.signedInWhen?.address} token}}` } },
        expect: { status: 200 },
      }),
    ]);
  });

  it('sees a session closed by a sign-out and reads route parameters', () => {
    const archive: ResumeArchive = {
      events: [
        { sequence: 1, kind: 'primitive', name: 'primitive-change', payload: { address: 'service:session / state:currentSession#1' }, state: { 'service:session / state:currentSession#1': { token: 'craft-ref:aabbccddeeff0011', user: { id: 'leo', role: 'client' } } } },
        { sequence: 2, kind: 'http', phase: 'started', operationId: 'op', payload: { method: 'POST', url: '/__server-functions', body: JSON.stringify({ id: 'shop.auth.logout', input: {} }) } },
        { sequence: 3, kind: 'http', phase: 'succeeded', operationId: 'op', response: { status: 200, body: '"ok"' } },
        { sequence: 4, kind: 'route-activation', phase: 'succeeded', name: 'produit/:productId' },
        { sequence: 5, kind: 'navigation', phase: 'started', payload: { url: 'http://localhost/produit/flat-white' } },
      ],
    };
    const prerequisites = resumePrerequisites(archive);
    expect(prerequisites.session).toMatchObject({ open: false });
    expect(prerequisites.identities[0]).toMatchObject({ role: 'client', id: 'leo' });
    expect(prerequisites.entities).toContainEqual({ kind: 'productId', id: 'flat-white', source: 'route' });
  });
});

describe('resumeTarget and resumeRecordedCall', () => {
  it('rebuilds the state at the point and returns a recorded call', () => {
    const target = resumeTarget(adminEdit);
    expect(target.route).toBe('/admin');
    expect(Object.keys(target.primitives).some((address) => address.includes('currentSession'))).toBe(true);
    const login = resumeRecordedCall(adminEdit, { call: 'ecommerce.auth.login' });
    expect(login).toMatchObject({ request: { method: 'POST', url: expect.stringContaining('/__server-functions') }, response: { status: 200 } });
  });
});
