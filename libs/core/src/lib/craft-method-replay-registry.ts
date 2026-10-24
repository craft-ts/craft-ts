import {
  DestroyRef,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import { ɵHOST_TAG_LIST, ɵcraftValueService } from './craft-service';

export type CraftReplayMethod = (
  receiver: unknown,
  args: readonly unknown[],
) => unknown;

/** @internal Runtime-only lookup for methods that a debug replay may invoke. */
export type CraftMethodReplayRegistry = Readonly<{
  register(address: string, method: CraftReplayMethod): () => void;
  invoke(address: string, receiver: unknown, args: readonly unknown[]): unknown;
  addresses(): readonly string[];
}>;

/** Registers a method exposed by a primitive insertion for replay invocation. */
export function ɵregisterCraftReplayMethod(
  injector: Injector,
  invoke: CraftReplayMethod,
): void {
  try {
    const address = injector.get(ɵHOST_TAG_LIST, []).join(' / ');
    const registry = runInInjectionContext(injector, () =>
      ɵinjectCraftMethodReplayRegistry(),
    );
    const unregister = registry.register(address, invoke);
    injector.get(DestroyRef, null)?.onDestroy(unregister);
  } catch {
    // Replay method registration is optional in ordinary applications.
  }
}

class CraftMethodReplayRegistryState implements CraftMethodReplayRegistry {
  private readonly methods = new Map<string, CraftReplayMethod>();

  register(address: string, method: CraftReplayMethod): () => void {
    this.methods.set(address, method);
    return () => {
      if (this.methods.get(address) === method) this.methods.delete(address);
    };
  }

  invoke(address: string, receiver: unknown, args: readonly unknown[]): unknown {
    const exact = this.methods.get(address);
    if (exact) return exact(receiver, args);

    // Host-tag ordinals identify live component instances, but their values
    // depend on creation order and therefore change between recording and
    // replay. Resolve by the ordinal-free path only when it identifies one
    // current method; never guess between repeated component instances.
    const normalizedAddress = normalizeReplayMethodAddress(address);
    const matches = [...this.methods.entries()].filter(
      ([candidate]) =>
        normalizeReplayMethodAddress(candidate) === normalizedAddress,
    );
    if (matches.length === 1) return matches[0][1](receiver, args);
    if (matches.length > 1) {
      throw new Error(
        `Replay method address is ambiguous after removing host instance ordinals: ${address}`,
      );
    }
    throw new Error(`Replay method is not registered: ${address}`);
  }

  addresses(): readonly string[] {
    return [...this.methods.keys()];
  }
}

function normalizeReplayMethodAddress(address: string): string {
  return address
    .split(' / ')
    .map((tag) => tag.replace(/#\d+$/, ''))
    .join(' / ');
}

const craftMethodReplayRegistryService = ɵcraftValueService(
  { name: 'CraftMethodReplayRegistry', providedIn: 'global' },
  () => new CraftMethodReplayRegistryState(),
) as unknown as {
  CraftMethodReplayRegistry: () => Generator<
    never,
    CraftMethodReplayRegistryState,
    unknown
  >;
  CRAFT_METHOD_REPLAY_REGISTRY_META_DATA: {
    inject(): CraftMethodReplayRegistryState;
  };
};

export const ɵinjectCraftMethodReplayRegistry =
  (): CraftMethodReplayRegistry =>
    craftMethodReplayRegistryService.CRAFT_METHOD_REPLAY_REGISTRY_META_DATA.inject();
