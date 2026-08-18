# Plan — compatibilité Effect, après la sortie d'Angular

> Branche de référence : `feat/sortie-angular-v1`. Écrit le 2026-08-18.
> Remplace les conclusions de `effect-interop-study.md` sur les points §4c et §7,
> qui supposaient l'injecteur Angular comme contrainte non négociable.

## Ce que la sortie d'Angular change

État constaté : `libs/core` n'importe plus `@angular/*` (0 fichier sur 101 en
source), dépend de `alien-signals` seul (+ `rxjs` en peer), et embarque son
propre socle dans `libs/core/src/lib/host/` — injecteur hiérarchique
(`craft-injector.ts`, 414 lignes, `ɵparent`, fusion des multi-providers en
remontant), signaux, resource, routeur, DOM, HTTP. Un garde-fou
(`no-angular-imports.spec.ts`) empêche la régression.

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

## Blocage préalable au repositionnement

`libs/core/package.json` annonce encore `"description": "Type-safe Angular"`,
des mots-clés `angular`/`angular signals`, un homepage `ng-angular-stack`, et
le paquet s'appelle `@craft-ng/core`. Tant que c'est le cas, aucun pitch
« framework qui parle Effect » n'est audible. À trancher — c'est une décision
de produit, pas technique, et elle conditionne la vague 4.

## Vague 0 — Décider par la mesure (rien de public)

| # | Tâche | Sortie attendue |
|---|---|---|
| 0.1 | Prototype jetable : `yield* someEffect` dans la pompe, via une requête d'attente réutilisant le chemin `'promise'` de `craft-program-runtime.ts` | un `_tag` d'erreur Effect traverse jusqu'à `user.exception()` |
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
| 1.1 | Discriminant `_tag` au lieu de `code` : `craftError('Tag', payload)`, `catchTag`, `handleExceptions`, `RouteReachableCodes`. 7 sites runtime, 15 appels en source core |
| 1.2 | Codemod `craft-migrate-errors`, sur le modèle des 7 binaires existants de `libs/dev-tools/src/bin/` — couvre 132 specs + 61 démo |
| 1.3 | Garder le brand symbole pour `isCraftError` : ne pas renifler `_tag` structurellement sur les valeurs de retour |
| 1.4 | Renommage `scope` → `providedIn` (libère `scope` pour le sens Effect) |
| 1.5 | Docs + démo (54 fichiers de doc concernés) |

`matchBlock.exhaustive(source, key, handlers)` prend déjà le discriminant en
paramètre : passer `'_tag'` suffit, zéro changement côté template.

## Vague 2 — Le pont (`@craft-ng/effect`)

Attend la stabilisation d'Effect v4.

| # | Tâche |
|---|---|
| 2.1 | `Layer` comme sorte de provider native de `craft-injector.ts` |
| 2.2 | Héritage des runtimes imbriqués (décision actée : un enfant voit et ne reconstruit pas ce que le parent a construit) |
| 2.3 | `yield* someEffect` officiel + `runEffect(effect)` comme forme stable si l'API d'itération d'Effect bouge |
| 2.4 | Mapping : `E` → canal d'exception, **defects → canal d'erreur** (jamais dans `handleExceptions`) |
| 2.5 | Vérification de `R` au site de yield |
| 2.6 | Interruption : `DestroyRef` → `Fiber.interrupt`, `abortSignal` → interruption, et l'interruption ne doit pas se présenter comme une exception métier. Tests de fuite explicites |

Limite à documenter dès le départ : un Effect n'est yieldable que là où Craft
sait suspendre (`loader`, `canActivate`, `resolve`, `craftMethod`,
`asyncProcess`) — **pas dans `craftComputed`**, synchrone par contrat.

## Vague 3 — Finesse (conditionnée à la mesure 0.2)

| # | Tâche |
|---|---|
| 3.1 | `effectService(Tag)` — Proxy typé, sur le modèle de `inject-service.ts`. Le membre mappé doit rester **générique**, sinon l'inférence de `E` s'effondre (même piège que les insertions higher-order sur `query()`) |
| 3.2 | Mock par membre dans `setupCraftServiceTest` |
| 3.3 | Arêtes fines dans le graphe de dépendances (`UserStore → UserApi.byId`) |
| 3.4 | Projection `AsEffect<Program>` — lisibilité des signatures et de la doc uniquement |

Rappel : la sélection fine ne réduit **pas** ce qu'Effect construit (un Layer
bâtit le service entier). Elle achète le graphe, la surface de type, et le mock.

## Vague 4 — Écosystème

| # | Tâche |
|---|---|
| 4.1 | Documenter la compatibilité **déjà acquise** avec Effect Schema via Standard Schema V1 — coût nul, à publier en premier |
| 4.2 | `@effect/platform` HttpClient ↔ `host/craft-http.ts`, propagation du `correlationId` dans les spans |
| 4.3 | `Schedule` ↔ `CraftTemporalSchedule` — trancher le sous-ensemble pur vs exécution sur le runtime |
| 4.4 | Exemple bout-en-bout : un domaine Effect, un front Craft |
| 4.5 | Référencement écosystème Effect, article « l'erreur de ton service Effect vérifiée à la compilation dans ton routing » |

## Vague 5 — À étudier, pas à engager

`rxjs` est encore peer dependency. `Stream` pourrait le remplacer — ce serait
retirer une dépendance au lieu d'en ajouter une. À reprendre seulement une fois
les vagues 1-2 livrées.

## Ordre d'attaque

1. Vague 0 maintenant — c'est du prototype jetable, aucune dette.
2. Vague 1 en parallèle, indépendante d'Effect et de sa v4.
3. Vague 2 quand v4 est stable.
4. Vagues 3-4 selon la porte de décision de 0.2.
