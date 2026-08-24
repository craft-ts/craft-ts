import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import type { ChannelsOf, CraftChannelsCarrier } from '@craft-ts/core';
import { YIELDABLE_VALUE } from '@craft-ts/core';
import { div, span } from './hyperscript';
import { each } from './each';
import { ifBlock } from './if-block';
import { craftTemplate, renderTemplate } from './template';
import { craftComponent } from './component';
import type { ComponentTemplateChannels } from './render/vnode';

// `@craft-ts/style` does not exist yet, so the specs stand in for it with the
// only two shapes it will ever hand the tree: a class that demands something of
// an ancestor, and a class that answers such a demand. Both ride on a prop,
// which is exactly where the real ones will ride.
type Demand<Payload> = {
  readonly accumulate: never;
  readonly obligations: Payload;
  readonly discharges: never;
  readonly violates: never;
};

type Answer<Payload> = {
  readonly accumulate: never;
  readonly obligations: never;
  readonly discharges: Payload;
  readonly violates: never;
};

type StyleClass<Channels extends Demand<any> | Answer<any>> = string &
  CraftChannelsCarrier<Channels>;

const needsPort = 'needs-port' as StyleClass<Demand<'scroll-port'>>;
const needsRoom = 'needs-room' as StyleClass<Demand<'no-clipping'>>;
const providesPort = 'provides-port' as StyleClass<Answer<'scroll-port'>>;

describe('channels through the render tree', () => {
  it('bubbles a child demand through h()', () => {
    const tree = div([span({ class: needsPort })]);

    type _ = Expect<
      Equal<ChannelsOf<typeof tree>['obligations'], 'scroll-port'>
    >;
    expect(tree.kind).toBe('element');
  });

  it('bubbles through several levels of nesting and arrays', () => {
    const tree = div([[span({ class: needsPort })], [[span({ class: needsRoom })]]]);

    type _ = Expect<
      Equal<
        ChannelsOf<typeof tree>['obligations'],
        'scroll-port' | 'no-clipping'
      >
    >;
    expect(tree.kind).toBe('element');
  });

  it('lets an ancestor prop answer a demand raised below it', () => {
    const tree = div({ class: providesPort }, [
      span({ class: needsPort }),
      span({ class: needsRoom }),
    ]);

    type _obligations = Expect<
      Equal<ChannelsOf<typeof tree>['obligations'], 'no-clipping'>
    >;
    // The answer keeps travelling — an ancestor may need to know a port exists.
    type _discharges = Expect<
      Equal<ChannelsOf<typeof tree>['discharges'], 'scroll-port'>
    >;
    expect(tree.kind).toBe('element');
  });

  it('bubbles from both branches of an ifBlock', () => {
    const condition = Object.assign(() => true, {
      [YIELDABLE_VALUE]: 'open' as const,
    });
    const block = ifBlock(
      condition as never,
      () => span({ class: needsPort }),
      () => span({ class: needsRoom }),
    );

    type _ = Expect<
      Equal<
        ChannelsOf<typeof block>['obligations'],
        'scroll-port' | 'no-clipping'
      >
    >;
    expect(block.kind).toBe('if');
  });

  it('bubbles from an each item template and its empty branch', () => {
    const block = each(
      [1, 2, 3],
      {
        track: (item: number) => item,
        empty: () => span({ class: needsRoom }),
      },
      () => span({ class: needsPort }),
    );

    type _ = Expect<
      Equal<
        ChannelsOf<typeof block>['obligations'],
        'scroll-port' | 'no-clipping'
      >
    >;
    expect(block.kind).toBe('each');
  });

  it('bubbles through a craftTemplate fragment', () => {
    const template = craftTemplate((label: string) =>
      div([span({ class: needsPort }), label]),
    );
    const node = renderTemplate(template, 'hello');

    type _ = Expect<
      Equal<ChannelsOf<typeof node>['obligations'], 'scroll-port'>
    >;
    expect(node.kind).toBe('template');
  });

  it('crosses the component boundary — the caller inherits the demand', () => {
    const template = () => div([span({ class: needsPort })]);
    const scroller = craftComponent('scroller', {}, () => ({}), template);

    type _fromTemplate = Expect<
      Equal<
        ComponentTemplateChannels<typeof template>['obligations'],
        'scroll-port'
      >
    >;

    const call = scroller({});
    type _fromCall = Expect<
      Equal<ChannelsOf<typeof call>['obligations'], 'scroll-port'>
    >;
    expect(call.kind).toBe('component');
  });

  it('lets the caller answer what a nested component demands', () => {
    const scroller = craftComponent(
      'scrollerNeedingPort',
      {},
      () => ({}),
      () => div([span({ class: needsPort })]),
    );
    const shell = div({ class: providesPort }, [scroller({})]);

    type _ = Expect<Equal<ChannelsOf<typeof shell>['obligations'], never>>;
    expect(shell.kind).toBe('element');
  });

  it('leaves a component with no style on the neutral element', () => {
    const plain = craftComponent(
      'plain',
      {},
      () => ({}),
      () => div([span('text')]),
    );
    const call = plain({});

    type _obligations = Expect<
      Equal<ChannelsOf<typeof call>['obligations'], never>
    >;
    type _accumulate = Expect<
      Equal<ChannelsOf<typeof call>['accumulate'], never>
    >;
    type _discharges = Expect<
      Equal<ChannelsOf<typeof call>['discharges'], never>
    >;
    type _violates = Expect<Equal<ChannelsOf<typeof call>['violates'], never>>;
    expect(call.kind).toBe('component');
  });
});
