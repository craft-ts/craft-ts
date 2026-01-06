import { signal } from '@angular/core';
import { createSignalProxy } from './signal-proxy';

describe('SignalProxy', () => {
  it('should create a proxy that exposes read signals and write helpers', () => {
    const proxyWithEmptyConfig = createSignalProxy(
      {} as {
        name: string | undefined;
        age: number | undefined;
      }
    );

    expect(proxyWithEmptyConfig.name).toBeDefined();
    expect(proxyWithEmptyConfig.age).toBeDefined();
    expect(proxyWithEmptyConfig.name()).toBe(undefined);
    expect(proxyWithEmptyConfig.age()).toBe(undefined);

    const config = {
      name: signal('John'),
      age: signal(30),
    };

    proxyWithEmptyConfig.$set(config);

    expect(proxyWithEmptyConfig.name()).toBe('John');
    expect(proxyWithEmptyConfig.age()).toBe(30);
  });

  it('should patch object with partial values using $patch', () => {
    const initialConfig = {
      name: signal('John'),
      age: signal(30),
      city: signal('New York'),
    };

    const proxy = createSignalProxy(initialConfig);

    // Verify initial values
    expect(proxy.name()).toBe('John');
    expect(proxy.age()).toBe(30);
    expect(proxy.city()).toBe('New York');

    // Patch only some properties
    proxy.$patch({
      age: signal(31),
      city: signal('San Francisco'),
    });

    // Verify patched values
    expect(proxy.name()).toBe('John'); // unchanged
    expect(proxy.age()).toBe(31); // updated
    expect(proxy.city()).toBe('San Francisco'); // updated
  });

  it('should patch object with partial values and preserve existing properties', () => {
    const proxy = createSignalProxy({
      name: signal('Alice'),
      age: signal(25),
      email: signal('alice@example.com'),
    });

    // Patch only one property
    proxy.$patch({
      age: signal(26),
    });

    expect(proxy.name()).toBe('Alice'); // unchanged
    expect(proxy.age()).toBe(26); // updated
    expect(proxy.email()).toBe('alice@example.com'); // unchanged
  });
});
