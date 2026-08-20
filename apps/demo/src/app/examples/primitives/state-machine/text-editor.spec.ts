// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import TextEditorStateMachine from './text-editor';

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  const mounted = mountCraftComponent(
    TextEditorStateMachine,
    element,
    TestBed.inject(Injector),
  );
  TestBed.tick();

  return { element, mounted };
}

function click(element: HTMLElement, name: string) {
  const button = element.querySelector<HTMLButtonElement>(
    `button[data-craft-name="${name}"]`,
  );
  expect(button, `no button named "${name}"`).not.toBeNull();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  TestBed.tick();
}

function type(element: HTMLElement, value: string) {
  const input = element.querySelector<HTMLInputElement>(
    'input[data-craft-name="text-input"]',
  );
  expect(input).not.toBeNull();
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  TestBed.tick();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('TextEditorStateMachine', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('commits a changed value and cancels a later draft', () => {
    const { element, mounted } = mount();

    click(element, 'text-edit');
    type(element, 'Hello');
    click(element, 'text-commit');

    expect(element.textContent).toContain('Committed value: Hello');
    expect(element.textContent).toContain('Current value: Hello');

    click(element, 'text-edit');
    type(element, 'Hello world');
    click(element, 'text-cancel');

    expect(element.textContent).toContain('Committed value: Hello');
    expect(element.textContent).toContain('Current value: Hello');

    mounted.destroy();
  });
});
