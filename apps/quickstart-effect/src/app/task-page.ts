import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
} from '@craft-ts/component';
import { craftService, craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadTask } from './task-domain';
import { taskPage } from './foundation.style';

export const { QuickstartTaskPageView, provideQuickstartTaskPageView } = craftService(
  { name: 'quickstartTaskPageView', providedIn: 'toProvide' },
  function* () {
    const taskQuery = yield* queryEffect(
      'taskQuery',
      {
        method: (taskId: string) => taskId,
        loader: ({ params }) => loadTask(params),
      },
    );

    yield* craftComputed('hasTask', () => taskQuery.resource.hasValue());
    yield* craftComputed('hasTaskException', function* () {
      return Boolean((yield* taskQuery.exceptions()).loader);
    });
    yield* craftComputed('title', function* () {
      return (yield* taskQuery.resource.value())?.title ?? 'Loading…';
    });
    yield* craftComputed('exception', function* () {
      return (yield* taskQuery.exceptions()).loader;
    });
    yield* craftComputed('exceptionTag', function* () {
      return (yield* taskQuery.exceptions()).loader?._tag ?? 'Unknown';
    });
    yield* craftComputed('taskStatus', function* () {
      return yield* taskQuery.status();
    });
    yield* taskQuery.call('task-1');
  },
);

const QuickstartTaskPage = craftComponent(
  'QuickstartTaskPage',
  { providers: [provideQuickstartTaskPageView()] },
  () =>
    div([
      heading([
        'EffectTS + CraftTS (',
        QuickstartTaskPageView.taskStatus,
        ')',
      ]),
      p('One Effect domain operation, one Layer, one Craft query.'),
      ifNode(
        'quickstart-loading',
        QuickstartTaskPageView.taskQuery.isLoading,
        () => p('Loading task…'),
      ),
      ifNode(
        'quickstart-has-task',
        QuickstartTaskPageView.hasTask,
        () => p(`Task: ${QuickstartTaskPageView.title}`),
      ),
      ifNode(
        'quickstart-task-exception',
        QuickstartTaskPageView.hasTaskException,
        () =>
          p([
            'Business error: ',
            span({ class: taskPage.error }, QuickstartTaskPageView.exceptionTag),
          ]),
      ),
      button(
        'reloadTask',
        {
          type: 'button',
          *click() {
            yield* QuickstartTaskPageView.taskQuery.call(undefined, 'task-1');
          },
        },
        'Reload task',
      ),
    ]),
);

export default QuickstartTaskPage;
