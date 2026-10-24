import type { SendContextSession } from '@craft-ts/core';
import {
  getCurrentStartCorrelationId,
  ɵisCraftHttpTransportActive,
} from '@craft-ts/core';

/** Captures raw fetch outcomes for deterministic replay in local sessions. */
export function connectDebugSessionFetchCapture(
  session: SendContextSession,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const originalFetch = window.fetch;
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
    session.capture('http', 'started', {
      name: request.method,
      operationId,
      ...(correlationId ? { correlationId } : {}),
      payload: {
        source: 'browser-fetch',
        method: request.method,
        url: request.url,
        body: requestPayload || undefined,
      },
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
      session.capture('http', 'succeeded', {
        name: request.method,
        operationId,
        ...(correlationId ? { correlationId } : {}),
        response: {
          source: 'browser-fetch-response',
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        },
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
