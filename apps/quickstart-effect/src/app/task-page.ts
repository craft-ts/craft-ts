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
      function* ({ resource, exceptions }) {
        return {
          hasTask: yield* craftComputed('hasTask', () => resource.hasValue()),
          hasTaskException: yield* craftComputed('hasTaskException', function* () {
            return Boolean((yield* exceptions()).loader);
          }),
          title: yield* craftComputed('title', function* () {
            return (yield* resource.value())?.title ?? 'Loading…';
          }),
          exception: yield* craftComputed('exception', function* () {
            return (yield* exceptions()).loader;
          }),
          exceptionTag: yield* craftComputed('exceptionTag', function* () {
            return (yield* exceptions()).loader?._tag ?? 'Unknown';
          }),
          taskStatus: yield* craftComputed('taskStatus', function* () {
            return yield* resource.status();
          }),
        };
      },
    );

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
        QuickstartTaskPageView.taskQuery.taskStatus,
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
        QuickstartTaskPageView.taskQuery.hasTask,
        () =>
          p(function* () {
            return `Task: ${yield* QuickstartTaskPageView.taskQuery.title()}`;
          }),
      ),
      ifNode(
        'quickstart-task-exception',
        QuickstartTaskPageView.taskQuery.hasTaskException,
        () =>
          p([
            'Business error: ',
            span({ class: taskPage.error }, QuickstartTaskPageView.taskQuery.exceptionTag),
          ]),
      ),
      button(
        'reloadTask',
        {
          type: 'button',
          *click() {
            yield* QuickstartTaskPageView.taskQuery.call('task-1');
          },
        },
        'Reload task',
      ),
    ]),
);

export default QuickstartTaskPage;
