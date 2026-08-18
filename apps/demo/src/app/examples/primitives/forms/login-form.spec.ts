// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { beforeEach, describe, expect, it } from 'vitest';
import LoginFormComponent from './login-form';

describe('LoginFormComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('materializes selected fields so validators reach the DOM and block an empty submit', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      LoginFormComponent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const email = element.querySelector<HTMLInputElement>('#email');
    const password = element.querySelector<HTMLInputElement>('#password');

    expect(email?.required).toBe(true);
    expect(email?.classList.contains('craft-invalid')).toBe(true);
    expect(password?.required).toBe(true);
    expect(password?.minLength).toBe(6);
    expect(password?.classList.contains('craft-invalid')).toBe(true);

    email?.dispatchEvent(new Event('blur', { bubbles: true }));
    TestBed.tick();

    expect(element.textContent).toContain('Email is required.');
    expect(element.textContent).not.toContain('Password is required.');

    element
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true }),
      );
    TestBed.tick();

    expect(element.textContent).toContain('Email is required.');
    expect(element.textContent).toContain('Password is required.');
    expect(element.textContent).not.toContain('Login form submitted.');

    mounted.destroy();
  });
});
