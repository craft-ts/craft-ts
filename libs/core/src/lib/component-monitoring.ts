import {
  assertInInjectionContext,
  inject,
  Injector,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';
import { craftService } from './craft-service';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';

type ComponentMonitoringFactory =
  | (() => void)
  | (() => Generator<unknown, void, unknown>);

const componentMonitoringService = craftService(
  { name: 'ComponentMonitoring', providedIn: 'toProvide' },
  (inputs: { $provided: ComponentMonitoringFactory }) => inputs.$provided,
) as unknown as {
  provideComponentMonitoring: (value: ComponentMonitoringFactory) => unknown;
  COMPONENT_MONITORING_META_DATA: { inject(): ComponentMonitoringFactory };
};

export const ɵinjectComponentMonitoring = (): ComponentMonitoringFactory => {
  try {
    return componentMonitoringService.COMPONENT_MONITORING_META_DATA.inject();
  } catch {
    return () => undefined;
  }
};

export function componentMonitoring(): void {
  assertInInjectionContext(componentMonitoring);
  const monitor = ɵinjectComponentMonitoring();
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
  return componentMonitoringService.provideComponentMonitoring(fn) as Provider;
}
