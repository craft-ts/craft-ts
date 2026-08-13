import {
  button,
  craftComponent,
  defer,
  div,
  each,
  h2,
  p,
  section,
  span,
  type Input,
  type Output,
} from '@craft-ng/component';
import { craftComputed, state } from '@craft-ng/core';

interface DemoUser {
  readonly id: number;
  readonly name: string;
}

const userCard = craftComponent(
  'userCard',
  {},
  (user: Input<DemoUser>, onRemove: Output<(user: DemoUser) => void>) => ({
    user,
    onRemove,
  }),
  ({ user, onRemove }) =>
    div({ class: 'component-demo__user', 'data-user-id': user().id }, [
      span(user().name),
      button(
        {
          class: 'component-demo__remove',
          *click() {
            yield* onRemove(user());
          },
          'aria-label': `Retirer ${user().name}`,
        },
        'Retirer',
      ),
    ]),
);

export const componentDemo = craftComponent(
  'componentDemo',
  { host: { class: 'component-demo-host' } },
  () =>
    state(
      'users',
      {
        nextId: 3,
        items: [
          { id: 1, name: 'Ada Lovelace' },
          { id: 2, name: 'Grace Hopper' },
        ] satisfies DemoUser[],
      },
      ({ state, update }) => ({
        items: craftComputed(function* () {
          return (yield* state()).items;
        }),
        addUser: () =>
          update((current) => {
            const id = current.nextId;
            return {
              nextId: id + 1,
              items: [...current.items, { id, name: `Utilisateur ${id}` }],
            };
          }),
        remove: (removed: DemoUser) =>
          update((current) => ({
            ...current,
            items: current.items.filter((user) => user.id !== removed.id),
          })),
      }),
    ),
  (users) =>
    section({ class: 'component-demo' }, [
      h2('Composants fonctionnels SFC'),
      p('Rendu runtime, signaux inline, liste keyée et enfant selectorless.'),
      button(
        {
          class: 'component-demo__add',
          click: users.addUser,
          'data-testid': 'add-user',
        },
        'Ajouter un utilisateur',
      ),
      div(
        { class: 'component-demo__list' },
        each(
          users.items,
          {
            track: (user) => user.id,
            empty: () =>
              p({ class: 'component-demo__empty' }, 'Aucun utilisateur'),
          },
          (user) =>
            userCard({
              user: () => user,
              onRemove: users.remove,
            }),
        ),
      ),
      defer(
        ({ withRetry }) =>
          withRetry(import('./lazy-message')).then(
            (module) => module.lazyMessage,
          ),
        {
          trigger: 'interaction',
          placeholder: () =>
            button(
              {
                class: 'component-demo__defer-trigger',
                'data-testid': 'load-deferred',
              },
              'Charger le composant différé',
            ),
          loading: () => p('Chargement…'),
          error: () =>
            p({ class: 'component-demo__error' }, 'Le chargement a échoué.'),
        },
      ),
    ]),
);
