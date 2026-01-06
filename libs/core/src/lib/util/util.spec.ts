import {
  FilterPrivateFields,
  ReplaceStoreConfigToken,
  STORE_CONFIG_TOKEN,
} from './util.type';
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

describe('ReplaceStoreConfigToken', () => {
  it('should replace _STORE_NAME_ and _STORE_PROVIDED_IN_ tokens in standalone output names', () => {
    const _TestStandaloneOutputName =
      `setAll${STORE_CONFIG_TOKEN.NAME}${STORE_CONFIG_TOKEN.PROVIDED_IN}QueryParams` as const;

    type ReplacedConfig = ReplaceStoreConfigToken<
      typeof _TestStandaloneOutputName,
      {
        name: 'user';
        providedIn: 'root';
      }
    >;
    expectTypeOf<ReplacedConfig>().toEqualTypeOf<'setAllUserRootQueryParams'>();
  });
});
