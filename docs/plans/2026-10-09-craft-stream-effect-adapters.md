# Adaptateurs entre `CraftStream` et `Stream` d'Effect

Analyse **et implémentation** (vague 4 du plan des streams craft-natifs). Ce
document fixe ce que sont ces adaptateurs, où ils vivent, ce qu'ils préservent et
ce qu'ils perdent. Le code est dans `libs/stream-effect` (`@craft-ts/stream-effect`),
spec dans `libs/stream-effect/src/lib/stream-adapter.spec.ts`.

> **Statut.** Livré : `fromStream`, `toStream`, `fromQueue`, `fromPubSub`,
> `fromSubscriptionRef`, `toEffectSchedule`, `fromEffectSchedule` (sous-ensemble
> pur). Les sections ci-dessous gardent leur forme d'analyse ; les décisions prises
> à l'implémentation sont consignées dans « Décisions d'implémentation ».

## Contexte

`@craft-ts/stream` (vagues 0 à 2, livrées) fournit `CraftStream<A, Y>` : un
flux **froid**, poussé, dont le type `Y` accumule les dépendances de service des
handlers et les exceptions typées. `@craft-ts/effect` parle déjà Effect côté
craft : les Layers sont des providers, les échecs typés d'un `Effect` deviennent
des exceptions craft (`run-effect.ts`).

La question : que coûterait un pont avec `Stream<A, E, R>` d'Effect ?

Un fait cadre toute l'analyse : en Effect v4 un `Stream` n'est **pas
yieldable**. Le pont ne peut donc pas passer par le mécanisme de pont de
yields (`setForeignYieldBridge`) qui sert aux `Effect` : ce sont des
**fonctions explicites**.

## Emplacement

`libs/effect/src/lib/stream-adapter.ts`, ré-exporté par
`libs/effect/src/index.ts`.

Cela fait dépendre `@craft-ts/effect` de `@craft-ts/stream`. Deux options, **à
trancher à l'implémentation** :

1. `@craft-ts/stream` devient un nouveau peer de `@craft-ts/effect` (simple, mais
   tout utilisateur d'`@craft-ts/effect` doit alors installer le package stream) ;
2. une sous-lib `@craft-ts/stream-effect` (isole la dépendance ; un package de
   plus à publier — voir « les 4 endroits à bouger pour la release »).

Impact à vérifier dans les deux cas : la règle ESLint `no-effect-import-in-frontend`
(portée à confirmer pour un nouveau package qui importe `effect`).

## `fromStream` : `Stream` → `CraftStream`

```ts
fromStream<A, E, R>(stream: Stream<A, E, R>): CraftStream<A, EffectExceptionMarkers<E> | …>
```

Mécanique :

- exécution par `Stream.runForEach` + `Effect.runForkWith(level.context)` ; le
  **niveau d'injecteur est résolu à la souscription**, pas à la construction (un
  stream froid peut être construit hors contexte) ;
- mapping de sortie **identique à `run-effect.ts`** : un échec typé portant un
  `_tag` devient une exception `{ _tag, scope: 'loader' }` ; un défaut devient
  `error` via `Cause.squash` ; une **interruption n'est pas une exception** ;
- désabonnement = `Fiber.interrupt` ; la destruction du `DestroyRef` interrompt
  aussi le fiber.

Chunking : un `Stream` émet des `NonEmptyReadonlyArray`. L'adaptateur les
aplatit (`runForEachArray`) pour émettre valeur par valeur.

## `toStream` : `CraftStream` → `Stream`

```ts
toStream<A, Y>(stream: CraftStream<A, Y>): Stream<A, E, never>
```

- `Stream.callback(queue => …)` ; `exception` → `Queue.failCause`, `complete` →
  `Queue.end` ; le finalizer est le désabonnement ;
- **stratégie de buffer par défaut bornée**, `sliding` ou `dropping` : un
  producteur craft est poussé et ne peut pas honorer une contre-pression
  (`suspend`) — un buffer non borné serait une fuite mémoire silencieuse.

## Les canaux `E`, `R` et les dépendances

**Canal E.** `_tag` est déjà le discriminant commun aux deux mondes : le mapping
est **sans perte dans les deux sens**, et `Stream.catchTag` / `catchTag` craft
restent équivalents.

**Canal R.** Les requirements d'un `Stream` sont satisfaits par le Layer du
niveau d'injecteur (`provideLayer`, `CRAFT_EFFECT_LEVEL`). On réutilise
`RealRequirements` et `EffectRequirementsCheckedDI` tels quels.

- `SyncOp` n'a **pas d'analogue côté stream** : `fromStream` est toujours
  asynchrone et **interdit dans les hôtes synchrones** (`craftComputed`,
  `params`).
- Les dépendances craft portées par `Y` **ne se traduisent pas en `R`** : elles
  passent par l'injecteur capturé explicitement, pas par le canal de
  requirements d'Effect.

## `Queue`, `PubSub`, `SubscriptionRef` ↔ subjects

- `fromPubSub` / `fromQueue` se ramènent à `fromStream` (flux froid) ;
- `SubscriptionRef.changes` ↔ `behaviorSubject` : la valeur initiale vient de
  `SubscriptionRef.get` ;
- **jamais de pont bidirectionnel automatique** entre un subject craft et une
  `Queue`/`PubSub` : boucles d'écho et double buffering garantis.

## `Schedule`

`Schedule` d'Effect est effectful ; `CraftTemporalSchedule` est synchrone et
pur.

- `toEffectSchedule` via `Schedule.fromStep` : **facile**, la sémantique
  craft est un sous-ensemble ;
- `fromEffectSchedule` : seulement pour le **sous-ensemble pur** (`fixed`,
  `spaced`, `exponential`, `recurs`) ; le cas général exige un **spike** (une
  `Schedule` effectful ne peut pas s'exprimer en décision synchrone).

## Pas de nouveau hook de pont

Puisque `Stream` n'est pas yieldable, le seul besoin côté core était le hook
`cancel` sur les attentes de promesse — **livré** avec les terminaux programme
(`cancel?: () => void` sur `RuntimePromiseAwaitRequest` / `RuntimeGuardAwaitRequest`,
appelé à l'abandon du programme ou à la destruction de l'injecteur).

## Décisions d'implémentation

- **Emplacement : sous-lib `@craft-ts/stream-effect`** (option 2). L'option 1 (peer
  `@craft-ts/stream` dans `@craft-ts/effect`) aurait obligé tout utilisateur d'Effect à
  installer le package stream, et à toucher les ~9 configurations qui mappent
  `@craft-ts/effect` (tsconfig, vitest, démos). Précédent : `@craft-ts/i18n-effect`.
  Conséquence : `no-effect-import-in-frontend` liste explicitement ses préfixes ; ajouter
  `@craft-ts/stream-effect` y était obligatoire (fait, avec test). `@craft-ts/stream`
  seul reste importable côté frontend.
- **`fromEffectSchedule` n'a pas besoin d'un « sous-ensemble pur » codé en dur** : le
  spike a montré qu'on peut faire avancer n'importe quelle `Schedule` avec
  `Schedule.toStep` + `Effect.runSyncExit`. Une schedule pure (`fixed`, `spaced`,
  `exponential`, `recurs` et leurs combinaisons) passe ; une qui suspend lève
  `CraftScheduleNotPure`. L'adaptateur redémarre la schedule à `attempt === 1`.
- **`toStream`** : buffer borné par défaut (64, `sliding`), `dropping` en option, pas de
  `suspend`. Un défaut craft devient `Cause.die`, une exception `Cause.fail`.
- **Exit asynchrone** : `fromStream` démarre le fiber de façon synchrone
  (`Effect.runForkWith` + `addObserver`) : un `Stream` qui ne suspend jamais livre tout
  et se termine avant le retour de `subscribe`. `toStream` (via `Stream.callback`) passe
  par le scheduler d'Effect : pas en place.
- **Requirements** : `fromStream` refuse à la compilation une `Stream` dont `R` contient
  autre chose que des exigences fantômes (`MissingRequirements` nomme ce qui manque),
  comme `runEffect`. Les services passent par les membres `effectService`, `R = never`.

## Recommandation

1. `fromStream` / `toStream` d'abord ;
2. `toEffectSchedule` ensuite ;
3. `fromEffectSchedule` (sous-ensemble pur) seulement après son spike.

**Ne pas** remplacer le peer RxJS par `Stream` dans core : core reste sans
Effect dans la pompe.

## Risques

- **Défauts vs exceptions** : garder la séparation à tout prix (un défaut Effect
  ne doit jamais devenir une exception rattrapable) ;
- **double buffering** à la frontière push/pull ;
- **timing de résolution du niveau** d'injecteur (souscription, pas construction) ;
- **contre-pression perdue** à la frontière : un `Stream` tire, un `CraftStream`
  pousse — à documenter pour l'utilisateur ;
- **`effect` v4 en rc** : les noms peuvent bouger (`rc.112` verrouillé dans le
  peer, `rc.117` installé) ; isoler les imports derrière un seul module.

## Annexe — hypothèses du plan, levées pendant les vagues 0 et 2

| Hypothèse                                                    | Résultat                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inférence contextuelle des callbacks (Style C)               | **Vérifiée** : `A` inféré sur 10 slots ; garde de type incluse.                                                                                                |
| Inférence du paramètre d'exception de `catchTag`             | **Vérifiée, avec un schéma précis** : l'opérateur doit être écrit contre le `Y` **entier** en paramètre de type (`StreamExceptions<YIn>`), pas contre `Y \| Marker<E>` — ce dernier laisse `Y` absorber le marqueur et fixe `E` trop tôt dès que le handler a un paramètre. |
| 5 dépendances distinctes sans réduction de sous-type         | **Vérifiée** (unions déclarées, jamais inférées d'un générateur).                                                                                              |
| Coût de `UnionToTuple` à N = 10–15                           | **Négligeable** : terminal à N = 10 = +4 518 instanciations (+0,39 % de la base) ; ~515 par opérateur, linéaire (`tools/stream-typecost/run.mjs`).             |
| `inject(Injector)` dans le corps d'un terminal-programme     | **Vérifiée** (première pompe, `craftUse`, reprise après await).                                                                                                |
| Assignabilité structurelle `rxjs.Observable` → `Subscribable` | **Vérifiée**, mais l'**inférence** de `T` échoue sur un `subscribe` surchargé : `SubscribableValue` retombe sur la surcharge « callback ».                      |
| Où `appStart` attend son résultat                            | `ApplicationInitStatus` (`craft-compat.ts`) faisait `Promise.all(results)` : un résultat de type flux n'était **pas attendu**. **Corrigé** : un flux est attendu jusqu'à sa complétion (comme une Promise, comme les helpers de test) ; une exception ou un défaut fait échouer le démarrage. |
| Les « 5 autres sites `trigger$` »                            | **Inexistants** : seuls les 2 sites de `insert-select.ts` utilisent `trigger$`.                                                                                |
| Portée de `no-effect-import-in-frontend`                     | **Vérifiée** : liste de préfixes explicite — `@craft-ts/stream-effect` y a été ajouté (avec test) ; `@craft-ts/stream` reste autorisé.                          |
| Stabilité des noms Effect rc.117                             | **Vérifiée sur rc.117 installé** : `Stream.callback`, `runForEachArray`, `Queue.*Unsafe`, `Schedule.fromStep`/`toStep`, `Fiber.addObserver`. Absents : `Stream.orElse`, `Schedule.both` (v3). |
