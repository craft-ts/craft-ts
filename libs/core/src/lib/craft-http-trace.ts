import {
  Injector,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';
import { craftService } from './craft-service';
import { isCraftDevelopment } from './craft-runtime-mode';

export type CraftHttpTraceContext = Readonly<{
  method: string;
  url: string;
  params?: unknown;
  payload?: unknown;
}>;

export type CraftHttpTraceWrapper = (
  context: CraftHttpTraceContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

const craftHttpTraceService = craftService(
  { name: 'CraftHttpTraces', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: CraftHttpTraceWrapper }) =>
    inputs.$provided ? [inputs.$provided] : [],
) as unknown as {
  provideCraftHttpTraces: (value?: CraftHttpTraceWrapper) => unknown;
  CRAFT_HTTP_TRACES_META_DATA: { inject(): readonly CraftHttpTraceWrapper[] };
};

export const ɵinjectCraftHttpTraces = (
  injector?: Injector,
): readonly CraftHttpTraceWrapper[] => {
  try {
    return injector
      ? runInInjectionContext(injector, () =>
          craftHttpTraceService.CRAFT_HTTP_TRACES_META_DATA.inject(),
        )
      : craftHttpTraceService.CRAFT_HTTP_TRACES_META_DATA.inject();
  } catch {
    return [];
  }
};

export function provideCraftHttpTrace(
  wrapper: CraftHttpTraceWrapper,
): Provider {
  return craftHttpTraceService.provideCraftHttpTraces(wrapper) as Provider;
}

export function executeCraftHttpTrace<Value>(
  injector: Injector,
  context: CraftHttpTraceContext,
  next: () => Promise<Value>,
): Promise<Value> {
  if (!isCraftDevelopment(injector)) {
    return next();
  }
  const wrappers = ɵinjectCraftHttpTraces(injector);
  if (wrappers.length === 0) {
    return next();
  }

  const run = (index: number): Promise<Value> => {
    if (index === wrappers.length) {
      return next();
    }

    const wrapper = wrappers[index];
    return wrapper(context, () => run(index + 1)) as Promise<Value>;
  };

  return runInInjectionContext(injector, () => run(0));
}
