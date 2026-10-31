import {
  button,
  craftComponent,
  div,
  heading,
  p,
  section,
  span,
} from '@craft-ts/component';
import {
  craftPipe,
  craftMethod,
  craftService,
  insertSelect,
  on$,
  source$,
  state,
} from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { example } from '../../shared/example.style';

const ITEM_INDEXES: readonly [0, 1] = [0, 1];

export const { ReplayMethodsView, provideReplayMethodsView } = craftService(
  { name: 'replayMethodsView', providedIn: 'toProvide' },
  function* () {
    const cells = yield* state(
      'cells',
      [
        { name: 'Premier élément', actions: 0 },
        { name: 'Second élément', actions: 0 },
      ],
      insertSelect('cell', function* ({ update }) {
        return {
          recordAction: function* () {
            yield* update((cell) => ({ ...cell, actions: cell.actions + 1 }));
          },
        };
      }),
    );

    yield* state('pipedCount', 0, (context) =>
      craftPipe(
        context,
        ({ update }) => ({
          addOne: () => update((count) => count + 1),
        }),
        ({ insertions }) => ({
          addThroughPreviousInsertion: function* () {
            yield* insertions.addOne();
          },
        }),
      ),
    );
    yield* craftMethod('recordCellAction', function* (index: number) {
      const cell = cells.selectCell(index);
      if (cell) yield* cell.recordAction();
    });

    const sourceCount = yield* state('sourceCount', 0, ({ update }) => ({
      increment: () => update((count) => count + 1),
    }));
    const replaySource = yield* source$<void>('source');
    on$(replaySource, () => {
      sourceCount.increment();
    });
    yield* craftMethod('emitReplaySource', function* () {
      replaySource.emit();
    });

  },
);

const ReplayMethods = craftComponent(
  'ReplayMethods',
  { providers: [provideReplayMethodsView()] },
  () =>
    section({ class: example.page, 'data-testid': 'replay-methods-page' }, [
      heading({ class: example.title }, 'Replay des méthodes exposées'),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'Enregistre une session de débogage sur cette page, clique sur chaque action, puis rejoue-la. Les compteurs doivent retrouver les mêmes valeurs.',
      ),
      section({ class: example.panel, 'data-testid': 'insert-select-case' }, [
        heading({ class: example.subtitle }, 'insertSelect · méthodes par élément'),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          'Chaque bouton appelle une méthode exposée par la sélection de son élément.',
        ),
        div({ class: example.stack },
          ITEM_INDEXES.map((index) =>
            div({ class: example.toolbar, 'data-testid': `cell-${index}` }, [
              span(function* () {
                const { cells } = yield* ReplayMethodsView();
                return `${cells.selectCell(index)?.name}: ${cells.selectCell(index)?.actions ?? 0} action(s)`;
              }),
              button(
                'recordCellAction',
                {
                  class: buttonUi.root,
                  'data-variant': 'secondary',
                  type: 'button',
                  'data-testid': `record-cell-action-${index}`,
                  click: function* () {
                    yield* ReplayMethodsView.recordCellAction(index);
                  },
                },
                'Déclencher',
              ),
            ]),
          ),
        ),
      ]),
      section({ class: example.panel, 'data-testid': 'craft-pipe-case' }, [
        heading({ class: example.subtitle }, 'craftPipe · appel composé'),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          'Le second membre appelle la méthode exposée par le premier. Rejoue les deux boutons, notamment l’appel composé.',
        ),
        div({ class: example.toolbar }, [
          span(function* () {
            const { pipedCount } = yield* ReplayMethodsView();
            return `Compteur : ${yield* pipedCount()}`;
          }),
          button(
            'pipe-add-one',
            {
              class: buttonUi.root,
              'data-variant': 'secondary',
              type: 'button',
              'data-testid': 'pipe-add-one',
              click: ReplayMethodsView.pipedCount.addOne,
            },
            'Ajouter 1',
          ),
          button(
            'pipe-add-through-previous',
            {
              class: buttonUi.root,
              'data-variant': 'primary',
              type: 'button',
              'data-testid': 'pipe-add-through-previous',
              click: ReplayMethodsView.pipedCount.addThroughPreviousInsertion,
            },
            'Ajouter via le membre précédent',
          ),
        ]),
      ]),
      section({ class: example.panel, 'data-testid': 'source-case' }, [
        heading({ class: example.subtitle }, 'source$ · émission'),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          'Cette action émet sur une source Craft ; son compteur confirme que le consommateur a reçu l’événement.',
        ),
        div({ class: example.toolbar }, [
          span(function* () {
            const { sourceCount } = yield* ReplayMethodsView();
            return `Événements reçus : ${yield* sourceCount()}`;
          }),
          button(
            'source-emit',
            {
              class: buttonUi.root,
              'data-variant': 'secondary',
              type: 'button',
              'data-testid': 'source-emit',
              click: ReplayMethodsView.emitReplaySource,
            },
            'Émettre',
          ),
        ]),
      ]),
    ]),
);

export default ReplayMethods;
