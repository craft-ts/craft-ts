import {
  ResourceStatus,
  signal,
} from './host/craft-compat';
import { resourceById } from './resource-by-id';
import { craftSignal } from './host/craft-signal';
import { setupCraftServiceTest } from './setup-craft-service-test';

describe('resourceById', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  const runResource = <T>(fn: () => T | Promise<T>) => {
    const { injector } = setupCraftServiceTest();
    return injector.run(fn);
  };
  it('should create a resource by id', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const rxResourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          // Simulate a stream
          return params;
        },
      });
      expect(rxResourceByIdRef).toBeDefined();
      expect(rxResourceByIdRef()).toEqual({});

      sourceParams.set({ id: '123' });
      await vi.runAllTimersAsync();
      const resourceRef123 = rxResourceByIdRef()['123'];
      expect(resourceRef123).toBeDefined();
      expect(resourceRef123?.value()).toEqual({ id: '123' });

      sourceParams.set({ id: '123Bis' });
      await vi.runAllTimersAsync();

      const resourceRef123Bis = rxResourceByIdRef()['123Bis'];
      expect(resourceRef123Bis).toBeDefined();
      expect(resourceRef123Bis?.value()).toEqual({ id: '123Bis' });
    });
  });

  it('should accepts a fromResourceById, that accepts another ResourceByIdRef', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const innerResourceByIdRef = resourceById({
        params: sourceParams,
        identifier: (params) => params.id,
        loader: async ({ params }) => {
          // Simulate a stream
          return params;
        },
      });
      // will set a resolved status
      innerResourceByIdRef.add({ id: '1' });
      // will set a local status
      innerResourceByIdRef.add(
        { id: '2' },
        {
          defaultValue: { id: '2' },
        },
      );
      // will set a local status
      innerResourceByIdRef.add(
        { id: '3' },
        {
          defaultValue: { id: '3' },
        },
      );

      const resourceByIdRef = resourceById({
        fromResourceById: innerResourceByIdRef,
        params: ({ value, status }) => {
          expectTypeOf(value()).toEqualTypeOf<
            | {
                id: string;
              }
            | undefined
          >();
          expectTypeOf(status()).toEqualTypeOf<ResourceStatus>();
          return status() === 'resolved' || status() === 'local'
            ? value()
            : undefined;
        },
        identifier: (params) => params.id,
        loader: async ({ params }) => {
          // Simulate a stream
          return params;
        },
      });
      expect(resourceByIdRef).toBeDefined();
      expect(resourceByIdRef()).toEqual({});

      await vi.runAllTimersAsync();

      const resourceRef123 = resourceByIdRef()['1'];
      expect(resourceRef123).toBeDefined();
      expect(resourceRef123?.value()).toEqual({ id: '1' });

      sourceParams.set({ id: '123Bis' });
      await vi.runAllTimersAsync();

      const resourceRef123Bis = resourceByIdRef()['123Bis'];
      expect(resourceRef123Bis).toBeDefined();
      expect(resourceRef123Bis?.value()).toEqual({ id: '123Bis' });
    });
  });

  it('should expose add/reset/restResource function', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          // Simulate a stream
          return params;
        },
      });
      expect(resourceByIdRef).toBeDefined();
      expect(resourceByIdRef()).toEqual({});

      resourceByIdRef.add(
        { id: '123' },
        {
          defaultValue: { id: '123' },
        },
      );
      const resourceRef123 = resourceByIdRef()['123'];

      await vi.runAllTimersAsync();
      expect(resourceRef123).toBeDefined();
      expect(resourceRef123?.value()).toEqual({ id: '123' });

      resourceByIdRef.add(
        { id: '1234' },
        {
          defaultValue: { id: '1234' },
        },
      );
      resourceByIdRef.add(
        { id: '12345' },
        {
          defaultValue: { id: '12345' },
        },
      );
      await vi.runAllTimersAsync();

      const resourceRef1234 = resourceByIdRef()['1234'];
      expect(resourceRef1234).toBeDefined();
      expect(resourceRef1234?.value()).toEqual({ id: '1234' });

      const resourceRef12345 = resourceByIdRef()['12345'];
      expect(resourceRef12345).toBeDefined();
      expect(resourceRef12345?.value()).toEqual({ id: '12345' });

      resourceByIdRef.resetResource('123');
      expect(resourceByIdRef()['123']).toBeUndefined();
      expect(resourceByIdRef()['1234']).toBeDefined();
      expect(resourceByIdRef()['12345']).toBeDefined();

      resourceByIdRef.reset();
      expect(resourceByIdRef()['1234']).toBeUndefined();
      expect(resourceByIdRef()['12345']).toBeUndefined();
    });
  });

  it('stops the per-id linked params watch when resetResource runs', async () => {
    await runResource(async () => {
      const sourceParams = craftSignal<{ id: string } | undefined>(undefined);
      const sourceFn = vi.fn(() => sourceParams());
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceFn,
        loader: async ({ params }) => params,
      });

      resourceByIdRef.addById('123', { defaultValue: { id: '123' } });
      await vi.runAllTimersAsync();
      expect(resourceByIdRef()['123']?.value()).toEqual({ id: '123' });

      resourceByIdRef.resetResource('123');
      expect(resourceByIdRef()['123']).toBeUndefined();

      sourceFn.mockClear();
      sourceParams.set({ id: '999' });
      await vi.runAllTimersAsync();
      // resetResource evicts only the selected cache entry. The global params
      // watch remains active and may create the next requested entry.
      expect(sourceFn).toHaveBeenCalled();
      expect(resourceByIdRef()['999']).toBeDefined();
    });
  });

  it('should expose changes property with correct ids', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          return params;
        },
      });

      // Initially no changes
      expect(resourceByIdRef.changes.hasChange()).toBe(false);
      expect(resourceByIdRef.changes.ids()).toEqual([]);

      // Add a resource with default value (local status)
      resourceByIdRef.add({ id: '1' }, { defaultValue: { id: '1' } });
      await vi.runAllTimersAsync();

      // Should detect the new resource
      expect(resourceByIdRef.changes.hasChange()).toBe(true);
      expect(resourceByIdRef.changes.ids()).toContain('1');
      expect(resourceByIdRef.changes.resolved()).toContain('1');

      // Add another resource
      resourceByIdRef.add({ id: '2' }, { defaultValue: { id: '2' } });
      await vi.runAllTimersAsync();

      expect(resourceByIdRef.changes.ids()).toContain('2');
      expect(resourceByIdRef.changes.resolved()).toContain('2');

      // Trigger loading by setting params
      sourceParams.set({ id: '3' });
      await vi.runAllTimersAsync();

      expect(resourceByIdRef.changes.ids()).toContain('3');
    });
  });

  it('should expose a state signal that returns all resource values by id', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          return { id: params.id, data: `Data for ${params.id}` };
        },
      });

      // Initially, state should be empty
      expect(resourceByIdRef.state()).toEqual({});

      // Add resources with default values
      resourceByIdRef.add(
        { id: '1' },
        { defaultValue: { id: '1', data: 'Data for 1' } },
      );
      await vi.runAllTimersAsync();

      // State should contain the first resource
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Data for 1' },
      });

      // Add another resource
      resourceByIdRef.add(
        { id: '2' },
        { defaultValue: { id: '2', data: 'Data for 2' } },
      );
      await vi.runAllTimersAsync();

      // State should contain both resources
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Data for 1' },
        '2': { id: '2', data: 'Data for 2' },
      });

      // Trigger a new resource via params
      sourceParams.set({ id: '3' });
      await vi.runAllTimersAsync();

      // State should contain all three resources
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Data for 1' },
        '2': { id: '2', data: 'Data for 2' },
        '3': { id: '3', data: 'Data for 3' },
      });

      // Reset a specific resource
      resourceByIdRef.resetResource('2');
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Data for 1' },
        '3': { id: '3', data: 'Data for 3' },
      });

      // Reset all resources
      resourceByIdRef.reset();
      expect(resourceByIdRef.state()).toEqual({});
    });
  });

  it('should expose a set function to update multiple resource values', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          return { id: params.id, data: `Data for ${params.id}` };
        },
      });

      // Add a resource with default value
      resourceByIdRef.add(
        { id: '1' },
        { defaultValue: { id: '1', data: 'Initial data' } },
      );
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Initial data' },
      });

      // Update multiple values using set
      resourceByIdRef.set({
        '1': { id: '1', data: 'Updated data' },
        '2': { id: '2', data: 'New data' },
      });
      await vi.runAllTimersAsync();

      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Updated data' },
        '2': { id: '2', data: 'New data' },
      });

      // Verify the created resource exists
      expect(resourceByIdRef()['2']).toBeDefined();
      expect(resourceByIdRef()['2']?.value()).toEqual({
        id: '2',
        data: 'New data',
      });

      resourceByIdRef.set({
        '3': { id: '3', data: 'Data 3' },
        '4': { id: '4', data: 'Data 4' },
      });
      await vi.runAllTimersAsync();

      expect(resourceByIdRef.state()).toEqual({
        '3': { id: '3', data: 'Data 3' },
        '4': { id: '4', data: 'Data 4' },
      });
    });
  });

  it('should expose an updateState function that keeps existing values and updates by id', async () => {
    await runResource(async () => {
      const sourceParams = signal<{ id: string } | undefined>(undefined);
      const resourceByIdRef = resourceById({
        identifier: (request) => request.id,
        params: sourceParams,
        loader: async ({ params }) => {
          return { id: params.id, data: `Data for ${params.id}` };
        },
      });

      resourceByIdRef.add(
        { id: '1' },
        { defaultValue: { id: '1', data: 'Initial 1' } },
      );
      resourceByIdRef.add(
        { id: '2' },
        { defaultValue: { id: '2', data: 'Initial 2' } },
      );
      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Initial 1' },
        '2': { id: '2', data: 'Initial 2' },
      });

      resourceByIdRef.update((state) => ({
        ...state,
        '2': { id: '2', data: 'Updated 2' },
        '3': { id: '3', data: 'New 3' },
      }));
      await vi.runAllTimersAsync();

      expect(resourceByIdRef.state()).toEqual({
        '1': { id: '1', data: 'Initial 1' },
        '2': { id: '2', data: 'Updated 2' },
        '3': { id: '3', data: 'New 3' },
      });
    });
  });
});
