# craft-migrate-errors

The codemods that carried the wave-1 renames (plan task 1.2):

```
craftException({ code }) -> craftException({ _tag })
craftService({ scope })  -> craftService({ providedIn })
```

They did roughly 90% of a 213-file change. The rest was hand work, and the
notes below are mostly about *why* that remainder existed — they are the part
worth reading before attempting a similar rename.

## The tools, in the order they run

| Tool | What it does |
|---|---|
| `rename-field.mjs` | The engine. Runs `tsc`, and rewrites the field only where the **AST** says it sits in a discriminant position — a property name, a member access, an indexed-access type. Takes `--from` / `--to`, plus `--not-with` to skip one meaning of a shared word. |
| `retag.mjs` | The `code` → `_tag` specialisation, kept because its diagnostic list is tuned for a field that is *optional* in structural extracts. |
| `retag-runtime-reads.mjs` | `exception.code` in a spec compiles fine and fails at runtime. The compiler cannot point at these, so they are matched on the receiver naming an exception. |
| `retag-expectations.mjs` | `toMatchObject({ code: … })` is neither an access nor a typed position. Cross-checks the value against tags the same file actually builds. |
| `retag-docs.mjs` | Documentation. Anchored on sample syntax so prose ("source code", "existing code") is untouched. |
| `normalize-mock-http.mjs` | One file, `mock-http-request-for-route.spec.ts`, where both meanings live in one object tree and only structure can separate them. |
| `find-silent-sites.mjs` | **Run this first.** Lists the type positions a rename breaks without any diagnostic. Exits non-zero while any remain. |

## Why none of this is a sed

`code` named three different things and only the first could move:

1. the craft exception discriminant — **the target**;
2. the HTTP client's matcher source (`{ source: 'code' }`) and the server-sent
   error code in a response body — **must stay**;
3. Standard Schema issue codes, form validator codes, and the route migration
   diagnostics' own codes — **must stay**.

An early regex version corrupted (2) and (3) twice: it renamed an HTTP matcher
destructuring (`{ status, code, content }`) and a `code()` test helper, both of
which had to be reverted by hand. That is why the engine is AST-based and
compiler-driven: a position `tsc` never reported is never touched.

## The trap that matters most

**The two renames behaved in opposite ways, with the same tool.**

`scope` → `providedIn` was easy: the field is *required*, so every missed site
errored loudly and the compiler did the work — 1218 diagnostics down to 102 in a
single pass.

`code` → `_tag` was dangerous: the field is *optional* in structural positions,
so a missed site **degrades to `never` instead of erroring**. These shapes are
the ones to fear:

```ts
X extends { code: infer C }                  // -> never, silently
Extract<X, { readonly code: string }>        // -> never, silently
```

Four separate places in this codebase were written that way, including
`CraftExceptionCodes` — the heart of route exhaustiveness. For several commits
the framework's headline guarantee was **switched off while every library test
passed**. What caught it was a single dev-tools integration test that compiles
negative fixtures and asserts they *fail* to compile.

Ten such positions existed here. Four were found by accident over several
days, each after the capability had already been dead for a while; the other
six took `find-silent-sites.mjs` about a second once it existed.

Run that tool before a rename and after it. And keep at least one test that
asserts something must NOT compile — it is the only kind that notices a
guarantee going missing.

## Runtime cost

None. Measured with `tools/effect-typecost/bench-wave1.mjs`: discrimination is
6.8 ns/op on both sides of the rename, and the suite wall time moved 0.02%.
Type-check instantiations moved −0.00% on the published build.
