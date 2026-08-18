// @vitest-environment jsdom
import {
  ComponentLogicOutputOf,
  ComponentTemplateOf,
  TemplateNamedElementDelegatesToContext,
  TemplateNamedElementRendersStateWhen,
  TemplateRendersNamedElementWhen,
} from '@craft-ts/component';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it } from 'vitest';
import FullDemo from './full-demo';

describe('Full demo template', () => {
  type FullDemoLogic = ComponentLogicOutputOf<typeof FullDemo>;
  type FullDemoTemplate = ComponentTemplateOf<typeof FullDemo>;

  type _ExposesTodoQueryAndMutations = Expect<
    Equal<
      FullDemoLogic extends {
        todos: unknown;
        addTodo: unknown;
        removeTodo: unknown;
      }
        ? true
        : false,
      true
    >
  >;

  type _DisplayNewTodoNameInput = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:input:TodoNameToAddInput'
      >,
      true
    >
  >;

  type _DisplayNewTodoSubmitButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:button:AddTodoButton'
      >,
      true
    >
  >;

  type _DisplayRemoveTodoButtonForEachTodo = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:button:RemoveTodoButton',
        { when: { 'todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;

  type _RemoveTodoButtonIsNotDisplayedForEmptyTodos = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:button:RemoveTodoButton',
        { when: { 'todos.value': 'empty' } }
      >,
      false
    >
  >;

  type _AddButtonIsDisabledByAddLoading = Expect<
    Equal<
      TemplateNamedElementRendersStateWhen<
        FullDemoTemplate,
        'FullDemo:button:AddTodoButton',
        'disabled',
        'addTodo.isLoading'
      >,
      true
    >
  >;

  type _RemoveButtonIsDisabledByRemoveLoading = Expect<
    Equal<
      TemplateNamedElementRendersStateWhen<
        FullDemoTemplate,
        'FullDemo:button:RemoveTodoButton',
        'disabled',
        'removeTodo.isLoading',
        { when: { 'todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;

  type _ClickDelegatesToAddMutation = Expect<
    Equal<
      TemplateNamedElementDelegatesToContext<
        FullDemoTemplate,
        'FullDemo:button:AddTodoButton',
        'click',
        'addTodo.mutate'
      >,
      true
    >
  >;

  type _TodoTitleIsRenderedForEachTodo = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:span:TodoTitle',
        { when: { 'todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;

  it('keeps the component template contract type-safe', () => {
    expect(true).toBe(true);
  });
});
