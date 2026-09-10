/**
 * Application-level visual coverage.
 *
 * Component matrices still describe every meaningful visual state of one
 * component. This smaller contract describes the product overview a reviewer
 * should always have: one deterministic happy path for every page, rendered
 * at the required application viewports.
 */

export const DEFAULT_VISUAL_APP_VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
} as const;

export type VisualAppViewport = {
  readonly width: number;
  readonly height: number;
};

export type HappyPathHttpMockInput = {
  /** JSON data, text, ArrayBuffer or Uint8Array returned by the endpoint. */
  readonly response: unknown;
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly contentType?: string;
};

export type HappyPathHttpEndpoint = {
  readonly endpoint: string;
  readonly method: string;
  readonly url: string;
  readonly mode: 'mock';
  readonly response: {
    readonly kind: 'success';
    readonly body: unknown;
    readonly status?: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly contentType?: string;
  };
};

export type HappyPathHttpMocks = {
  /** Dedicated fixture file. Architecture checks require `*.happy-path.ts`. */
  readonly source: string;
  readonly endpoints: readonly HappyPathHttpEndpoint[];
};

export type VisualAppPage = {
  /** Stable, human-readable id used in attestation subjects. */
  readonly id: string;
  /** Craft route path, or `/` for an application with one root page. */
  readonly route: string;
  /** URL Playwright opens. Dynamic route parameters are already resolved. */
  readonly url: string;
  /** Dependency-graph component id used to fingerprint the capture. */
  readonly component: string;
  readonly mocks: HappyPathHttpMocks;
};

export type VisualAppConfig = {
  readonly viewports: Readonly<Record<string, VisualAppViewport>>;
  readonly pages: readonly VisualAppPage[];
};

export type VisualAppConfigInput = {
  readonly viewports?: Readonly<Record<string, VisualAppViewport>>;
  readonly pages: readonly VisualAppPage[];
};

export type VisualAppHappyPath = {
  readonly id: string;
  readonly page: VisualAppPage;
  readonly viewportName: string;
  readonly viewport: VisualAppViewport;
};

export type HappyPathHttpRequest = {
  readonly method: string;
  readonly url: string;
};

const parseEndpoint = (endpoint: string): { method: string; url: string } => {
  const separator = endpoint.indexOf(' ');
  if (separator <= 0 || separator === endpoint.length - 1) {
    throw new Error(
      `defineHappyPathHttpMocks: invalid endpoint '${endpoint}'; expected 'METHOD URL'.`,
    );
  }
  return {
    method: endpoint.slice(0, separator).toUpperCase(),
    url: endpoint.slice(separator + 1),
  };
};

/** Defines the successful response dataset stored beside a page test. */
export function defineHappyPathHttpMocks<
  const Mocks extends Readonly<Record<string, HappyPathHttpMockInput>>,
>(source: string, mocks: Mocks): HappyPathHttpMocks {
  return {
    source,
    endpoints: Object.entries(mocks).map(([endpoint, input]) => {
      const { method, url } = parseEndpoint(endpoint);
      return {
        endpoint,
        method,
        url,
        mode: 'mock' as const,
        response: {
          kind: 'success' as const,
          body: input.response,
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.headers === undefined ? {} : { headers: input.headers }),
          ...(input.contentType === undefined
            ? {}
            : { contentType: input.contentType }),
        },
      };
    }),
  };
}

type RouteHappyPathHttpMocks = {
  readonly endpoints: readonly {
    readonly endpoint: string;
    readonly method: string;
    readonly url: string;
    readonly mode: 'mock';
    readonly response: {
      readonly kind: 'success';
      readonly body: unknown;
      readonly status?: number;
      readonly headers?: Readonly<Record<string, string | undefined>>;
    };
  }[];
};

/** Adds the fixture-file proof to an exhaustive `mockHttpRequestForRoute`. */
export function defineRouteHappyPathHttpMocks<
  const Mocks extends RouteHappyPathHttpMocks,
>(source: string, mocks: Mocks): HappyPathHttpMocks {
  return {
    source,
    endpoints: mocks.endpoints.map((endpoint) => ({
      endpoint: endpoint.endpoint,
      method: endpoint.method,
      url: endpoint.url,
      mode: endpoint.mode,
      response: {
        kind: endpoint.response.kind,
        body: endpoint.response.body,
        ...(endpoint.response.status === undefined
          ? {}
          : { status: endpoint.response.status }),
        ...(endpoint.response.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(endpoint.response.headers).filter(
                  (entry): entry is [string, string] => entry[1] !== undefined,
                ),
              ),
            }
          : {}),
      },
    })),
  };
}

/** Applies CraftTS' mobile + desktop defaults when no viewport is supplied. */
export function defineVisualAppConfig<const Input extends VisualAppConfigInput>(
  input: Input,
): VisualAppConfig {
  return {
    viewports: input.viewports ?? DEFAULT_VISUAL_APP_VIEWPORTS,
    pages: input.pages,
  };
}

/** Cross product consumed by a Playwright capture producer. */
export function visualAppHappyPaths(
  config: VisualAppConfig,
): readonly VisualAppHappyPath[] {
  return config.pages.flatMap((page) =>
    Object.entries(config.viewports).map(([viewportName, viewport]) => ({
      id: `${page.id}--happy-path--${viewportName}`,
      page,
      viewportName,
      viewport,
    })),
  );
}

/** Matches one browser request against the page's deterministic dataset. */
export function matchHappyPathHttpRequest(
  mocks: HappyPathHttpMocks,
  request: HappyPathHttpRequest,
): HappyPathHttpEndpoint | undefined {
  const requested = new URL(request.url, 'http://craft-ts.local');
  return mocks.endpoints.find((endpoint) => {
    if (endpoint.method !== request.method.toUpperCase()) return false;
    const expected = new URL(endpoint.url, 'http://craft-ts.local');
    const pathPattern = new RegExp(
      `^${expected.pathname
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+')}$`,
    );
    return (
      pathPattern.test(requested.pathname) &&
      (!expected.search || expected.search === requested.search)
    );
  });
}
