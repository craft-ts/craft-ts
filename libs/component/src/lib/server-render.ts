import {
  ɵinjectCraftPrimitiveRegistry,
  provideCraftPlatform,
  provideCraftSecurityPolicy,
  provideCraftCspNonce,
  provideCraftSsrRuntime,
  ɵinjectCraftSecurityPolicy,
  captureCraftTransferSnapshot,
  createCraftSecurityPolicy,
  createCraftRenderIdentity,
  createServerPlatform,
  serializeCraftTransferSnapshot,
  type CraftInjector,
  type CraftSecurityPolicy,
  type CraftSecurityPolicyInput,
  type CraftRuntimeMode,
  type CraftTransferSnapshot,
} from '@craft-ts/core';
import {
  ɵcreateCraftApplicationInjector,
  ɵrunCraftAppInitializers,
} from './bootstrap';
import { ɵrunInInjectionContext } from '@craft-ts/core';
import {
  ɵinjectCraftRootComponent,
  provideCraftRootComponent,
} from './craft-host-tokens';
import {
  mountInterpretedComponentWithOptions,
  type MountedCraftComponent,
} from './render/interpreter';
import { CraftSsrCoordinator } from './render/ssr-coordinator';
import { createStringDomAdapter } from './render/string-dom';
import { CRAFT_COMPONENT, type CraftComponent, type PropsOf } from './types';

export const CRAFT_TRANSFER_SCRIPT_ID = '__CRAFT_TRANSFER__';

export type RenderCraftOptions = Readonly<{
  config: { readonly providers: readonly unknown[] };
  url?: string;
  props?: object;
  timeoutMs?: number;
  signal?: AbortSignal;
  includeSnapshotScript?: boolean;
  mode?: CraftRuntimeMode;
  securityPolicy?: CraftSecurityPolicyInput;
  /** Nonce CSP de la requête, lisible par l'application via `CraftCspNonce`. */
  cspNonce?: string;
}>;

export type RenderCraftResult = Readonly<{
  html: string;
  rootHtml: string;
  snapshot: CraftTransferSnapshot;
}>;

/** Renders one fully isolated Craft application request to deterministic HTML. */
export async function renderCraft(
  options: RenderCraftOptions,
): Promise<RenderCraftResult> {
  const requestedPolicy = options.securityPolicy
    ? createCraftSecurityPolicy(options.securityPolicy)
    : undefined;
  const defaultPolicy = requestedPolicy ?? createCraftSecurityPolicy();
  const controller = new AbortController();
  const removeExternalAbort = forwardAbort(options.signal, controller);
  const timeoutMs = options.timeoutMs ?? defaultPolicy.ssr.timeoutMs;
  const timeout = setTimeout(
    () =>
      controller.abort(new Error(`Craft SSR timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );
  const dom = createStringDomAdapter();
  const platform = createServerPlatform({
    url: options.url,
    document: dom.document,
    signal: controller.signal,
  });
  const coordinator = new CraftSsrCoordinator(
    (source, mode) => platform.serverResources?.decide(source, mode),
    defaultPolicy.ssr.sourceTimeoutMs,
  );
  const injector = ɵcreateCraftApplicationInjector(
    options.config,
    [
      provideCraftPlatform(platform),
      provideCraftSsrRuntime(coordinator),
      ...(requestedPolicy ? [provideCraftSecurityPolicy(requestedPolicy)] : []),
      ...(options.cspNonce ? [provideCraftCspNonce(options.cspNonce)] : []),
    ],
    options.mode,
  );
  let mounted: MountedCraftComponent<object> | undefined;
  try {
    const securityPolicy = ɵrunInInjectionContext(
      injector,
      () => ɵinjectCraftSecurityPolicy(),
    );
    await Promise.all(ɵrunCraftAppInitializers(injector));
    const root = ɵrunInInjectionContext(
      injector,
      () => ɵinjectCraftRootComponent() as CraftComponent<object>,
    );
    if (!root) {
      throw new Error(
        'renderCraft found no root component. Add provideCraftRootComponent(App) to your app config.',
      );
    }

    const identity = createCraftRenderIdentity([root[CRAFT_COMPONENT].name, 0]);
    const host = dom.createHost();
    dom.adapter.setAttribute(host, 'data-craft-hk', identity.hydrationKey);
    mounted = mountInterpretedComponentWithOptions(
      root,
      host,
      injector,
      (options.props ?? {}) as object,
      {
        renderer: dom.adapter,
        identity,
        emitHydrationKeys: true,
        ssr: coordinator,
      },
    );

    await coordinator.untilSettled(timeoutMs, controller.signal);

    const registry = ɵrunInInjectionContext(injector, () => ɵinjectCraftPrimitiveRegistry());
    const snapshot = captureCraftTransferSnapshot(
      registry,
      { policy: securityPolicy.transfer },
    );
    const rootHtml = dom.serialize(host);
    const htmlSize = byteLength(rootHtml);
    if (htmlSize > securityPolicy.ssr.maxHtmlBytes) {
      throw new Error(
        `CRAFT_SSR_HTML_TOO_LARGE: generated HTML exceeds ${securityPolicy.ssr.maxHtmlBytes} bytes.`,
      );
    }
    const snapshotHtml =
      options.includeSnapshotScript === false
        ? ''
        : `<script id="${CRAFT_TRANSFER_SCRIPT_ID}" type="application/json">${serializeCraftTransferSnapshot(snapshot, securityPolicy.transfer)}</script>`;
    return {
      html: `${rootHtml}${snapshotHtml}`,
      rootHtml,
      snapshot,
    };
  } finally {
    clearTimeout(timeout);
    removeExternalAbort();
    coordinator.dispose();
    mounted?.destroy();
    platform.history.dispose();
    (injector as { destroy?(): void }).destroy?.();
  }
}

export type RenderToStringOptions<Component extends CraftComponent<any>> =
  Readonly<{
    props?: PropsOf<Component>;
    providers?: readonly unknown[];
    url?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    mode?: CraftRuntimeMode;
    securityPolicy?: CraftSecurityPolicyInput;
    cspNonce?: string;
  }>;

/** Low-level component convenience API built on the same per-request runtime. */
export async function renderToString<Component extends CraftComponent<any>>(
  component: Component,
  options: RenderToStringOptions<Component> = {},
): Promise<string> {
  const result = await renderCraft({
    config: {
      providers: [
        provideCraftRootComponent(component),
        ...(options.providers ?? []),
      ],
    },
    props: options.props as object | undefined,
    url: options.url,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    mode: options.mode,
    ...(options.securityPolicy
      ? { securityPolicy: options.securityPolicy }
      : {}),
    ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
  });
  return result.html;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function forwardAbort(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (!source) return () => undefined;
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

/** Kept type-visible for adapters that need to share the request injector. */
export type CraftServerInjector = CraftInjector;
