import { Injector } from './host/craft-compat';
import { describe, expect, it } from 'vitest';
import {
  executeCraftHttpTrace,
  provideCraftHttpTrace,
} from './craft-http-trace';
import { provideCraftProduction } from './craft-runtime-mode';

describe('craft http trace', () => {
  it('wraps a CraftHttpClient request and preserves its result', async () => {
    const calls: string[] = [];

    const injector = Injector.create({
      providers: [
        provideCraftHttpTrace(
          async (context, next) => {
            calls.push(JSON.stringify(context));
            return next();
          },
        ),
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

  it('skips trace wrappers in production mode', async () => {
    const calls: string[] = [];
    const injector = Injector.create({
      providers: [
        provideCraftProduction(),
        provideCraftHttpTrace(
          async (_context, next) => {
            calls.push('trace');
            return next();
          },
        ),
      ],
    });

    await expect(
      executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/users' },
        async () => 'ok',
      ),
    ).resolves.toBe('ok');

    expect(calls).toEqual([]);
  });
});
