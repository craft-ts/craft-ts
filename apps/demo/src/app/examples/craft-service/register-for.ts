import { computed, signal } from '@angular/core';
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
    providers: [provideCounter()],
    styles: `
      :scope{display:grid;gap:.35rem;padding:.8rem;border:1px solid #cbd5e1;border-radius:.6rem;background:#f8fafc}
      .value{font-size:1.6rem;font-weight:700}
      .actions{display:flex;gap:.4rem}
      button{padding:.35rem .65rem;border:1px solid #cbd5e1;border-radius:.35rem;background:#fff;cursor:pointer}
    `,
  },
  function* () {
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

const { RegisterForCounterChild, provideRegisterForCounterChild } =
  craftRegisterFor('CounterChild', CounterChild, ({ CounterChild }) => ({
    total: computed(() => CounterChild()?.length ?? 0), // todo change to total service
    incrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.increment()),
    decrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.decrement()),
  }));

const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [provideRegisterForCounterChild()],
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

    return {
      counterChildIds,
      childComponents,
    };
  },
  ({ counterChildIds, childComponents }) =>
    section([
      h2('craftRegisterFor : contrôler les counters enfants'),
      p(
        'Le parent observe les instances Counter créées dans ses enfants. Retirer un enfant retire aussi sa registration.',
      ),
      div({ class: 'toolbar' }, [
        button(
          { click: childComponents.incrementAllChildCounter },
          'Incrémenter tous',
        ),
        button(
          { click: childComponents.decrementAllChildCounter },
          'Décrémenter tous',
        ),
        button({ click: counterChildIds.addChild }, 'Ajouter un enfant'),
        button({ click: counterChildIds.removeChild }, 'Retirer un enfant'),
        span(
          { class: 'meta' },
          () =>
            `services: ${childComponents.total()} · composants: ${childComponents.total()}`,
        ),
      ]),
      div(
        { class: 'children' },
        each(counterChildIds, { track: (id) => id }, () => CounterChild({})),
      ),
    ]),
);

export default RegisterForDemo;
