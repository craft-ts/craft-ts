// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileEditorStateMachine from './profile-editor';

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  const mounted = mountCraftComponent(
    ProfileEditorStateMachine,
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

function field(element: HTMLElement, name: string) {
  return element.querySelector<HTMLInputElement>(
    `input[data-craft-name="${name}"]`,
  );
}

function type(element: HTMLElement, name: string, value: string) {
  const input = field(element, name);
  expect(input, `no input named "${name}"`).not.toBeNull();
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  TestBed.tick();
}

function activeStep(element: HTMLElement) {
  return element.querySelector('.step--active')?.textContent?.trim();
}

describe('ProfileEditorStateMachine', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    // The machine persists its history in session storage, so a fresh test
    // starts from a fresh one.
    sessionStorage.clear();
  });

  it('starts in reading, the step initStateMachine transits to', () => {
    const { element, mounted } = mount();

    expect(activeStep(element)).toBe('reading');
    expect(element.textContent).toContain('Ada Lovelace');

    mounted.destroy();
  });

  it('moves to editing on the edit source and back on cancel', () => {
    const { element, mounted } = mount();

    click(element, 'edit');
    expect(activeStep(element)).toBe('editing');
    expect(field(element, 'profile-name')?.value).toBe('Ada Lovelace');

    click(element, 'cancel');
    expect(activeStep(element)).toBe('reading');

    mounted.destroy();
  });

  it('refuses the saving transition while the profile is read-only', () => {
    const { element, mounted } = mount();

    click(element, 'toggle-read-only');
    click(element, 'edit');
    expect(activeStep(element)).toBe('editing');

    click(element, 'save');

    // The attempt guard resolved ProfilePermissions and said no.
    expect(activeStep(element)).toBe('editing');
    expect(element.textContent).toContain('A guard will refuse this transition');

    // ProfilePermissions is a global craft service: hand it back the way the
    // next test expects to find it.
    click(element, 'toggle-read-only');
    mounted.destroy();
  });

  it('refuses the saving transition while the draft is invalid', () => {
    const { element, mounted } = mount();

    click(element, 'edit');
    type(element, 'profile-name', '   ');

    expect(element.textContent).toContain('A guard will refuse this transition');

    click(element, 'save');

    expect(activeStep(element)).toBe('editing');

    mounted.destroy();
  });

  it('moves to saving on a valid submit', () => {
    const { element, mounted } = mount();

    click(element, 'edit');
    type(element, 'profile-name', 'Grace Hopper');

    click(element, 'save');

    expect(activeStep(element)).toBe('saving');

    mounted.destroy();
  });

  it('returns to reading once the save mutation settles', async () => {
    vi.useFakeTimers();
    const { element, mounted } = mount();

    click(element, 'edit');
    type(element, 'profile-name', 'Grace Hopper');
    click(element, 'save');
    expect(activeStep(element)).toBe('saving');

    // Nothing listens for a "save finished" event: the `reading` step watches
    // the mutation's own status through afterRecomputation.
    await vi.advanceTimersByTimeAsync(700);
    TestBed.tick();

    expect(activeStep(element)).toBe('reading');
    expect(element.textContent).toContain('Grace Hopper');

    mounted.destroy();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('ProfileEditorStateMachine history', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    // The machine persists its history in session storage, so a fresh test
    // starts from a fresh one.
    sessionStorage.clear();
  });

  it('records each step and rewinds the machine and its draft', () => {
    const { element, mounted } = mount();

    expect(element.textContent).toContain('step 1 of 1');

    click(element, 'edit');
    type(element, 'profile-name', 'Grace Hopper');
    click(element, 'save');

    expect(activeStep(element)).toBe('saving');
    expect(element.textContent).toContain('step 3 of 3');

    click(element, 'history-back');

    // The step AND the value it was captured with come back together.
    expect(activeStep(element)).toBe('editing');
    expect(field(element, 'profile-name')?.value).toBe('Ada Lovelace');
    expect(element.textContent).toContain('step 2 of 3');

    click(element, 'history-forward');

    expect(activeStep(element)).toBe('saving');
    expect(element.textContent).toContain('step 3 of 3');

    mounted.destroy();
  });
});

describe('ProfileEditorStateMachine persisted history', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    sessionStorage.clear();
  });

  it('carries its history across a reload and rewinds into it', () => {
    const before = mount();
    click(before.element, 'edit');
    type(before.element, 'profile-name', 'Grace Hopper');
    click(before.element, 'save');
    expect(activeStep(before.element)).toBe('saving');
    before.mounted.destroy();

    // A reload: the DOM and every primitive are rebuilt from scratch, but
    // session storage survives.
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    const after = mount();

    expect(after.element.textContent).toContain('of 4');
    expect(activeStep(after.element)).toBe('reading');

    click(after.element, 'history-back');

    expect(activeStep(after.element)).toBe('saving');

    after.mounted.destroy();
  });
});
