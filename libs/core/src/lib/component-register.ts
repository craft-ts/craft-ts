import type { GetDeps } from './branded-component/branded-component';
import { inject, type InjectionToken, type Provider } from './host/craft-compat';

export type ComponentRegister = { next(): number };

export function createComponentRegister(): ComponentRegister {
  let counter = 0;
  return {
    next() {
      counter += 1;
      return counter;
    },
  };
}

type ComponentRegisterHelper = () =>
  Generator<unknown, ComponentRegister, unknown>;
export const COMPONENT_REGISTER = Object.freeze({});

export const ComponentRegister: ComponentRegisterHelper = function* () {
  return ɵinjectComponentRegister() ?? ɵfallbackComponentRegister;
};
export const provideComponentRegister =
  (value: ComponentRegister): Provider =>
    ({ provide: COMPONENT_REGISTER, useValue: value });
export const ɵinjectComponentRegister = (): ComponentRegister | null => {
  try {
    return inject(
      COMPONENT_REGISTER as InjectionToken<ComponentRegister>,
      { optional: true },
    );
  } catch {
    return null;
  }
};

export const ɵfallbackComponentRegister = createComponentRegister();

export type GenDeps_ComponentRegister = GetDeps<{
  deps: {};
  provided: {};
}>;
