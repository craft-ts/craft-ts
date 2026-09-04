import {
  button,
  content,
  craftTemplate,
  div,
  forNode,
  ifNode,
  li,
  p,
  renderTemplate,
  section,
  span,
  ul,
  heading,
  headingSection,
} from '@craft-ts/component';
import { craftComponent } from '@craft-ts/component';
import { craftComputed, state } from '@craft-ts/core';

import { card } from './content-projection-card';
import { toolbarAction, userBadge } from './content-projection-actions';
import { dialog, toolbar } from './content-projection-overlays';

interface DemoUser {
  readonly id: number;
  readonly name: string;
  readonly role: string;
}

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
      closeFromToolbar: () => set(false),
      closeFromConfirmation: () => set(false),
    }));
    const lastAction = yield* state(
      'lastAction',
      'No action triggered yet.',
      ({ state, set }) => ({
        recordSave: () => set('Save'),
        recordCancel: () => set('Cancel'),
        recordDirect: () => set('Direct action'),
        recordConfirm: () => set('Confirm'),
        lastActionLabel: craftComputed('lastActionLabel', function* () {
          return `Last action: ${yield* state()}`;
        }),
      }),
    );
    const users = [
      { id: 1, name: 'Ada Lovelace', role: 'Algorithm pioneer' },
      { id: 2, name: 'Grace Hopper', role: 'Compilers and systems' },
      { id: 3, name: 'Margaret Hamilton', role: 'Embedded software' },
    ] satisfies readonly DemoUser[];

    return {
      users,
      showToolbar,
      dialogOpen,
      lastAction,
      lastActionLabel: lastAction.lastActionLabel,
      toggleToolbar: showToolbar.toggle,
      openDialog: dialogOpen.open,
      closeDialogFromToolbar: dialogOpen.closeFromToolbar,
      closeDialogFromConfirmation: dialogOpen.closeFromConfirmation,
      recordSave: lastAction.recordSave,
      recordCancel: lastAction.recordCancel,
      recordDirect: lastAction.recordDirect,
      recordConfirm: lastAction.recordConfirm,
    };
  },
  ({
    users,
    showToolbar,
    dialogOpen,
    lastActionLabel,
    toggleToolbar,
    openDialog,
    closeDialogFromToolbar,
    closeDialogFromConfirmation,
    recordSave,
    recordCancel,
    recordDirect,
    recordConfirm,
  }) =>
    section({ class: 'component-demo projection-demo' }, [
      heading('Content projection and logical contracts'),
      headingSection([
        p(
          'Each case uses content() or renderContent() without a runtime registry: the same component can be rendered directly or projected.',
        ),
        card({
          header: content(() => heading('Header slot provided by the page')),
          body: content(
            () => [
              p(
                { class: 'projection-demo__content' },
                'The content follows the slot DOM contract.',
              ),
              ul(
                { class: 'projection-demo__list' },
                forNode(users, { track: (user) => user.id }, (user, index) =>
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
              'This second example uses normal content rendering without opting into styles.',
            ),
        }),
        section({ class: 'projection-demo__case' }, [
          heading('Logical projection and a keyed collection'),
          p(
            'ToolbarAction exposes a contract. Toolbar receives an explicit collection, renders it with renderContent(), and reconciles it by key.',
          ),
          p({ class: 'projection-demo__status' }, lastActionLabel),
          button(
            'toggleToolbar',
            {
              class: 'projection-demo__toggle',
              type: 'button',
              click: toggleToolbar,
            },
            ifNode(
              showToolbar,
              () => 'Hide the toolbar',
              () => 'Show the toolbar',
            ),
          ),
          ifNode(
            showToolbar,
            () =>
              toolbar({
                actions: [
                  toolbarAction({
                    key: 'save',
                    content: () => 'Save',
                    trigger: recordSave,
                  }),
                  toolbarAction({
                    key: 'cancel',
                    content: () => 'Cancel',
                    trigger: recordCancel,
                  }),
                ],
              }),
            () => p('The conditional projection is hidden.'),
          ),
          p('The same component, rendered directly:'),
          toolbarAction({
            key: 'direct',
            content: () => 'Direct action',
            trigger: recordDirect,
          }),
          button(
            'openDialog',
            {
              class: 'projection-demo__toggle',
              type: 'button',
              click: openDialog,
            },
            'Open the projected dialog',
          ),
        ]),
        ifNode(
          dialogOpen,
          () =>
            dialog({
              body: content(() =>
                div([
                  heading('Dialog with optional content'),
                  p(
                    'The body is a free ContentSlot, the actions are contractual.',
                  ),
                ]),
              ),
              actions: [
                toolbarAction({
                  key: 'close',
                  content: () => 'Close',
                  trigger: closeDialogFromToolbar,
                }),
                toolbarAction({
                  key: 'confirm',
                  content: () => 'Confirm',
                  trigger: function* () {
                    yield* recordConfirm();
                    yield* closeDialogFromConfirmation();
                  },
                }),
              ],
            }),
          () => [],
        ),
      ]),
    ]),
);
