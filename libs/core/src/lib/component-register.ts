import type { GetDeps } from './branded-component/branded-component';
import { craftService } from './craft-service';

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
const componentRegisterService = craftService(
  { name: 'ComponentRegister', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: ComponentRegister }) => inputs.$provided,
) as unknown as {
  ComponentRegister: ComponentRegisterHelper;
  provideComponentRegister: (value: ComponentRegister) => unknown;
  COMPONENT_REGISTER_META_DATA: { inject(): ComponentRegister };
};

export const ComponentRegister = componentRegisterService.ComponentRegister;
export const provideComponentRegister =
  (value: ComponentRegister): unknown =>
    componentRegisterService.provideComponentRegister(value);
export const ɵinjectComponentRegister = (): ComponentRegister | null => {
  try {
    return componentRegisterService.COMPONENT_REGISTER_META_DATA.inject() as ComponentRegister;
  } catch {
    return null;
  }
};

export const ɵfallbackComponentRegister = createComponentRegister();

export type GenDeps_ComponentRegister = GetDeps<{
  deps: {};
  provided: {};
}>;
