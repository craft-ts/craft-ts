import { Clock, Context, Effect, Layer } from 'effect';

export type StreamInteropClockShape = {
  readonly currentTimeMillis: Effect.Effect<number, never, Clock.Clock>;
};

export class StreamInteropClock extends Context.Service<
  StreamInteropClock,
  StreamInteropClockShape
>()('demo-effect/StreamInteropClock') {}

export const StreamInteropClockLive = Layer.effect(StreamInteropClock)(
  Effect.map(Clock.Clock, (clock) => ({
    currentTimeMillis: clock.currentTimeMillis,
  })),
);
