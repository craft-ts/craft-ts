import { FilterPrivateFields } from './util.type';
describe('FilterPrivateFields', () => {
  it('should filter out private fields', () => {
    type TestType = {
      _privateField: string;
      publicField: number;
    };

    type Result = FilterPrivateFields<TestType>;

    const result: Result = {
      publicField: 42,
    };

    expectTypeOf(result).toEqualTypeOf<{
      publicField: number;
    }>();
  });
});
