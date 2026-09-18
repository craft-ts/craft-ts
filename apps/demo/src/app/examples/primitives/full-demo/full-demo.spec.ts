// @vitest-environment jsdom
import {
  ComponentTemplateOf,
  TemplateNamedElementDelegatesToContext,
  TemplateNamedElementRendersStateWhen,
  TemplateRendersNamedElementWhen,
} from '@craft-ts/component';
import type { GetServiceOutput } from '@craft-ts/core';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it } from 'vitest';
import FullDemo, { FullDemoView } from './full-demo';

describe('Full demo template', () => {
  type FullDemoLogic = GetServiceOutput<typeof FullDemoView>;
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
        { when: { value: 'nonEmpty' } }
      >,
      true
    >
  >;

  type _RemoveTodoButtonIsNotDisplayedForEmptyTodos = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:button:RemoveTodoButton',
        { when: { value: 'empty' } }
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
        { when: { value: 'nonEmpty' } }
      >,
      true
    >
  >;

  type _SubmitDelegatesToAddMutation = Expect<
    Equal<
      TemplateNamedElementDelegatesToContext<
        FullDemoTemplate,
        'FullDemo:form:AddTodoForm',
        'submit',
        'titleForm.form.submit'
      >,
      true
    >
  >;

  type _TodoTitleIsRenderedForEachTodo = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemo:span:TodoTitle',
        { when: { value: 'nonEmpty' } }
      >,
      true
    >
  >;

  it('keeps the component template contract type-safe', () => {
    expect(true).toBe(true);
  });
});
