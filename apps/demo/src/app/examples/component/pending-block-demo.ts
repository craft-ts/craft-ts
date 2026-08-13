import {
  button,
  craftComponent,
  div,
  h2,
  li,
  p,
  pendingBlock,
  section,
  span,
  ul,
} from '@craft-ng/component';
import { craftComputed, craftSleep, query, settled } from '@craft-ng/core';

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
 * `settledValue` + `pendingBlock` — type-safe suspension.
 *
 * The template never sees `undefined`: `settled(...)` hands back a resolved
 * value, and the loading state belongs to the `pendingBlock`. Removing the
 * boundary below is a **compile error**, not an `undefined` leaking into the
 * render.
 */
export const pendingBlockDemo = craftComponent(
  'pendingBlockDemo',
  {
    host: { class: 'pending-demo-host' },
    styles: `
      :scope { display: grid; gap: 1rem; padding: 1rem; justify-items: start; }
      .pending-demo__skeleton {
        padding: .75rem 1rem;
        border-radius: .75rem;
        background: #eef2ff;
        color: #4338ca;
        font-weight: 650;
      }
      .pending-demo__reload {
        width: fit-content;
        padding: .45rem .9rem;
        border: 1px solid #c7d2fe;
        border-radius: .6rem;
        background: #fff;
        font-weight: 650;
        cursor: pointer;
      }
      .pending-demo__list { display: grid; gap: .35rem; margin: 0; padding-left: 1.1rem; }
      .pending-demo__count { opacity: .72; font-size: .9rem; }
    `,
  },
  function* () {
    const users = yield* query('users', {
      method: (_: undefined) => undefined,
      // `preservePreviousValue: false` clears the value on every reload, so the
      // boundary shows again on each click. Without it a reload keeps the
      // previous value and does not suspend at all (stale-while-revalidate).
      preservePreviousValue: () => false,
      loader: function* () {
        yield* craftSleep(900);
        return { items: USERS };
      },
    });

    yield* users.call(undefined); // trigger first call

    // The computed consumes the resolved value: inside the callback `list` is
    // an `{ items }`, never `undefined`. In exchange the computed is tagged as
    // depending on the async source "users".
    const teams = craftComputed('teams', function* () {
      const list = yield* settled(users);
      return [...new Set(list.items.map((user) => user.team))]
        .sort()
        .join(' · ');
    });

    const total = craftComputed('total', function* () {
      const list = yield* settled(users);
      return `${list.items.length} people`;
    });

    return { users, teams, total };
  },
  ({ teams, total, users }) =>
    section({ class: 'pending-demo' }, [
      h2('settledValue + pendingBlock'),
      p(
        'The template reads an always-resolved value; the pendingBlock owns the loading state.',
      ),
      button(
        {
          class: 'pending-demo__reload',
          *click() {
            yield* users.call(undefined);
          },
        },
        'Reload',
      ),
      div([
        ul({ class: 'pending-demo__list' }, [
          li(['Teams: ', span(teams)]),
          li({ class: 'pending-demo__count' }, total),
        ]),
      ]).pipe(
        // One boundary covers both computeds. Remove this line and
        // `craftComponent(...)` refuses to compile, naming the "users" source.
        pendingBlock.exhaustive({
          users: () => p({ class: 'pending-demo__skeleton' }, 'Loading teams…'),
        }),
      ),
    ]),
);

export default pendingBlockDemo;
