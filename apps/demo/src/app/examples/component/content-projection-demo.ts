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
import { craftService, state, craftExpose } from '@craft-ts/core';

import { card } from './content-projection-card';
import { toolbarAction, userBadge } from './content-projection-actions';
import { dialog, toolbar } from './content-projection-overlays';
import { componentUi, projectionDemo } from './component-demos.style';

interface DemoUser {
  readonly id: number;
  readonly name: string;
  readonly role: string;
}

const userRow = craftTemplate<{
  readonly $implicit: DemoUser;
  readonly index: number;
}>(({ $implicit: user, index }) =>
  li({ class: projectionDemo.row }, [
    span(`${index + 1}. ${user.name}`),
    userBadge({
      role: function* () {
        return user.role;
      },
    }),
  ]),
);

export const { ContentProjectionDemoView, provideContentProjectionDemoView } =
  craftService(
    { name: 'contentProjectionDemoView', providedIn: 'toProvide' },
    function* () {
      const showToolbar = yield* state('showToolbar', true, ({ update }) => ({
        toggle: () => update((visible) => !visible),
      }));
      const dialogOpen = yield* state('dialogOpen', false, ({ set }) => ({
        open: () => set(true),
        closeFromToolbar: () => set(false),
        closeFromConfirmation: () => set(false),
      }));
      const lastActionLabel = yield* state(
        'lastActionLabel',
        'No action triggered yet.',
        ({ set }) => ({
          recordSave: () => set('Last action: Save'),
          recordCancel: () => set('Last action: Cancel'),
          recordDirect: () => set('Last action: Direct action'),
          recordConfirm: () => set('Last action: Confirm'),
        }),
      );
      const users = [
        { id: 1, name: 'Ada Lovelace', role: 'Algorithm pioneer' },
        { id: 2, name: 'Grace Hopper', role: 'Compilers and systems' },
        { id: 3, name: 'Margaret Hamilton', role: 'Embedded software' },
      ] satisfies readonly DemoUser[];

      yield* craftExpose('users', users);
      yield* craftExpose('lastActionText', lastActionLabel);
      yield* craftExpose('toolbarVisible', showToolbar);
      yield* craftExpose('dialogVisible', dialogOpen);
    },
  );

export const contentProjectionDemo = craftComponent(
  'contentProjectionDemo',
  {
    providers: [provideContentProjectionDemoView()],
  },
  () =>
    section({ class: componentUi.page, 'data-componentPage': 'wide' }, [
      heading('Content projection and logical contracts'),
      headingSection([
        p(
          'Each case uses content() or renderContent() without a runtime registry: the same component can be rendered directly or projected.',
        ),
        card({
          header: content(() => heading('Header slot provided by the page')),
          body: content(() => [
            p(
              { class: projectionDemo.content, 'data-projection': 'content' },
              'The content follows the slot DOM contract.',
            ),
            ul(
              { class: projectionDemo.list },
              forNode(
                ContentProjectionDemoView.users,
                { track: (user) => user.id },
                (user, index) =>
                  renderTemplate(userRow, {
                    $implicit: user,
                    index,
                  }),
              ),
            ),
          ]),
        }),
        card({
          body: () =>
            p(
              { class: projectionDemo.content, 'data-projection': 'content' },
              'This second example projects a single paragraph into the same slot.',
            ),
        }),
        section(
          { class: projectionDemo.case, 'data-testid': 'projection-case' },
          [
            heading('Logical projection and a keyed collection'),
            p(
              'ToolbarAction exposes a contract. Toolbar receives an explicit collection, renders it with renderContent(), and reconciles it by key.',
            ),
            p(
              { class: projectionDemo.status },
              ContentProjectionDemoView.lastActionText,
            ),
            button(
              'ContentProjectionDemoView.showToolbar.toggle',
              {
                class: componentUi.button,
                'data-componentButton': 'primary',
                type: 'button',
                click: ContentProjectionDemoView.showToolbar.toggle,
              },
              ifNode(
                'toolbarVisible',
                ContentProjectionDemoView.toolbarVisible,
                () => 'Hide the toolbar',
                () => 'Show the toolbar',
              ),
            ),
            ifNode(
              'toolbarVisible',
              ContentProjectionDemoView.toolbarVisible,
              () =>
                toolbar({
                  actions: [
                    toolbarAction({
                      key: 'save',
                      content: () => 'Save',
                      trigger: ContentProjectionDemoView.lastActionLabel.recordSave,
                    }),
                    toolbarAction({
                      key: 'cancel',
                      content: () => 'Cancel',
                      trigger: ContentProjectionDemoView.lastActionLabel.recordCancel,
                    }),
                  ],
                }),
              () => p('The conditional projection is hidden.'),
            ),
            p('The same component, rendered directly:'),
            toolbarAction({
              key: 'direct',
              content: () => 'Direct action',
              trigger: ContentProjectionDemoView.lastActionLabel.recordDirect,
            }),
            button(
              'ContentProjectionDemoView.dialogOpen.open',
              {
                class: componentUi.button,
                'data-componentButton': 'primary',
                type: 'button',
                click: ContentProjectionDemoView.dialogOpen.open,
              },
              'Open the projected dialog',
            ),
          ],
        ),
        ifNode(
          'dialogVisible',
          ContentProjectionDemoView.dialogVisible,
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
                  trigger: ContentProjectionDemoView.dialogOpen.closeFromToolbar,
                }),
                toolbarAction({
                  key: 'confirm',
                  content: () => 'Confirm',
                  trigger: function* () {
                    yield* ContentProjectionDemoView.lastActionLabel.recordConfirm();
                    yield* ContentProjectionDemoView.dialogOpen.closeFromConfirmation();
                  },
                }),
              ],
            }),
          () => [],
        ),
      ]),
    ]),
);
