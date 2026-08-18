import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  ValueEqualityFn,
} from './host/craft-compat';
import { SignalSource, signalSource } from './signal-source';

export type SourceFromEvent<T> = SignalSource<T> & {
  dispose: () => void;
};

/**
 * Creates a source from DOM events with automatic cleanup on component destruction.
 *
 * This function bridges DOM events with craft-ts's reactive system by:
 * - Converting native DOM events to source emissions
 * - Automatically removing event listeners on component destruction
 * - Supporting optional event payload transformation
 * - Providing manual disposal capability
 * - Enabling event-driven query/mutation triggering
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
 * - Use source in queries/mutations via `afterRecomputation()`
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
 *   - `source`: Source options (equal)
 *
 * @returns A source that emits on DOM events with:
 *   - All standard source capabilities (set, preserveLastValue)
 *   - `dispose()`: Method to manually remove event listener
 *   - Automatic cleanup on component destruction
 *
 * @example
 * Basic click event source
 * ```ts
 * @Component({
 *   selector: 'app-clicker',
 *   template: '<button>Click me</button>',
 *   providers: [provideClickTrackerStore()],
 * })
 * export class ClickerComponent {
 *   store = ClickTrackerStore();
 *
 *   // Mutation executes automatically on click
 * }
 *
 * const { ClickTrackerStore, provideClickTrackerStore } = craftService(
 *   { name: 'ClickTrackerStore', providedIn: 'toProvide' },
 *   function* () {
 *     const hostElement = inject(ElementRef<HTMLElement>).nativeElement;
 *     const clickSource = sourceFromEvent<MouseEvent>(hostElement, 'click');
 *
 *     const trackClick = yield* mutation({
 *       method: afterRecomputation(clickSource, (event) => ({
 *         x: event.clientX,
 *         y: event.clientY,
 *       })),
 *       loader: async ({ params }) => {
 *         await fetch('/api/track-click', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return { tracked: true };
 *       },
 *     });
 *
 *     return { clickSource, trackClick };
 *   },
 * );
 * ```
 *
 * @example
 * Window scroll event with transformation
 * ```ts
 * @Component({
 *   selector: 'app-infinite-scroll',
 *   template: '...',
 *   providers: [provideInfiniteScrollStore()],
 * })
 * export class InfiniteScrollComponent {
 *   store = InfiniteScrollStore();
 * }
 *
 * const { InfiniteScrollStore, provideInfiniteScrollStore } = craftService(
 *   { name: 'InfiniteScrollStore', providedIn: 'toProvide' },
 *   function* () {
 *     const scrollSource = sourceFromEvent(window, 'scroll', {
 *       computedValue: () => ({
 *         scrollY: window.scrollY,
 *         scrollHeight: document.documentElement.scrollHeight,
 *         clientHeight: window.innerHeight,
 *       }),
 *       event: { passive: true }, // Optimize performance
 *     });
 *
 *     const checkLoadMore = yield* asyncProcess({
 *       method: afterRecomputation(scrollSource, (data) => data),
 *       loader: async ({ params }) => {
 *         const { scrollY, scrollHeight, clientHeight } = params;
 *         const nearBottom = scrollY + clientHeight >= scrollHeight - 100;
 *
 *         if (nearBottom) {
 *           // Load more data
 *           const response = await fetch('/api/load-more');
 *           return response.json();
 *         }
 *         return null;
 *       },
 *     });
 *
 *     return { scrollSource, checkLoadMore };
 *   },
 * );
 * ```
 *
 * @example
 * Form input event for real-time validation
 * ```ts
 * @Component({
 *   selector: 'app-search',
 *   template: '<input type="text" placeholder="Search..." />',
 *   providers: [provideSearchStore()],
 * })
 * export class SearchComponent {
 *   store = SearchStore();
 *
 *   // Query executes on input changes
 * }
 *
 * const { SearchStore, provideSearchStore } = craftService(
 *   { name: 'SearchStore', providedIn: 'toProvide' },
 *   function* () {
 *     const hostElement = inject(ElementRef<HTMLElement>).nativeElement;
 *     const inputSource = sourceFromEvent(hostElement, 'input', {
 *       computedValue: (event: Event) => {
 *         const target = event.target as HTMLInputElement;
 *         return target.value;
 *       },
 *     });
 *
 *     const results = yield* query({
 *       method: afterRecomputation(inputSource, (term) => term),
 *       loader: async ({ params }) => {
 *         if (params.length < 3) return [];
 *
 *         const response = await fetch(`/api/search?q=${params}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { inputSource, results };
 *   },
 * );
 * ```
 *
 * @example
 * Window resize event updating a state
 * ```ts
 * @Component({
 *   selector: 'app-responsive',
 *   template: '...',
 * })
 * export class ResponsiveComponent {
 *   resizeSource = sourceFromEvent(window, 'resize', {
 *     computedValue: () => ({
 *       width: window.innerWidth,
 *       height: window.innerHeight,
 *     }),
 *   });
 *
 *   dimensions = craftUse(state(
 *     { width: window.innerWidth, height: window.innerHeight },
 *     ({ set }) => ({
 *       // State updates automatically whenever resizeSource emits
 *       trackResize: afterRecomputation(this.resizeSource, (data) => {
 *         set(data);
 *       }),
 *     }),
 *   ));
 * }
 * ```
 *
 * @example
 * Custom DOM event
 * ```ts
 * @Component({
 *   selector: 'app-custom-events',
 *   template: '<div></div>',
 *   providers: [provideCustomEventsStore()],
 * })
 * export class CustomEventsComponent {
 *   private readonly _elementRef = inject(ElementRef<HTMLElement>);
 *   store = CustomEventsStore();
 *
 *   triggerCustomEvent() {
 *     const event = new CustomEvent('custom-event', {
 *       detail: { data: 'Hello from custom event' },
 *     });
 *     this._elementRef.nativeElement.dispatchEvent(event);
 *   }
 * }
 *
 * const { CustomEventsStore, provideCustomEventsStore } = craftService(
 *   { name: 'CustomEventsStore', providedIn: 'toProvide' },
 *   function* () {
 *     const hostElement = inject(ElementRef<HTMLElement>).nativeElement;
 *     const customEventSource = sourceFromEvent<CustomEvent<{ data: string }>>(
 *       hostElement,
 *       'custom-event',
 *       {
 *         computedValue: (event) => event.detail.data,
 *       },
 *     );
 *
 *     const handleCustomEvent = yield* asyncProcess({
 *       method: afterRecomputation(customEventSource, (data) => data),
 *       loader: async ({ params }) => {
 *         console.log('Custom event data:', params);
 *         return { processed: true };
 *       },
 *     });
 *
 *     return { customEventSource, handleCustomEvent };
 *   },
 * );
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
 *   private clickSource?: SourceFromEvent<MouseEvent>;
 *
 *   attachListener(element: HTMLElement) {
 *     // Remove previous listener if exists
 *     this.clickSource?.dispose();
 *
 *     // Attach to new element
 *     this.clickSource = sourceFromEvent<MouseEvent>(element, 'click');
 *
 *     // Use in store
 *     // ...
 *   }
 *
 *   detachListener() {
 *     // Manually remove listener before component destruction
 *     this.clickSource?.dispose();
 *     this.clickSource = undefined;
 *   }
 * }
 * ```
 *
 * @example
 * Multiple event sources for keyboard shortcuts
 * ```ts
 * @Component({
 *   selector: 'app-shortcuts',
 *   template: '...',
 *   providers: [provideShortcutsStore()],
 * })
 * export class ShortcutsComponent {
 *   store = ShortcutsStore();
 * }
 *
 * const { ShortcutsStore, provideShortcutsStore } = craftService(
 *   { name: 'ShortcutsStore', providedIn: 'toProvide' },
 *   function* () {
 *     const keydownSource = sourceFromEvent(document, 'keydown', {
 *       computedValue: (event: KeyboardEvent) => ({
 *         key: event.key,
 *         ctrlKey: event.ctrlKey,
 *         shiftKey: event.shiftKey,
 *         altKey: event.altKey,
 *       }),
 *     });
 *
 *     const handleShortcut = yield* asyncProcess({
 *       method: afterRecomputation(keydownSource, (data) => data),
 *       loader: async ({ params }) => {
 *         // Handle Ctrl+S
 *         if (params.ctrlKey && params.key === 's') {
 *           // Save action
 *           return { action: 'save' };
 *         }
 *         // Handle Ctrl+Z
 *         if (params.ctrlKey && params.key === 'z') {
 *           // Undo action
 *           return { action: 'undo' };
 *         }
 *         return null;
 *       },
 *     });
 *
 *     return { keydownSource, handleShortcut };
 *   },
 * );
 * ```
 */
export function sourceFromEvent<T>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: never;
    source: {
      equal?: ValueEqualityFn<NoInfer<T> | undefined>;
    };
  },
): SourceFromEvent<T>;
export function sourceFromEvent<T, ComputedValue>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue: (event: T) => ComputedValue;
    source?: {
      equal?: ValueEqualityFn<NoInfer<T> | undefined>;
    };
  },
): SourceFromEvent<ComputedValue>;
export function sourceFromEvent(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: (event: Event) => unknown;
    source?: {
      equal?: ValueEqualityFn<NoInfer<unknown> | undefined>;
    };
  },
): SourceFromEvent<unknown> {
  assertInInjectionContext(sourceFromEvent);
  const eventSignalSource = signalSource<unknown>(eventName, options?.source);

  const listener = (event: Event) => {
    if (options?.computedValue) {
      const computed = options.computedValue(event);
      eventSignalSource.set(computed);
      return;
    }
    eventSignalSource.set(event);
  };

  target.addEventListener(eventName, listener, options?.event);

  const destroyRef = inject(DestroyRef);

  const dispose = () => {
    target.removeEventListener(eventName, listener, options?.event);
  };

  destroyRef.onDestroy(() => {
    dispose();
  });

  return Object.assign(eventSignalSource, {
    dispose,
  });
}
