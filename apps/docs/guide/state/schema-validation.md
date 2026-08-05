# Schema validation

Primitives accept any schema implementing `StandardSchemaV1`, so Zod, Valibot,
Effect or a hand-written schema all work — and none of them becomes a dependency
of `@craft-ng`.

**Use it when** data crosses a boundary you don't control: a method argument, a
server response, a restored value.
**Not when** the value never leaves your own typed code — TypeScript covers
that already.

## Resource schemas

Resource schemas correspond to different configurations. They are shown
separately here so the documentation does not suggest that they can be combined
in one declaration.

### Validating a method argument

```typescript
const { search } = yield* query('search', {
  methodSchema: SearchInputSchema,
  method: (input) => ({ term: input.term }),
  loader: async ({ params }) => fetchResults(params),
});
```

`methodSchema` validates the argument received by `call`, `mutate` or `method`;
the method then receives the schema output value.

### Validating reactive params

```typescript
const { products } = yield* query('products', {
  paramsSchema: FiltersSchema,
  params: () => ({ page: 1, term: searchTerm() }),
  loader: async ({ params }) => fetchProducts(params),
});
```

`paramsSchema` validates the value produced by `params` or a reactive source.

### Validating the loader result

This is the one that matters most: the loader is where **data you don't control**
enters the app.

```typescript
const { products } = yield* query('products', {
  loaderSchema: ProductsSchema,
  params: () => ({ page: 1 }),
  loader: async ({ params }) => fetchProducts(params),
});
```

`loaderSchema` covers more than the initial fetch — it validates loader results,
**stream values**, and **local writes** through `set`, `update` and `patch`. So a
value that enters the resource later, by any path, is checked the same way.

If the schema transforms (a `.trim()`, a coercion, a rename), the resource
publishes the **output** type — the rest of your code sees the transformed shape,
not the raw one.

::: warning `response<User>()` is a claim, not a check
With `CraftHttpClient`, the type parameter only *asserts* what the endpoint
returns. Nothing verifies it at runtime:

```typescript
loader: function* () {
  return yield* CraftHttpClient.get(({ response }) => ({
    url: '/api/products',
    success: response<Product[]>(), // trusted, never verified
  }));
}
```

Two ways to make it real. Add `loaderSchema` to the query, which validates
whatever the loader returns:

```typescript
yield* query('products', {
  loaderSchema: ProductsSchema,
  loader: /* the CraftHttpClient call above */,
});
```

Or decode at the request itself — `response(...)` takes any
`{ decode(input: unknown) }`, which every schema library provides:

```typescript
success: response({ decode: (input) => ProductsSchema.parse(input) }),
```

Use `loaderSchema` when you want the failure to surface as a craft exception
under `exceptions().parse.loader` and to obey the validation policy; use `decode`
when the decoding belongs to the endpoint's own contract.
:::

## State

State schemas are declared beside `$self` and validate initial values, writes,
insertions and values produced by `computed`, `linkedSignal` or `Signal`:

```typescript
const { user } = yield* state('user', {
  $self: { id: 123, name: 'Alice' },
  schema: UserSchema,
});
```

The input type constrains `$self`; the exposed signal uses the schema output
type. Invalid derived values keep the last valid value when the policy rejects
them.

### Derived state

A schema also validates every new value produced by a `computed` or a
`linkedSignal` while keeping the dependency reactive:

```typescript
const price = signal(10);
const quantity = signal(2);

const { total } = yield* state('total', {
  $self: computed(() => price() * quantity()),
  schema: NonNegativeNumberSchema,
});

console.log(total()); // 20
quantity.set(3);
console.log(total()); // 30
```

When a derived value fails validation, the configured policy decides whether
the last valid value is retained or the new value is accepted.

## Policy and exceptions

The default policy rejects invalid values in development and accepts them in
production. It can be replaced globally or locally:

```typescript
provideCraftSchemaValidationPolicy(({ exception }) => {
  monitoring.captureException(exception);
  return { action: isDevMode() ? 'reject' : 'accept' };
});
```

```typescript
query('products', {
  loaderSchema: ProductsSchema,
  schemaValidationPolicy: () => ({ action: 'reject' }),
  // ...
});
```

Rejected parses produce a `SCHEMA_VALIDATION_ERROR` with `scope: 'parse'`.
Resource exceptions expose the stage through `exceptions().parse.method`,
`exceptions().parse.params` and `exceptions().parse.loader`; states expose
`exceptions().parse.state`.

All four primitives expose `hasSchema()`, which is `true` when at least one
schema is configured.

## See Also

- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Persistence](/guide/state/persistence) — validating restored values
- [Exceptions as values](/guide/concepts/exceptions)
