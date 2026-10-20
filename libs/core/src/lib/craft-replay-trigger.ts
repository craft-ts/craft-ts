import { runInInjectionContext, type Injector } from './host/craft-compat';
import { ɵinjectCorrelationIdServiceIn } from './correlation-id';
import { isCraftReplaying } from './craft-replay';
import { ɵcaptureCraftReplayTarget } from './craft-replay-target';
import { ɵinjectSendContextSession } from './send-context-to-ai.tokens';

export type CraftReplayTrigger = Readonly<{
  name: string;
  target: Element;
  coordinates?: Readonly<{ clientX: number; clientY: number }>;
  detail?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/** Run a native-triggered handler with a recorded semantic timeline marker. */
export function runCraftReplayTrigger<Result>(
  injector: Injector,
  trigger: CraftReplayTrigger,
  handler: (correlationId?: string) => Result,
): Result {
  const { session, correlationId } = runInInjectionContext(injector, () => {
    const activeSession = ɵinjectSendContextSession();
    const service = ɵinjectCorrelationIdServiceIn(injector);
    const active =
      !isCraftReplaying() && activeSession?.activeClip !== undefined;
    return {
      session: active ? activeSession : null,
      correlationId: active ? service?.generateAndSet(trigger.name) : undefined,
    };
  });

  if (session && correlationId) {
    const replayTarget = ɵcaptureCraftReplayTarget(trigger.target);
    session.capture('gesture', 'emitted', {
      name: `gesture:${trigger.name}`,
      correlationId,
      payload: {
        trigger: trigger.name,
        replayTarget,
        ...(trigger.coordinates ?? {}),
        ...(trigger.detail ? { detail: trigger.detail } : {}),
      },
      targets: [{ tagName: trigger.target.tagName }],
    });
  }

  return handler(correlationId);
}
