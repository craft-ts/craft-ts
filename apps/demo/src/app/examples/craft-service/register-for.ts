import { signal } from '@angular/core';
import {
  button,
  craftComponent,
  div,
  each,
  h2,
  p,
  section,
  span,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftRegisterFor,
  craftService,
  provideHostName,
} from '@craft-ng/core';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    let value = 0;
    const counter = signal(value);
    const update = (delta: number) => {
      value += delta;
      counter.set(value);
    };

    return {
      value: counter,
      increment: () => update(1),
      decrement: () => update(-1),
    };
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  {
    providers: [
      provideCounter(),
      provideHostName('component:CounterChild'),
    ],
    styles: `
      :scope{display:grid;gap:.35rem;padding:.8rem;border:1px solid #cbd5e1;border-radius:.6rem;background:#f8fafc}
      .value{font-size:1.6rem;font-weight:700}
      .actions{display:flex;gap:.4rem}
      button{padding:.35rem .65rem;border:1px solid #cbd5e1;border-radius:.35rem;background:#fff;cursor:pointer}
    `,
  },
  function* () {
    componentMonitoring();
    return yield* Counter();
  },
  ({ value, increment, decrement }) =>
    div([
      span({ class: 'value' }, () => String(value())),
      div({ class: 'actions' }, [
        button({ click: decrement }, '-'),
        button({ click: increment }, '+'),
      ]),
    ]),
);

const { RegisterFor, provideRegisterFor } = craftRegisterFor([
  Counter,
  CounterChild,
]);

const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [
      ...provideRegisterFor(),
      provideHostName('component:RegisterForDemo'),
    ],
    styles: `
      :scope{display:grid;gap:1rem;padding:1.5rem;font-family:sans-serif}
      .toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
      .toolbar button{padding:.55rem .8rem;border:1px solid #94a3b8;border-radius:.4rem;background:#fff;cursor:pointer}
      .children{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem}
      .meta{color:#475569}
    `,
  },
  function* () {
    componentMonitoring();
    const childIds = signal([1, 2, 3]);
    const counters = yield* RegisterFor.Counter();
    const childComponents = yield* RegisterFor.CounterChild();

    return {
      childIds,
      counters,
      childComponents,
      addChild: () =>
        childIds.update((ids) => [
          ...ids,
          (ids.length === 0 ? 0 : (ids[ids.length - 1] ?? 0)) + 1,
        ]),
      removeChild: () => childIds.update((ids) => ids.slice(0, -1)),
      incrementAll: () => counters()?.forEach(({ ref }) => ref.increment()),
      decrementAll: () => counters()?.forEach(({ ref }) => ref.decrement()),
    };
  },
  ({
    childIds,
    counters,
    childComponents,
    addChild,
    removeChild,
    incrementAll,
    decrementAll,
  }) =>
    section([
      h2('craftRegisterFor : contrôler les counters enfants'),
      p(
        'Le parent observe les instances Counter créées dans ses enfants. Retirer un enfant retire aussi sa registration.',
      ),
      div({ class: 'toolbar' }, [
        button({ click: incrementAll }, 'Incrémenter tous'),
        button({ click: decrementAll }, 'Décrémenter tous'),
        button({ click: addChild }, 'Ajouter un enfant'),
        button({ click: removeChild }, 'Retirer un enfant'),
        span(
          { class: 'meta' },
          () =>
            `services: ${counters()?.length ?? 0} · composants: ${childComponents()?.length ?? 0}`,
        ),
      ]),
      div({ class: 'children' },
        each(
          childIds,
          { track: (id) => id },
          () => CounterChild({}),
        ),
      ),
    ]),
);

export default RegisterForDemo;
