# `settledValue` + `pendingBlock` — suspension type-safe (inspiré de SolidJS v2)

## Intention

Les primitives async (`query`, `mutation`, `asyncProcess`) exposent une nouvelle
lecture, `settledValue`, qui ne rend **jamais** `undefined` et **jamais** une
valeur en état d'exception. Elle est consommable :

- dans un `craftComputed`, via `yield* settled(ref)` — le computed est alors
  tagué « dépend d'une source async » et porte les exceptions de la source ;
- directement dans un template (`span(users.settledValue)`).

Toute lecture d'une valeur non encore résolue doit être couverte par un
`pendingBlock` dans le template — sinon **erreur de compilation**.

## Le mécanisme existe déjà pour les exceptions

Tout l'appareillage est déjà en place pour le canal « exception » ; ce plan le
duplique pour le canal « pas encore résolu » :

| Exceptions (existant)                        | Pending (à créer)                        |
| -------------------------------------------- | ---------------------------------------- |
| `CraftNodeExceptionsCarrier<Codes>`           | `CraftNodePendingCarrier<Sources>`       |
| `CraftNodeChildrenExceptions<Children>`       | `CraftNodeChildrenPendingSources<…>`     |
| `catchBlock.exhaustive({...})` via `.pipe`    | `pendingBlock({...})` via `.pipe`        |
| `CraftGenShortCircuit` (throw)                | `CraftNotSettled` (throw)                |
| `exceptionBoundary` / `exceptionBoundaryResolved` dans `RenderContext` | `pendingBoundary` (compteur de jetons) |
| `RequireCaughtComponentExceptions`            | check `ValidPendingSources` sur `craftComponent` |

## Design

### 1. Lecture `settledValue` (runtime)

```
settledValue()  ->  hasException()            -> throw new CraftGenShortCircuit(exception)
                    status() ∈ idle|loading   -> throw new CraftNotSettled(sourceName)
                    sinon                     -> value() as Value
```

Le premier cas réutilise **tel quel** le canal exception existant (donc
`catchBlock` et son exhaustivité fonctionnent sans une ligne de code neuve).

Angular `computed()` mémorise l'erreur levée et la relance à chaque lecture
jusqu'à ce qu'une dépendance change : le `status` de la ressource étant lu avant
le `throw`, la recomputation au moment où la ressource se résout est acquise.

### 2. Marquage type-level

`settledValue` n'est pas un simple `Signal<T>` mais :

```ts
type CraftSettledSignal<Value, Source extends string, Codes extends string> =
  Signal<Value> & CraftSettledBrand<Source, Codes>;
```

La marque survit quand le signal est passé **par référence** dans un template
(`span(users.settledValue)`), et survit dans un `craftComputed` via le marqueur
yieldé par `settled(...)` (jamais yieldé au runtime, exactement comme
`CraftGenExceptionMarker`).

Elle est perdue dans une lambda (`() => users.settledValue().name`) — cas couvert
par une règle ESLint typée (itération 2).

### 3. Propagation et barrière

Les sources pending remontent l'arbre de nœuds comme les codes d'exception. Un
`.pipe(pendingBlock(...))` les efface :

```ts
div([span(users.settledValue)]).pipe(pendingBlock({ fallback: () => Spinner() }))
// -> toutes les sources du sous-arbre effacées

div([...]).pipe(pendingBlock.exhaustive({ users: () => SkeletonList() }))
// -> Exclude<Sources, 'users'>, avec vérification d'exhaustivité
```

L'enforcement se fait à **un seul endroit** : l'appel `craftComponent(...)`, dont
le template doit être pending-free. Le message d'erreur nomme les sources non
couvertes. (Le forwarding d'une source au composant parent est volontairement
hors périmètre de l'itération 1.)

### 4. Runtime de la barrière

`PendingBlockRenderedNode` tient un `Set` de jetons pending :

- un binding qui lève `CraftNotSettled` enregistre son jeton et laisse son effet
  souscrit (les dépendances lues avant le `throw` incluent le `status`) ;
- tant que le `Set` est non vide, le fallback est affiché et le sous-arbre reste
  **monté mais masqué** (comme Suspense de Solid : pas de perte d'état) ;
- quand le `Set` se vide, le sous-arbre est réaffiché.

## Périmètre — itération 1 (livrée)

Vertical complet sur `query` uniquement.

1. `libs/core` — **fait** : `CraftNotSettled`, brand `CraftSettledSignal`,
   `settled(...)`, `settledValue` attaché à la forme `resourceLike` au moment du
   nommage (`createNamedPrimitiveGen`), tag pending sur `craftComputed`.
2. `libs/component` — **fait** : carrier pending dans `vnode.ts`, `pendingBlock`
   (+ `.exhaustive`), threading dans `CraftNodePipe`, check `ValidPendingSources`
   sur `craftComponent`.
3. `interpreter.ts` — **fait** : `pendingBoundary` (jetons par binding),
   `PendingBlockRenderedNode`, capture de `CraftNotSettled` **et** de
   `CraftGenShortCircuit` dans `createRenderEffect`.
4. Specs (`craft-settled.spec.ts`, `pending-block.spec.ts`) + démo
   (`examples/component/pending-block-demo.ts`, route `pending-block`, entrée de
   nav, union `DemoRoutePath`) + doc (`guide/components/pending-block.md`) —
   **fait**, vérifié dans le navigateur (fallback à ~240 ms, données à ~2,2 s,
   zéro erreur console).

### Un bug d'instrumentation de la démo découvert au passage

Les deux `provideFnWrapper` de la démo (`app.config.ts` et le tracer de
`template-trace-demo.ts`) attrapaient **tout** throw et retournaient
`craftException({ code: 'UNEXPECTED_ERROR' })`. Un signal de flot de contrôle
n'arrivait donc jamais à sa barrière : la démo affichait `[object Object]` à la
place du fallback. Les deux relancent désormais `CraftGenShortCircuit` et
`CraftNotSettled`. Le cas du short-circuit était cassé avant cette feature — un
`catchBlock` ne pouvait pas recevoir une exception levée à travers un wrapper.

### Deux points tranchés en cours de route

- **Stale-while-revalidate** : un rechargement qui conserve sa valeur ne suspend
  pas. Suspendre à chaque refetch viderait un écran déjà rempli.
- **Le sous-arbre suspendu reste monté** (détaché du DOM, pas détruit). C'est une
  nécessité, pas un confort : les bindings suspendus sont le seul canal qui
  signale la résolution — les démonter fige la barrière pour toujours.

## Itération 2 (livrée)

1. **`settledValue` sur `mutation` et `asyncProcess`** — même recette que
   `query` : `Name` propagé dans `ResourceLikeMutationRef` / `AsyncProcessRef`
   puis dans `MutationOutput` / `AsyncProcessOutput` et leurs overloads,
   attachement runtime partagé (`attachCraftSettledValue`).
2. **Canal type-level des exceptions d'une lecture settled**
   (`CraftNodeSettledExceptionsCarrier`). Il ne pouvait pas passer par le porteur
   d'exceptions existant : `RequireCaughtComponentExceptions` se déclenche sur
   les enfants du tag helper qui les reçoit, donc `span(userName)` exigerait un
   `catchBlock` à l'intérieur des enfants de `span`. Le nouveau porteur remonte
   silencieusement, est vidé par n'importe quel `catchBlock` ancêtre, et est
   vérifié une seule fois à `craftComponent`. Le check d'exhaustivité de
   `catchBlock` lit désormais `Exceptions | SettledExceptions`, sans quoi un
   handler pour un code atteignable uniquement par la lecture settled serait
   rejeté comme « unreachable ».
3. **Second exemple** (`pending-block-exception-demo.ts`, route
   `pending-block/exception`) : une mutation qui peut retourner un
   `craftException`, avec les deux barrières enchaînées. Vérifié dans le
   navigateur : au repos → pendingBlock, succès → pendingBlock puis données,
   rejet → pendingBlock puis catchBlock, zéro erreur console.

## Itérations suivantes

1. Forme by-id (`select(...)` / `selectOrCreate(...)`).
2. Règle ESLint typée pour les lectures en lambda qui perdent la marque
   (`() => users.settledValue().name`), aujourd'hui couvertes seulement par
   `CraftUnhandledPendingError` / `CraftUnhandledExceptionError` au runtime.
3. `meta: { forwardsPending: true }` pour déléguer les barrières au parent.
4. Absorption des sources pending d'un composant de route par le
   `CraftRouterOutlet` (qui est déjà une surface pending).
