import { craftService } from './craft-service';
import type { Equal, Expect } from 'test-type';

const todoStore = craftService(
  { name: 'TodoStore', scope: 'toProvide' },
  () => ({ todos: [] as string[] }),
);

type _NoGeneratedInjectHelper = Expect<
  Equal<Extract<keyof typeof todoStore, `inject${string}`>, never>
>;
type _ServiceHelperUsesServiceName = Expect<
  Equal<'TodoStore' extends keyof typeof todoStore ? true : false, true>
>;

it('exposes only the renamed service helper', () => {
  expect(todoStore.TodoStore).toBeTypeOf('function');
  expect('TodoStore' in todoStore).toBe(true);
});
