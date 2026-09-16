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
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 1000 },
  wide: { width: 2560, height: 1440 },
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
  /** @deprecated Prefer explicit scenarios. */
  readonly mocks?: HappyPathHttpMocks;
  readonly scenarios?: readonly VisualAppScenario[];
  /** Shared shell components whose code and endpoints affect this page. */
  readonly dependencies?: readonly string[];
};

export type VisualAppHttpContract = {
  readonly method: string;
  readonly url: string;
  readonly exceptions: readonly string[];
};

export type VisualAppConfig = {
  readonly httpContracts?: Readonly<Record<string, VisualAppHttpContract>>;
  readonly sourceFiles?: readonly string[];
  readonly comparison?: VisualAppComparison;
  readonly stabilityTimeoutMs?: number;
  readonly environment?: string;
  readonly viewports: Readonly<Record<string, VisualAppViewport>>;
  readonly pages: readonly VisualAppPage[];
};

export type VisualAppConfigInput = {
  /** Explicit contracts for unanalyzable calls, keyed by repository-relative file:line. */
  readonly httpContracts?: Readonly<Record<string, VisualAppHttpContract>>;
  /** Global styles, entry points and runtime assets shared by all pages. */
  readonly sourceFiles?: readonly string[];
  readonly comparison?: VisualAppComparison;
  readonly stabilityTimeoutMs?: number;
  /** Change when the pinned browser / OS / fonts change. */
  readonly environment?: string;
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

/** Applies and validates the project-wide application capture contract. */
export function defineVisualAppConfig<const Input extends VisualAppConfigInput>(
  input: Input,
): VisualAppConfig {
  const viewports = input.viewports ?? DEFAULT_VISUAL_APP_VIEWPORTS;
  if (
    typeof viewports !== 'object' ||
    Array.isArray(viewports) ||
    !Object.keys(viewports).length
  )
    throw new Error('visual.app.viewports must not be empty.');
  for (const [name, size] of Object.entries(viewports)) {
    if (
      !name.trim() ||
      !Number.isInteger(size?.width) ||
      size.width < 1 ||
      !Number.isInteger(size?.height) ||
      size.height < 1
    ) {
      throw new Error(
        `Invalid visual viewport '${name}': expected a name and positive integer dimensions.`,
      );
    }
  }
  const comparison = input.comparison ?? DEFAULT_VISUAL_APP_COMPARISON;
  if (
    !Number.isFinite(comparison.threshold) ||
    comparison.threshold < 0 ||
    comparison.threshold > 1 ||
    !Number.isInteger(comparison.maxDiffPixels) ||
    comparison.maxDiffPixels < 0
  ) {
    throw new Error('Invalid visual comparison threshold or maxDiffPixels.');
  }
  const stabilityTimeoutMs = input.stabilityTimeoutMs ?? 10_000;
  if (!Number.isFinite(stabilityTimeoutMs) || stabilityTimeoutMs <= 0)
    throw new Error('Invalid stabilityTimeoutMs.');
  const pageIds = new Set<string>();
  for (const page of input.pages) {
    uniqueId(page.id, pageIds, 'page');
    if (
      !page.component?.trim() ||
      !page.url?.trim() ||
      typeof page.route !== 'string'
    )
      throw new Error(`Invalid page '${page.id}'.`);
    if (!page.scenarios && !page.mocks)
      throw new Error(`Page '${page.id}' needs scenarios or legacy mocks.`);
    const scenarios = visualAppScenarios(page);
    if (!scenarios.some((s) => s.category === 'happy-path'))
      throw new Error(`Page '${page.id}' needs a happy path.`);
    const scenarioIds = new Set<string>();
    for (const scenario of scenarios) {
      uniqueId(scenario.id, scenarioIds, 'scenario');
      if (
        !scenario.label?.trim() ||
        !['happy-path', 'exception'].includes(scenario.category)
      )
        throw new Error(`Invalid scenario '${scenario.id}'.`);
      if (!scenario.mocks || !Array.isArray(scenario.mocks.endpoints))
        throw new Error(`Scenario '${scenario.id}' needs mocks.`);
      for (const step of scenario.steps) {
        if (
          ![
            'navigate',
            'click',
            'fill',
            'select',
            'press',
            'scroll',
            'wait',
            'capture',
          ].includes(step.action)
        )
          throw new Error(`Unknown action in '${scenario.id}'.`);
        if ('target' in step && step.target && !step.target.name?.trim())
          throw new Error(`Unnamed control in '${scenario.id}'.`);
        if (
          step.action === 'scroll' &&
          (!Number.isFinite(step.y) ||
            (step.x !== undefined && !Number.isFinite(step.x)))
        )
          throw new Error('Scroll coordinates must be finite.');
        if ('expect' in step)
          for (const expectation of step.expect) {
            if (
              !['visible', 'hidden', 'text', 'count', 'url'].includes(
                expectation.kind,
              )
            )
              throw new Error('Unknown capture expectation.');
            if ('target' in expectation && !expectation.target.name?.trim())
              throw new Error('Capture expectation needs a named control.');
            if (
              expectation.kind === 'count' &&
              (!Number.isInteger(expectation.count) || expectation.count < 0)
            )
              throw new Error('Capture count must be a nonnegative integer.');
          }
      }
      const captures = scenario.steps.filter(
        (s): s is VisualAppCaptureStep => s.action === 'capture',
      );
      if (!captures.length)
        throw new Error(`Scenario '${scenario.id}' needs a capture.`);
      const captureIds = new Set<string>();
      for (const capture of captures) {
        uniqueId(capture.id, captureIds, 'capture');
        if (!capture.expect?.length)
          throw new Error(`Capture '${capture.id}' needs expectations.`);
      }
      if (
        scenario.exception?.capture &&
        !captureIds.has(scenario.exception.capture)
      )
        throw new Error(
          `Unknown exception capture '${scenario.exception.capture}'.`,
        );
      for (const modal of scenario.modals ?? []) {
        if (
          !captures.some(
            (c) =>
              c.modal === modal.id &&
              c.expect.some(
                (e) =>
                  'target' in e &&
                  e.target.name === modal.target.name &&
                  e.kind === 'visible',
              ),
          )
        ) {
          throw new Error(
            `Modal '${modal.id}' needs a capture with a visible expectation.`,
          );
        }
      }
      if (
        scenario.category === 'exception' &&
        (!scenario.exception || !scenario.exception.expect.length)
      )
        throw new Error(
          `Exception scenario '${scenario.id}' needs a runtime exception expectation.`,
        );
    }
  }
  return {
    httpContracts: input.httpContracts,
    sourceFiles: input.sourceFiles,
    viewports,
    pages: input.pages,
    comparison,
    stabilityTimeoutMs,
    environment: input.environment ?? 'chromium-v1',
  };
}

/** Cross product consumed by a Playwright capture producer. */
export function visualAppHappyPaths(
  config: VisualAppConfig,
): readonly VisualAppHappyPath[] {
  return visualAppCaptureTargets(config)
    .filter((target) => target.scenario.category === 'happy-path')
    .map((target) => ({
      id: target.id,
      page: target.page,
      viewportName: target.viewportName,
      viewport: target.viewport,
    }));
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

export type VisualAppComparison = {
  readonly threshold: number;
  readonly maxDiffPixels: number;
};
export const DEFAULT_VISUAL_APP_COMPARISON: VisualAppComparison = {
  threshold: 0.1,
  maxDiffPixels: 10,
};

/** A named Craft control, optionally inside a named repeated context. */
export type VisualAppControl = {
  readonly name: string;
  readonly context?: { readonly name: string; readonly text?: string };
  readonly text?: string;
};
export type VisualAppExpectation =
  | { readonly kind: 'visible' | 'hidden'; readonly target: VisualAppControl }
  | {
      readonly kind: 'text';
      readonly target: VisualAppControl;
      readonly text: string;
    }
  | {
      readonly kind: 'count';
      readonly target: VisualAppControl;
      readonly count: number;
    }
  | { readonly kind: 'url'; readonly url: string };
export type VisualAppCaptureStep = {
  readonly action: 'capture';
  readonly id: string;
  readonly label?: string;
  readonly expect: readonly VisualAppExpectation[];
  readonly modal?: string;
};
export type VisualAppStep =
  | { readonly action: 'navigate'; readonly url: string }
  | { readonly action: 'click'; readonly target: VisualAppControl }
  | {
      readonly action: 'fill';
      readonly target: VisualAppControl;
      readonly value: string;
    }
  | {
      readonly action: 'select';
      readonly target: VisualAppControl;
      readonly value: string | string[];
    }
  | {
      readonly action: 'press';
      readonly target: VisualAppControl;
      readonly key: string;
    }
  | {
      readonly action: 'scroll';
      readonly target?: VisualAppControl;
      readonly x?: number;
      readonly y: number;
    }
  | {
      readonly action: 'wait';
      readonly expect: readonly VisualAppExpectation[];
    }
  | VisualAppCaptureStep;
export type VisualHttpResponse = {
  readonly kind: 'success' | 'error' | 'exception';
  readonly body: unknown;
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly contentType?: string;
  /** Business exception discriminant, independently verified in the browser. */
  readonly exception?: string;
};
export type VisualHttpEndpoint = {
  readonly endpoint?: string;
  readonly method: string;
  readonly url: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly requestBody?: unknown;
} & (
  | { readonly mode: 'unused'; readonly reason: string }
  | {
      readonly mode: 'mock';
      readonly response: VisualHttpResponse;
      readonly sequence?: never;
    }
  | {
      readonly mode: 'mock';
      readonly sequence: readonly VisualHttpResponse[];
      readonly response?: never;
    }
);
export type VisualHttpMocks = {
  readonly sources: readonly string[];
  readonly endpoints: readonly VisualHttpEndpoint[];
};
export type VisualAppScenario = {
  readonly id: string;
  readonly label: string;
  readonly category: 'happy-path' | 'exception';
  readonly mocks: VisualHttpMocks | HappyPathHttpMocks;
  readonly steps: readonly VisualAppStep[];
  readonly modals?: readonly {
    readonly id: string;
    readonly component: string;
    readonly target: VisualAppControl;
  }[];
  /** The app dispatches craft:visual-exception with { endpoint, discriminant } on its actual error branch. */
  readonly exception?: {
    /** Defaults to the last capture point of the scenario. */
    readonly capture?: string;
    readonly endpoint: string;
    readonly discriminant: string;
    readonly expect: readonly VisualAppExpectation[];
  };
};
export type VisualAppCaptureTarget = {
  readonly id: string;
  readonly subject: string;
  readonly page: VisualAppPage;
  readonly scenario: VisualAppScenario;
  readonly capture: VisualAppCaptureStep;
  readonly viewportName: string;
  readonly viewport: VisualAppViewport;
};
const uniqueId = (id: string, seen: Set<string>, kind: string): void => {
  if (!id?.trim() || seen.has(id))
    throw new Error(`Invalid or duplicate ${kind} id '${id}'.`);
  seen.add(id);
};
/** Compose imported typed fixtures. Overlap is refused at request matching time. */
export function defineVisualHttpMocks(
  source: string,
  endpoints: readonly VisualHttpEndpoint[],
  ...shared: readonly (VisualHttpMocks | HappyPathHttpMocks)[]
): VisualHttpMocks {
  if (!/\.(mocks|happy-path)\.ts$/.test(source))
    throw new Error(`Invalid mock source '${source}'.`);
  for (const endpoint of endpoints) {
    if (!endpoint.method?.trim() || !endpoint.url?.trim())
      throw new Error('Mock needs method and URL.');
    if (endpoint.mode === 'mock' && endpoint.sequence?.length === 0)
      throw new Error('Empty response sequence.');
  }
  return {
    sources: [...new Set([...shared.flatMap(visualHttpSources), source])],
    endpoints: [
      ...shared.flatMap<VisualHttpEndpoint>((m) => m.endpoints),
      ...endpoints,
    ],
  };
}
export const visualHttpSources = (
  mocks: VisualHttpMocks | HappyPathHttpMocks,
): readonly string[] => ('sources' in mocks ? mocks.sources : [mocks.source]);
/** Legacy happy paths are adapted, retaining their historical ids. */
export function visualAppScenarios(
  page: VisualAppPage,
): readonly VisualAppScenario[] {
  if (page.scenarios) return page.scenarios;
  if (!page.mocks) return [];
  return [
    {
      id: 'happy-path',
      label: 'Happy path',
      category: 'happy-path',
      mocks: page.mocks,
      steps: [
        {
          action: 'capture',
          id: 'page',
          expect: [{ kind: 'url', url: page.url }],
        },
      ],
    },
  ];
}
/** The single identity/product function shared by producers, status and review. */
export function visualAppCaptureTargets(
  config: VisualAppConfig,
): readonly VisualAppCaptureTarget[] {
  const encode = (part: string) =>
    encodeURIComponent(part).replace(/-/g, '%2D');
  return config.pages.flatMap((page) =>
    visualAppScenarios(page).flatMap((scenario) =>
      scenario.steps
        .filter(
          (step): step is VisualAppCaptureStep => step.action === 'capture',
        )
        .flatMap((capture) =>
          Object.entries(config.viewports).map(([viewportName, viewport]) => {
            const id = page.scenarios
              ? `app--${[page.id, scenario.id, capture.id, viewportName].map(encode).join('--')}`
              : `${page.id}--happy-path--${viewportName}`;
            return {
              id,
              subject: `visual:${page.component}#${id}`,
              page,
              scenario,
              capture,
              viewportName,
              viewport,
            };
          }),
        ),
    ),
  );
}

export function matchesVisualHttpRequest(
  endpoint: VisualHttpEndpoint,
  request: HappyPathHttpRequest & {
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: unknown;
  },
): boolean {
  if (endpoint.method.toUpperCase() !== request.method.toUpperCase())
    return false;
  const expected = new URL(endpoint.url, 'http://craft-ts.local');
  const actual = new URL(request.url, 'http://craft-ts.local');
  if (/^https?:\/\//.test(endpoint.url) && expected.origin !== actual.origin)
    return false;
  const pattern = new RegExp(
    `^${expected.pathname
      .split('*')
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]+')}$`,
  );
  return (
    pattern.test(actual.pathname) &&
    (!expected.search || expected.search === actual.search) &&
    Object.entries(endpoint.query ?? {}).every(
      ([key, value]) => actual.searchParams.get(key) === value,
    ) &&
    Object.entries(endpoint.requestHeaders ?? {}).every(
      ([key, value]) => request.headers?.[key.toLowerCase()] === value,
    ) &&
    (endpoint.requestBody === undefined ||
      JSON.stringify(endpoint.requestBody) === JSON.stringify(request.body))
  );
}

/** Preserve the type checks performed by mockHttpRequestForRoute, including binary responses and exception discriminants. */
export function defineRouteVisualHttpMocks(
  source: string,
  mocks: {
    readonly endpoints: readonly {
      readonly endpoint: string;
      readonly method: string;
      readonly url: string;
      readonly mode: string;
      readonly response?: {
        readonly kind: 'success' | 'error' | 'exception';
        readonly body?: unknown;
        readonly status?: number;
        readonly headers?: Readonly<Record<string, string | undefined>>;
        readonly _tag?: string;
      };
    }[];
  },
): VisualHttpMocks {
  return defineVisualHttpMocks(
    source,
    mocks.endpoints.map((endpoint) => {
      if (endpoint.mode === 'unusedOrThrow')
        return {
          ...endpoint,
          mode: 'unused' as const,
          reason: 'Declared unused in typed route mocks',
        };
      if (endpoint.mode !== 'mock' || !endpoint.response)
        throw new Error(
          `Endpoint '${endpoint.endpoint}' must be mocked or unused; passthrough is forbidden.`,
        );
      return {
        endpoint: endpoint.endpoint,
        method: endpoint.method,
        url: endpoint.url,
        mode: 'mock' as const,
        response: {
          ...endpoint.response,
          body: endpoint.response.body,
          ...(endpoint.response._tag
            ? { exception: endpoint.response._tag }
            : {}),
        },
      };
    }),
  );
}
