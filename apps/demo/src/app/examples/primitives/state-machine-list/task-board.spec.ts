// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { beforeEach, describe, expect, it } from 'vitest';
import TaskBoardStateMachineList from './task-board';

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  const mounted = mountCraftComponent(
    TaskBoardStateMachineList,
    element,
    TestBed.inject(Injector),
  );
  TestBed.tick();
  return { element, mounted };
}

function rows(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>('li.row')];
}

function click(row: HTMLElement, name: string) {
  const button = row.querySelector<HTMLButtonElement>(
    `button[data-craft-name="${name}"]`,
  );
  expect(button, `no button named "${name}"`).not.toBeNull();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  TestBed.tick();
}

function badge(row: HTMLElement) {
  return row.querySelector('.badge')?.textContent?.trim();
}

function note(row: HTMLElement) {
  return row.querySelector<HTMLInputElement>('input[data-craft-name="task-note"]');
}

function type(row: HTMLElement, value: string) {
  const input = note(row);
  expect(input).not.toBeNull();
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  TestBed.tick();
}

describe('TaskBoardStateMachineList', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    sessionStorage.clear();
  });

  it('gives each row its own machine', () => {
    const { element, mounted } = mount();
    const [first, second, third] = rows(element);

    expect(rows(element)).toHaveLength(3);
    expect([first, second, third].map(badge)).toEqual(['todo', 'todo', 'todo']);

    click(second, 'task-start');

    // Only the row that was acted on moved.
    expect([first, second, third].map(badge)).toEqual(['todo', 'doing', 'todo']);

    mounted.destroy();
  });

  it('keeps one row’s history out of another’s', () => {
    const { element, mounted } = mount();
    const [first, second] = rows(element);

    click(first, 'task-start');
    click(first, 'task-finish');
    click(second, 'task-start');

    expect(first.textContent).toContain('moment 3/3');
    expect(second.textContent).toContain('moment 2/2');

    click(second, 'task-back');

    // The second row rewound; the first did not move.
    expect(badge(second)).toBe('todo');
    expect(badge(first)).toBe('done');
    expect(first.textContent).toContain('moment 3/3');

    mounted.destroy();
  });

  it('restores the note captured with the step it belongs to', () => {
    const { element, mounted } = mount();
    const [first] = rows(element);

    type(first, 'first pass');
    click(first, 'task-start');
    type(first, 'second pass');
    click(first, 'task-finish');

    expect(badge(first)).toBe('done');
    expect(note(first)?.value).toBe('second pass');

    click(first, 'task-back');

    expect(badge(first)).toBe('doing');
    expect(note(first)?.value).toBe('first pass');

    mounted.destroy();
  });

  it('anchors each history on the task id, across a reload', () => {
    const before = mount();
    const [, secondBefore] = rows(before.element);
    click(secondBefore, 'task-start');
    expect(badge(secondBefore)).toBe('doing');
    before.mounted.destroy();

    // A reload: new components, new machines, new primitives. Session storage
    // survives, and each history finds its own row again by task id.
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    const after = mount();
    const [firstAfter, secondAfter] = rows(after.element);

    // The row that had moved keeps its two recorded moments, plus the fresh
    // machine's own start — which is a different step, so it counts.
    expect(secondAfter.textContent).toContain('moment 3/3');

    // The untouched row starts exactly where it was recorded, so the reload
    // adds nothing: an identical moment is not a moment.
    expect(firstAfter.textContent).toContain('moment 1/1');

    click(secondAfter, 'task-back');

    expect(badge(secondAfter)).toBe('doing');

    after.mounted.destroy();
  });
});
