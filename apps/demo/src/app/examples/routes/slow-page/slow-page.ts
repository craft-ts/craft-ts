import {
  craftComponent,
  div,
  p,
  heading,
} from '@craft-ts/component';
import { example } from '../../shared/example.style';

const SlowPageComponent = craftComponent(
  'SlowPageComponent',
  {},
  () => ({}),
  () =>
    div({ class: example.alert, 'data-exampleAlert': 'success' }, [
      heading({ class: example.subtitle }, '✅ Slow page loaded'),
      p(
        'Both the slow guard and resolver finished. This component was mounted only after the whole chain settled.',
      ),
      {
        kind: 'element',
        tag: 'dl',
        props: { class: example.definitions },
        children: [
          {
            kind: 'element',
            tag: 'dt',
            props: { class: example.term },
            children: 'Report generated at',
          },
          { kind: 'element', tag: 'dd', props: { class: example.definition }, children: 'resolved' },
          { kind: 'element', tag: 'dt', props: { class: example.term }, children: 'Total users' },
          { kind: 'element', tag: 'dd', props: { class: example.definition }, children: '1234' },
        ],
      },
    ]),
);

export default SlowPageComponent;
