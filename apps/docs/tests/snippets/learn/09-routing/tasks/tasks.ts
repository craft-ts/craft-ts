import { craftService } from '@craft-ts/core';
import { craftComponent, p } from '@craft-ts/component';

export const { TasksView, provideTasksView } = craftService(
  { name: 'tasksView', providedIn: 'toProvide' },
  () => ({}),
);

export default craftComponent(
  'Tasks',
  { providers: [provideTasksView()] },
  function* () {
    yield* TasksView();
    return p('Tasks');
  },
);
