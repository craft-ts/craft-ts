import { signal } from '@angular/core';
import { reactiveWritableSignal } from './reactive-writable-signal';

describe('reactiveWritableSignal', () => {
  it('1- Should use initialValue on first read', () => {
    const source = signal(10);

    const result = reactiveWritableSignal(5, (sync) => ({
      onSourceChange: sync(source, ({ params, current }) => params + current),
    }));

    // First read returns initialValue
    expect(result()).toEqual(5);
  });

  it('2- Should react to source signal changes', () => {
    const multiplier = signal(2);

    const result = reactiveWritableSignal(10, (sync) => ({
      multiply: sync(multiplier, ({ params, current }) => current * params),
    }));

    expect(result()).toEqual(10);

    // When source changes, computation is triggered
    multiplier.set(3);
    expect(result()).toEqual(30); // 10 * 3
  });

  it('3- Should allow manual set() and preserve value until next source change', () => {
    const source = signal(1);

    const result = reactiveWritableSignal(0, (sync) => ({
      addSource: sync(source, ({ params, current }) => current + params),
    }));

    expect(result()).toEqual(0);

    // Manual set
    result.set(100);
    expect(result()).toEqual(100);

    // Source change triggers computation with current value (100)
    source.set(5);
    expect(result()).toEqual(105); // 100 + 5
  });

  it('4- Should only trigger computation for the source that changed', () => {
    const sourceA = signal('A');
    const sourceB = signal('B');
    let computationACount = 0;
    let computationBCount = 0;

    const result = reactiveWritableSignal('', (sync) => ({
      syncA: sync(sourceA, ({ params, current }) => {
        computationACount++;
        return current + params;
      }),
      syncB: sync(sourceB, ({ params, current }) => {
        computationBCount++;
        return current + params;
      }),
    }));

    expect(result()).toEqual('');
    expect(computationACount).toEqual(0);
    expect(computationBCount).toEqual(0);

    // Only sourceA changes
    sourceA.set('A1');
    expect(result()).toEqual('A1');
    expect(computationACount).toEqual(1);
    expect(computationBCount).toEqual(0);

    // Only sourceB changes
    sourceB.set('B1');
    expect(result()).toEqual('A1B1');
    expect(computationACount).toEqual(1);
    expect(computationBCount).toEqual(1);
  });

  it('5- Should not trigger computation if source reference is the same', () => {
    const source = signal({ value: 1 });
    let computationCount = 0;

    const result = reactiveWritableSignal(0, (sync) => ({
      extract: sync(source, ({ params, current }) => {
        computationCount++;
        return params.value;
      }),
    }));

    expect(result()).toEqual(0);

    // Mutate the object but keep the same reference
    source().value = 99;
    // Re-read the signal - no change because reference is the same
    expect(result()).toEqual(0);
    expect(computationCount).toEqual(0);

    // Now set a new reference
    source.set({ value: 50 });
    expect(result()).toEqual(50);
    expect(computationCount).toEqual(1);
  });

  it('6- Should handle multiple sources changing at once', () => {
    const sourceA = signal(1);
    const sourceB = signal(10);

    const result = reactiveWritableSignal(0, (sync) => ({
      addA: sync(sourceA, ({ params, current }) => current + params),
      addB: sync(sourceB, ({ params, current }) => current + params),
    }));

    expect(result()).toEqual(0);

    // Both sources change before reading
    sourceA.set(2);
    sourceB.set(20);
    // Both computations should run in order
    expect(result()).toEqual(22); // 0 + 2 + 20
  });

  it('7- Should support update() method', () => {
    const source = signal(1);

    const result = reactiveWritableSignal(10, (sync) => ({
      add: sync(source, ({ params, current }) => current + params),
    }));

    expect(result()).toEqual(10);

    result.update((v) => v * 2);
    expect(result()).toEqual(20);

    source.set(5);
    expect(result()).toEqual(25); // 20 + 5
  });

  it('8- Should filter array based on source changes', () => {
    const allowedIds = signal([1, 2, 3, 4, 5]);

    const selectedIds = reactiveWritableSignal(
      [1, 2, 3] as number[],
      (sync) => ({
        filterByAllowed: sync(allowedIds, ({ params, current }) => {
          return current.filter((id) => params.includes(id));
        }),
      }),
    );

    expect(selectedIds()).toEqual([1, 2, 3]);

    // Remove some allowed ids
    allowedIds.set([1, 3]);
    expect(selectedIds()).toEqual([1, 3]);

    // Manually add an id
    selectedIds.set([1, 3, 5]);
    expect(selectedIds()).toEqual([1, 3, 5]);

    // Filter again with new allowed list
    allowedIds.set([1, 5]);
    expect(selectedIds()).toEqual([1, 5]);
  });

  it('9- Should run computation only during initialization with onInitOnly', () => {
    const source = signal([1, 2, 3]);
    let computationCount = 0;

    const result = reactiveWritableSignal([] as number[], (sync) => ({
      initsyncSource: sync(
        source,
        ({ params }) => {
          computationCount++;
          return params;
        },
        { onInitOnly: true },
      ),
    }));

    // First read triggers initialization computation
    expect(result()).toEqual([1, 2, 3]);
    expect(computationCount).toEqual(1);

    // Source changes but computation should NOT run
    source.set([4, 5, 6]);
    expect(result()).toEqual([1, 2, 3]); // Value unchanged
    expect(computationCount).toEqual(1); // Still 1
  });

  it('10- Should run computation during initialization AND on changes with onInitToo', () => {
    const source = signal(10);
    let computationCount = 0;

    const result = reactiveWritableSignal(0, (sync) => ({
      syncWithSource: sync(
        source,
        ({ params }) => {
          computationCount++;
          return params;
        },
        { onInitToo: true },
      ),
    }));

    // First read triggers initialization computation
    expect(result()).toEqual(10);
    expect(computationCount).toEqual(1);

    // Source changes - computation runs again
    source.set(20);
    expect(result()).toEqual(20);
    expect(computationCount).toEqual(2);
  });

  it('11- Should combine default behavior with onInitToo', () => {
    const initSource = signal('init');
    const updateSource = signal('update');
    let initCount = 0;
    let updateCount = 0;

    const result = reactiveWritableSignal('', (sync) => ({
      // This runs during init AND on changes
      syncInit: sync(
        initSource,
        ({ params, current }) => {
          initCount++;
          return current + params;
        },
        { onInitToo: true },
      ),
      // This runs only on changes (default behavior)
      syncUpdate: sync(updateSource, ({ params, current }) => {
        updateCount++;
        return current + params;
      }),
    }));

    // First read: only syncInit runs
    expect(result()).toEqual('init');
    expect(initCount).toEqual(1);
    expect(updateCount).toEqual(0);

    // Update initSource
    initSource.set('-init2');
    expect(result()).toEqual('init-init2');
    expect(initCount).toEqual(2);
    expect(updateCount).toEqual(0);

    // Update updateSource
    updateSource.set('-updated');
    expect(result()).toEqual('init-init2-updated');
    expect(initCount).toEqual(2);
    expect(updateCount).toEqual(1);
  });

  it('12- Should handle onInitOnly with multiple reactions', () => {
    const initSource = signal([1, 2, 3]);
    const filterSource = signal([1, 2]);

    const result = reactiveWritableSignal([] as number[], (sync) => ({
      // Initialize sync source - only runs once
      initialize: sync(initSource, ({ params }) => params, {
        onInitOnly: true,
      }),
      // Filter - runs on every change (default)
      filter: sync(filterSource, ({ params, current }) => {
        return current.filter((id) => params.includes(id));
      }),
    }));

    // First read: initialize runs
    expect(result()).toEqual([1, 2, 3]);

    // initSource changes - should NOT affect result
    initSource.set([10, 20, 30]);
    expect(result()).toEqual([1, 2, 3]); // Still original

    // filterSource changes - should filter
    filterSource.set([1]);
    expect(result()).toEqual([1]);
  });
});
