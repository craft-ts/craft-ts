import {
  effect,
  EffectCleanupRegisterFn,
  EffectRef,
  InjectionToken,
  Injector,
} from '@angular/core';
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
