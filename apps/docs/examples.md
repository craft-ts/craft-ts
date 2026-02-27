# ng-craft-demo Examples

## Primitives Examples

### 1. Query - Basic Example

**Description:** Primitive version using `query()` functions directly for finer control over data fetching and caching.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/primitives/query/query.ts&initialpath=/query/1)

---

### 2. Mutation - Data Modification

**Description:** Primitive version using `mutation()` functions directly for manual control of modification operations.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/primitives/mutation/mutation.ts&initialpath=/mutation/1)

---

### 3. List with Pagination - Paginated List

**Description:** Primitive implementation of pagination with manual management of query params and pagination state.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/primitives/list-with-pagination/list-with-pagination.ts&initialpath=/list-with-pagination)

---

### 4. Granular Mutation - Granular Mutations

**Description:** Primitive version of granular mutations with manual cache invalidation and optimistic updates management.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/primitives/granular-mutation/granular-mutation.ts&initialpath=/granular-mutation)

---

### 5. Full Demo - Complete Demo

**Description:** Comprehensive example using primitives for full control of all aspects of data management, without store/service abstractions.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/primitives/full-demo/full-demo.ts&initialpath=/full-demo)

---

### 6. Pixel Art - 1D Grid

**Description:** Interactive pixel art board powered by `state` + `insertSelect` on a flat array.

🔗 [Source code](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art/pixel-art.ts)

---

### 7. Pixel Art Matrix - 2D Grid

**Description:** Interactive 2D pixel grid leveraging advanced composition with nested `insertSelect` and internal `source$` to orchestrate fluid declarative reactivity between rows and cells.

🔗 [Source code](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts)

---

### 8. Exceptions - Business Exceptions

**Description:** Demonstrates business exceptions handling on `query()` with dedicated UI states based on exception codes.

🔗 [Source code](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exceptions.ts)

---

### 9. Exception QueryParam - Parse Exceptions

**Description:** Demonstrates `queryParam` parse exceptions with two navigation actions (`success` and `exception`) and UI handling through `hasException()` and `exceptions().parse`.

🔗 [Source code](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exception-query-param.ts)

---

## Craft Examples (Store/Service Abstraction)

### 1. Query - Basic Example

**Description:** Demonstrates the use of `craftQuery` to fetch user data with automatic cache and state management.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/craft/query/query.ts&initialpath=/craft/query/1)

---

### 2. Mutation - Data Modification

**Description:** Illustrates the use of `craftMutations` to create, update, and delete users with automatic cache invalidation.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/craft/mutation/mutation.ts&initialpath=/craft/mutation/1)

---

### 3. List with Pagination - Paginated List

**Description:** Demonstrates managing a paginated list with `craftQueryParam` to synchronize pagination state with the URL and `insertPaginationPlaceholderData` for a smooth user experience.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/craft/list-with-pagination/list-with-pagination.ts&initialpath=/craft/list-with-pagination)

---

### 4. Granular Mutation - Granular Mutations

**Description:** Shows how to perform granular mutations on lists with `insertReactOnMutation` to automatically update the cache without reloading all data.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/craft/granular-mutation/granular-mutation.ts&initialpath=/craft/granular-mutation)

---

### 5. Full Demo - Complete Demo

**Description:** Comprehensive example combining queries, mutations, async methods, state management, query params, pagination, and localStorage persistence. Demonstrates all Craft features in a realistic application.

🔗 [Open in StackBlitz](https://stackblitz.com/github/ng-angular-stack/ng-craft-demo/tree/main/?file=src/app/examples/craft/full-demo/full-demo.ts&initialpath=/craft/full-demo)

## Notes

All examples include their own `api.service.ts` to simulate API calls and are fully functional.
