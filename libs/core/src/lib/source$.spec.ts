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

  it('preserveLastValue emits nothing when no value was emitted yet and does not re-emit to earlier subscribers', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<string>('mySource');
      const preserved = mySource.preserveLastValue();

      const first: string[] = [];
      preserved.subscribe((v) => first.push(v));
      expect(first).toEqual([]);

      mySource.emit('a');
      const second: string[] = [];
      preserved.subscribe((v) => second.push(v));

      expect(first).toEqual(['a']);
      expect(second).toEqual(['a']);
    });
  });

  describe('replay', () => {
    it('replays the last n values to a late subscriber, oldest first', () => {
      TestBed.runInInjectionContext(() => {
        const mySource = source$<number>('mySource', { replay: 2 });
        mySource.emit(1);
        mySource.emit(2);
        mySource.emit(3);

        const values: number[] = [];
        mySource.subscribe((v) => values.push(v));
        mySource.emit(4);

        expect(values).toEqual([2, 3, 4]);
      });
    });

    it('replays through asReadonly and does not replay without the option', () => {
      TestBed.runInInjectionContext(() => {
        const replayed = source$<number>('replayed', { replay: 1 });
        const plain = source$<number>('plain');
        replayed.emit(1);
        plain.emit(1);

        const a: number[] = [];
        const b: number[] = [];
        replayed.asReadonly().subscribe((v) => a.push(v));
        plain.asReadonly().subscribe((v) => b.push(v));

        expect(a).toEqual([1]);
        expect(b).toEqual([]);
      });
    });
  });

  describe('initial', () => {
    it('holds the initial value and replays it to the first subscriber', () => {
      TestBed.runInInjectionContext(() => {
        const mySource = source$<number>('mySource', { initial: 10 });
        expectTypeOf(mySource.value()).toEqualTypeOf<number>();

        const values: number[] = [];
        mySource.subscribe((v) => values.push(v));
        mySource.emit(11);

        expect(mySource.value()).toBe(11);
        expect(values).toEqual([10, 11]);
      });
    });

    it('replays only the latest value once emissions followed the initial one', () => {
      TestBed.runInInjectionContext(() => {
        const mySource = source$<number>('mySource', { initial: 0 });
        mySource.emit(1);
        mySource.emit(2);

        const values: number[] = [];
        mySource.subscribe((v) => values.push(v));

        expect(values).toEqual([2]);
      });
    });

    it('keeps value() undefined-typed without an initial value', () => {
      TestBed.runInInjectionContext(() => {
        const mySource = source$<number>('mySource');

        expectTypeOf(mySource.value()).toEqualTypeOf<number | undefined>();
        expect(mySource.value()).toBeUndefined();
      });
    });
  });
});
