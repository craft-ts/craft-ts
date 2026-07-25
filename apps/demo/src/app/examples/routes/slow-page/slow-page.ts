import { component, div, h2, p } from '@craft-ng/component';
import { provideHostName } from '@craft-ng/core';

const SlowPageComponent = component(
  {
    providers: [provideHostName('component:SlowPageComponent')],
    styles: `
      .slow-page { padding:2rem; border:1px solid #bbf7d0; border-radius:8px; background:#f0fdf4; color:#166534; }
      .slow-page dl { display:grid; grid-template-columns:auto 1fr; gap:.25rem 1rem; margin-top:1rem; }
      .slow-page dt { font-weight:600; }
    `,
  },
  () => ({}),
  () =>
    div({ class: 'slow-page' }, [
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
