import {
  button,
  content,
  craftComponent,
  craftTemplate,
  div,
  each,
  footer,
  h2,
  ifBlock,
  li,
  p,
  renderContent,
  renderTemplate,
  section,
  span,
  ul,
  type ContentSlot,
  type ProjectionContractOf,
  type ProjectionOf,
  type ProjectionSlot,
  type RequiredContent,
} from '@craft-ng/component';
import type { Input } from '@craft-ng/component';
import { craftComputed, state } from '@craft-ng/core';

interface DemoUser {
  readonly id: number;
  readonly name: string;
  readonly role: string;
}

type CardInput = {
  readonly header?: ContentSlot;
  readonly body: RequiredContent<{
    readonly selector: {
      readonly tag: 'p';
      readonly class: 'projection-demo__content';
    };
  }>;
};

const userBadge = craftComponent(
  'userBadge',
  {},
  (role: Input<string>) => ({ role }),
  ({ role }) => span({ class: 'projection-demo__badge' }, role),
);

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

const toolbarAction = craftComponent(
  'toolbarAction',
  {},
  (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) => ({
    key: input.key,
    contract: {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract,
    content: input.content,
  }),
  ({ contract, content: label }) =>
    button(
      {
        class: 'projection-demo__action',
        type: 'button',
        disabled: contract.disabled,
        click: contract.trigger,
      },
      renderContent(label),
    ),
);

type ToolbarActionContractFromComponent = ProjectionContractOf<
  typeof toolbarAction
>;
type ToolbarActionSlot = ProjectionSlot<ToolbarActionContractFromComponent>;

const toolbar = craftComponent(
  'toolbar',
  {},
  (input: { readonly actions: ToolbarActionSlot }) => input,
  ({ actions }) =>
    div(
      { class: 'projection-demo__toolbar', role: 'toolbar' },
      each(actions, { track: (action) => action.key }, (action) =>
        renderContent(action),
      ),
    ),
);

const dialog = craftComponent(
  'dialog',
  {},
  (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof toolbarAction>[];
  }) => ({
    body: input.body ?? content(() => p('Aucun contenu de dialogue fourni.')),
    actions: input.actions,
  }),
  ({ body, actions }) =>
    section({ class: 'projection-demo__dialog', role: 'dialog' }, [
      renderContent(body),
      footer(
        { class: 'projection-demo__dialog-actions' },
        each(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]),
);

const card = craftComponent(
  'card',
  {
    contentStyles: {
      header: ':scope { display: block; margin-block-end: 0.5rem; }',
      body: ':scope { display: block; color: #334155; }',
    },
  },
  (input: CardInput) => ({
    header:
      input.header ??
      content(() =>
        h2({ class: 'projection-demo__fallback' }, 'Titre par défaut'),
      ),
    body: input.body,
  }),
  ({ header, body }) =>
    section({ class: 'projection-demo__card' }, [
      renderContent('header', header),
      section({ class: 'projection-demo__body' }, renderContent('body', body)),
    ]),
);

const userRow = craftTemplate<{
  readonly $implicit: DemoUser;
  readonly index: number;
}>(({ $implicit: user, index }) =>
  li({ class: 'projection-demo__row' }, [
    span(`${index + 1}. ${user.name}`),
    userBadge({
      role: function* () {
        return user.role;
      },
    }),
  ]),
);

export const contentProjectionDemo = craftComponent(
  'contentProjectionDemo',
  { host: { class: 'component-demo-host' } },
  function* () {
    const showToolbar = yield* state('showToolbar', true, ({ update }) => ({
      toggle: () => update((visible) => !visible),
    }));
    const dialogOpen = yield* state('dialogOpen', false, ({ set }) => ({
      open: () => set(true),
      close: () => set(false),
    }));
    const lastAction = yield* state(
      'lastAction',
      'Aucune action déclenchée.',
      ({ state, set }) => ({
        record: (label: string) => set(label),
        lastActionLabel: craftComputed('lastActionLabel', function* () {
          return `Dernière action : ${yield* state()}`;
        }),
      }),
    );
    const users = [
      { id: 1, name: 'Ada Lovelace', role: 'Pionnière des algorithmes' },
      { id: 2, name: 'Grace Hopper', role: 'Compilateurs et systèmes' },
      { id: 3, name: 'Margaret Hamilton', role: 'Logiciel embarqué' },
    ] satisfies readonly DemoUser[];

    return {
      users,
      showToolbar,
      dialogOpen,
      lastAction,
      lastActionLabel: lastAction.lastActionLabel,
      toggleToolbar: showToolbar.toggle,
      openDialog: dialogOpen.open,
      closeDialog: dialogOpen.close,
      recordAction: lastAction.record,
    };
  },
  ({
    users,
    showToolbar,
    dialogOpen,
    lastActionLabel,
    toggleToolbar,
    openDialog,
    closeDialog,
    recordAction,
  }) =>
    section({ class: 'component-demo projection-demo' }, [
      h2('Projection de contenu et contrats logiques'),
      p(
        'Chaque cas utilise content() ou renderContent() sans registre runtime : le même composant peut être rendu directement ou projeté.',
      ),
      card({
        header: content(() => h2('Slot header fourni par la page')),
        body: content(
          () => [
            p(
              { class: 'projection-demo__content' },
              'Le contenu respecte le contrat DOM du slot.',
            ),
            ul(
              { class: 'projection-demo__list' },
              each(users, { track: (user) => user.id }, (user, index) =>
                renderTemplate(userRow, {
                  $implicit: user,
                  index,
                }),
              ),
            ),
          ],
          { allowContainerStyles: true },
        ),
      }),
      card({
        body: () =>
          p(
            { class: 'projection-demo__content' },
            'Ce second exemple utilise le rendu normal du contenu sans opt-in de styles.',
          ),
      }),
      section({ class: 'projection-demo__case' }, [
        h2('Projection logique et collection keyée'),
        p(
          'ToolbarAction expose un contract. Toolbar reçoit une collection explicite, la rend avec renderContent() et la réconcilie par key.',
        ),
        p({ class: 'projection-demo__status' }, lastActionLabel),
        button(
          {
            class: 'projection-demo__toggle',
            type: 'button',
            click: toggleToolbar,
          },
          ifBlock(
            showToolbar,
            () => 'Masquer la toolbar',
            () => 'Afficher la toolbar',
          ),
        ),
        ifBlock(
          showToolbar,
          () =>
            toolbar({
              actions: [
                toolbarAction({
                  key: 'save',
                  content: () => 'Enregistrer',
                  trigger: function* () {
                    yield* recordAction('Enregistrer');
                  },
                }),
                toolbarAction({
                  key: 'cancel',
                  content: () => 'Annuler',
                  trigger: function* () {
                    yield* recordAction('Annuler');
                  },
                }),
              ],
            }),
          () => p('La projection conditionnelle est masquée.'),
        ),
        p('Le même composant, rendu directement :'),
        toolbarAction({
          key: 'direct',
          content: () => 'Action directe',
          trigger: function* () {
            yield* recordAction('Action directe');
          },
        }),
        button(
          {
            class: 'projection-demo__toggle',
            type: 'button',
            click: openDialog,
          },
          'Ouvrir le dialog projeté',
        ),
      ]),
      ifBlock(
        dialogOpen,
        () =>
          dialog({
            body: content(() =>
              div([
                h2('Dialog avec contenu optionnel'),
                p(
                  'Le corps est un ContentSlot libre, les actions sont contractuelles.',
                ),
              ]),
            ),
            actions: [
              toolbarAction({
                key: 'close',
                content: () => 'Fermer',
                trigger: closeDialog,
              }),
              toolbarAction({
                key: 'confirm',
                content: () => 'Confirmer',
                trigger: function* () {
                  yield* recordAction('Confirmer');
                  yield* closeDialog();
                },
              }),
            ],
          }),
        () => [],
      ),
    ]),
);
