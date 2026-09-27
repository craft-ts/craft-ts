import { describe, it, expect } from 'vitest';
import {
  defineVisualAppConfig,
  defineVisualHttpMocks,
  visualAppCaptureTargets,
  matchesVisualHttpRequest,
  type VisualAppScenario,
  type VisualAppViewport,
} from '../visual-app.js';
import {
  reviewAttestVisualSubjects,
  defineReviewAttestConfig,
} from '../review-attest.js';
const mocks = defineVisualHttpMocks('home.mocks.ts', []);
const scenario: VisualAppScenario = {
  id: 'list',
  label: 'List',
  category: 'happy-path',
  mocks,
  steps: [
    { action: 'capture', id: 'initial', expect: [{ kind: 'url', url: '/' }] },
    {
      action: 'capture',
      id: 'details',
      expect: [{ kind: 'visible', target: { name: 'Details' } }],
    },
  ],
};
const page = {
  id: 'home',
  component: 'component:home.ts:Home',
  url: '/',
  route: '/',
  scenarios: [scenario],
};
describe('application capture contract', () => {
  it('enumerates capture points across exactly the declared formats in order', () => {
    const config = defineReviewAttestConfig({
      visual: {
        app: {
          viewports: {
            compact: { width: 320, height: 640 },
            cinema: { width: 2000, height: 1000 },
          },
          pages: [page],
        },
      },
    });
    const targets = visualAppCaptureTargets(config.visual!.app!);
    expect(targets.map((t) => [t.capture.id, t.viewportName])).toEqual([
      ['initial', 'compact'],
      ['initial', 'cinema'],
      ['details', 'compact'],
      ['details', 'cinema'],
    ]);
    expect([...reviewAttestVisualSubjects(config)]).toEqual(
      targets.map((t) => t.subject),
    );
    expect(new Set(targets.map((t) => t.id)).size).toBe(4);
  });
  it.each<Readonly<Record<string, VisualAppViewport>>>([
    {},
    { '': { width: 1, height: 1 } },
    { phone: { width: 1.5, height: 4 } },
    { phone: { width: Infinity, height: 4 } },
    { phone: { width: 1, height: 0 } },
  ])('rejects invalid viewports %j', (viewports) => {
    expect(() => defineVisualAppConfig({ viewports, pages: [page] })).toThrow();
  });
  it('rejects duplicate identities, absent happy paths and empty capture expectations', () => {
    expect(() => defineVisualAppConfig({ pages: [page, page] })).toThrow(
      /duplicate/,
    );
    expect(() =>
      defineVisualAppConfig({ pages: [{ ...page, scenarios: [] }] }),
    ).toThrow(/happy path/);
    expect(() =>
      defineVisualAppConfig({
        pages: [
          {
            ...page,
            scenarios: [
              {
                ...scenario,
                steps: [{ action: 'capture', id: 'bad', expect: [] }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/expectations/);
  });
  it('requires a visible modal capture', () => {
    expect(() =>
      defineVisualAppConfig({
        pages: [
          {
            ...page,
            scenarios: [
              {
                ...scenario,
                modals: [
                  {
                    id: 'dialog',
                    component: 'component:dialog.ts:Dialog',
                    target: { name: 'Dialog' },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow(/Modal/);
  });
  it('encodes identity separators without collisions', () => {
    const targets = visualAppCaptureTargets(
      defineVisualAppConfig({
        pages: [
          { ...page, id: 'a--b' },
          { ...page, id: 'a', scenarios: [{ ...scenario, id: 'b--list' }] },
        ],
      }),
    );
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
  });
  it('matches method, origin, wildcard path and declared criteria', () => {
    const endpoint = {
      method: 'POST',
      url: 'https://api.example.test/users/*',
      query: { locale: 'fr' },
      requestBody: { active: true },
      mode: 'unused' as const,
      reason: 'unused',
    };
    const request = {
      method: 'POST',
      url: 'https://api.example.test/users/42?locale=fr',
      body: { active: true },
    };
    expect(matchesVisualHttpRequest(endpoint, request)).toBe(true);
    expect(
      matchesVisualHttpRequest(endpoint, {
        ...request,
        url: request.url.replace('api.example', 'other.example'),
      }),
    ).toBe(false);
    expect(
      matchesVisualHttpRequest(endpoint, { ...request, method: 'GET' }),
    ).toBe(false);
  });
  it('matches wildcards in query values after URL encoding', () => {
    expect(
      matchesVisualHttpRequest(
        {
          method: 'GET',
          url: '/api/template-detail?subject=*',
          mode: 'unused',
          reason: 'unused',
        },
        {
          method: 'GET',
          url: '/api/template-detail?subject=template%3Acomponent%3AProfile',
        },
      ),
    ).toBe(true);
  });
});
