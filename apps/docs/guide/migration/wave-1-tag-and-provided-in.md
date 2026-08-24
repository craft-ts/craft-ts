# Migrating to `_tag` and `providedIn`

Two renames on the public API:

```ts
// exceptions
craftException({ code: 'UserNotFound' }, payload)
craftException({ _tag: 'UserNotFound' }, payload)   // after

// services
craftService({ name: 'UserApi', scope: 'global' }, …)
craftService({ name: 'UserApi', providedIn: 'global' }, …)   // after
```

A codemod ships with this release and does most of the work:

```bash
node node_modules/@craft-ts/dev-tools/craft-migrate-errors/rename-field.mjs \
  tsconfig.json --from=scope --to=providedIn --not-with=_tag
```

It is compiler-driven and AST-based: it only rewrites where `tsc` actually
breaks, and only in positions the AST confirms are the field. Run it per
tsconfig, then re-run until it reports `clean`.

## Read this before you trust a green build

**The dangerous part of this migration is invisible.**

If your code reads the discriminant in a *value* position, the compiler will
point at every site and you cannot get it wrong:

```ts
craftException({ code: 'X' })   // errors: '_tag' is missing
exception.code                  // errors: no such property
```

If your code reads it in a **type** position — a conditional or an `Extract` —
it does not error. It resolves to `never`, and everything downstream quietly
becomes empty:

```ts
type CodesOf<E> = E extends { code: infer C } ? C : never;   // -> never
type Only<E>    = Extract<E, { readonly code: string }>;      // -> never
type HasScope<V> = V extends { scope: unknown } ? … : …;      // -> the else branch
```

Nothing fails. No test goes red. The capability just stops existing.

This happened four times inside CraftTS itself while performing this migration,
each caught late and by accident:

| What broke | How it surfaced |
|---|---|
| route exhaustiveness (`CraftExceptionCodes`) | one dev-tools test that compiles fixtures expected to FAIL |
| component exception codes | a runtime template test, several commits later |
| settled exception codes | a type assertion in an unrelated spec |
| route HTTP dependency derivation | a stale-looking assertion, chased on a hunch |

In every case the whole library suite — 1489 tests — was green.

### What to do about it

Run the finder before you run the codemod, and again afterwards:

```bash
node node_modules/@craft-ts/dev-tools/craft-migrate-errors/find-silent-sites.mjs code src
node node_modules/@craft-ts/dev-tools/craft-migrate-errors/find-silent-sites.mjs scope src
```

It walks the AST for the two shapes that cannot fail loudly — a conditional
whose `extends` clause reads the field, and an `Extract`/`Exclude`/`Omit`/`Pick`
over a literal containing it — and exits non-zero while any remain. Everything
it lists must be migrated **by hand**: the codemod cannot see them, because the
compiler never reports them.

Ten such positions existed inside CraftTS. Four were found by accident, over
several days. The other six took this tool about a second.

And keep at least one test that asserts something must *not* compile
(`@ts-expect-error`, or a fixture your build is supposed to reject). It is the
only kind of test that notices a guarantee disappearing.

## What did NOT change

`scope` on an exception is untouched:

```ts
craftException({ _tag: 'UserNotFound', scope: 'loader' }, payload)
```

It says where an exception came from — an origin, not a container or a
lifetime — so it keeps its name. Only the *service* scope became `providedIn`.

Also unchanged: the HTTP client's `{ source: 'code' }` matcher and the `code`
field of a server response body. Those are the server's vocabulary, not
CraftTS's, and the codemod leaves them alone by construction.

## Performance

None of this costs anything. Measured across the rename:

- discrimination: **6.8 ns/op** on both sides;
- test-suite wall time: **+0.02%**;
- type-check instantiations on the published build: **−0.00%**.

`@craft-ts/effect` is marginally *cheaper* afterwards, because mapping an
Effect error onto a craft exception stopped being a transposition and became
the identity — Effect and CraftTS now discriminate on the same field.
