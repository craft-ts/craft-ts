import {
  button,
  craftComponent,
  deferNode,
  div,
  forNode,
  p,
  section,
  span,
  type Input,
  type Output,
  heading,
} from '@craft-ts/component';
import { craftComputed, deepYieldable, state } from '@craft-ts/core';

interface DemoUser {
  readonly id: number;
  readonly name: string;
}

const userCard = craftComponent(
  'userCard',
  {},
  (user: Input<DemoUser>, onRemove: Output<(user: DemoUser) => void>) => ({
    user: deepYieldable(user),
    onRemove,
  }),
  ({ user, onRemove }) =>
    div({
      class: 'component-demo__user',
      'data-user-id': user.id,
    }, [
      span(user.name),
      button('removeUser',
        { type: 'button',
          class: 'component-demo__remove',
          *click() {
            yield* onRemove(yield* user());
          },
          'aria-label': function* () {
            return `Remove ${(yield* user()).name}`;
          },
        },
        'Remove',
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
              items: [...current.items, { id, name: `User ${id}` }],
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
      heading('Functional SFC components'),
      p('Runtime rendering, inline signals, keyed list, and a selectorless child.'),
      button('addUser',
        { type: 'button',
          class: 'component-demo__add',
          click: users.addUser,
          'data-testid': 'add-user',
        },
        'Add a user',
      ),
      div(
        { class: 'component-demo__list' },
        forNode(
          users.items,
          {
            track: (user) => user.id,
            empty: () =>
              p({ class: 'component-demo__empty' }, 'No users'),
            },
            (user) =>
              userCard({
                user,
                onRemove: users.remove,
              }),
        ),
      ),
      deferNode(
        ({ withRetry }) =>
          withRetry(import('./lazy-message')).then(
            (module) => module.lazyMessage,
          ),
        {
          trigger: 'interaction',
          placeholder: () =>
            button('loadDeferred',
              { type: 'button',
                class: 'component-demo__defer-trigger',
                'data-testid': 'load-deferred',
              },
              'Load the deferred component',
            ),
          loading: () => p('Loading…'),
          error: () =>
            p({ class: 'component-demo__error' }, 'The load failed.'),
        },
      ),
    ]),
);
