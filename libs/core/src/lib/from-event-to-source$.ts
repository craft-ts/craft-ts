import { assertInInjectionContext, DestroyRef, inject } from '@angular/core';
import { source$ } from './source$';
import {
  createNamedPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import type { ReadonlySource$ } from './source$';

type FromEventToSourceInstance<
  T,
  Name extends string = string,
> = ReadonlySource$<T, Name> & {
  dispose: () => void;
};

export type FromEventToSource$<
  T,
  Name extends string = string,
> = FromEventToSourceInstance<T, Name> &
  NamedCraftPrimitiveGen<Name, FromEventToSourceInstance<T, Name>>;

/**
 * Converts DOM events to a ReadonlySource$ stream with automatic cleanup on component destruction.
 *
 * This function bridges DOM events with ng-craft's source$ reactive system by:
 * - Converting native DOM events to source emissions
 * - Automatically removing event listeners on component destruction
 * - Supporting optional event payload transformation
 * - Providing manual disposal capability
 * - Returning a readonly source with `subscribe` and `value` properties
 *
 * @remarks
 * **Automatic Cleanup:**
 * - Event listeners are automatically removed when the injection context is destroyed
 * - Uses Angular's `DestroyRef` for lifecycle management
 * - Manual cleanup available via `dispose()` method
 * - Prevents memory leaks from dangling event listeners
 *
 * **Use Cases:**
 * - **User interactions**: Click, input, scroll, keyboard events
 * - **Window events**: Resize, scroll, focus, online/offline
 * - **Document events**: Visibility changes, custom events
 * - **Media events**: Video/audio play, pause, ended
 * - **Form events**: Submit, change, input
 * - **Custom events**: Application-specific DOM events
 *
 * **Event Transformation:**
 * - Without `computedValue`: Emits the raw event object
 * - With `computedValue`: Transforms event before emission
 * - Useful for extracting specific event properties
 * - Reduces payload size and improves type safety
 *
 * **Integration with Stores:**
 * - Use the readonly source in queries/mutations via `on$()`
 * - Trigger async operations on DOM events
 * - Coordinate multiple components via event sources
 *
 * **Injection Context:**
 * - Must be called within Angular injection context
 * - Typically called in component constructor or class fields
 * - Uses `assertInInjectionContext()` for safety
 *
 * @template T - The type of the event object
 * @template ComputedValue - The type after optional transformation
 *
 * @param target - The DOM element or event target to listen to.
 *   Can be any EventTarget (HTMLElement, Window, Document, etc.)
 *
 * @param eventName - The name of the event to listen for.
 *   Standard DOM event names: 'click', 'input', 'scroll', etc.
 *
 * @param options - Optional configuration:
 *   - `event`: Event listener options (capture, passive, once, etc.)
 *   - `computedValue`: Function to transform event before emission
 *
 * @returns A readonly source that emits on DOM events with:
 *   - `subscribe()`: Subscribe to event emissions
 *   - `value`: Signal containing the last emitted value
 *   - `dispose()`: Method to manually remove event listener
 *   - Automatic cleanup on component destruction
 *
 * @example
 * Basic click event source
 * ```ts
 * @Component({
 *   selector: 'app-clicker',
 *   template: '<button #btn>Click me</button>',
 * })
 * export class ClickerComponent {
 *   @ViewChild('btn', { read: ElementRef }) button!: ElementRef<HTMLButtonElement>;
 *
 *   click$ = fromEventToSource$<MouseEvent>(
 *     this.button.nativeElement,
 *     'click'
 *   );
 *
 *   counter = craftUse(state(0, ({ update }) => ({
 *     increment: on$(this.click$, () => update((v) => v + 1)),
 *   })));
 * }
 * ```
 *
 * @example
 * Window scroll event with transformation
 * ```ts
 * @Component({
 *   selector: 'app-infinite-scroll',
 *   template: '...',
 * })
 * export class InfiniteScrollComponent {
 *   scroll$ = fromEventToSource$(window, 'scroll', {
 *     computedValue: () => ({
 *       scrollY: window.scrollY,
 *       scrollHeight: document.documentElement.scrollHeight,
 *       clientHeight: window.innerHeight,
 *     }),
 *     event: { passive: true },
 *   });
 *
 *   // Access scroll position via signal
 *   scrollPosition = this.scroll$.value;
 *
 *   // Subscribe to scroll events
 *   ngOnInit() {
 *     this.scroll$.subscribe((data) => {
 *       const nearBottom = data.scrollY + data.clientHeight >= data.scrollHeight - 100;
 *       if (nearBottom) {
 *         // Load more data
 *       }
 *     });
 *   }
 * }
 * ```
 *
 * @example
 * Form input event for real-time search
 * ```ts
 * @Component({
 *   selector: 'app-search',
 *   template: '<input #searchInput type="text" placeholder="Search..." />',
 * })
 * export class SearchComponent {
 *   @ViewChild('searchInput', { read: ElementRef }) input!: ElementRef<HTMLInputElement>;
 *
 *   input$ = fromEventToSource$(this.input.nativeElement, 'input', {
 *     computedValue: (event: Event) => {
 *       const target = event.target as HTMLInputElement;
 *       return target.value;
 *     },
 *   });
 *
 *   // Current input value as signal
 *   searchTerm = this.input$.value;
 *
 *   // React to input changes
 *   searchResults = craftUse(state([], ({ set }) => ({
 *     search: on$(this.input$, async (term) => {
 *       if (term.length < 3) {
 *         set([]);
 *         return;
 *       }
 *       const results = await fetchResults(term);
 *       set(results);
 *     }),
 *   })));
 * }
 * ```
 *
 * @example
 * Window resize event
 * ```ts
 * @Component({
 *   selector: 'app-responsive',
 *   template: '...',
 * })
 * export class ResponsiveComponent {
 *   resize$ = fromEventToSource$(window, 'resize', {
 *     computedValue: () => ({
 *       width: window.innerWidth,
 *       height: window.innerHeight,
 *     }),
 *   });
 *
 *   dimensions = this.resize$.value;
 * }
 * ```
 *
 * @example
 * Manual disposal for dynamic elements
 * ```ts
 * @Component({
 *   selector: 'app-dynamic',
 *   template: '...',
 * })
 * export class DynamicComponent {
 *   private click$?: FromEventToSource$<MouseEvent>;
 *
 *   attachListener(element: HTMLElement) {
 *     // Remove previous listener if exists
 *     this.click$?.dispose();
 *
 *     // Attach to new element
 *     this.click$ = fromEventToSource$<MouseEvent>(element, 'click');
 *   }
 *
 *   detachListener() {
 *     // Manually remove listener before component destruction
 *     this.click$?.dispose();
 *     this.click$ = undefined;
 *   }
 * }
 * ```
 *
 * @see {@link https://ng-craft.dev/utils/from-event-to-source$ | fromEventToSource$ documentation}
 */
export function fromEventToSource$<T, Name extends string = string>(
  target: EventTarget,
  eventName: Name,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: never;
  },
): FromEventToSource$<T, Name>;
export function fromEventToSource$<
  T,
  ComputedValue,
  Name extends string = string,
>(
  target: EventTarget,
  eventName: Name,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue: (event: T) => ComputedValue;
  },
): FromEventToSource$<ComputedValue, Name>;
export function fromEventToSource$(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: (event: Event) => unknown;
  },
): FromEventToSource$<unknown> {
  assertInInjectionContext(fromEventToSource$);

  const eventSource$ = source$<unknown>(eventName);

  const listener = (event: Event) => {
    if (options?.computedValue) {
      const computed = options.computedValue(event);
      eventSource$.emit(computed);
      return;
    }
    eventSource$.emit(event);
  };

  target.addEventListener(eventName, listener, options?.event);

  const destroyRef = inject(DestroyRef);

  const dispose = () => {
    target.removeEventListener(eventName, listener, options?.event);
  };

  destroyRef.onDestroy(() => {
    dispose();
  });

  const source = Object.assign(eventSource$.asReadonly(), {
    dispose,
  }) as ReadonlySource$<unknown> & { dispose: () => void };
  const generator = createNamedPrimitiveGen(eventName, source);

  return Object.assign(generator, source) as FromEventToSource$<unknown>;
}
