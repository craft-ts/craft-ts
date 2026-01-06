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

  it('should accepts a fromObject, that accepts another ResourceByIdRef', async () => {
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
      innerResourceByIdRef.addById('1', {
        fallbackValue: { id: '1' },
      });
      innerResourceByIdRef.addById('2', {
        fallbackValue: { id: '2' },
      });
      innerResourceByIdRef.addById('3', {
        fallbackValue: { id: '3' },
      });

      const resourceByIdRef = resourceById({
        fromResourceById: innerResourceByIdRef,
        params: ({ value, status }) => {
          console.log('params value', value());
          expectTypeOf(value()).toEqualTypeOf<{
            id: string;
          }>();
          expectTypeOf(status()).toEqualTypeOf<ResourceStatus>();
          return status() === 'resolved' ? value() : undefined;
        },
        identifier: (params) => params.id,
        loader: async ({ params }) => {
          console.log('loader params', params);
          // Simulate a stream
          return params;
        },
      });
      expect(resourceByIdRef).toBeDefined();
      console.log('1 - resourceByIdRef()', resourceByIdRef());
      expect(resourceByIdRef()).toEqual({});

      await vi.runAllTimersAsync();
      console.log('2 - resourceByIdRef() ', resourceByIdRef());
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
          fallbackValue: { id: '123' },
        }
      );
      const resourceRef123 = resourceByIdRef()['123'];

      await vi.runAllTimersAsync();
      expect(resourceRef123).toBeDefined();
      expect(resourceRef123?.value()).toEqual({ id: '123' });

      resourceByIdRef.add(
        { id: '1234' },
        {
          fallbackValue: { id: '1234' },
        }
      );
      resourceByIdRef.add(
        { id: '12345' },
        {
          fallbackValue: { id: '12345' },
        }
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
});
