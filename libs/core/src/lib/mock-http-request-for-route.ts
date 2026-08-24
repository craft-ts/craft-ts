import type {
  CraftHttpRequest,
  ExtractCraftHttpClientExceptionBodyType,
  ExtractCraftHttpClientExceptionDependencies,
} from './craft-http-client';
import type { AnyCraftException } from './craft-exception';
import type { MergeObjectUnion, Simplify } from './craft-service.shared';

type AnyTrackedCraftHttpRequest = CraftHttpRequest<
  string,
  string,
  unknown,
  unknown,
  unknown,
  AnyCraftException
>;

type HttpMockHeaders = Record<string, string | undefined>;

type RouteMetaDataHttpDeps<RouteMetaData> = RouteMetaData extends {
  httpDeps: infer HttpDeps extends object;
}
  ? HttpDeps
  : {};

type CraftRouteHttpDepsRegistryKey = Extract<
  keyof CraftRouteHttpDepsRegistry,
  string
>;

type RegisteredRouteHttpDeps<AppKey extends CraftRouteHttpDepsRegistryKey> =
  CraftRouteHttpDepsRegistry[AppKey] extends infer RouteHttpDeps extends object
    ? RouteHttpDeps
    : never;

type RegisteredRoutePath<AppKey extends CraftRouteHttpDepsRegistryKey> =
  Extract<keyof RegisteredRouteHttpDeps<AppKey>, string>;

type RegisteredRouteEndpointDeps<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
> = RegisteredRouteHttpDeps<AppKey>[RoutePath] extends infer EndpointDeps extends
  object
  ? EndpointDeps
  : never;

type RegisteredRouteEndpointKey<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
> = Extract<keyof RegisteredRouteEndpointDeps<AppKey, RoutePath>, string>;

type RegisteredRouteHttpRequest<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
  Endpoint extends RegisteredRouteEndpointKey<AppKey, RoutePath>,
> =
  RegisteredRouteEndpointDeps<AppKey, RoutePath>[Endpoint] extends infer Request
    ? Request extends AnyTrackedCraftHttpRequest
      ? Request
      : never
    : never;

type EndpointMethod<Endpoint extends string> = string extends Endpoint
  ? string
  : Endpoint extends `${infer Method} ${string}`
    ? Method
    : never;

type EndpointUrl<Endpoint extends string> = string extends Endpoint
  ? string
  : Endpoint extends `${string} ${infer Url}`
    ? Url
    : never;

type ExceptionDependencies<Exception extends AnyCraftException> =
  ExtractCraftHttpClientExceptionDependencies<Exception>;

type StatusDependency<Exception extends AnyCraftException> = Extract<
  ExceptionDependencies<Exception>,
  { source: 'status' }
>;

type CodeDependency<Exception extends AnyCraftException> = Extract<
  ExceptionDependencies<Exception>,
  { source: 'code' }
>;

type ContentDependency<Exception extends AnyCraftException> = Extract<
  ExceptionDependencies<Exception>,
  { source: 'content' }
>;

type HeaderDependency<Exception extends AnyCraftException> = Extract<
  ExceptionDependencies<Exception>,
  { source: 'header' }
>;

type MatchedStatusValue<Exception extends AnyCraftException> = Extract<
  StatusDependency<Exception>,
  { mode: 'match' }
> extends infer Dependency
  ? Dependency extends { expected: infer Expected extends number }
    ? Expected
    : never
  : never;

type MatchedCodeValue<Exception extends AnyCraftException> = Extract<
  CodeDependency<Exception>,
  { mode: 'match' }
> extends infer Dependency
  ? Dependency extends { expected: infer Expected }
    ? Expected
    : never
  : never;

type MatchedContentValue<Exception extends AnyCraftException> = Extract<
  ContentDependency<Exception>,
  { mode: 'match' }
> extends infer Dependency
  ? Dependency extends { expected: infer Expected extends string }
    ? Expected
    : never
  : never;

type ExceptionStatusValue<Exception extends AnyCraftException> = [
  MatchedStatusValue<Exception>,
] extends [never]
  ? number
  : MatchedStatusValue<Exception>;

type ExceptionCodeBody<Exception extends AnyCraftException> = [
  CodeDependency<Exception>,
] extends [never]
  ? {}
  : {
      code: [MatchedCodeValue<Exception>] extends [never]
        ? unknown
        : MatchedCodeValue<Exception>;
    };

type ExceptionContentBody<Exception extends AnyCraftException> = [
  ContentDependency<Exception>,
] extends [never]
  ? {}
  : {
      message: [MatchedContentValue<Exception>] extends [never]
        ? string | undefined
        : MatchedContentValue<Exception>;
    };

type ExceptionBaseBody<Exception extends AnyCraftException> = [
  ExtractCraftHttpClientExceptionBodyType<Exception>,
] extends [never]
  ? Record<string, unknown>
  : ExtractCraftHttpClientExceptionBodyType<Exception>;

type HeaderMapFromDependency<Dependency> = Dependency extends {
  name: infer HeaderName extends string;
}
  ? {
      [Key in HeaderName]: Dependency extends {
        mode: 'match';
        expected: infer Expected extends string;
      }
        ? Expected
        : string | undefined;
    }
  : never;

type ExceptionHeaderRequirements<Exception extends AnyCraftException> =
  MergeObjectUnion<HeaderMapFromDependency<HeaderDependency<Exception>>>;

type ExceptionHeadersField<Exception extends AnyCraftException> = [
  HeaderDependency<Exception>,
] extends [never]
  ? {
      headers?: HttpMockHeaders;
    }
  : {
      headers: Simplify<
        HttpMockHeaders & ExceptionHeaderRequirements<Exception>
      >;
    };

export interface CraftRouteHttpDepsRegistry {}

export type RouteHttpDepsByPath<Routes extends readonly unknown[]> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteMetaData
      ? RouteMetaData extends {
          path: infer Path extends string;
        }
        ? {
            [Key in Path]: RouteMetaDataHttpDeps<RouteMetaData>;
          }
        : never
      : never
  >
>;

export type ExtractCraftHttpRequestSuccess<Request> =
  Request extends CraftHttpRequest<any, any, infer Success, any, any, any>
    ? Success
    : never;

export type ExtractCraftHttpRequestCustomException<Request> =
  Request extends CraftHttpRequest<any, any, any, any, any, infer Exception>
    ? Extract<Exception, AnyCraftException>
    : never;

export type MockHttpRequestSuccessResponse<Request extends AnyTrackedCraftHttpRequest> =
  {
    kind: 'success';
    body: ExtractCraftHttpRequestSuccess<Request>;
    status?: number;
    headers?: HttpMockHeaders;
  };

export type MockHttpRequestErrorResponse = {
  kind: 'error';
  status: number;
  body?: unknown;
  headers?: HttpMockHeaders;
};

export type MockHttpRequestCustomExceptionResponse<
  Exception extends AnyCraftException,
> = {
  kind: 'exception';
  // Mirrors the craft discriminant. NOT to be confused with the `code` inside
  // `body`, which is the server's own error code (see ExceptionCodeBody).
  _tag: Exception['_tag'];
  status: ExceptionStatusValue<Exception>;
  body: ExceptionBaseBody<Exception> &
    ExceptionCodeBody<Exception> &
    ExceptionContentBody<Exception>;
} & ExceptionHeadersField<Exception>;

export type MockHttpRequestResponse<Request extends AnyTrackedCraftHttpRequest> =
  | ExtractCraftHttpRequestSuccess<Request>
  | MockHttpRequestSuccessResponse<Request>
  | MockHttpRequestErrorResponse
  | (ExtractCraftHttpRequestCustomException<Request> extends infer Exception
      ? Exception extends AnyCraftException
        ? MockHttpRequestCustomExceptionResponse<Exception>
        : never
      : never);

export type MockHttpRequestForRouteMockInput<
  Request extends AnyTrackedCraftHttpRequest,
> = {
  kind: 'mock';
  response: MockHttpRequestResponse<Request>;
};

export type MockHttpRequestForRouteEndpointInput<
  Request extends AnyTrackedCraftHttpRequest,
> =
  | 'ignore'
  | 'unusedOrThrow'
  | MockHttpRequestForRouteMockInput<Request>;

export type MockHttpRequestForRouteInput<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
> = {
  [Endpoint in RegisteredRouteEndpointKey<
    AppKey,
    RoutePath
  >]: MockHttpRequestForRouteEndpointInput<
    RegisteredRouteHttpRequest<AppKey, RoutePath, Endpoint>
  >;
};

export type MockHttpRequestNormalizedResponse<
  Request extends AnyTrackedCraftHttpRequest,
> =
  | MockHttpRequestSuccessResponse<Request>
  | MockHttpRequestErrorResponse
  | (ExtractCraftHttpRequestCustomException<Request> extends infer Exception
      ? Exception extends AnyCraftException
        ? MockHttpRequestCustomExceptionResponse<Exception>
        : never
      : never);

export type MockHttpRequestForRouteIgnoreEndpoint<
  Endpoint extends string = string,
> = {
  endpoint: Endpoint;
  method: EndpointMethod<Endpoint>;
  url: EndpointUrl<Endpoint>;
  mode: 'ignore';
};

export type MockHttpRequestForRouteUnusedEndpoint<
  Endpoint extends string = string,
> = {
  endpoint: Endpoint;
  method: EndpointMethod<Endpoint>;
  url: EndpointUrl<Endpoint>;
  mode: 'unusedOrThrow';
  message: string;
};

export type MockHttpRequestForRouteMockEndpoint<
  Endpoint extends string = string,
  Response = MockHttpRequestNormalizedResponse<AnyTrackedCraftHttpRequest>,
> = {
  endpoint: Endpoint;
  method: EndpointMethod<Endpoint>;
  url: EndpointUrl<Endpoint>;
  mode: 'mock';
  response: Response;
};

export type MockHttpRequestForRouteEndpoint<
  Endpoint extends string = string,
  Response = MockHttpRequestNormalizedResponse<AnyTrackedCraftHttpRequest>,
> =
  | MockHttpRequestForRouteIgnoreEndpoint<Endpoint>
  | MockHttpRequestForRouteUnusedEndpoint<Endpoint>
  | MockHttpRequestForRouteMockEndpoint<Endpoint, Response>;

type MockHttpRequestForRouteNormalizedEndpoint<
  Endpoint extends string,
  Request extends AnyTrackedCraftHttpRequest,
  Input extends MockHttpRequestForRouteEndpointInput<Request>,
> = Input extends 'ignore'
  ? MockHttpRequestForRouteIgnoreEndpoint<Endpoint>
  : Input extends 'unusedOrThrow'
    ? MockHttpRequestForRouteUnusedEndpoint<Endpoint>
    : Input extends MockHttpRequestForRouteMockInput<Request>
      ? MockHttpRequestForRouteMockEndpoint<
          Endpoint,
          MockHttpRequestNormalizedResponse<Request>
        >
      : never;

type RejectExtraKeys<
  Value extends object,
  AllowedKeys extends PropertyKey,
> = Exclude<keyof Value, AllowedKeys> extends never ? Value : never;

export type MockHttpRequestForRouteResult<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
  Mocks extends MockHttpRequestForRouteInput<AppKey, RoutePath>,
> = {
  app: AppKey;
  route: RoutePath;
  endpoints: Array<
    {
      [Endpoint in RegisteredRouteEndpointKey<
        AppKey,
        RoutePath
      >]: MockHttpRequestForRouteNormalizedEndpoint<
        Endpoint,
        RegisteredRouteHttpRequest<AppKey, RoutePath, Endpoint>,
        Mocks[Endpoint]
      >;
    }[RegisteredRouteEndpointKey<AppKey, RoutePath>]
  >;
};

export type MatchMockHttpRequestForRouteRequest = {
  method: string;
  url: string;
};

export type MatchMockHttpRequestForRouteOptions = {
  ignoreUnregisteredRequests?: boolean;
};

export type MatchMockHttpRequestForRouteDecision<Response = never> =
  | {
      kind: 'ignore';
    }
  | {
      kind: 'unusedOrThrow';
      message: string;
    }
  | {
      kind: 'mock';
      response: Response;
    };

export type MatchMockHttpRequestForRouteSource<Response = unknown> = {
  app: string;
  route: string;
  endpoints: ReadonlyArray<MockHttpRequestForRouteEndpoint<string, Response>>;
};

type MatchMockHttpRequestForRouteResponse<RouteMock> =
  RouteMock extends MatchMockHttpRequestForRouteSource<infer Response>
    ? Response
    : never;

export function mockHttpRequestForRoute<
  const AppKey extends CraftRouteHttpDepsRegistryKey,
  const RoutePath extends RegisteredRoutePath<AppKey>,
  const Mocks extends MockHttpRequestForRouteInput<AppKey, RoutePath>,
>(
  app: AppKey,
  route: RoutePath,
  mocks: RejectExtraKeys<
    Mocks,
    RegisteredRouteEndpointKey<AppKey, RoutePath>
  >,
): MockHttpRequestForRouteResult<AppKey, RoutePath, Mocks> {
  const endpoints = (
    Object.entries(mocks) as Array<
      [
        RegisteredRouteEndpointKey<AppKey, RoutePath>,
        Mocks[RegisteredRouteEndpointKey<AppKey, RoutePath>],
      ]
    >
  ).map(([endpoint, input]) =>
    normalizeMockHttpRequestForRouteEndpoint(app, route, endpoint, input),
  );

  return {
    app,
    route,
    endpoints,
  } as unknown as MockHttpRequestForRouteResult<AppKey, RoutePath, Mocks>;
}

/**
 * Resolve a route-level HTTP mock decision from a request shape that can come
 * from Playwright (`page.route`) or any other test runtime.
 */
export function matchMockHttpRequestForRoute<
  const RouteMock extends MatchMockHttpRequestForRouteSource,
>(
  mockedRoute: RouteMock,
  request: MatchMockHttpRequestForRouteRequest,
  options: MatchMockHttpRequestForRouteOptions = {},
): MatchMockHttpRequestForRouteDecision<
  MatchMockHttpRequestForRouteResponse<RouteMock>
> {
  const normalizedRequest = normalizeMatchedRouteHttpRequest(request);

  const matchedEndpoint = mockedRoute.endpoints.find((endpoint) =>
    isMatchedRouteHttpRequestEndpoint(endpoint, normalizedRequest),
  );

  if (!matchedEndpoint) {
    return options.ignoreUnregisteredRequests
      ? {
          kind: 'ignore',
        }
      : {
          kind: 'unusedOrThrow',
          message: createUnregisteredRouteHttpRequestMessage(
            mockedRoute,
            request,
            normalizedRequest.method,
          ),
        };
  }

  switch (matchedEndpoint.mode) {
    case 'ignore':
      return {
        kind: 'ignore',
      };
    case 'unusedOrThrow':
      return {
        kind: 'unusedOrThrow',
        message: createMatchedUnusedRouteHttpRequestMessage(
          mockedRoute,
          matchedEndpoint,
          request,
          normalizedRequest.method,
        ),
      };
    case 'mock':
      return {
        kind: 'mock',
        response:
          matchedEndpoint.response as MatchMockHttpRequestForRouteResponse<RouteMock>,
      };
  }
}

function parseEndpointKey(endpoint: string): { method: string; url: string } {
  const separatorIndex = endpoint.indexOf(' ');

  if (separatorIndex <= 0 || separatorIndex === endpoint.length - 1) {
    throw new Error(
      `Invalid route httpDeps endpoint key "${endpoint}". Expected "METHOD URL".`,
    );
  }

  return {
    method: endpoint.slice(0, separatorIndex),
    url: endpoint.slice(separatorIndex + 1),
  };
}

function normalizeMockHttpRequestForRouteEndpoint<
  AppKey extends string,
  RoutePath extends string,
  Endpoint extends string,
  Request extends AnyTrackedCraftHttpRequest,
  Input extends MockHttpRequestForRouteEndpointInput<Request>,
>(
  app: AppKey,
  route: RoutePath,
  endpoint: Endpoint,
  input: Input,
): MockHttpRequestForRouteNormalizedEndpoint<Endpoint, Request, Input> {
  const { method, url } = parseEndpointKey(endpoint);

  if (input === 'ignore') {
    return {
      endpoint,
      method: method as EndpointMethod<Endpoint>,
      url: url as EndpointUrl<Endpoint>,
      mode: 'ignore',
    } as MockHttpRequestForRouteNormalizedEndpoint<Endpoint, Request, Input>;
  }

  if (input === 'unusedOrThrow') {
    return {
      endpoint,
      method: method as EndpointMethod<Endpoint>,
      url: url as EndpointUrl<Endpoint>,
      mode: 'unusedOrThrow',
      message: createUnusedRouteHttpEndpointMessage(app, route, endpoint),
    } as MockHttpRequestForRouteNormalizedEndpoint<Endpoint, Request, Input>;
  }

  return {
    endpoint,
    method: method as EndpointMethod<Endpoint>,
    url: url as EndpointUrl<Endpoint>,
    mode: 'mock',
    response: normalizeMockHttpRequestResponse(input.response),
  } as MockHttpRequestForRouteNormalizedEndpoint<Endpoint, Request, Input>;
}

function normalizeMockHttpRequestResponse(
  response: unknown,
):
  | MockHttpRequestSuccessResponse<AnyTrackedCraftHttpRequest>
  | MockHttpRequestErrorResponse
  | MockHttpRequestCustomExceptionResponse<AnyCraftException> {
  if (isExplicitMockHttpRequestResponse(response)) {
    return response;
  }

  return {
    kind: 'success',
    body: response,
  };
}

function normalizeMatchedRouteHttpRequest(
  request: MatchMockHttpRequestForRouteRequest,
): {
  method: string;
  pathname: string;
  pathnameWithSearch: string;
} {
  const normalizedUrl = normalizeComparableRouteHttpUrl(request.url);

  return {
    method: request.method.toUpperCase(),
    pathname: normalizedUrl.pathname,
    pathnameWithSearch: `${normalizedUrl.pathname}${normalizedUrl.search}`,
  };
}

function isMatchedRouteHttpRequestEndpoint(
  endpoint: MockHttpRequestForRouteEndpoint<string, unknown>,
  request: {
    method: string;
    pathname: string;
    pathnameWithSearch: string;
  },
): boolean {
  if (endpoint.method.toUpperCase() !== request.method) {
    return false;
  }

  const normalizedEndpointUrl = normalizeComparableRouteHttpUrl(endpoint.url);
  const endpointPathname = normalizedEndpointUrl.pathname;
  const endpointPathnameWithSearch = `${endpointPathname}${normalizedEndpointUrl.search}`;

  return normalizedEndpointUrl.search
    ? request.pathnameWithSearch === endpointPathnameWithSearch
    : request.pathname === endpointPathname;
}

function normalizeComparableRouteHttpUrl(url: string): URL {
  return new URL(url, 'http://craft-ts.local');
}

function createUnusedRouteHttpEndpointMessage(
  app: string,
  route: string,
  endpoint: string,
): string {
  return `Route HTTP endpoint "${endpoint}" for app "${app}" route "${route}" is marked as unusedOrThrow.`;
}

function createMatchedUnusedRouteHttpRequestMessage(
  mockedRoute: Pick<MatchMockHttpRequestForRouteSource, 'app' | 'route'>,
  endpoint: Pick<MockHttpRequestForRouteUnusedEndpoint<string>, 'endpoint'>,
  request: MatchMockHttpRequestForRouteRequest,
  method: string,
): string {
  return `Route HTTP request "${method} ${request.url}" matched endpoint "${endpoint.endpoint}" for app "${mockedRoute.app}" route "${mockedRoute.route}", but that endpoint is marked as unusedOrThrow.`;
}

function createUnregisteredRouteHttpRequestMessage(
  mockedRoute: Pick<MatchMockHttpRequestForRouteSource, 'app' | 'route'>,
  request: MatchMockHttpRequestForRouteRequest,
  method: string,
): string {
  return `Received unregistered route HTTP request "${method} ${request.url}" for app "${mockedRoute.app}" route "${mockedRoute.route}".`;
}

function isExplicitMockHttpRequestResponse(
  response: unknown,
): response is
  | MockHttpRequestSuccessResponse<AnyTrackedCraftHttpRequest>
  | MockHttpRequestErrorResponse
  | MockHttpRequestCustomExceptionResponse<AnyCraftException> {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const kind = Reflect.get(response, 'kind');

  return (
    kind === 'success' || kind === 'error' || kind === 'exception'
  );
}
