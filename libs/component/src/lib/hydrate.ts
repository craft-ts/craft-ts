import {
  CRAFT_HYDRATION_RUNTIME,
  CRAFT_PLATFORM,
  CRAFT_PRIMITIVE_REGISTRY,
  createBrowserDomAdapter,
  createBrowserPlatform,
  createCraftRenderIdentity,
  primeCraftTransferSnapshot,
  type CraftTransferSnapshot,
} from '@craft-ts/core';
import {
  type CraftAppRef,
  type BootstrapCraftOptions,
  ɵcreateCraftApplicationInjector,
  ɵrunCraftAppInitializers,
} from './bootstrap';
import { CRAFT_ROOT_COMPONENT } from './craft-host-tokens';
import {
  CRAFT_STYLE_REGISTRY,
  ɵfallbackCraftStyleRegistry,
  type CraftStyleRegistry,
} from './render/style-registry';
import {
  mountInterpretedComponentWithOptions,
  type MountedCraftComponent,
} from './render/interpreter';
import {
  createHydrationCursor,
  type HydrationMismatchError,
} from './render/hydration';
import { CRAFT_TRANSFER_SCRIPT_ID } from './server-render';
import { CRAFT_COMPONENT, type CraftComponent } from './types';

export type HydrateCraftOptions = BootstrapCraftOptions &
  Readonly<{
    snapshot?: CraftTransferSnapshot;
    props?: object;
    onMismatch?: (error: HydrationMismatchError) => void;
    removeTransferScript?: boolean;
  }>;

export type HydratedCraftAppRef = CraftAppRef &
  Readonly<{
    mismatches: readonly HydrationMismatchError[];
  }>;

/** Claims server DOM, restores state, then attaches bindings and listeners. */
export function hydrateCraft(
  options: HydrateCraftOptions,
): HydratedCraftAppRef {
  const host =
    options.host ?? document.querySelector('craft-root') ?? document.body;
  const win = host.ownerDocument.defaultView ?? window;
  const platform = createBrowserPlatform(win, { hydrating: true });
  const hydrationRuntime = createHydrationRuntime();
  const injector = ɵcreateCraftApplicationInjector(
    options.config,
    [
      { provide: CRAFT_PLATFORM, useValue: platform },
      { provide: CRAFT_HYDRATION_RUNTIME, useValue: hydrationRuntime },
    ],
    options.mode,
  );
  const mismatches: HydrationMismatchError[] = [];
  let mounted: MountedCraftComponent<object>;
  try {
    const snapshot =
      options.snapshot ?? readTransferSnapshot(host.ownerDocument);
    if (snapshot) {
      primeCraftTransferSnapshot(
        injector.get(CRAFT_PRIMITIVE_REGISTRY),
        snapshot,
      );
    }
    ɵrunCraftAppInitializers(injector);

    const root = injector.get(CRAFT_ROOT_COMPONENT) as CraftComponent<object>;
    if (!root) {
      throw new Error(
        'hydrateCraft found no root component. Add provideCraftRootComponent(App) to your app config.',
      );
    }
    const identity = createCraftRenderIdentity([root[CRAFT_COMPONENT].name, 0]);
    const cursor = createHydrationCursor(host, (error) => {
      mismatches.push(error);
      options.onMismatch?.(error);
    });
    const rootNode = host.getRootNode();
    const styleRoot =
      (typeof Document !== 'undefined' && rootNode instanceof Document) ||
      (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)
        ? (rootNode as Document | ShadowRoot)
        : host.ownerDocument;
    const styles = injector.get(
      CRAFT_STYLE_REGISTRY,
      ɵfallbackCraftStyleRegistry,
    ) as CraftStyleRegistry;
    mounted = mountInterpretedComponentWithOptions(
      root,
      host,
      injector,
      (options.props ?? {}) as object,
      {
        renderer: createBrowserDomAdapter(host.ownerDocument),
        mode: 'hydrate',
        identity,
        hydration: cursor,
        emitHydrationKeys: true,
        styleRoot,
        styles,
      },
    );
    const finishHydration = () => {
      cursor.finish();
      (platform as { hydrating: boolean }).hydrating = false;
      if (options.removeTransferScript !== false) {
        host.ownerDocument.getElementById(CRAFT_TRANSFER_SCRIPT_ID)?.remove();
      }
      for (const style of host.ownerDocument.querySelectorAll(
        'style[data-craft-ssr]',
      )) {
        style.remove();
      }
    };
    if (hydrationRuntime.hasPending()) {
      void hydrationRuntime.whenSettled().then(() => {
        queueMicrotask(finishHydration);
      });
    } else {
      finishHydration();
    }
  } catch (error) {
    platform.history.dispose();
    (injector as { destroy?(): void }).destroy?.();
    throw error;
  }

  return {
    injector,
    mismatches,
    destroy() {
      mounted.destroy();
      platform.history.dispose();
      (injector as { destroy?(): void }).destroy?.();
    },
  };
}

function createHydrationRuntime() {
  let pending = 0;
  let waiters: (() => void)[] = [];

  const settle = () => {
    pending -= 1;
    if (pending !== 0) return;
    const current = waiters;
    waiters = [];
    current.forEach((resolve) => resolve());
  };

  return {
    track(_source: string, work: PromiseLike<unknown>) {
      pending += 1;
      Promise.resolve(work).then(settle, settle);
    },
    hasPending() {
      return pending > 0;
    },
    whenSettled() {
      if (pending === 0) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}

function readTransferSnapshot(
  documentRef: Document,
): CraftTransferSnapshot | undefined {
  const script = documentRef.getElementById(CRAFT_TRANSFER_SCRIPT_ID);
  if (!script?.textContent) return undefined;
  return JSON.parse(script.textContent) as CraftTransferSnapshot;
}
