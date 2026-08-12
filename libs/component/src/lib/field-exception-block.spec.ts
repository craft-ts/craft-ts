// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  beforeAll,
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
  craftUse,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  state,
} from '@craft-ng/core';
import {
  craftComponent,
  div,
  fieldExceptionBlock,
  input,
  loadCraftComponent,
  mountCraftComponent,
  p,
} from '../index';
import type { CraftNodeChildrenFieldExceptions } from './render/vnode';
import type { ComponentFieldExceptionsOf } from './types';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('fieldExceptionBlock', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('carries and exhaustively removes local field validation cases', () => {
    TestBed.runInInjectionContext(() => {
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

  it('renders partial handlers locally and forwards residual cases to its parent boundary', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const control = element.querySelector(
      '#partial-password',
    ) as HTMLInputElement;
    const field = element.querySelector('#password-field') as HTMLElement;
    control.value = 'abc';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();

    expect(field.textContent).not.toContain('Local required');
    expect(field.textContent).not.toContain('Parent minimum 6');
    expect(element.textContent).toContain('Parent minimum 6');

    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();

    expect(field.textContent).toContain('Local required');
    expect(element.textContent).toContain('Parent minimum 6');
    const messageIds =
      control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(messageIds).toHaveLength(2);
    expect(
      messageIds.map((id) => element.querySelector(`#${id}`)?.textContent),
    ).toEqual(expect.arrayContaining(['Local required', 'Parent minimum 6']));
    mounted.destroy();
  });

  it('uses visibleExceptions by default and preserves the mounted control', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const control = element.querySelector('input') as HTMLInputElement;
    expect(element.textContent).not.toContain('Email is required.');

    control.value = 'valid';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();

    expect(element.querySelector('input')).toBe(control);
    expect(element.textContent).toContain('Email is required.');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    const messageId = control.getAttribute('aria-describedby');
    expect(messageId).toBeTruthy();
    expect(element.querySelector(`#${messageId}`)?.textContent).toContain(
      'Email is required.',
    );

    mounted.destroy();
  });

  it('supports a touched visibility override and restores existing aria attributes', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const control = element.querySelector('input') as HTMLInputElement;
    expect(element.textContent).not.toContain('Touched error');
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    TestBed.tick();

    expect(element.textContent).toContain('Touched error');
    expect(control.getAttribute('aria-describedby')).toContain('existing-hint');

    mounted.destroy();
    expect(control.getAttribute('aria-invalid')).toBe('grammar');
    expect(control.getAttribute('aria-describedby')).toBe('existing-hint');
  });

  it('handles multiple fields by path at the component boundary', () => {
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

    const element = host();
    const mounted = mountCraftComponent(
      safe,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const email = element.querySelector('#email') as HTMLInputElement;
    const password = element.querySelector('#password') as HTMLInputElement;
    email.value = 'valid@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'long-enough';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    email.value = '';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = '';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();

    expect(element.textContent).toContain('Email required');
    expect(element.textContent).toContain('Password required');
    expect(element.querySelector('#email')).toBe(email);
    expect(element.querySelector('#password')).toBe(password);
    mounted.destroy();
  });
});
