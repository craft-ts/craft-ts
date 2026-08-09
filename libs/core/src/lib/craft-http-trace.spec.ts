import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { CRAFT_HTTP_TRACE, executeCraftHttpTrace } from './craft-http-trace';

describe('craft http trace', () => {
  it('wraps a CraftHttpClient request and preserves its result', async () => {
    const calls: string[] = [];

    const injector = Injector.create({
      providers: [
        {
          provide: CRAFT_HTTP_TRACE,
          multi: true,
          useValue: async (context: unknown, next: () => Promise<unknown>) => {
            calls.push(JSON.stringify(context));
            return next();
          },
        },
      ],
    });

    await expect(
      executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/users' },
        async () => ({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toEqual(['{"method":"GET","url":"/users"}']);
  });
});
