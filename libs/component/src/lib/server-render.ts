import {
  CRAFT_PLATFORM,
  CRAFT_PRIMITIVE_REGISTRY,
  CRAFT_SSR_RUNTIME,
  captureCraftTransferSnapshot,
  createCraftRenderIdentity,
  createServerPlatform,
  serializeCraftTransferSnapshot,
  type CraftInjector,
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
  const dom = createStringDomAdapter();
  const platform = createServerPlatform({
    url: options.url,
    document: dom.document,
    signal: options.signal,
  });
  const coordinator = new CraftSsrCoordinator((source, mode) =>
    platform.serverResources?.decide(source, mode),
  );
  const injector = ɵcreateCraftApplicationInjector(options.config, [
    { provide: CRAFT_PLATFORM, useValue: platform },
    { provide: CRAFT_SSR_RUNTIME, useValue: coordinator },
  ]);
  let mounted: MountedCraftComponent<object> | undefined;
  try {
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

    await coordinator.untilSettled(options.timeoutMs ?? 5_000, options.signal);

    const styles = serverStyles.cssText();
    const snapshot = captureCraftTransferSnapshot(
      injector.get(CRAFT_PRIMITIVE_REGISTRY),
    );
    const rootHtml = dom.serialize(host);
    const styleHtml =
      options.includeStyles === false || !styles
        ? ''
        : `<style data-craft-ssr>${escapeStyleText(styles)}</style>`;
    const snapshotHtml =
      options.includeSnapshotScript === false
        ? ''
        : `<script id="${CRAFT_TRANSFER_SCRIPT_ID}" type="application/json">${serializeCraftTransferSnapshot(snapshot)}</script>`;
    return {
      html: `${styleHtml}${rootHtml}${snapshotHtml}`,
      rootHtml,
      styles,
      snapshot,
    };
  } finally {
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
  });
  return result.html;
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style');
}

/** Kept type-visible for adapters that need to share the request injector. */
export type CraftServerInjector = CraftInjector;
