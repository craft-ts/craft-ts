import type { Injector } from './host/craft-compat';
import {
  craftException,
  type AnyCraftException,
  type CraftExceptionResult,
} from './craft-exception';
import {
  SERVICE_RUNTIME_OVERRIDES,
  SERVICE_YIELD_REQUEST_MARKER,
  type ServiceTrackingMetadata,
  type ServiceYieldRequest,
} from './craft-service';
import type { CraftDecoder } from './craft-codec';
import { executeCraftHttpTrace } from './craft-http-trace';
import {
  craftFetchTransport,
  type CraftHttpResponse,
  ɵgetCraftHttpResponseMetadata,
} from './host/craft-http';

declare const CRAFT_HTTP_CLIENT_SUCCESS_MARKER: unique symbol;
declare const CRAFT_HTTP_CLIENT_EXCEPTIONS_MARKER: unique symbol;
declare const CRAFT_HTTP_CLIENT_EXCEPTION_TYPE_DEPENDENCIES_MARKER: unique symbol;
declare const CRAFT_HTTP_CLIENT_EXCEPTION_BODY_TYPE_MARKER: unique symbol;
const CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCIES_MARKER = Symbol(
  'craft-http-client-exception-dependencies-marker',
);

const CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER = Symbol(
  'craft-http-client-exception-dependency-request-marker',
);

export type CraftHttpClientParams =
  | URLSearchParams
  | Readonly<Record<string, string | number | boolean | undefined>>;

export type CraftHttpClientJsonOptions = {
  headers?: Readonly<Record<string, string>>;
  params?: CraftHttpClientParams;
  signal?: AbortSignal;
  timeout?: number;
};

export type CraftHttpClientJsonRequestOptions<Payload = unknown> =
  CraftHttpClientJsonOptions & {
    payload?: Payload | null;
  };

export type CraftHttpClientErrorResponse = {
  error: unknown;
  headers: Headers;
  status: number;
  statusText: string;
  url: string;
};

export type CraftHttpClientErrorPayload = {
  error: CraftHttpClientErrorResponse;
  method: string;
  url: string;
};

export type CraftHttpClientError = CraftExceptionResult<
  {
    _tag: 'HttpError';
    scope: 'HttpClient';
    identifier?: string;
  },
  CraftHttpClientErrorPayload
>;

export type CraftHttpResponseDecodeErrorPayload = {
  method: string;
  url: string;
  response: unknown;
  error: unknown;
  issues?: unknown;
};

export type HttpResponseDecodeError = CraftExceptionResult<
  {
    _tag: 'HttpResponseDecodeError';
    scope: 'HttpClient';
    identifier?: string;
  },
  CraftHttpResponseDecodeErrorPayload
>;

type CraftHttpClientExceptionDependencyMode = 'read' | 'match';

export type CraftHttpClientBodyExceptionDependency<Body = unknown> = {
  source: 'body';
  mode: 'read';
  readonly [CRAFT_HTTP_CLIENT_EXCEPTION_BODY_TYPE_MARKER]?: Body;
};

export type CraftHttpClientExceptionDependency =
  | {
      source: 'status';
      mode: CraftHttpClientExceptionDependencyMode;
      expected?: number;
    }
  | {
      source: 'code';
      mode: CraftHttpClientExceptionDependencyMode;
      expected?: unknown;
    }
  | {
      source: 'content';
      mode: CraftHttpClientExceptionDependencyMode;
      expected?: string;
    }
  | CraftHttpClientBodyExceptionDependency
  | {
      source: 'header';
      mode: CraftHttpClientExceptionDependencyMode;
      name: string;
      expected?: string;
    };

export type CraftHttpClientExceptionRuleDependencies = {
  ruleIndex: number;
  dependencies: readonly CraftHttpClientExceptionDependency[];
};

type CraftHttpClientExceptionDependencies =
  readonly CraftHttpClientExceptionRuleDependencies[];
type CraftHttpClientExceptionDependenciesMetadata = {
  value?: CraftHttpClientExceptionDependencies;
  resolve: () => CraftHttpClientExceptionDependencies;
};

type CraftHttpClientExceptionDependencyRequest<
  Dependency extends
    CraftHttpClientExceptionDependency = CraftHttpClientExceptionDependency,
  Result = unknown,
> = Readonly<{
  [CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER]: true;
  dependency: Dependency;
  evaluate: (error: CraftHttpClientErrorResponse) => Result;
  preview: () => Result;
}>;

type CraftHttpClientStatusExceptionHelper = {
  (): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'status';
        mode: 'read';
      },
      number
    >,
    number,
    unknown
  >;
  <const Expected extends number>(
    expected: Expected,
  ): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'status';
        mode: 'match';
        expected: Expected;
      },
      Expected | undefined
    >,
    Expected | undefined,
    unknown
  >;
};

type CraftHttpClientCodeExceptionHelper = {
  (): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'code';
        mode: 'read';
      },
      unknown
    >,
    unknown,
    unknown
  >;
  <const Expected>(expected: Expected): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'code';
        mode: 'match';
        expected: Expected;
      },
      Expected | undefined
    >,
    Expected | undefined,
    unknown
  >;
};

type CraftHttpClientContentExceptionHelper = {
  (): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'content';
        mode: 'read';
      },
      string | undefined
    >,
    string | undefined,
    unknown
  >;
  <const Expected extends string>(
    expected: Expected,
  ): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'content';
        mode: 'match';
        expected: Expected;
      },
      Expected | undefined
    >,
    Expected | undefined,
    unknown
  >;
};

type CraftHttpClientHeaderExceptionHelper = {
  <const HeaderName extends string>(
    name: HeaderName,
  ): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'header';
        mode: 'read';
        name: HeaderName;
      },
      string | undefined
    >,
    string | undefined,
    unknown
  >;
  <const HeaderName extends string, const Expected extends string>(
    name: HeaderName,
    expected: Expected,
  ): Generator<
    CraftHttpClientExceptionDependencyRequest<
      {
        source: 'header';
        mode: 'match';
        name: HeaderName;
        expected: Expected;
      },
      Expected | undefined
    >,
    Expected | undefined,
    unknown
  >;
};

type CraftHttpClientExceptionRuleHelpers = Readonly<{
  status: CraftHttpClientStatusExceptionHelper;
  code: CraftHttpClientCodeExceptionHelper;
  content: CraftHttpClientContentExceptionHelper;
  body: <Body = unknown>() => Generator<
    CraftHttpClientExceptionDependencyRequest<
      CraftHttpClientBodyExceptionDependency<Body>,
      Body
    >,
    Body,
    unknown
  >;
  header: CraftHttpClientHeaderExceptionHelper;
}>;

export type CraftHttpClientExceptionRule<
  CustomException extends AnyCraftException = AnyCraftException,
> = (
  helpers: CraftHttpClientExceptionRuleHelpers,
) => Generator<
  CraftHttpClientExceptionDependencyRequest<any, unknown>,
  CustomException | undefined | void,
  unknown
>;

type AttachCraftHttpClientExceptionDependencies<Exception, Dependencies> =
  Exception extends AnyCraftException
    ? Exception & {
        readonly [CRAFT_HTTP_CLIENT_EXCEPTION_TYPE_DEPENDENCIES_MARKER]?: Dependencies;
      }
    : never;

export type ExtractCraftHttpClientExceptionDependencies<Exception> =
  Exception extends {
    readonly [CRAFT_HTTP_CLIENT_EXCEPTION_TYPE_DEPENDENCIES_MARKER]?: infer Dependencies;
  }
    ? Dependencies
    : never;

export type ExtractCraftHttpClientExceptionBodyTypeFromDependency<Dependency> =
  Dependency extends {
    readonly [CRAFT_HTTP_CLIENT_EXCEPTION_BODY_TYPE_MARKER]?: infer Body;
  }
    ? Body
    : never;

export type ExtractCraftHttpClientExceptionBodyType<Exception> =
  ExtractCraftHttpClientExceptionBodyTypeFromDependency<
    Extract<
      ExtractCraftHttpClientExceptionDependencies<Exception>,
      { source: 'body' }
    >
  >;

type CraftHttpClientSuccessToken<Success> = {
  readonly [CRAFT_HTTP_CLIENT_SUCCESS_MARKER]?: Success;
};

type CraftHttpClientDecodedSuccessToken<Success> =
  CraftHttpClientSuccessToken<Success> & {
    readonly decoder: CraftDecoder<Success>;
  };

type CraftHttpClientBaseConfig = Omit<CraftHttpClientJsonOptions, 'params'> & {
  url: string;
  params?: CraftHttpClientParams;
  success: CraftHttpClientSuccessToken<unknown>;
  exceptions?: readonly CraftHttpClientExceptionRule[];
};

type CraftHttpClientBodyConfig = CraftHttpClientBaseConfig & {
  payload: unknown | null;
};

type CraftHttpClientRequestConfig = CraftHttpClientBaseConfig & {
  method: string;
  payload?: unknown | null;
};

type ExtractCraftHttpClientUrl<Config> = Config extends {
  url: infer Url extends string;
}
  ? Url
  : never;

type ExtractCraftHttpClientMethod<Config> = Config extends {
  method: infer Method extends string;
}
  ? Method
  : never;

type ExtractCraftHttpClientSuccess<Config> = Config extends {
  success: CraftHttpClientSuccessToken<infer Success>;
}
  ? Success
  : never;

type ExtractCraftHttpClientResponseDecodeError<Config> = Config extends {
  success: { readonly decoder: CraftDecoder<any> };
}
  ? HttpResponseDecodeError
  : never;

type ExtractCraftHttpClientParams<Config> = Config extends {
  params: infer Params;
}
  ? Params
  : undefined;

type ExtractCraftHttpClientPayload<Config> = Config extends {
  payload: infer Payload;
}
  ? Payload
  : undefined;

type ExtractCraftHttpClientExceptionDependenciesFromYielded<Yielded> =
  Yielded extends CraftHttpClientExceptionDependencyRequest<
    infer Dependency,
    any
  >
    ? Dependency
    : never;

type ExtractCraftHttpClientExceptionFromRule<Rule> = Rule extends (
  ...args: any[]
) => Generator<infer Yielded, infer CustomException, unknown>
  ? AttachCraftHttpClientExceptionDependencies<
      Extract<Exclude<CustomException, undefined | void>, AnyCraftException>,
      ExtractCraftHttpClientExceptionDependenciesFromYielded<Yielded>
    >
  : never;

type ExtractCraftHttpClientExceptions<Config> = Config extends {
  exceptions: ReadonlyArray<infer Rule>;
}
  ? ExtractCraftHttpClientExceptionFromRule<Rule>
  : never;

export type CraftHttpClientResolved<
  Success,
  CustomException extends AnyCraftException = never,
  ResponseDecodeException extends AnyCraftException = never,
> = Success | CustomException | ResponseDecodeException | CraftHttpClientError;

export type CraftHttpClientResult<
  Success,
  CustomException extends AnyCraftException = never,
  ResponseDecodeException extends AnyCraftException = never,
> = Promise<
  CraftHttpClientResolved<Success, CustomException, ResponseDecodeException>
>;

export type CraftHttpRequest<
  Method extends string = string,
  Url extends string = string,
  Success = unknown,
  Params = undefined,
  Payload = undefined,
  CustomException extends AnyCraftException = never,
  ResponseDecodeException extends AnyCraftException = never,
> = (() => CraftHttpClientResult<
  Success,
  CustomException,
  ResponseDecodeException
>) &
  Promise<
    CraftHttpClientResolved<Success, CustomException, ResponseDecodeException>
  > & {
    readonly method: Method;
    readonly url: Url;
    readonly params: Params;
    readonly payload: Payload;
    readonly [CRAFT_HTTP_CLIENT_SUCCESS_MARKER]?: Success;
    readonly [CRAFT_HTTP_CLIENT_EXCEPTIONS_MARKER]?: CustomException;
    readonly [CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCIES_MARKER]?: CraftHttpClientExceptionDependenciesMetadata;
  };

type AnyCraftHttpRequest = CraftHttpRequest<
  string,
  string,
  unknown,
  unknown,
  unknown,
  AnyCraftException
>;

type CraftHttpTrackedRequest<Request extends AnyCraftHttpRequest> =
  ServiceYieldRequest<
    'global',
    Request,
    ServiceTrackingMetadata<
      'CraftHttpClient',
      'global',
      Request,
      never,
      {
        derivedPropertiesUsed: {
          $self: Request;
        };
        derivedPropertiesExposed: {
          $self: Request;
        };
      },
      never,
      true
    >
  >;

type CraftHttpRequestFromConfig<
  Method extends string,
  Config extends CraftHttpClientBaseConfig,
> = CraftHttpRequest<
  Method,
  ExtractCraftHttpClientUrl<Config>,
  ExtractCraftHttpClientSuccess<Config>,
  ExtractCraftHttpClientParams<Config>,
  ExtractCraftHttpClientPayload<Config>,
  ExtractCraftHttpClientExceptions<Config>,
  ExtractCraftHttpClientResponseDecodeError<Config>
>;

type CraftHttpRequestFromRequestConfig<
  Config extends CraftHttpClientRequestConfig,
> = CraftHttpRequest<
  Uppercase<ExtractCraftHttpClientMethod<Config>>,
  ExtractCraftHttpClientUrl<Config>,
  ExtractCraftHttpClientSuccess<Config>,
  ExtractCraftHttpClientParams<Config>,
  ExtractCraftHttpClientPayload<Config>,
  ExtractCraftHttpClientExceptions<Config>,
  ExtractCraftHttpClientResponseDecodeError<Config>
>;

type CraftHttpClientBuilderHelpers = {
  response: typeof response;
};

type CraftHttpClientDsl = {
  get: <const Config extends CraftHttpClientBaseConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromConfig<'GET', Config>>,
    CraftHttpRequestFromConfig<'GET', Config>,
    unknown
  >;
  delete: <const Config extends CraftHttpClientBaseConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromConfig<'DELETE', Config>>,
    CraftHttpRequestFromConfig<'DELETE', Config>,
    unknown
  >;
  post: <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromConfig<'POST', Config>>,
    CraftHttpRequestFromConfig<'POST', Config>,
    unknown
  >;
  put: <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromConfig<'PUT', Config>>,
    CraftHttpRequestFromConfig<'PUT', Config>,
    unknown
  >;
  patch: <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromConfig<'PATCH', Config>>,
    CraftHttpRequestFromConfig<'PATCH', Config>,
    unknown
  >;
  request: <const Config extends CraftHttpClientRequestConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) => Generator<
    CraftHttpTrackedRequest<CraftHttpRequestFromRequestConfig<Config>>,
    CraftHttpRequestFromRequestConfig<Config>,
    unknown
  >;
};

const craftHttpClientBuilderHelpers: CraftHttpClientBuilderHelpers = {
  response,
};

export const CraftHttpClient: CraftHttpClientDsl = {
  get: function* <const Config extends CraftHttpClientBaseConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((injector) =>
      createCraftHttpRequest(injector, 'GET', config),
    )) as CraftHttpRequestFromConfig<'GET', Config>;
  },

  delete: function* <const Config extends CraftHttpClientBaseConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((injector) =>
      createCraftHttpRequest(injector, 'DELETE', config),
    )) as CraftHttpRequestFromConfig<'DELETE', Config>;
  },

  post: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((injector) =>
      createCraftHttpRequest(injector, 'POST', config),
    )) as CraftHttpRequestFromConfig<'POST', Config>;
  },

  put: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((injector) =>
      createCraftHttpRequest(injector, 'PUT', config),
    )) as CraftHttpRequestFromConfig<'PUT', Config>;
  },

  patch: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((injector) =>
      createCraftHttpRequest(injector, 'PATCH', config),
    )) as CraftHttpRequestFromConfig<'PATCH', Config>;
  },

  request: function* <const Config extends CraftHttpClientRequestConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest(
      (injector) =>
        createCraftHttpRequest(
          injector,
          config.method,
          config,
        ) as CraftHttpRequestFromRequestConfig<Config>,
    )) as CraftHttpRequestFromRequestConfig<Config>;
  },
};

export function response<Success>(): CraftHttpClientSuccessToken<Success>;
export function response<Success>(
  decoder: CraftDecoder<Success>,
): CraftHttpClientDecodedSuccessToken<Success>;
export function response<Success>(decoder?: CraftDecoder<Success>) {
  return decoder === undefined
    ? (undefined as unknown as CraftHttpClientSuccessToken<Success>)
    : { decoder };
}

export function getCraftHttpRequestExceptionDependencies(
  request: AnyCraftHttpRequest,
): CraftHttpClientExceptionDependencies {
  const metadata = request[CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCIES_MARKER];

  if (!metadata) {
    return [];
  }

  if (metadata.value === undefined) {
    metadata.value = metadata.resolve();
  }

  return metadata.value;
}

function createCraftHttpClientYieldRequest<Request extends AnyCraftHttpRequest>(
  factory: (injector: Injector) => Request,
): CraftHttpTrackedRequest<Request> {
  return {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    name: 'CraftHttpClient',
    providedIn: 'global',
    resolve: (injector) => {
      const override = injector
        .get(SERVICE_RUNTIME_OVERRIDES)
        .get('CraftHttpClient');

      if (override?.kind === 'useValue') {
        return override.value as Request;
      }

      if (override?.kind === 'instantiate') {
        if (override.instance === undefined) {
          override.instance = factory(injector);
        }

        return override.instance as Request;
      }

      return factory(injector);
    },
  } as CraftHttpTrackedRequest<Request>;
}

function createCraftHttpRequest<
  Method extends string,
  Config extends CraftHttpClientBaseConfig,
>(
  injector: Injector,
  method: Method,
  config: Config,
): CraftHttpRequestFromConfig<Uppercase<Method>, Config> {
  const normalizedMethod = normalizeMethod(method) as Uppercase<Method>;
  const exceptionDependencies =
    createCraftHttpClientExceptionDependenciesMetadata(config.exceptions);
  const request = async (): CraftHttpClientResult<
    ExtractCraftHttpClientSuccess<Config>,
    ExtractCraftHttpClientExceptions<Config>,
    ExtractCraftHttpClientResponseDecodeError<Config>
  > =>
    executeCraftHttpTrace(
      injector,
      {
        method: normalizedMethod,
        url: config.url,
        params: config.params,
        payload: getConfigPayload(config),
      },
      async () => {
        try {
          const response = await craftFetchTransport(
            toCraftFetchRequest(normalizedMethod, config),
          );
          const responseBody = response.body;

          if (response.status >= 400) {
            return resolveCraftHttpClientError(
              normalizedMethod,
              config,
              toCraftHttpClientErrorResponse(config.url, response),
            );
          }

          const decoder = (
            config.success as
              | (CraftHttpClientSuccessToken<unknown> & {
                  readonly decoder?: CraftDecoder<unknown>;
                })
              | undefined
          )?.decoder;
          if (!decoder) {
            return responseBody as ExtractCraftHttpClientSuccess<Config>;
          }

          try {
            return (await decoder.decode(
              responseBody,
            )) as ExtractCraftHttpClientSuccess<Config>;
          } catch (error) {
            return toHttpResponseDecodeError(
              normalizedMethod,
              config.url,
              responseBody,
              error,
            ) as ExtractCraftHttpClientResponseDecodeError<Config>;
          }
        } catch (error) {
          return resolveCraftHttpClientError(
            normalizedMethod,
            config,
            normalizeHttpClientError(config.url, error),
          );
        }
      },
    );

  return Object.defineProperties(request, {
    method: {
      value: normalizedMethod,
      enumerable: false,
      configurable: false,
    },
    url: {
      value: config.url,
      enumerable: false,
      configurable: false,
    },
    params: {
      value: config.params as ExtractCraftHttpClientParams<Config>,
      enumerable: false,
      configurable: false,
    },
    payload: {
      value: getConfigPayload(config) as ExtractCraftHttpClientPayload<Config>,
      enumerable: false,
      configurable: false,
    },
    [CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCIES_MARKER]: {
      value: exceptionDependencies,
      enumerable: false,
      configurable: false,
    },
    then: {
      value: function (
        onfulfilled: Parameters<Promise<unknown>['then']>[0],
        onrejected: Parameters<Promise<unknown>['then']>[1],
      ) {
        return request().then(onfulfilled, onrejected);
      },
      enumerable: false,
      configurable: false,
    },
    catch: {
      value: function (onrejected: Parameters<Promise<unknown>['catch']>[0]) {
        return request().catch(onrejected);
      },
      enumerable: false,
      configurable: false,
    },
    finally: {
      value: function (onfinally: Parameters<Promise<unknown>['finally']>[0]) {
        return request().finally(onfinally);
      },
      enumerable: false,
      configurable: false,
    },
    [Symbol.toStringTag]: {
      value: 'Promise',
      enumerable: false,
      configurable: false,
    },
  }) as CraftHttpRequestFromConfig<Uppercase<Method>, Config>;
}

function toCraftFetchRequest(
  method: string,
  config: CraftHttpClientBaseConfig,
) {
  const urlSearchParams =
    config.params instanceof URLSearchParams ? config.params : undefined;

  return {
    url:
      urlSearchParams === undefined
        ? config.url
        : appendCraftHttpClientSearchParams(config.url, urlSearchParams),
    method,
    headers: config.headers,
    params:
      urlSearchParams === undefined
        ? normalizeCraftHttpClientParams(config.params)
        : undefined,
    body: getConfigPayload(config),
    signal: config.signal,
    timeout: config.timeout,
  };
}

function appendCraftHttpClientSearchParams(
  url: string,
  params: URLSearchParams,
): string {
  const serialized = params.toString();
  if (!serialized) {
    return url;
  }

  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const baseUrl = hashIndex === -1 ? url : url.slice(0, hashIndex);

  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${serialized}${hash}`;
}

function normalizeCraftHttpClientParams(
  params: CraftHttpClientParams | undefined,
): Record<string, string | number | boolean | undefined> | undefined {
  if (params === undefined) {
    return undefined;
  }

  return params instanceof URLSearchParams ? undefined : { ...params };
}

function getConfigPayload(config: CraftHttpClientBaseConfig): unknown {
  return 'payload' in config ? config.payload : undefined;
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

function collectCraftHttpClientExceptionDependencies(
  rules: readonly CraftHttpClientExceptionRule[] | undefined,
): CraftHttpClientExceptionDependencies {
  if (!rules?.length) {
    return [];
  }

  return rules.map((rule, ruleIndex) => ({
    ruleIndex,
    dependencies: collectCraftHttpClientExceptionRuleDependencies(rule),
  }));
}

function createCraftHttpClientExceptionDependenciesMetadata(
  rules: readonly CraftHttpClientExceptionRule[] | undefined,
): CraftHttpClientExceptionDependenciesMetadata {
  return {
    resolve: () => collectCraftHttpClientExceptionDependencies(rules),
  };
}

function collectCraftHttpClientExceptionRuleDependencies(
  rule: CraftHttpClientExceptionRule,
): readonly CraftHttpClientExceptionDependency[] {
  const dependencies: CraftHttpClientExceptionDependency[] = [];

  executeCraftHttpClientExceptionRule(rule, {
    resolveRequest: (request) => request.preview(),
    onDependency: (dependency) => {
      dependencies.push(dependency);
    },
  });

  return dependencies;
}

function resolveCraftHttpClientError<Config extends CraftHttpClientBaseConfig>(
  method: string,
  config: Config,
  error: CraftHttpClientErrorResponse,
): ExtractCraftHttpClientExceptions<Config> | CraftHttpClientError {
  const customException = resolveCraftHttpClientException(
    config.exceptions,
    error,
  ) as ExtractCraftHttpClientExceptions<Config> | undefined;

  return customException ?? toCraftHttpClientError(method, config.url, error);
}

function resolveCraftHttpClientException(
  rules: readonly CraftHttpClientExceptionRule[] | undefined,
  error: CraftHttpClientErrorResponse,
): AnyCraftException | undefined {
  if (!rules?.length) {
    return undefined;
  }

  for (const rule of rules) {
    const customException = executeCraftHttpClientExceptionRule(rule, {
      resolveRequest: (request) => request.evaluate(error),
    });

    if (customException) {
      return customException;
    }
  }

  return undefined;
}

function executeCraftHttpClientExceptionRule(
  rule: CraftHttpClientExceptionRule,
  options: {
    resolveRequest: (
      request: CraftHttpClientExceptionDependencyRequest<any, unknown>,
    ) => unknown;
    onDependency?: (dependency: CraftHttpClientExceptionDependency) => void;
  },
): AnyCraftException | undefined {
  const iterator = rule(craftHttpClientExceptionRuleHelpers);
  let current = iterator.next();

  while (!current.done) {
    const yielded = current.value;

    if (isCraftHttpClientExceptionDependencyRequest(yielded)) {
      options.onDependency?.(yielded.dependency);
      current = iterator.next(options.resolveRequest(yielded));
      continue;
    }

    throw new Error(
      'CraftHttpClient exception rules must only yield status, code, content, body or header helpers.',
    );
  }

  return current.value ?? undefined;
}

const craftHttpClientExceptionRuleHelpers: CraftHttpClientExceptionRuleHelpers =
  {
    status: ((expected?: number) =>
      createCraftHttpClientExceptionToken({
        dependency:
          expected === undefined
            ? {
                source: 'status',
                mode: 'read',
              }
            : {
                source: 'status',
                mode: 'match',
                expected,
              },
        evaluate: (error) =>
          expected === undefined
            ? error.status
            : matchHttpClientExceptionValue(error.status, expected),
        preview: () => (expected === undefined ? 400 : expected),
      })) as CraftHttpClientStatusExceptionHelper,
    code: ((expected?: unknown) =>
      createCraftHttpClientExceptionToken({
        dependency:
          expected === undefined
            ? {
                source: 'code',
                mode: 'read',
              }
            : {
                source: 'code',
                mode: 'match',
                expected,
              },
        evaluate: (error) => {
          const code = readCraftHttpClientErrorCode(error);
          return expected === undefined
            ? code
            : matchHttpClientExceptionValue(code, expected);
        },
        preview: () => (expected === undefined ? 'preview-code' : expected),
      })) as CraftHttpClientCodeExceptionHelper,
    content: ((expected?: string) =>
      createCraftHttpClientExceptionToken({
        dependency:
          expected === undefined
            ? {
                source: 'content',
                mode: 'read',
              }
            : {
                source: 'content',
                mode: 'match',
                expected,
              },
        evaluate: (error) => {
          const content = readCraftHttpClientErrorContent(error);
          return expected === undefined
            ? content
            : matchHttpClientExceptionValue(content, expected);
        },
        preview: () =>
          (expected === undefined ? 'preview-content' : expected) as
            | string
            | undefined,
      })) as CraftHttpClientContentExceptionHelper,
    body: <Body = unknown>() =>
      createCraftHttpClientExceptionToken({
        dependency: {
          source: 'body',
          mode: 'read',
        },
        evaluate: (error) => error.error as Body,
        preview: () => craftHttpClientExceptionPreviewValue as Body,
      }),
    header: ((name: string, expected?: string) =>
      createCraftHttpClientExceptionToken({
        dependency:
          expected === undefined
            ? {
                source: 'header',
                mode: 'read',
                name,
              }
            : {
                source: 'header',
                mode: 'match',
                name,
                expected,
              },
        evaluate: (error) => {
          const headerValue = normalizeCraftHttpClientHeaderValue(
            error.headers.get(name),
          );
          return expected === undefined
            ? headerValue
            : matchHttpClientExceptionValue(headerValue, expected);
        },
        preview: () =>
          (expected === undefined ? 'preview-header' : expected) as
            | string
            | undefined,
      })) as CraftHttpClientHeaderExceptionHelper,
  };

const craftHttpClientExceptionPreviewValue: unknown = new Proxy(
  () => craftHttpClientExceptionPreviewValue,
  {
    apply: () => craftHttpClientExceptionPreviewValue,
    get: () => craftHttpClientExceptionPreviewValue,
  },
);

function createCraftHttpClientExceptionToken<Result>(
  request: Omit<
    CraftHttpClientExceptionDependencyRequest<any, Result>,
    typeof CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER
  >,
): Generator<
  CraftHttpClientExceptionDependencyRequest<any, Result>,
  Result,
  unknown
> {
  const dependencyRequest =
    createCraftHttpClientExceptionDependencyRequest(request);

  return (function* () {
    return (yield dependencyRequest) as Result;
  })();
}

function createCraftHttpClientExceptionDependencyRequest<
  Dependency extends CraftHttpClientExceptionDependency,
  Result,
>(
  request: Omit<
    CraftHttpClientExceptionDependencyRequest<Dependency, Result>,
    typeof CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER
  >,
): CraftHttpClientExceptionDependencyRequest<Dependency, Result> {
  return {
    [CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER]: true,
    ...request,
  };
}

function isCraftHttpClientExceptionDependencyRequest(
  value: unknown,
): value is CraftHttpClientExceptionDependencyRequest<any, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    CRAFT_HTTP_CLIENT_EXCEPTION_DEPENDENCY_REQUEST_MARKER in value
  );
}

function matchHttpClientExceptionValue<Value, Expected>(
  value: Value,
  expected: Expected,
): Expected | undefined {
  return Object.is(value, expected) ? expected : undefined;
}

function readCraftHttpClientErrorCode(
  error: CraftHttpClientErrorResponse,
): unknown {
  const payload = error.error;

  return payload && typeof payload === 'object' && 'code' in payload
    ? payload.code
    : undefined;
}

function readCraftHttpClientErrorContent(
  error: CraftHttpClientErrorResponse,
): string | undefined {
  if (typeof error.error === 'string') {
    return error.error;
  }

  if (
    error.error &&
    typeof error.error === 'object' &&
    'message' in error.error &&
    typeof error.error.message === 'string'
  ) {
    return error.error.message;
  }

  return undefined;
}

function normalizeCraftHttpClientHeaderValue(
  value: string | null,
): string | undefined {
  return value ?? undefined;
}

function normalizeHttpClientError(
  url: string,
  error: unknown,
): CraftHttpClientErrorResponse {
  return {
    error,
    headers: new Headers(),
    status: 0,
    statusText: 'Unknown Error',
    url,
  };
}

function toCraftHttpClientErrorResponse(
  url: string,
  response: CraftHttpResponse<unknown>,
): CraftHttpClientErrorResponse {
  const metadata = ɵgetCraftHttpResponseMetadata(response);

  return {
    error: response.body,
    headers: metadata?.headers ?? new Headers(),
    status: response.status,
    statusText: metadata?.statusText ?? '',
    url: metadata?.url ?? url,
  };
}

function toCraftHttpClientError(
  method: string,
  url: string,
  error: CraftHttpClientErrorResponse,
): CraftHttpClientError {
  return craftException(
    {
      _tag: 'HttpError',
      scope: 'HttpClient',
      identifier: `${method} ${url}`,
    },
    {
      error,
      method,
      url,
    },
  );
}

function toHttpResponseDecodeError(
  method: string,
  url: string,
  response: unknown,
  error: unknown,
): HttpResponseDecodeError {
  const issues = extractDecodeIssues(error);

  return craftException(
    {
      _tag: 'HttpResponseDecodeError',
      scope: 'HttpClient',
      identifier: `${method} ${url}`,
    },
    {
      method,
      url,
      response,
      error,
      ...(issues === undefined ? {} : { issues }),
    },
  );
}

function extractDecodeIssues(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  if ('issues' in error) {
    return (error as { issues?: unknown }).issues;
  }

  if ('issue' in error && error.issue && typeof error.issue === 'object') {
    return error.issue;
  }

  return undefined;
}
