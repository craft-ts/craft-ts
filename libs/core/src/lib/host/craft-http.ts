export type CraftHttpRequest = {
  url: string;
  method: string;
  headers?: Readonly<Record<string, string>>;
  params?: Readonly<Record<string, string | number | boolean | undefined>>;
  body?: unknown;
  /** JSON is the default; raw preserves BodyInit values such as File/Blob. */
  bodyMode?: 'json' | 'raw';
  signal?: AbortSignal;
  timeout?: number;
};

export type CraftHttpResponse<T> = {
  status: number;
  body: T;
};

type CraftHttpResponseMetadata = {
  headers: Headers;
  statusText: string;
  url: string;
};

const CRAFT_HTTP_RESPONSE_METADATA = Symbol('craft-http-response-metadata');

export async function craftFetchTransport<T = unknown>(
  request: CraftHttpRequest,
): Promise<CraftHttpResponse<T>> {
  const controller =
    request.timeout === undefined && request.signal === undefined
      ? undefined
      : new AbortController();
  const abortFromRequest = () => controller?.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', abortFromRequest, { once: true });
  if (request.signal?.aborted) {
    abortFromRequest();
  }

  const timeoutId =
    request.timeout === undefined
      ? undefined
      : setTimeout(() => controller?.abort(), request.timeout);
  const headers = new Headers(request.headers);
  if (
    request.body !== undefined &&
    request.bodyMode !== 'raw' &&
    !headers.has('content-type')
  ) {
    headers.set('content-type', 'application/json');
  }

  try {
    const response = await fetch(
      appendCraftHttpParams(request.url, request.params),
      {
        method: request.method,
        headers,
        body:
          request.body === undefined
            ? undefined
            : request.bodyMode === 'raw'
              ? (request.body as BodyInit)
              : JSON.stringify(request.body),
        signal: controller?.signal,
      },
    );
    const text = await response.text();
    const result: CraftHttpResponse<T> = {
      status: response.status,
      body: parseCraftHttpBody(text) as T,
    };

    Object.defineProperty(result, CRAFT_HTTP_RESPONSE_METADATA, {
      value: {
        headers: response.headers,
        statusText: response.statusText,
        url: response.url || request.url,
      } satisfies CraftHttpResponseMetadata,
    });

    return result;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    request.signal?.removeEventListener('abort', abortFromRequest);
  }
}

function parseCraftHttpBody(text: string): unknown {
  if (text === '') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function ɵgetCraftHttpResponseMetadata(
  response: CraftHttpResponse<unknown>,
): CraftHttpResponseMetadata | undefined {
  return (
    response as CraftHttpResponse<unknown> & {
      [CRAFT_HTTP_RESPONSE_METADATA]?: CraftHttpResponseMetadata;
    }
  )[CRAFT_HTTP_RESPONSE_METADATA];
}

function appendCraftHttpParams(
  url: string,
  params: CraftHttpRequest['params'],
): string {
  if (params === undefined) {
    return url;
  }

  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.append(name, String(value));
    }
  }

  const serialized = query.toString();
  if (!serialized) {
    return url;
  }

  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const baseUrl = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const separator = baseUrl.includes('?') ? '&' : '?';

  return `${baseUrl}${separator}${serialized}${hash}`;
}
