import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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

declare const CRAFT_HTTP_CLIENT_SUCCESS_MARKER: unique symbol;
declare const CRAFT_HTTP_CLIENT_EXCEPTIONS_MARKER: unique symbol;

export type CraftHttpClientParams =
  | HttpParams
  | Record<
      string,
      string | number | boolean | ReadonlyArray<string | number | boolean>
    >;

export type CraftHttpClientJsonOptions = {
  headers?: HttpHeaders | Record<string, string | string[]>;
  context?: HttpContext;
  observe?: 'body';
  params?: CraftHttpClientParams;
  reportProgress?: boolean;
  responseType?: 'json';
  withCredentials?: boolean;
  credentials?: RequestCredentials;
  keepalive?: boolean;
  priority?: RequestPriority;
  cache?: RequestCache;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  referrer?: string;
  integrity?: string;
  referrerPolicy?: ReferrerPolicy;
  transferCache?:
    | {
        includeHeaders?: string[];
      }
    | boolean;
  timeout?: number;
};

export type CraftHttpClientJsonRequestOptions<Payload = unknown> =
  CraftHttpClientJsonOptions & {
    payload?: Payload | null;
  };

export type CraftHttpClientErrorPayload = {
  error: HttpErrorResponse;
  method: string;
  url: string;
};

export type CraftHttpClientError = CraftExceptionResult<
  {
    code: 'HttpError';
    scope: 'HttpClient';
    identifier?: string;
  },
  CraftHttpClientErrorPayload
>;

type CraftHttpClientSuccessToken<Success> = {
  readonly [CRAFT_HTTP_CLIENT_SUCCESS_MARKER]?: Success;
};

type CraftHttpClientExceptionMapper<
  CustomException extends AnyCraftException = AnyCraftException,
> = (error: HttpErrorResponse) => CustomException | undefined;

type CraftHttpClientBaseConfig = Omit<CraftHttpClientJsonOptions, 'params'> & {
  url: string;
  params?: CraftHttpClientParams;
  success: CraftHttpClientSuccessToken<unknown>;
  exceptions?: CraftHttpClientExceptionMapper;
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

type ExtractCraftHttpClientExceptions<Config> = Config extends {
  exceptions: (...args: any[]) => infer CustomException;
}
  ? Exclude<CustomException, undefined>
  : never;

export type CraftHttpClientResolved<
  Success,
  CustomException extends AnyCraftException = never,
> = Success | CustomException | CraftHttpClientError;

export type CraftHttpClientResult<
  Success,
  CustomException extends AnyCraftException = never,
> = Promise<CraftHttpClientResolved<Success, CustomException>>;

export type CraftHttpRequest<
  Method extends string = string,
  Url extends string = string,
  Success = unknown,
  Params = undefined,
  Payload = undefined,
  CustomException extends AnyCraftException = never,
> = (() => CraftHttpClientResult<Success, CustomException>) & {
  readonly method: Method;
  readonly url: Url;
  readonly params: Params;
  readonly payload: Payload;
  readonly [CRAFT_HTTP_CLIENT_SUCCESS_MARKER]?: Success;
  readonly [CRAFT_HTTP_CLIENT_EXCEPTIONS_MARKER]?: CustomException;
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
      false
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
  ExtractCraftHttpClientExceptions<Config>
>;

type CraftHttpRequestFromRequestConfig<Config extends CraftHttpClientRequestConfig> =
  CraftHttpRequest<
    Uppercase<ExtractCraftHttpClientMethod<Config>>,
    ExtractCraftHttpClientUrl<Config>,
    ExtractCraftHttpClientSuccess<Config>,
    ExtractCraftHttpClientParams<Config>,
    ExtractCraftHttpClientPayload<Config>,
    ExtractCraftHttpClientExceptions<Config>
  >;

type CraftHttpClientBuilderHelpers = {
  response: <Success>() => CraftHttpClientSuccessToken<Success>;
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

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, 'GET', config),
    )) as CraftHttpRequestFromConfig<'GET', Config>;
  },

  delete: function* <const Config extends CraftHttpClientBaseConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, 'DELETE', config),
    )) as CraftHttpRequestFromConfig<'DELETE', Config>;
  },

  post: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, 'POST', config),
    )) as CraftHttpRequestFromConfig<'POST', Config>;
  },

  put: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, 'PUT', config),
    )) as CraftHttpRequestFromConfig<'PUT', Config>;
  },

  patch: function* <const Config extends CraftHttpClientBodyConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, 'PATCH', config),
    )) as CraftHttpRequestFromConfig<'PATCH', Config>;
  },

  request: function* <const Config extends CraftHttpClientRequestConfig>(
    build: (helpers: CraftHttpClientBuilderHelpers) => Config,
  ) {
    const config = build(craftHttpClientBuilderHelpers);

    return (yield createCraftHttpClientYieldRequest((http) =>
      createCraftHttpRequest(http, config.method, config),
    )) as CraftHttpRequestFromRequestConfig<Config>;
  },
};

export function response<Success>(): CraftHttpClientSuccessToken<Success> {
  return undefined as CraftHttpClientSuccessToken<Success>;
}

function createCraftHttpClientYieldRequest<Request extends AnyCraftHttpRequest>(
  factory: (http: HttpClient) => Request,
): CraftHttpTrackedRequest<Request> {
  return {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    scope: 'global',
    resolve: (injector) => {
      const override = injector.get(SERVICE_RUNTIME_OVERRIDES).get(
        'CraftHttpClient',
      );

      if (override?.kind === 'useValue') {
        return override.value as Request;
      }

      if (override?.kind === 'instantiate') {
        if (override.instance === undefined) {
          override.instance = factory(injector.get(HttpClient));
        }

        return override.instance as Request;
      }

      return factory(injector.get(HttpClient));
    },
  } as CraftHttpTrackedRequest<Request>;
}

function createCraftHttpRequest<
  Method extends string,
  Config extends CraftHttpClientBaseConfig,
>(
  http: HttpClient,
  method: Method,
  config: Config,
): CraftHttpRequestFromConfig<Uppercase<Method>, Config> {
  const normalizedMethod = normalizeMethod(method) as Uppercase<Method>;
  const request = async (): CraftHttpClientResult<
    ExtractCraftHttpClientSuccess<Config>,
    ExtractCraftHttpClientExceptions<Config>
  > => {
    try {
      return (await firstValueFrom(
        http.request<ExtractCraftHttpClientSuccess<Config>>(
          normalizedMethod,
          config.url,
          toHttpClientRequestOptions(config),
        ),
      )) as ExtractCraftHttpClientSuccess<Config>;
    } catch (error) {
      const normalizedError = normalizeHttpClientError(config.url, error);
      const customException = config.exceptions?.(
        normalizedError,
      ) as ExtractCraftHttpClientExceptions<Config> | undefined;

      return (
        customException ?? toCraftHttpClientError(normalizedMethod, config.url, normalizedError)
      );
    }
  };

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
  }) as CraftHttpRequestFromConfig<Uppercase<Method>, Config>;
}

function toHttpClientRequestOptions(
  config: CraftHttpClientBaseConfig,
): CraftHttpClientJsonOptions & {
  body?: unknown | null;
} {
  const {
    url: _url,
    success: _success,
    exceptions: _exceptions,
    method: _method,
    payload,
    ...options
  } = config as CraftHttpClientRequestConfig;

  return payload === undefined
    ? options
    : {
        ...options,
        body: payload,
      };
}

function getConfigPayload(config: CraftHttpClientBaseConfig): unknown {
  return 'payload' in config ? config.payload : undefined;
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

function normalizeHttpClientError(
  url: string,
  error: unknown,
): HttpErrorResponse {
  return error instanceof HttpErrorResponse
    ? error
    : new HttpErrorResponse({
        error,
        status: 0,
        statusText: 'Unknown Error',
        url,
      });
}

function toCraftHttpClientError(
  method: string,
  url: string,
  error: HttpErrorResponse,
): CraftHttpClientError {
  return craftException(
    {
      code: 'HttpError',
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
