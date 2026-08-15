// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  button,
  craftComponent,
  disclosureControl,
  div,
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

afterEach(() => {
  document.body.replaceChildren();
});

describe('disclosureControl', () => {
  it('links aria-expanded and aria-controls to the panel id', () => {
    const faq = disclosureControl('faq-1', true);
    const root = craftComponent(
      'disclosureOpen',
      {},
      () => ({}),
      () => [
        button(faq.button, 'What is Craft?'),
        div(faq.panel, 'A typed Angular framework.'),
      ],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const toggle = element.querySelector('button');
    const panel = element.querySelector('#faq-1-panel');
    expect(toggle?.id).toBe('faq-1-button');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-controls')).toBe('faq-1-panel');
    expect(toggle?.hasAttribute('data-open')).toBe(true);
    expect(panel?.hasAttribute('data-open')).toBe(true);
    expect(panel?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('hides the panel and drops data-open when closed', () => {
    const faq = disclosureControl('faq-1', false);
    const root = craftComponent(
      'disclosureClosed',
      {},
      () => ({}),
      () => [button(faq.button, 'Q'), div(faq.panel, 'A')],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const toggle = element.querySelector('button');
    const panel = element.querySelector('#faq-1-panel');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.hasAttribute('data-open')).toBe(false);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the toggle aria-disabled when disabled', () => {
    const faq = disclosureControl('faq-1', false, { disabled: true });
    expect(faq.button['aria-disabled']).toBe(true);
    expect(faq.button['data-disabled']).toBe(true);
  });
});
