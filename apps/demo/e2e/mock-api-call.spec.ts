import { expect, test } from '@playwright/test';
import './demo-route-http-registry';
// E2E type tests intentionally exercise the library source before packaging.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  matchMockHttpRequestForRoute,
  mockHttpRequestForRoute,
} from '../../../libs/core/src/lib/mock-http-request-for-route';

test('should mock a registered users call through matchMockHttpRequestForRoute', async ({
  page,
}) => {
  const routeHttpMock = mockHttpRequestForRoute(
    'DemoApp',
    'craft/lazy-layout/:teamId/users/:userId',
    {
      'GET users': {
        kind: 'mock',
        response: [
          {
            id: '42',
            email: 'ada@craft.ng',
          },
        ],
      },
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
      throw new Error(decision.message);
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

  const response = await page.evaluate(async () => {
    // This test intentionally exercises the browser's raw request so the mock
    // transport can prove that it intercepts the request.
    // eslint-disable-next-line craft-ng/prefer-craft-http-transport
    const result = await fetch('/users');
    return { body: await result.json(), status: result.status };
  });

  expect(response).toEqual({
    status: 200,
    body: [{ id: '42', email: 'ada@craft.ng' }],
  });

  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toEqual({
    kind: 'mock',
    response: {
      kind: 'success',
      body: [
        {
          id: '42',
          email: 'ada@craft.ng',
        },
      ],
    },
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
