import { eventValue } from '../../../event-value';
import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  input,
  label,
  p,
  section,
  span,
} from '@craft-ts/component';
import {
  afterRecomputation,
  craftComputed,
  craftService,
  craftSleep,
  craftStateMachine,
  craftUnique,
  initStateMachine,
  insertReactOnMutation,
  insertQueryPipe,
  insertStatePipe,
  insertStateMachinePipe,
  mutation,
  on$,
  source$,
  state,
  query,
  transitionStep,
  withBackNavigation,
  withStateMachineHistory,
} from '@craft-ts/core';
import { example } from '../../shared/example.style';
import { editor } from './editor.style';

type Profile = {
  name: string;
  email: string;
};

const INITIAL_PROFILE: Profile = {
  name: 'Ada Lovelace',
  email: 'ada@craft-ts.dev',
};

/**
 * The read-only switch below is a real DI dependency of the machine's
 * source-driven save workflow, not a value the component passes in.
 */
const { ProfilePermissions } = craftService(
  { name: 'ProfilePermissions', providedIn: 'global' },
  function* () {
    const readOnly = yield* state('readOnly', false, ({ update }) => ({
      toggle: () => update((current) => !current),
    }));

    return { readOnly };
  },
);

const ProfileEditorStateMachine = craftComponent(
  'ProfileEditorStateMachine',
  {},
  function* () {
    const permissions = yield* ProfilePermissions();

    const machine = yield* craftStateMachine(
      'profileEditor',

      // 1. The machine's context: every primitive its steps and workflows use.
      function* () {
        const edit$ = yield* source$<void>('edit$');
        const cancel$ = yield* source$<void>('cancel$');
        const saveRequest$ = yield* source$<Profile>('saveRequest$');
        const restore$ = yield* source$<Profile>('restore$');

        const saveProfile = yield* mutation('saveProfile', {
          method: afterRecomputation(
            saveRequest$.value,
            (profile) => profile ?? INITIAL_PROFILE,
          ),
          loader: function* ({ params }) {
            yield* craftSleep(600, { owner: 'profile-editor-save' });
            return params;
          },
        });

        const profileQuery = yield* query(
          'profileQuery',
          {
            params: () => 'initial',
            loader: function* () {
              yield* craftSleep(300, { owner: 'profile-editor-load' });
              return { ...INITIAL_PROFILE };
            },
          },
          insertQueryPipe(
            insertReactOnMutation(saveProfile, {
              optimisticUpdate: ({ mutationParams }) => mutationParams,
              update: ({ mutationParams }) => mutationParams,
              reload: { onMutationException: true },
            }),
            ({ resource }) => ({
              profileSource: craftComputed('profileSource', function* () {
                return (yield* resource.value()) ?? INITIAL_PROFILE;
              }),
            }),
          ),
        );

        const draft = yield* state(
          'draft',
          profileQuery.profileSource,
          insertStatePipe(
            ({ set }) => ({
              restoreFromCancel: on$(restore$, (profile) => set(profile)),
            }),
            ({ update, state: current }) => ({
              setName: (name: string) =>
                update((profile) => ({ ...profile, name })),
              setEmail: (email: string) =>
                update((profile) => ({ ...profile, email })),
              isValid: craftComputed('isValid', function* () {
                const profile = yield* current();
                return (
                  profile.name.trim().length > 0 && profile.email.includes('@')
                );
              }),
            }),
          ),
        );

        return {
          profileQuery,
          draft,
          saveProfile,
          edit$,
          cancel$,
          saveRequest$,
          restore$,
        };
      },

      // 2. The transitions. Each key is the step the machine ENTERS, so
      // `transit()` inside a block targets that block's step. Resource actions
      // are driven by sources, not called from these transition callbacks.
      function* (context, transit) {
        return {
          reading: transitionStep(function* () {
            // No static initial state: the first accepted transit defines it.
            yield* initStateMachine(() => transit());

            // Leaving `saving` is not an event — it is the mutation settling.
            afterRecomputation(context.saveProfile.status, function* (status) {
              if (status === 'resolved') {
                yield* transit();
              }
            });

            yield* on$(context.cancel$, function* () {
              yield* transit();
            });
          }),

          editing: transitionStep(function* () {
            yield* on$(context.edit$, () => transit());
          }),

          saving: transitionStep(function* () {
            afterRecomputation(
              context.saveProfile.isLoading,
              function* (isLoading) {
                if (isLoading) {
                  yield* transit();
                }
              },
            );
          }),
        };
      },

      // 3. What each step works with, plus the copy the UI shows for it.
      function* (context) {
        return {
          reading: {
            hint: 'The saved profile is the source of truth. “Edit” opens the draft.',
            draft: context.draft,
          },
          editing: {
            hint: 'The draft is live. “Save” is validated before the source triggers the mutation.',
            draft: context.draft,
          },
          saving: {
            hint: 'The mutation is in flight. The machine returns to “reading” once it settles.',
            saveProfile: context.saveProfile,
          },
        };
      },

      // 4. The insertion: derived values, step flags, selectors over the step
      // context, and composed methods — the same shape state/query/mutation
      // insertions have. The history is not part of the machine core either:
      // `withStateMachineHistory` is just another insertion, merged in here.
      insertStateMachinePipe(
        withStateMachineHistory(
          {
            persist: craftUnique({ storeName: 'demo', key: 'profile-editor' }),
          },
          withBackNavigation(),
        ),
        ({ context, currentStep, currentStepWithContext, insertions }) => {
          const stepState = (step: string) =>
            craftComputed(`${step}Step`, function* () {
              return (yield* currentStep()) === step ? 'active' : null;
            });

          return {
            profileLabel: craftComputed('profileLabel', function* () {
              const profile =
                (yield* context.saveProfile.value()) ??
                (yield* context.profileQuery.value()) ??
                INITIAL_PROFILE;
              return `${profile.name} <${profile.email}>`;
            }),
            profileIsLoading: context.profileQuery.isLoading,
            draftName: craftComputed('draftName', function* () {
              return (yield* context.draft()).name;
            }),
            draftEmail: craftComputed('draftEmail', function* () {
              return (yield* context.draft()).email;
            }),
            readingStep: stepState('reading'),
            editingStep: stepState('editing'),
            savingStep: stepState('saving'),
            isReading: craftComputed('isReading', function* () {
              return (yield* currentStepWithContext()).step === 'reading';
            }),
            isEditing: craftComputed('isEditing', function* () {
              return (yield* currentStepWithContext()).step === 'editing';
            }),
            stepHint: craftComputed('stepHint', function* () {
              const current = yield* currentStepWithContext();
              return current.step === 'saving'
                ? ''
                : 'hint' in current && typeof current.hint === 'string'
                  ? current.hint
                  : '';
            }),
            submitBlocked: craftComputed('submitBlocked', function* () {
              return (
                !(yield* context.draft.isValid()) ||
                (yield* permissions.readOnly())
              );
            }),
            historyLabel: craftComputed('historyLabel', function* () {
              const entries = yield* insertions.history();
              const cursor = yield* insertions.historyCursor();
              return `step ${cursor + 1} of ${entries.length}`;
            }),
            backDisabled: craftComputed('backDisabled', function* () {
              return !(yield* insertions.canGoBack());
            }),
            forwardDisabled: craftComputed('forwardDisabled', function* () {
              return !(yield* insertions.canGoForward());
            }),
            requestEdit: () => context.edit$.emit(),
            requestCancel: function* () {
              const persisted =
                (yield* context.saveProfile.value()) ??
                (yield* context.profileQuery.value()) ??
                INITIAL_PROFILE;
              context.restore$.emit(persisted);
              context.cancel$.emit();
            },
            requestSubmit: function* () {
              const profile = yield* context.draft();
              if (
                !profile.name.trim() ||
                !profile.email.includes('@') ||
                (yield* permissions.readOnly())
              ) {
                return;
              }
              context.saveRequest$.emit(profile);
            },
            setName: function* (name: string) {
              yield* context.draft.setName(name);
            },
            setEmail: function* (email: string) {
              yield* context.draft.setEmail(email);
            },
          };
        },
      ),
    );

    return { machine, permissions };
  },
  ({ machine, permissions }) =>
    section({ class: example.card }, [
      heading({ class: example.title }, 'State machine — profile editor'),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'reading → editing → saving → reading. Every move goes through transit(), while the save is driven by reactive sources.',
      ),

      div({ class: editor.steps }, [
        span(
          { class: editor.step, 'data-editorStep': machine.readingStep },
          'reading',
        ),
        span(
          { class: editor.step, 'data-editorStep': machine.editingStep },
          'editing',
        ),
        span(
          { class: editor.step, 'data-editorStep': machine.savingStep },
          'saving',
        ),
      ]),

      p({ class: editor.hint }, machine.stepHint),

      ifNode(
        machine.isReading,
        () =>
          ifNode(
            machine.profileIsLoading,
            () =>
              div({ class: editor.loadingPanel }, [
                span({ class: example.spinner, 'aria-hidden': 'true' }),
                p('Loading profile…'),
              ]),
            () =>
              div({ class: editor.panel }, [
                p(['Saved profile: ', machine.profileLabel]),
                div({ class: example.row }, [
                  button(
                    'edit',
                    {
                      class: example.button,
                      'data-exampleButton': 'primary',
                      type: 'button',
                      click: machine.requestEdit,
                    },
                    'Edit',
                  ),
                ]),
              ]),
          ),
        () =>
          ifNode(
            machine.isEditing,
            () =>
              div({ class: editor.panel }, [
                div({ class: editor.field }, [
                  label(
                    'profile-name-label',
                    { class: editor.label, for: 'profile-name' },
                    'Name',
                  ),
                  input('profile-name', {
                    class: example.input,
                    'data-exampleField': 'wide',
                    id: 'profile-name',
                    type: 'text',
                    value: machine.draftName,
                    *input(event) {
                      yield* machine.setName(eventValue(event));
                    },
                  }),
                ]),
                div({ class: editor.field }, [
                  label(
                    'profile-email-label',
                    { class: editor.label, for: 'profile-email' },
                    'Email',
                  ),
                  input('profile-email', {
                    class: example.input,
                    'data-exampleField': 'wide',
                    id: 'profile-email',
                    type: 'email',
                    value: machine.draftEmail,
                    *input(event) {
                      yield* machine.setEmail(eventValue(event));
                    },
                  }),
                ]),
                ifNode(machine.submitBlocked, () =>
                  p(
                    { class: example.text, 'data-exampleText': 'error' },
                    'Save is blocked: the draft is invalid, or the profile is read-only.',
                  ),
                ),
                div({ class: example.row }, [
                  button(
                    'save',
                    {
                      class: example.button,
                      'data-exampleButton': 'primary',
                      type: 'button',
                      click: machine.requestSubmit,
                    },
                    'Save',
                  ),
                  button(
                    'cancel',
                    {
                      type: 'button',
                      class: example.button,
                      click: machine.requestCancel,
                    },
                    'Cancel',
                  ),
                ]),
              ]),
            () => div({ class: editor.panel }, [p('Saving…')]),
          ),
      ),

      div({ class: editor.toolbar }, [
        button(
          'history-back',
          {
            type: 'button',
            class: example.button,
            disabled: machine.backDisabled,
            click: machine.back,
          },
          '← Back',
        ),
        button(
          'history-forward',
          {
            type: 'button',
            class: example.button,
            disabled: machine.forwardDisabled,
            click: machine.forward,
          },
          'Forward →',
        ),
        span(machine.historyLabel),
      ]),

      div({ class: editor.toolbar }, [
        button(
          'toggle-read-only',
          {
            type: 'button',
            class: example.button,
            click: permissions.readOnly.toggle,
          },
          'Toggle read-only',
        ),
        ifNode(
          permissions.readOnly,
          () => span('read-only: on — saving is blocked'),
          () => span('read-only: off'),
        ),
      ]),
    ]),
);

export default ProfileEditorStateMachine;
