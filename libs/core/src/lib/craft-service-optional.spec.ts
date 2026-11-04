import { describe, expect, it, vi } from 'vitest';
import { inject, InjectionToken, Injector } from './host/craft-compat';
import {
  SERVICE_RUNTIME_OVERRIDES,
  ɵcraftValueService,
  ɵgetServiceInjectionToken,
  ɵresolveOptionalService,
  ɵSERVICE_NOT_FOUND,
  type ServiceRuntimeOverride,
} from './craft-service';

// Exercise the shared resolver through real service definitions and injectors.
function slot(factory: () => unknown = () => 'provided') {
  return ɵcraftValueService(
    { name: 'OptionalSlot', providedIn: 'toProvide' },
    factory,
  );
}

describe('internal optional service resolution', () => {
  it('distinguishes absence from a provided null or undefined and preserves required resolution', () => {
    const service = slot();
    const token = ɵgetServiceInjectionToken(service.OptionalSlot)!;
    const absent = Injector.create({ providers: [] });
    expect(ɵresolveOptionalService(service.OptionalSlot, absent)).toBe(
      ɵSERVICE_NOT_FOUND,
    );
    expect(() =>
      absent.run(() => service.OPTIONAL_SLOT_META_DATA.inject()),
    ).toThrow('No provider for Craft token "OptionalSlotServiceToken".');
    for (const value of [null, undefined]) {
      const injector = Injector.create({
        providers: [{ provide: token, useValue: value }],
      });
      expect(ɵresolveOptionalService(service.OptionalSlot, injector)).toBe(
        value,
      );
      expect(injector.run(() => service.OPTIONAL_SLOT_META_DATA.inject())).toBe(
        value,
      );
      injector.destroy();
    }
    absent.destroy();
  });

  it('resolves inherited providers in their owning scope and keeps instances scoped', () => {
    const marker = new InjectionToken<string>('optional-scope-marker');
    const factory = vi.fn(() => ({ marker: inject(marker) }));
    const service = slot(factory);
    const parent = Injector.create({
      providers: [
        { provide: marker, useValue: 'parent' },
        service.provideOptionalSlot(),
      ],
    });
    const child = Injector.create({
      parent,
      providers: [{ provide: marker, useValue: 'child' }],
    });
    const local = Injector.create({
      parent,
      providers: [
        { provide: marker, useValue: 'local' },
        service.provideOptionalSlot(),
      ],
    });
    const inherited = ɵresolveOptionalService(service.OptionalSlot, child);
    expect(inherited).toEqual({ marker: 'parent' });
    expect(ɵresolveOptionalService(service.OptionalSlot, parent)).toBe(
      inherited,
    );
    expect(ɵresolveOptionalService(service.OptionalSlot, local)).toEqual({
      marker: 'local',
    });
    expect(factory).toHaveBeenCalledTimes(2);
    parent.destroy();
  });

  it('keeps global defaults and function service construction', () => {
    const globalFactory = vi.fn(() => ({ value: 'global' }));
    const global = ɵcraftValueService(
      { name: 'OptionalDefault', providedIn: 'global' },
      globalFactory,
    );
    const functionFactory = vi.fn(() => ({ value: 'function' }));
    const perCall = ɵcraftValueService(
      { name: 'OptionalFunction', providedIn: 'function' },
      functionFactory,
    );
    const injector = Injector.create({ providers: [] });
    const first = ɵresolveOptionalService(global.OptionalDefault, injector);
    expect(first).toEqual({ value: 'global' });
    expect(ɵresolveOptionalService(global.OptionalDefault, injector)).toBe(
      first,
    );
    expect(globalFactory).toHaveBeenCalledTimes(1);
    expect(ɵresolveOptionalService(perCall.OptionalFunction, injector)).toEqual(
      { value: 'function' },
    );
    ɵresolveOptionalService(perCall.OptionalFunction, injector);
    expect(functionFactory).toHaveBeenCalledTimes(2);
    injector.destroy();
  });

  it('composes collection providers across parent and child injectors', () => {
    const service = ɵcraftValueService(
      { name: 'OptionalCollection', providedIn: 'toProvide', collection: true },
      (inputs: { $provided: string }) => [inputs.$provided],
    );
    const parent = Injector.create({
      providers: [service.provideOptionalCollection('app')],
    });
    const child = Injector.create({
      parent,
      providers: [
        service.provideOptionalCollection('first'),
        service.provideOptionalCollection('second'),
      ],
    });
    expect(ɵresolveOptionalService(service.OptionalCollection, child)).toEqual([
      'app',
      'first',
      'second',
    ]);
    parent.destroy();
  });

  it('checks overrides before the token and observes later override changes', () => {
    const service = slot();
    const overrides = new Map<string, ServiceRuntimeOverride>();
    const injector = Injector.create({
      providers: [{ provide: SERVICE_RUNTIME_OVERRIDES, useValue: overrides }],
    });
    expect(ɵresolveOptionalService(service.OptionalSlot, injector)).toBe(
      ɵSERVICE_NOT_FOUND,
    );
    for (const value of [null, undefined, 'replacement']) {
      overrides.set('OptionalSlot', { kind: 'useValue', value });
      expect(ɵresolveOptionalService(service.OptionalSlot, injector)).toBe(
        value,
      );
    }
    overrides.set('OptionalSlot', { kind: 'instantiate' });
    expect(ɵresolveOptionalService(service.OptionalSlot, injector)).toBe(
      'provided',
    );
    overrides.set('OptionalSlot', { kind: 'notReached' });
    expect(() =>
      ɵresolveOptionalService(service.OptionalSlot, injector),
    ).toThrow('was registered as notReached');
    overrides.delete('OptionalSlot');
    expect(ɵresolveOptionalService(service.OptionalSlot, injector)).toBe(
      ɵSERVICE_NOT_FOUND,
    );
    injector.destroy();
  });

  it('propagates the original provider error through parent injectors', () => {
    const failure = new Error('provider construction failed');
    const service = slot(() => {
      throw failure;
    });
    const parent = Injector.create({
      providers: [service.provideOptionalSlot()],
    });
    const child = parent.createChild([]);
    expect(() => ɵresolveOptionalService(service.OptionalSlot, child)).toThrow(
      failure,
    );
    parent.destroy();
  });

  it('does not turn a missing provider dependency into an absent service', () => {
    const dependency = new InjectionToken('optional-slot-missing-dependency');
    const service = slot(() => inject(dependency));
    const parent = Injector.create({
      providers: [service.provideOptionalSlot()],
    });
    expect(() =>
      ɵresolveOptionalService(service.OptionalSlot, parent.createChild([])),
    ).toThrow(
      'No provider for Craft token "optional-slot-missing-dependency".',
    );
    parent.destroy();
  });

  it('uses the current injection context when no injector is supplied', () => {
    const service = slot();
    const injector = Injector.create({
      providers: [service.provideOptionalSlot()],
    });
    expect(
      injector.run(() => ɵresolveOptionalService(service.OptionalSlot)),
    ).toBe('provided');
    injector.destroy();
  });
});
