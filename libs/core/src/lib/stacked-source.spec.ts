import { computed } from '@angular/core';
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

    mySource.set('Hello Ng-Query');
    expect(myListener()).toEqual(['Hello Ng-Query']);
  });

  it('A listener at n+1 should not get the value when listened and get data for the first time', () => {
    const mySource = stackedSource<string>();

    mySource.set('Hello World');

    const myListener = computed(() => mySource());
    expect(myListener()).toBe(undefined);

    mySource.set('Hello Ng-Query v2');
    expect(myListener()).toEqual(['Hello Ng-Query v2']);
  });

  it('A listener at n that get all the values, and a listener at n+1 that not get the first value but all others', () => {
    const mySource = stackedSource<string>();

    const myListener = computed(() => mySource());

    expect(myListener()).toBe(undefined);

    mySource.set('Hello World 1');
    mySource.set('Hello World 2');

    expect(myListener()).toEqual(['Hello World 1', 'Hello World 2']);

    const myListener2 = computed(() => mySource());

    mySource.set('Hello Ng-Query');
    expect(myListener()).toEqual(['Hello Ng-Query']);
    expect(myListener2()).toEqual(['Hello Ng-Query']);

    mySource.set('Hello Ng-Query v1');
    mySource.set('Hello Ng-Query v2');
    mySource.set('Hello Ng-Query v3');
    expect(myListener()).toEqual([
      'Hello Ng-Query v1',
      'Hello Ng-Query v2',
      'Hello Ng-Query v3',
    ]);
    expect(myListener2()).toEqual([
      'Hello Ng-Query v1',
      'Hello Ng-Query v2',
      'Hello Ng-Query v3',
    ]);
  });
});
