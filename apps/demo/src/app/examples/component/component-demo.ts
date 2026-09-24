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
import { componentUi } from './component-demos.style';

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
      class: componentUi.user,
      'data-user-id': user.id,
    }, [
      span(user.name),
      button('removeUser',
        { type: 'button',
          class: componentUi.button,
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
  { host: { class: componentUi.host } },
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
    section({ class: componentUi.page }, [
      heading('Functional SFC components'),
      p('Runtime rendering, inline signals, keyed list, and a selectorless child.'),
      button('addUser',
        { type: 'button',
          class: componentUi.button,
          'data-componentButton': 'primary',
          click: users.addUser,
          'data-testid': 'add-user',
        },
        'Add a user',
      ),
      div(
        { class: componentUi.list },
        forNode(
          users.items,
          {
            track: (user) => user.id,
            empty: () =>
              p({ class: componentUi.error }, 'No users'),
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
                class: componentUi.button,
                'data-componentButton': 'primary',
                'data-testid': 'load-deferred',
              },
              'Load the deferred component',
            ),
          loading: () => p('Loading…'),
          error: () =>
            p({ class: componentUi.error }, 'The load failed.'),
        },
      ),
    ]),
);
