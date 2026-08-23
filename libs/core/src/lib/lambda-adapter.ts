import type { HttpServer } from './http-server';

export type LambdaHttpEvent = Readonly<{
  version?: string;
  rawPath?: string;
  rawQueryString?: string;
  path?: string;
  httpMethod?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  cookies?: readonly string[];
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: Readonly<{
    http?: Readonly<{ method?: string; path?: string }>;
  }>;
}>;

export type LambdaHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  /** `Set-Cookie` séparés, comme l'attend AWS Function URL. */
  cookies?: readonly string[];
  body: string;
  isBase64Encoded: false;
}>;

export type CraftLambdaOptions = Readonly<{
  /**
   * Hôtes que cette fonction sert. L'URL de la requête — donc son origine, sur
   * laquelle reposent les contrôles CSRF et CORS — est reconstruite depuis
   * l'en-tête `Host`, que le client contrôle : sans allowlist, il suffit de
   * l'usurper pour se déclarer same-origin.
   */
  readonly trustedHosts?: readonly string[];
}>;

/**
 * Adapts a Craft Web application to the AWS Lambda Function URL event shape.
 * The application remains unaware of AWS and keeps the same Request/Response
 * contract used by Node and Workers.
 */
export function createCraftLambdaFetch(
  application: Pick<HttpServer, 'handle'>,
  options: CraftLambdaOptions = {},
): (event: LambdaHttpEvent) => Promise<LambdaHttpResponse> {
  return async (event) => {
    let request: Request;
    try {
      request = lambdaEventToRequest(event, options);
    } catch (error) {
      if (!(error instanceof UntrustedHostError)) throw error;
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: { code: 'HTTP_HOST_NOT_ALLOWED', message: 'Host is not allowed.' },
        }),
        isBase64Encoded: false,
      };
    }
    const response = await application.handle(request);
    return responseToLambda(response);
  };
}

export class UntrustedHostError extends Error {
  readonly code = 'HTTP_HOST_NOT_ALLOWED';

  constructor(host: string) {
    super(`Host "${host}" is not in the trusted hosts list.`);
    this.name = 'UntrustedHostError';
  }
}

export function lambdaEventToRequest(
  event: LambdaHttpEvent,
  options: CraftLambdaOptions = {},
): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers.set(name, value);
  }
  if (event.cookies?.length && !headers.has('cookie')) {
    headers.set('cookie', event.cookies.join('; '));
  }

  const method = (
    event.requestContext?.http?.method ??
    event.httpMethod ??
    'GET'
  ).toUpperCase();
  const pathname =
    event.rawPath ?? event.requestContext?.http?.path ?? event.path ?? '/';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const body = decodeLambdaBody(event);
  const host = resolveTrustedHost(headers.get('host'), options.trustedHosts);
  return new Request(
    `https://${host}${pathname}${query}`,
    {
      method,
      headers,
      ...(body === undefined ? {} : { body: body as unknown as BodyInit }),
    } as RequestInit,
  );
}

/**
 * Sans allowlist configurée, l'hôte annoncé est ignoré au profit d'un nom
 * neutre : une origine fabriquée par le client ne doit jamais devenir
 * l'origine de référence de l'application.
 */
export function resolveTrustedHost(
  host: string | null,
  trustedHosts: readonly string[] | undefined,
): string {
  if (!trustedHosts || trustedHosts.length === 0) return 'lambda.local';
  if (host && trustedHosts.includes(host)) return host;
  throw new UntrustedHostError(host ?? '');
}

async function responseToLambda(
  response: Response,
): Promise<LambdaHttpResponse> {
  const body = response.body
    ? new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()))
    : '';
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  for (const [name, value] of response.headers) {
    // Fusionner les Set-Cookie dans un seul en-tête casserait les cookies :
    // Function URL les attend dans son champ dédié.
    if (name.toLowerCase() === 'set-cookie') cookies.push(value);
    else headers[name] = value;
  }
  const setCookie = (
    response.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  return {
    statusCode: response.status,
    headers,
    ...(setCookie?.length || cookies.length
      ? { cookies: setCookie?.length ? setCookie : cookies }
      : {}),
    body,
    isBase64Encoded: false,
  };
}

function decodeLambdaBody(event: LambdaHttpEvent): Uint8Array | undefined {
  if (event.body === undefined || event.body === null) return undefined;
  if (!event.isBase64Encoded) return new TextEncoder().encode(event.body);
  const binary = atob(event.body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
