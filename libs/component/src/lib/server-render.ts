import {
  CRAFT_PLATFORM,
  CRAFT_PRIMITIVE_REGISTRY,
  CRAFT_SECURITY_POLICY,
  CRAFT_SSR_RUNTIME,
  CraftCspNonce,
  captureCraftTransferSnapshot,
  createCraftSecurityPolicy,
  createCraftRenderIdentity,
  createServerPlatform,
  assertCraftCspNonce,
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
import { CRAFT_ROOT_COMPONENT } from './craft-host-tokens';
import { provideCraftRootComponent } from './bridge';
import {
  mountInterpretedComponentWithOptions,
  type MountedCraftComponent,
} from './render/interpreter';
import { createServerStyleCollector } from './render/server-style-collector';
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
  includeStyles?: boolean;
  includeSnapshotScript?: boolean;
  mode?: CraftRuntimeMode;
  securityPolicy?: CraftSecurityPolicyInput;
  /**
   * Nonce CSP de la requête. Il est reporté sur les styles rendus, ce qui
   * permet une politique sans `'unsafe-inline'`.
   */
  cspNonce?: string;
}>;

export type RenderCraftResult = Readonly<{
  html: string;
  rootHtml: string;
  styles: string;
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
  const hasConfiguredPolicy = options.config.providers.some(
    (provider) =>
      typeof provider === 'object' &&
      provider !== null &&
      ('provide' in provider
        ? provider.provide === CRAFT_SECURITY_POLICY
        : 'token' in provider && provider.token === CRAFT_SECURITY_POLICY),
  );
  const controller = new AbortController();
  const removeExternalAbort = forwardAbort(options.signal, controller);
  const timeoutMs = options.timeoutMs ?? defaultPolicy.ssr.timeoutMs;
  const timeout = setTimeout(
    () =>
      controller.abort(
        new Error(`Craft SSR timed out after ${timeoutMs}ms.`),
      ),
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
      { provide: CRAFT_PLATFORM, useValue: platform },
      { provide: CRAFT_SSR_RUNTIME, useValue: coordinator },
      ...(requestedPolicy || !hasConfiguredPolicy
        ? [
            {
              provide: CRAFT_SECURITY_POLICY,
              useValue: requestedPolicy ?? defaultPolicy,
            },
          ]
        : []),
      ...(options.cspNonce
        ? [
            {
              provide: CraftCspNonce,
              useValue: assertCraftCspNonce(options.cspNonce),
            },
          ]
        : []),
    ],
    options.mode,
  );
  let mounted: MountedCraftComponent<object> | undefined;
  try {
    const securityPolicy = injector.get(
      CRAFT_SECURITY_POLICY,
      defaultPolicy,
    ) as CraftSecurityPolicy;
    await Promise.all(ɵrunCraftAppInitializers(injector));
    const root = injector.get(CRAFT_ROOT_COMPONENT) as CraftComponent<object>;
    if (!root) {
      throw new Error(
        'renderCraft found no root component. Add provideCraftRootComponent(App) to your app config.',
      );
    }

    const identity = createCraftRenderIdentity([root[CRAFT_COMPONENT].name, 0]);
    const host = dom.createHost();
    dom.adapter.setAttribute(host, 'data-craft-hk', identity.hydrationKey);
    const serverStyles = createServerStyleCollector();
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
        serverStyles,
      },
    );

    await coordinator.untilSettled(timeoutMs, controller.signal);

    const styles = serverStyles.cssText();
    const snapshot = captureCraftTransferSnapshot(
      injector.get(CRAFT_PRIMITIVE_REGISTRY),
      { policy: securityPolicy.transfer },
    );
    const rootHtml = dom.serialize(host);
    const htmlSize = byteLength(rootHtml) + byteLength(styles);
    if (htmlSize > securityPolicy.ssr.maxHtmlBytes) {
      throw new Error(
        `CRAFT_SSR_HTML_TOO_LARGE: generated HTML exceeds ${securityPolicy.ssr.maxHtmlBytes} bytes.`,
      );
    }
    const nonce = injector.get(CraftCspNonce, null);
    const styleHtml =
      options.includeStyles === false || !styles
        ? ''
        : `<style data-craft-ssr${nonce ? ` nonce="${escapeAttribute(nonce)}"` : ''}>${escapeStyleText(styles)}</style>`;
    const snapshotHtml =
      options.includeSnapshotScript === false
        ? ''
        : `<script id="${CRAFT_TRANSFER_SCRIPT_ID}" type="application/json">${serializeCraftTransferSnapshot(snapshot, securityPolicy.transfer)}</script>`;
    return {
      html: `${styleHtml}${rootHtml}${snapshotHtml}`,
      rootHtml,
      styles,
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
    ...(options.securityPolicy ? { securityPolicy: options.securityPolicy } : {}),
    ...(options.cspNonce ? { cspNonce: options.cspNonce } : {}),
  });
  return result.html;
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
