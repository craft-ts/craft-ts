# Plan — membres Effect synchrones (`SyncOp`)

## Statut

Vagues 1 et 2 livrées (`7e6f935a`, `8f134944`, `0aded2d3`). Les surcharges
`params` / `method` restent à faire — voir « Reste à faire », qui contient le
piège d’inférence à ne pas retraverser.

## Objectif

Pouvoir réutiliser un calcul métier vivant dans un service Effect depuis une
position **synchrone** de craft — `params`, `craftComputed`, `craftMethod`, un
updater de `state` — sans ouvrir la porte à ce qui suspend.

Avant : craft interdisait tout Effect dans ces positions
(`SynchronousValue<Value> = Value extends Effect ? never : Value`,
`no-effect-outside-loaders`). Sûr, mais c’est un refus, pas une distinction : un
helper pur ne pouvait pas être réutilisé dans une computation.

## Le fait qui tranche

`Effect<A, E, R>` ne dit pas si l’exécution suspend, et pour un **membre de
service** c’est pire : un `Layer` ferme les dépendances à la construction, donc
un appel réseau et une addition sortent tous les deux avec `R = never`.

Constaté dans le repo, `apps/demo-effect/src/app/shared/access-domain.ts` :

```ts
readonly decide: (userId: string) => Effect.Effect<AccessDecision, UserNotFound>;
//                                   ^ R = never, et l'implémentation fait Effect.sleep
```

Conséquence directe : **aucune contrainte sur `R = never` ne peut remplacer un
marqueur explicite.** C’est la raison d’être de `SyncOp`.

## Décision d’architecture

`SyncOp` est un *requirement fantôme* : `Effect.void` casté, jamais fourni,
aucun coût runtime. Il est écrit dans `R` — le seul canal qu’Effect accumule à
travers la composition — donc la déclaration se propage seule aux appelants.

```ts
export const SyncOp = Effect.void as unknown as Effect.Effect<void, never, SyncOp>;
```

- **Déclaration par membre, dans la shape.** Pas de liste `sync: [...]` par
  service : elle divergerait du code, et surtout elle imposerait d’envelopper
  les membres, ce qui fige les génériques et les surcharges (voir la note en
  tête de `libs/effect/src/lib/effect-service.ts`).
- `yield* SyncOp` n’est nécessaire **que** là où `R` est inféré (un
  `Effect.gen` autonome qui n’appelle rien de marqué). Une shape écrite à la
  main suffit : `Effect<A, E, never>` est assignable à `Effect<A, E, SyncOp>`.
- `syncEffect(...)` **n’exige que la présence** de `SyncOp` ; les autres
  requirements traversent, le niveau les fournit comme pour un loader.

### Trois lignes de défense, aucune redondante

| Étage | Rôle | Portée |
|---|---|---|
| type (`syncEffect`, `computedEffect`) | permission | totale, mais déclarative |
| lint `craft-ts/sync-effect-body` | lit le corps, toutes branches | ce que le repo voit |
| `Effect.runSyncExitWith` | vérification réelle | totale, y compris en prod |

La revendication est fausse ? `runSyncExitWith` ne peut pas suspendre : le fibre
non résolu est interrompu et `CraftEffectNotSynchronous` est levée au premier
appel, au lieu de geler l’UI.

### `computedEffect` = le pendant Effect de `craftComputed`

```
craftComputed : computedEffect  ::  query : queryEffect
```

La factory lit ses dépendances craft avec `yield*` et **retourne** l’Effect ;
l’adaptateur l’exécute sur place et rend une valeur réactive. `SyncOp` y est
donc obligatoire : on demande sa valeur à une computation *maintenant*.

Avant cette vague, `computedEffect` n’était pas un computed — il construisait
une `craftQuery` en interne, donc une multiplication revenait en ressource avec
état de chargement.

## Options écartées, et pourquoi

- **Liste `sync: [...]` par service.** Impose un wrapper → effondre les
  génériques et les surcharges. Remplacée par le marqueur dans `R`.
- **Type de retour conditionnel sur `computedEffect`** (valeur si `SyncOp`,
  ressource sinon). Deux natures sous un seul nom, dont la bascule dépend d’un
  marqueur situé au fond du graphe d’appel. Écarté au profit d’une sémantique
  unique.
  À noter pour la postérité : la bascule n’aurait **pas** été silencieuse — les
  deux formes sont disjointes (`p({}, resource)` donne `TS2769`). Le vrai coût
  était la distance entre la cause (retirer `SyncOp` dans un fichier) et le
  message (une erreur de template dans un autre).
- **Preuves d’exécution en tests d’architecture** (un témoin par membre déclaré,
  comparé au graphe). Écarté de la vague 1 : `runSyncExitWith` vérifie déjà à
  chaque appel, y compris en production. Les tests n’apporteraient que de la
  *précocité*, pas de la sûreté. À reprendre seulement si des déclarations
  fausses apparaissent en pratique.
- **Marqueur dual `AsyncOp`** (contamination par les constructeurs async).
  Strictement plus fort, mais impose d’envelopper tous les constructeurs
  d’Effect. Gardé en réserve.

## Livré

| Fichier | Rôle |
|---|---|
| `libs/effect/src/lib/sync-op.ts` | `SyncOp`, `syncEffect`, `CraftEffectNotSynchronous`, bridge sync |
| `libs/core/src/lib/craft-generator-runtime.ts` | `setForeignSyncYieldBridge` — pendant synchrone du bridge async |
| `libs/effect/src/lib/effect-adapter.ts` | `computedEffect` réécrit sur `craftComputed` |
| `libs/effect/src/lib/effect-exceptions.ts` | `CraftSyncEffectGen` |
| `libs/effect/src/lib/requirements.ts` | `CraftPhantomRequirement`, `RealRequirements` |
| `libs/dev-tools/src/eslint-rules/sync-effect-body.cjs` | règle typée, preset `effect` |
| `apps/demo-effect/.../effect-pricing-domain.ts` + `effect-sync-members.ts` | route `sync-members` |
| `apps/docs/learn-effect/03-effect-domain.md` | leçon + snippet exécutable |

Trois signatures publiques ont dû s’ouvrir aux requirements fantômes —
`AssertNoRequirements`, `runEffect`, `EffectRequirementsCheckedDI` — sinon un
membre déclaré synchrone devenait inutilisable **partout**, loaders compris.

## Pièges rencontrés

1. **`CraftEffectGen` porte l’Effect dans son `Yielded`** (parce que `runEffect`
   le yield vraiment). `syncEffect` yield un objet requête : réutiliser ce type
   faisait flagger *toute la factory du craftComputed* par
   `no-effect-outside-loaders`, qui cherche `Effect<` dans le texte du type.
   D’où `CraftSyncEffectGen`.
2. **L’exemption dans `no-effect-outside-loaders` doit partir du nœud**, pas de
   `node.parent` : sinon l’appel `syncEffect(...)` lui-même est reporté.
3. **Liste blanche en portée module.** Un `const` déclaré dans `create()` après
   le `return` explose en TDZ : les visiteurs tournent avant.
4. **`settled` ne bloque pas, il jette** (`CraftNotSettled`), et le
   `pendingBlock` rattrape pendant la passe de rendu. Donc `settled` n’a pas sa
   place dans un `craftEffect` : personne n’y rattrape le throw.

## Reste à faire

### Surcharges `params` / `method` acceptant un Effect `SyncOp`

Objectif : écrire `params: function* () { return cartWeightGrams(yield* lines()); }`
sans passer par `syncEffect`.

**Ne pas** élargir `SynchronousValue` seul : `Params` s’infère alors à l’Effect
lui-même, et le loader reçoit un Effect au lieu de la valeur. C’est le seul
écueil confirmé.

Deux voies restent ouvertes. Un type calculé :

```ts
readonly params: () => ParamsSource;
readonly loader: EffectLoader<ParamsSourceOf<ParamsSource>, …>;
```

ou une surcharge dédiée, placée *avant* l’historique, où `Params` reste **nu à
l’intérieur** de l’Effect :

```ts
type SyncParamsEffect<Params> =
  | Effect.Effect<Params, never, SyncOp>
  | Generator<unknown, Effect.Effect<Params, never, SyncOp>, unknown>;
```

Les deux **inférent correctement** `Params = number`, y compris quand `params`
est un générateur qui lit des dépendances craft — mesuré sur un modèle réduit
(TypeScript fixe `ParamsSource` depuis `params` avant de vérifier le `loader`,
qui est context-sensitive et donc différé). Ne pas re-supposer un effondrement
d’inférence sans l’avoir reproduit sur la vraie signature.

**Voie retenue : la surcharge**, non pas pour l’inférence mais pour le rayon
d’impact. Le type calculé oblige à écrire `ParamsSourceOf<ParamsSource>` partout
où les surcharges actuelles font transiter `Params` —
`QueryOutput<Value, Params, unknown, Params, …>`,
`EffectInsertionContext<Name, Params, Value, Error>` — sur les trois
adaptateurs. La surcharge ne touche rien en aval, et `SynchronousValue` reste
inchangé, continuant de rejeter les Effects non déclarés.

Réserve à lever tôt : `E` est fixé à `never` ci-dessus. Un membre sync
faillible (`Effect<number, PriceUnavailable, SyncOp>`) ne matcherait pas.
Ajouter un `infer E` est exactement le genre d’ajout qui peut faire retomber
`Params` sur `unknown` — à vérifier avant d’étendre aux trois adaptateurs.

### Autres

- Marqueur dual `AsyncOp`, si des déclarations fausses apparaissent.
- Preuves d’exécution enregistrées à la porte unique, si on veut la couverture
  CI plutôt que la seule vérification à l’appel.
- Message de `NotDeclaredSynchronous` : la phrase explicative n’apparaît qu’au
  survol du type.

## Vérification

```bash
node tools/run-lib-vitest.mjs libs/effect/vitest.config.ts
node tools/run-lib-vitest.mjs libs/dev-tools/vitest.config.mts
npx nx test docs
npm run typecheck
npx nx run-many -t typecheck,lint,architecture --projects=demo-effect
```
