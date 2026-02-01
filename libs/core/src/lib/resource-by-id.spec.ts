import { ResourceStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { resourceById } from './resource-by-id';

describe('resourceById', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should create a resource by id', async () => {
    await TestBed.runInInjectionContext(async () => {
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
    await TestBed.runInInjectionContext(async () => {
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
          expectTypeOf(value()).toEqualTypeOf<{
            id: string;
          }>();
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
    await TestBed.runInInjectionContext(async () => {
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

  it('should expose changes property with correct ids', async () => {
    await TestBed.runInInjectionContext(async () => {
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
});
