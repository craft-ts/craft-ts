/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import { craftComponent, div, inherit, p, span } from '@craft-ts/component';

const InheritedBadge = craftComponent(
  'InheritedBadge',
  {
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
  () => ({}),
  () => span('Inherited from parent'),
);

export const InheritanceExample = craftComponent(
  'InheritanceExample',
  {
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
  () => ({}),
  () =>
    div([
      p('The parent declares --inherited-badge-ink in its own scope.'),
      InheritedBadge({ cssVars: { '--inherited-badge-ink': inherit } }),
    ]),
);
