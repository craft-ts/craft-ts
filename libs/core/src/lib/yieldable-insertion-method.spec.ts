import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { asyncProcess } from './async-process';
import { craftUse } from './craft-use';
import { craftPipe } from './craft-pipe';
import { isGenerator } from './craft-generator-runtime';
import { mutation } from './mutation';
import { query } from './query';
import { source$ } from './source$';
import { state } from './state';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('yieldable insertion methods', () => {
  it('returns a yieldable invocation for state methods and source adapters', () => {
    TestBed.runInInjectionContext(() => {
      const counter = craftUse(
        state('counter', 0, ({ set }) => ({
          increment: () => set(1),
          read: () => 1,
          reset$: source$<void>('reset$'),
        })),
      );

      const increment = counter.increment();
      expect(isGenerator(increment)).toBe(true);
      expect(craftUse(counter())).toBe(1);
      expect(craftUse(increment)).toBe(1);
      expect(craftUse(counter.read())).toBe(1);

      const reset = counter.reset$();
      expect(isGenerator(reset)).toBe(true);
      expect(craftUse(reset)).toBeUndefined();
    });
  });

  it('allows a later pipe member to delegate to an earlier method', () => {
    TestBed.runInInjectionContext(() => {
      const counter = craftUse(
        state('counter', 0, (context) =>
          craftPipe(
            context,
            ({ update }) => ({
              increment: () => update((value) => value + 1),
            }),
            function* ({ insertions }) {
              return {
                incrementTwice: function* () {
                  yield* insertions.increment();
                  return yield* insertions.increment();
                },
              };
            },
          ),
        ),
      );

      expect(craftUse(counter.incrementTwice())).toBe(2);
      expect(craftUse(counter())).toBe(2);
    });
  });

  it('wraps methods added to query, mutation and asyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () => 'initial',
            loader: async () => ({ value: 0 }),
          },
          ({ set }) => ({ mark: () => set({ value: 1 }) }),
        ),
      );
      const mutationRef = craftUse(
        mutation(
          'mutationRef',
          {
            method: (value: number) => value,
            loader: async ({ params }) => ({ value: params }),
          },
          ({ set }) => ({ mark: () => set({ value: 2 }) }),
        ),
      );
      const processRef = craftUse(
        asyncProcess(
          'processRef',
          {
            method: (value: number) => value,
            loader: async ({ params }) => ({ value: params }),
          },
          ({ set }) => ({ mark: () => set({ value: 3 }) }),
        ),
      );

      expect(isGenerator(queryRef.mark())).toBe(true);
      expect(isGenerator(mutationRef.mark())).toBe(true);
      expect(isGenerator(processRef.mark())).toBe(true);
      expect(craftUse(queryRef.mark())).toBeUndefined();
      expect(craftUse(mutationRef.mark())).toBeUndefined();
      expect(craftUse(processRef.mark())).toBeUndefined();
    });
  });
});
