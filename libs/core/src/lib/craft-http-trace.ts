import {
  InjectionToken,
  Injector,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';

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

export const CRAFT_HTTP_TRACE = new InjectionToken<
  readonly CraftHttpTraceWrapper[]
>('CRAFT_HTTP_TRACE', {
  providedIn: 'root',
  factory: () => [],
  multi: true,
});

export function provideCraftHttpTrace(
  wrapper: CraftHttpTraceWrapper,
): Provider {
  return {
    provide: CRAFT_HTTP_TRACE,
    useValue: wrapper,
    multi: true,
  };
}

export function executeCraftHttpTrace<Value>(
  injector: Injector,
  context: CraftHttpTraceContext,
  next: () => Promise<Value>,
): Promise<Value> {
  const wrappers = injector.get(CRAFT_HTTP_TRACE, []);
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
