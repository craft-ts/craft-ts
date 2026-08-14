/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  article,
  craftComponent,
  div,
  h1,
  omit,
  p,
  span,
  type Input,
} from '@craft-ng/component';
import { CssVarsPageNav } from './css-vars-demo.shared';

export const TokenCard = craftComponent(
  'TokenCard',
  {
    styles: `
      :scope {
        --token-card-bg: #ffffff;
        --token-card-border: #dbe3f0;
        display: grid;
        gap: .55rem;
        min-height: 7.5rem;
        padding: 1rem;
        border: 1px solid var(--token-card-border);
        border-radius: var(--token-card-radius, 1rem);
        color: var(--token-card-ink);
        background: var(--token-card-bg);
        box-shadow: 0 .8rem 2rem color-mix(in srgb, var(--token-card-ink) 10%, transparent);
      }
      .token-card__label { font-weight: 750; }
      .token-card__contract { opacity: .72; font-size: .82rem; }
    `,
  },
  (label: Input<string>) => ({ label }),
  ({ label }) =>
    article({ class: 'token-card' }, [
      span({ class: 'token-card__label' }, label),
      span(
        { class: 'token-card__contract' },
        'ink: required · bg/radius: optional',
      ),
    ]),
);

export const CssVarsRequiredDemo = craftComponent(
  'CssVarsRequiredDemo',
  {
    styles: `
      :scope { display: grid; gap: 1.5rem; max-width: 72rem; margin: 0 auto; color: #172033; }
      h1, p { margin: 0; }
      .css-vars-required__intro { display: grid; gap: .5rem; }
      .css-vars-required__intro p { color: #64748b; line-height: 1.55; }
      .css-vars-required__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; }
      code { padding: .15rem .35rem; border-radius: .35rem; background: #e2e8f0; }
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-required__intro' }, [
        h1('Required and optional values'),
        p([
          'Without a fallback, ',
          span('var(--token-card-ink)'),
          ' becomes required. The other tokens remain optional.',
        ]),
      ]),
      div({ class: 'css-vars-required__grid' }, [
        TokenCard({
          cssVars: {
            '--token-card-ink': '#1e3a8a',
            '--token-card-bg': '#eff6ff',
          },
          label: function* () {
            return 'Calm blue';
          },
        }),
        TokenCard({
          cssVars: {
            '--token-card-ink': '#9f1239',
            '--token-card-bg': '#fff1f2',
            '--token-card-radius': '2rem',
          },
          label: function* () {
            return 'Rounded pink';
          },
        }),
        TokenCard({
          cssVars: {
            '--token-card-ink': '#166534',
            '--token-card-bg': omit,
          },
          label: function* () {
            return 'Optional token omitted';
          },
        }),
      ]),
    ]),
);

export default CssVarsRequiredDemo;
