import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { craftException, type CraftExceptionResult } from './craft-exception';
import {
  toCraftService,
  type DependencyApi,
  type GetServiceYields,
  type ServiceTrackingMetadata,
} from './craft-service';

declare const MISSING_CRAFT_HTTP_CLIENT_SUCCESS_TYPE: unique symbol;

type MissingCraftHttpClientSuccessType = {
  readonly [MISSING_CRAFT_HTTP_CLIENT_SUCCESS_TYPE]: true;
};

type RequireExplicitSuccessType<Success> =
  [Success] extends [MissingCraftHttpClientSuccessType]
    ? [
        message: 'CraftHttpClient requires an explicit success type parameter. Example: yield* CraftHttpClient.get<User[]>()',
      ]
    : [];

type CraftHttpClientParams =
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

export type CraftHttpClientJsonRequestOptions = CraftHttpClientJsonOptions & {
  body?: unknown;
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

export type CraftHttpClientResolved<Success> = Success | CraftHttpClientError;

export type CraftHttpClientResult<Success> = Promise<
  CraftHttpClientResolved<Success>
>;

type HttpClientAdapterApi = DependencyApi<
  'HttpClientAdapter',
  'global',
  {},
  HttpClient,
  ServiceTrackingMetadata<
    'HttpClientAdapter',
    'global',
    HttpClient,
    never,
    undefined,
    never,
    false
  >
>;

const httpClientAdapter: HttpClientAdapterApi = toCraftService({
  name: 'HttpClientAdapter',
  scope: 'global',
  token: HttpClient,
});
const HttpClientAdapterToYield: HttpClientAdapterApi['HttpClientAdapterToYield'] =
  httpClientAdapter.HttpClientAdapterToYield;

type HttpClientAdapterYield = GetServiceYields<
  HttpClientAdapterApi['HttpClientAdapterToYield']
>;

type CraftHttpClientDsl = {
  get: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      url: string,
      options?: CraftHttpClientJsonOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
  delete: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      url: string,
      options?: CraftHttpClientJsonRequestOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
  post: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
  put: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
  patch: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
  request: <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) => Generator<
    HttpClientAdapterYield,
    (
      method: string,
      url: string,
      options?: CraftHttpClientJsonRequestOptions,
    ) => CraftHttpClientResult<Success>,
    unknown
  >;
};

export const CraftHttpClient: CraftHttpClientDsl = {
  get: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      url: string,
      options?: CraftHttpClientJsonOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>('GET', url, () => http.get<Success>(url, options));
  },

  delete: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      url: string,
      options?: CraftHttpClientJsonRequestOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>('DELETE', url, () =>
        http.delete<Success>(url, options),
      );
  },

  post: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>('POST', url, () =>
        http.post<Success>(url, body, options),
      );
  },

  put: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>('PUT', url, () =>
        http.put<Success>(url, body, options),
      );
  },

  patch: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      url: string,
      body: unknown | null,
      options?: CraftHttpClientJsonOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>('PATCH', url, () =>
        http.patch<Success>(url, body, options),
      );
  },

  request: function* <Success = MissingCraftHttpClientSuccessType>(
    ..._enforce: RequireExplicitSuccessType<Success>
  ) {
    const http = yield* HttpClientAdapterToYield();

    return (
      method: string,
      url: string,
      options?: CraftHttpClientJsonRequestOptions,
    ): CraftHttpClientResult<Success> =>
      executeHttpCall<Success>(method, url, () =>
        http.request<Success>(method, url, options),
      );
  },
};

async function executeHttpCall<Success>(
  method: string,
  url: string,
  call: () => ReturnType<HttpClient['request']>,
): CraftHttpClientResult<Success> {
  try {
    return (await firstValueFrom(call())) as Success;
  } catch (error) {
    return toCraftHttpClientError(method, url, error);
  }
}

function toCraftHttpClientError(
  method: string,
  url: string,
  error: unknown,
): CraftHttpClientError {
  const normalizedError =
    error instanceof HttpErrorResponse
      ? error
      : new HttpErrorResponse({
          error,
          status: 0,
          statusText: 'Unknown Error',
          url,
        });

  const normalizedMethod = method.toUpperCase();

  return craftException(
    {
      code: 'HttpError',
      scope: 'HttpClient',
      identifier: `${normalizedMethod} ${url}`,
    },
    {
      error: normalizedError,
      method: normalizedMethod,
      url,
    },
  );
}
