import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstValueFrom, take } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertInInjectionContext,
  createEnvironmentInjector,
  DestroyRef,
  effect,
  inject,
  InjectionToken,
  Injector,
  isDevMode,
  signal,
  toObservable,
  ɵsetCraftDevMode,
  ɵsetCraftInjectFallback,
} from './craft-compat';
import { craftEffect } from '../craft-effect';
import type { CraftSignal } from './craft-signal';
import { CRAFT_SIGNAL } from './craft-signal';

describe('isDevMode', () => {
  afterEach(() => {
    ɵsetCraftDevMode(undefined);
  });

  it('is not hardcoded to true', () => {
    ɵsetCraftDevMode(false);
    expect(isDevMode()).toBe(false);
    ɵsetCraftDevMode(true);
    expect(isDevMode()).toBe(true);
  });

  it('follows an explicit production override', () => {
    ɵsetCraftDevMode(false);
    expect(isDevMode()).toBe(false);
  });
});

describe('effect destroy', () => {
  it('stops after the injector DestroyRef is destroyed', () => {
    const count = signal(0);
    const seen: number[] = [];
    const injector = createEnvironmentInjector([], Injector.NULL);

    injector.run(() => {
      effect(() => {
        seen.push(count());
      });
    });

    expect(seen).toEqual([0]);
    count.set(1);
    expect(seen).toEqual([0, 1]);

    injector.destroy();
    count.set(2);
    expect(seen).toEqual([0, 1]);
  });

  it('binds to options.injector DestroyRef', () => {
    const count = signal(0);
    const seen: number[] = [];
    const injector = createEnvironmentInjector([], Injector.NULL);

    effect(
      () => {
        seen.push(count());
      },
      { injector },
    );

    count.set(1);
    expect(seen).toEqual([0, 1]);
    injector.destroy();
    count.set(2);
    expect(seen).toEqual([0, 1]);
  });
});

describe('inject skipSelf', () => {
  it('does not recurse into the current injector factory', () => {
    const Token = new InjectionToken<readonly string[]>('HostTagList');
    const parent = createEnvironmentInjector(
      [{ provide: Token, useValue: ['root'] }],
      Injector.NULL,
    );
    const child = createEnvironmentInjector(
      [
        {
          provide: Token,
          useFactory: () => {
            const inherited =
              inject(Token, { optional: true, skipSelf: true }) ?? [];
            return [...inherited, 'child'];
          },
        },
      ],
      parent,
    );

    expect(child.get(Token)).toEqual(['root', 'child']);
  });
});

describe('inject fallback', () => {
  afterEach(() => {
    ɵsetCraftInjectFallback(undefined);
  });

  it('does not create an Angular require() fallback', () => {
    expect(() => inject(DestroyRef)).toThrow();
  });

  it('treats an Angular injection context as in-context', () => {
    const host = createEnvironmentInjector([], Injector.NULL);
    ɵsetCraftInjectFallback((token) => {
      if (token === Injector) {
        return host;
      }
      throw new Error(`No fallback for ${String(token)}`);
    });

    expect(() => inject(Injector)).not.toThrow();
    expect(inject(Injector)).toBe(host);
    expect(() => assertInInjectionContext()).not.toThrow();
    expect(() =>
      craftEffect('fallback-effect', () => undefined, { injector: host }),
    ).not.toThrow();
  });
});

describe('toObservable', () => {
  it('emits the initial value once', async () => {
    const count = signal(7);
    const values: number[] = [];
    const sub = toObservable(count).subscribe((value) => values.push(value));
    expect(values).toEqual([7]);
    count.set(8);
    expect(values).toEqual([7, 8]);
    sub.unsubscribe();
  });

  it('stops after the given injector is destroyed', async () => {
    const count = signal(0);
    const injector = createEnvironmentInjector([], Injector.NULL);
    const values: number[] = [];
    toObservable(count, { injector }).subscribe((value) => values.push(value));
    count.set(1);
    expect(values).toEqual([0, 1]);
    injector.destroy();
    count.set(2);
    expect(values).toEqual([0, 1]);
  });

  it('can be consumed with take(1) after a single initial emit', async () => {
    const ready = signal(true);
    const value = await firstValueFrom(
      toObservable(ready).pipe(take(1)),
    );
    expect(value).toBe(true);
  });
});

describe('CraftSignal brand', () => {
  type PlainFunctionIsNotCraftSignal = (() => number) extends CraftSignal<number>
    ? never
    : true;

  it('requires the brand so a plain callable is not a CraftSignal', () => {
    const brandRequired: PlainFunctionIsNotCraftSignal = true;
    expect(brandRequired).toBe(true);
    expect(CRAFT_SIGNAL).toBeDefined();
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'craft-signal.ts'),
      'utf8',
    );
    expect(source).toMatch(/readonly \[CRAFT_SIGNAL\]: true;/);
    expect(source).not.toMatch(/readonly \[CRAFT_SIGNAL\]\?: true;/);
  });
});
