import { craftToken } from './host/craft-injector';

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
export const CRAFT_HYDRATION_ID =
  craftToken<CraftRenderIdentity>('CraftHydrationId');

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
