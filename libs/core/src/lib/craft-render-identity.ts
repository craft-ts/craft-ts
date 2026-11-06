import { ɵcraftValueService } from './craft-service';

/** A deterministic address for one node in a Craft render tree. */
export type CraftRenderIdentity = Readonly<{
  path: readonly string[];
  hydrationKey: string;
}>;

/**
 * Identity of the component currently being created.
 *
 * This deliberately lives beside, rather than inside, HOST_TAG_LIST: host tags
 * remain runtime/debug identities while hydration identities must be stable
 * across two different processes.
 */
type CraftRenderIdentityHelper = () =>
  Generator<unknown, CraftRenderIdentity, unknown>;
const craftRenderIdentityService = ɵcraftValueService(
  { name: 'CraftRenderIdentity', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: CraftRenderIdentity }) => inputs.$provided,
) as unknown as {
  CraftRenderIdentity: CraftRenderIdentityHelper;
  provideCraftRenderIdentity: (value: CraftRenderIdentity) => unknown;
  CRAFT_RENDER_IDENTITY_META_DATA: { inject(): CraftRenderIdentity };
};

export const CraftRenderIdentity = craftRenderIdentityService.CraftRenderIdentity;
export const provideCraftRenderIdentity =
  (value: CraftRenderIdentity): unknown =>
    craftRenderIdentityService.provideCraftRenderIdentity(value);
export const ɵinjectCraftRenderIdentity =
  craftRenderIdentityService.CRAFT_RENDER_IDENTITY_META_DATA.inject;

// Identities this module built: their hydration key is known to encode their
// path, so a child can extend it instead of encoding every ancestor again.
// A structural identity supplied by a caller takes the full path below.
const runtimeIdentities = new WeakSet<CraftRenderIdentity>();

export function createCraftRenderIdentity(
  path: readonly (string | number)[],
): CraftRenderIdentity {
  const normalized = path.map(String);
  const identity: CraftRenderIdentity = {
    path: normalized,
    hydrationKey: normalized.map(encodeHydrationSegment).join('/'),
  };
  runtimeIdentities.add(identity);
  return identity;
}

export function childCraftRenderIdentity(
  parent: CraftRenderIdentity,
  ...segments: readonly (string | number)[]
): CraftRenderIdentity {
  if (!runtimeIdentities.has(parent)) {
    return createCraftRenderIdentity([...parent.path, ...segments]);
  }
  // Same conversions, same order, and the new segments are encoded now: an
  // invalid one still throws at creation.
  const tail = segments.map(String);
  const suffix = tail.map(encodeHydrationSegment).join('/');
  const identity: CraftRenderIdentity = {
    path: [...parent.path, ...tail],
    hydrationKey:
      tail.length === 0
        ? parent.hydrationKey
        : parent.path.length === 0
          ? suffix
          : `${parent.hydrationKey}/${suffix}`,
  };
  runtimeIdentities.add(identity);
  return identity;
}

function encodeHydrationSegment(segment: string): string {
  return encodeURIComponent(segment).replaceAll('%2F', '%252F');
}
