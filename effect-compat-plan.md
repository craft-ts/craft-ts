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
| discriminant passé en paramètre du match | vrai des **deux** : `matchBlock.exhaustive(source, key, handlers)` côté template (`libs/component/src/lib/match-block.ts:73`) et `craftMatch.exhaustive(value, key, handlers)` côté valeur (`craft-match.ts:65-81`) |
| 15 appels en source core | exact (`grep craftException( `, hors specs) |
| brand symbole déjà en place (tâche 1.3) | `CRAFT_EXCEPTION_SYMBOL`, `craft-exception.ts:1` ; `isCraftException` teste le symbole, pas la forme |
| binaires dev-tools comme modèle du codemod | 10 binaires dans `libs/dev-tools/src/bin/` (le plan en annonçait 7) |
| Standard Schema déjà là (tâche 4.1) | `libs/core/src/lib/standard-schema.ts`, réexporté par l'index |
| `CraftTemporalSchedule` (tâche 4.3) | `temporal-runtime.ts` |
| `rxjs` encore en peer (vague 5) | `libs/core/package.json`, 7 fichiers source non-spec l'importent |

**Corrigé — noms d'API périmés dans le plan**

| Le plan dit | Le code dit |
|---|---|
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

### Résultat de 0.1 — fait le 2026-08-18, effect@3.22.1

**Le runtime marche, du premier coup.** `yield* someEffect` traverse la pompe et
le `_tag` de l'erreur Effect arrive bien sur `queryRef.exception()`.
7 tests verts (`effect-yield.prototype.spec.ts`), suite core complète toujours
verte (136 fichiers, 1449 tests), zéro erreur tsc ajoutée.

Ce que ça a coûté côté production : **une seule extension**, dans
`craft-program-runtime.ts` — un « foreign yield bridge » optionnel consulté juste
avant l'erreur d'invalid-yield, qui réutilise tel quel le chemin `'promise'`.
Rien d'autre n'a bougé. Le pont lui-même est un `.fixture.ts` (motif exclu de
`tsconfig.lib.json`), donc `@craft-ts/core` ne gagne aucune dépendance à
`effect` — la porte de sortie reste gratuite.

Protocole — **et c'est là que v4 change tout**. En v3, `yield* effect` produit un
`YieldWrap` dont le contenu est un champ `#private` : il fallait `yieldWrapGet`
de `effect/Utils` et aucun reniflage structurel n'était possible. En **v4
(`4.0.0-rc.110`), `yield*` yield l'Effect lui-même** : `Effect.isEffect(yielded)`
suffit, et l'étape de déballage disparaît. Le pont y perd une dépendance à un
module interne d'Effect.

**Les deux trous trouvés, tous les deux type-level :**

- **0.1-a — `R` n'est pas vérifié au site de yield.** `Effect.isEffect` ne narrow
  que vers `Effect<unknown, unknown, unknown>`, alors que `runPromiseExit` exige
  `R = never`. Au moment où le pont tient l'Effect, il est trop tard : un Effect
  avec des requirements non satisfaits n'échoue qu'à l'exécution. C'est
  exactement la tâche 2.5, et elle n'est pas optionnelle.
- **0.1-b — `E` ne remonte pas dans le canal d'exception.** C'est le trou
  sérieux. Le loader `function* () { yield* Effect.fail(new UserNotFound(...)) }`
  produit un `queryRef.exception()` typé `undefined` : **une exception n'est même
  pas représentable** au niveau des types, alors qu'il y en a une, prouvée, à
  l'exécution. Le test le fige avec un `expectTypeOf(...).toEqualTypeOf<undefined>()`
  pour que la vague 2 le fasse tomber.

0.1-b est le vrai enjeu : sans lui, « les erreurs de ton service Effect
vérifiées à la compilation » — le pitch entier de la vague 4 — est faux. La
compatibilité *runtime* est acquise et bon marché ; c'est la compatibilité
*type-level* qui reste à démontrer, et c'est elle que 0.2 doit chiffrer.

**Le mapping `_tag` → `code` est écrit à la main dans le pont** (une ligne). Il
disparaît dès que la vague 1 est faite : c'est l'argument le plus concret en
faveur de la tâche 1.1.

**Défauts (`Effect.die`) → canal d'erreur**, jamais exception : vérifié par test,
conformément à 2.4.

**Coût type-level — pas encore mesuré, et les chiffres faciles trompent.**
Importer `effect` et écrire `Effect.succeed(1)` coûte 3 instanciations : le coût
d'entrée de la dépendance est nul. Le coût réel est dans l'*interaction* entre
les types d'Effect et l'inférence de craft, et c'est précisément ce que 0.2 doit
isoler sur ses 3 cas. Aucune comparaison valable n'a été produite ici : les deux
programmes tsc que le prototype permet de comparer n'ont pas la même surface
craft, le rapport entre eux ne veut rien dire.

**Trouvé en passant, hors périmètre Effect.** `host/no-angular-imports.spec.ts`
shelle `rg` avec un `|| true` : sur une machine sans ripgrep — dont celle-ci — le
garde-fou anti-Angular **passe au vert sans rien vérifier**. À réparer
indépendamment de ce dossier.

### Résultat de 0.2 — fait le 2026-08-18

Harnais reproductible : `node tools/effect-typecost/run.mjs`. Méthode : la
surface craft est tenue **fixe**, seul le contenu Effect varie — la comparaison
« un programme avec Effect vs un sans » ne mesure rien, les deux n'ont pas la
même surface. 12 cas, tous compilent sans erreur.

| Cas | craft | effect | delta | verdict vs budget +3 % |
|---|---|---|---|---|
| B · service à 15 membres | 798 995 | 799 814 | **+819 (+0,10 %)** | sous budget, marge ×29 |
| C · exhaustivité de route | 801 325 | 801 461 | **+136 (+0,02 %)** | sous budget, marge ×177 |

**Cas A — le coût d'un yield.** La pente moyenne serait trompeuse : le coût
n'est pas linéaire.

- Importer `effect` sans rien yielder coûte **exactement 0** (799 660 dans les
  deux bras). Le coût d'entrée de la dépendance est nul.
- Le **premier** yield d'Effect dans un fichier coûte **+94** instanciations —
  soit **moins cher que le premier yield craft natif** (`craftSleep` : +105).
  (En v3 c'était +174 : v4 a divisé ce coût par deux.)
- Chaque yield Effect **suivant** coûte **+12** (craft : +0 — TS mémoïse
  entièrement, Effect non).

**Porte de décision : la vague 3 n'est pas bloquée.** Le pire cas mesuré est
+0,11 %, contre un budget de +3 %. Il n'y a pas de falaise type-level.

**Limites à ne pas oublier.** Ce sont des coûts marginaux mesurés sur des cas
petits, sur une base dominée par l'import de `@craft-ts/core` (~800 k
instanciations). Les nombres transférables sont les coûts unitaires : ~59
instanciations par membre de service Effect (891/15), +12 par yield
supplémentaire. Le cas C mesure la chaîne complète : `craftGen` → `RouteExceptionUnion` →
`craftRoutes()` → `assertExhaustiveRouteExceptions`.

**Et une découverte de méthode, plus importante que les chiffres.** Le bras
Effect du cas C **ne peut pas être écrit** tel que la tâche 0.2 l'imaginait :
dériver la map de handlers depuis le `E` d'un Effect ne compile pas, puisque
`E` n'atteint pas `RouteExceptionUnion` (constat 0.1-b). Le cas mesure donc le
coût d'ajouter Effect **par-dessus** l'exhaustivité écrite à la main, pas une
exhaustivité pilotée par Effect. Tant que 2.4/2.5 ne sont pas faits, cette
seconde chose n'existe pas — et c'est elle qu'il faudra re-mesurer.

Corollaire, trouvé en écrivant 0.4 et rétro-corrigé ici : un guard déclare ses
exceptions **via `craftGen`**. `RouteExceptionUnion` lit le type *Yielded* du
générateur, et `craftGen` est ce qui y fait remonter une `craftException`
retournée. Un `function*` nu ne déclare **rien** — et dans ce cas la vérification
d'exhaustivité accepte silencieusement n'importe quelle map de handlers. Le
harnais s'est fait piéger dessus : ma première version du cas C ne mesurait
aucune exhaustivité.

### Résultat de 0.4 — fait le 2026-08-18

Harnais : `node tools/effect-diagnostics/run.mjs`. Trois cas censés ne pas
compiler ; on regarde où l'erreur tombe et ce qu'elle dit.

La question telle qu'écrite — « quand l'extraction de `E` échoue » — présuppose
un mécanisme absent : `E` n'atteint jamais `RouteExceptionUnion`, donc
l'extraction n'échoue pas, elle n'existe pas. Ce qui est mesuré est la qualité
du diagnostic d'exhaustivité **actuel**, puisque c'est de lui que la vague 2
héritera.

| Cas | Résultat |
|---|---|
| handler manquant | **2 erreurs**, dont une **au site de la route** : `[MISSING_EXCEPTION_HANDLERS]: "NotFound"`. L'assert ajoute `{ route: "probe"; missingHandlers: "NotFound" }` |
| handler en trop | **1 erreur, uniquement sur l'assert**. Rien n'ancre le handler fautif |
| erreurs Effect | **compile proprement — aucune erreur** |

**Porte de décision : 0.4 ne bloque pas.** Le message du cas « handler
manquant » désigne bien la route et nomme le code, pas seulement
`assertExhaustiveRouteExceptions` — c'est précisément ce que la tâche
demandait. La machinerie diagnostique correctement dès que l'union est peuplée ;
ce qui manque n'est pas le diagnostic mais son alimentation, c'est-à-dire
2.4/2.5.

**Deux réserves à porter en vague 2.**

- Le **handler en trop** n'est attrapé que par l'assert, loin du code fautif.
  Si la vague 2 fait remonter `E`, ce cas deviendra le plus fréquent (un `_tag`
  disparaît du service Effect, le handler reste) — il mérite un ancrage.
- Le cas Effect **passe en silence**, ce qui est pire qu'une erreur : on écrit
  trois handlers pour trois `_tag` Effect, ça compile, et à l'exécution les
  exceptions arrivent bel et bien (vérifié en 0.1) sans que rien n'ait été
  vérifié. C'est un faux sentiment de sécurité, pas une simple absence de
  vérification.

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

`matchBlock.exhaustive(source, key, handlers)` prend déjà le discriminant en
paramètre : passer `'_tag'` suffit, zéro changement côté template.

## Vague 2 — Le pont (`@craft-ts/effect`)

**Correction : Effect v4 est disponible** — `4.0.0-rc.110` sous le tag `rc`
(et `4.0.0-beta.107` en `beta`). Seul `latest` pointe encore sur 3.22.1. La
vague 2 n'est donc plus bloquée par un calendrier externe. Tout le dossier est
désormais mesuré et prototypé **sur v4**.

Ce que v4 apporte directement au plan :

- **2.3 se simplifie** : `yield*` yield l'Effect lui-même, donc la détection est
  structurelle (`Effect.isEffect`) et le pont ne dépend plus de `effect/Utils`.
  `runEffect()` reste utile comme forme stable, mais n'est plus un contournement.
- **2.2 a un mécanisme natif** : `Layer.MemoMap`, absent de v3. Chaque niveau
  d'injecteur *forke* la memo map de son parent (`Layer.forkMemoMapUnsafe`), ce
  qui donne exactement la sémantique voulue — la racine construite une fois, le
  layer de route reconstruit à chaque navigation. Vérifié en 0.3.
- **2.4 change d'API** : un `Cause` v4 porte un tableau `reasons` ;
  `Cause.findErrorOption` donne l'erreur typée et `Cause.squash` le défaut.
- `Context.Tag` devient `Context.Service<Self, Shape>()('Name')`, et
  `Layer.sync`/`Layer.effect` sont curriés.

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

### Résultat de la vague 2 — fait le 2026-08-18, sur Effect v4

Paquet **`@craft-ts/effect`** (`libs/effect/`), 18 tests verts. `libs/core` ne
gagne **aucune** dépendance à `effect` : le seul changement côté core est le
hook de *foreign yield*, promu de prototype à API réelle
(`setForeignYieldBridge`), qui reçoit désormais l'injecteur et le signal
d'annulation — sans quoi 2.1, 2.2 et 2.5 étaient impossibles.

| # | État | Ce qui a été fait |
|---|---|---|
| 2.1 | **fait** | `provideLayer(layer)` retourne un `CraftProvider` ordinaire, au même titre que `useValue`/`useFactory` |
| 2.2 | **fait** | Héritage par **fork de la `MemoMap`** du parent. Racine construite 1 fois, layer de route reconstruit par navigation. Contrôle négatif inclus |
| 2.3 | **fait** | `installCraftEffectBridge()` + `runEffect()` comme forme stable. Détection structurelle (`Effect.isEffect`), plus de dépendance à `effect/Utils` |
| 2.4 | **fait** | succès → reprise ; `E` → exception taguée ; défaut → canal d'erreur ; interruption → `CraftEffectInterrupted`, jamais une exception |
| 2.5 | **fait** | Moitié runtime : `R` satisfait depuis le contexte du niveau. Moitié type-level : `assertNoRequirements` échoue **au site de yield** et nomme les services manquants |
| 2.6 | **fait** | `abortSignal` → interruption ; et le `Scope` de chaque niveau est fermé à la destruction de l'injecteur, avec 4 tests de fuite explicites |

**Ce que 0.1-a devient.** La tâche 2.5 avait été identifiée comme non
optionnelle parce que `Effect.isEffect` ne narrow que vers des requirements
inconnus, et qu'au moment où le pont tient l'Effect il est trop tard pour
désigner le code fautif. `assertNoRequirements` déplace le contrôle au site
d'appel : `AssertNoRequirements<Self>` renvoie un `MissingRequirements<R>`
branché, non assignable à un `Effect`, donc l'erreur tombe sur le `yield*`.

**La fuite de 2.6 est colmatée.** Chaque niveau créait un `Scope` Effect que
rien ne fermait : un layer à ressource (connexion, souscription, timer) fuyait
à chaque navigation. Le `Scope` est maintenant fermé via le hook `ɵonDestroy` de
l'injecteur — un niveau vit exactement aussi longtemps que son injecteur. Quatre
tests de fuite le vérifient, et j'ai confirmé qu'ils **échouent tous les quatre**
si on retire le teardown : ils portent bien la régression.

**0.1-b est fermé** — voir la section dédiée ci-dessous.

### 0.1-b fermé — l'erreur d'un Effect vérifiée à la compilation

C'était le constat le plus grave du dossier : le pont mappait `E` vers le canal
d'exception **à l'exécution**, et les types n'en savaient rien. Un loader qui
yieldait un Effect en échec laissait `queryRef.exception()` typé `undefined`, et
la map `handleExceptions` d'une route était acceptée quel qu'en soit le contenu.
La phrase « tes erreurs Effect vérifiées à la compilation » était fausse.

**Pourquoi ça ne pouvait pas être réparé dans le pont.**
`RouteExceptionUnion` lit le type *Yielded* d'un générateur craft et y cherche
des `CraftGenExceptionMarker`. Un `yield* someEffect` nu place un `Effect` à
cette position, qui ne porte aucun marqueur — donc rien ne remonte, quoi que le
pont fasse ensuite.

**La réparation est au site de yield**, le seul endroit qui connaît encore `E`.
`runEffect(effect)` retourne un générateur dont le type *Yielded* porte un
marqueur construit à partir de `E`. Le `yield*` fusionne ce Yielded dans le
générateur englobant, donc `E` atteint `RouteExceptionUnion` exactement comme
une exception `craftGen`. À l'exécution il yield l'Effect inchangé : le marqueur
est purement type-level et n'est jamais émis.

**Ce qui est vérifié** (`effect-exceptions.spec.ts`) :

- un guard qui `yield* runEffect(loadUser)` annonce bien les deux tags de `E`
  comme exceptions craft ;
- un Effect infaillible n'annonce **rien** ;
- une route qui couvre exactement les tags compile ;
- une route qui en **oublie un ne compile plus**, et l'erreur tombe **deux
  fois** : au site de la route (`[MISSING_EXCEPTION_HANDLERS]: "Unauthorized"`)
  *et* sur l'assert post-inférence
  (`{ route: "probe"; missingHandlers: "Unauthorized" }`). C'est mieux que ce
  que 0.4 mesurait pour les exceptions craft natives, où le handler en trop
  n'était attrapé que par l'assert ;
- le runtime continue d'être d'accord avec les types.

**Conséquence sur 0.4.** La réserve « le cas Effect passe en silence » tombe pour
les yields écrits avec `runEffect`. Elle reste vraie pour un `yield*` nu, qui
marche à l'exécution mais ne déclare rien — c'est la différence que la page de
démo montre désormais explicitement.

**Conséquence sur la vague 1.** `EffectExceptionOf` doit aujourd'hui *transposer*
le `_tag` d'Effect vers le `code` de craft. Une fois la vague 1 faite, la
transposition devient l'identité et le type disparaît. C'est l'argument le plus
concret en faveur de 1.1, et il est maintenant écrit dans le code.

## Vague 3 — Finesse (conditionnée à la mesure 0.2)

| # | Tâche |
|---|---|
| 3.1 | `effectService(Tag)` — Proxy typé, sur le modèle des raccourcis `injectX.property()` de `craft-service.ts`. Le membre mappé doit rester **générique**, sinon l'inférence de `E` s'effondre (même piège que les insertions higher-order sur `query()`) |
| 3.2 | Mock par membre dans `setupCraftServiceTest` |
| 3.3 | Arêtes fines dans le graphe de dépendances (`UserStore → UserApi.byId`) |
| 3.4 | Projection `AsEffect<Program>` — lisibilité des signatures et de la doc uniquement |

Rappel : la sélection fine ne réduit **pas** ce qu'Effect construit (un Layer
bâtit le service entier). Elle achète le graphe, la surface de type, et le mock.

### Résultat de la vague 3 — fait le 2026-08-18

La porte 0.2 étant ouverte (+0,10 % contre un budget de +3 %), la vague est
engagée. 31 tests verts sur `@craft-ts/effect`.

| # | État | Ce qui a été fait |
|---|---|---|
| 3.1 | **fait** | `effectService(Tag)` et `effectService(Tag, select)` |
| 3.2 | **fait** | `mockEffectService(Tag, stubs)` — mock par membre |
| 3.3 | **fait** | arêtes fines `Consumer → Service.membre` dans le graphe |
| 3.4 | **fait** | projection `AsEffect<Program>` |

**3.1 — le piège évité, et il n'est pas là où le plan le disait.** Le plan
prévenait que « le membre mappé doit rester générique ». La conclusion réelle est
plus forte : **il ne faut pas mapper du tout**. Tout wrapper — pour tracer une
arête, pour permettre un mock — fige les paramètres de type au niveau du
wrapper et effondre chaque site d'appel générique. La sortie est que le sélecteur
*choisit* les membres et que le type du résultat est littéralement le type de
retour du sélecteur : chaque membre garde sa signature, génériques et surcharges
compris, et à l'exécution ce sont les fonctions d'origine. Un test le vérifie sur
un membre `<T>(items: readonly T[]) => Effect<T, NotFound>` et sur l'inférence
de `T` à l'appel.

Corollaire pratique : en v4 un `Context.Service` **est** un Effect, donc
`effectService` se réduit à un `Effect.map` sur le tag. Rien à inventer.

**3.2 — le mock par membre échoue bruyamment.** Un membre non stubbé ne rend pas
`undefined` : il renvoie un appelable qui meurt en nommant le membre oublié.
Stubber quinze membres pour en exercer un enterrait l'intention du test.

**3.3 — arêtes fines dans le graphe.** Un `effectService(UserApi, ({ byId }) =>
({ byId }))` produit désormais `UserStore → UserApi.byId` au lieu de
`UserStore → UserApi`. Le collecteur vit dans
`libs/dev-tools/src/scripts/effect-dependency-graph.ts`, branché en fin de
pipeline d'`analyzeDependencyGraph` ; il réutilise les types de nœud `property`
et d'arête `uses-property` qui existaient déjà pour les raccourcis craft, donc
le rendu HTML et Mermaid les affiche sans changement.

Trois décisions à retenir :

- les services Effect sont reconnus **sur la forme** de la clause d'héritage
  (`class X extends Context.Service<…>()('Name')`), pas sur un import : le tag
  est régulièrement réexporté via un barrel ;
- le propriétaire d'une arête est le composant ou service craft dont l'appel
  **englobe** le `effectService(...)`, le plus imbriqué gagnant. Un appel qui
  n'appartient à aucun consommateur connu est **ignoré** — une arête accrochée à
  un nœud arbitraire serait fausse, et pas de dessin vaut mieux qu'un faux ;
- sans sélecteur, l'arête reste grossière (`depends-on` vers le service entier),
  ce qui est le dessin honnête quand le consommateur a effectivement tout pris.

7 tests, dont les deux cas négatifs (rien n'est inventé pour un membre non
sélectionné ; aucune arête quand le propriétaire est inconnu).

**Rappel que la mesure confirme.** La sélection fine ne réduit toujours pas ce
qu'Effect construit — un `Layer` bâtit le service entier. Elle achète le graphe,
la surface de type et le mock, rien d'autre. Avec 3.3 fait, les trois sont
livrés, et **la vague 3 est complète**.

## Vague 4 — Écosystème

| # | Tâche |
|---|---|
| 4.0 | Réécrire `description` et purger les mots-clés `angular` de `libs/core/package.json` — préalable aux autres tâches de la vague |
| 4.1 | Documenter la compatibilité **déjà acquise** avec Effect Schema via Standard Schema V1 (`standard-schema.ts`) — coût nul, à publier en premier |
| 4.2 | `@effect/platform` HttpClient ↔ `host/craft-http.ts`, propagation du `correlationId` dans les spans |
| 4.3 | `Schedule` ↔ `CraftTemporalSchedule` (`temporal-runtime.ts`) — trancher le sous-ensemble pur vs exécution sur le runtime |
| 4.4 | Exemple bout-en-bout : un domaine Effect, un front Craft |
| 4.5 | Référencement écosystème Effect, article « l'erreur de ton service Effect vérifiée à la compilation dans ton routing » |

### Résultat de 4.0 et 4.1 — fait le 2026-08-18

| # | État | Ce qui a été fait |
|---|---|---|
| 4.0 | **fait** | `description` et mots-clés de `libs/core/package.json`, plus le README npm |
| 4.1 | **fait** | section Effect Schema, et 8 tests qui la tiennent |
| 4.2 | à faire | |
| 4.3 | à faire | |
| 4.4 | à faire | |
| 4.5 | à faire | |

**4.0 — le README mentait plus que le `package.json`.** Le blocage identifié
par le plan était la `description`. En pratique le README, qui est la page npm,
portait deux affirmations devenues **fausses** et pas seulement mal
positionnées : « targets Angular 21 » (il n'y a plus aucune dépendance de
runtime framework, la réactivité est alien-signals) et « Angular signals remain
internal to the primitives » (ce ne sont pas les signaux d'Angular). Corrigés
tous les deux. `@craft-ts/effect` y est aussi listé : livré aux vagues 2 et 3,
il n'était mentionné **nulle part** dans la surface publiée.

`@craft-ts/dev-tools` garde son mot-clé `angular` volontairement : il livre de
vrais codemods de migration Angular et des peer deps ESLint Angular.

**4.1 — la compatibilité était acquise, la documentation était fausse.** Le
plan classait la tâche en « coût nul, à publier en premier ». La compatibilité
est bien réelle et sans une ligne d'adaptateur, mais trois pages listaient
Effect à côté de Zod et Valibot **comme si un `effect/Schema` était lui-même un
Standard Schema**. Il ne l'est pas : il faut `Schema.toStandardSchemaV1`. Un
lecteur qui suivait la phrase d'origine passait le schéma brut et se prenait une
erreur de type.

Deux points que la documentation ne disait nulle part, trouvés en lisant
`schema-validation.ts` :

- `paramsSchema`, `methodSchema` et les écritures `set`/`update`/`patch` passent
  par `parseSync`, qui **jette** sur une `Promise`. Un schéma Effect simple est
  synchrone et passe partout, mais une transformation asynchrone n'est utilisable
  que dans `loaderSchema`, le seul étage qui attend.
- craft publie la valeur **décodée**, donc un schéma qui transforme montre son
  type de sortie en aval.

Le test qui porte vraiment la vague est l'assertion de type entre la copie
locale du spec Standard Schema dans `standard-schema.ts` et les types
`@standard-schema/spec` contre lesquels Effect compile : c'est le seul mode de
défaillance réel de cette interop, et il cesse de compiler si l'un des deux
dérive. Aucun code d'adaptateur n'est livré et le spec est ce qui maintient
cette promesse.

À noter, dans le thème de la session : mon premier jet de la doc donnait
`Schema.Date` comme exemple de décodage `string -> Date`. C'est faux,
`Schema.Date` **rejette** une chaîne ; le décodeur est `Schema.DateFromString`.
L'erreur n'a été vue que parce que la doc a été écrite avec un test en face.

**Au passage** : `tsc -p libs/effect/tsconfig.spec.json` était rouge avant cette
vague. Un commentaire d'`effect-exceptions.spec.ts` affirmait que le diagnostic
de handler manquant ne tombait plus sur la définition de route ; il y tombe, et
il n'était pas gardé. Les deux `@ts-expect-error` sont désormais porteurs — tsc
signale une directive inutilisée si l'une des deux garanties disparaît.

**Reste ouvert avant de publier** : `@craft-ts/effect` déclare
`"effect": "^4.0.0-rc.110"` en peer dependency. Un `^` sur une RC engage à
suivre chaque `rc.111`. À trancher — épingler la version exacte, ou garder le
paquet non publié jusqu'à la v4 stable.


## Vague 5 — À étudier, pas à engager

`rxjs` est encore peer dependency, importé par 7 fichiers source non-spec de
`libs/core`. `Stream` pourrait le remplacer — ce serait retirer une dépendance
au lieu d'en ajouter une. À reprendre seulement une fois les vagues 1-2 livrées.

## Ordre d'attaque

1. Vague 0 maintenant — c'est du prototype jetable, aucune dette.
2. Vague 1 en parallèle, indépendante d'Effect et de sa v4. Trancher 1.4 avant
   d'écrire le codemod 1.2.
3. Vague 2 : plus de blocage externe, v4 est en RC.
4. Vagues 3-4 selon la porte de décision de 0.2.
