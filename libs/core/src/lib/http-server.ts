export type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS';

export type CachePolicy = 'no-store' | 'no-cache' | 'private' | 'public';

export type RequestLogger = Readonly<{
  debug(event: string, data?: Readonly<Record<string, unknown>>): void;
  info(event: string, data?: Readonly<Record<string, unknown>>): void;
  warn(event: string, data?: Readonly<Record<string, unknown>>): void;
  error(event: string, data?: Readonly<Record<string, unknown>>): void;
}>;

export type HttpMetricsEntry = Readonly<{
  method: string;
  path: string;
  status: number;
  durationMs: number;
}>;

export type HttpMetricsSnapshot = Readonly<{
  requests: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
  statusCounts: Readonly<Record<string, number>>;
}>;

export type HttpMetrics = Readonly<{
  record(entry: HttpMetricsEntry): void;
  snapshot(): HttpMetricsSnapshot;
  reset(): void;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}>;

export type RateLimitStore = Readonly<{
  consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): RateLimitDecision;
}>;

export type RateLimitMiddlewareOptions<
  User = unknown,
  Services = unknown,
> = Readonly<{
  limit: number;
  windowMs: number;
  /**
   * Identifie l'appelant (IP validée par le proxy, identifiant de session…).
   * Obligatoire : une clé constante ferait qu'un seul client épuise le quota
   * de tous les autres.
   */
  key: (request: Request, context: RequestContext<User, Services>) => string;
  skip?: (request: Request) => boolean;
  store?: RateLimitStore;
  now?: () => number;
}>;

export type RequestContext<User = unknown, Services = unknown> = Readonly<{
  request: Request;
  requestId: string;
  signal: AbortSignal;
  /** Résolu après les gardes d'entrée, jamais avant. */
  user?: User;
  services?: Services;
  params: Readonly<Record<string, string>>;
  logger: RequestLogger;
  /** Nonce par requête, à reporter dans la CSP et sur les styles rendus. */
  cspNonce: string;
}>;

export type ServerRoute<User = unknown, Services = unknown> = Readonly<{
  method: HttpMethod;
  path: string;
  handler: (
    request: Request,
    context: RequestContext<User, Services>,
  ) => Response | Promise<Response>;
  auth?: 'public' | 'required';
  csrf?: boolean;
  cache?: CachePolicy;
}>;

export type ServerMiddleware<User = unknown, Services = unknown> = (
  request: Request,
  context: RequestContext<User, Services>,
  next: () => Promise<Response>,
) => Response | Promise<Response>;

export type HttpServerOptions<User = unknown, Services = unknown> = Readonly<{
  routes?: readonly ServerRoute<User, Services>[];
  middleware?: readonly ServerMiddleware<User, Services>[];
  handler?: (
    request: Request,
    context: RequestContext<User, Services>,
  ) => Response | Promise<Response>;
  user?: (request: Request) => User | Promise<User | undefined>;
  services?: Services | ((request: Request) => Services | Promise<Services>);
  allowedOrigins?: readonly string[];
  /**
   * Hôtes que le serveur accepte de servir. L'origine d'une requête est
   * calculée à partir de son URL, elle-même construite depuis l'en-tête Host
   * par les adapters : sans allowlist, un client peut se déclarer
   * « same-origin » et contourner les contrôles CSRF.
   */
  trustedHosts?: readonly string[];
  /**
   * `'strict'` (défaut) refuse toute mutation dont l'origine est étrangère.
   * `'off'` réserve la décision aux middlewares de l'application.
   */
  csrf?: 'strict' | 'off';
  maxBodyBytes?: number;
  timeoutMs?: number;
  /**
   * Requêtes traitées simultanément. Au-delà, le serveur répond 503 plutôt
   * que d'accepter une charge qu'il ne peut pas rendre : un rendu SSR ou une
   * server function réserve de la mémoire pour toute sa durée.
   */
  maxConcurrentRequests?: number;
  logger?: RequestLogger;
  loggerSink?: (entry: Readonly<Record<string, unknown>>) => void;
  metrics?: HttpMetrics;
}>;

export type HttpServer = Readonly<{
  handle(request: Request): Promise<Response>;
  metrics: HttpMetrics;
}>;

export class HttpRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'HttpRequestError';
    this.code = code;
    this.status = status;
  }
}

const MUTATION_METHODS = new Set<HttpMethod>([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

export function createHttpServer<User = unknown, Services = unknown>(
  options: HttpServerOptions<User, Services>,
): HttpServer {
  const routes = options.routes ?? [];
  const middleware = [
    // L'ordre est une décision de sécurité : les gardes d'entrée (hôte,
    // origine, taille) passent avant la résolution d'identité, qui coûte
    // souvent une vérification cryptographique ou un aller-retour réseau.
    createRequestGuardMiddleware(options),
    createIdentityMiddleware<User, Services>(options),
    ...(options.middleware ?? []),
  ];
  const routeHandler =
    options.handler ?? createRouteHandler<User, Services>(routes);
  const metrics = options.metrics ?? createHttpMetrics();
  const maxConcurrent = options.maxConcurrentRequests ?? 0;
  let inFlight = 0;

  return {
    metrics,
    async handle(request) {
      const startedAt = Date.now();
      if (maxConcurrent > 0 && inFlight >= maxConcurrent) {
        metrics.record({
          method: request.method,
          path: new URL(request.url).pathname,
          status: 503,
          durationMs: 0,
        });
        return withResponseHeaders(
          jsonError(503, 'HTTP_OVERLOADED', 'Server is at capacity.'),
          { 'retry-after': '1' },
        );
      }
      inFlight += 1;
      const requestId = requestIdFrom(request);
      const timeout = timeoutSignal(request.signal, options.timeoutMs ?? 15_000);
      const signal = timeout.signal;
      const logger =
        options.logger ?? createJsonLogger(requestId, options.loggerSink);
      const context: RequestContext<User, Services> = {
        request,
        requestId,
        signal,
        cspNonce: createCspNonce(),
        params: {},
        logger,
      };

      let response: Response;
      try {
        response = await withAbort(
          composeServerMiddleware(middleware, () =>
            routeHandler(request, context),
          )(request, context),
          signal,
        );
      } catch (error) {
        response = errorResponse(error);
        logger.error('http.request.failed', {
          method: request.method,
          path: new URL(request.url).pathname,
          durationMs: Date.now() - startedAt,
          error: publicErrorMessage(error),
        });
      }

      inFlight -= 1;
      timeout.dispose();
      const responseWithHeaders = withResponseHeaders(response, {
        'x-request-id': requestId,
      });
      logger.info('http.request.completed', {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      metrics.record({
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return responseWithHeaders;
    },
  };
}

export function createHttpMetrics(): HttpMetrics {
  let requests = 0;
  let errors = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  const statusCounts: Record<string, number> = {};

  return {
    record(entry) {
      requests += 1;
      if (entry.status >= 400) errors += 1;
      totalDurationMs += entry.durationMs;
      maxDurationMs = Math.max(maxDurationMs, entry.durationMs);
      const status = String(entry.status);
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    },
    snapshot() {
      return {
        requests,
        errors,
        totalDurationMs,
        maxDurationMs,
        statusCounts: { ...statusCounts },
      };
    },
    reset() {
      requests = 0;
      errors = 0;
      totalDurationMs = 0;
      maxDurationMs = 0;
      for (const status of Object.keys(statusCounts)) {
        delete statusCounts[status];
      }
    },
  };
}

export function createRateLimitMiddleware<User = unknown, Services = unknown>(
  options: RateLimitMiddlewareOptions<User, Services>,
): ServerMiddleware<User, Services> {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new RangeError('Rate-limit limit must be a positive integer.');
  }
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
    throw new RangeError('Rate-limit windowMs must be a positive integer.');
  }
  const store = options.store ?? createInMemoryRateLimitStore();
  const now = options.now ?? (() => Date.now());
  const key = options.key;

  return async (request, context, next) => {
    if (options.skip?.(request)) return next();
    const rateLimitKey = key(request, context);
    const decision = store.consume(
      rateLimitKey,
      options.limit,
      options.windowMs,
      now(),
    );
    const headers = rateLimitHeaders(decision);
    if (!decision.allowed) {
      context.logger.warn('http.rate_limit.rejected', {
        key: rateLimitKey,
        limit: decision.limit,
        resetAt: decision.resetAt,
      });
      return withResponseHeaders(
        jsonError(429, 'HTTP_RATE_LIMITED', 'Too many requests.'),
        {
          ...headers,
          'retry-after': String(
            Math.max(1, Math.ceil((decision.resetAt - now()) / 1000)),
          ),
        },
      );
    }
    return withResponseHeaders(await next(), headers);
  };
}

export function createInMemoryRateLimitStore(): RateLimitStore {
  type Bucket = { count: number; resetAt: number };
  const buckets = new Map<string, Bucket>();
  return {
    consume(key, limit, windowMs, now) {
      const current = buckets.get(key);
      const bucket =
        current && current.resetAt > now
          ? current
          : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      if (buckets.size > 1024) {
        for (const [bucketKey, candidate] of buckets) {
          if (candidate.resetAt <= now) buckets.delete(bucketKey);
        }
      }
      return {
        allowed: bucket.count <= limit,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      };
    },
  };
}

export function composeServerMiddleware<User, Services>(
  middleware: readonly ServerMiddleware<User, Services>[],
  terminal: (
    request: Request,
    context: RequestContext<User, Services>,
  ) => Response | Promise<Response>,
): (
  request: Request,
  context: RequestContext<User, Services>,
) => Promise<Response> {
  return async (request, context) => {
    const dispatch = (index: number): Promise<Response> => {
      if (index === middleware.length) {
        return Promise.resolve(terminal(request, context));
      }
      return Promise.resolve(
        middleware[index](request, context, () => dispatch(index + 1)),
      );
    };
    return dispatch(0);
  };
}

export function matchServerRoute<User = unknown, Services = unknown>(
  request: Request,
  routes: readonly ServerRoute<User, Services>[],
):
  | {
      readonly route: ServerRoute<User, Services>;
      readonly params: Readonly<Record<string, string>>;
    }
  | undefined {
  const method = request.method.toUpperCase() as HttpMethod;
  const pathname = normalizePathname(new URL(request.url).pathname);
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, pathname);
    if (params) return { route, params };
  }
  return undefined;
}

export function createRequestGuardMiddleware<User, Services>(
  options: Pick<
    HttpServerOptions<User, Services>,
    'allowedOrigins' | 'maxBodyBytes' | 'trustedHosts' | 'csrf'
  >,
): ServerMiddleware<User, Services> {
  const maxBodyBytes = options.maxBodyBytes ?? 1_048_576;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const trustedHosts = new Set(options.trustedHosts ?? []);

  return (request, context, next) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return jsonError(400, 'HTTP_REQUEST_INVALID', 'Invalid request URL.');
    }
    if (trustedHosts.size > 0 && !trustedHosts.has(url.host)) {
      context.logger.warn('http.host.rejected', { host: url.host });
      return jsonError(400, 'HTTP_HOST_NOT_ALLOWED', 'Host is not allowed.');
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
      const length = Number(contentLength);
      if (!Number.isSafeInteger(length) || length < 0) {
        return jsonError(
          400,
          'HTTP_CONTENT_LENGTH_INVALID',
          'Invalid Content-Length.',
        );
      }
      if (length > maxBodyBytes) {
        return jsonError(
          413,
          'HTTP_BODY_TOO_LARGE',
          'Request body is too large.',
        );
      }
    }

    const origin = request.headers.get('origin');
    const sameOrigin = origin === url.origin;
    const allowed = origin !== null && (sameOrigin || allowedOrigins.has(origin));
    // Une origine étrangère sur une méthode mutante est refusée par défaut :
    // c'est le seul réglage qui protège une application montée sur cookie
    // avant qu'elle n'ait configuré quoi que ce soit.
    if (
      options.csrf !== 'off' &&
      origin !== null &&
      !allowed &&
      MUTATION_METHODS.has(request.method.toUpperCase() as HttpMethod)
    ) {
      context.logger.warn('http.origin.rejected', {
        method: request.method,
        origin,
      });
      return jsonError(403, 'HTTP_ORIGIN_NOT_ALLOWED', 'Origin is not allowed.');
    }
    if (origin && !allowed && allowedOrigins.size > 0) {
      return jsonError(
        403,
        'HTTP_ORIGIN_NOT_ALLOWED',
        'Origin is not allowed.',
      );
    }
    if (allowed) {
      return withCorsHeaders(request, next(), allowedOrigins, origin);
    }
    return next();
  };
}

/**
 * Résout l'identité et les services de la requête à l'intérieur du pipeline,
 * pour qu'une session illisible produise une réponse d'erreur propre au lieu
 * de rejeter la promesse du serveur.
 */
export function createIdentityMiddleware<User, Services>(
  options: Pick<HttpServerOptions<User, Services>, 'user' | 'services'>,
): ServerMiddleware<User, Services> {
  return async (request, context, next) => {
    const mutable = context as {
      user?: User;
      services?: Services;
    };
    if (options.user) {
      const user = await options.user(request);
      if (user !== undefined) mutable.user = user;
    }
    if (options.services !== undefined) {
      mutable.services =
        typeof options.services === 'function'
          ? await (
              options.services as (
                request: Request,
              ) => Services | Promise<Services>
            )(request)
          : options.services;
    }
    return next();
  };
}

export function createCorsMiddleware(
  allowedOrigins: readonly string[],
): ServerMiddleware {
  const origins = new Set(allowedOrigins);
  return (request, _context, next) => {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      if (!origin || !origins.has(origin)) {
        return jsonError(
          403,
          'HTTP_ORIGIN_NOT_ALLOWED',
          'Origin is not allowed.',
        );
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }
    const response = next();
    return response.then((value) =>
      origin && origins.has(origin)
        ? withResponseHeaders(value, corsHeaders(origin))
        : value,
    );
  };
}

export type SecurityMiddlewareOptions = Readonly<{
  readonly allowedOrigins?: readonly string[];
  /** Ajoute HSTS et redirige le trafic clair vers HTTPS. */
  readonly forceHttps?: boolean;
  /**
   * Reporte le nonce de la requête dans `style-src`/`script-src`. Sans lui, la
   * politique doit tolérer `'unsafe-inline'` pour les styles rendus par le SSR,
   * ce qui vide la CSP d'une partie de son intérêt.
   */
  readonly useNonce?: boolean;
  /** Sources supplémentaires, par directive, ajoutées à la politique de base. */
  readonly directives?: Readonly<Record<string, readonly string[]>>;
}>;

export function createSecurityMiddleware(
  options: SecurityMiddlewareOptions = {},
): ServerMiddleware {
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const useNonce = options.useNonce ?? true;
  return (request, context, next) => {
    if (options.forceHttps) {
      const url = new URL(request.url);
      if (url.protocol === 'http:' && url.hostname !== 'localhost') {
        url.protocol = 'https:';
        return new Response(null, {
          status: 308,
          headers: { location: url.toString() },
        });
      }
    }
    const headers: Record<string, string> = {
      'content-security-policy': contentSecurityPolicy(
        useNonce ? context.cspNonce : undefined,
        options.directives,
      ),
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), geolocation=(), microphone=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    };
    if (options.forceHttps) {
      headers['strict-transport-security'] =
        'max-age=31536000; includeSubDomains';
    }
    const origin = request.headers.get('origin');
    if (origin && allowedOrigins.has(origin)) {
      Object.assign(headers, corsHeaders(origin));
    }
    return next().then((response) => withResponseHeaders(response, headers));
  };
}

/**
 * Politique de base. Les domaines appartiennent au projet : `directives`
 * ajoute des sources, la lib ne décide que du socle restrictif.
 */
export function contentSecurityPolicy(
  nonce?: string,
  directives: Readonly<Record<string, readonly string[]>> = {},
): string {
  const base: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
    'form-action': ["'self'"],
    'script-src': ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : [])],
    'style-src': [
      "'self'",
      // Repli documenté quand l'application n'a pas encore de nonce.
      // craft-security-ignore CRAFT_SECURITY_CSP_UNSAFE_INLINE
      ...(nonce ? [`'nonce-${nonce}'`] : ["'unsafe-inline'"]),
    ],
    'img-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
  };
  for (const [directive, sources] of Object.entries(directives)) {
    base[directive] = [...(base[directive] ?? []), ...sources];
  }
  return Object.entries(base)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/** Nonce par requête, au format base64 accepté par `provideCraftCspNonce`. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, '');
}

export function createCsrfMiddleware(
  options: Readonly<{ readonly allowedOrigins?: readonly string[] }> = {},
): ServerMiddleware {
  return async (request, context, next) => {
    if (isSameSiteMutation(request, options.allowedOrigins)) return next();
    context.logger.warn('http.csrf.rejected', { method: request.method });
    return jsonError(403, 'HTTP_CSRF_REJECTED', 'CSRF validation failed.');
  };
}

/**
 * Une mutation est acceptée quand elle ne vient pas d'un autre site. Une
 * origine absente est refusée sur une requête porteuse de cookie : c'est le
 * cas d'un POST de formulaire cross-site, et un client légitime en envoie une.
 */
export function isSameSiteMutation(
  request: Request,
  allowedOrigins: readonly string[] = [],
): boolean {
  const method = request.method.toUpperCase() as HttpMethod;
  if (!MUTATION_METHODS.has(method)) return true;
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('cookie') === null;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  return origin === requestOrigin || allowedOrigins.includes(origin);
}

function createRouteHandler<User, Services>(
  routes: readonly ServerRoute<User, Services>[],
): (
  request: Request,
  context: RequestContext<User, Services>,
) => Promise<Response> {
  return async (request, context) => {
    const match = matchServerRoute(request, routes);
    if (!match) {
      const pathname = normalizePathname(new URL(request.url).pathname);
      const methods = routes
        .filter((route) => matchPath(route.path, pathname))
        .map((route) => route.method);
      if (methods.length > 0) {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: [...new Set(methods)].join(', ') },
        });
      }
      return jsonError(404, 'HTTP_ROUTE_NOT_FOUND', 'Route not found.');
    }
    if (match.route.auth === 'required' && context.user === undefined) {
      return jsonError(
        401,
        'HTTP_AUTH_REQUIRED',
        'Authentication is required.',
      );
    }
    if (match.route.csrf && !isSameSiteMutation(request)) {
      context.logger.warn('http.csrf.rejected', {
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return jsonError(403, 'HTTP_CSRF_REJECTED', 'CSRF validation failed.');
    }
    const routeContext = { ...context, params: match.params };
    const response = await match.route.handler(request, routeContext);
    return match.route.cache
      ? withResponseHeaders(response, { 'cache-control': match.route.cache })
      : response;
  };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpRequestError(
      'HTTP_PATH_INVALID',
      400,
      'The request path is not valid percent-encoded UTF-8.',
    );
  }
}

function matchPath(
  template: string,
  pathname: string,
): Readonly<Record<string, string>> | undefined {
  const templateSegments = normalizePathname(template)
    .split('/')
    .filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let index = 0; index < templateSegments.length; index += 1) {
    const templateSegment = templateSegments[index];
    const pathSegment = pathSegments[index];
    if (templateSegment === '*') {
      params['wildcard'] = pathSegments
        .slice(index)
        .map(decodeSegment)
        .join('/');
      return params;
    }
    if (pathSegment === undefined) return undefined;
    if (templateSegment.startsWith(':')) {
      params[templateSegment.slice(1)] = decodeSegment(pathSegment);
    } else if (templateSegment !== decodeSegment(pathSegment)) {
      return undefined;
    }
  }
  return templateSegments.length === pathSegments.length ? params : undefined;
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return '/';
  return `/${pathname.split('/').filter(Boolean).join('/')}`;
}

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get('x-request-id');
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
  return (
    globalThis.crypto?.randomUUID?.() ?? `request-${Date.now().toString(36)}`
  );
}

type ScopedSignal = { readonly signal: AbortSignal; readonly dispose: () => void };

/**
 * Combine l'annulation du client et le délai maximal de la requête. Le repli
 * manuel est important : sans lui, un runtime sans `AbortSignal.any` perdrait
 * silencieusement tout timeout.
 */
function timeoutSignal(signal: AbortSignal, timeoutMs: number): ScopedSignal {
  if (timeoutMs <= 0) return { signal, dispose: () => undefined };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  const forward = () => controller.abort(signal.reason);
  if (signal.aborted) forward();
  else signal.addEventListener('abort', forward, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', forward);
    },
  };
}

async function withAbort(
  response: Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  if (signal.aborted) {
    throw new HttpRequestError(
      'HTTP_REQUEST_TIMEOUT',
      504,
      'Request timed out.',
    );
  }
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<Response>((_resolve, reject) => {
    onAbort = () =>
      reject(
        new HttpRequestError('HTTP_REQUEST_TIMEOUT', 504, 'Request timed out.'),
      );
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([response, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

function createJsonLogger(
  requestId: string,
  sink: ((entry: Readonly<Record<string, unknown>>) => void) | undefined,
): RequestLogger {
  const write = (
    level: string,
    event: string,
    data: Readonly<Record<string, unknown>> = {},
  ) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId,
      ...data,
    };
    if (sink) sink(entry);
    else console.log(JSON.stringify(entry));
  };
  return {
    debug: (event, data) => write('debug', event, data),
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
  };
}

function withCorsHeaders(
  request: Request,
  response: Promise<Response> | Response,
  allowedOrigins: ReadonlySet<string>,
  directOrigin?: string,
): Promise<Response> {
  const origin = directOrigin ?? request.headers.get('origin');
  return Promise.resolve(response).then((value) =>
    origin && allowedOrigins.has(origin)
      ? withResponseHeaders(value, corsHeaders(origin))
      : value,
  );
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, x-request-id, x-csrf-token',
    vary: 'Origin',
  };
}

function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
    'x-ratelimit-reset': String(Math.ceil(decision.resetAt / 1000)),
  };
}

function withResponseHeaders(
  response: Response,
  headers: Readonly<Record<string, string>>,
): Response {
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpRequestError) {
    return jsonError(error.status, error.code, error.message);
  }
  return jsonError(500, 'HTTP_INTERNAL_ERROR', 'Internal Server Error.');
}

function publicErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
