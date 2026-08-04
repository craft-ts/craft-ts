# Schema validation

`state`, `query`, `mutation` and `asyncProcess` accept any schema implementing
`StandardSchemaV1`. Zod, Valibot, Effect and custom schemas can therefore be
used without coupling the primitives to a validation library.

## Resource schemas

Resource schemas correspond to different configurations. They are shown
separately here so the documentation does not suggest that they can be combined
in one declaration.

### Arguments d’une méthode

```typescript
const { search } = craftUse(query('search', {
  methodSchema: SearchInputSchema,
  method: (input) => ({ term: input.term }),
  loader: async ({ params }) => fetchResults(params),
}));
```

`methodSchema` validates the argument received by `call`, `mutate` or `method`;
the method then receives the schema output value.

### Paramètres réactifs

```typescript
const { products } = craftUse(query('products', {
  paramsSchema: FiltersSchema,
  params: () => ({ page: 1, term: searchTerm() }),
  loader: async ({ params }) => fetchProducts(params),
}));
```

`paramsSchema` validates the value produced by `params` or a reactive source.

### Résultat du loader

```typescript
const { products } = craftUse(query('products', {
  loaderSchema: ProductsSchema,
  params: () => ({ page: 1 }),
  loader: async ({ params }) => fetchProducts(params),
}));
```

`loaderSchema` validates loader results, stream values and local writes (`set`,
`update` and `patch`). Transformations publish the schema output type.

## State

State schemas are declared beside `$self` and validate initial values, writes,
insertions and values produced by `computed`, `linkedSignal` or `Signal`:

```typescript
const { user } = craftUse(state('user', {
  $self: { id: 123, name: 'Alice' },
  schema: UserSchema,
}));
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

const { total } = craftUse(state('total', {
  $self: computed(() => price() * quantity()),
  schema: NonNegativeNumberSchema,
}));

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
