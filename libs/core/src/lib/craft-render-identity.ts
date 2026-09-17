import { craftService } from './craft-service';

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
const craftRenderIdentityService = craftService(
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

export function createCraftRenderIdentity(
  path: readonly (string | number)[],
): CraftRenderIdentity {
  const normalized = path.map(String);
  return {
    path: normalized,
    hydrationKey: normalized.map(encodeHydrationSegment).join('/'),
  };
}

export function childCraftRenderIdentity(
  parent: CraftRenderIdentity,
  ...segments: readonly (string | number)[]
): CraftRenderIdentity {
  return createCraftRenderIdentity([...parent.path, ...segments]);
}

function encodeHydrationSegment(segment: string): string {
  return encodeURIComponent(segment).replaceAll('%2F', '%252F');
}
