import {
  ɵinjectCraftTemporalRuntime,
  type CraftTemporalRuntime,
} from '@craft-ts/core';
import { Clock, Duration, Effect, Layer } from 'effect';

// ---------------------------------------------------------------------------
// One clock for craft and Effect.
//
// Every timer in craft — streams, `craftSleep`, `asyncProcess`, `query` retries
// — runs on the temporal runtime, so a test drives them all with one
// `VirtualCraftTemporalRuntime`. Effect has its own `Clock`: an `Effect.sleep`,
// a `Schedule` or a `Stream.schedule` inside an Effect program would keep real
// time and need real waiting (or Effect's own `TestClock`) to test.
//
// `craftTemporalClock()` is a Layer that points Effect's Clock at the temporal
// runtime. It is opt-in: provide it where Effect time and craft time should be
// the same time (`provideLayer(craftTemporalClock())`).
// ---------------------------------------------------------------------------

type TemporalSource = CraftTemporalRuntime | (() => CraftTemporalRuntime);

const NANOS_PER_MILLI = 1_000_000n;

/**
 * An Effect `Clock` that reads and sleeps on the craft temporal runtime.
 *
 * - `currentTimeMillis` is the runtime's civil time (`dateNow`), the monotonic
 *   readings are its monotonic `now`;
 * - `sleep` is a cancellable task on the runtime: interrupting the fiber (an
 *   unsubscribed stream, a destroyed injector) cancels the task.
 *
 * Without an argument the runtime is looked up on every call, so the one a test
 * activates with `activateCraftTemporalRuntime` is the one used.
 */
export function craftTemporalClockService(
  source: TemporalSource = ɵinjectCraftTemporalRuntime,
): Clock.Clock {
  const temporal = () => (typeof source === 'function' ? source() : source);
  const nowMillis = () => temporal().dateNow();
  const monotonicNanos = () =>
    BigInt(Math.round(temporal().now() * 1000)) * 1000n;
  return {
    currentTimeMillisUnsafe: nowMillis,
    currentTimeMillis: Effect.sync(nowMillis),
    currentTimeNanosUnsafe: () => BigInt(nowMillis()) * NANOS_PER_MILLI,
    currentTimeNanos: Effect.sync(() => BigInt(nowMillis()) * NANOS_PER_MILLI),
    monotonicTimeNanosUnsafe: monotonicNanos,
    monotonicTimeNanos: Effect.sync(monotonicNanos),
    sleep: (duration) =>
      Effect.callback<void>((resume) => {
        const handle = temporal().schedule(
          () => resume(Effect.void),
          Duration.toMillis(duration),
          { kind: 'effect-sleep' },
        );
        return Effect.sync(() => handle.cancel());
      }),
  };
}

/** A Layer providing {@link craftTemporalClockService}. */
export function craftTemporalClock(source?: TemporalSource) {
  return Layer.succeed(Clock.Clock)(craftTemporalClockService(source));
}
