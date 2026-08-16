import {
  signal,
} from '../host/craft-compat';
import { TestBed } from '../host/craft-test-bed';
import { resourceById } from '../resource-by-id';
import {
  resourceByIdChangesTracker,
  resourceByIdChangesTrackerResult,
} from './resource-by-id-changes-tracker.util';

describe('resourceByIdChangesTracker', () => {
  it('should return hasChange false and empty arrays for the first read', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const params = signal({ id: '1' });
      const resourceByIdRef = resourceById({
        params,
        identifier: (p) => p.id,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params.id, name: 'Test Name' };
        },
      });

      const res = resourceByIdChangesTracker(resourceByIdRef);
      expectTypeOf(res).toEqualTypeOf<
        resourceByIdChangesTrackerResult<string>
      >();
      expect(res.hasChange()).toEqual(false);
      expect(res.ids()).toEqual([]);
      expect(res.resolved()).toEqual([]);
      expect(res.loading()).toEqual([]);
      expect(res.reloading()).toEqual([]);
      expect(res.exception()).toEqual([]);
      expect(res.onlyValueChange()).toEqual([]);
    });
  });

  it('should track resolved resources', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const params = signal({ id: '1' });
      const resourceByIdRef = resourceById({
        params,
        identifier: (p) => p.id,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params.id, name: 'Test Name' };
        },
      });

      const res = resourceByIdChangesTracker(resourceByIdRef);

      // First read - no changes
      expect(res.hasChange()).toEqual(false);

      // Wait for resource to resolve
      params.set({ id: '2' });
      await vi.advanceTimersByTimeAsync(10000);
      expect(res.hasChange()).toEqual(true);
      expect(res.resolved()).toEqual(['2']);
      expect(res.ids()).toContain('2');
    });
  });

  it('should track multiple resolved resources in same cycle', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const params = signal({ id: '1' });
      const resourceByIdRef = resourceById({
        params,
        identifier: (p) => p.id,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params.id, name: 'Test Name' };
        },
      });

      const res = resourceByIdChangesTracker(resourceByIdRef);
      expect(res.hasChange()).toEqual(false);

      // Start loading two resources
      params.set({ id: '3' });
      await vi.advanceTimersByTimeAsync(100);
      params.set({ id: '4' });
      await vi.advanceTimersByTimeAsync(5000);

      // Neither resolved yet
      expect(res.resolved()).toEqual([]);

      // Both resolve
      await vi.advanceTimersByTimeAsync(5000);
      expect(res.hasChange()).toEqual(true);
      expect(res.resolved()).toContain('3');
      expect(res.resolved()).toContain('4');
    });
  });

  it('should track loading resources', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const params = signal({ id: '1' });
      const resourceByIdRef = resourceById({
        params,
        identifier: (p) => p.id,
        loader: async ({ params }) => {
          await wait(10000);
          return { id: params.id, name: 'Test Name' };
        },
      });

      const res = resourceByIdChangesTracker(resourceByIdRef);

      // First read
      expect(res.hasChange()).toEqual(false);

      // Trigger a new resource to load
      params.set({ id: '2' });
      await vi.advanceTimersByTimeAsync(100);

      // Should detect loading
      expect(res.hasChange()).toEqual(true);
      expect(res.loading()).toContain('2');
    });
  });

  it('should track error resources', async () => {
    vi.useFakeTimers();
    await TestBed.runInInjectionContext(async () => {
      const params = signal({ id: '1' });
      const resourceByIdRef = resourceById({
        params,
        identifier: (p) => p.id,
        loader: async ({ params }) => {
          await wait(10000);
          if (params.id === 'error') {
            throw new Error('Test error');
          }
          return { id: params.id, name: 'Test Name' };
        },
      });

      const res = resourceByIdChangesTracker(resourceByIdRef);

      // First read
      expect(res.hasChange()).toEqual(false);

      // Trigger error
      params.set({ id: 'error' });
      await vi.advanceTimersByTimeAsync(10000);

      expect(res.hasChange()).toEqual(true);
      expect(res.exception()).toContain('error');
    });
  });
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
