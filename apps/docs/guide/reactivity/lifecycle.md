# Destruction and cleanup failures

Craft uses the same synchronous cleanup contract for dependency-injection
scopes, effects, streams, rendered components and the resources they own:

- Every registered cleanup is attempted, even when another one throws.
- Existing execution order is preserved. `Teardown` runs its callbacks in
  reverse registration order; `DestroyRef` and effect cleanup callbacks run in
  registration order. Injectors destroy their children before their own scope.
- A single failure is rethrown unchanged, including a thrown value that is not
  an `Error`. Multiple failures produce an `AggregateError` whose `errors`
  contain the failures in execution order. Nested owners may contribute nested
  aggregates.
- An owner is closed before its callbacks run. Reentrant or repeated
  destruction does not run the same cleanups again, including after an error.
  Callback lists and owned references are released despite cleanup failures.
- Adding a callback to an already-closed `Teardown` or registering it on an
  already-destroyed `DestroyRef` runs it immediately.

The exception is reported **after** the remaining resources have been
released. It is a runtime defect, not a typed business exception: catching a
stream's business tags does not turn cleanup failures into successful work.
Synchronous completion also surfaces terminal callback and cleanup failures;
it does not discard them because the stream has already closed.

This contract concerns synchronous callbacks. Cleanup APIs return `void` and
do not await promises returned by an asynchronous callback. Start cancellation
from the cleanup and manage any asynchronous completion explicitly.

For effects, the same rule applies when an old run is cleaned up before a new
run: all callbacks registered by that run are attempted. For components, a
failing directive cleanup still allows sibling views, scoped injectors and the
host to be released. Timed task cancellation similarly notifies all registered
cancellation listeners and releases the remaining owned tasks.

See [effects](/guide/reactivity/craft-effect),
[streams](/guide/reactivity/streams) and
[service scopes](/guide/app/service-scopes).
