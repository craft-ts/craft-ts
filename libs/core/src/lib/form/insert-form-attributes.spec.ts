import {
  computed,
  signal,
} from '../host/craft-compat';
import { craftException } from '../craft-exception';
import { provideFnWrapper } from '../fn-wrapper';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { craftPipe } from '../craft-pipe';
import { state } from '../state';
import { insertForm } from './insert-form';
import { formAttributes, insertFormAttributes } from './insert-form-attributes';
import {
  insertSelectFormTree,
  selectFormTree,
} from './insert-select-form-tree';
import { cEmail, cMinLength, cRequired, cValidator } from './validator';
import { craftUse } from '../craft-use';
import { craftService, type CraftServiceProvider } from '../craft-service';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from '../setup-craft-service-test';

const { FormAttributesSpecHost } = craftService(
  { name: 'FormAttributesSpecHost', scope: 'global' },
  () => ({}),
);

const runInInjectionContext = <T>(
  fn: () => T,
  extraProviders: CraftServiceProvider[] = [],
): T => {
  const { injector } =
    extraProviders.length === 0
      ? setupCraftServiceTest()
      : setupCraftServiceTest(FormAttributesSpecHost, {}, {
          providers: extraProviders,
        });
  lastInjector = injector;
  return injector.run(fn);
};
let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const flushHost = () => flushCraftTest(lastInjector);

describe('insertFormAttributes', () => {
  it('binds disable, hidden and readonly signals to the field', async () => {
    await runInInjectionContext(async () => {
      const disabled = signal(false);
      const hidden = signal(false);
      const readonly = signal(false);

      const fieldForm = craftUse(
        state(
          'fieldForm',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              disable: disabled.asReadonly(),
              hidden: hidden.asReadonly(),
              readonly: readonly.asReadonly(),
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.disabled())).toBe(false);
      expect(craftUse(fieldForm.form.hidden())).toBe(false);
      expect(craftUse(fieldForm.form.readonly())).toBe(false);

      disabled.set(true);
      hidden.set(true);
      readonly.set(true);
      flushHost();

      expect(craftUse(fieldForm.form.disabled())).toBe(true);
      expect(craftUse(fieldForm.form.hidden())).toBe(true);
      expect(craftUse(fieldForm.form.readonly())).toBe(true);
    });
  });

  it('composes with insertSelectFormTree on a nested form tree', async () => {
    await runInInjectionContext(async () => {
      const hidden = signal(false);

      const profileForm = craftUse(
        state(
          'profileForm',
          {
            profile: {
              name: 'romain',
            },
          },
          insertForm(
            insertSelectFormTree('profile', (context) =>
              craftPipe(
                context,
                insertNoopTypingAnchor,
                insertFormAttributes(() => ({
                  hidden: hidden.asReadonly(),
                })),
              ),
            ),
          ),
        ),
      );

      const profile = profileForm.form.selectProfile();
      expect(profile?.hidden()).toBe(false);

      hidden.set(true);
      flushHost();

      expect(profile?.hidden()).toBe(true);
    });
  });

  it('aggregates sync validator exceptions into list and byValidator', async () => {
    await runInInjectionContext(async () => {
      const fieldState = signal<string>('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          fieldState,
          insertForm(
            insertFormAttributes(() => ({
              validators: [
                cRequired(),
                cValidator({
                  name: 'hasAtSign',
                  validWhen: () =>
                    fieldState() === '' || fieldState().includes('@'),
                  exception: () =>
                    craftException(
                      { _tag: 'MISSING_AT' },
                      { message: 'Missing @' as const },
                    ),
                }),
              ],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.invalid())).toBe(true);
      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        cRequired: { _tag: 'required' },
      });

      fieldState.set('romain');
      flushHost();

      expect(craftUse(fieldForm.form.invalid())).toBe(true);
      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        hasAtSign: { _tag: 'MISSING_AT' },
      });

      fieldState.set('romain@example.com');
      flushHost();
      expect(craftUse(fieldForm.form.invalid())).toBe(false);
      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('runs validators when a global fn wrapper is provided', async () => {
    await runInInjectionContext(
      async () => {
        const fieldState = signal<string>('');
        const fieldForm = craftUse(
          state(
            'fieldForm',
            fieldState,
            insertForm(
              insertFormAttributes(() => ({
                validators: [cRequired()],
              })),
            ),
          ),
        );

        expect(craftUse(fieldForm.form.errors())[0]).toMatchObject({
          _tag: 'required',
        });

        fieldState.set('ok');
        flushHost();

        expect(craftUse(fieldForm.form.errors())).toEqual([]);
      },
      [
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    );
  });

  it('keeps exceptions hidden until the field is touched or submit is attempted', async () => {
    await runInInjectionContext(async () => {
      const fieldForm = craftUse(
        state(
          'fieldForm',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired()],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.exceptions()).list.length).toBe(1);
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(0);

      fieldForm.form.ɵmarkDirty();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(0);

      fieldForm.form.ɵmarkTouched();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(1);
    });
  });

  it('shares a touched visibility policy across all visible helpers', async () => {
    await runInInjectionContext(async () => {
      const fieldForm = craftUse(
        state(
          'touchedFieldForm',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired()],
              exceptionVisibility: { anyOf: ['touched', 'submitted'] },
            })),
          ),
        ),
      );

      fieldForm.form.ɵmarkDirty();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list).toHaveLength(0);
      expect(
        craftUse(fieldForm.form.visibleFirstLeftFailedValidation()),
      ).toBeUndefined();

      fieldForm.form.ɵmarkTouched();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list).toHaveLength(1);
      expect(
        craftUse(fieldForm.form.visibleFirstLeftFailedValidation()),
      ).toMatchObject({
        _tag: 'required',
      });

      fieldForm.form.reset();
      flushHost();
      expect(craftUse(fieldForm.form.touched())).toBe(false);
      expect(craftUse(fieldForm.form.visibleExceptions()).list).toHaveLength(0);
    });
  });

  describe('firstLeftFailedValidation / lastRightFailedValidation', () => {
    it('exposes the first left and last right failing validator exceptions', async () => {
      await runInInjectionContext(async () => {
        const fieldState = signal<string>('');
        const fieldForm = craftUse(
          state(
            'fieldForm',
            fieldState,
            insertForm(
              insertFormAttributes(() => ({
                validators: [
                  cRequired(),
                  cValidator({
                    name: 'hasAtSign',
                    validWhen: () =>
                      fieldState() === '' || fieldState().includes('@'),
                    exception: () => craftException({ _tag: 'MISSING_AT' }),
                  }),
                  cValidator({
                    name: 'minLen5',
                    validWhen: () => fieldState().length >= 5,
                    exception: () => craftException({ _tag: 'TOO_SHORT' }),
                  }),
                ],
              })),
            ),
          ),
        );

        // empty -> only cRequired fails
        expect(
          (
            craftUse(fieldForm.form.firstLeftFailedValidation()) as {
              _tag: string;
            }
          )?._tag,
        ).toBe('required');
        expect(
          (
            craftUse(fieldForm.form.lastRightFailedValidation()) as {
              _tag: string;
            }
          )?._tag,
        ).toBe('TOO_SHORT');

        // "ab" -> hasAtSign + minLen5 fail
        fieldState.set('ab');
        flushHost();
        expect(
          (
            craftUse(fieldForm.form.firstLeftFailedValidation()) as {
              _tag: string;
            }
          )?._tag,
        ).toBe('MISSING_AT');
        expect(
          (
            craftUse(fieldForm.form.lastRightFailedValidation()) as {
              _tag: string;
            }
          )?._tag,
        ).toBe('TOO_SHORT');

        // valid -> undefined
        fieldState.set('foo@bar.com');
        flushHost();
        expect(
          craftUse(fieldForm.form.firstLeftFailedValidation()),
        ).toBeUndefined();
        expect(
          craftUse(fieldForm.form.lastRightFailedValidation()),
        ).toBeUndefined();
      });
    });

    it('visible variants stay undefined until touched or submit attempted', async () => {
      await runInInjectionContext(async () => {
        const fieldForm = craftUse(
          state(
            'fieldForm',
            '' as string,
            insertForm(
              insertFormAttributes(() => ({
                validators: [cRequired()],
              })),
            ),
          ),
        );

        expect(
          craftUse(fieldForm.form.firstLeftFailedValidation()),
        ).toBeDefined();
        expect(
          craftUse(fieldForm.form.visibleFirstLeftFailedValidation()),
        ).toBeUndefined();
        expect(
          craftUse(fieldForm.form.visibleLastRightFailedValidation()),
        ).toBeUndefined();

        fieldForm.form.ɵmarkDirty();
        flushHost();
        expect(
          craftUse(fieldForm.form.visibleFirstLeftFailedValidation()),
        ).toBeUndefined();
        expect(
          craftUse(fieldForm.form.visibleLastRightFailedValidation()),
        ).toBeUndefined();

        fieldForm.form.ɵmarkTouched();
        flushHost();
        expect(
          craftUse(fieldForm.form.visibleFirstLeftFailedValidation()),
        ).toBeDefined();
        expect(
          craftUse(fieldForm.form.visibleLastRightFailedValidation()),
        ).toBeDefined();
      });
    });
  });

  it('skips validators when the field is hidden, disabled, or readonly', async () => {
    await runInInjectionContext(async () => {
      const hidden = signal(false);
      const fieldForm = craftUse(
        state(
          'fieldForm',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              hidden: hidden.asReadonly(),
              validators: [cRequired()],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.invalid())).toBe(true);

      hidden.set(true);
      flushHost();
      expect(craftUse(fieldForm.form.invalid())).toBe(false);
      expect(craftUse(fieldForm.form.exceptions()).list.length).toBe(0);
    });
  });

  describe('insertion factory context', () => {
    it('receives state, field, set/update/patch, submission controls and previous insertions', async () => {
      await runInInjectionContext(async () => {
        const seen: {
          insertionsHasUpperEmail?: boolean;
          upperEmail?: string;
          stateEmail?: string;
          fieldValueEmail?: string;
          validatedEmail?: string;
          formIdentifier?: unknown;
          submittingObservedInsideFactory?: boolean;
        } = {};

        const profileForm = craftUse(
          state(
            'profileForm',
            { email: 'romain@example.com' },
            insertForm(
              ({ state }) => ({
                upperEmail: computed(() =>
                  craftUse(state()).email.toUpperCase(),
                ),
              }),
              insertFormAttributes((context) => {
                seen.insertionsHasUpperEmail =
                  typeof (context.insertions as { upperEmail?: unknown })
                    .upperEmail === 'function';
                seen.upperEmail = (
                  context.insertions as { upperEmail: () => string }
                ).upperEmail();
                seen.stateEmail = craftUse(context.state()).email;
                seen.fieldValueEmail = context.field.value().email;
                seen.validatedEmail = context.validatedFormValue()?.email;
                seen.formIdentifier = context.formIdentifier;

                // setSubmitting toggles the controller state visible from within
                // the same insertion factory.
                context.setSubmitting(true);
                seen.submittingObservedInsideFactory = context.submitting();
                context.setSubmitting(false);

                // set/update/patch mutate through the field tree.
                context.set({ email: 'set@example.com' });
                return {};
              }),
            ),
          ),
        );

        expect(seen.insertionsHasUpperEmail).toBe(true);
        expect(seen.upperEmail).toBe('ROMAIN@EXAMPLE.COM');
        expect(seen.stateEmail).toBe('romain@example.com');
        expect(seen.fieldValueEmail).toBe('romain@example.com');
        expect(seen.validatedEmail).toBe('romain@example.com');
        expect(seen.formIdentifier).toBeUndefined();
        expect(seen.submittingObservedInsideFactory).toBe(true);

        // The set inside the factory propagated to the root state.
        expect(craftUse(profileForm())).toEqual({ email: 'set@example.com' });
        // submitting was reset back to false.
        expect(craftUse(profileForm.form.submitting())).toBe(false);
      });
    });

    it('chains insertion outputs through context.insertions', async () => {
      await runInInjectionContext(async () => {
        const f = craftUse(
          state(
            'f',
            { name: 'romain' },
            insertForm(
              ({ field }) => ({
                getNameUpper: () => field.value().name.toUpperCase(),
              }),
              insertFormAttributes(({ insertions }) => {
                // chained insertion output is reachable in subsequent insertions
                expect(
                  craftUse(
                    (
                      insertions as unknown as {
                        getNameUpper: () => Generator<unknown, string>;
                      }
                    ).getNameUpper(),
                  ),
                ).toBe('ROMAIN');
                return {};
              }),
            ),
          ),
        );

        expect(craftUse(f.form.getNameUpper())).toBe('ROMAIN');
      });
    });
  });

  describe('parallel forms', () => {
    it('registers independent validators per parallel entry', async () => {
      await runInInjectionContext(async () => {
        const usersForm = craftUse(
          state(
            'usersForm',
            [
              { id: 'a', email: '' },
              { id: 'b', email: 'b@bar.com' },
            ],
            insertForm(
              { identifier: ({ item }) => item.id },
              insertSelectFormTree('email', (context) =>
                craftPipe(
                  context,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [cRequired(), cEmail()],
                  })),
                ),
              ),
            ),
          ),
        );

        const userA = usersForm.select('a');
        const userB = usersForm.select('b');
        const emailA = userA?.selectEmail();
        const emailB = userB?.selectEmail();

        expect(emailA?.invalid()).toBe(true);
        expect(emailA?.exceptions().byValidator).toMatchObject({
          cRequired: { _tag: 'required' },
        });

        expect(emailB?.invalid()).toBe(false);
        expect(emailB?.exceptions()).toEqual({
          list: [],
          byValidator: {},
        });
      });
    });

    it('parallel entries receive their formIdentifier in the factory context', async () => {
      await runInInjectionContext(async () => {
        const seenIdentifiers: string[] = [];

        const usersForm = craftUse(
          state(
            'usersForm',
            [
              { id: 'a', email: 'a@a.com' },
              { id: 'b', email: 'b@b.com' },
            ],
            insertForm(
              { identifier: ({ item }) => item.id },
              insertSelectFormTree('email', (context) =>
                craftPipe(
                  context,
                  insertNoopTypingAnchor,
                  insertFormAttributes(({ formIdentifier }) => {
                    seenIdentifiers.push(formIdentifier);
                    return { validators: [cRequired()] };
                  }),
                ),
              ),
            ),
          ),
        );

        // Force materialization of both entries' sub-forms
        usersForm.select('a')?.selectEmail();
        usersForm.select('b')?.selectEmail();

        expect(seenIdentifiers.sort()).toEqual(['a', 'b']);
      });
    });
  });
});

describe('formAttributes', () => {
  it('binds disable, hidden and readonly signals to the field', async () => {
    await runInInjectionContext(async () => {
      const disabled = signal(false);
      const hidden = signal(false);
      const readonly = signal(false);

      const fieldForm = craftUse(
        state(
          'fieldForm',
          '' as string,
          insertForm((context) =>
            formAttributes(context, {
              disable: disabled.asReadonly(),
              hidden: hidden.asReadonly(),
              readonly: readonly.asReadonly(),
            }),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.disabled())).toBe(false);
      expect(craftUse(fieldForm.form.hidden())).toBe(false);
      expect(craftUse(fieldForm.form.readonly())).toBe(false);

      disabled.set(true);
      hidden.set(true);
      readonly.set(true);
      flushHost();

      expect(craftUse(fieldForm.form.disabled())).toBe(true);
      expect(craftUse(fieldForm.form.hidden())).toBe(true);
      expect(craftUse(fieldForm.form.readonly())).toBe(true);
    });
  });

  it('aggregates sync validator exceptions into list and byValidator', async () => {
    await runInInjectionContext(async () => {
      const fieldState = signal<string>('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          fieldState,
          insertForm((context) =>
            formAttributes(context, {
              validators: [
                cRequired(),
                cValidator({
                  name: 'hasAtSign',
                  validWhen: () =>
                    fieldState() === '' || fieldState().includes('@'),
                  exception: () =>
                    craftException(
                      { _tag: 'MISSING_AT' },
                      { message: 'Missing @' as const },
                    ),
                }),
              ],
            }),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.invalid())).toBe(true);
      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        cRequired: { _tag: 'required' },
      });

      fieldState.set('romain');
      flushHost();
      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        hasAtSign: { _tag: 'MISSING_AT' },
      });

      fieldState.set('romain@example.com');
      flushHost();
      expect(craftUse(fieldForm.form.invalid())).toBe(false);
    });
  });

  it('composes with selectFormTree to validate sibling properties of a flat form', async () => {
    await runInInjectionContext(async () => {
      type LoginData = { email: string; password: string };

      const loginForm = craftUse(
        state(
          'loginForm',
          { email: '', password: '' } satisfies LoginData,
          insertForm(
            (context) =>
              selectFormTree(context, 'email', (sub) =>
                formAttributes(sub, {
                  validators: [
                    cRequired(),
                    cEmail(),
                    cMinLength({ minLength: 5 }),
                  ],
                }),
              ),
            (context) =>
              selectFormTree(context, 'password', (sub) =>
                formAttributes(sub, { validators: [cRequired()] }),
              ),
          ),
        ),
      );

      const email = (
        loginForm.form as unknown as {
          selectEmail: () =>
            | {
                invalid: () => boolean;
                exceptions: () => { byValidator: Record<string, unknown> };
              }
            | undefined;
        }
      ).selectEmail();
      const password = (
        loginForm.form as unknown as {
          selectPassword: () => { invalid: () => boolean } | undefined;
        }
      ).selectPassword();

      expect(email?.invalid()).toBe(true);
      expect(password?.invalid()).toBe(true);
      expect(email?.exceptions().byValidator).toMatchObject({
        cRequired: { _tag: 'required' },
      });

      loginForm.form.email.set('not-an-email');
      flushHost();
      expect(email?.invalid()).toBe(true);

      loginForm.form.email.set('hello@world.com');
      loginForm.form.password.set('secret');
      flushHost();
      expect(email?.invalid()).toBe(false);
      expect(password?.invalid()).toBe(false);
    });
  });

  it('keeps formAttributes exceptions hidden until touched or submit is attempted', async () => {
    await runInInjectionContext(async () => {
      const fieldForm = craftUse(
        state(
          'fieldForm',
          '' as string,
          insertForm((context) =>
            formAttributes(context, { validators: [cRequired()] }),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.exceptions()).list.length).toBe(1);
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(0);

      fieldForm.form.ɵmarkDirty();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(0);

      fieldForm.form.ɵmarkTouched();
      flushHost();
      expect(craftUse(fieldForm.form.visibleExceptions()).list.length).toBe(1);
    });
  });

  it('receives the parallel formIdentifier in its context', async () => {
    await runInInjectionContext(async () => {
      const seenIdentifiers: string[] = [];

      const usersForm = craftUse(
        state(
          'usersForm',
          [
            { id: 'a', email: 'a@a.com' },
            { id: 'b', email: 'b@b.com' },
          ],
          insertForm({ identifier: ({ item }) => item.id }, (context) =>
            selectFormTree(context, 'email', (sub) => {
              seenIdentifiers.push(sub.formIdentifier);
              return formAttributes(sub, { validators: [cRequired()] });
            }),
          ),
        ),
      );

      usersForm.select('a')?.selectEmail();
      usersForm.select('b')?.selectEmail();

      expect(seenIdentifiers.sort()).toEqual(['a', 'b']);
    });
  });

  it('exposes firstLeftFailedValidation and lastRightFailedValidation', async () => {
    await runInInjectionContext(async () => {
      const fieldState = signal<string>('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          fieldState,
          insertForm((context) =>
            formAttributes(context, {
              validators: [
                cValidator({
                  name: 'hasAtSign',
                  validWhen: () => fieldState().includes('@'),
                  exception: () => craftException({ _tag: 'MISSING_AT' }),
                }),
                cValidator({
                  name: 'hasDot',
                  validWhen: () => fieldState().includes('.'),
                  exception: () => craftException({ _tag: 'MISSING_DOT' }),
                }),
              ],
            }),
          ),
        ),
      );

      expect(
        (
          craftUse(fieldForm.form.firstLeftFailedValidation()) as {
            _tag: string;
          }
        )?._tag,
      ).toBe('MISSING_AT');
      expect(
        (
          craftUse(fieldForm.form.lastRightFailedValidation()) as {
            _tag: string;
          }
        )?._tag,
      ).toBe('MISSING_DOT');

      fieldState.set('foo@bar.com');
      flushHost();
      expect(
        craftUse(fieldForm.form.firstLeftFailedValidation()),
      ).toBeUndefined();
      expect(
        craftUse(fieldForm.form.lastRightFailedValidation()),
      ).toBeUndefined();

      void computed(() => craftUse(fieldForm.form.firstLeftFailedValidation()));
    });
  });
});
