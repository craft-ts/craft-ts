import {
  assertInInjectionContext,
  inject,
  Injector,
  InjectionToken,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';

type ComponentMonitoringFactory =
  | (() => void)
  | (() => Generator<unknown, void, unknown>);

export const COMPONENT_MONITORING =
  new InjectionToken<ComponentMonitoringFactory>('COMPONENT_MONITORING', {
    providedIn: 'root',
    factory: () => () => undefined,
  });

export function componentMonitoring(): void {
  assertInInjectionContext(componentMonitoring);
  const monitor = inject(COMPONENT_MONITORING);
  const injector = inject(Injector);

  runInInjectionContext(injector, () => {
    const result = monitor();
    if (isGenerator(result)) {
      runCraftGenerator({
        iterator: result,
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage:
          'componentMonitoring generators can only yield craftService dependencies.',
        multipleAppStartErrorMessage:
          'componentMonitoring does not support onAppStart.',
        onAppStartNotSupportedErrorMessage:
          'componentMonitoring does not support onAppStart.',
      });
    }
  });
}

export function provideComponentMonitoring(
  fn: ComponentMonitoringFactory,
): Provider {
  return { provide: COMPONENT_MONITORING, useValue: fn };
}
