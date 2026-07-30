import {
  ContentInput,
  CraftFragment,
  craftComponent,
  craftTemplate,
  each,
  h2,
  li,
  p,
  project,
  renderTemplate,
  section,
  span,
  ul,
  type Input,
} from '@craft-ng/component';

interface DemoUser {
  readonly id: number;
  readonly name: string;
  readonly role: string;
}

type CardSlots = {
  readonly header?: CraftFragment;
  readonly default: CraftFragment;
};

const userBadge = craftComponent(
  'contentProjectionUserBadge',
  {},
  (role: Input<string>) => ({ role }),
  ({ role }) => span({ class: 'projection-demo__badge' }, role()),
);

const card = craftComponent(
  'contentProjectionCard',
  {},
  (content: ContentInput<CardSlots>) => ({ content }),
  ({ content }) =>
    section({ class: 'projection-demo__card' }, [
      content.header
        ? project(content.header)
        : h2({ class: 'projection-demo__fallback' }, 'Titre par défaut'),
      section({ class: 'projection-demo__body' }, project(content.default)),
    ]),
);

const userRow = craftTemplate<{
  readonly $implicit: DemoUser;
  readonly index: number;
}>(({ $implicit: user, index }) =>
  li({ class: 'projection-demo__row' }, [
    span(`${index + 1}. ${user.name}`),
    userBadge({ role: () => user.role }),
  ]),
);

export const contentProjectionDemo = craftComponent(
  'contentProjectionDemo',
  { host: { class: 'component-demo-host' } },
  () => ({
    users: [
      { id: 1, name: 'Ada Lovelace', role: 'Pionnière des algorithmes' },
      { id: 2, name: 'Grace Hopper', role: 'Compilateurs et systèmes' },
      { id: 3, name: 'Margaret Hamilton', role: 'Logiciel embarqué' },
    ] satisfies readonly DemoUser[],
  }),
  ({ users }) =>
    section({ class: 'component-demo projection-demo' }, [
      h2('Projection de contenu et fragments typés'),
      p(
        'Le composant Card reçoit un slot header optionnel et un slot default obligatoire. Le contenu reste rendu dans le contexte de la page qui le déclare.',
      ),
      card({
        content: {
          header: () => h2('Slot header fourni par la page'),
          default: () => [
            p(
              'Le même composant peut accueillir une liste construite avec un template typé.',
            ),
            ul(
              { class: 'projection-demo__list' },
              each(users, { track: (user) => user.id }, (user, index) =>
                renderTemplate(userRow, { $implicit: user, index }),
              ),
            ),
          ],
        },
      }),
      card({
        content: {
          default: () =>
            p(
              'Ce second exemple ne fournit pas header : le fallback du slot est rendu automatiquement.',
            ),
        },
      }),
    ]),
);
