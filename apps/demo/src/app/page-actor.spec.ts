// @vitest-environment jsdom
import {
  button,
  craftComponent,
  each,
  input,
  mountCraftComponent,
} from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import LoginFormComponent from './examples/primitives/forms/login-form';
import {
  applyPageActions,
  assertPagePayloadSize,
  captureDomStyles,
  collectPageControls,
  PAGE_DOM_STYLES_MAX_BYTES,
  toCraftGotoTarget,
  toGotoUrl,
} from './page-actor';

describe('page actor', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('collects named login controls without a DOM tree', () => {
    const { element, destroy } = mount(LoginFormComponent);
    try {
      const controls = collectPageControls(element);
      expect(controls.map((control) => control.id).sort()).toEqual([
        'email',
        'password',
        'submit',
      ]);
      expect(controls.find((control) => control.id === 'email')).toMatchObject({
        role: 'textbox',
        enabled: true,
        index: 0,
      });
      expect(controls.find((control) => control.id === 'submit')).toMatchObject({
        role: 'button',
        name: 'Sign in',
      });
      expect(JSON.stringify(controls)).not.toContain('"tag"');
      expect(JSON.stringify(controls)).not.toContain('children');
    } finally {
      destroy();
    }
  });

  it('fills a CraftFieldDirective input and marks it touched', () => {
    const { element, destroy } = mount(LoginFormComponent);
    try {
      const result = applyPageActions(element, [
        { id: 'email', fill: 'ada@example.com' },
      ]);
      TestBed.tick();
      expect(result.error).toBeUndefined();
      const email = element.querySelector<HTMLInputElement>(
        '[data-craft-name="email"]',
      );
      expect(email?.value).toBe('ada@example.com');
      expect(email?.classList.contains('craft-touched')).toBe(true);
    } finally {
      destroy();
    }
  });

  it('fills a controlled input with a single input event', () => {
    const typed: string[] = [];
    const Search = craftComponent(
      'Search',
      {},
      () => ({}),
      () =>
        input('search', {
          type: 'search',
          'aria-label': 'Search',
          *input(event) {
            typed.push((event.target as HTMLInputElement).value);
          },
        }),
    );
    const { element, destroy } = mount(Search);
    try {
      applyPageActions(element, [{ id: 'search', fill: 'dune' }]);
      TestBed.tick();
      expect(typed).toEqual(['dune']);
      expect(
        element.querySelector<HTMLInputElement>('[data-craft-name="search"]')
          ?.value,
      ).toBe('dune');
    } finally {
      destroy();
    }
  });

  it('clicks a named button', () => {
    const clicks: number[] = [];
    const Counter = craftComponent(
      'Counter',
      {},
      () => ({}),
      () =>
        button(
          'increment',
          {
            type: 'button',
            *click() {
              clicks.push(1);
            },
          },
          'Increment',
        ),
    );
    const { element, destroy } = mount(Counter);
    try {
      applyPageActions(element, [{ id: 'increment' }]);
      TestBed.tick();
      expect(clicks).toEqual([1]);
    } finally {
      destroy();
    }
  });

  it('stops a batch on the first error and still returns controls', () => {
    const clicks: string[] = [];
    const Form = craftComponent(
      'Form',
      {},
      () => ({}),
      () => [
        input('email', { type: 'email', 'aria-label': 'Email' }),
        button(
          'save',
          {
            type: 'button',
            *click() {
              clicks.push('save');
            },
          },
          'Save',
        ),
      ],
    );
    const { element, destroy } = mount(Form);
    try {
      const result = applyPageActions(element, [
        { id: 'missing', fill: 'x' },
        { id: 'save' },
      ]);
      expect(result.error).toBe('control "missing" is not available');
      expect(result.controls.map((control) => control.id).sort()).toEqual([
        'email',
        'save',
      ]);
      expect(clicks).toEqual([]);
    } finally {
      destroy();
    }
  });

  it('rejects an ambiguous each control unless match.index is passed', () => {
    const removed: string[] = [];
    const List = craftComponent(
      'List',
      {},
      () => ({
        items: [
          { id: 'a', label: 'Ada' },
          { id: 'b', label: 'Ben' },
          { id: 'c', label: 'Cyd' },
        ],
      }),
      ({ items }) =>
        each(items, { track: (item) => item.id }, (item) =>
          button(
            'remove',
            {
              type: 'button',
              *click() {
                removed.push((yield* item()).id);
              },
            },
            function* () {
              return `Remove ${(yield* item()).label}`;
            },
          ),
        ),
    );
    const { element, destroy } = mount(List);
    try {
      const collected = collectPageControls(element);
      expect(collected.filter((control) => control.id === 'remove')).toEqual([
        expect.objectContaining({ index: 0, track: 'a' }),
        expect.objectContaining({ index: 1, track: 'b' }),
        expect.objectContaining({ index: 2, track: 'c' }),
      ]);
      expect(applyPageActions(element, [{ id: 'remove' }]).error).toBe(
        'control "remove" is ambiguous (3 instances); pass match.index or match.track',
      );
      applyPageActions(element, [{ id: 'remove', match: { index: 1 } }]);
      TestBed.tick();
      expect(removed).toEqual(['b']);
    } finally {
      destroy();
    }
  });

  it('rejects fill on a button and a disabled control', () => {
    const DisabledForm = craftComponent(
      'DisabledForm',
      {},
      () => ({}),
      () => [
        button('save', { type: 'button' }, 'Save'),
        input('email', {
          type: 'email',
          disabled: true,
          'aria-label': 'Email',
        }),
      ],
    );
    const { element, destroy } = mount(DisabledForm);
    try {
      expect(applyPageActions(element, [{ id: 'save', fill: 'x' }]).error).toBe(
        'fill is not supported on role "button"',
      );
      expect(
        applyPageActions(element, [{ id: 'email', fill: 'a@b.c' }]).error,
      ).toBe('control "email" is disabled');
    } finally {
      destroy();
    }
  });

  it('captures whitelisted styles including display:none nodes', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<p data-craft-name="title" style="color: rgb(1, 2, 3)">Hi</p><span style="display: none">secret</span>';
    document.body.append(host);
    const snapshot = captureDomStyles(host) as {
      children: Array<{
        tag: string;
        hidden?: boolean;
        styles?: Record<string, string>;
      }>;
    };
    const paragraph = snapshot.children.find((node) => node.tag === 'p');
    const hidden = snapshot.children.find((node) => node.tag === 'span');
    expect(paragraph?.styles).toEqual(
      expect.objectContaining({
        display: expect.any(String),
        color: expect.any(String),
      }),
    );
    expect(paragraph?.styles && 'margin' in paragraph.styles).toBe(false);
    expect(hidden?.hidden).toBe(true);
    expect(captureDomStyles(host, [])).toEqual(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.not.objectContaining({ styles: expect.anything() }),
        ]),
      }),
    );
  });

  it('rejects a dom-styles payload over the size cap', () => {
    expect(() =>
      assertPagePayloadSize('x'.repeat(PAGE_DOM_STYLES_MAX_BYTES + 1)),
    ).toThrow('dom-styles exceeds size cap');
  });

  it('does not apply goto to the DOM', () => {
    const host = document.createElement('div');
    const result = applyPageActions(host, [{ goto: '/login-form' }]);
    expect(result.error).toBe('goto "/login-form" cannot be applied to the DOM');
  });

  it('normalizes goto targets to an in-app path', () => {
    expect(toGotoUrl('/login-form')).toBe('/login-form');
    expect(toGotoUrl('login-form')).toBe('/login-form');
    expect(toGotoUrl('http://localhost:4200/login-form?x=1')).toBe(
      '/login-form?x=1',
    );
    expect(toCraftGotoTarget('/login-form')).toBe('login-form');
    expect(toCraftGotoTarget('/')).toBe('');
  });
});

function mount(component: Parameters<typeof mountCraftComponent>[0]) {
  const element = document.createElement('div');
  document.body.append(element);
  const mounted = mountCraftComponent(
    component,
    element,
    TestBed.inject(Injector),
  );
  TestBed.tick();
  return { element, destroy: () => mounted.destroy() };
}
