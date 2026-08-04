# provideCraftTargetWrapper

`provideCraftTargetWrapper` ajoute un wrapper DI autour de l'enregistrement de
chaque composant ou directive Craft créé dans l'injecteur courant.

`craftRegisterFor` utilise ce mécanisme en interne, mais il peut aussi servir à
construire des registres spécialisés, ajouter de l'observabilité ou enrichir le
nom hôte avec des tags.

## API

```ts
import { provideCraftTargetWrapper } from '@craft-ng/core';

const provideTargetCustomization = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    return yield* next();
  },
);
```

Le premier argument est un warning obligatoire. Comme pour `provideFnWrapper`,
le callback s'exécute dans une chaîne runtime où les dépendances yieldées ne
sont pas vérifiées par l'inférence DI habituelle.

Le callback est un générateur et peut yield un service Craft :

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

Si `TargetAuditService` n'est pas fourni dans l'injecteur courant, l'erreur se
produit à l'exécution. Le type du wrapper ne peut pas le détecter.

## Contexte reçu

Le callback reçoit :

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

`target`, `kind`, `name` et `ref` décrivent l'instance réelle et restent
immuables. Seul `hostName` peut être modifié lorsqu'on appelle `next(...)`.

## Ajouter des tags au hostName

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

Le provider peut ensuite être installé dans la portée du composant :

```ts
const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [provideTagBasedTargetRegistration],
  },
  // ...
);
```

Le wrapper doit être déclaré avant le wrapper du registre s'il doit modifier le
`hostName` consommé par ce registre :

```ts
providers: [
  provideTagBasedTargetRegistration,
  provideRegisterForCounter(),
],
```

Les wrappers sont chaînés dans l'ordre de déclaration ; le premier wrapper est
le plus externe, comme avec `provideFnWrapper`.

## `next()` et le cleanup

`next()` poursuit la chaîne. Il retourne une fonction de libération, parce que
les wrappers suivants peuvent avoir ajouté une registration ou une ressource.

Pour un wrapper qui ne fait qu'adapter le `hostName`, il suffit de déléguer :

```ts
function* wrapper(context, next) {
  return yield* next({ hostName: `tag:${context.hostName}` });
}
```

Pour un wrapper qui crée aussi sa propre ressource, les deux cleanups doivent
être regroupés :

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

Le runtime appelle automatiquement le cleanup lorsque l'injecteur du
composant est détruit. Pour une directive, le cleanup est appelé lorsque le
nœud rendu est retiré.

## Créer un registre spécialisé

Un registre spécialisé peut utiliser le wrapper sans dépendre de
`craftRegisterFor` :

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

Cela permet de construire des registres par tags, par type de composant, par
scope ou par besoin métier, tout en réutilisant le même cycle de vie que
`craftRegisterFor`.
