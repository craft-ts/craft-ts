import { computed } from '@angular/core';
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
import { craftRegisterFor, craftService, state } from '@craft-ng/core';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const { counter } = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((v) => v + 1),
      decrement: () => update((v) => v - 1),
    }));

    return counter;
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  {
    providers: [provideCounter()],
    styles: `
      :scope{display:grid;gap:.35rem;padding:.8rem;border:1px solid #cbd5e1;border-radius:.6rem;background:#f8fafc}
      .value{font-size:1.6rem;font-weight:700}
      .actions{display:flex;gap:.4rem}
      button{padding:.35rem .65rem;border:1px solid #cbd5e1;border-radius:.35rem;background:#fff;cursor:pointer}
    `,
  },
  function* () {
    const counter = yield* Counter();
    return { counter };
  },
  ({ counter }) =>
    div([
      span({ class: 'value' }, () => counter()),
      div({ class: 'actions' }, [
        button({ click: counter.decrement }, '-'),
        button({ click: counter.increment }, '+'),
      ]),
    ]),
);

const { RegisterForCounterChild, provideRegisterForCounterChild } =
  craftRegisterFor('CounterChild', CounterChild, ({ CounterChild }) => ({
    total: computed(() => CounterChild()?.length ?? 0),
    incrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.increment()),
    decrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.decrement()),
  }));

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: computed(() => Counter()?.length ?? 0),
  }),
);

const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [provideRegisterForCounterChild(), provideRegisterForCounter()],
    styles: `
      :scope{display:grid;gap:1rem;padding:1.5rem;font-family:sans-serif}
      .toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
      .toolbar button{padding:.55rem .8rem;border:1px solid #94a3b8;border-radius:.4rem;background:#fff;cursor:pointer}
      .children{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem}
      .meta{color:#475569}
    `,
  },
  function* () {
    const { counterChildIds } = yield* state(
      'counterChildIds',
      [1, 2, 3],
      ({ update }) => ({
        addChild: () =>
          update((ids) => [
            ...ids,
            (ids.length === 0 ? 0 : (ids[ids.length - 1] ?? 0)) + 1,
          ]),
        removeChild: () => update((ids) => ids.slice(0, -1)),
      }),
    );

    const childComponents = yield* RegisterForCounterChild();
    const counterTotal = yield* RegisterForCounter.total();

    return {
      counterChildIds,
      childComponents,
      counterTotal,
    };
  },
  ({ counterChildIds, childComponents, counterTotal }) =>
    section([
      h2('craftRegisterFor: control child counters'),
      p(
        'The parent observes the Counter instances created in its children. Removing a child also removes its registration.',
      ),
      div({ class: 'toolbar' }, [
        button(
          { click: childComponents.incrementAllChildCounter },
          'Increment all',
        ),
        button(
          { click: childComponents.decrementAllChildCounter },
          'Decrement all',
        ),
        button({ click: counterChildIds.addChild }, 'Add a child'),
        button({ click: counterChildIds.removeChild }, 'Remove a child'),
        span(
          { class: 'meta' },
          () =>
            `services: ${counterTotal()} · components: ${childComponents.total()}`,
        ),
      ]),
      div(
        { class: 'children' },
        each(counterChildIds, { track: (id) => id }, () => CounterChild({})),
      ),
    ]),
);

export default RegisterForDemo;
