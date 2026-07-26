// @vitest-environment jsdom
import '@angular/compiler';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftService } from '@craft-ng/core';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { div, p, span } from './hyperscript';
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveLogicTest,
  setupCraftDirectiveTemplateTest,
} from './testing';
import type { HostRequiredLogic, HostTemplate, Input } from './types';

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

describe('Craft component and directive testing utilities', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('tests component logic with an isolated service register', async () => {
    const { LogicDependency } = craftService(
      { name: 'LogicDependency', scope: 'function' },
      () => ({ value: 'real' }),
    );
    const component = craftComponent(
      'logicTestComponent',
      {},
      function* (label: Input<string>) {
        const dependency = yield* LogicDependency();
        return { label, dependency };
      },
      () => p('template'),
    );

    const result = await setupCraftComponentLogicTest.byRegister(component, {
      args: [(() => 'logic') as Input<string>],
      register: {
        LogicDependency: { value: 'mock' },
      },
    });

    expect(result.context.label()).toBe('logic');
    expect(result.context.dependency.value).toBe('mock');
    expect(result.mocks.LogicDependency).toBeDefined();
    result.destroy();
  });

  it('tests a component template with direct context and child services', async () => {
    const { ChildDependency } = craftService(
      { name: 'ChildDependency', scope: 'function' },
      () => ({ label: 'child' }),
    );
    const child = craftComponent(
      'templateChild',
      {},
      function* () {
        return { dependency: yield* ChildDependency() };
      },
      ({ dependency }) => span(dependency.label),
    );
    const component = craftComponent(
      'templateTestComponent',
      { styles: '.template-root { color: red; }' },
      () => ({ label: 'ignored' }),
      ({ label }) => div({ class: 'template-root' }, [p(label), child()]),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: { label: 'direct context' },
      register: {
        ChildDependency: { label: 'mock child' },
      },
    });

    expect(result.nativeElement.textContent).toContain('direct context');
    expect(result.nativeElement.textContent).toContain('mock child');
    expect(
      result.nativeElement.querySelector('.template-root'),
    ).not.toBeNull();
    expect(document.querySelector('style[data-craft-sheet]')).not.toBeNull();
    result.destroy();
    expect(result.nativeElement.textContent).toBe('');
    expect(document.querySelector('style[data-craft-sheet]')).toBeNull();
  });

  it('tests directive logic separately from its base logic', async () => {
    const directive = craftDirective(
      'testDirective',
      {},
      (baseLogic: HostRequiredLogic<{ value: Input<string> }>) =>
        (value: Input<string>) => ({
          ...baseLogic(value),
          decorated: true,
        }),
      (baseTemplate: HostTemplate<{ value: Input<string> }>) => baseTemplate,
    );

    const result = await setupCraftDirectiveLogicTest.byRegister(directive, {
      baseLogic: (value: Input<string>) => ({ value }),
      args: [(() => 'directive') as Input<string>],
      register: {},
    });

    expect(result.context.value()).toBe('directive');
    expect(result.context.decorated).toBe(true);
    result.destroy();
  });

  it('mounts directive templates and supports context updates', async () => {
    const directive = craftDirective(
      'conditionalTestDirective',
      { styles: '.directive-root { color: blue; }' },
      (baseLogic) => baseLogic,
      (
        baseTemplate: HostTemplate<{ visible: () => boolean }>,
      ) => (_context) =>
        _context.visible() ? baseTemplate(_context) : p('hidden'),
    );
    const baseTemplate: HostTemplate<{ visible: () => boolean }> = (_context) =>
      div({ class: 'directive-root' }, 'visible');

    const initialContext: { visible: () => boolean } = {
      visible: () => true,
    };
    const result = await setupCraftDirectiveTemplateTest.byRegister(directive, {
      baseTemplate,
      context: initialContext,
      register: {},
    });

    expect(result.nativeElement.textContent).toBe('visible');
    result.updateContext({ visible: () => false });
    expect(result.nativeElement.textContent).toBe('hidden');
    result.destroy();
  });
});
