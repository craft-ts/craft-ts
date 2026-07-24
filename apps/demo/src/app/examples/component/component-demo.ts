import { signal } from '@angular/core';
import {
  button,
  component,
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
import type { GetDeps } from '@craft-ng/core';

interface DemoUser {
  readonly id: number;
  readonly name: string;
}

const loadLazyMessage = () =>
  import('./lazy-message').then((module) => module.lazyMessage);

const userCard = component(
  {},
  (
    user: Input<DemoUser>,
    onRemove: Output<(user: DemoUser) => void>,
  ) => ({ user, onRemove }),
  ({ user, onRemove }) =>
    div({ class: 'component-demo__user', 'data-user-id': user().id }, [
      span(user().name),
      button(
        {
          class: 'component-demo__remove',
          click: () => onRemove(user()),
          'aria-label': `Retirer ${user().name}`,
        },
        'Retirer',
      ),
    ]),
);

export const componentDemo = component(
  { host: { class: 'component-demo-host' } },
  () => {
    const users = signal<DemoUser[]>([
      { id: 1, name: 'Ada Lovelace' },
      { id: 2, name: 'Grace Hopper' },
    ]);
    let nextId = 3;

    return {
      users,
      addUser: () => {
        const id = nextId;
        nextId += 1;
        users.update((current) => [
          ...current,
          { id, name: `Utilisateur ${id}` },
        ]);
      },
      removeUser: (removed: DemoUser) =>
        users.update((current) =>
          current.filter((user) => user.id !== removed.id),
        ),
    };
  },
  ({ users, addUser, removeUser }) =>
    section({ class: 'component-demo' }, [
      h2('Composants fonctionnels SFC'),
      p(
        'Rendu runtime, signaux inline, liste keyée et enfant selectorless.',
      ),
      button(
        {
          class: 'component-demo__add',
          click: addUser,
          'data-testid': 'add-user',
        },
        'Ajouter un utilisateur',
      ),
      div(
        { class: 'component-demo__list' },
        each(
          users,
          {
            track: (user) => user.id,
            empty: () =>
              p(
                { class: 'component-demo__empty' },
                'Aucun utilisateur',
              ),
          },
          (user) =>
            userCard({
              user: () => user,
              onRemove: removeUser,
            }),
        ),
      ),
      defer(loadLazyMessage, {
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
          p(
            { class: 'component-demo__error' },
            'Le chargement a échoué.',
          ),
      }),
    ]),
);

export type GenDeps_ComponentDemo = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: Record<never, never>;
  publicProperties: Record<never, never>;
}>;
