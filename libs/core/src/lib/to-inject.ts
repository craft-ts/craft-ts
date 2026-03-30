import {
  assertInInjectionContext,
  effect,
  inject,
  Injector,
  Signal,
  Type,
  untracked,
  WritableSignal,
} from '@angular/core';
import { Prettify } from './util/util.type';

type EntryBindings<Service> = Prettify<
  Partial<{
    [K in keyof Service as K extends `${infer EntryKey}Entry`
      ? Service[K] extends WritableSignal<infer Value>
        ? EntryKey
        : never
      : never]: Service[K] extends WritableSignal<infer Value>
      ? Signal<Value>
      : never;
  }>
>;

export type ToInjectBindings<Service> = EntryBindings<Service>;

// todo doc

/**
 * Creates an Angular `inject()` helper bound to a service and keeps selected
 * `...Entry` writable signals synchronized with external signals.
 *
 * Service properties ending with `Entry` are exposed as configuration keys
 * without the suffix.
 *
 * @example
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class MyService {
 *   myIdEntry = signal<string | undefined>(undefined);
 * }
 *
 * const injectMyService = toInject(MyService);
 *
 * @Component({})
 * class MyComponent {
 *   id = input<string>();
 *   myService = injectMyService({ myId: this.id });
 * }
 * ```
 */
export function toInject<Service>(
  token: Type<Service>,
): (bindings?: ToInjectBindings<Service>) => Service {
  function injectWithBindings(bindings?: ToInjectBindings<Service>) {
    assertInInjectionContext(injectWithBindings);

    const injector = inject(Injector);
    const service = inject(token);
    const resolvedBindings = Object.entries(bindings ?? {}).flatMap(
      ([bindingKey, bindingSource]) => {
        if (!bindingSource) {
          return [];
        }

        const serviceEntry = (service as Record<string, unknown>)[
          `${bindingKey}Entry`
        ];

        if (!isWritableSignal(serviceEntry)) {
          throw new Error(
            `toInject: "${bindingKey}Entry" must be a WritableSignal on ${token.name}.`,
          );
        }

        return [
          {
            bindingSource: bindingSource as Signal<unknown>,
            serviceEntry,
          },
        ];
      },
    );

    if (!resolvedBindings.length) {
      return service;
    }

    effect(
      () => {
        resolvedBindings.forEach(({ bindingSource, serviceEntry }) => {
          const nextValue = bindingSource();
          untracked(() => {
            serviceEntry.set(nextValue);
          });
        });
      },
      { injector },
    );

    return service;
  }

  return injectWithBindings;
}

function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
  return (
    typeof value === 'function' &&
    'set' in value &&
    typeof value.set === 'function'
  );
}
