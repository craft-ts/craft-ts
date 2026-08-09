import { signal } from '@angular/core';
import { preservedResource } from './preserved-resource';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

describe('Preserved Resource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('should preserve the resource state across different queries', async () => {
    await TestBed.runInInjectionContext(async () => {
      const initialParams = signal({ data: 'initial' });
      const resource = preservedResource({
        params: initialParams,
        loader: async ({ params }) => {
          await wait(10000);
          return params.data;
        },
      });

      await vi.runAllTimersAsync();

      expect(resource.status()).toEqual('resolved');
      expect(resource.value()).toEqual('initial');

      // Simulate a query that modifies the resource
      initialParams.set({ data: 'modified' });
      expect(resource.status()).toEqual('loading');

      // Assert that the resource state is preserved
      expect(resource.value()).toEqual('initial');
      expect(resource.hasValue()).toBe(true);

      await vi.runAllTimersAsync();

      // Assert that the original modified state is still preserved
      expect(resource.status()).toEqual('resolved');
      expect(resource.value()).toEqual('modified');
    });
  });
});

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
