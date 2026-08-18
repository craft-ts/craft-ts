# Plan — compatibilité Effect, après la sortie d'Angular

> Branche de travail : `feat/effect-compat`, basée sur `main` (`213b6623`).
> Écrit le 2026-08-18, réconcilié avec le code réel le même jour (§ Vérification).
> Remplace les conclusions de `effect-interop-study.md` sur les points §4c et §7,
> qui supposaient l'injecteur Angular comme contrainte non négociable.

## Ce que la sortie d'Angular change

État constaté : `libs/core` n'importe plus `@angular/*` en source (les 3 seules
occurrences restantes sont les gardes eux-mêmes, cf. vérification), dépend de
`alien-signals` seul (+ `rxjs` en peer), et embarque son propre socle dans
`libs/core/src/lib/host/` — injecteur hiérarchique (`craft-injector.ts`,
414 lignes, `ɵparent`, fusion des multi-providers en remontant), signaux,
resource, routeur, DOM, HTTP. Un garde-fou
(`host/no-angular-imports.spec.ts`) empêche la régression, doublé par
`host/public-surface.spec.ts` sur l'index public.

Trois conséquences pour le dossier Effect :

1. **L'objection principale tombe en partie.** L'argument §4c de l'étude était
   « `Layer` entre en concurrence avec la DI Angular, qui possède tout et qu'on
   ne peut pas changer ». La DI est maintenant la tienne, 414 lignes, extensible.
   La décision d'héritage des runtimes imbriqués n'est plus une sémantique
   d'Effect à découvrir : c'est ton implémentation.

2. **Une option meilleure s'ouvre.** Plutôt que de greffer un `ManagedRuntime`
   à côté de l'injecteur, `Layer` peut devenir **une sorte de provider native**
   de `craft-injector.ts`, au même titre que `useFactory` ou `useValue`.

3. **Le positionnement change de nature.** Avant : « la couche UI Angular de
   ton app Effect » — un binding de niche. Maintenant : **« le framework front
   qui parle Effect nativement »**. Il n'y a plus de framework hôte entre les
   deux. C'est la première fois que l'alliance Effect est un *positionnement*
   et non un *adaptateur*.

Et l'argument d'audience s'inverse : je soutenais qu'un rapprochement d'Effect
ferait fuir l'audience Angular. Cette audience est en cours de redéfinition de
toute façon. Un framework autonome a besoin d'une communauté ; celle d'Effect
partage exactement tes valeurs — erreurs typées, dépendances explicites,
garanties à la compilation. C'est la distribution la moins chère disponible.

## Ce qui ne change pas

- **Le rebase complet reste non.** Effect n'est pas un système de réactivité.
  `alien-signals` est ton moteur d'exécution et c'est le bon. Effect ne
  remplacerait toujours que la partie asynchrone/erreurs.
- **Le coût type-level reste le poste de risque n°1**, et il est mesurable.
- **La fragilité de l'exhaustivité reste le go/no-go** (porteur type-only qui
  dérive vers `unknown`, check post-inférence éloigné du site fautif).
- **La compatibilité structurelle par `_tag` reste gratuite** : aucune
  dépendance à `effect` nécessaire pour l'obtenir.

## Vérification sur `main` — 2026-08-18

Le plan a été écrit contre `feat/sortie-angular-v1`. Cette branche et `main`
pointent aujourd'hui sur le même commit (`213b6623 Rename project to CraftTS`).
Points contrôlés dans le code, corrections appliquées ci-dessous.

**Confirmé tel quel**

| Affirmation du plan | Réalité |
|---|---|
| `libs/core` sans `@angular` en source | 3 occurrences restantes, toutes dans les gardes eux-mêmes (`host/no-angular-imports.spec.ts`, `host/public-surface.spec.ts`, `craft-routes.spec.ts`) |
| `craft-injector.ts`, 414 lignes | exact |
| chemin `'promise'` de la pompe, point d'accroche de 0.1 | `craft-program-runtime.ts:126` (commentaire) et `:147` (`request.kind === 'promise'`) |
| discriminant passé en paramètre du match | `craftMatch.exhaustive(value, key, handlers)` — surcharge objet, `craft-match.ts:65-81` |
| 15 appels en source core | exact (`grep craftException( `, hors specs) |
| brand symbole déjà en place (tâche 1.3) | `CRAFT_EXCEPTION_SYMBOL`, `craft-exception.ts:1` ; `isCraftException` teste le symbole, pas la forme |
| binaires dev-tools comme modèle du codemod | 10 binaires dans `libs/dev-tools/src/bin/` (le plan en annonçait 7) |
| Standard Schema déjà là (tâche 4.1) | `libs/core/src/lib/standard-schema.ts`, réexporté par l'index |
| `CraftTemporalSchedule` (tâche 4.3) | `temporal-runtime.ts` |
| `rxjs` encore en peer (vague 5) | `libs/core/package.json`, 7 fichiers source non-spec l'importent |

**Corrigé — noms d'API périmés dans le plan**

| Le plan dit | Le code dit |
|---|---|
| `matchBlock.exhaustive(...)` | `craftMatch.exhaustive(...)` (`craft-match.ts`) |
| `craftError('Tag', payload)` | `craftException({ code, scope?, identifier? }, payload)` — **méta en objet, pas positionnel** (`craft-exception.ts:33`) |
| « sur le modèle de `inject-service.ts` » (3.1) | ce fichier n'existe plus ; les raccourcis `injectX.property()` et leur `Proxy` vivent dans `craft-service.ts` |

**Corrigé — volumétrie annoncée**

Comptages en fichiers sur `main` : 26 specs core appellent `craftException(`,
50 fichiers core contiennent le discriminant `code:`, 26 fichiers de démo et
37 fichiers de doc sont concernés. Le plan annonçait « 132 specs + 61 démo » et
« 54 fichiers de doc » — vraisemblablement des occurrences, pas des fichiers.
Le codemod 1.2 se dimensionne sur les chiffres ci-dessus.

**Ajouté — collision à trancher sur la tâche 1.4**

`scope` désigne aujourd'hui **deux choses différentes** :

- le scope de service — `ConcreteServiceScope = 'global' | 'toProvide' |
  'manuallyProvidedAtRoot' | 'function'` (`craft-service.shared.ts:13`), c'est
  celui que 1.4 veut renommer en `providedIn` ;
- un champ de la méta d'exception — `CraftExceptionMeta.scope`
  (`craft-exception.ts:8`), qui n'a rien à voir.

1.4 doit dire lequel il renomme (le premier), et décider du sort du second :
le laisser tel quel signifie que `scope` n'est pas libéré pour le sens Effect,
ce qui était pourtant la justification de la tâche.

**Ajouté — point d'accroche exact de la tâche 2.1**

L'injecteur ne connaît que deux formes de provider : `useValue` et `useFactory`
(`craft-injector.ts:9-12` pour le type, `:391-404` pour la résolution). « `Layer`
comme provider native » = une troisième variante à ces deux endroits, plus la
politique d'héritage de 2.2 sur `ɵparent`.

**À arbitrer — `libs/component` hors périmètre du plan**

Le plan ne parle que de `libs/core`. `libs/component` existe et expose sa propre
surface (`@craft-ts/component`, + `/testing`). La limite « pas dans
`craftComputed` » de la vague 2 doit être étendue explicitement à ce qui, côté
composant, est synchrone par contrat.

## Blocage préalable au repositionnement — partiellement levé

Le renommage a eu lieu : le paquet s'appelle `@craft-ts/core`, homepage
`craft-ts.github.io`, dépôt `craft-ts/craft-ts`. Ce qui reste dans
`libs/core/package.json` est purement éditorial :

- `"description": "Type-safe Angular. Declare. Yield. Derive. Compile — no surprises"` ;
- mots-clés `angular` et `angular signals`.

Ce n'est plus une décision de produit lourde, c'est une ligne à réécrire. Elle
conditionne toujours la vague 4 : tant que le `package.json` dit « Type-safe
Angular », aucun pitch « framework qui parle Effect » n'est audible.

## Vague 0 — Décider par la mesure (rien de public)

| # | Tâche | Sortie attendue |
|---|---|---|
| 0.1 | Prototype jetable : `yield* someEffect` dans la pompe, via une requête d'attente réutilisant le chemin `'promise'` de `craft-program-runtime.ts:147` | un `_tag` d'erreur Effect traverse jusqu'à `user.exception()` |
| 0.2 | Mesure du coût type-level sur 3 cas : yield nu, service Effect à ~15 membres, route avec exhaustivité | comparaison au budget de référence de la vague 0 du système de style (+3 % d'instanciations) |
| 0.3 | Test d'héritage des runtimes imbriqués : layer racine + layer de route qui en dépend, 2 navigations | compteur d'instanciations = 1 |
| 0.4 | Test de qualité du message d'erreur quand l'extraction de `E` échoue | l'erreur doit désigner le guard, pas seulement `assertExhaustiveRouteExceptions` |

**Porte de décision.** Si 0.2 dépasse largement le budget → la vague 3 saute.
Si 0.4 est indiagnosticable → on s'arrête à la vague 1 + les adaptateurs de
loaders, sans exhaustivité sur les erreurs Effect.

## Vague 1 — Le socle, sans aucune dépendance

Aucune connaissance d'Effect requise. Valeur acquise même si Effect est
abandonné ensuite.

| # | Tâche |
|---|---|
| 1.1 | Discriminant `_tag` au lieu de `code` : `craftException({ _tag }, payload)`, `catchTag`, `handleExceptions`, `RouteReachableCodes`. 15 appels en source core, 50 fichiers core portent `code:` |
| 1.2 | Codemod `craft-migrate-errors`, sur le modèle des 10 binaires existants de `libs/dev-tools/src/bin/` — couvre 26 specs core + 26 fichiers de démo |
| 1.3 | Garder le brand symbole pour `isCraftException` : ne pas renifler `_tag` structurellement sur les valeurs de retour — **déjà le cas**, tâche réduite à une non-régression |
| 1.4 | Renommage `scope` → `providedIn` sur `ConcreteServiceScope` (libère `scope` pour le sens Effect). Trancher d'abord la collision avec `CraftExceptionMeta.scope`, cf. vérification |
| 1.5 | Docs + démo (37 fichiers de doc, 26 de démo concernés) |

`craftMatch.exhaustive(source, key, handlers)` prend déjà le discriminant en
paramètre : passer `'_tag'` suffit, zéro changement côté template.

## Vague 2 — Le pont (`@craft-ts/effect`)

Attend la stabilisation d'Effect v4.

| # | Tâche |
|---|---|
| 2.1 | `Layer` comme sorte de provider native de `craft-injector.ts` — 3ᵉ variante à `:9-12` et `:391-404` |
| 2.2 | Héritage des runtimes imbriqués (décision actée : un enfant voit et ne reconstruit pas ce que le parent a construit), via `ɵparent` |
| 2.3 | `yield* someEffect` officiel + `runEffect(effect)` comme forme stable si l'API d'itération d'Effect bouge |
| 2.4 | Mapping : `E` → canal d'exception, **defects → canal d'erreur** (jamais dans `handleExceptions`) |
| 2.5 | Vérification de `R` au site de yield |
| 2.6 | Interruption : `DestroyRef` → `Fiber.interrupt`, `abortSignal` → interruption, et l'interruption ne doit pas se présenter comme une exception métier. Tests de fuite explicites |

Limite à documenter dès le départ : un Effect n'est yieldable que là où Craft
sait suspendre (`loader`, `canActivate`, `resolve`, `craftMethod`,
`asyncProcess`) — **pas dans `craftComputed`**, synchrone par contrat, ni dans
les équivalents synchrones par contrat de `libs/component`.

## Vague 3 — Finesse (conditionnée à la mesure 0.2)

| # | Tâche |
|---|---|
| 3.1 | `effectService(Tag)` — Proxy typé, sur le modèle des raccourcis `injectX.property()` de `craft-service.ts`. Le membre mappé doit rester **générique**, sinon l'inférence de `E` s'effondre (même piège que les insertions higher-order sur `query()`) |
| 3.2 | Mock par membre dans `setupCraftServiceTest` |
| 3.3 | Arêtes fines dans le graphe de dépendances (`UserStore → UserApi.byId`) |
| 3.4 | Projection `AsEffect<Program>` — lisibilité des signatures et de la doc uniquement |

Rappel : la sélection fine ne réduit **pas** ce qu'Effect construit (un Layer
bâtit le service entier). Elle achète le graphe, la surface de type, et le mock.

## Vague 4 — Écosystème

| # | Tâche |
|---|---|
| 4.0 | Réécrire `description` et purger les mots-clés `angular` de `libs/core/package.json` — préalable aux autres tâches de la vague |
| 4.1 | Documenter la compatibilité **déjà acquise** avec Effect Schema via Standard Schema V1 (`standard-schema.ts`) — coût nul, à publier en premier |
| 4.2 | `@effect/platform` HttpClient ↔ `host/craft-http.ts`, propagation du `correlationId` dans les spans |
| 4.3 | `Schedule` ↔ `CraftTemporalSchedule` (`temporal-runtime.ts`) — trancher le sous-ensemble pur vs exécution sur le runtime |
| 4.4 | Exemple bout-en-bout : un domaine Effect, un front Craft |
| 4.5 | Référencement écosystème Effect, article « l'erreur de ton service Effect vérifiée à la compilation dans ton routing » |

## Vague 5 — À étudier, pas à engager

`rxjs` est encore peer dependency, importé par 7 fichiers source non-spec de
`libs/core`. `Stream` pourrait le remplacer — ce serait retirer une dépendance
au lieu d'en ajouter une. À reprendre seulement une fois les vagues 1-2 livrées.

## Ordre d'attaque

1. Vague 0 maintenant — c'est du prototype jetable, aucune dette.
2. Vague 1 en parallèle, indépendante d'Effect et de sa v4. Trancher 1.4 avant
   d'écrire le codemod 1.2.
3. Vague 2 quand v4 est stable.
4. Vagues 3-4 selon la porte de décision de 0.2.
