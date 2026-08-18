import { Context, Effect, Layer } from 'effect';

export type GreetingServiceShape = {
  readonly greet: (name: string) => Effect.Effect<{ readonly text: string }>;
};

/** A service contract shared by the domain operation and its Craft consumer. */
export class GreetingService extends Context.Service<
  GreetingService,
  GreetingServiceShape
>()('GreetingService') {}

/** The application implementation. It is deliberately outside the component. */
export const GreetingServiceLive = Layer.sync(GreetingService)(() => ({
  greet: (name: string) =>
    Effect.succeed({
      text: `Hello ${name}, this service comes from a shared file.`,
    }),
}));

/** Domain code: its R requirement is GreetingService, not a Craft injector. */
export function loadGreeting(
  name: string,
): Effect.Effect<{ readonly text: string }, never, GreetingService> {
  return Effect.gen(function* () {
    const greetingService = yield* GreetingService;
    return yield* greetingService.greet(name);
  });
}
