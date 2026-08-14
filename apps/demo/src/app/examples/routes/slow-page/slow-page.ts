/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import { craftComponent, div, h2, p } from '@craft-ng/component';

const SlowPageComponent = craftComponent(
  'SlowPageComponent',
  {
    styles: `
      :scope { padding:2rem; border:1px solid #bbf7d0; border-radius:8px; background:#f0fdf4; color:#166534; }
      dl { display:grid; grid-template-columns:auto 1fr; gap:.25rem 1rem; margin-top:1rem; }
      dt { font-weight:600; }
    `,
  },
  () => ({}),
  () =>
    div([
      h2('✅ Slow page loaded'),
      p(
        'Both the slow guard and resolver finished. This component was mounted only after the whole chain settled.',
      ),
      {
        kind: 'element',
        tag: 'dl',
        props: {},
        children: [
          {
            kind: 'element',
            tag: 'dt',
            props: {},
            children: 'Report generated at',
          },
          { kind: 'element', tag: 'dd', props: {}, children: 'resolved' },
          { kind: 'element', tag: 'dt', props: {}, children: 'Total users' },
          { kind: 'element', tag: 'dd', props: {}, children: '1234' },
        ],
      },
    ]),
);

export default SlowPageComponent;
