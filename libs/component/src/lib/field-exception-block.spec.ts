// @vitest-environment jsdom
import {
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import {
  CraftFieldDirective,
  cEmail,
  cMinLength,
  cRequired,
  cValidate,
  craftException,
  craftUse,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  setupCraftServiceTest,
  state,
} from '@craft-ng/core';
import {
  craftComponent,
  div,
  fieldExceptionBlock,
  input,
  loadCraftComponent,
  p,
} from '../index';
import { renderCraftComponent } from './testing';
import type { CraftNodeChildrenFieldExceptions } from './render/vnode';
import type { ComponentFieldExceptionsOf } from './types';

describe('fieldExceptionBlock', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('carries and exhaustively removes local field validation cases', () => {
    const { injector } = setupCraftServiceTest();
    injector.run(() => {
      const formState = craftUse(
        state(
          'typedEmail',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired(), cEmail()],
            })),
          ),
        ),
      );
      const field = input({ type: 'email' }).pipe(
        CraftFieldDirective(formState.form),
      );
      expectTypeOf<
        CraftNodeChildrenFieldExceptions<typeof field>
      >().not.toEqualTypeOf<never>();
      const partial = field.pipe(
        fieldExceptionBlock.partial({
          required: () => p('Required'),
        }),
      );
      expectTypeOf<
        CraftNodeChildrenFieldExceptions<typeof partial>
      >().not.toEqualTypeOf<never>();
      const _caught = partial.pipe(
        fieldExceptionBlock.exhaustive({
          email: () => p('Invalid email'),
        }),
      );
      expectTypeOf<
        CraftNodeChildrenFieldExceptions<typeof _caught>
      >().toEqualTypeOf<never>();

      field.pipe(
        // @ts-expect-error unreachable partial handler: minLength
        fieldExceptionBlock.partial({
          minLength: () => p('Impossible'),
        }),
      );
      field.pipe(
        // @ts-expect-error missing local handler: email
        fieldExceptionBlock.exhaustive({
          required: () => p('Required'),
        }),
      );
      field.pipe(
        // @ts-expect-error unreachable local handler: minLength
        fieldExceptionBlock.exhaustive({
          required: () => p('Required'),
          email: () => p('Invalid email'),
          minLength: () => p('Impossible'),
        }),
      );
    });
  });

  it('renders partial handlers locally and forwards residual cases to its parent boundary', async () => {
    const component = craftComponent(
      'partialFieldExceptionBoundary',
      {},
      function* () {
        return yield* state(
          'password',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired(), cMinLength({ minLength: 6 })],
            })),
          ),
        );
      },
      ({ form }) =>
        div({ id: 'password-field' }, [
          input({ id: 'partial-password' })
            .pipe(CraftFieldDirective(form))
            .pipe(
              fieldExceptionBlock.partial({
                required: () => p('Local required'),
              }),
            ),
        ]).pipe(
          fieldExceptionBlock.exhaustive({
            minLength: ({ exception }) =>
              p(`Parent minimum ${exception.payload}`),
          }),
        ),
    );
    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      component,
    );

    const control = element.querySelector(
      '#partial-password',
    ) as HTMLInputElement;
    const field = element.querySelector('#password-field') as HTMLElement;
    control.value = 'abc';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(element.textContent).not.toContain('Parent minimum 6');
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    expect(field.textContent).not.toContain('Local required');
    expect(field.textContent).not.toContain('Parent minimum 6');
    expect(element.textContent).toContain('Parent minimum 6');

    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(field.textContent).toContain('Local required');
    expect(element.textContent).toContain('Parent minimum 6');
    const messageIds =
      control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(messageIds).toHaveLength(2);
    expect(
      messageIds.map((id) => element.querySelector(`#${id}`)?.textContent),
    ).toEqual(expect.arrayContaining(['Local required', 'Parent minimum 6']));
    destroy();
  });

  it('uses visibleExceptions by default and preserves the mounted control', async () => {
    const component = craftComponent(
      'fieldExceptionDefaultVisibility',
      {},
      function* () {
        return yield* state(
          'email',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({ validators: [cRequired()] })),
          ),
        );
      },
      ({ form }) =>
        input({ id: 'email' })
          .pipe(CraftFieldDirective(form))
          .pipe(
            fieldExceptionBlock.exhaustive({
              required: () => p('Email is required.'),
            }),
          ),
    );
    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      component,
    );

    const control = element.querySelector('input') as HTMLInputElement;
    expect(element.textContent).not.toContain('Email is required.');

    control.value = 'valid';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(element.querySelector('input')).toBe(control);
    expect(element.textContent).not.toContain('Email is required.');
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();
    expect(element.textContent).toContain('Email is required.');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    const messageId = control.getAttribute('aria-describedby');
    expect(messageId).toBeTruthy();
    expect(element.querySelector(`#${messageId}`)?.textContent).toContain(
      'Email is required.',
    );

    destroy();
  });

  it('supports a touched visibility override and restores existing aria attributes', async () => {
    const component = craftComponent(
      'fieldExceptionTouchedVisibility',
      {},
      function* () {
        return yield* state(
          'email',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({ validators: [cRequired()] })),
          ),
        );
      },
      ({ form }) =>
        input({
          id: 'email',
          'aria-invalid': 'grammar',
          'aria-describedby': 'existing-hint',
        })
          .pipe(CraftFieldDirective(form))
          .pipe(
            fieldExceptionBlock.exhaustive(
              { required: () => p('Touched error') },
              { visibility: { anyOf: ['touched'] } },
            ),
          ),
    );
    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      component,
    );

    const control = element.querySelector('input') as HTMLInputElement;
    expect(element.textContent).not.toContain('Touched error');
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    expect(element.textContent).toContain('Touched error');
    expect(control.getAttribute('aria-describedby')).toContain('existing-hint');

    destroy();
    expect(control.getAttribute('aria-invalid')).toBe('grammar');
    expect(control.getAttribute('aria-describedby')).toBe('existing-hint');
  });

  it('handles multiple fields by path at the component boundary', async () => {
    const unsafe = craftComponent(
      'fieldExceptionComponentBoundary',
      {},
      function* () {
        return yield* state(
          'credentials',
          { email: '', password: '' },
          insertForm(
            insertSelectFormTree(
              'email',
              insertNoopTypingAnchor,
              insertFormAttributes(() => ({
                validators: [cRequired(), cEmail()],
              })),
            ),
            insertSelectFormTree(
              'password',
              insertNoopTypingAnchor,
              insertFormAttributes(() => ({
                validators: [cRequired(), cMinLength({ minLength: 6 })],
              })),
            ),
          ),
        );
      },
      ({ form }) =>
        div([
          input({ id: 'email' }).pipe(CraftFieldDirective(form.selectEmail())),
          input({ id: 'password' }).pipe(
            CraftFieldDirective(form.selectPassword()),
          ),
        ]),
    );
    expectTypeOf<
      ComponentFieldExceptionsOf<typeof unsafe>
    >().not.toEqualTypeOf<never>();
    // @ts-expect-error residual field exceptions must be handled before use
    div([unsafe({})]);
    // @ts-expect-error residual field exceptions must be handled before routing
    loadCraftComponent(async () => unsafe);
    // @ts-expect-error a retried lazy import must preserve the same route boundary
    loadCraftComponent(({ withRetry }) =>
      withRetry(Promise.resolve({ default: unsafe })).then(
        ({ default: component }) => component,
      ),
    );

    const safe = unsafe.pipe(
      fieldExceptionBlock.exhaustive(
        {
          email: {
            required: () => p('Email required'),
            email: () => p('Email invalid'),
          },
          password: {
            required: () => p('Password required'),
            minLength: ({ exception, path }) => {
              const payload: number = exception.payload;
              const exactPath: 'password' = path;
              void payload;
              void exactPath;
              return p('Password too short');
            },
          },
        },
        { mode: 'all', position: 'after' },
      ),
    );
    expectTypeOf<
      ComponentFieldExceptionsOf<typeof safe>
    >().toEqualTypeOf<never>();
    loadCraftComponent(async () => safe);

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      safe,
    );

    let email = element.querySelector('#email') as HTMLInputElement;
    let password = element.querySelector('#password') as HTMLInputElement;
    email.value = 'valid@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'long-enough';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    email = element.querySelector('#email') as HTMLInputElement;
    password = element.querySelector('#password') as HTMLInputElement;
    email.value = '';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = '';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(element.textContent).not.toContain('Email required');
    expect(element.textContent).not.toContain('Password required');

    email = element.querySelector('#email') as HTMLInputElement;
    password = element.querySelector('#password') as HTMLInputElement;
    email.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    expect(element.textContent).toContain('Email required');
    expect(element.textContent).not.toContain('Password required');

    password.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    expect(element.textContent).toContain('Password required');
    expect(element.querySelector('#email')).toBe(email);
    expect(element.querySelector('#password')).toBe(password);
    destroy();
  });

  it('carries and renders group validation cases declared by component logic without a group DOM binding', async () => {
    function* registrationFactory() {
      const registration = yield* state(
        'registration',
        {
          credentials: {
            password: 'secret',
            confirmation: 'different',
          },
        },
        insertForm(
          insertSelectFormTree(
            'credentials',
            insertNoopTypingAnchor,
            insertFormAttributes(({ field }) => ({
              validators: [
                cValidate({
                  name: 'passwordsMatch',
                  validWhen: () =>
                    field.value().password === field.value().confirmation,
                  exception: () =>
                    craftException({ code: 'passwordMismatch' }, undefined),
                }),
              ],
            })),
          ),
        ),
      );
      const credentials = registration.form.selectCredentials();
      return { registration, credentials };
    }

    const unsafe = craftComponent(
      'groupFieldExceptionFromLogic',
      {},
      registrationFactory,
      ({ credentials }) =>
        div([
          input({ id: 'group-password' }).pipe(
            CraftFieldDirective(credentials.password),
          ),
          input({ id: 'group-confirmation' }).pipe(
            CraftFieldDirective(credentials.confirmation),
          ),
        ]),
    );

    expectTypeOf<
      ComponentFieldExceptionsOf<typeof unsafe>
    >().not.toEqualTypeOf<never>();
    // @ts-expect-error the group exception declared by logic is still unhandled
    loadCraftComponent(async () => unsafe);

    const safeAtComponentBoundary = unsafe.pipe(
      fieldExceptionBlock.exhaustive({
        credentials: {
          passwordMismatch: () => p('Passwords do not match.'),
        },
      }),
    );
    expectTypeOf<
      ComponentFieldExceptionsOf<typeof safeAtComponentBoundary>
    >().toEqualTypeOf<never>();

    const safeInTemplate = craftComponent(
      'groupFieldExceptionHandledInTemplate',
      {},
      registrationFactory,
      ({ credentials }) =>
        div([
          input({ id: 'group-password' }).pipe(
            CraftFieldDirective(credentials.password),
          ),
          input({ id: 'group-confirmation' }).pipe(
            CraftFieldDirective(credentials.confirmation),
          ),
        ]).pipe(
          fieldExceptionBlock.exhaustive({
            credentials: {
              passwordMismatch: () => p('Passwords do not match.'),
            },
          }),
        ),
    );
    expectTypeOf<
      ComponentFieldExceptionsOf<typeof safeInTemplate>
    >().toEqualTypeOf<never>();

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      safeInTemplate,
    );

    expect(element.textContent).not.toContain('Passwords do not match.');
    const password = element.querySelector(
      '#group-password',
    ) as HTMLInputElement;
    password.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    expect(element.textContent).toContain('Passwords do not match.');
    destroy();
  });
});
