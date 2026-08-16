import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import type {
  CraftChannels,
  EmptyChannels,
  MergeChannels,
  MergeChannelUnion,
  PathViolations,
} from './channels';

// The core never names a payload, so the specs invent their own. Any two
// disjoint literal types would do — that they read like style demands is a
// convenience for the reader, not something the code under test knows.
type NeedsPort = 'needs-scroll-port';
type NeedsRoom = 'needs-no-clipping';
type Clips = 'clips-overflow';

type Channels<C extends Partial<CraftChannels>> = {
  readonly accumulate: C extends { readonly accumulate: infer V } ? V : never;
  readonly obligations: C extends { readonly obligations: infer V } ? V : never;
  readonly discharges: C extends { readonly discharges: infer V } ? V : never;
  readonly violates: C extends { readonly violates: infer V } ? V : never;
};

describe('channel algebra', () => {
  it('merges the neutral element into itself', () => {
    type _ = Expect<Equal<MergeChannels<EmptyChannels, EmptyChannels>, EmptyChannels>>;
    expect(true).toBe(true);
  });

  it('keeps an obligation the other side does not answer', () => {
    type Child = Channels<{ obligations: NeedsPort }>;
    type Parent = Channels<{ accumulate: 'layout' }>;
    type Merged = MergeChannels<Parent, Child>;

    type _obligations = Expect<Equal<Merged['obligations'], NeedsPort>>;
    type _accumulate = Expect<Equal<Merged['accumulate'], 'layout'>>;
    expect(true).toBe(true);
  });

  it('cancels an obligation against a discharge from either side', () => {
    type Child = Channels<{ obligations: NeedsPort | NeedsRoom }>;
    type Parent = Channels<{ discharges: NeedsPort }>;

    type FromParent = MergeChannels<Parent, Child>;
    type FromChild = MergeChannels<Child, Parent>;

    type _left = Expect<Equal<FromParent['obligations'], NeedsRoom>>;
    type _right = Expect<Equal<FromChild['obligations'], NeedsRoom>>;
    // The discharge itself keeps travelling: an ancestor may need to know the
    // port already exists to reject a second one.
    type _kept = Expect<Equal<FromParent['discharges'], NeedsPort>>;
    expect(true).toBe(true);
  });

  it('accumulates without ever subtracting', () => {
    type Left = Channels<{ accumulate: 'a'; discharges: 'a' }>;
    type Right = Channels<{ accumulate: 'b' }>;

    type _ = Expect<Equal<MergeChannels<Left, Right>['accumulate'], 'a' | 'b'>>;
    expect(true).toBe(true);
  });

  it('reports no path violation when nothing conflicts', () => {
    type Sound = Channels<{ obligations: NeedsRoom; violates: Clips }>;

    type _ = Expect<Equal<PathViolations<Sound>, never>>;
    expect(true).toBe(true);
  });

  it('reports exactly the obligation a node breaks', () => {
    type Broken = Channels<{
      obligations: NeedsRoom | NeedsPort;
      violates: NeedsRoom | Clips;
    }>;

    type _ = Expect<Equal<PathViolations<Broken>, NeedsRoom>>;
    expect(true).toBe(true);
  });

  it('merges a sibling union so a later sibling discharges an earlier demand', () => {
    type Siblings =
      | Channels<{ obligations: NeedsPort }>
      | Channels<{ accumulate: 'text' }>
      | Channels<{ discharges: NeedsPort }>;
    type Merged = MergeChannelUnion<Siblings>;

    type _obligations = Expect<Equal<Merged['obligations'], never>>;
    type _accumulate = Expect<Equal<Merged['accumulate'], 'text'>>;
    expect(true).toBe(true);
  });

  it('merges an empty sibling union to the neutral element', () => {
    type _ = Expect<Equal<MergeChannelUnion<never>, EmptyChannels>>;
    expect(true).toBe(true);
  });

  it('agrees with the pairwise merge on the same operands', () => {
    type Left = Channels<{ obligations: NeedsPort; accumulate: 'a' }>;
    type Right = Channels<{ discharges: NeedsPort; violates: Clips }>;

    type _ = Expect<
      Equal<MergeChannels<Left, Right>, MergeChannelUnion<Left | Right>>
    >;
    expect(true).toBe(true);
  });
});
