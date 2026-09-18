import { craftService } from '@craft-ts/core';
/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import { craftComponent, div, inherit, p, span } from '@craft-ts/component';

export const { InheritedBadgeView, provideInheritedBadgeView } = craftService(
  { name: 'inheritedBadgeView', providedIn: 'toProvide' },
  () => ({}),
);

const InheritedBadge = craftComponent(
  'InheritedBadge',
  {
    providers: [provideInheritedBadgeView()],
    styles: `
      :scope {
        --inherited-badge-bg: #e0e7ff;
        display: inline-flex;
        width: fit-content;
        padding: .3rem .65rem;
        border-radius: 999px;
        color: var(--inherited-badge-ink);
        background: var(--inherited-badge-bg);
        font-size: .82rem;
        font-weight: 750;
      }
    `,
  },
  function* () {
    yield* InheritedBadgeView();
    return span('Inherited from parent');
  },
);

export const { InheritanceExampleView, provideInheritanceExampleView } =
  craftService(
    { name: 'inheritanceExampleView', providedIn: 'toProvide' },
    () => ({}),
  );

export const InheritanceExample = craftComponent(
  'InheritanceExample',
  {
    providers: [provideInheritanceExampleView()],
    styles: `
      :scope {
        --inherited-badge-ink: #3730a3;
        display: grid;
        gap: 1rem;
        padding: 1.25rem;
        border: 1px dashed #a5b4fc;
        border-radius: 1rem;
        background: #eef2ff;
      }
    `,
  },
  function* () {
    yield* InheritanceExampleView();
    return div([
      p('The parent declares --inherited-badge-ink in its own scope.'),
      InheritedBadge({ cssVars: { '--inherited-badge-ink': inherit } }),
    ]);
  },
);
