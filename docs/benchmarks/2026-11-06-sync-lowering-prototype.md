# Prototype : compilation des génératrices synchrones

6 novembre 2026. Commit figé `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`, worktree `codex/benchmark-e135eeec9`. Prototype jetable en TypeScript/JavaScript, sans nouvelle dépendance. Les sources de Core et Component du checkout restent inchangées ; les transformations s’appliquent à des copies temporaires.

## Résultat

**La transformation fonctionne sur les formes reconnues, mais compiler les génératrices seules ne démontre pas de gain de montage net.** Le microbenchmark de protocole baisse d’environ 20 % sans wrapper de service et 16 % avec wrapper ; ce gain ne se retrouve pas dans les listes de 1 000/5 000 lignes.

L’investigation trouve aussi une répétition précise : 1 001 des 1 006 appels au driver, à 1 000 lignes avec le plan préparé, viennent de l’enregistrement des cibles runtime. Le chemin vide construit et conduit une génératrice même sans wrapper. Un raccourci conditionnel ramène le total à **5**, en conservant la cible, le même release et l’inscription au nettoyage. Il ne demande pas de compilateur. Cette suppression massive du nombre de passages dans le driver ne produit pas un saut de montage : ce compteur n’est pas une mesure du temps total consommé.

Les gains déjà obtenus par les plans de création spécialisés restent beaucoup plus importants. Ce prototype ne permet pas de conclure qu’un compilateur complet serait inutile ; il montre que l’effacement du protocole des génératrices, à lui seul et avec cette couverture conservatrice, ne suffit pas.

## Ce que le compilateur fait réellement

`sync-lowering.compiler.mjs` transforme l’AST TypeScript, puis imprime les sources utilisées par Vite. Les plans de DOM du benchmark restent ceux préparés manuellement lors de la campagne précédente ; ce prototype n’automatise pas leur génération.

Pour une fonction génératrice reconnue, il conserve la fonction originale et enregistre une version synchrone dans une WeakMap. Les fonctions publiques continuent donc à retourner leurs génératrices. Les points d’exécution Craft explicitement pris en charge peuvent choisir la version directe sans créer l’itérateur original.

Exemple schématique du code produit :

```ts
const readLabel = prototypeRegisterSync(
  function* () { return (yield* input()).label; },
  function () { return prototypeDelegateCall(input, undefined, []).label; },
);
```

La délégation appelle directement un autre programme compilé si elle le connaît. Sinon, elle utilise le driver original. Les appels avec récepteur utilisent des temporaires pour conserver l’ordre `récepteur → getter → arguments → corps` et la valeur de `this`.

Les transformations couvrent :

- génératrices synchrones simples, dont celles sans yield ;
- délégations `yield*`, avec repli pour les programmes inconnus ;
- requêtes de service et d’accès de dépendance reconnues dans les fichiers internes autorisés ;
- lectures réactives reconnues, en conservant les notifications des observateurs et le lecteur actif ;
- alias de proxies de fonctions dont le handler statique ne définit pas de piège `apply` ;
- appels `craftUse(reader(...))` dont le lecteur est un identifiant simple, et exécution des factories reconnues après application des wrappers habituels.

La résolution DI continue à passer par le résolveur existant, y compris ses wrappers. Les requêtes restent construites dans cette version : il ne s’agit pas encore d’éliminer toutes les allocations de requêtes, ni de pré-calculer les emplacements DI. Les factories de services qui collectent les primitives exposées restent conduites par leur driver habituel.

Le compilateur refuse notamment async, paramètres avec valeur par défaut ou destructuration, références à `arguments`/`eval`, et `try` contenant un yield. Ce dernier point est nécessaire : aujourd’hui une erreur de résolution levée par le driver n’est pas injectée via `iterator.throw()`. Transformer naïvement ce yield en appel dans un `try/finally` changerait donc le comportement du finally. Le scénario différentiel vérifie ce cas.

Les registrations de programmes sont dans un module sans dépendance. Cela évite d’ajouter un cycle d’initialisation entre le runtime des génératrices, les signaux et la DI de Core. Les noms privés réservés et la couverture des formes syntaxiques restent ceux d’un prototype, pas d’un compilateur de production pour du TypeScript arbitraire.

## Montage : même cohorte, avant peinture

Médianes de cinq navigations indépendantes par case, production minifiée, ordre mélangé. 80 navigations de montage au total. Comparaisons internes uniquement ; aucun autre framework remesuré.

| Lignes | Index | Fin générique | Fin générique compilé | Plan fin préparé | Plan préparé + compilation |
|---:|:---:|---:|---:|---:|---:|
| 1000 | non | 42,8 ms | 44,2 ms | 29,4 ms | 28,1 ms |
| 1000 | oui | 54,3 ms | 52,8 ms | 30,9 ms | 32,0 ms |
| 5000 | non | 132,4 ms | 134,5 ms | 84,2 ms | 82,5 ms |
| 5000 | oui | 196,7 ms | 196,8 ms | 97,2 ms | 101,2 ms |

Les différences sont faibles et changent de sens selon le cas. À 5 000 lignes avec index, le fin générique reste à environ 197 ms ; le plan préparé passe de 97,2 à 101,2 ms avec cette compilation. La version conservatrice ajoute des fonctions alternatives et une recherche de programme ; une délégation non compilée repasse encore par le driver.

Sur le plan préparé à 5 000 lignes, le heap JS après actions et GC passe de 39,55 à 40,37 Mio sans index, et de 45,93 à 46,75 Mio avec index. Les fonctions alternatives des lecteurs créées par instance ont donc un coût mesuré d’environ 0,82 Mio dans ces fixtures. La conservation des deux représentations n’est pas gratuite.

Les bundles des deux pages compilées du benchmark passent de 198 719 à 203 109 octets JS minifiés pour le plan préparé, et de 59 631 à 60 583 octets gzip : environ +4,4 ko JS / +0,95 ko gzip. Ces chiffres incluent la page de contrats et les fixtures de validation communes à la cohorte ; ce ne sont pas des tailles publiées d’un package de production.

## Test isolé du protocole

Chaque programme résout un service déjà initialisé puis lit une valeur réactive, calcule une valeur contrôlée et accumule un checksum. Les durées excluent la préparation du service. Neuf séries alternées dans une même page après échauffement ; ce ne sont pas neuf navigations indépendantes. Chaque série exécute 10 000 programmes. Le mode avec middleware vérifie exactement 10 000 appels au wrapper.

| 10 000 exécutions | Génératrices natives | Version directe | Réduction de durée |
|---|---:|---:|---:|
| Sans wrapper de service | 7,1 ms | 5,7 ms | 19,7 % |
| Avec wrapper de service | 18,3 ms | 15,4 ms | 15,8 % |

Le contrôle non compilé donne 7,1/7,1 ms sans wrapper et 17,7/17,7 ms avec wrapper entre les deux branches d’appel. Le chemin compilé apporte donc bien un gain local quand la chaîne de délégations est couverte. Le benchmark isolé ne construit aucun DOM et ne mesure pas la perception humaine d’une interface.

## Attribution et raccourci de registration

Une campagne de compteurs non minifiée, avec traces d’appels, attribue 1 001 appels à `ɵrunCraftTargetWrappers` : 1 000 lignes et leur racine. Dans la version originale, même un tableau de wrappers vide crée une génératrice retournant `EMPTY_RELEASE` et la fait parcourir par `runCraftGenerator`.

Le prototype ajoute uniquement :

```ts
if (wrappers.length === 0) {
  if (autoCleanup) injector.get(DestroyRef, null)?.onDestroy(EMPTY_RELEASE);
  return EMPTY_RELEASE;
}
```

Quand un wrapper existe, le chemin d’origine reste exécuté. L’enregistrement des cibles, leur contexte, les overrides de hostName et le nettoyage restent en place.

Une deuxième cohorte indépendante de 40 navigations compare ce raccourci au compilateur. Comparer les colonnes de cette table entre elles, sans mélanger les références avec la première cohorte.

| 5 000 lignes | Plan préparé | Compilation seule | Raccourci sans compilateur | Les deux |
|:---|---:|---:|---:|---:|
| Sans index | 82,2 ms | 85,8 ms | 80,3 ms | 80,4 ms |
| Avec index | 101,0 ms | 104,1 ms | 103,7 ms | 107,2 ms |

Le raccourci seul gagne environ 2 ms sans index dans cette série, mais pas avec index. La dispersion augmente sur les cas avec index, jusqu’à 135,7 ms pour une navigation compilée. Il serait excessif de promettre un gain de montage général à partir de ces différences. Le résultat robuste est la suppression du chemin vide et de ses 1 001 passages, avec conservation des contrats.

À 1 000 lignes avec index :

| Variante | Appels au driver | Entrées dans un programme compilé |
|---|---:|---:|
| Plan préparé | 1 006 | 0 |
| Compilation seule | 1 006 | 2 |
| Raccourci seul | 5 | 0 |
| Compilation + raccourci | 5 | 2 |

Sur le fin générique, 3 002 entrées passent par des programmes compilés ; il reste 5 006 appels au driver, car les délégations aux lecteurs non couverts continuent à utiliser ce driver. Le nombre de passages dans le driver ne compte pas tous les objets générateurs délégués : retirer un générateur extérieur peut laisser un appel au driver pour son lecteur intérieur. Les compteurs distinguent donc le mécanisme du temps réellement gagné.

## Vérifications et limites

Les scénarios différentiels comparent le chemin natif et le chemin compilé : valeurs après changement de signal, résolution du même service, notifications de lectures réactives, callback `onServiceResolved`, exposition d’une primitive nommée, ordre des getters/arguments et récepteur, erreurs des yields inconnus, comportement du finally, wrapper de factory conservé et nettoyage du scope.

- Compilation seule : 578 tests Component et 69 tests Core sélectionnés passent.
- Compilation + raccourci : 578 tests Component et 77 tests Core sélectionnés passent, dont les wrappers de cibles avec dépendance, overrides de contexte et release.
- Diagnostics TypeScript identiques au checkout de référence : 13 Core et 1 Component préexistants, aucun nouveau diagnostic.
- Valeurs, positions, mises à jour ponctuelles/par dixième, inversion, filtre/restauration, identité des nœuds retenus, DOM, rapports/tags et adresses de replay sont comparés entre variantes de même granularité. Les scopes et cibles disparues sont contrôlés par les contrats préparés existants.
- Après destruction : zéro ligne et zéro rapport actif. Les tests Component existants couvrent notamment DI parent/skipSelf, ElementRef, identité, destruction directe du propriétaire et nettoyage malgré une erreur.

Les temps s’arrêtent à la notification de mutation DOM, avant peinture ; chargement des modules et construction initiale du modèle exclus. Le heap est celui de JavaScript après actions et GC forcé. Cette campagne ne certifie pas la lecture de tous les anciens enregistrements de sessions et ne couvre pas un compilateur général pour les ressources asynchrones, toutes les extensions runtime ou tous les templates dynamiques.

## Décision proposée

Ne pas adopter un compilateur général sur la seule promesse de supprimer `function*`. Le gain de protocole est réel sur la chaîne isolée, mais les fonctions alternatives et les replis peuvent l’annuler au montage. Examiner le raccourci d’absence de wrappers comme une simplification autonome, avec ses contrats ; son gain global reste faible.

Pour espérer un saut supplémentaire, le prochain prototype de compilateur devrait générer directement les plans de création/bindings et préparer davantage la représentation des instances, au lieu d’ajouter une seconde représentation aux génératrices actuelles. La création DOM spécialisée avait déjà donné le gain le plus net lors de la campagne de plans fins. Cette nouvelle campagne ne mesure pas cette génération automatique et ne lui attribue pas de gain hypothétique.

## Reproduire

Depuis la racine du worktree :

```sh
npm --prefix apps/framework-benchmark run bench:sync-lowering-prototype
```

La commande exécute les compteurs, les cohortes de montage, les microbenchmarks et les vérifications dans des copies temporaires. `SYNC_LOWERING_OUTPUT` change le dossier de sortie ; `SYNC_LOWERING_RUNS` change le nombre de navigations par case.

Code : `apps/framework-benchmark/sync-lowering.compiler.mjs`, `mount-sync-lowering-prototypes.mjs`, `prototype-runtime/sync-lowering.{registry,runtime}.ts.txt`, `src/craft/sync-lowering.contracts.prototype.ts` et `sync-lowering.prototype.mjs`. Les fichiers générés et les manifests sont archivés dans `tmp/sync-lowering/{counts,confirm,micro,target-counts,target}/prototypes/` ; les traces d’attribution sont dans `tmp/sync-lowering/attribution/counts.json`.

Résumé durable : `docs/benchmarks/2026-11-06-sync-lowering-summary.json`. Les essais `smoke`/`debug` précèdent les résultats retenus et ne servent pas aux chiffres ci-dessus.
