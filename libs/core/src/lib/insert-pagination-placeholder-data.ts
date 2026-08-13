import { computed, Signal } from '@angular/core';
import {
  InsertionByIdParams,
  ResourceExceptionConstraints,
} from './query.core';
import {
  CraftResourceStatus,
  toCraftStatus,
} from './util/craft-resource-status';
import {
  createYieldableReactiveFacade,
  createYieldableReactiveValue,
  rawReactiveFacade,
  type YieldableReactiveValue,
} from './reactive-read';

/**
 * Base outputs produced by {@link insertPaginationPlaceholderData}.
 *
 * - `currentPageData`: the current page data, or the previous page data while the
 *   next page is loading (placeholder). Never `undefined`: falls back to `initialValue`.
 * - `currentPageStatus`: the `CraftResourceStatus` of the current page.
 * - `isPlaceHolderData`: whether placeholder (previous page) data is currently shown.
 * - `currentIdentifier`: the identifier of the current page.
 */
export type PaginationBaseOutputs<PageState> = {
  currentPageData: Signal<PageState>;
  currentPageStatus: Signal<CraftResourceStatus>;
  isPlaceHolderData: Signal<boolean>;
  currentIdentifier: Signal<string>;
};

type PublicPaginationBaseOutputs<PageState> = {
  currentPageData: YieldableReactiveValue<PageState, 'currentPageData'>;
  currentPageStatus: YieldableReactiveValue<
    CraftResourceStatus,
    'currentPageStatus'
  >;
  isPlaceHolderData: YieldableReactiveValue<boolean, 'isPlaceHolderData'>;
  currentIdentifier: YieldableReactiveValue<string, 'currentIdentifier'>;
};

/**
 * Passthrough pieces of the underlying insertion context exposed to the `build` callback.
 */
type PaginationContextPassthrough<PageState> = Pick<
  InsertionByIdParams<
    string,
    PageState & object,
    unknown,
    ResourceExceptionConstraints,
    {}
  >,
  | 'resourceById'
  | 'resourceParamsSrc'
  | 'identifier'
  | 'hasException'
  | 'exceptions'
>;

/**
 * Context passed to the optional `build` callback of {@link insertPaginationPlaceholderData}.
 *
 * In addition to the base pagination outputs, it exposes helpers scoped to the
 * **current page** (the data displayed), so custom computed/methods act on the
 * page the user is looking at rather than the global `Record<id, State>`.
 */
export type PaginationBuildContext<PageState> =
  PublicPaginationBaseOutputs<PageState> & {
    /** Current page data (or `initialValue` when not yet loaded). */
    state: YieldableReactiveValue<PageState, 'state'>;
    /** Replace the current page data. No-op if the page is not loaded yet. */
    set: (newValue: PageState) => PageState;
    /** Update the current page data from its previous value. */
    update: (updateFn: (current: PageState) => PageState) => PageState;
    /** Patch the current page data with a partial value. */
    patch: (patchFn: (current: PageState) => Partial<PageState>) => PageState;
  } & PaginationContextPassthrough<PageState>;

/**
 * Provides placeholder data during pagination transitions for a smoother user experience.
 *
 * When navigating between pages, this insertion shows the previous page's data while
 * the new page is loading, avoiding empty states during transitions.
 *
 * It is a **higher-order insertion**: call it with a `config` (and an optional `build`
 * callback) and pass the result to `query(...)`.
 *
 * - `config.initialValue` is both the default value **and** the type of a page: thanks to
 *   it, `currentPageData` is `Signal<PageState>` and is never `undefined`.
 * - The optional `build` callback lets you attach custom outputs (computed/methods)
 *   alongside the pagination outputs. Its helpers (`state`, `set`, `update`, `patch`)
 *   are scoped to the **current page** (the displayed data), never the global record.
 *
 * @example
 * ```typescript
 * const pagination = signal(1);
 *
 * const userQuery = craftUse(query(
 *   {
 *     params: pagination,
 *     identifier: (params) => '' + params,
 *     loader: async ({ params: page }) => fetchUsers(page),
 *   },
 *   insertPaginationPlaceholderData({ initialValue: [] as User[] }),
 * ));
 *
 * // Access the data (or placeholder during loading) — never undefined
 * const data = userQuery.currentPageData();
 * ```
 *
 * @example
 * With custom outputs via `build`:
 * ```typescript
 * const usersQuery = craftUse(query(
 *   {
 *     params: pagination,
 *     identifier: (params) => `${params.page}-${params.pageSize}`,
 *     loader: function* ({ params }) {
 *       return yield* ApiService.getDataList(params);
 *     },
 *   },
 *   insertPaginationPlaceholderData(
 *     { initialValue: [] as Data[] },
 *     ({ state, set }) => ({
 *       totalOfUnCompletedData: computed(
 *         () => state().filter((d) => !d.completed).length,
 *       ),
 *       markAsCompleted: (id: string) =>
 *         set(state().map((d) => (d.id === id ? { ...d, completed: true } : d))),
 *     }),
 *   ),
 * ));
 * ```
 */
export function insertPaginationPlaceholderData<
  PageState,
  ExtraOutputs extends Record<string, unknown> = {},
>(
  config: { initialValue: PageState },
  build?: (context: PaginationBuildContext<PageState>) => ExtraOutputs,
) {
  // The returned factory is generic over the query's shape (GroupIdentifier,
  // ResourceParams, Exceptions, PreviousInsertionsOutputs) so it adapts to any
  // query and its context stays precisely typed. Note: since the primitives
  // wrap every shape generic of their insertion slot in `NoInfer` (including
  // `Exceptions`), a factory can no longer degrade the primitive's inference —
  // the generic shape here is about the factory's own context typing. Only
  // `ResourceState` is fixed, to `PageState` (inferred from `config.initialValue`).
  return <
    GroupIdentifier extends string,
    ResourceParams,
    Exceptions extends ResourceExceptionConstraints,
    PreviousInsertionsOutputs,
  >(
    context: InsertionByIdParams<
      GroupIdentifier,
      PageState & object,
      ResourceParams,
      Exceptions,
      NoInfer<PreviousInsertionsOutputs>
    >,
  ): PaginationBaseOutputs<PageState> & ExtraOutputs => {
    const {
      resourceById,
      resourceParamsSrc,
      identifier,
      hasException,
      exceptions,
    } = context as unknown as InsertionByIdParams<
      string,
      PageState & object,
      unknown,
      ResourceExceptionConstraints,
      {}
    >;

    let previousPageKey: string | undefined;
    const showPlaceHolderData = computed(() => {
      const page = rawReactiveFacade(resourceParamsSrc)();
      const resources = rawReactiveFacade(resourceById)();
      const pageKey = page != null ? identifier(page) : undefined;
      if (!pageKey) {
        return false;
      }
      const currentResource = resources[pageKey];
      // true if loading and previousPage is used
      if (
        currentResource?.status() === 'loading' &&
        !currentResource?.value() &&
        previousPageKey !== undefined &&
        resources[previousPageKey]
      ) {
        return true;
      }
      return false;
    });

    const currentPageData = computed<PageState>(() => {
      const page = rawReactiveFacade(resourceParamsSrc)();
      const resources = rawReactiveFacade(resourceById)();
      const pageKey = page != null ? identifier(page) : undefined;
      if (!pageKey) {
        return config.initialValue;
      }
      const currentResource = resources[pageKey];

      if (showPlaceHolderData() && previousPageKey !== undefined) {
        return resources[previousPageKey]?.hasValue()
          ? (resources[previousPageKey]?.value() as PageState)
          : config.initialValue;
      }
      previousPageKey = pageKey;
      // keep a real value returned by the loader (e.g. []); only undefined falls back
      return (
        (currentResource?.value() as PageState | undefined) ??
        config.initialValue
      );
    });

    const currentPageStatus = computed<CraftResourceStatus>(() => {
      const page = rawReactiveFacade(resourceParamsSrc)();
      const resources = rawReactiveFacade(resourceById)();
      if (page == null) {
        return 'idle' as const; // avoid to handle the undefined check
      }
      const pageKey = identifier(page);
      const currentResource = resources[pageKey];
      const currentExceptions = rawReactiveFacade(exceptions)();
      const hasCurrentPageException =
        Object.keys(currentExceptions.params ?? {}).length > 0 ||
        currentExceptions.loader?.[pageKey] !== undefined;

      return toCraftStatus(
        currentResource?.status() ?? 'idle',
        hasCurrentPageException,
      );
    });

    const currentIdentifier = computed<string>(() => {
      const page = rawReactiveFacade(resourceParamsSrc)();
      if (page == null) {
        return '';
      }
      return identifier(page);
    });

    const baseOutputs: PaginationBaseOutputs<PageState> = {
      currentPageData,
      currentPageStatus,
      isPlaceHolderData: showPlaceHolderData,
      currentIdentifier,
    };

    if (!build) {
      return baseOutputs as PaginationBaseOutputs<PageState> & ExtraOutputs;
    }

    // Helpers scoped to the current page (the displayed data), not the global record.
    const currentPageKey = (): string | undefined => {
      const params = rawReactiveFacade(resourceParamsSrc)();
      return params != null ? identifier(params) : undefined;
    };
    const state = computed<PageState>(() => {
      const key = currentPageKey();
      const res = key ? rawReactiveFacade(resourceById)()[key] : undefined;
      return res?.hasValue() ? (res.value() as PageState) : config.initialValue;
    });
    const set = (newValue: PageState): PageState => {
      const key = currentPageKey();
      if (key) {
        // Use the page's CraftResourceRef directly. Do NOT use resourceById.set({...}),
        // which is destructive: it resets keys absent from the payload.
        // No-op if the page is not loaded yet (we only act on a displayed page).
        rawReactiveFacade(resourceById)()[key]?.set(
          newValue as PageState & object,
        );
      }
      return newValue;
    };
    const update = (updateFn: (current: PageState) => PageState): PageState =>
      set(updateFn(state()));
    const patch = (
      patchFn: (current: PageState) => Partial<PageState>,
    ): PageState =>
      update(
        (current) =>
          ({ ...(current as object), ...patchFn(current) }) as PageState,
      );

    const publicBaseOutputs = createYieldableReactiveFacade(baseOutputs, {
      name: 'pagination',
      primitive: 'insertPaginationPlaceholderData',
      path: 'pagination',
    }) as PublicPaginationBaseOutputs<PageState>;
    const extra = build({
      ...publicBaseOutputs,
      state: createYieldableReactiveValue(state, 'state', {
        primitive: 'insertPaginationPlaceholderData',
        path: 'pagination.state',
      }),
      set,
      update,
      patch,
      resourceById,
      resourceParamsSrc,
      identifier,
      hasException,
      exceptions,
    });

    return {
      ...baseOutputs,
      ...extra,
    } as PaginationBaseOutputs<PageState> & ExtraOutputs;
  };
}
