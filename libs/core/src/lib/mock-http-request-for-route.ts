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

type RouteMetaDataPath<RouteMetaData> = RouteMetaData extends {
  path: infer Path extends string;
}
  ? Path
  : never;

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

type EndpointMethod<Endpoint extends string> = Endpoint extends `${infer Method} ${string}`
  ? Method
  : never;

type EndpointUrl<Endpoint extends string> = Endpoint extends `${string} ${infer Url}`
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
  code: Exception['code'];
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

export type MockHttpRequestForRouteInput<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
> = Partial<{
  [Endpoint in RegisteredRouteEndpointKey<AppKey, RoutePath>]: MockHttpRequestResponse<
    RegisteredRouteHttpRequest<AppKey, RoutePath, Endpoint>
  >;
}>;

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

export type MockHttpRequestForRouteHandler<
  Endpoint extends string,
  Request extends AnyTrackedCraftHttpRequest,
> = {
  endpoint: Endpoint;
  method: EndpointMethod<Endpoint>;
  url: EndpointUrl<Endpoint>;
  response: MockHttpRequestNormalizedResponse<Request>;
};

export type MockHttpRequestForRouteResult<
  AppKey extends CraftRouteHttpDepsRegistryKey,
  RoutePath extends RegisteredRoutePath<AppKey>,
  Mocks extends MockHttpRequestForRouteInput<AppKey, RoutePath>,
> = {
  app: AppKey;
  route: RoutePath;
  handlers: Array<
    {
      [Endpoint in Extract<
        Extract<keyof Mocks, string>,
        RegisteredRouteEndpointKey<AppKey, RoutePath>
      >]: MockHttpRequestForRouteHandler<
        Endpoint,
        RegisteredRouteHttpRequest<AppKey, RoutePath, Endpoint>
      >;
    }[
      Extract<
        Extract<keyof Mocks, string>,
        RegisteredRouteEndpointKey<AppKey, RoutePath>
      >
    ]
  >;
};

export function mockHttpRequestForRoute<
  const AppKey extends CraftRouteHttpDepsRegistryKey,
  const RoutePath extends RegisteredRoutePath<AppKey>,
  const Mocks extends MockHttpRequestForRouteInput<AppKey, RoutePath>,
>(
  app: AppKey,
  route: RoutePath,
  mocks: Mocks,
): MockHttpRequestForRouteResult<AppKey, RoutePath, Mocks> {
  const handlers = (
    Object.entries(mocks) as Array<[string, Mocks[keyof Mocks]]>
  ).map(([endpoint, response]) => {
    const { method, url } = parseEndpointKey(endpoint);

    return {
      endpoint,
      method,
      url,
      response: normalizeMockHttpRequestResponse(response),
    };
  });

  return {
    app,
    route,
    handlers,
  } as MockHttpRequestForRouteResult<AppKey, RoutePath, Mocks>;
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
