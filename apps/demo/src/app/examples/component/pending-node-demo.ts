import {
  button,
  craftComponent,
  div,
  li,
  p,
  pendingNode,
  section,
  span,
  ul,
  heading,
} from '@craft-ts/component';
import { craftComputed, craftSleep, query, settled } from '@craft-ts/core';
import { componentUi, pendingDemo } from './component-demos.style';

interface DemoUser {
  readonly id: number;
  readonly name: string;
  readonly team: string;
}

const USERS: readonly DemoUser[] = [
  { id: 1, name: 'Ada Lovelace', team: 'Analytics' },
  { id: 2, name: 'Grace Hopper', team: 'Compilers' },
  { id: 3, name: 'Katherine Johnson', team: 'Trajectories' },
];

/**
 * `settledValue` + `pendingNode` — type-safe suspension.
 *
 * The template never sees `undefined`: `settled(...)` hands back a resolved
 * value, and the loading state belongs to the `pendingNode`. Removing the
 * boundary below is a **compile error**, not an `undefined` leaking into the
 * render.
 */
export const pendingNodeDemo = craftComponent(
  'pendingNodeDemo',
  {
    host: { class: componentUi.host },
  },
  function* () {
    const users = yield* query(
      'users',
      {
        method: (_: undefined) => undefined,
        // `preservePreviousValue: false` clears the value on every reload, so the
        // boundary shows again on each click. Without it a reload keeps the
        // previous value and does not suspend at all (stale-while-revalidate).
        preservePreviousValue: () => false,
        loader: function* () {
          yield* craftSleep(900);
          return { items: USERS };
        },
      },
      ({ resource }) => ({
        teams: craftComputed('teams', function* () {
          const list = yield* settled(resource);
          return [...new Set(list.items.map((user) => user.team))]
            .sort()
            .join(' · ');
        }),
        total: craftComputed('total', function* () {
          const list = yield* settled(resource);
          return `${list.items.length} people`;
        }),
      }),
    );

    yield* users.call(undefined); // trigger first call

    return { users };
  },
  ({ users }) =>
    section({ class: pendingDemo.page }, [
      heading('settledValue + pendingNode'),
      p(
        'The template reads an always-resolved value; the pendingNode owns the loading state.',
      ),
      button(
        'reload',
        {
          type: 'button',
          class: pendingDemo.actionButton,
          *click() {
            yield* users.call(undefined);
          },
        },
        'Reload',
      ),
      div([
        ul({ class: pendingDemo.list }, [
          li(['Teams: ', span(users.teams)]),
          li({ class: pendingDemo.count }, users.total),
        ]),
      ]).pipe(
        // One boundary covers both computeds. Remove this line and
        // `craftComponent(...)` refuses to compile, naming the "users" source.
        pendingNode({
          fallback: () => p({ class: pendingDemo.skeleton }, 'Loading teams…'),
        }),
      ),
    ]),
);

export default pendingNodeDemo;
