# Which primitive should I use?

There are five primitives. They share the same shape — a name, a configuration,
optional insertions — and differ only in **where the value comes from** and
**what triggers it**.

## The decision

| Where does the value live?               | Use                                            |
| ---------------------------------------- | ---------------------------------------------- |
| In memory, you own it                    | [`state`](/guide/state/local-state)            |
| On a server, read                        | [`query`](/guide/state/server-state)           |
| On a server, written                     | [`mutation`](/guide/state/mutations)           |
| In the URL's query string                | [`queryParams`](/guide/state/url-state)        |
| Nowhere — it's an action with a lifecycle | [`asyncProcess`](/guide/state/async-process)   |

## The same table, by symptom

**"I need a value the user can change."** → `state`. It is the default. Reach
for anything else only when the value's home is somewhere other than memory.

**"I need to display data from an API."** → `query`. It re-runs when its
`params` change and carries `isLoading` / `status` / `exception` for you. Don't
put a `query` result into a `state` — that's two sources of truth.

**"I need to send something to an API."** → `mutation`. Triggered explicitly
with `.mutate(...)`. Connect it back to the read side with
[`insertReactOnMutation`](/guide/state/react-on-mutation) rather than reloading
by hand.

**"This filter should survive a refresh and be shareable."** → `queryParams`.
The URL becomes the source of truth; your query's `params` read from it.

**"I need to run an async thing and know if it's running."** → `asyncProcess`.
Use it for operations that are not a server read or write: a file export, a
share sheet, a delay, a Web API call.

## Things that are *not* a primitive

- **Derived values** — use Angular's `computed` inside an insertion. Craft
  doesn't replace signal derivation, it hosts it.
- **Reusable logic across primitives** — that's an
  [insertion](/guide/concepts/insertions), not a primitive.
- **A group of primitives with a name and a scope** — that's a
  [`craftService`](/guide/app/craft-service).

## What they have in common

Whichever you pick, the mechanics are identical: the name comes first, the
result is the primitive reference itself, `yield*` drives it inside any
craft generator, and the last argument is an insertion.

That shared shape is one page: **[Anatomy of a
primitive](/guide/concepts/primitive-anatomy)**. Read it once and every
primitive page becomes just its own specifics.

## See Also

- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
- [Learn: your first state](/learn/01-first-state)
- [Insertions](/guide/concepts/insertions)
