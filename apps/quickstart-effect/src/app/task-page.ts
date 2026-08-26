import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadTask, type TaskNotFound } from './task-domain';

const QuickstartTaskPage = craftComponent(
  'QuickstartTaskPage',
  {},
  function* () {
    const taskQuery = yield* queryEffect(
      'taskQuery',
      {
        method: (taskId: string) => taskId,
        loader: ({ params }) => loadTask(params),
      },
      ({ resource, exceptions }) => ({
        hasTask: craftComputed('hasTask', () => resource.hasValue()),
        hasTaskException: craftComputed('hasTaskException', function* () {
          return Boolean((yield* exceptions()).loader);
        }),
        title: craftComputed('title', function* () {
          return (yield* resource.value())?.title ?? 'Loading…';
        }),
        exception: craftComputed('exception', function* () {
          return (yield* exceptions()).loader as TaskNotFound | undefined;
        }),
        exceptionTag: craftComputed('exceptionTag', function* () {
          return (yield* exceptions()).loader?._tag ?? 'Unknown';
        }),
      }),
    );

    yield* taskQuery.call('task-1');
    return { taskQuery };
  },
  ({ taskQuery }) => [
    div({ class: 'quickstart' }, [
      heading(function* () {
        // Structural helpers are the reactive binding boundary for their content.
        // eslint-disable-next-line craft-ts/require-reactive-template-bindings
        return `EffectTS + CraftTS (${yield* taskQuery.status()})`;
      }),
      p('One Effect domain operation, one Layer, one Craft query.'),
      ifNode(taskQuery.isLoading, () => p('Loading task…')),
      ifNode(taskQuery.hasTask, () =>
        p(function* () {
          return `Task: ${yield* taskQuery.title()}`;
        }),
      ),
      ifNode(taskQuery.hasTaskException, () =>
        p([
          'Business error: ',
          span({ class: 'error' }, taskQuery.exceptionTag),
        ]),
      ),
      button(
        'reloadTask',
        { type: 'button', *click() { yield* taskQuery.call('task-1'); } },
        'Reload task',
      ),
    ]),
  ],
);

export default QuickstartTaskPage;
