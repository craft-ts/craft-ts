import {
  button,
  component,
  div,
  h2,
  p,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftService,
  provideHostName,
  state,
  type GetDeps,
} from '@craft-ng/core';

const { injectCounter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  () =>
    state(0, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
      reset: () => set(0),
    })),
);

const CraftServiceCounterComponent = component(
  {
    providers: [
      provideCounter(),
      provideHostName('component:CraftServiceCounterComponent'),
    ],
    styles: `
      .counter-demo{display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px;font-family:sans-serif}
      .counter-demo .value{font-size:3rem;font-weight:bold;margin:0}
      .counter-demo .actions{display:flex;gap:8px}
      .counter-demo button{padding:8px 20px;font-size:1.2rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff}
    `,
  },
  () => {
    componentMonitoring();
    return { counter: injectCounter() };
  },
  ({ counter }) =>
    div({ class: 'counter-demo' }, [
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

export type GenDeps_CraftServiceCounterComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    Counter: ReturnType<typeof provideCounter>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
