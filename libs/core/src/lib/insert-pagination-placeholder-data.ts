import { Signal } from './host/craft-compat';
import { craftComputed } from './craft-computed';
import { isGenerator } from './craft-generator-runtime';
import { settled, type CraftSettledBrand } from './craft-settled';
import {
  InsertionByIdParams,
  ResourceExceptionConstraints,
  YieldableInsertionWrite,
} from './query.core';
import type { CraftResourceRef } from './util/craft-resource-ref';
import {
  CraftResourceStatus,
  toCraftStatus,
} from './util/craft-resource-status';
import {
  createYieldableReactiveFacade,
  rawReactiveFacade,
  type ReactiveReadRequest,
  type YieldableReactiveValue,
} from './reactive-read';

function* readPaginationReactive<T>(
  reader: () => T | Generator<ReactiveReadRequest<T>, T, unknown>,
): Generator<ReactiveReadRequest<T>, T, unknown> {
  const value = reader();
  return isGenerator(value) ? yield* value : value;
}

/**
 * Base outputs produced by {@link insertPaginationPlaceholderData}.
 *
 * - `currentPageData`: the current page data, or the previous page data while the
 *   next page is loading (placeholder). Never `undefined`: falls back to `initialValue`.
 * - `currentPageStatus`: the `CraftResourceStatus` of the current page.
 * - `isPlaceHolderData`: whether placeholder (previous page) data is currently shown.
 * - `currentIdentifier`: the identifier of the current page.
 */
export type PaginationBaseOutputs<
  PageState,
  PrimitiveName extends string = string,
  SettledExceptions = never,
> = {
  currentPageData: Signal<PageState>;
  currentPageStatus: YieldableReactiveValue<
    CraftResourceStatus,
    'currentPageStatus'
  > &
    CraftSettledBrand<PrimitiveName, SettledExceptions>;
  isPlaceHolderData: Signal<boolean>;
  currentIdentifier: Signal<string>;
};

type PublicPaginationBaseOutputs<
  PageState,
  PrimitiveName extends string = string,
  SettledExceptions = never,
> = {
  currentPageData: YieldableReactiveValue<PageState, 'currentPageData'>;
  currentPageStatus: YieldableReactiveValue<
    CraftResourceStatus,
    'currentPageStatus'
  > &
    CraftSettledBrand<PrimitiveName, SettledExceptions>;
  isPlaceHolderData: YieldableReactiveValue<boolean, 'isPlaceHolderData'>;
  currentIdentifier: YieldableReactiveValue<string, 'currentIdentifier'>;
};

/**
 * Passthrough pieces of the underlying insertion context exposed to the `build` callback.
 */
type PaginationContextPassthrough<
  PageState,
  PrimitiveName extends string = string,
  Exceptions extends
    ResourceExceptionConstraints = ResourceExceptionConstraints,
> = Pick<
  InsertionByIdParams<
    string,
    PageState & object,
    unknown,
    Exceptions,
    {},
    PrimitiveName
  >,
  | 'resourceById'
  | 'resourceParamsSrc'
  | 'identifier'
  | 'hasException'
  | 'exceptions'
  | 'settledState'
>;

/**
 * Context passed to the optional `build` callback of {@link insertPaginationPlaceholderData}.
 *
 * In addition to the base pagination outputs, it exposes helpers scoped to the
 * **current page** (the data displayed), so custom computed/methods act on the
 * page the user is looking at rather than the global `Record<id, State>`.
 */
export type PaginationBuildContext<
  PageState,
  PrimitiveName extends string = string,
  Exceptions extends
    ResourceExceptionConstraints = ResourceExceptionConstraints,
> = PublicPaginationBaseOutputs<
  PageState,
  PrimitiveName,
  Exceptions['params'] | Exceptions['loader']
> & {
  /**
   * The data on screen: the current page's, or the previous page's while the
   * current one loads. Matches what `currentPageData` renders, so a derived
   * count cannot disagree with the visible rows.
   */
  state: YieldableReactiveValue<PageState, 'state'>;
  /** Current page data only when the current page has settled; suspends otherwise. */
  settledState: PaginationContextPassthrough<
    PageState,
    PrimitiveName,
    Exceptions
  >['settledState'];
  /** Replace the current page data. No-op if the page is not loaded yet. */
  set: YieldableInsertionWrite<[newValue: PageState], PageState>;
  /** Update the current page data from its previous value. */
  update: YieldableInsertionWrite<
    [updateFn: (current: PageState) => PageState],
    PageState
  >;
  /** Patch the current page data with a partial value. */
  patch: YieldableInsertionWrite<
    [patchFn: (current: PageState) => Partial<PageState>],
    PageState
  >;
} & PaginationContextPassthrough<PageState, PrimitiveName, Exceptions>;

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
 *   it, `currentPageData` is a yieldable reader for `PageState` and is never `undefined`.
 * - The optional `build` callback lets you attach custom outputs (computed/methods)
 *   alongside the pagination outputs. Its helpers (`state`, `set`, `update`, `patch`)
 *   are scoped to the **current page** (the displayed data), never the global record.
 *
 * @example
 * ```typescript
 * const pagination = signal(1);
 *
 * const userQuery = yield* query(
 *   {
 *     params: pagination,
 *     identifier: (params) => '' + params,
 *     loader: async ({ params: page }) => fetchUsers(page),
 *   },
 *   insertPaginationPlaceholderData({ initialValue: [] as User[] }),
 * ));
 *
 * // Access the data (or placeholder during loading) — never undefined
 * const data = yield* userQuery.currentPageData();
 * ```
 *
 * @example
 * With custom outputs via `build`:
 * ```typescript
 * const usersQuery = yield* query(
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
 *       totalOfUnCompletedData: craftComputed(function* () {
 *         return (yield* state()).filter((d) => !d.completed).length;
 *       }),
 *       markAsCompleted: function* (id: string) {
 *         const current = yield* state();
 *         return yield* set(
 *           current.map((d) => (d.id === id ? { ...d, completed: true } : d)),
 *         );
 *       },
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
    PrimitiveName extends string,
  >(
    context: InsertionByIdParams<
      GroupIdentifier,
      PageState & object,
      ResourceParams,
      Exceptions,
      NoInfer<PreviousInsertionsOutputs>,
      PrimitiveName
    >,
  ): PaginationBaseOutputs<
    PageState,
    PrimitiveName,
    Exceptions['params'] | Exceptions['loader']
  > &
    ExtraOutputs => {
    const {
      resourceById,
      resourceParamsSrc,
      identifier,
      hasException,
      exceptions,
      settledState,
    } = context as unknown as InsertionByIdParams<
      string,
      PageState & object,
      unknown,
      ResourceExceptionConstraints,
      {},
      PrimitiveName
    >;

    /**
     * The rows currently on screen, whichever page they came from.
     *
     * This used to be tracked as a previous page KEY, which could not survive
     * the case it exists for: on a page change the incoming page has no
     * resource yet, so there was no 'loading' status to recognise, the
     * placeholder branch was skipped, and the key was overwritten with the new
     * page before it could ever be used — the list blanked on every
     * navigation. Holding the VALUE needs neither the old resource to still be
     * cached nor the new one to exist yet.
     */
    let lastShownValue: PageState | undefined;

    const currentPageValue = function* (): Generator<
      unknown,
      { readonly pageKey: string | undefined; readonly hasOwnValue: boolean },
      unknown
    > {
      const page = yield* readPaginationReactive(resourceParamsSrc);
      const resources = (yield* readPaginationReactive(
        resourceById,
      )) as Partial<
        Record<string, CraftResourceRef<PageState & object, unknown>>
      >;
      const pageKey = page != null ? identifier(page) : undefined;
      return {
        pageKey,
        hasOwnValue:
          pageKey !== undefined && resources[pageKey]?.value() !== undefined,
      };
    };

    const showPlaceHolderData = craftComputed(
      'showPlaceHolderData',
      function* () {
        const { pageKey, hasOwnValue } = yield* currentPageValue();
        if (!pageKey) {
          return false;
        }
        // Placeholder: the page in the URL has nothing of its own yet, and
        // rows from an earlier one are still on screen.
        return !hasOwnValue && lastShownValue !== undefined;
      },
    );

    const currentPageData = craftComputed('currentPageData', function* () {
      const { pageKey, hasOwnValue } = yield* currentPageValue();
      if (pageKey !== undefined && hasOwnValue) {
        const settled = (yield* settledState()) as PageState;
        lastShownValue = settled;
        return settled;
      }
      if (lastShownValue === undefined) {
        const resources = (yield* readPaginationReactive(
          resourceById,
        )) as Partial<
          Record<string, CraftResourceRef<PageState & object, unknown>>
        >;
        // A page can change before its rows were read (for example, a store
        // test can wait only for the loader). Recover the most recently
        // inserted resolved page so the placeholder still has something to
        // display while the new page is loading.
        for (const resource of Object.values(resources).reverse()) {
          const value = resource?.value();
          if (value !== undefined) {
            lastShownValue = value as PageState;
            break;
          }
        }
      }
      // Nothing for this page yet: keep what is already on screen instead of
      // blanking the list, which is the entire point of the placeholder.
      return lastShownValue ?? config.initialValue;
    });

    const currentPageStatus = craftComputed('currentPageStatus', function* () {
      const page = yield* readPaginationReactive(resourceParamsSrc);
      const resources = (yield* readPaginationReactive(
        resourceById,
      )) as Partial<
        Record<string, CraftResourceRef<PageState & object, unknown>>
      >;
      if (page == null) {
        return 'idle' as const; // avoid to handle the undefined check
      }
      const pageKey = identifier(page);
      const currentResource = resources[pageKey];
      const currentExceptions = yield* readPaginationReactive(exceptions);
      const hasCurrentPageException =
        Object.keys(currentExceptions.params ?? {}).length > 0 ||
        currentExceptions.loader?.[pageKey] !== undefined;

      // Status is also a settled read while the current page has no value.
      // This makes the status binding suspend during the initial/page load,
      // while preserving the visible exception status and stale status during
      // reloads of an already resolved page.
      if (!hasCurrentPageException && currentResource?.value() === undefined) {
        yield* settled({ settledValue: settledState });
      }

      return toCraftStatus(
        currentResource?.status() ?? 'idle',
        hasCurrentPageException,
      );
    }) as unknown as PaginationBaseOutputs<
      PageState,
      PrimitiveName,
      Exceptions['params'] | Exceptions['loader']
    >['currentPageStatus'];

    const currentIdentifier = craftComputed('currentIdentifier', function* () {
      const page = yield* readPaginationReactive(resourceParamsSrc);
      if (page == null) {
        return '';
      }
      return identifier(page);
    });

    const baseOutputs: PaginationBaseOutputs<
      PageState,
      PrimitiveName,
      Exceptions['params'] | Exceptions['loader']
    > = {
      currentPageData,
      currentPageStatus,
      isPlaceHolderData: showPlaceHolderData,
      currentIdentifier,
    };

    if (!build) {
      return baseOutputs as PaginationBaseOutputs<
        PageState,
        PrimitiveName,
        Exceptions['params'] | Exceptions['loader']
      > &
        ExtraOutputs;
    }

    // Helpers scoped to the current page (the displayed data), not the global record.
    const currentPageKey = (): string | undefined => {
      const params = rawReactiveFacade(resourceParamsSrc)();
      return params != null ? identifier(params) : undefined;
    };
    /**
     * What the page in the URL holds by itself — no placeholder.
     *
     * Writes are anchored here rather than on `state`: `set` targets the
     * current page, so basing an update on rows that still belong to the
     * PREVIOUS one would compute the new value from the wrong page.
     */
    const currentPageOwnValue = (): PageState => {
      const params = rawReactiveFacade(resourceParamsSrc)();
      const resources = rawReactiveFacade(resourceById)() as Partial<
        Record<string, CraftResourceRef<PageState & object, unknown>>
      >;
      const key = params != null ? identifier(params) : undefined;
      const res = key ? resources[key] : undefined;
      return res?.hasValue() ? (res.value() as PageState) : config.initialValue;
    };

    /**
     * What the reader SEES, placeholder included — the same value the rows are
     * rendered from.
     *
     * It used to report the current page's own data, which is `initialValue`
     * for as long as that page is loading. Anything derived from it — a count,
     * a summary — then contradicted the list still on screen: "0 on page"
     * above four visible rows. `settledState` stays the strict reading for
     * code that must wait for the page it actually asked for.
     */
    const state = craftComputed('state', function* () {
      return yield* currentPageData();
    });
    const set: YieldableInsertionWrite<[PageState], PageState> = function* (
      newValue,
    ) {
      const key = currentPageKey();
      if (key) {
        // Use the page's CraftResourceRef directly. Do NOT use resourceById.set({...}),
        // which is destructive: it resets keys absent from the payload.
        // No-op if the page is not loaded yet (we only act on a displayed page).
        const resources = rawReactiveFacade(resourceById)() as Partial<
          Record<string, CraftResourceRef<PageState & object, unknown>>
        >;
        resources[key]?.set(newValue as PageState & object);
      }
      return newValue;
    };
    const update: YieldableInsertionWrite<
      [(current: PageState) => PageState],
      PageState
    > = function* (updateFn) {
      return yield* set(updateFn(currentPageOwnValue()));
    };
    const patch: YieldableInsertionWrite<
      [(current: PageState) => Partial<PageState>],
      PageState
    > = function* (patchFn) {
      return yield* update(
        (current) =>
          ({ ...(current as object), ...patchFn(current) }) as PageState,
      );
    };

    const publicBaseOutputs = createYieldableReactiveFacade(baseOutputs, {
      name: 'pagination',
      primitive: 'insertPaginationPlaceholderData',
      path: 'pagination',
    }) as PublicPaginationBaseOutputs<
      PageState,
      PrimitiveName,
      Exceptions['params'] | Exceptions['loader']
    >;
    const extra = build({
      ...publicBaseOutputs,
      state,
      settledState,
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
    } as PaginationBaseOutputs<
      PageState,
      PrimitiveName,
      Exceptions['params'] | Exceptions['loader']
    > &
      ExtraOutputs;
  };
}
