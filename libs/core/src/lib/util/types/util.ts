import {
  effect,
  EffectCleanupRegisterFn,
  EffectRef,
  Injector,
  runInInjectionContext,
} from '../../host/craft-compat';
import { craftService, type CraftServiceProvider } from '../../craft-service';
import { explicitEffect, ExplicitEffectValues } from '../explicit-effect';

const dynamicEffectRefInstanceService = craftService(
  { name: 'DynamicEffectRefInstance', providedIn: 'toProvide' },
  (inputs: { $provided?: () => EffectRef }) => inputs.$provided?.(),
) as unknown as {
  provideDynamicEffectRefInstance: (value: () => EffectRef) => CraftServiceProvider;
  DYNAMIC_EFFECT_REF_INSTANCE_META_DATA: { inject(): EffectRef };
};

export function nestedEffect<T, R, GroupIdentifier extends string>(
  parentInjector: Injector,
  effectFn: (onCleanup: EffectCleanupRegisterFn) => void,
) {
  const injector = Injector.create({
    providers: [
      dynamicEffectRefInstanceService.provideDynamicEffectRefInstance(() =>
        effect(effectFn, { injector: parentInjector }),
      ),
    ],
    parent: parentInjector,
  });
  const effectRef = runInInjectionContext(injector, () =>
    dynamicEffectRefInstanceService.DYNAMIC_EFFECT_REF_INSTANCE_META_DATA.inject(),
  );
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
  // eslint-disable-next-line prefer-const -- the callback may stop before the effect ref exists.
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
      dynamicEffectRefInstanceService.provideDynamicEffectRefInstance(() =>
        explicitEffect(deps, fn, { injector: parentInjector }),
      ),
    ],
    parent: parentInjector,
  });
  const effectRef = runInInjectionContext(injector, () =>
    dynamicEffectRefInstanceService.DYNAMIC_EFFECT_REF_INSTANCE_META_DATA.inject(),
  );
  return effectRef;
}
