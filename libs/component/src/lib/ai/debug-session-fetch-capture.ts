import type { SendContextSession } from '@craft-ts/core';
import {
  getCurrentStartCorrelationId,
  ɵisCraftHttpTransportActive,
} from '@craft-ts/core';
import {
  redactDebugSessionHeaders,
  redactDebugSessionReferences,
  redactDebugSessionUrl,
  redactDebugSessionUrlEncoded,
  getDebugSessionReferenceSalt,
} from './debug-session-references';

/** Captures raw fetch outcomes for deterministic replay in local sessions. */
export function connectDebugSessionFetchCapture(
  session: SendContextSession,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const originalFetch = window.fetch;
  const markerTarget = globalThis as unknown as Record<string, unknown>;
  const previousRecorderMarker =
    markerTarget['__craftDebugSessionFetchCaptureInstalled'];
  markerTarget['__craftDebugSessionFetchCaptureInstalled'] = true;
  const sessionSalt = getDebugSessionReferenceSalt(session);
  let sequence = 0;
  const wrappedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (
      !session.activeClip ||
      ɵisCraftHttpTransportActive() ||
      isDevelopmentToolRequest(request.url)
    )
      return originalFetch.call(window, request);

    const operationId = `fetch-${++sequence}`;
    const correlationId = getCurrentStartCorrelationId() ?? undefined;
    const requestPayload = await request
      .clone()
      .text()
      .catch(() => '[unreadable]');
    const requestUrl = redactDebugSessionUrl(request.url, sessionSalt);
    const requestHeaders = redactDebugSessionHeaders(
      request.headers,
      sessionSalt,
      'out',
    );
    const requestContentType = request.headers.get('content-type') ?? '';
    const parsedRequestBody = parseJson(requestPayload);
    const isFormBody = /application\/x-www-form-urlencoded/i.test(
      requestContentType,
    );
    const redactedRequestBody = isFormBody
      ? redactDebugSessionUrlEncoded(
          requestPayload,
          sessionSalt,
          'request.body',
          'out',
        )
      : redactDebugSessionReferences(
          parsedRequestBody ?? requestPayload,
          sessionSalt,
          'request.body',
          'out',
        );
    const serializedRequestBody = isFormBody
      ? redactedRequestBody.value
      : parsedRequestBody === undefined
        ? redactedRequestBody.value
        : JSON.stringify(redactedRequestBody.value);
    const outboundRefs = [
      ...requestUrl.refs,
      ...requestHeaders.refs,
      ...redactedRequestBody.refs,
    ];
    session.capture('http', 'started', {
      name: request.method,
      operationId,
      ...(correlationId ? { correlationId } : {}),
      payload: {
        source: 'browser-fetch',
        method: request.method,
        url: requestUrl.url,
        headers: requestHeaders.headers,
        body: serializedRequestBody || undefined,
      },
      refs: outboundRefs,
    });

    try {
      const response = await originalFetch.call(window, request);
      const responseClone = response.clone();
      const bytes = new Uint8Array(
        await responseClone.arrayBuffer().catch(() => new ArrayBuffer(0)),
      );
      const contentType = response.headers.get('content-type') ?? '';
      const body = isTextResponse(contentType)
        ? new TextDecoder().decode(bytes)
        : { encoding: 'base64', data: bytesToBase64(bytes) };
      const responseHeaders = redactDebugSessionHeaders(
        response.headers,
        sessionSalt,
        'in',
      );
      const parsedResponseBody =
        typeof body === 'string' ? parseJson(body) : undefined;
      const isFormResponse =
        typeof body === 'string' &&
        /application\/x-www-form-urlencoded/i.test(contentType);
      const redactedResponseBody =
        isFormResponse && typeof body === 'string'
          ? redactDebugSessionUrlEncoded(
              body,
              sessionSalt,
              'response.body',
              'in',
            )
          : redactDebugSessionReferences(
              parsedResponseBody ?? body,
              sessionSalt,
              'response.body',
              'in',
            );
      const serializedResponseBody = isFormResponse
        ? redactedResponseBody.value
        : parsedResponseBody === undefined
          ? redactedResponseBody.value
          : JSON.stringify(redactedResponseBody.value);
      session.capture('http', 'succeeded', {
        name: request.method,
        operationId,
        ...(correlationId ? { correlationId } : {}),
        response: {
          source: 'browser-fetch-response',
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders.headers,
          body: serializedResponseBody,
        },
        refs: [...responseHeaders.refs, ...redactedResponseBody.refs],
      });
      return response;
    } catch (error) {
      session.capture('http', 'failed', {
        name: request.method,
        operationId,
        ...(correlationId ? { correlationId } : {}),
        response: error,
      });
      throw error;
    }
  };
  window.fetch = wrappedFetch;

  return () => {
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    if (markerTarget['__craftDebugSessionFetchCaptureInstalled'] === true) {
      if (previousRecorderMarker === undefined)
        delete markerTarget['__craftDebugSessionFetchCaptureInstalled'];
      else
        markerTarget['__craftDebugSessionFetchCaptureInstalled'] =
          previousRecorderMarker;
    }
  };
}

function isDevelopmentToolRequest(value: string): boolean {
  try {
    const pathname = new URL(value).pathname;
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

function isTextResponse(contentType: string): boolean {
  return /^(text\/|application\/(?:[\w.+-]*\+)?(?:json|xml|javascript|x-www-form-urlencoded)|image\/svg\+xml)/i.test(
    contentType,
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
