// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  craftComponent,
  fieldControl,
  fieldIds,
  input,
  label,
  mountCraftComponent,
  p,
} from '../index';

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

describe('fieldControl', () => {
  it('derives descriptionId from the input id', () => {
    expect(fieldIds('email')).toEqual({
      inputId: 'email',
      descriptionId: 'email-description',
    });
  });

  it('wires label htmlFor, input id, and aria-describedby', () => {
    const email = fieldControl('email');
    const root = craftComponent(
      'fieldControlBasic',
      {},
      () => ({}),
      () => [
        label(email.label, 'Email'),
        input({ ...email.input, type: 'email' }),
        p(email.description, 'We never share your email.'),
      ],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const control = element.querySelector('input');
    const labelEl = element.querySelector('label');
    const hint = element.querySelector('#email-description');
    expect(control?.id).toBe('email');
    expect(labelEl?.htmlFor).toBe('email');
    expect(control?.getAttribute('aria-describedby')).toBe('email-description');
    expect(hint?.textContent).toBe('We never share your email.');
  });

  it('sets aria-invalid and data-invalid when invalid is true', () => {
    const email = fieldControl('email', { invalid: true });
    const root = craftComponent(
      'fieldControlInvalid',
      {},
      () => ({}),
      () => input({ ...email.input, type: 'email' }),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const control = element.querySelector('input');
    expect(control?.getAttribute('aria-invalid')).toBe('true');
    expect(control?.hasAttribute('data-invalid')).toBe(true);
  });
});
