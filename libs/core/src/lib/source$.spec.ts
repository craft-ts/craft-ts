import {
  computed,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { source$ } from './source$';

describe('source$', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a source that enable to emit a value, and the listener to receive it', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<string>('mySource');

      //expectTypeOf(mySource).toEqualTypeOf<Source<string>>();

      let result: undefined | string = undefined;
      mySource.subscribe((v) => (result = v));

      expect(result).toBe(undefined);

      mySource.emit('Hello World');

      expect(result).toBe('Hello World');

      mySource.emit('Hello CraftTS');
      expect(result).toBe('Hello CraftTS');
    });
  });

  it('A listener at n+1 should not get the value when listened and get data for the first time', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<string>('mySource');

      mySource.emit('Hello World');

      let result: undefined | string = undefined;
      mySource.subscribe((v) => (result = v));

      mySource.emit('Hello CraftTS v2');
      expect(result).toBe('Hello CraftTS v2');
    });
  });

  it('A listener at n+1 should get the last value when using "preserveLastValue" config and listened and get data for the first time ', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<string>('mySource');

      mySource.emit('Hello World');

      let result: undefined | string = undefined;
      mySource.preserveLastValue().subscribe((v) => (result = v));
      expect(result).toBe('Hello World');

      mySource.emit('Hello CraftTS v2');
      expect(result).toBe('Hello CraftTS v2');
    });
  });
});
