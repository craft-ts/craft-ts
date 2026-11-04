import { inject, InjectionToken, Injector } from './host/craft-compat';
import { describe, expect, it, vi } from 'vitest';
import {
  getRegisteredServices,
  getServiceMetaData,
  SERVICE_RUNTIME_OVERRIDES,
  ɵgetServiceInjectionToken,
} from './craft-service';
import {
  executeTemplateTrace,
  provideTemplateTrace,
  type TemplateTraceContext,
} from './template-trace';
import { provideCraftProduction } from './craft-runtime-mode';

describe('template trace', () => {
  const context: TemplateTraceContext = {
    kind: 'component',
    phase: 'initialRender',
    componentName: ' traced-component ',
    name: 'template',
    renderCount: 1,
  };

  it('renders without constructing missing-provider errors when no traces are provided', () => {
    const injector = Injector.create({ providers: [] }).createChild([]);
    const missingErrors: string[] = [];
    const NativeError = Error;
    vi.stubGlobal(
      'Error',
      new Proxy(NativeError, {
        construct(target, args) {
          if (
            String(args[0]).includes(
              'No provider for Craft token "TemplateTracesServiceToken"',
            )
          ) {
            missingErrors.push(String(args[0]));
          }
          return Reflect.construct(target, args);
        },
      }),
    );
    try {
      expect(
        executeTemplateTrace(injector, context, () => ['rendered']),
      ).toEqual(['rendered']);
      expect(missingErrors).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      injector.destroy();
    }
  });

  it('inherits application wrappers and runs every wrapper in the render context', () => {
    const marker = new InjectionToken<string>('trace-inherited-marker');
    const events: string[] = [];
    const application = Injector.create({
      providers: [
        { provide: marker, useValue: 'application' },
        provideTemplateTrace((_trace, next) => {
          events.push(`application:before:${inject(marker)}`);
          const result = next();
          events.push(`application:after:${inject(marker)}`);
          return result;
        }),
      ],
    });
    const component = Injector.create({
      parent: application,
      providers: [
        { provide: marker, useValue: 'component' },
        provideTemplateTrace((_trace, next) => {
          events.push(`component:before:${inject(marker)}`);
          const result = next();
          events.push(`component:after:${inject(marker)}`);
          return result;
        }),
      ],
    });
    expect(
      executeTemplateTrace(component, context, () => ['rendered']),
    ).toEqual(['rendered']);
    expect(events).toEqual([
      'application:before:component',
      'component:before:component',
      'component:after:component',
      'application:after:component',
    ]);
    application.destroy();
  });

  it('uses current service overrides even after an absent lookup', () => {
    const overrides = new Map();
    const injector = Injector.create({
      providers: [{ provide: SERVICE_RUNTIME_OVERRIDES, useValue: overrides }],
    });
    const events: string[] = [];
    expect(executeTemplateTrace(injector, context, () => ['rendered'])).toEqual(
      ['rendered'],
    );
    overrides.set('TemplateTraces', {
      kind: 'useValue',
      value: [
        (_trace: TemplateTraceContext, next: () => unknown) => {
          events.push('override');
          return next();
        },
      ],
    });
    executeTemplateTrace(injector, context, () => []);
    expect(events).toEqual(['override']);
    overrides.delete('TemplateTraces');
    executeTemplateTrace(injector, context, () => []);
    expect(events).toEqual(['override']);
    injector.destroy();
  });

  it('propagates a forbidden trace override instead of treating it as absent', () => {
    const injector = Injector.create({
      providers: [
        {
          provide: SERVICE_RUNTIME_OVERRIDES,
          useValue: new Map([['TemplateTraces', { kind: 'notReached' }]]),
        },
      ],
    });
    expect(() => executeTemplateTrace(injector, context, () => [])).toThrow(
      'Craft service "TemplateTraces" was registered as notReached but was resolved.',
    );
    injector.destroy();
  });

  it('preserves the original trace provider error through inherited resolution', () => {
    const reference = getRegisteredServices().find(
      (service) => getServiceMetaData(service).name === 'TemplateTraces',
    )!;
    const token = ɵgetServiceInjectionToken(reference)!;
    const failure = new Error('trace provider failed');
    const application = Injector.create({
      providers: [
        {
          provide: token,
          useFactory: () => {
            throw failure;
          },
        },
      ],
    });
    const component = application.createChild([]);
    expect(() => executeTemplateTrace(component, context, () => [])).toThrow(
      failure,
    );
    application.destroy();
  });

  it('does not resolve traces at all in production', () => {
    const reference = getRegisteredServices().find(
      (service) => getServiceMetaData(service).name === 'TemplateTraces',
    )!;
    const token = ɵgetServiceInjectionToken(reference)!;
    const resolveTraces = vi.fn(() => {
      throw new Error('must not resolve trace providers');
    });
    const injector = Injector.create({
      providers: [
        provideCraftProduction(),
        { provide: token, useFactory: resolveTraces },
      ],
    });
    expect(
      executeTemplateTrace(injector, context, () => ['production']),
    ).toEqual(['production']);
    expect(resolveTraces).not.toHaveBeenCalled();
    injector.destroy();
  });

  it('propagates the original wrapper error', () => {
    const failure = new Error('wrapper failed');
    const injector = Injector.create({
      providers: [
        provideTemplateTrace(() => {
          throw failure;
        }),
      ],
    });
    expect(() => executeTemplateTrace(injector, context, () => [])).toThrow(
      failure,
    );
    injector.destroy();
  });

  it('composes wrappers in registration order and preserves their injector', () => {
    const marker = new InjectionToken<string>('template-trace-marker');
    const events: string[] = [];
    const injector = Injector.create({
      providers: [
        { provide: marker, useValue: 'component-scope' },
        provideTemplateTrace((trace, next) => {
          events.push(`before:${trace.phase}:${inject(marker)}`);
          const result = next();
          events.push('after:outer');
          return result;
        }),
        provideTemplateTrace((_trace, next) => {
          events.push('before:inner');
          const result = next();
          events.push('after:inner');
          return result;
        }),
      ],
    });

    const result = executeTemplateTrace(injector, context, () => ['rendered']);

    expect(result).toEqual(['rendered']);
    expect(events).toEqual([
      'before:initialRender:component-scope',
      'before:inner',
      'after:inner',
      'after:outer',
    ]);
  });

  it('allows a wrapper to replace or block the children', () => {
    const injector = Injector.create({
      providers: [
        provideTemplateTrace((_trace, next) => {
          const children = next() as readonly string[];
          return [...children, 'replacement'];
        }),
      ],
    });

    expect(executeTemplateTrace(injector, context, () => ['original'])).toEqual(
      ['original', 'replacement'],
    );

    const blockedInjector = Injector.create({
      providers: [provideTemplateTrace(() => [])],
    });
    expect(
      executeTemplateTrace(blockedInjector, context, () => ['original']),
    ).toEqual([]);
  });

  it('propagates errors from the wrapped render', () => {
    const injector = Injector.create({
      providers: [
        provideTemplateTrace((_trace, next) => {
          try {
            return next();
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            throw error;
          }
        }),
      ],
    });
    const failure = new Error('render failed');

    expect(() =>
      executeTemplateTrace(injector, context, () => {
        throw failure;
      }),
    ).toThrow(failure);
  });

  it('skips trace wrappers in production mode', () => {
    const events: string[] = [];
    const injector = Injector.create({
      providers: [
        provideCraftProduction(),
        provideTemplateTrace((_trace, next) => {
          events.push('trace');
          return next();
        }),
      ],
    });

    expect(executeTemplateTrace(injector, context, () => ['rendered'])).toEqual(
      ['rendered'],
    );
    expect(events).toEqual([]);
  });
});
