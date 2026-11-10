/**
 * The page's own `Date` during a replay. Craft code reads the hour through
 * `CraftTemporalRuntime.dateNow()`, which the replay's virtual clock answers
 * with the hour of the recording; code that reads `Date` directly (a library,
 * an app without the `no-direct-temporal-globals` rule) read the hour of the
 * replay instead, and a countdown or a « today » it computed differed.
 *
 * While a replay runs, `Date.now()` and `new Date()` follow the replay's
 * civil clock: the hour it last moved to, plus the real time elapsed since.
 * Time keeps flowing between two steps (a deadline computed from `Date`
 * still expires), and each step of the replay puts it back on the recording.
 */

const NativeDate = globalThis.Date;

/** The real wall clock, whatever `Date` the page has: the replay's own deadlines. */
export function realDateNow(): number {
  return NativeDate.now();
}

/**
 * Makes `Date` follow `civilNow` until the returned function is called. A
 * `Date` replaced since (another replay, fake timers) is left as it is.
 */
export function followReplayCivilDate(civilNow: () => number): () => void {
  const Current = globalThis.Date;
  let anchorCivil = civilNow();
  let anchorReal = realDateNow();
  const now = (): number => {
    const civil = civilNow();
    if (civil !== anchorCivil) {
      anchorCivil = civil;
      anchorReal = realDateNow();
    }
    return anchorCivil + (realDateNow() - anchorReal);
  };
  const ReplayDate = function (this: unknown, ...args: unknown[]) {
    if (new.target === undefined) return new Current(now()).toString();
    return args.length === 0
      ? new Current(now())
      : new (Current as unknown as new (...values: unknown[]) => Date)(...args);
  } as unknown as DateConstructor;
  Object.setPrototypeOf(ReplayDate, Current);
  Object.defineProperty(ReplayDate, 'prototype', { value: Current.prototype });
  Object.defineProperty(ReplayDate, 'now', { value: now, writable: true, configurable: true });
  globalThis.Date = ReplayDate;
  return () => {
    if (globalThis.Date === ReplayDate) globalThis.Date = Current;
  };
}
