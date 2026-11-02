import { expect as playwrightExpect } from '@playwright/test';

/**
 * When the current test's last assertion PASSED (`Date.now()`, the clock of
 * the page events too). An e2e step that happened after it was exercised but
 * never observed: the behaviour catalog does not count it as a proof.
 *
 * Playwright runs one test at a time per worker, so a module variable is the
 * test's own; the session fixture resets it at the start of each test.
 */
let lastPassedAt: number | undefined;

export function resetAssertionClock(): void {
  lastPassedAt = undefined;
}

export function lastAssertionPassedAt(): number | undefined {
  return lastPassedAt;
}

const passed = () => {
  lastPassedAt = Date.now();
};

type AnyFunction = (...args: unknown[]) => unknown;

/** `expect(x)`, `.not`, `.resolves`…: every matcher reached through it is timed. */
function watchMatchers<T>(matchers: T): T {
  if (typeof matchers !== 'object' || matchers === null) return matchers;
  return new Proxy(matchers, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = (value as AnyFunction).apply(target, args);
          if (result instanceof Promise) {
            // The test awaits the matcher's own promise; this one only times it.
            result.then(passed, () => undefined);
            return result;
          }
          passed();
          return result;
        };
      }
      return watchMatchers(value);
    },
  });
}

function watchExpect<E extends AnyFunction>(base: E): E {
  return new Proxy(base, {
    apply: (target, thisArg, args) => watchMatchers(Reflect.apply(target, thisArg, args)),
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      if (key === 'soft' || key === 'poll')
        return (...args: unknown[]) => watchMatchers((value as AnyFunction).apply(target, args));
      if (key === 'extend' || key === 'configure')
        return (...args: unknown[]) => watchExpect((value as AnyFunction).apply(target, args) as AnyFunction);
      return value;
    },
  });
}

/** Playwright's `expect`, unchanged for the test, timed for the session history. */
export const expect: typeof playwrightExpect = watchExpect(
  playwrightExpect as unknown as AnyFunction,
) as unknown as typeof playwrightExpect;
