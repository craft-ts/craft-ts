import { ɵcraftValueService, ɵprovideServiceReading } from './craft-service';
import type { Injector } from './host/craft-compat';

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
type CraftRenderIdentityHelper = () => Generator<
  unknown,
  CraftRenderIdentity,
  unknown
>;
const craftRenderIdentityService = ɵcraftValueService(
  { name: 'CraftRenderIdentity', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: CraftRenderIdentity }) => inputs.$provided,
) as unknown as {
  CraftRenderIdentity: CraftRenderIdentityHelper;
  provideCraftRenderIdentity: (value: CraftRenderIdentity) => unknown;
  CRAFT_RENDER_IDENTITY_META_DATA: { inject(): CraftRenderIdentity };
};

export const CraftRenderIdentity =
  craftRenderIdentityService.CraftRenderIdentity;
export const provideCraftRenderIdentity = (
  value: CraftRenderIdentity,
): unknown => craftRenderIdentityService.provideCraftRenderIdentity(value);
export const ɵinjectCraftRenderIdentity =
  craftRenderIdentityService.CRAFT_RENDER_IDENTITY_META_DATA.inject;

/**
 * @internal {@link provideCraftRenderIdentity} for a host that creates many
 * injectors from the same providers: the identity is read from the injector
 * that resolves it.
 */
export const ɵprovideCraftRenderIdentityReading = (
  read: (injector: Injector) => CraftRenderIdentity,
): unknown =>
  ɵprovideServiceReading(
    craftRenderIdentityService.CRAFT_RENDER_IDENTITY_META_DATA,
    read,
  );

type Segment = string | number;

// A lone surrogate cannot be encoded. Asking the string is enough to reject it
// when the identity is created, without encoding a key nobody may ever read.
const isWellFormed = (
  String.prototype as { isWellFormed?: (this: string) => boolean }
).isWellFormed;

function assertEncodable(segment: Segment): void {
  if (typeof segment !== 'string') return;
  if (isWellFormed === undefined || !isWellFormed.call(segment)) {
    // Throws the URIError an eager encoding would have thrown.
    encodeURIComponent(segment);
  }
}

/**
 * An identity the runtime built. It keeps what distinguishes it from its
 * parent and derives `path` and `hydrationKey` the first time they are read:
 * a client render that is neither hydrating nor being replayed reads neither.
 *
 * Its key is known to encode its path, so a child extends the parent's key
 * instead of encoding every ancestor again. Segments are validated when the
 * identity is created.
 */
class RuntimeRenderIdentity implements CraftRenderIdentity {
  private readonly parent: RuntimeRenderIdentity | undefined;
  private readonly segments: readonly Segment[];
  private resolvedPath: readonly string[] | undefined = undefined;
  private resolvedKey: string | undefined = undefined;

  constructor(
    parent: RuntimeRenderIdentity | undefined,
    segments: readonly Segment[],
  ) {
    this.parent = parent;
    this.segments = segments;
  }

  get path(): readonly string[] {
    return (this.resolvedPath ??= this.parent
      ? [...this.parent.path, ...this.segments.map(String)]
      : this.segments.map(String));
  }

  get hydrationKey(): string {
    if (this.resolvedKey !== undefined) return this.resolvedKey;
    const suffix = this.segments
      .map((segment) => encodeHydrationSegment(String(segment)))
      .join('/');
    const parent = this.parent;
    return (this.resolvedKey =
      parent === undefined || this.segments.length === 0
        ? (parent?.hydrationKey ?? suffix)
        : parent.path.length === 0
          ? suffix
          : `${parent.hydrationKey}/${suffix}`);
  }

  /** Plain data, for a caller that serializes or compares an identity. */
  toJSON(): { path: readonly string[]; hydrationKey: string } {
    return { path: this.path, hydrationKey: this.hydrationKey };
  }
}

const NO_SEGMENTS: readonly Segment[] = [];

export function createCraftRenderIdentity(
  path: readonly (string | number)[],
): CraftRenderIdentity {
  for (const segment of path) assertEncodable(segment);
  return new RuntimeRenderIdentity(undefined, [...path]);
}

export function childCraftRenderIdentity(
  parent: CraftRenderIdentity,
  ...segments: readonly (string | number)[]
): CraftRenderIdentity {
  if (!(parent instanceof RuntimeRenderIdentity)) {
    // A structural identity supplied by a caller: its key says nothing about
    // its path, so the child encodes the full path.
    return createCraftRenderIdentity([...parent.path, ...segments]);
  }
  for (const segment of segments) assertEncodable(segment);
  return new RuntimeRenderIdentity(parent, segments);
}

/**
 * {@link childCraftRenderIdentity} for the renderer's one or two segments,
 * without the argument array of a variadic call.
 */
export function ɵchildCraftRenderIdentity(
  parent: CraftRenderIdentity,
  first?: Segment,
  second?: Segment,
): CraftRenderIdentity {
  if (!(parent instanceof RuntimeRenderIdentity)) {
    return createCraftRenderIdentity([
      ...parent.path,
      ...(first === undefined ? [] : [first]),
      ...(second === undefined ? [] : [second]),
    ]);
  }
  if (first === undefined)
    return new RuntimeRenderIdentity(parent, NO_SEGMENTS);
  assertEncodable(first);
  if (second === undefined) return new RuntimeRenderIdentity(parent, [first]);
  assertEncodable(second);
  return new RuntimeRenderIdentity(parent, [first, second]);
}

function encodeHydrationSegment(segment: string): string {
  return encodeURIComponent(segment).replaceAll('%2F', '%252F');
}
