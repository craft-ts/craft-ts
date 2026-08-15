import type { GetDeps } from './branded-component/branded-component';
import { craftToken } from './host/craft-injector';

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

export const COMPONENT_REGISTER =
  craftToken<ComponentRegister>('ComponentRegister');

export const ɵfallbackComponentRegister = createComponentRegister();

export type GenDeps_ComponentRegister = GetDeps<{
  deps: {};
  provided: {};
}>;
