// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region task-form
import { craftService, state } from '@craft-ts/core';
import {
  cRequired,
  cMaxLength,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
} from '@craft-ts/core';

export const { TaskForm } = craftService(
  { name: 'TaskForm', scope: 'function' },
  function* () {
    const taskForm = yield* state(
      'taskForm',
      { title: '', notes: '' },
      insertForm(
        insertSelectFormTree(
          'title',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({
            validators: [cRequired(), cMaxLength(80)],
          })),
        ),
        insertSelectFormTree(
          'notes',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({ validators: [] })),
        ),
      ),
    );

    return taskForm;
  },
);
// #endregion task-form

describe('Learn 08 task form', () => {
  it('defines the documented TaskForm service', () => {
    expect(TaskForm).toEqual(expect.any(Function));
  });
});
