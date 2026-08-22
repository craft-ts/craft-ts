import { inject, InjectionToken, Injector } from './host/craft-compat';
import { describe, expect, it } from 'vitest';
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
