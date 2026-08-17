import {
  effect,
  EffectCleanupRegisterFn,
  EffectRef,
  InjectionToken,
  Injector,
} from '../../host/craft-compat';
import { explicitEffect, ExplicitEffectValues } from '../explicit-effect';

export const DYNAMIC_EFFECT_REF_INSTANCE_TOKEN = new InjectionToken<EffectRef>(
  'Injection token used to provide a dynamically created effectRef instance.',
);

export function nestedEffect<T, R, GroupIdentifier extends string>(
  parentInjector: Injector,
  effectFn: (onCleanup: EffectCleanupRegisterFn) => void,
) {
  const injector = Injector.create({
    providers: [
      {
        provide: DYNAMIC_EFFECT_REF_INSTANCE_TOKEN,
        useFactory: () => {
          return effect(effectFn, {
            injector: parentInjector,
          });
        },
      },
    ],
    parent: parentInjector,
  });
  const effectRef = injector.get(DYNAMIC_EFFECT_REF_INSTANCE_TOKEN);
  return effectRef;
}

/**
 * A {@link nestedEffect} that can stop itself from inside its own body.
 *
 * Effects run their first pass synchronously, so the body cannot close over the
 * `EffectRef` the call is about to return — reaching for it during that first
 * pass is a temporal-dead-zone error. The body is handed a `stop` callback
 * instead, and a stop requested before the ref exists is honoured as soon as it
 * does.
 */
export function selfStoppingNestedEffect(
  parentInjector: Injector,
  effectFn: (stop: () => void, onCleanup: EffectCleanupRegisterFn) => void,
): EffectRef {
  let ref: EffectRef | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    ref?.destroy();
  };
  ref = nestedEffect(parentInjector, (onCleanup) => effectFn(stop, onCleanup));
  if (stopped) {
    ref.destroy();
  }
  return ref;
}

export function explicitNestedEffect<
  T,
  R,
  GroupIdentifier extends string,
  Input extends readonly unknown[],
  Params = Input,
>(
  parentInjector: Injector,
  deps: readonly [...ExplicitEffectValues<Input>],
  fn: (deps: Params, onCleanup: EffectCleanupRegisterFn) => void,
) {
  const injector = Injector.create({
    providers: [
      {
        provide: DYNAMIC_EFFECT_REF_INSTANCE_TOKEN,
        useFactory: () => {
          return explicitEffect(deps, fn, {
            injector: parentInjector,
          });
        },
      },
    ],
    parent: parentInjector,
  });
  const effectRef = injector.get(DYNAMIC_EFFECT_REF_INSTANCE_TOKEN);
  return effectRef;
}
