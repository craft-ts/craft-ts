import {
  InjectionToken,
  runInInjectionContext,
  type Injector,
  type Provider,
} from './host/craft-compat';

/** Metadata attached to one effective Craft template render. */
export type TemplateTraceContext = Readonly<{
  /** The render unit that produced the children. */
  kind: 'component' | 'block' | 'projection' | 'defer' | 'callback';
  /** The lifecycle phase of the render unit. */
  phase: 'create' | 'initialRender' | 'update' | 'destroy';
  /** The component that owns the render unit, when known. */
  componentName?: string;
  /** A stable name for the render unit, when available. */
  name?: string;
  /** Names of directives composed around the owning component. */
  directiveNames?: readonly string[];
  /** The owning component's render number. */
  renderCount: number;
}>;

/**
 * A synchronous wrapper around a template render.
 *
 * The wrapper can return its own children without calling `next()`, which
 * makes render replacement and render blocking possible. Exceptions from the
 * wrapped render are deliberately not swallowed by the runtime.
 */
export type TemplateTraceWrapper<Children = unknown> = (
  context: TemplateTraceContext,
  next: () => Children,
) => Children;

/** All template trace wrappers active in the current injector. */
export const CRAFT_TEMPLATE_TRACE = new InjectionToken<
  readonly TemplateTraceWrapper<unknown>[]
>('CRAFT_TEMPLATE_TRACE', {
  providedIn: 'root',
  factory: () => [],
  multi: true,
});

/** Register one composable synchronous template trace wrapper. */
export function provideTemplateTrace(wrapper: TemplateTraceWrapper): Provider {
  return {
    provide: CRAFT_TEMPLATE_TRACE,
    useValue: wrapper,
    multi: true,
  };
}

/**
 * Execute a render through the wrappers visible from `injector`.
 *
 * The first registered wrapper is the outermost one, matching the ordering of
 * the other Craft observability hooks. Running each wrapper in the render
 * injector preserves access to component-scoped providers.
 */
export function executeTemplateTrace<Children>(
  injector: Injector,
  context: TemplateTraceContext,
  next: () => Children,
): Children {
  const wrappers = injector.get(CRAFT_TEMPLATE_TRACE, []);
  if (wrappers.length === 0) {
    return next();
  }

  const run = (index: number): Children => {
    if (index === wrappers.length) {
      return next();
    }
    const wrapper = wrappers[
      index
    ] as unknown as TemplateTraceWrapper<Children>;
    return wrapper(context, () => run(index + 1));
  };

  return runInInjectionContext(injector, () => run(0));
}
