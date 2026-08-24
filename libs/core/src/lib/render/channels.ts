/**
 * Two opaque contract channels the render tree carries from a node to its
 * ancestors. The core never looks inside them: it only knows how to union them
 * (`accumulate`), how to subtract a discharge from an obligation
 * (`obligations`), and how to intersect an obligation with a violation
 * (`violates`).
 *
 * Everything that gives those payloads a meaning — CSS names, error wording,
 * the fact that an obligation is about `overflow` at all — lives outside the
 * core, in `@craft-ts/style`. Keeping the algebra here and the vocabulary there
 * is what lets a second vocabulary reuse the same plumbing without the core
 * growing a single CSS identifier.
 */
export interface CraftChannels {
  /** Facts that survive every ancestor: they only ever grow upwards. */
  readonly accumulate: unknown;
  /** Demands a node makes on some ancestor, still unmet at this point. */
  readonly obligations: unknown;
  /** Demands this subtree already answered — they cancel matching obligations. */
  readonly discharges: unknown;
  /** Demands this subtree actively breaks, should one cross it. */
  readonly violates: unknown;
}

/**
 * The neutral element. A node that says nothing about style resolves to this,
 * which is what keeps the channel invisible in the printed type of every
 * component written before the style system existed.
 */
export type EmptyChannels = {
  readonly accumulate: never;
  readonly obligations: never;
  readonly discharges: never;
  readonly violates: never;
};

/**
 * Merges two sibling (or parent/child) channel sets.
 *
 * `obligations` is the only asymmetric field: a discharge coming from *either*
 * side cancels an obligation coming from *either* side. That is deliberate —
 * the parent that provides a scroll port and the child that requires one meet
 * exactly once, at the node that contains them both, and the demand must not
 * survive past it.
 */
export type MergeChannels<L extends CraftChannels, R extends CraftChannels> = {
  readonly accumulate: L['accumulate'] | R['accumulate'];
  readonly obligations: Exclude<
    L['obligations'] | R['obligations'],
    L['discharges'] | R['discharges']
  >;
  readonly discharges: L['discharges'] | R['discharges'];
  readonly violates: L['violates'] | R['violates'];
};

/**
 * Merges a *union* of channel sets — the shape siblings arrive in, since the
 * render tree collects children as a union rather than a tuple.
 *
 * Equivalent to folding {@link MergeChannels} over the same sets in any order:
 * `Exclude` distributes, so a discharge in the third child still cancels an
 * obligation raised by the first. Written as a union merge because that is
 * cheaper than a recursive fold and because the node types have no tuple to
 * fold over.
 */
export type MergeChannelUnion<Channels extends CraftChannels> = {
  readonly accumulate: Channels['accumulate'];
  readonly obligations: Exclude<
    Channels['obligations'],
    Channels['discharges']
  >;
  readonly discharges: Channels['discharges'];
  readonly violates: Channels['violates'];
};

/**
 * Non-empty when some node on the path violates an obligation that is still
 * open beneath it — the clip-inside-a-scroll-port case. It is `Extract` and not
 * `Exclude` on purpose: we want the offending demand itself, so the message can
 * name it.
 */
export type PathViolations<C extends CraftChannels> = Extract<
  C['obligations'],
  C['violates']
>;

/** Obligations that reach a sealing boundary without ever being answered. */
export type UndischargedObligations<C extends CraftChannels> =
  C['obligations'];

/** Reads a channel set off a carrier, falling back to the neutral element. */
export type ChannelsOf<Value> = [HasChannels<Value>] extends [never]
  ? EmptyChannels
  : HasChannels<Value>;

/**
 * The channel set a value declares, or `never` if it declares none.
 *
 * The `keyof` guard is what makes this sound. Testing `Value extends
 * CraftChannelsCarrier<infer C>` alone is not enough: the carrier property is
 * optional, so *every* type passes the check, and for one that has no
 * inference site — a bare `string` child, say — TypeScript falls back to the
 * constraint and hands back `CraftChannels` itself. That set has `unknown` for
 * `discharges`, and one `Exclude<…, unknown>` downstream silently erases every
 * obligation in the tree. Asking whether the key is actually there first is
 * the difference between a channel that works and one that reports `never`
 * everywhere while looking correct.
 */
type HasChannels<Value> = Value extends object
  ? typeof CRAFT_CHANNELS extends keyof Value
    ? Value extends CraftChannelsCarrier<infer Channels extends CraftChannels>
      ? Channels
      : never
    : never
  : never;

export declare const CRAFT_CHANNELS: unique symbol;

/**
 * Type-only carrier. Optional, so an untouched node stays structurally
 * assignable to one that carries channels and nothing in the existing tree has
 * to be updated to keep compiling.
 */
export type CraftChannelsCarrier<
  Channels extends CraftChannels = EmptyChannels,
> = {
  readonly [CRAFT_CHANNELS]?: Channels;
};
