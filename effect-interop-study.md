# Craft NG × Effect — étude de faisabilité

> Étude préalable, aucune décision engagée. Rédigée le 2026-08-16 à partir de la
> lecture du runtime craft (`libs/core/src/lib/craft-*`) et de l'état d'Effect
> à cette date (v4 en release candidate, v3 encore recommandée en production).

## 1. Recommandation

**Ne pas rebaser Craft NG sur Effect. Construire `@craft-ng/effect`, un paquet
d'interopérabilité optionnel, et se positionner comme « la couche
réactive/UI Angular d'une application Effect ».**

Raison courte : le recouvrement fonctionnel réel entre les deux libs est faible
(~20-25 % de la surface de Craft), et il porte exactement sur la partie que
Craft a déjà implémentée et testée (canal d'exception, opérateurs de programme,
schedule). Tout ce qui fait l'identité de Craft — le graphe de signaux Angular,
la DI hiérarchique vérifiée à la compilation, les composants selectorless, les
formulaires dérivés — n'a **aucun** équivalent dans Effect. Un rebase paierait
100 % du coût pour remplacer 20 % de la surface, et ferait perdre l'audience
Angular, qui est aujourd'hui la seule audience réelle.

## 2. Cartographie du recouvrement

| Capacité | Craft NG | Effect | Verdict |
| --- | --- | --- | --- |
| Canal d'erreur typé | `CraftException` (`code`/`scope`/`identifier` + payload), marqueur fantôme dans `Yielded`, court-circuit par `throw CraftGenShortCircuit` | `Effect<A, E, R>`, `E` first-class, `Data.TaggedError` (`_tag`) | **Recouvrement fort** — sémantiques quasi identiques |
| Opérateurs | `.pipe(catchTag, catchTag.exhaustive, retry)` | `pipe(catchTag, catchTags, retry, catchAll…)` | **Recouvrement fort**, Effect est plus large |
| Schedule / backoff | `CraftTemporalSchedule` (`next(context) → {done|delayMs}`) | `Schedule` (algèbre composable, effectful) | **Recouvrement partiel**, Effect beaucoup plus riche |
| Injection de dépendances | Injecteur Angular hiérarchique, scopes `global`/`route`/`component`, carte de deps propagée au type-level + vérifs compile-time et ESLint | Canal `R` + `Layer`, mémoïsé par runtime | **Concurrence directe, modèles incompatibles** (§4c) |
| Validation / codecs | `StandardSchemaV1` + `CraftCodec` | `Schema` (bidirectionnel, erreurs typées) | **Déjà compatible gratuitement** (§6) |
| Exécution asynchrone | Pompe synchrone + suspension explicite (`GUARD_AWAIT_REQUEST`), rattachée à `runInInjectionContext` | Runtime à fibres, interruption, `Scope`, finalizers | **Concurrence**, Effect plus puissant, Craft plus intégré Angular |
| Réactivité | Signaux Angular, pull-based, sans glitch, `resource()` | **Aucun équivalent** (Stream ≠ signal) | Craft seul |
| DI vérifiée à la compilation, routes typées, guards | oui | non | Craft seul |
| Composants, templates, formulaires, style typé | oui | non | Craft seul |
| Observabilité (correlationId, traces, snapshot) | oui, maison | tracing OpenTelemetry natif | Recouvrement partiel, Effect meilleur |

Conclusion de la cartographie : Effect ne peut pas être la *base* de Craft, car
la base de Craft est le graphe de signaux et l'injecteur Angular, deux choses
qu'Effect ne fournit pas et ne cherche pas à fournir.

## 3. Les quatre niveaux de couplage possibles

| Niveau | Contenu | Coût | Gain communauté | Réversible ? |
| --- | --- | --- | --- | --- |
| **0 — Convergence de vocabulaire** | aligner les noms et formes (`_tag` alias de `code`, forme de `Schedule`, conventions `pipe`) | faible, à faire pendant la bêta | faible seul, mais rend 1 et 2 triviaux | oui |
| **1 — Paquet d'interop** | `@craft-ng/effect` : runtime Effect fourni par la DI Angular, adaptateurs loaders/schemas/HTTP, ponts signal ↔ Stream | moyen (2-4 semaines) | **fort** : c'est ce que la communauté Effect veut réellement | oui |
| **2 — Protocole de yield bidirectionnel** | `yield* someEffect` fonctionne dans n'importe quel générateur craft ; `Craft.use(ref)` fonctionne dans `Effect.gen` | moyen-faible en plus du niveau 1 (le plus gros est déjà là, §5) | **très fort** : c'est la démo qui circule | oui, isolable dans le paquet |
| **3 — Rebase du cœur** | `Effect` devient le modèle d'exécution de tout l'asynchrone ; `Layer` remplace une partie de la DI | très élevé, réécriture du cœur + des dev-tools | négatif à court terme | **non** |

Le niveau 2 est le point d'équilibre : il donne la compatibilité *perçue* d'un
rebase sans en payer le coût, et il reste dans un paquet optionnel.

## 4. Les incompatibilités structurelles, compromis et alternatives

### a. Construction eager vs description lazy

Les primitives craft sont **créées immédiatement**, dans un contexte
d'injection, et rendent une référence vivante (`createPrimitiveGen` reçoit un
`ref` déjà construit — `craft-primitive-gen.ts:199`). Un `Effect` est une
description inerte exécutée plus tard par un runtime.

- *Compromis si rebase* : `const counter = yield* state('counter', 0)` ne peut
  plus rendre une référence utilisable immédiatement ; on perd `craftUse(...)`
  en initialisation de champ, et la création de `resource()` sort du contexte
  d'injection.
- *Alternative* : garder les primitives eager, et ne faire passer par Effect
  que les **loaders et les programmes** (query loader, mutation, guard,
  asyncProcess). C'est la frontière naturelle : Effect possède la logique
  métier asynchrone, Craft possède le graphe réactif.

### b. Réactivité pull-based vs fibres push-based

Effect n'est pas un système de réactivité. `Stream`/`SubscriptionRef` ne
remplacent pas des signaux (pas de propagation sans glitch, pas d'intégration
au change detection, pas de granularité `computed`).

- *Compromis si rebase* : on perdrait la machine à états de `resource()`
  (`status`, `exception`, `pendingBlock`, `settledValue`) ou il faudrait la
  réimplémenter au-dessus de `Stream`, pour un résultat strictement inférieur
  côté Angular.
- *Alternative* : ponts explicites et documentés — `fromStream(stream)` →
  signal (+ `status`), `toStream(signal)` → `Stream`, `Effect.sync` pour lire
  un signal dans un effet. La frontière reste visible, c'est un atout
  pédagogique, pas un défaut.

### c. Canal `R` + `Layer` vs injecteur Angular

C'est l'incompatibilité la plus dure. Toute la valeur différenciante de Craft
(DI vérifiée à la compilation, providers scopés à la route, services scopés à
l'instance de composant, règles ESLint, graphe de dépendances) est bâtie sur
l'injecteur Angular. `Layer` ne sait pas exprimer une portée « instance de
composant » ni une portée dont la durée de vie suit le routeur.

- *Compromis si rebase* : soit on perd les scopes Angular, soit on maintient
  **deux systèmes de DI en parallèle** — le pire des deux mondes, et une
  double vérité impossible à expliquer.
- *Alternative (celle que je recommande)* : **un seul propriétaire de portée,
  l'injecteur Angular.** Un `Layer` Effect n'est pas fourni « à côté » ; il est
  fourni *à travers* la DI Angular via `provideCraftEffectRuntime(layer)`, qui
  construit un `ManagedRuntime` et le dispose sur le `DestroyRef` de
  l'injecteur. Conséquence directe et élégante : un Layer scopé à une route est
  simplement un runtime fourni dans les providers de cette route, et la
  hiérarchie des runtimes suit la hiérarchie des injecteurs. Effect gagne un
  scoping hiérarchique qu'il n'a pas ; Craft ne perd rien.

### d. Forme du canal d'erreur

`CraftException` porte `code` + `scope` + `identifier` + payload. `scope` et
`identifier` ne sont pas décoratifs : ils portent la provenance utilisée par le
routage d'exceptions et l'exhaustivité (`assertExhaustiveRouteExceptions`).
`Data.TaggedError` ne porte que `_tag`.

- *Compromis si adoption directe de `TaggedError`* : perte de `scope` et
  `identifier`, donc régression sur le routage d'exceptions et sur les
  messages de diagnostic.
- *Alternative* : conserver `CraftException`, exposer `_tag` comme **alias de
  `code`** (doublement marqué), et rendre `catchTag` capable d'accepter les
  deux formes. Dans le sens Effect → Craft, l'adaptateur mappe
  `E` → `craftException({ code: e._tag, scope: '<nom du layer>' }, e)`.
- *Point de vigilance connu* : l'inférence d'exhaustivité est déjà fragile
  (`ExtractCraftGenExceptions<never>` qui dérive vers `unknown`, contrainte
  auto-référentielle impossible sur le `def` de `route()`). Toute union
  d'erreurs venue d'Effect doit être testée contre ces deux pièges **avant**
  d'être exposée, avec un test de type dédié.

### e. Taille de bundle et dépendance de pair

Un programme minimal Effect pèse ~70 kB en v3, ~20 kB en v4. Même 20 kB, c'est
une taxe sur 100 % des utilisateurs pour une fonctionnalité qu'en pratique
5 % utiliseront.

- *Compromis si rebase* : `effect` devient peer dependency de
  `@craft-ng/core`. Inacceptable pour l'audience Angular actuelle.
- *Alternative* : paquet séparé, `effect` en peer dependency de
  `@craft-ng/effect` uniquement. Ne **pas** utiliser `Micro` en interne pour
  « avoir Effect en petit » : ses types ne sont pas ceux d'Effect, donc ça ne
  produit aucun bénéfice d'interopérabilité — ce serait la dépendance sans
  l'avantage.

### f. Interruption et cycle de vie

Effect a une interruption structurée (fibres, `Scope`, finalizers). Craft a
`AbortSignal` + `DestroyRef` + `TemporalCancelledError`.

- *Compromis* : aucun s'il est correctement spécifié — c'est un adaptateur, pas
  un choix d'architecture. Mais c'est **le** point où une intégration naïve
  fuit : une fibre lancée depuis un composant détruit continue de tourner.
- *Alternative / spécification obligatoire* : `DestroyRef.onDestroy` →
  `Fiber.interrupt` ; `abortSignal` du loader → interruption ; réciproquement
  l'interruption Effect doit se présenter côté Craft comme une annulation, pas
  comme une exception métier. À couvrir par des tests de fuite explicites.

### g. Risque de version — et le timing

Effect v4 est en release candidate ; v3 reste la version recommandée en
production et est en gel de fonctionnalités. Un cœur qui dépendrait d'Effect
serait couplé au calendrier d'une transition majeure en cours.

- *Compromis si rebase* : cadence de release de Craft asservie à celle
  d'Effect, au pire moment.
- *Alternative* : paquet d'interop avec une plage de peer dependency large et
  une CI qui teste contre v3 et v4. **Et lecture inverse du timing** : pour un
  paquet d'*écosystème*, l'arrivée de v4 est le meilleur moment possible — les
  bindings se réécrivent, l'attention est disponible, et les ~20 kB rendent
  enfin l'usage navigateur crédible.

## 5. Périmètre concret de `@craft-ng/effect` (v1)

Ce qui rend le niveau 2 réaliste : **la plomberie existe déjà**.

1. **`yield* someEffect` dans n'importe quel générateur craft.**
   `resolveCraftGeneratorYield` (`craft-generator-runtime.ts:330`) est un
   dispatch sur marqueurs avec un repli `{ handled: false }` — c'est le point
   d'extension. Et `awaitCraftProgramRequest` gère déjà une requête de type
   `'promise'` (`craft-program-runtime.ts:129`) : un effet exécuté sur le
   runtime rend une promesse, donc il réutilise **le chemin de suspension
   existant** sans nouveau mécanisme. Au type-level, un `EffectYieldMarker`
   traduit `E` en `CraftGenExceptionMarker` pour que `catchTag`,
   `handleExceptions` et l'exhaustivité continuent de fonctionner.
   *Contrainte à poser* : n'accepter que `R extends never`, ou un `R` satisfait
   par le runtime fourni (token typé par le `ROut` du Layer, sur le patron de
   token brandé déjà utilisé).
2. **`provideCraftEffectRuntime(layer)`** — `ManagedRuntime` dans la DI
   Angular, disposé par `DestroyRef`, hiérarchique par construction (§4c).
3. **`effectLoader(...)`** pour `query`/`mutation`/`asyncProcess` : `E` mappé
   vers les exceptions de la primitive, `abortSignal` câblé sur
   l'interruption.
4. **Ponts réactifs** : `fromStream` → signal, `toStream(signal)` → `Stream`,
   `Craft.read(ref)` → `Effect`.
5. **Schedule** : `fromEffectSchedule(schedule)` → `CraftTemporalSchedule`
   (`temporal-runtime.ts:122`). Attention : les `Schedule` Effect sont
   effectful, donc soit on ne supporte que le sous-ensemble pur, soit on les
   exécute sur le runtime — à trancher, ne pas laisser implicite.
6. **HTTP** : `@effect/platform` HttpClient ↔ `craft-http-client`, avec
   propagation du `correlationId` dans les spans Effect via
   `provideServiceYieldWrapper` (`craft-generator-runtime.ts:57`), qui est déjà
   le crochet prévu pour ça.
7. **Codecs** : `Schema` ↔ `CraftCodec` (`craft-codec.ts`) pour
   `decode`/`encode` avec erreurs typées.

## 6. Ce qui est déjà gratuit aujourd'hui

`schema-validation.ts` s'appuie sur `StandardSchemaV1` (`standard-schema.ts`).
Effect Schema expose une interface Standard Schema V1. **Les schémas Effect
fonctionnent donc déjà dans Craft, sans une ligne de code.** C'est le premier
contenu à publier : un article court « votre `Schema` Effect valide déjà vos
formulaires et vos queries Craft », coût nul, preuve immédiate de bonne foi
envers l'écosystème.

## 7. Le pari « rallier la communauté » — évaluation honnête

- La communauté Effect est TypeScript-large, orientée backend / full-stack, et
  penche React. L'intersection Angular ∩ Effect est **petite aujourd'hui**.
- Mais elle est **inoccupée** : aucune intégration Angular établie n'apparaît
  dans l'écosystème Effect. Être *le* binding Angular d'Effect est un
  positionnement atteignable, contrairement à « le meilleur state manager
  Angular », où la concurrence est frontale.
- Le rebase ne rallierait personne : un développeur Effect ne change pas de
  framework front parce qu'une lib Angular utilise Effect en interne. Ce qui
  le fait venir, c'est de pouvoir **réutiliser son code Effect existant** dans
  une app Angular. C'est exactement ce que livre le niveau 2, et le niveau 3
  n'ajoute rien sur ce plan.
- L'acquisition viendra du référencement dans les pages écosystème d'Effect,
  d'un exemple de bout en bout (même domaine Effect, un front Angular + un
  front React) et de « This Week in Effect », pas d'un choix d'architecture.
- Le risque symétrique est réel : afficher « Craft NG est basé sur Effect »
  ferait fuir la majorité de l'audience Angular, pour qui Effect est perçu
  comme lourd et étranger. Le message doit rester « Craft n'exige pas Effect,
  Craft parle Effect ».

## 8. Séquencement proposé

1. **Maintenant, pendant la bêta** (coût faible, fenêtre qui se referme) :
   alias `_tag` sur `CraftException`, `catchTag` bi-forme, vérifier que la
   forme de `CraftTemporalSchedule` reste adaptable à `Schedule`.
2. **Gratuit** : documenter la compatibilité Effect Schema déjà existante.
3. **Prototype jetable** : brancher `yield* effect` dans la pompe (une branche
   dans `resolveCraftGeneratorYield` + une requête d'attente réutilisant le
   chemin `'promise'`) et mesurer — y compris le coût type-level en
   instanciations, sur le même protocole que la vague 0 du système de style
   (budget de référence : +3 %).
4. **Si le prototype tient** : `@craft-ng/effect` 0.1, périmètre §5 points 1-4.
5. **Puis** : HTTP, Schedule, codecs, exemple de bout en bout, référencement
   écosystème.

Point de décision après l'étape 3 : si le marqueur type-level d'Effect casse
l'exhaustivité des exceptions de route (§4d) et qu'aucun patron ne la restaure,
le niveau 2 est abandonné et on s'arrête au niveau 1 — les adaptateurs de
loaders suffisent à couvrir 80 % de l'usage réel.
