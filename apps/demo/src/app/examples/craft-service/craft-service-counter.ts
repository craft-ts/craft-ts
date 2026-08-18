/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  p,
  heading,
} from '@craft-ts/component';
import { craftService, state } from '@craft-ts/core';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
      reset: () => set(0),
    }));
    return counter;
  },
);

const CraftServiceCounterComponent = craftComponent(
  'CraftServiceCounterComponent',
  {
    providers: [provideCounter()],
    styles: `
      :scope{display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px;font-family:sans-serif}
      .value{font-size:3rem;font-weight:bold;margin:0}
      .actions{display:flex;gap:8px}
      button{padding:8px 20px;font-size:1.2rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff}
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    return { counter: yield* Counter() };
  },
  ({ counter }) =>
    div([
      heading('craftService Counter (toProvide scope)'),
      p({ class: 'value' }, counter),
      div({ class: 'actions' }, [
        button('decrement', { type: 'button', click: counter.decrement }, '-'),
        button('reset', { type: 'button', click: counter.reset }, 'Reset'),
        button('increment', { type: 'button', click: counter.increment }, '+'),
      ]),
    ]),
);

export default CraftServiceCounterComponent;
