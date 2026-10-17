import { describe, expect, it } from 'vitest';
import {
  environmentDifferences,
  identifyBrowser,
} from './debug-session-environment';

describe('debug session environment', () => {
  it.each([
    ['Mozilla/5.0 Firefox/128.0', 'Firefox', 'gecko'],
    ['Mozilla/5.0 Chrome/130.0.1.2 Safari/537.36', 'Chrome', 'chromium'],
    ['Mozilla/5.0 Version/18.0 Safari/605.1.15', 'Safari', 'webkit'],
    ['Mozilla/5.0 Edg/130.0.1.2', 'Edge', 'chromium'],
  ])('identifies %s', (userAgent, browser, engine) => {
    expect(identifyBrowser(userAgent)).toMatchObject({ browser, engine });
  });

  it('warns about materially different replay environments', () => {
    expect(
      environmentDifferences(
        {
          browser: 'Safari',
          browserVersion: '18.1',
          engine: 'webkit',
          platform: 'MacIntel',
          devicePixelRatio: 2,
        },
        {
          browser: 'Chrome',
          browserVersion: '130.0',
          engine: 'chromium',
          platform: 'Linux x86_64',
          devicePixelRatio: 1,
        },
      ),
    ).toEqual([
      'navigateur Safari → Chrome',
      'moteur webkit → chromium',
      'version majeure 18 → 130',
      'plateforme MacIntel → Linux x86_64',
      'densité d’écran 2 → 1',
    ]);
  });

  it('silently accepts legacy recordings without an environment profile', () => {
    expect(environmentDifferences(undefined, { engine: 'chromium' })).toEqual(
      [],
    );
  });
});
