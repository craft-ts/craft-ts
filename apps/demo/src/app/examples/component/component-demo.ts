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
import {
  craftService,
  craftComputed,
  state,
} from '@craft-ts/core';
import { componentUi } from './component-demos.style';

interface DemoUser {
  readonly id: number;
  readonly name: string;
}

const userCard = craftComponent(
  'userCard',
  {},
  (inputs: {
    readonly user: Input<DemoUser>;
    readonly onRemove: Output<(user: DemoUser) => void>;
  }) =>
    div(
      {
        class: componentUi.user,
        'data-user-id': function* () {
          return (yield* inputs.user()).id;
        },
      },
      [
        span(function* () {
          return (yield* inputs.user()).name;
        }),
        button(
          'removeUser',
          {
            type: 'button',
            class: componentUi.button,
            *click() {
              inputs.onRemove(yield* inputs.user());
            },
            'aria-label': function* () {
              return `Remove ${(yield* inputs.user()).name}`;
            },
          },
          'Remove',
        ),
      ],
    ),
);

export const { ComponentDemoView, provideComponentDemoView } = craftService(
  { name: 'componentDemoView', providedIn: 'toProvide' },
  function* () {
    const users = yield* state(
      'users',
      [
        { id: 1, name: 'Ada Lovelace' },
        { id: 2, name: 'Grace Hopper' },
      ] satisfies DemoUser[],
      ({ update }) => ({
        addUser: () =>
          update((current) => {
            const id = Math.max(0, ...current.map((user) => user.id)) + 1;
            return [...current, { id, name: `User ${id}` }];
          }),
        remove: (removed: DemoUser) =>
          update((current) => current.filter((user) => user.id !== removed.id)),
      }),
    );
    yield* craftComputed('items', function* () {
      return yield* users();
    });
  },
);

export const componentDemo = craftComponent(
  'componentDemo',
  {
    providers: [provideComponentDemoView()],
  },
  () =>
    section({ class: componentUi.page }, [
      heading('Functional SFC components'),
      p(
        'Runtime rendering, inline signals, keyed list, and a selectorless child.',
      ),
      button(
        'addUser',
        {
          type: 'button',
          class: componentUi.button,
          'data-componentButton': 'primary',
          click: ComponentDemoView.users.addUser,
          'data-testid': 'add-user',
        },
        'Add a user',
      ),
      div(
        { class: componentUi.list },
        forNode(
          function* () {
            return yield* ComponentDemoView.items();
          },
          {
            track: (user) => user.id,
            empty: () => p({ class: componentUi.error }, 'No users'),
          },
          (user) =>
            userCard({
              user,
              onRemove: ComponentDemoView.users.remove,
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
            button(
              'loadDeferred',
              {
                type: 'button',
                class: componentUi.button,
                'data-componentButton': 'primary',
                'data-testid': 'load-deferred',
              },
              'Load the deferred component',
            ),
          loading: () => p('Loading…'),
          error: () => p({ class: componentUi.error }, 'The load failed.'),
        },
      ),
    ]),
);
