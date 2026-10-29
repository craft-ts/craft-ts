import { button, craftComponent, div, p, heading } from '@craft-ts/component';
import {
  Console,
  craftExpose,
  craftService,
  injectStateMethodRuntimeContext,
  provideFnWrapper,
  state,
} from '@craft-ts/core';
import { example } from '../shared/example.style';
import { buttonUi } from '@craft-ts/ui/style';

export const { Counter } = craftService(
  {
    name: 'Counter',
    providedIn: 'global',
    providers: [
      provideFnWrapper(
        'Warning: dependency injection here is not type-safe and may fail at runtime',
        function* (factory, thisArg, args) {
          const context = injectStateMethodRuntimeContext();

          if (!context) {
            return yield* factory.apply(thisArg, args);
          }

          const before = context.get();
          const result = yield* factory.apply(thisArg, args);
          const after = context.get();

          yield* Console.log('[Counter/count]', { before, after });
          return result;
        },
      ),
    ],
  },
  function* () {
    yield* state('count', 0, ({ update, set }) => ({
      increment: () => update((n) => n + 1),
      decrement: () => update((n) => n - 1),
      reset: () => set(0),
    }));
  },
);

export const { CraftServiceCounterView, provideCraftServiceCounterView } =
  craftService(
    { name: 'craftServiceCounterView', providedIn: 'toProvide' },
    function* () {
      yield* craftExpose('counter', (yield* Counter()).count);
    },
  );

const CraftServiceCounterComponent = craftComponent(
  'CraftServiceCounterComponent',
  { providers: [provideCraftServiceCounterView()] },
  () =>
    div({ class: example.centered, 'data-testid': 'state-method-wrapper' }, [
      heading(
        { class: example.title },
        'craftService Counter · provideFnWrapper',
      ),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Le wrapper lit le state avant et après chaque méthode state, puis affiche la transition dans la console du navigateur.',
      ),
      p({ class: example.bigValue }, CraftServiceCounterView.counter),
      div({ class: example.row }, [
        button(
          'decrement',
          {
            class: buttonUi.root,
            'data-variant': 'secondary',
            type: 'button',
            click: CraftServiceCounterView.counter.decrement,
          },
          '−',
        ),
        button(
          'reset',
          {
            class: buttonUi.root,
            'data-variant': 'secondary',
            type: 'button',
            click: CraftServiceCounterView.counter.reset,
          },
          'Réinitialiser',
        ),
        button(
          'increment',
          {
            class: buttonUi.root,
            'data-variant': 'primary',
            type: 'button',
            click: CraftServiceCounterView.counter.increment,
          },
          '+',
        ),
      ]),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Clique sur +, − ou Réinitialiser, puis cherche [Counter/count] et les valeurs before / after dans la console.',
      ),
    ]),
);

export default CraftServiceCounterComponent;
