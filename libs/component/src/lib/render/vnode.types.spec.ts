import { describe, expect, it } from 'vitest';
import type { ComponentDepsCarrier } from '@craft-ts/core';
import type { Equal, Expect } from 'test-type';
import type {
  CraftNodeChildrenDependencies,
  CraftNodeDependencies,
} from './vnode';

type TranslationReader = (() => Generator<unknown, string, unknown>) &
  ComponentDepsCarrier<{
    ClientCurrency: { readonly output: { readonly code: string } };
  }>;

type ExtractedDependencies = CraftNodeChildrenDependencies<TranslationReader>;
type _TranslationReaderDependenciesBubbleToTemplate = Expect<
  Equal<keyof ExtractedDependencies, 'ClientCurrency'>
>;

// A reader bound to an attribute is rendered like a text child, so it must
// reach the component contract the same way.
type AttributeDependencies = CraftNodeDependencies<
  { readonly title: TranslationReader },
  readonly []
>;
type _AttributeReaderDependenciesBubbleToTemplate = Expect<
  Equal<keyof AttributeDependencies, 'ClientCurrency'>
>;

type PropsAndChildrenDependencies = CraftNodeDependencies<
  { readonly title: TranslationReader; readonly id: 'order' },
  readonly [TranslationReader]
>;
type _PropsAndChildrenAreMerged = Expect<
  Equal<keyof PropsAndChildrenDependencies, 'ClientCurrency'>
>;

type PlainPropsCarryNothing = CraftNodeDependencies<
  { readonly id: 'order'; readonly hidden: true },
  readonly []
>;
type _PlainPropsCarryNothing = Expect<
  Equal<keyof PlainPropsCarryNothing, never>
>;

describe('template dependency carriers', () => {
  it('keeps the compile-time assertion executable as a Vitest module', () => {
    expect(true).toBe(true);
  });
});
