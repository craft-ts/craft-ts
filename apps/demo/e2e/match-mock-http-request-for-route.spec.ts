import { expect, test } from '@playwright/test';
import './demo-route-http-registry';
// E2E type tests intentionally exercise the library source before packaging.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  matchMockHttpRequestForRoute,
  mockHttpRequestForRoute,
} from '../../../libs/core/src/lib/mock-http-request-for-route';

test('matchMockHttpRequestForRoute should expose ignore and unusedOrThrow decisions in Playwright', async ({
  page,
}) => {
  const routeHttpMock = mockHttpRequestForRoute(
    'DemoApp',
    'craft/lazy-layout/:teamId/users/:userId',
    {
      'GET users': 'unusedOrThrow',
    },
  );

  const decisions: Array<
    ReturnType<typeof matchMockHttpRequestForRoute<typeof routeHttpMock>>
  > = [];

  await page.route('**/users', async (route) => {
    const decision = matchMockHttpRequestForRoute(
      routeHttpMock,
      {
        method: route.request().method(),
        url: route.request().url(),
      },
      {
        ignoreUnregisteredRequests: true,
      },
    );

    decisions.push(decision);

    if (decision.kind === 'ignore') {
      await route.continue();
      return;
    }

    if (decision.kind === 'unusedOrThrow') {
      await route.abort('failed');
      return;
    }

    await route.fulfill({
      status:
        decision.response.kind === 'success'
          ? (decision.response.status ?? 200)
          : decision.response.status,
      contentType: 'application/json',
      headers: sanitizeHeaders(decision.response.headers),
      body: JSON.stringify(decision.response.body),
    });
  });

  await page.goto('/');

  await page.evaluate(async () => {
    // This test intentionally exercises the browser's raw request so the route
    // interceptor can prove that it matches the request.
    await fetch('/users').catch(() => undefined);
  });

  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toEqual({
    kind: 'unusedOrThrow',
    message:
      'Route HTTP request "GET http://localhost:3000/users" matched endpoint "GET users" for app "DemoApp" route "craft/lazy-layout/:teamId/users/:userId", but that endpoint is marked as unusedOrThrow.',
  });
});

function sanitizeHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
