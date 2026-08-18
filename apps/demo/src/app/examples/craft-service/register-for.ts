/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  each,
  p,
  section,
  span,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftRegisterFor,
  craftService,
  state,
} from '@craft-ts/core';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
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
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const counter = yield* Counter();
    return { counter };
  },
  ({ counter }) =>
    div([
      span({ class: 'value' }, counter),
      div({ class: 'actions' }, [
        button('decrement', { type: 'button', 'aria-label': 'Decrement', click: counter.decrement }, '-'),
        button('increment', { type: 'button', 'aria-label': 'Increment', click: counter.increment }, '+'),
      ]),
    ]),
);

const { RegisterForCounterChild, provideRegisterForCounterChild } =
  craftRegisterFor('CounterChild', CounterChild, ({ CounterChild }) => ({
    total: craftComputed('total', () => CounterChild()?.length ?? 0),
    incrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.increment()),
    decrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.decrement()),
  }));

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: craftComputed('total', () => Counter()?.length ?? 0),
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
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const counterChildIds = yield* state(
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
    const childTotal = craftComputed('childTotal', function* () {
        const _childComponentstotal = yield* childComponents.total(); return _childComponentstotal; },
    );
    const serviceTotal = craftComputed('serviceTotal', function* () {
        const _counterTotal = yield* counterTotal(); return _counterTotal; },
    );

    return {
      counterChildIds,
      childComponents,
      childTotal,
      serviceTotal,
    };
  },
  ({ counterChildIds, childComponents, childTotal, serviceTotal }) =>
    section([
      heading('craftRegisterFor: control child counters'),
      p(
        'The parent observes the Counter instances created in its children. Removing a child also removes its registration.',
      ),
      div({ class: 'toolbar' }, [
        button('incrementAll',
          { type: 'button', click: childComponents.incrementAllChildCounter },
          'Increment all',
        ),
        button('decrementAll',
          { type: 'button', click: childComponents.decrementAllChildCounter },
          'Decrement all',
        ),
        button('addChild', { type: 'button', click: counterChildIds.addChild }, 'Add a child'),
        button('removeChild', { type: 'button', click: counterChildIds.removeChild }, 'Remove a child'),
        span(
          { class: 'meta' },
          function* () {
            return `services: ${yield* serviceTotal()} · components: ${yield* childTotal()}`;
          },
        ),
      ]),
      div(
        { class: 'children' },
        each(counterChildIds, { track: (id) => id }, () => CounterChild({})),
      ),
    ]),
);

export default RegisterForDemo;
