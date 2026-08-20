/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './profile-editor.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  heading,
  ifBlock,
  input,
  label,
  matchBlock,
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
  craftUse,
  initStateMachine,
  insertReactOnMutation,
  insertQueryPipe,
  insertStatePipe,
  insertStateMachinePipe,
  mutation,
  on$,
  SessionStorageService,
  source$,
  state,
  query,
  transitionStep,
  withBackNavigation,
  withHistory,
  type SignalSource,
} from '@craft-ts/core';

type Profile = {
  name: string;
  email: string;
};

type ProfileStep = 'reading' | 'editing' | 'saving';

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
  { stylesUrl: styles },
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
          method: saveRequest$.value as unknown as SignalSource<Profile>,
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
            yield* afterRecomputation(
              context.saveProfile.status,
              function* (status) {
                if (status === 'resolved') {
                  yield* transit();
                }
              },
            );

            yield* on$(context.cancel$, function* () {
              yield* transit();
            });
          }),

          editing: transitionStep(function* () {
            yield* on$(context.edit$, () => transit());
          }),

          saving: transitionStep(function* () {
            yield* afterRecomputation(
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
      // `withHistory` is just another insertion, merged in here.
      insertStateMachinePipe(
        function* (machineContext) {
          // The storage is resolved here, at the point of use, so the history's
          // browser dependency stays visible instead of hiding inside the feature.
          const storage = yield* SessionStorageService();
          return withHistory(
            {
              persist: { storeName: 'demo', key: 'profile-editor', storage },
            },
            withBackNavigation(),
          )(machineContext);
        },
        ({ context, currentStep, stepContext, insertions }) => {
          const stepClass = (step: string) =>
            craftComputed(`${step}Class`, function* () {
              return (yield* currentStep()) === step
                ? 'step step--active'
                : 'step';
            });

          return {
            stepState: craftComputed('stepState', function* () {
              return {
                step: ((yield* currentStep()) ?? 'reading') as ProfileStep,
              };
            }),
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
            readingClass: stepClass('reading'),
            editingClass: stepClass('editing'),
            savingClass: stepClass('saving'),
            stepHint: craftComputed('stepHint', function* () {
              return (yield* stepContext())?.hint ?? '';
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
            setName: (name: string) => craftUse(context.draft.setName(name)),
            setEmail: (email: string) =>
              craftUse(context.draft.setEmail(email)),
          };
        },
      ),
    );

    return { machine, permissions };
  },
  ({ machine, permissions }) =>
    section([
      heading('State machine — profile editor'),
      p(
        { class: 'intro' },
        'reading → editing → saving → reading. Every move goes through transit(), while the save is driven by reactive sources.',
      ),

      div({ class: 'steps' }, [
        span({ class: machine.readingClass }, 'reading'),
        span({ class: machine.editingClass }, 'editing'),
        span({ class: machine.savingClass }, 'saving'),
      ]),

      p({ class: 'hint' }, machine.stepHint),

      matchBlock.exhaustive(
        machine.stepState as unknown as () => { step: ProfileStep },
        'step',
        {
          reading: () =>
            ifBlock(
              machine.profileIsLoading,
              () =>
                div({ class: 'panel loading-panel' }, [
                  span({ class: 'spinner', 'aria-hidden': 'true' }),
                  p('Loading profile…'),
                ]),
              () =>
                div({ class: 'panel' }, [
                  p(['Saved profile: ', machine.profileLabel]),
                  div({ class: 'actions' }, [
                    button(
                      'edit',
                      {
                        type: 'button',
                        click: function* () {
                          yield* machine.requestEdit();
                        },
                      },
                      'Edit',
                    ),
                  ]),
                ]),
            ),
          editing: () =>
            div({ class: 'panel' }, [
              div({ class: 'field' }, [
                label('profile-name-label', { for: 'profile-name' }, 'Name'),
                input('profile-name', {
                  id: 'profile-name',
                  type: 'text',
                  value: machine.draftName,
                  *input(event) {
                    yield* machine.setName(
                      (event.target as HTMLInputElement).value,
                    );
                  },
                }),
              ]),
              div({ class: 'field' }, [
                label('profile-email-label', { for: 'profile-email' }, 'Email'),
                input('profile-email', {
                  id: 'profile-email',
                  type: 'email',
                  value: machine.draftEmail,
                  *input(event) {
                    yield* machine.setEmail(
                      (event.target as HTMLInputElement).value,
                    );
                  },
                }),
              ]),
              ifBlock(machine.submitBlocked, () =>
                p(
                  { class: 'blocked' },
                  'Save is blocked: the draft is invalid, or the profile is read-only.',
                ),
              ),
              div({ class: 'actions' }, [
                button(
                  'save',
                  {
                    type: 'button',
                    click: function* () {
                      yield* machine.requestSubmit();
                    },
                  },
                  'Save',
                ),
                button(
                  'cancel',
                  {
                    type: 'button',
                    class: 'secondary',
                    click: function* () {
                      yield* machine.requestCancel();
                    },
                  },
                  'Cancel',
                ),
              ]),
            ]),
          saving: () => div({ class: 'panel' }, [p('Saving…')]),
        },
      ),

      div({ class: 'history' }, [
        button(
          'history-back',
          {
            type: 'button',
            class: 'secondary',
            disabled: machine.backDisabled,
            click: function* () {
              yield* machine.back();
            },
          },
          '← Back',
        ),
        button(
          'history-forward',
          {
            type: 'button',
            class: 'secondary',
            disabled: machine.forwardDisabled,
            click: function* () {
              yield* machine.forward();
            },
          },
          'Forward →',
        ),
        span(machine.historyLabel),
      ]),

      div({ class: 'read-only' }, [
        button(
          'toggle-read-only',
          {
            type: 'button',
            class: 'secondary',
            click: function* () {
              yield* permissions.readOnly.toggle();
            },
          },
          'Toggle read-only',
        ),
        ifBlock(
          permissions.readOnly,
          () => span('read-only: on — saving is blocked'),
          () => span('read-only: off'),
        ),
      ]),
    ]),
);

export default ProfileEditorStateMachine;
