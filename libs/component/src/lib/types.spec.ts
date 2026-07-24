import { expectTypeOf, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { component } from './component';
import { p } from './hyperscript';
import type {
  Input,
  Output,
  PropsOf,
} from './types';

interface User {
  readonly id: number;
  readonly name: string;
}

it('infers component input and output props from the branded context', () => {
  const userCard = component(
    {},
    (
      user: Input<User>,
      onPick: Output<(user: User) => void>,
    ) => ({ user, onPick }),
    ({ user, onPick }) =>
      p(
        { click: () => onPick(user()) },
        user().name,
      ),
  );

  type _UserCardProps = Expect<
    Equal<
      PropsOf<typeof userCard>,
      {
        user: () => User;
        onPick: (user: User) => void;
      }
    >
  >;
  expectTypeOf<PropsOf<typeof userCard>>().toEqualTypeOf<{
    user: () => User;
    onPick: (user: User) => void;
  }>();

  userCard({
    user: () => ({ id: 1, name: 'Ada' }),
    onPick: (user) => user.name,
  });

  // @ts-expect-error Input props remain accessors at the call-site.
  userCard({ user: { id: 1, name: 'Ada' }, onPick: () => undefined });
});

it('does not expose ordinary context callbacks as component outputs', () => {
  const internalAction = component(
    {},
    (name: Input<string>) => ({
      name,
      reset: () => undefined,
    }),
    ({ name }) => p(name()),
  );

  type _InternalActionProps = Expect<
    Equal<PropsOf<typeof internalAction>, { name: () => string }>
  >;
  expectTypeOf(internalAction).toBeFunction();
  expectTypeOf<PropsOf<typeof internalAction>>().toEqualTypeOf<{
    name: () => string;
  }>();
});
