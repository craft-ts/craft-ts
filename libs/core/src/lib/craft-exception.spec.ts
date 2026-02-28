import { CraftExceptionResult, StripCraftException } from './craft-exception';

describe('StripCraftException', () => {
  it('should exclude CraftExceptionResult from a union type', () => {
    type TestType =
      | string
      | number
      | CraftExceptionResult<{ code: 'TEST' }, { message: string }>;

    type Result = StripCraftException<TestType>;

    // The resulting type should only include string and number, excluding the CraftExceptionResult
    expectTypeOf<Result>().toEqualTypeOf<string | number>();
  });
  it('should exclude CraftExceptionResult from a union type', () => {
    type TestType =
      | CraftExceptionResult<
          {
            code: 'INVALID_USER_ID';
            scope: undefined;
            identifier?: undefined;
          },
          {
            reason: 'missing';
          }
        >
      | {
          id: string;
          name: string;
          email: string;
        };

    type Result = StripCraftException<TestType>;

    // The resulting type should only include string and number, excluding the CraftExceptionResult
    expectTypeOf<Result>().toEqualTypeOf<{
      id: string;
      name: string;
      email: string;
    }>();
  });
});
