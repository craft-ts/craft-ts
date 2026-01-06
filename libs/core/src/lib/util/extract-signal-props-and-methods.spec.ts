import { Signal } from '@angular/core';
import { ExtractSignalPropsAndMethods } from './extract-signal-props-and-methods';

describe('ExtractSignalPropsAndMethods', () => {
  it('should extract signal props and methods from a state', () => {
    type TestState = {
      count: Signal<number>;
      name: Signal<string>;
      increment: () => number;
      reset: () => void;
    };

    type Result = ExtractSignalPropsAndMethods<
      TestState,
      ['count', 'name', 'increment', 'reset'],
      { props: {}; methods: Record<string, Function> }
    >;

    expectTypeOf<Result['props']>().toEqualTypeOf<
      {
        count: Signal<number>;
      } & {
        name: Signal<string>;
      }
    >();

    expectTypeOf<Result['methods']>().toEqualTypeOf<{
      increment: () => number;

      reset: () => void;
    }>();
  });
});
