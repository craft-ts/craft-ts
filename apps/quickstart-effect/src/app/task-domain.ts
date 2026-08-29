import { Context, Data, Effect, Layer } from 'effect';

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
};

export class TaskNotFound extends Data.TaggedError('TaskNotFound')<{
  readonly taskId: string;
}> {}

export type TaskRepository = {
  readonly find: (taskId: string) => Effect.Effect<Task, TaskNotFound>;
};

export class TaskRepositoryService extends Context.Service<
  TaskRepositoryService,
  TaskRepository
>()('quickstart-effect/TaskRepository') {}

export const TaskRepositoryLive = Layer.succeed(TaskRepositoryService, {
  find: (taskId: string) => {
    if (taskId === 'task-1') {
      return Effect.succeed({
        id: 'task-1',
        title: 'Understand the Effect boundary',
        done: false,
      } satisfies Task);
    }
    return Effect.fail(new TaskNotFound({ taskId }));
  },
});

export const loadTask = Effect.fnUntraced(function* (taskId: string) {
  const repository = yield* TaskRepositoryService;
  return yield* repository.find(taskId);
});
