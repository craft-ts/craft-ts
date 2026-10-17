import { describe, expect, it } from 'vitest';
import {
  craftReplayRouteForSameOriginHref,
  isTrustedCraftDebugReplayMessage,
} from './debug-session-replay-bridge';

describe('debug session replay bridge trust boundary', () => {
  it('requires both the exact parent window and an explicitly allowed origin', () => {
    const parent = {} as Window;
    const allowed = new Set(['http://localhost:4210']);
    expect(
      isTrustedCraftDebugReplayMessage(
        { source: parent, origin: 'http://localhost:4210' },
        parent,
        allowed,
      ),
    ).toBe(true);
    expect(
      isTrustedCraftDebugReplayMessage(
        { source: {} as Window, origin: 'http://localhost:4210' },
        parent,
        allowed,
      ),
    ).toBe(false);
    expect(
      isTrustedCraftDebugReplayMessage(
        { source: parent, origin: 'http://evil.example' },
        parent,
        allowed,
      ),
    ).toBe(false);
  });
});

describe('forced Craft replay destinations', () => {
  const currentUrl = 'http://localhost:4200/account/settings?tab=profile';

  it('converts a same-origin HTTP URL to a router-relative path', () => {
    expect(
      craftReplayRouteForSameOriginHref(
        'http://localhost:4200/users/7?tab=details#contact',
        currentUrl,
      ),
    ).toBe('/users/7?tab=details#contact');
  });

  it.each([
    'http://localhost:4200/users?token=%5BREDACTED%5D',
    'http://localhost:4200/users?password=[REDACTED]',
  ])('refuses a destination with a redacted secret: %s', (href) => {
    expect(() => craftReplayRouteForSameOriginHref(href, currentUrl)).toThrow(
      /secret masqué/,
    );
  });

  it('refuses a destination on another origin', () => {
    expect(() =>
      craftReplayRouteForSameOriginHref(
        'https://attacker.example/collect',
        currentUrl,
      ),
    ).toThrow(/même origine/);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello'])(
    'refuses a non-HTTP destination: %s',
    (href) => {
      expect(() => craftReplayRouteForSameOriginHref(href, currentUrl)).toThrow(
        /HTTP\(S\)/,
      );
    },
  );

  it('refuses URL credentials even when the host is same-origin', () => {
    expect(() =>
      craftReplayRouteForSameOriginHref(
        'http://user:password@localhost:4200/account',
        currentUrl,
      ),
    ).toThrow(/identifiants/);
  });
});
