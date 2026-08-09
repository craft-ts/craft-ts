// @vitest-environment jsdom
import '@angular/compiler';
import {
  ComponentLogicOutputOf,
  ComponentTemplateOf,
  TemplateNamedElementDelegatesToContext,
  TemplateNamedElementRendersStateWhen,
  TemplateRendersNamedElementWhen,
} from '@craft-ng/component';
import type { ResolvedServiceOutput } from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { describe } from 'vitest';
import FullDemoCraft, { TodoStore } from './full-demo';

describe('Full demo template', () => {
  type FullDemoLogic = ComponentLogicOutputOf<typeof FullDemoCraft>;
  type FullDemoTemplate = ComponentTemplateOf<typeof FullDemoCraft>;
  type TodoStoreOutput = ResolvedServiceOutput<typeof TodoStore, {}>;

  type _StoreIsTodoStoreOutput = Expect<
    Equal<FullDemoLogic['store'], TodoStoreOutput>
  >;

  type _DisplayNewTodoNameInput = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:input:TodoNameToAddInput'
      >,
      true
    >
  >;

  type _DisplayNewToDoSubmitButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:AddTodoButton'
      >,
      true
    >
  >;

  type _DisplayRemoveTodoButtonForEachTodo = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:RemoveTodoButton',
        { when: { 'store.todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;

  type _RemoveTodoButtonIsNotDisplayedForEmptyTodos = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:RemoveTodoButton',
        { when: { 'store.todos.value': 'empty' } }
      >,
      false
    >
  >;

  type _AddButtonIsDisabledByAddLoading = Expect<
    Equal<
      TemplateNamedElementRendersStateWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:AddTodoButton',
        'disabled',
        'store.add.isLoading'
      >,
      true
    >
  >;

  type _RemoveButtonIsDisabledByRemoveLoading = Expect<
    Equal<
      TemplateNamedElementRendersStateWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:RemoveTodoButton',
        'disabled',
        'store.remove.isLoading',
        { when: { 'store.todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;

  type _ClickDelegatesToAddMutation = Expect<
    Equal<
      TemplateNamedElementDelegatesToContext<
        FullDemoTemplate,
        'FullDemoCraft:button:AddTodoButton',
        'click',
        'store.add.mutate'
      >,
      true
    >
  >;

  type _TodoTitleIsRenderedForEachTodo = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:span:TodoTitle',
        { when: { 'store.todos.value': 'nonEmpty' } }
      >,
      true
    >
  >;
});
