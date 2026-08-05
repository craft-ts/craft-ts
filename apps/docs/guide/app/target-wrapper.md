# Target wrapper

`provideCraftTargetWrapper` wraps the registration of **every Craft component or
directive created in the current injector**, giving you a hook at the moment each
one comes to life.

**Use it when** you need to observe or enrich target registration across a
subtree: a specialised registry, observability, host names decorated with tags.
**Not when** you just need a parent to drive its children —
[`craftRegisterFor`](/guide/app/register) is built on this and already does it.

::: warning Dependency injection here is not type-checked
The callback runs in a runtime chain, outside the usual DI inference. A service
that is not provided in the current injector fails **at runtime**, and the
wrapper's type cannot catch it. That is why the first argument is a mandatory
warning string.
:::

## The common case

```ts
import { provideCraftTargetWrapper } from '@craft-ng/core';

const provideTargetCustomization = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    return yield* next();
  },
);
```

The callback is a generator, so it can yield a Craft service:

```ts
const provideTargetAudit = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const audit = yield* TargetAuditService();
    audit.recordCreatedTarget(context.kind, context.name);

    return yield* next();
  },
);
```

## The context

```ts
type CraftTargetContext = {
  target: unknown;
  kind: 'component' | 'directive';
  name: string;
  ref: unknown;
  hostName: string;
  injector: Injector;
};
```

`target`, `kind`, `name` and `ref` describe the real instance and are immutable.
**`hostName` is the only field you can change**, by passing it to `next(...)`.

## Tagging the host name

```ts
import { HOST_TAG_LIST, provideCraftTargetWrapper } from '@craft-ng/core';

const provideTagBasedTargetRegistration = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const tags = context.injector.get(HOST_TAG_LIST, []);
    const hostName =
      tags.length === 0
        ? context.hostName
        : `${tags.join('/')}/${context.hostName}`;

    return yield* next({ hostName });
  },
);
```

Install it in the component's scope:

```ts
const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [provideTagBasedTargetRegistration],
  },
  // ...
);
```

Order matters — a wrapper that modifies the `hostName` a registry consumes must
be declared **before** that registry's wrapper:

```ts
providers: [
  provideTagBasedTargetRegistration,
  provideRegisterForCounter(),
],
```

Wrappers chain in declaration order; the first is the outermost, exactly like
`provideFnWrapper`.

## `next()` and cleanup

`next()` continues the chain and **returns a release function**, because the
wrappers after yours may have added a registration or a resource of their own.

A wrapper that only adapts the `hostName` just delegates:

```ts
function* wrapper(context, next) {
  return yield* next({ hostName: `tag:${context.hostName}` });
}
```

A wrapper that creates its own resource must combine both cleanups:

```ts
const provideObserver = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const releaseNext = yield* next();
    const releaseObserver = observeTarget(context);

    return () => {
      releaseObserver();
      releaseNext();
    };
  },
);
```

The runtime calls the cleanup automatically when the component's injector is
destroyed. For a directive, it runs when the rendered node is removed.

## Pitfalls

**Dropping the release function from `next()`.** Everything registered further
down the chain then leaks. Always return it, alone or combined with your own.

**Declaring the wrapper after the registry it should influence.** The registry
will have already consumed the unmodified `hostName`.

**Assuming a yielded service exists.** Nothing checks it here — a missing
provider is a runtime failure.

::: details Building a specialised registry
A registry can use the wrapper directly, without depending on
`craftRegisterFor`:

```ts
const provideSpecializedRegistry = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const registry = yield* SpecializedRegistry();
    const releaseNext = yield* next();
    const releaseRegistry = registry.add({
      kind: context.kind,
      name: context.name,
      ref: context.ref,
      hostName: context.hostName,
    });

    return () => {
      releaseRegistry();
      releaseNext();
    };
  },
);
```

This is how you build registries by tag, by component kind, by scope or by
business need, while reusing the same lifecycle as `craftRegisterFor`.
:::

## See Also

- [craftRegisterFor](/guide/app/register) — the built-in registry on top of this
- [Observability](/guide/advanced/observability)
