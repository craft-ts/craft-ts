// @vitest-environment jsdom
import {
  provideStorageService,
  SessionStorageService,
  TestBed,
  ɵInjector as Injector,
} from '@craft-ts/core';
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

function configureStorageService() {
  TestBed.configureTestingModule({
    providers: [
      provideStorageService(function* () {
        return yield* SessionStorageService();
      }),
    ],
  });
}

async function mountLoaded() {
  vi.useFakeTimers();
  const mounted = mount();
  await vi.advanceTimersByTimeAsync(300);
  TestBed.tick();
  return mounted;
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

afterEach(() => {
  vi.useRealTimers();
});

describe('ProfileEditorStateMachine', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    configureStorageService();
    // The machine persists its history in session storage, so a fresh test
    // starts from a fresh one.
    sessionStorage.clear();
  });

  it('shows a loader while the initial profile query is pending', async () => {
    vi.useFakeTimers();
    const { element, mounted } = mount();

    expect(activeStep(element)).toBe('reading');
    expect(element.textContent).toContain('Loading profile…');

    await vi.advanceTimersByTimeAsync(300);
    TestBed.tick();

    expect(element.textContent).toContain('Ada Lovelace');

    mounted.destroy();
  });

  it('moves to editing on the edit source and back on cancel', async () => {
    const { element, mounted } = await mountLoaded();

    click(element, 'edit');
    expect(activeStep(element)).toBe('editing');
    expect(field(element, 'profile-name')?.value).toBe('Ada Lovelace');

    click(element, 'cancel');
    expect(activeStep(element)).toBe('reading');

    mounted.destroy();
  });

  it('refuses the saving transition while the profile is read-only', async () => {
    const { element, mounted } = await mountLoaded();

    click(element, 'toggle-read-only');
    click(element, 'edit');
    expect(activeStep(element)).toBe('editing');

    click(element, 'save');

    // The source validation resolved ProfilePermissions and emitted nothing.
    expect(activeStep(element)).toBe('editing');
    expect(element.textContent).toContain('Save is blocked');

    // ProfilePermissions is a global craft service: hand it back the way the
    // next test expects to find it.
    click(element, 'toggle-read-only');
    mounted.destroy();
  });

  it('refuses the saving transition while the draft is invalid', async () => {
    const { element, mounted } = await mountLoaded();

    click(element, 'edit');
    type(element, 'profile-name', '   ');

    expect(element.textContent).toContain('Save is blocked');

    click(element, 'save');

    expect(activeStep(element)).toBe('editing');

    mounted.destroy();
  });

  it('moves to saving on a valid submit', async () => {
    const { element, mounted } = await mountLoaded();

    click(element, 'edit');
    type(element, 'profile-name', 'Grace Hopper');

    click(element, 'save');

    expect(activeStep(element)).toBe('saving');

    mounted.destroy();
  });

  it('returns to reading once the save mutation settles', async () => {
    vi.useFakeTimers();
    const { element, mounted } = await mountLoaded();

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
});

describe('ProfileEditorStateMachine history', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    configureStorageService();
    // The machine persists its history in session storage, so a fresh test
    // starts from a fresh one.
    sessionStorage.clear();
  });

  it('records each step and rewinds the machine and its draft', async () => {
    const { element, mounted } = await mountLoaded();

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
    configureStorageService();
    sessionStorage.clear();
  });

  it('carries its history across a reload and rewinds into it', async () => {
    const before = await mountLoaded();
    click(before.element, 'edit');
    type(before.element, 'profile-name', 'Grace Hopper');
    click(before.element, 'save');
    expect(activeStep(before.element)).toBe('saving');
    before.mounted.destroy();

    // A reload: the DOM and every primitive are rebuilt from scratch, but
    // session storage survives.
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    configureStorageService();
    const after = await mountLoaded();

    expect(after.element.textContent).toContain('of 4');
    expect(activeStep(after.element)).toBe('reading');

    click(after.element, 'history-back');

    expect(activeStep(after.element)).toBe('saving');

    after.mounted.destroy();
  });
});
