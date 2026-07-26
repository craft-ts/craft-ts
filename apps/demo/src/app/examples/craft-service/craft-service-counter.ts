import { button, craftComponent, div, h2, p } from '@craft-ng/component';
import {
  componentMonitoring,
  craftService,
  provideHostName,
  state,
} from '@craft-ng/core';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  () =>
    state(0, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
      reset: () => set(0),
    })),
);

const CraftServiceCounterComponent = craftComponent(
  'CraftServiceCounterComponent',
  {
    providers: [
      provideCounter(),
      provideHostName('component:CraftServiceCounterComponent'),
    ],
    styles: `
      :scope{display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px;font-family:sans-serif}
      .value{font-size:3rem;font-weight:bold;margin:0}
      .actions{display:flex;gap:8px}
      button{padding:8px 20px;font-size:1.2rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff}
    `,
  },
  function* () {
    componentMonitoring();
    return { counter: yield* Counter() };
  },
  ({ counter }) =>
    div([
      h2('craftService Counter (toProvide scope)'),
      p({ class: 'value' }, counter()),
      div({ class: 'actions' }, [
        button({ click: counter.decrement }, '-'),
        button({ click: counter.reset }, 'Reset'),
        button({ click: counter.increment }, '+'),
      ]),
    ]),
);

export default CraftServiceCounterComponent;
