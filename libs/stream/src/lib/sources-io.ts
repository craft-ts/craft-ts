import { subject, type Subject, type Unsubscribable } from '@craft-ts/core';
import { createCraftStream, type CraftStream } from './craft-stream';

// ---------------------------------------------------------------------------
// Network sources: HTTP (`ajax`) and WebSocket (`webSocket`).
//
// Application HTTP belongs to `query` / `mutation` / server functions — they
// carry loading state, caching and typed exceptions. These are the
// stream-shaped primitives for the cases that really are a stream (a socket, a
// one-off request inside a pipe), and the landing place of RxJS's `ajax` /
// `webSocket`. A transport failure is a **defect** (the `error` channel); an
// HTTP error status of `ajax` is a defect too, as in RxJS, carried by
// `AjaxError`.
// ---------------------------------------------------------------------------

export type AjaxConfig = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** A plain object/array is sent as JSON; a string, FormData, Blob… as is. */
  body?: unknown;
  /** How the response is read (default `'json'`). */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  /** Abort and fail after this many milliseconds (temporal runtime). */
  timeout?: number;
  withCredentials?: boolean;
};

export type AjaxResponse<T> = {
  readonly status: number;
  readonly response: T;
  readonly responseType: NonNullable<AjaxConfig['responseType']>;
  readonly responseHeaders: Record<string, string>;
  readonly request: AjaxConfig;
};

/** The defect an `ajax` request ends with on an HTTP error status or a timeout. */
export class AjaxError extends Error {
  readonly status: number;
  readonly response: unknown;
  readonly request: AjaxConfig;

  constructor(
    message: string,
    status: number,
    response: unknown,
    request: AjaxConfig,
  ) {
    super(message);
    this.name = 'AjaxError';
    this.status = status;
    this.response = response;
    this.request = request;
  }
}

function isPlainBody(body: unknown): boolean {
  if (body === null || typeof body !== 'object') return false;
  if (Array.isArray(body)) return true;
  const prototype = Object.getPrototypeOf(body);
  return prototype === Object.prototype || prototype === null;
}

async function readBody(
  response: Response,
  responseType: NonNullable<AjaxConfig['responseType']>,
): Promise<unknown> {
  if (responseType === 'text') return response.text();
  if (responseType === 'blob') return response.blob();
  if (responseType === 'arraybuffer') return response.arrayBuffer();
  const text = await response.text();
  return text === '' ? null : JSON.parse(text);
}

function request<T>(config: AjaxConfig): CraftStream<AjaxResponse<T>, never> {
  return createCraftStream<AjaxResponse<T>, never>(
    (context, sink, teardown) => {
      const controller = new AbortController();
      const responseType = config.responseType ?? 'json';
      const headers: Record<string, string> = { ...config.headers };
      let body: BodyInit | undefined;
      if (config.body !== undefined) {
        if (isPlainBody(config.body)) {
          body = JSON.stringify(config.body);
          const hasContentType = Object.keys(headers).some(
            (name) => name.toLowerCase() === 'content-type',
          );
          if (!hasContentType) headers['Content-Type'] = 'application/json';
        } else {
          body = config.body as BodyInit;
        }
      }

      let timedOut = false;
      if (config.timeout !== undefined) {
        const timer = context.temporal.schedule(
          () => {
            timedOut = true;
            controller.abort();
          },
          config.timeout,
          { kind: 'ajax-timeout', destroyRef: context.destroyRef },
        );
        teardown.add(() => timer.cancel());
      }

      fetch(config.url, {
        method: config.method ?? 'GET',
        headers,
        body,
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await readBody(response, responseType);
          if (sink.closed) return;
          if (!response.ok) {
            sink.error(
              new AjaxError(
                `ajax error ${response.status}`,
                response.status,
                payload,
                config,
              ),
            );
            return;
          }
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, name) => {
            responseHeaders[name] = value;
          });
          sink.next({
            status: response.status,
            response: payload as T,
            responseType,
            responseHeaders,
            request: config,
          });
          sink.complete();
        })
        .catch((error) => {
          if (sink.closed) return;
          if (timedOut) {
            sink.error(new AjaxError('ajax timeout', 0, null, config));
          } else if (!controller.signal.aborted) {
            sink.error(error);
          }
        });

      return { unsubscribe: () => controller.abort() };
    },
  );
}

type AjaxMethod = {
  <T = unknown>(
    input: string | AjaxConfig,
  ): CraftStream<AjaxResponse<T>, never>;
  get<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): CraftStream<AjaxResponse<T>, never>;
  post<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): CraftStream<AjaxResponse<T>, never>;
  put<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): CraftStream<AjaxResponse<T>, never>;
  patch<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): CraftStream<AjaxResponse<T>, never>;
  delete<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): CraftStream<AjaxResponse<T>, never>;
  /** GET, emitting the parsed JSON body itself rather than the response envelope. */
  getJSON<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): CraftStream<T, never>;
};

/**
 * RxJS-style HTTP: `ajax(url | config)` emits an {@link AjaxResponse} once and
 * completes; `ajax.getJSON(url)` emits the JSON body. Unsubscribing aborts the
 * request. See the file header for when to prefer `query` / `mutation`.
 */
export const ajax: AjaxMethod = Object.assign(
  <T = unknown>(input: string | AjaxConfig) =>
    request<T>(typeof input === 'string' ? { url: input } : input),
  {
    get: <T = unknown>(url: string, headers?: Record<string, string>) =>
      request<T>({ url, method: 'GET', headers }),
    post: <T = unknown>(
      url: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => request<T>({ url, method: 'POST', body, headers }),
    put: <T = unknown>(
      url: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => request<T>({ url, method: 'PUT', body, headers }),
    patch: <T = unknown>(
      url: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => request<T>({ url, method: 'PATCH', body, headers }),
    delete: <T = unknown>(url: string, headers?: Record<string, string>) =>
      request<T>({ url, method: 'DELETE', headers }),
    getJSON: <T = unknown>(url: string, headers?: Record<string, string>) =>
      createCraftStream<T, never>((context, sink) =>
        (
          request<T>({ url, method: 'GET', headers }) as CraftStream<
            AjaxResponse<T>,
            never
          >
        ).subscribe({
          next: (response) => sink.next(response.response),
          error: (error) => sink.error(error),
          complete: () => sink.complete(),
        }),
      ),
  },
) as AjaxMethod;

export type WebSocketConfig<T> = {
  url: string;
  protocol?: string | string[];
  /** Encodes a value for `send` (default: `JSON.stringify`). */
  serializer?: (value: T) => Parameters<WebSocket['send']>[0];
  /** Decodes an incoming message (default: `JSON.parse` of its data). */
  deserializer?: (event: MessageEvent) => T;
  openObserver?: { next(event: Event): void };
  closeObserver?: { next(event: CloseEvent): void };
  /** The WebSocket implementation (default: the global one). */
  WebSocketCtor?: typeof WebSocket;
};

/**
 * A socket seen as a stream of incoming messages that can also send. The
 * connection opens when the first subscriber arrives and closes when the last
 * one leaves (or on `complete()`); a clean close completes the stream, an
 * unclean one is a defect. `next(value)` sends, queueing until the socket is
 * open.
 */
export type WebSocketStream<T> = CraftStream<T, never> & {
  next(value: T): void;
  complete(): void;
};

export function webSocket<T = unknown>(
  urlOrConfig: string | WebSocketConfig<T>,
): WebSocketStream<T> {
  const config: WebSocketConfig<T> =
    typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;
  const serialize = config.serializer ?? ((value: T) => JSON.stringify(value));
  const deserialize =
    config.deserializer ??
    ((event: MessageEvent) => JSON.parse(String(event.data)) as T);

  let hub: Subject<T, never> = subject<T, never>();
  let socket: WebSocket | undefined;
  let subscribers = 0;
  const queued: unknown[] = [];

  const close = (code?: number) => {
    const current = socket;
    socket = undefined;
    if (current && current.readyState <= 1) current.close(code);
  };

  const connect = () => {
    const Ctor = config.WebSocketCtor ?? WebSocket;
    const current = new Ctor(config.url, config.protocol);
    socket = current;
    const finish = (terminate: (target: Subject<T, never>) => void) => {
      const target = hub;
      if (socket === current) socket = undefined;
      hub = subject<T, never>();
      terminate(target);
    };
    current.onopen = (event) => {
      config.openObserver?.next(event);
      for (const value of queued.splice(0)) {
        current.send(serialize(value as T));
      }
    };
    current.onmessage = (event) => {
      try {
        hub.next(deserialize(event));
      } catch (error) {
        finish((target) => target.error(error));
        current.close();
      }
    };
    current.onerror = (event) => finish((target) => target.error(event));
    current.onclose = (event) => {
      config.closeObserver?.next(event);
      if (socket !== current && hub.closed) return;
      finish((target) =>
        event.wasClean ? target.complete() : target.error(event),
      );
    };
  };

  const stream = createCraftStream<T, never>((_context, sink, teardown) => {
    const current = hub;
    const subscription: Unsubscribable = current.subscribe({
      next: (value) => sink.next(value),
      error: (error) => sink.error(error),
      complete: () => sink.complete(),
    });
    teardown.add(subscription);
    subscribers += 1;
    teardown.add(() => {
      subscribers -= 1;
      if (subscribers === 0) close();
    });
    if (!socket) connect();
  });

  return Object.assign(stream, {
    next(value: T): void {
      if (socket && socket.readyState === 1) socket.send(serialize(value));
      else queued.push(value);
    },
    complete(): void {
      const target = hub;
      close(1000);
      hub = subject<T, never>();
      target.complete();
    },
  });
}
