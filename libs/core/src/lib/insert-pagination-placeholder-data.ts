import { computed } from '@angular/core';
import {
  InsertionByIdParams,
  ResourceExceptionConstraints,
} from './query.core';

/**
 * Provides placeholder data during pagination transitions for a smoother user experience.
 *
 * When navigating between pages, this insertion shows the previous page's data while
 * the new page is loading, avoiding empty states during transitions.
 *
 * @returns An object containing:
 * - `currentPageData`: Signal with the current page data or placeholder data during loading
 * - `currentPageStatus`: Signal with the ResourceStatus of the current page
 * - `isPlaceHolderData`: Signal indicating if placeholder data is being shown
 * - `currentIdentifier`: Signal with the current page identifier
 *
 * @example
 * ```typescript
 * const pagination = signal(1);
 *
 * const userQuery = query(
 *   {
 *     params: pagination,
 *     identifier: (params) => '' + params,
 *     loader: async ({ params: page }) => fetchUsers(page),
 *   },
 *   insertPaginationPlaceholderData,
 * );
 *
 * // Access the data (or placeholder during loading)
 * const data = userQuery.currentPageData();
 *
 * // Check if showing placeholder
 * const isPlaceholder = userQuery.isPlaceHolderData();
 * ```
 */
export const insertPaginationPlaceholderData = <
  QueryResourceState extends object | undefined,
  QueryResourceParams,
  QueryResourceArgsParams,
  QueryIsMethod extends boolean,
  QuerySourceParams,
  QueryGroupIdentifier extends string,
  QueryInsertions,
  PreviousInsertionsOutputs,
  Exceptions extends ResourceExceptionConstraints,
>({
  resourceById,
  resourceParamsSrc,
  identifier,
}: InsertionByIdParams<
  QueryGroupIdentifier,
  QueryResourceState,
  QueryResourceParams,
  Exceptions,
  PreviousInsertionsOutputs
>) => {
  let previousPageKey: QueryGroupIdentifier | undefined;
  const showPlaceHolderData = computed(() => {
    const page = resourceParamsSrc();
    const resources = resourceById();
    const pageKey = page ? identifier(page) : undefined;
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
  return {
    currentPageData: computed(() => {
      const page = resourceParamsSrc();

      const resources = resourceById();
      const pageKey = page ? identifier(page) : undefined;
      if (!pageKey) {
        return;
      }
      const currentResource = resources[pageKey];

      if (showPlaceHolderData()) {
        return resources[previousPageKey]?.hasValue()
          ? resources[previousPageKey]?.value()
          : undefined;
      }
      previousPageKey = pageKey;
      return currentResource?.value();
    }),
    currentPageStatus: computed(() => {
      const page = resourceParamsSrc();
      const resources = resourceById();
      if (!page) {
        return 'idle' as const; // avoid to handle the undefined check
      }
      const pageKey = identifier(page);
      const currentResource = resources[pageKey];
      return currentResource?.status() ?? ('idle' as const);
    }),
    isPlaceHolderData: showPlaceHolderData,
    currentIdentifier: computed(() => {
      const page = resourceParamsSrc();
      if (!page) {
        return '' as QueryGroupIdentifier;
      }
      return identifier(page);
    }),
  };
};
