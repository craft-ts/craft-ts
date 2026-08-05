# Where to go next

You have the whole mental model: **declare with a name, drive with `yield*`,
derive the rest.** Everything below is a variation on it.

## Fill the gaps in what you built

| You have                | Next thing worth adding                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| A query and a mutation  | [Persistence](/guide/state/persistence) — localStorage sync as an insertion            |
| A list                  | [Collections](/guide/state/collections) — entity storage, selectors, updates           |
| A form                  | [Validation](/guide/forms/validation) — custom and async validators                    |
| Routes                  | [Route guards](/guide/routing/guards) and [Route providers](/guide/routing/route-providers) |
| A running app           | [Non-blocking navigation](/guide/routing/pending-ui) — pending UI instead of a freeze  |

## Concepts worth a dedicated read

- [The mental model](/guide/concepts/mental-model) — the design principles behind
  the API you just used
- [Exceptions as values](/guide/concepts/exceptions) — declared failures,
  exhaustively handled
- [Insertions](/guide/concepts/insertions) — writing your own, and `insertPipe`
- [Generators](/guide/concepts/generators) — `craftGen` outside a service

## When your app grows

- [Service scopes](/guide/app/service-scopes) — when `function` stops being enough
- [Scaling routes](/guide/routing/scaling) — splitting collections before
  TypeScript's instantiation ceiling bites
- [Lazy services](/guide/app/lazy-services) and [App start](/guide/app/app-start)
- [Observability](/guide/advanced/observability) — logging and tracing that
  follow the dependency graph

## Reference

Looking for one symbol? The [API index](/reference/) lists every export with a
one-line description and a link.

## See it running

[Examples](/resources/examples) points at the demo application, which exercises
most of the above end to end.

<div style="margin-top: 2rem">

[← 10. Test what you wrote](/learn/10-testing)

</div>
