import { describe, expect, it } from 'vitest';
import {
  defineReviewAttestConfig,
  reviewAttestHasVisualTargets,
  reviewAttestVisualSubjects,
} from './review-attest.ts';
import { defineVisualAppConfig } from './visual-app.ts';

describe('review attest configuration', () => {
  it('accepts an empty config as a valid no-op', () => {
    const config = defineReviewAttestConfig({});
    expect(config).toEqual({ template: false });
    expect(reviewAttestHasVisualTargets(config)).toBe(false);
  });

  it('normalizes app defaults and exposes declared subjects', () => {
    const config = defineReviewAttestConfig({
      visual: {
        app: defineVisualAppConfig({
          pages: [
            {
              id: 'home',
              route: '/',
              url: '/',
              component: 'component:home.ts:Home',
              mocks: { source: 'home.happy-path.ts', endpoints: [] },
            },
          ],
        }),
      },
      template: true,
    });
    expect(config.template).toBe(true);
    expect(reviewAttestVisualSubjects(config)).toContain(
      'visual:component:home.ts:Home#home--happy-path--mobile',
    );
  });

  it('rejects malformed runtime values', () => {
    expect(() =>
      defineReviewAttestConfig({ template: 'yes' } as never),
    ).toThrow(/template must be a boolean/);
    expect(() =>
      defineReviewAttestConfig({
        visual: { app: { pages: [] } },
      }),
    ).not.toThrow();
  });
});
