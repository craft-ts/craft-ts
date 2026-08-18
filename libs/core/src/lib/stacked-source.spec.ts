import {
  computed,
} from './host/craft-compat';
import { stackedSource } from './stacked-source';

describe('stackedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a source that enable to emit a values that are stacked, and the listener to receive it', () => {
    const mySource = stackedSource<string>();

    const myListener = computed(() => {
      const s = mySource();
      return s;
    });

    expect(myListener()).toBe(undefined);

    mySource.set('Hello World 1');
    mySource.set('Hello World 2');

    expect(myListener()).toEqual(['Hello World 1', 'Hello World 2']);

    mySource.set('Hello CraftTS');
    expect(myListener()).toEqual(['Hello CraftTS']);
  });

  it('A listener at n+1 should not get the value when listened and get data for the first time', () => {
    const mySource = stackedSource<string>();

    mySource.set('Hello World');

    const myListener = computed(() => mySource());
    expect(myListener()).toBe(undefined);

    mySource.set('Hello CraftTS v2');
    expect(myListener()).toEqual(['Hello CraftTS v2']);
  });

  it('A listener at n that get all the values, and a listener at n+1 that not get the first value but all others', () => {
    const mySource = stackedSource<string>();

    const myListener = computed(() => mySource());

    expect(myListener()).toBe(undefined);

    mySource.set('Hello World 1');
    mySource.set('Hello World 2');

    expect(myListener()).toEqual(['Hello World 1', 'Hello World 2']);

    const myListener2 = computed(() => mySource());

    mySource.set('Hello CraftTS');
    expect(myListener()).toEqual(['Hello CraftTS']);
    expect(myListener2()).toEqual(['Hello CraftTS']);

    mySource.set('Hello CraftTS v1');
    mySource.set('Hello CraftTS v2');
    mySource.set('Hello CraftTS v3');
    expect(myListener()).toEqual([
      'Hello CraftTS v1',
      'Hello CraftTS v2',
      'Hello CraftTS v3',
    ]);
    expect(myListener2()).toEqual([
      'Hello CraftTS v1',
      'Hello CraftTS v2',
      'Hello CraftTS v3',
    ]);
  });
});
