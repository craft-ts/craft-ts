import type { SendContextSession } from '@craft-ts/core';
import { getCurrentStartCorrelationId } from '@craft-ts/core';
import {
  redactDebugSessionHeaders,
  redactDebugSessionReferences,
  redactDebugSessionUrl,
  redactDebugSessionUrlEncoded,
  getDebugSessionReferenceSalt,
} from './debug-session-references';

/** Captures XMLHttpRequest traffic in the same archive shape as fetch. */
export function connectDebugSessionXhrCapture(
  session: SendContextSession,
  /** Last keys of declared resume paths, traced even when numeric. */
  tracedKeys: () => ReadonlySet<string> = () => new Set(),
): () => void {
  if (typeof window === 'undefined' || typeof XMLHttpRequest === 'undefined') {
    return () => undefined;
  }

  const prototype = XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const originalSetRequestHeader = prototype.setRequestHeader;
  const sessionSalt = getDebugSessionReferenceSalt(session);
  let sequence = 0;

  const patchedOpen = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrMetadata.set(this, {
      method: method.toUpperCase(),
      url: String(url),
      headers: {},
    });
    originalOpen.call(this, method, url, async, username, password);
  };
  prototype.open = patchedOpen;

  const patchedSetRequestHeader = function patchedSetRequestHeader(
    this: XMLHttpRequest,
    name: string,
    value: string,
  ): void {
    const metadata = xhrMetadata.get(this);
    if (metadata)
      metadata.headers[name] = metadata.headers[name]
        ? `${metadata.headers[name]}, ${value}`
        : value;
    originalSetRequestHeader.call(this, name, value);
  };
  prototype.setRequestHeader = patchedSetRequestHeader;

  const patchedSend = function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const metadata = xhrMetadata.get(this);
    if (
      !metadata ||
      !session.activeClip ||
      isDevelopmentToolRequest(metadata.url)
    ) {
      originalSend.call(this, body);
      return;
    }

    const operationId = `xhr-${++sequence}`;
    const correlationId = getCurrentStartCorrelationId() ?? undefined;
    const requestUrl = redactDebugSessionUrl(
      resolveUrl(metadata.url),
      sessionSalt,
    );
    const requestHeaders = redactDebugSessionHeaders(
      metadata.headers,
      sessionSalt,
      'out',
    );
    const requestBody = redactDebugSessionReferences(
      normalizeRequestBody(body),
      sessionSalt,
      'request.body',
      'out',
      { tracedKeys: tracedKeys() },
    );
    session.capture('http', 'started', {
      name: metadata.method,
      operationId,
      ...(correlationId ? { correlationId } : {}),
      payload: {
        source: 'browser-xhr',
        method: metadata.method,
        url: requestUrl.url,
        headers: requestHeaders.headers,
        body: requestBody.value,
      },
      refs: [...requestUrl.refs, ...requestHeaders.refs, ...requestBody.refs],
    });

    let captured = false;
    this.addEventListener(
      'loadend',
      () => {
        if (captured) return;
        captured = true;
        void captureXhrResponse(
          this,
          session,
          sessionSalt,
          operationId,
          correlationId,
          tracedKeys(),
        );
      },
      { once: true },
    );
    originalSend.call(this, body);
  };
  prototype.send = patchedSend;

  return () => {
    if (prototype.open === patchedOpen) prototype.open = originalOpen;
    if (prototype.send === patchedSend) prototype.send = originalSend;
    if (prototype.setRequestHeader === patchedSetRequestHeader) {
      prototype.setRequestHeader = originalSetRequestHeader;
    }
  };
}

interface XhrMetadata {
  method: string;
  url: string;
  headers: Record<string, string>;
}

const xhrMetadata = new WeakMap<XMLHttpRequest, XhrMetadata>();

async function captureXhrResponse(
  xhr: XMLHttpRequest,
  session: SendContextSession,
  sessionSalt: string,
  operationId: string,
  correlationId: string | undefined,
  tracedKeys: ReadonlySet<string>,
): Promise<void> {
  let body: unknown;
  try {
    if (
      xhr.responseType === 'arraybuffer' &&
      xhr.response instanceof ArrayBuffer
    ) {
      body = {
        encoding: 'base64',
        data: bytesToBase64(new Uint8Array(xhr.response)),
      };
    } else if (xhr.responseType === 'blob' && xhr.response instanceof Blob) {
      body = {
        encoding: 'base64',
        data: bytesToBase64(new Uint8Array(await xhr.response.arrayBuffer())),
      };
    } else if (xhr.responseType === 'json') {
      body = xhr.response;
    } else {
      try {
        body = xhr.responseText;
      } catch {
        body = xhr.response;
      }
    }
  } catch {
    body = '[unreadable]';
  }
  const rawHeaders = parseResponseHeaders(safeGetAllResponseHeaders(xhr));
  const headers = redactDebugSessionHeaders(rawHeaders, sessionSalt, 'in');
  const parsedBody = typeof body === 'string' ? parseJson(body) : undefined;
  const isFormResponse =
    typeof body === 'string' &&
    /application\/x-www-form-urlencoded/i.test(
      rawHeaders['content-type'] ?? '',
    );
  const redactedBody =
    isFormResponse && typeof body === 'string'
      ? redactDebugSessionUrlEncoded(body, sessionSalt, 'response.body', 'in')
      : redactDebugSessionReferences(
          parsedBody ?? body,
          sessionSalt,
          'response.body',
          'in',
          { tracedKeys },
        );
  session.capture('http', xhr.status === 0 ? 'failed' : 'succeeded', {
    name: xhrMetadata.get(xhr)?.method ?? 'XHR',
    operationId,
    ...(correlationId ? { correlationId } : {}),
    response: {
      source: 'browser-xhr-response',
      status: xhr.status,
      statusText: xhr.statusText,
      headers: headers.headers,
      body: isFormResponse
        ? redactedBody.value
        : parsedBody === undefined
          ? redactedBody.value
          : JSON.stringify(redactedBody.value),
    },
    refs: [...headers.refs, ...redactedBody.refs],
  });
}

function normalizeRequestBody(
  body: Document | XMLHttpRequestBodyInit | null | undefined,
): unknown {
  if (body == null) return undefined;
  if (typeof body === 'string') return parseJson(body) ?? body;
  if (body instanceof URLSearchParams)
    return Object.fromEntries(body.entries());
  if (body instanceof ArrayBuffer)
    return { encoding: 'base64', data: bytesToBase64(new Uint8Array(body)) };
  if (ArrayBuffer.isView(body))
    return {
      encoding: 'base64',
      data: bytesToBase64(
        new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      ),
    };
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Object.fromEntries(
      [...body.entries()].map(([key, value]) => [
        key,
        value instanceof File ? value.name : value,
      ]),
    );
  }
  return '[unsupported body]';
}

function resolveUrl(value: string): string {
  try {
    return new URL(value, window.location.href).toString();
  } catch {
    return value;
  }
}

function isDevelopmentToolRequest(value: string): boolean {
  try {
    const pathname = new URL(value, window.location.href).pathname;
    return (
      pathname.startsWith('/@vite/') ||
      pathname.startsWith('/@id/') ||
      pathname.startsWith('/@fs/') ||
      pathname.startsWith('/__demo/')
    );
  } catch {
    return false;
  }
}

function parseResponseHeaders(value: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of value.trim().split(/[\r\n]+/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const content = line.slice(separator + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${content}` : content;
  }
  return headers;
}

function safeGetAllResponseHeaders(xhr: XMLHttpRequest): string {
  try {
    return xhr.getAllResponseHeaders();
  } catch {
    return '';
  }
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
