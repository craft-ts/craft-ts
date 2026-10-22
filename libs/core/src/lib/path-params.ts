import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
  Signal,
  signal,
  WritableSignal,
} from './host/craft-compat';
import {
  AnyCraftException,
  craftException,
  isCraftException,
} from './craft-exception';
import {
  createNamedPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import { ɵinjectCraftHistory, ɵinjectCraftMatch } from './craft-router-tokens';
import { craftWatch } from './host/craft-signal';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcreateHostTaggedInjector } from './craft-service';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  yieldableInvocation,
} from './yieldable';
import { ɵregisterCraftReplayMethod } from './craft-method-replay-registry';
import {
  createYieldableReactiveFacade,
  isYieldableReactiveValue,
  nameInsertedReactiveValue,
  type YieldableReactiveProperties,
  type YieldableReactiveValue,
} from './reactive-read';

export interface PathParamsNavigationOptions {
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
}

export interface PathParamsCodec<T = unknown, Encoded extends string = string> {
  decode(input: string): T | AnyCraftException;
  encode(value: T): Encoded | AnyCraftException;
}

export interface PathParamsConfig<T = unknown, Encoded extends string = string>
  extends PathParamsNavigationOptions {
  codec?: PathParamsCodec<T, Encoded>;
  /** Used when the current URL cannot be decoded. Without it, the raw segment is retained. */
  fallbackValue?: T;
}

const PATH_PARAMS_DEFINITION = Symbol('path-params-definition');

export interface PathParamsDefinition<
  Name extends string = string,
  T = unknown,
  Encoded extends string = string,
  Insertions extends object = Record<never, never>,
> {
  readonly name: Name;
  readonly config: PathParamsConfig<T, Encoded>;
  readonly insertion?: (context: PathParamsInsertionContext<T>) => Insertions;
  readonly [PATH_PARAMS_DEFINITION]: true;
}

export type AnyPathParamsDefinition = PathParamsDefinition<any, any, any, any>;

export type PathParamDecodeError<Name extends string = string> =
  import('./craft-exception').CraftExceptionResult<
    { _tag: 'PathParamDecodeError'; scope: 'parse'; identifier: Name },
    { name: Name; value: string; error: unknown }
  >;

export type PathParamEncodeError<Name extends string = string> =
  import('./craft-exception').CraftExceptionResult<
    { _tag: 'PathParamEncodeError'; scope: 'serialize'; identifier: Name },
    { name: Name; value: unknown; error: unknown }
  >;

export interface PathParamsInsertionContext<T> {
  value: Signal<T>;
  set(
    value: T,
    options?: PathParamsNavigationOptions,
  ): Generator<unknown, T, unknown>;
  update(
    updater: (value: T) => T,
    options?: PathParamsNavigationOptions,
  ): Generator<unknown, T, unknown>;
}

export type PathParamsRef<
  Name extends string,
  T,
  Insertions extends object = Record<never, never>,
> = YieldableReactiveValue<T> &
  YieldableReactiveProperties<
    Insertions & {
      value: Signal<T>;
      set(
        value: T,
        options?: PathParamsNavigationOptions,
      ): Generator<unknown, T, unknown>;
      update(
        updater: (value: T) => T,
        options?: PathParamsNavigationOptions,
      ): Generator<unknown, T, unknown>;
      hasException: Signal<boolean>;
      exception: Signal<AnyCraftException | null>;
      _config: PathParamsConfig<T>;
    }
  > & { readonly __pathParamName?: Name };

export type PathParamsRefOf<Definition> =
  Definition extends PathParamsDefinition<
    infer Name,
    infer T,
    any,
    infer Insertions
  >
    ? PathParamsRef<Name, T, Insertions>
    : never;

export type PathParamsDecodeExceptions<Definition> =
  Definition extends PathParamsDefinition<infer Name, unknown, string, object>
    ? Definition['config'] extends { fallbackValue: unknown }
      ? never
      : Definition['config'] extends {
            codec: { decode: (...args: any[]) => infer Decoded };
          }
        ? Extract<Decoded, AnyCraftException> | PathParamDecodeError<Name>
        : never
    : never;

/**
 * Creates a route-scoped primitive for one `:parameter` segment. Without a codec,
 * the URL segment is exposed as a string. `set` updates only that segment and
 * pushes a history entry unless `replaceUrl` is set.
 */
export function pathParams<Name extends string>(
  name: Name,
): PathParamsDefinition<Name, string>;
export function pathParams<
  Name extends string,
  T,
  Encoded extends string = string,
>(
  name: Name,
  config: PathParamsConfig<T, Encoded>,
): PathParamsDefinition<Name, T, Encoded>;
export function pathParams<
  Name extends string,
  T,
  Encoded extends string = string,
  Insertions extends object = Record<never, never>,
>(
  name: Name,
  config: PathParamsConfig<T, Encoded>,
  insertion: (context: PathParamsInsertionContext<T>) => Insertions,
): PathParamsDefinition<Name, T, Encoded, Insertions>;
export function pathParams(
  name: string,
  config: PathParamsConfig<any> = {},
  insertion?: (context: PathParamsInsertionContext<any>) => object,
): PathParamsDefinition<any, any, any, any> {
  return {
    name,
    config,
    ...(insertion ? { insertion } : {}),
    [PATH_PARAMS_DEFINITION]: true,
  };
}

export function ɵisPathParamsDefinition(
  value: unknown,
): value is PathParamsDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    PATH_PARAMS_DEFINITION in value
  );
}

export function ɵcreatePathParamsPrimitive(
  name: string,
  config: PathParamsConfig<any> = {},
  insertion?: (context: PathParamsInsertionContext<any>) => object,
): NamedCraftPrimitiveGen<string, any> {
  assertInInjectionContext(ɵcreatePathParamsPrimitive);
  const injector = inject(Injector);

  const hostInjector = ɵcreateHostTaggedInjector(
    injector,
    `pathParams:${name}`,
  );
  const match = ɵinjectCraftMatch();
  const history = ɵinjectCraftHistory();
  if (!match || !history)
    throw new Error('pathParams must be provided by an active Craft route.');
  const currentRaw = () => match()?.params[name] ?? '';
  const currentException = signal<AnyCraftException | null>(null);
  const decode = (raw: string): any => {
    if (!config.codec) return raw;
    try {
      const decoded = config.codec.decode(raw);
      if (isCraftException(decoded)) {
        currentException.set({
          ...decoded,
          scope: 'parse',
          identifier: name,
          [decoded._tag]: decoded.payload,
        });
        return config.fallbackValue !== undefined ? config.fallbackValue : raw;
      }
      currentException.set(null);
      return decoded;
    } catch (error) {
      currentException.set(
        craftException(
          { _tag: 'PathParamDecodeError', scope: 'parse', identifier: name },
          { name, value: raw, error },
        ),
      );
      return config.fallbackValue !== undefined ? config.fallbackValue : raw;
    }
  };
  const state = signal(decode(currentRaw())) as WritableSignal<any>;
  const watch = craftWatch(() => state.set(decode(currentRaw())));
  inject(DestroyRef).onDestroy(() => watch.destroy());
  const value = computed(() => state());
  const replaceSegment = (
    rawPath: string,
    routePath: string,
    newValue: string,
  ) => {
    const routeSegments = routePath.split('/');
    const pathSegments = rawPath.split('/');
    const routeIndex = routeSegments.findIndex(
      (segment) =>
        segment.startsWith(':') &&
        segment.replace(/^:/, '').replace(/\?$/, '') === name,
    );
    const index = routeIndex + (pathSegments[0] === '' ? 1 : 0);
    if (routeIndex < 0 || index >= pathSegments.length)
      throw new Error(
        `Path parameter :${name} is not present in the active route.`,
      );
    pathSegments[index] = encodeURIComponent(newValue);
    return pathSegments.join('/');
  };
  const set = (next: any, options?: PathParamsNavigationOptions) => {
    let encoded: string;
    try {
      const result = config.codec ? config.codec.encode(next) : String(next);
      if (isCraftException(result)) throw result;
      encoded = String(result);
    } catch (error) {
      throw craftException(
        { _tag: 'PathParamEncodeError', scope: 'serialize', identifier: name },
        { name, value: next, error },
      );
    }
    const active = match();
    if (!active)
      throw new Error(
        'Cannot update a path parameter when no Craft route is active.',
      );
    const pathname = replaceSegment(
      active.pathname,
      active.routes
        .map((route) => route.path)
        .filter(Boolean)
        .join('/'),
      encoded,
    );
    state.set(next);
    const url = `${pathname}${history.get().search}${history.get().hash}`;
    const nav = { ...config, ...options };
    if (nav.skipLocationChange) history.skip(url, null);
    else if (nav.replaceUrl) history.replace(url);
    else history.push(url);
    return next;
  };
  const update = (
    updater: (value: any) => any,
    options?: PathParamsNavigationOptions,
  ) => set(updater(value()), options);
  const exposed = {
    set: (...args: Parameters<typeof set>) => yieldableInvocation(set(...args)),
    update: (...args: Parameters<typeof update>) =>
      yieldableInvocation(update(...args)),
  };
  const methods = Object.assign(
    {
      value,
      hasException: computed(() => currentException() !== null),
      exception: currentException,
      _config: config,
    },
    exposed,
  );

  const insertionValues = insertion
    ? runInInjectionContext(hostInjector, () =>
        insertion({ value, set: exposed.set, update: exposed.update }),
      )
    : {};
  const wrapped = Object.fromEntries(
    Object.entries(insertionValues).map(([key, member]) => {
      if (
        typeof member !== 'function' ||
        isSignal(member) ||
        isNonYieldableInsertionMethod(member) ||
        isYieldableReactiveValue(member)
      )
        return [
          key,
          nameInsertedReactiveValue(
            member,
            key,
            'pathParams',
            `${name}.${key}`,
          ),
        ];
      const methodInjector = ɵcreateHostTaggedInjector(
        hostInjector,
        `method:${key}`,
      );
      const fn = runInInjectionContext(methodInjector, () =>
        injectFnWrapper()(member as (...args: unknown[]) => unknown),
      );
      const method = createYieldableInsertionMethod(fn, {
        injector: methodInjector,
        invalidYieldErrorMessage:
          'pathParams generators can only yield craftService dependencies or exposed dependency helpers.',
        multipleAppStartErrorMessage:
          'pathParams generators do not support onAppStart(...).',
        onAppStartNotSupportedErrorMessage:
          'pathParams generators do not support onAppStart(...).',
      });
      ɵregisterCraftReplayMethod(methodInjector, (_receiver, args) =>
        method(...args),
      );
      return [key, method];
    }),
  );
  const result = Object.assign(value, methods, wrapped);
  return createNamedPrimitiveGen(
    name,
    createYieldableReactiveFacade(result, {
      name,
      primitive: 'pathParams',
      path: name,
    }),
  ) as any;
}
