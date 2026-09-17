import { craftService } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { craftComponent } from './component';
import { div, span } from './hyperscript';
import { forward, inherit, omit, required } from './css-vars';
import type { CssVarsContractOfMeta, CssVarsOf } from './css-vars.type';
import { renderCraftComponent } from './testing';

type Parsed = CssVarsOf<`
  :scope { --card-gap: 1rem; color: var(--card-ink); }
  .body { padding: var(--card-padding, 8px); }
`>;
type _Declared = Expect<Equal<Parsed['declared'], '--card-gap'>>;
type _Used = Expect<Equal<Parsed['used'], '--card-ink' | '--card-padding'>>;
type _Fallback = Expect<Equal<Parsed['fallback'], '--card-padding'>>;

type ArrayContract = CssVarsContractOfMeta<{
  readonly styles: readonly [
    ':scope { --card-gap: 1rem }',
    '.x { color: var(--card-ink) }',
  ];
}>;
type _ArrayRequired = Expect<Equal<ArrayContract['required'], '--card-ink'>>;
type _ArrayOptional = Expect<Equal<ArrayContract['optional'], '--card-gap'>>;

type PropertyContract = CssVarsContractOfMeta<{
  readonly styles: `
    @property --meter-value {
      syntax: '<number>';
      inherits: true;
      initial-value: 0;
    }
    .meter { width: calc(var(--meter-value) * 1%); }
  `;
}>;
type _PropertyOptional = Expect<
  Equal<PropertyContract['optional'], '--meter-value'>
>;
type _PropertyRequired = Expect<Equal<PropertyContract['required'], never>>;

type OpaqueContract = CssVarsContractOfMeta<{ readonly stylesUrl: string }>;
type _Opaque = Expect<Equal<OpaqueContract['unknownCss'], true>>;

const { TypedBadgeSpecView, provideTypedBadgeSpecView } = craftService(
  { name: 'typedBadgeSpecView', providedIn: 'toProvide' },
  () => ({}),
);

const TypedBadge = craftComponent(
  'TypedBadgeSpec',
  {
    providers: [provideTypedBadgeSpecView()],
    styles: `.badge { color: var(--typed-badge-ink); background: var(--typed-badge-bg, white); }`,
  },
  function* () {
    yield* TypedBadgeSpecView();
    return span({ class: 'badge' }, 'Badge');
  },
);

const { InheritingCardSpecView, provideInheritingCardSpecView } = craftService(
  { name: 'inheritingCardSpecView', providedIn: 'toProvide' },
  () => ({}),
);

const InheritingCard = craftComponent(
  'InheritingCardSpec',
  {
    providers: [provideInheritingCardSpecView()],
    styles: `:scope { --typed-badge-ink: navy; }`,
  },
  function* () {
    yield* InheritingCardSpecView();
    return div(TypedBadge({ cssVars: { '--typed-badge-ink': inherit } }));
  },
);

// All dispositions are accepted and remain visible in the inferred node type.
TypedBadge({ cssVars: { '--typed-badge-ink': 'navy' } });
TypedBadge({ cssVars: { '--typed-badge-ink': omit } });
TypedBadge({ cssVars: { '--typed-badge-ink': forward('navy') } });
TypedBadge({ cssVars: { '--typed-badge-ink': forward() } });
InheritingCard();

// @ts-expect-error unknown names are rejected at the component boundary.
TypedBadge({ cssVars: { '--typed-badge-unknown': 'red' } });

const { ExplicitExternalSpecView, provideExplicitExternalSpecView } =
  craftService(
    { name: 'explicitExternalSpecView', providedIn: 'toProvide' },
    () => ({}),
  );

const ExplicitExternal = craftComponent(
  'ExplicitExternalSpec',
  {
    providers: [provideExplicitExternalSpecView()],
    stylesUrl: '.external { color: var(--external-ink) }' as string,
    cssVars: { '--external-ink': required<string>(), '--external-gap': '1rem' },
  },
  function* () {
    yield* ExplicitExternalSpecView();
    return div({ class: 'external' }, 'External');
  },
);
ExplicitExternal({ cssVars: { '--external-ink': 'black' } });

describe('component CSS variables', () => {
  it('writes supplied variables on the component root and keeps instances independent', async () => {
    const { CssVarRuntimeRootSpecView, provideCssVarRuntimeRootSpecView } =
      craftService(
        { name: 'cssVarRuntimeRootSpecView', providedIn: 'toProvide' },
        () => ({}),
      );

    const root = craftComponent(
      'CssVarRuntimeRootSpec',
      { providers: [provideCssVarRuntimeRootSpecView()] },
      function* () {
        yield* CssVarRuntimeRootSpecView();
        return div([
          TypedBadge({ cssVars: { '--typed-badge-ink': 'red' } }),
          TypedBadge({ cssVars: { '--typed-badge-ink': 'blue' } }),
          TypedBadge({ cssVars: { '--typed-badge-ink': 'green' } }),
        ]);
      },
    );
    const {
      nativeElement: host,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    const badges = host.querySelectorAll<HTMLElement>('.badge');
    expect(
      Array.from(badges).map((badge) =>
        badge.style.getPropertyValue('--typed-badge-ink'),
      ),
    ).toEqual(['red', 'blue', 'green']);
  });

  it('puts a forward default on the parent so caller values can override it', async () => {
    const { ForwardParentSpecView, provideForwardParentSpecView } =
      craftService(
        { name: 'forwardParentSpecView', providedIn: 'toProvide' },
        () => ({}),
      );

    const parent = craftComponent(
      'ForwardParentSpec',
      { providers: [provideForwardParentSpecView()] },
      function* () {
        yield* ForwardParentSpecView();
        return div(
          TypedBadge({ cssVars: { '--typed-badge-ink': forward('navy') } }),
        );
      },
    );
    const { nativeElement: host, destroy } = await renderCraftComponent(
      parent,
      {
        props: {
          cssVars: { '--typed-badge-ink': 'purple' },
        } as never,
      },
    );
    expect(host.firstElementChild?.getAttribute('style')).toContain(
      '--typed-badge-ink: purple',
    );
    destroy();
  });
});
