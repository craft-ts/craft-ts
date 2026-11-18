# Prototype : génération des plans DOM et préparation des instances

6 novembre 2026. Commit figé `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`, worktree `codex/benchmark-e135eeec9`. Prototype en TypeScript/JavaScript, sans nouvelle dépendance. Les transformations et le runtime expérimental sont appliqués à des copies temporaires : les bibliothèques Core/Component du checkout restent inchangées.

## Résultat

**La génération automatique récupère l’essentiel du gain du plan écrit à la main.** À 5 000 lignes, le plan généré avec emplacements préparés monte en **74,2 ms sans index** et **92,8 ms avec index**, contre **117,8 et 178,1 ms** pour le rendu fin générique déjà allégé : environ **37 % et 48 % de durée en moins**.

Le plan manuel reste légèrement plus rapide dans cette série : 73,1 et 88,0 ms. Le nouveau résultat est donc l’automatisation d’un plan performant à partir du template ordinaire, avec une représentation des instances plus légère que la première sortie du compilateur. Ce n’est pas un nouveau gain de 37–48 % à ajouter aux gains des plans manuels précédents : il s’agit de la même famille d’optimisations, désormais produite par le compilateur.

Les emplacements préparés améliorent la première version générée : 78,6 → 74,2 ms sans index, et 94,8 → 92,8 ms avec index. Ils réduisent également son heap. Le temps reste dominé par un ensemble de coûts ; préparer les emplacements ne supprime pas les scopes DI natifs.

## Transformation effective

Le compilateur utilise l’AST TypeScript. Il reconnaît un sous-ensemble de `craftComponent(...)`, conserve sa déclaration et son template de repli, puis ajoute un plan partagé à la définition du composant. Les plans DOM ne sont plus écrits manuellement dans ces deux variantes.

Depuis le template de ligne existant, il génère :

- une fabrique qui crée les éléments et nœuds texte via l’adapter DOM, avec des références directes ;
- les lecteurs des inputs et les écritures des attributs/textes dynamiques ;
- les chemins relatifs de chaque élément pour le replay ;
- la disposition des données de chaque instance ;
- les garde-fous qui sélectionnent le renderer générique lorsque le plan ne peut pas préserver le comportement.

L’API source, son typage et les génératrices publiques restent disponibles. Le chemin compilé ne réexécute pas le template pour fabriquer des descriptions de nœuds au montage de chaque instance. Il crée le DOM depuis le plan et installe les bindings fins.

Le compilateur ne lit que les formes reconnues : imports Craft, racine statique unique, éléments natifs simples, tableaux de descendants statiques, textes et attributs `id`/`title`/`role`/`data-*`/`aria-*`, callbacks simples et lectures directes d’inputs. Les propriétés réservées `data-craft-*` sont refusées. Les événements, styles, composition, services de composant, providers locaux, descendants structurels dynamiques et autres formes non prises en charge restent sur le renderer générique.

Les deux variantes de la ligne correspondent au réglage `settings.indexes`. Cette configuration de fixture est gelée dans toutes les variantes et déclarée au compilateur comme spécialisation ; une condition de validité reste dans le plan. Ce prototype ne prétend pas déduire automatiquement qu’une configuration JavaScript arbitraire est constante. Une branche DOM dépendant des inputs n’est pas spécialisée.

Les captures de variables libres restent vivantes et les noms introduits par le compilateur ne doivent pas masquer les variables de l’application. Les vérifications exécutables couvrent notamment des variables nommées `state`, `context`, `value`, `nodes`, `renderer`, `input`, `unseen`, ainsi qu’une fonction portant le nom d’un helper généré. Un helper Craft masqué par un paramètre ou une déclaration locale est refusé dans les scopes inspectés. Cela reste un transformateur expérimental conservateur, pas un compilateur général pour tout JavaScript.

## Préparation des instances

Deux sorties sont comparées :

1. **Objets** : le compilateur produit le format du plan fin précédent, avec un objet de sources et un objet de références DOM. Cette sortie vérifie que la génération automatique remplace réellement le plan manuel.
2. **Emplacements préparés** : il produit une disposition fixe dans un tableau, des fonctions d’initialisation/mise à jour et les fonctions de chaque binding. Les cellules d’inputs, références DOM et valeurs précédentes n’exigent plus de recherches par nom à chaque lecture. Les états `seen`/`previous` des bindings sont placés dans ce tableau.

Pour la ligne avec index, la disposition générée est :

| Emplacement | Donnée |
|---:|---|
| 0 | Cellule de l’input `row` |
| 1 | Cellule de l’input `position` |
| 2 | Élément racine |
| 3 | Span de position |
| 4 | Texte de position |
| 5 | Texte du libellé |
| 6–8 | Valeurs précédentes des trois bindings |

Sans index, le tableau contient six emplacements. Les deux cellules d’inputs sont conservées dans cette version, même si `position` n’est pas affichée. Les effets et releases restent des listes de nettoyage par propriétaire ; il ne s’agit pas d’une seule allocation pour toute l’instance.

Le runtime prépare une seule fois le descripteur du composant : scope CSS, déclarations de providers et plan. La combinaison du scope parent et du scope propre est réutilisée tant que le parent est identique. Un changement de parent invalide cette combinaison ; le scénario de deux racines différentes le vérifie.

L’attribut et le texte de position sont réunis dans un binding de champ. Ce partage est conditionné à un lecteur interne connu, associé par le runtime à une lecture directe de l’index. Les fonctions arbitraires et les getters de propriétés ne sont pas fusionnés. ID et libellé restent des bindings distincts. Une modification d’un champ indépendant ne déclenche pas tous les lecteurs du composant.

## Montage confirmé

Médianes de cinq navigations indépendantes par case, production minifiée et ordre mélangé : 80 navigations au total. Les quatre variantes sont mesurées dans la même cohorte.

| Lignes | Index | Fin générique | Plan manuel | Plan généré, objets | Plan généré, emplacements |
|---:|:---:|---:|---:|---:|---:|
| 1000 | non | 35,8 ms | 24,1 ms | 24,7 ms | 24,4 ms |
| 1000 | oui | 44,4 ms | 26,5 ms | 27,8 ms | 27,9 ms |
| 5000 | non | 117,8 ms | 73,1 ms | 78,6 ms | 74,2 ms |
| 5000 | oui | 178,1 ms | 88,0 ms | 94,8 ms | 92,8 ms |

Le rendu fin générique bénéficie déjà des optimisations communes précédentes. Les plans ajoutent notamment la création spécialisée, le montage sans effet permanent de composant et l’emprunt des plages de liste, sur la base des garde-fous de liste pure déjà présents dans le benchmark. Les pourcentages comparent cette combinaison au rendu fin générique ; ils ne sont pas attribués à une seule instruction de code généré.

Les mesures s’arrêtent à la notification de mutation DOM, avant peinture. Le chargement des modules, la déclaration des composants et la construction des descripteurs partagés au niveau module sont hors fenêtre, comme dans les campagnes précédentes. La création des données propres à chaque instance et du premier descripteur runtime mis en cache est incluse. Aucun autre framework n’a été remesuré.

## Mémoire et coût de code

Heap JavaScript après les actions et GC forcé :

| 5 000 lignes | Fin générique | Plan manuel | Plan généré, objets | Plan généré, emplacements |
|---|---:|---:|---:|---:|
| Sans index | 59,3 Mio | 38,9 Mio | 38,6 Mio | 37,6 Mio |
| Avec index | 79,8 Mio | 45,9 Mio | 46,0 Mio | 45,0 Mio |

À 5 000 lignes, les emplacements préparés économisent environ 0,95–1,01 Mio face aux plans générés sous forme d’objets. Ils restent légèrement plus légers que le plan manuel dans ces fixtures. La baisse de heap n’est pas universelle : sur un seul panneau de 128 champs, la version générée utilise environ 2,07 Mio contre 1,99 Mio pour le plan manuel.

Le code augmente : pour l’ensemble des trois pages du benchmark et de leurs fixtures communes, le total passe de **207 823 à 259 237 octets JS minifiés**, et de **62 532 à 69 348 octets gzip**, entre plan manuel et plan généré à emplacements. Le template de repli est conservé et le panneau statique de 128 champs produit une fabrique déroulée importante. Ce sont les totaux de cet ensemble de pages, pas une estimation du poids d’une application ou d’un package de production. Le gain de montage doit être mis en regard du chargement et de la préparation des modules dans une future intégration.

## Granularité et mises à jour

Le panneau de 128 champs part de templates ordinaires contenant des appels `span(...)`. Cette fixture fixe est développée sous forme de tableau statique pour isoler la compilation ; la transformation générale d’un `fields.map(...)` de longueur dynamique n’est pas implémentée.

| 128 champs | Montage médian | Mise à jour médiane | Lectures après modification |
|---|---:|---:|---:|
| Fin générique allégé | 5,5 ms | 0,1 ms | 1 / 128 |
| Plan écrit à la main | 3,2 ms | 0,1 ms | 1 / 128 |
| Plan généré, objets | 4,4 ms | 0,1 ms | 1 / 128 |
| Plan généré, emplacements préparés | 4,1 ms | 0,1 ms | 1 / 128 |

Les temps proches de 0,1 ms sont trop petits pour départager proprement les variantes. La preuve robuste est le compteur exact : premier ou dernier champ modifié, une seule lecture, mêmes éléments et mêmes nœuds texte, aucun nouveau rendu global nécessaire.

Un second scénario remplace seulement l’input A d’un composant à deux inputs : la version générée relit A une fois et B zéro fois. Dans la référence générique de cette fixture, les compteurs donnent A deux fois et B une fois. Les cellules indépendantes de l’instance générée évitent cette reprise du template.

Les listes sont également vérifiées après mise à jour d’une ligne, d’un dixième, inversion, filtre et restauration. Les éléments conservés restent les mêmes objets DOM. Les timings détaillés de ces actions sont dans le résumé JSON.

## DI, diagnostic, replay et nettoyage

Un injecteur natif reste créé pour chaque instance. Les valeurs propres à l’instance, dont `ElementRef`, identité de rendu et destruction, ne sont pas partagées. À 1 000 lignes avec index : **1 014 injecteurs et 8 121 provider records** dans les quatre variantes. Les emplacements préparés ne représentent donc pas encore une compilation de la DI.

Les compteurs montrent 1 000 montages via la classe à emplacements et **une seule préparation du descripteur** pour ces 1 000 instances. Les rapports déclarent toujours 3 003 calculs réactifs avec index. Le driver de génératrices reste appelé 1 006 fois, principalement par le chemin de registration déjà identifié lors de la campagne précédente. Le raccourci de registration n’est pas ajouté à cette cohorte, afin de comparer les plans sur le même runtime commun.

Le chemin compilé est refusé en présence d’un wrapper de factory ou de cible, d’un observateur de factory ou de lectures réactives, ou d’un traceur actif susceptible de remplacer le template. L’identité du template original est aussi contrôlée. Ces situations utilisent le renderer actuel : les optimisations ne suppriment pas silencieusement les hooks de diagnostic. Les sessions instrumentées ne doivent donc pas être assimilées aux timings de production sans hooks présentés ici.

Les noms des bindings générés sont déterministes à partir des cibles du template et diffèrent des noms des prototypes manuels. Les adresses des cibles DOM restent identiques sur les scénarios comparés ; l’égalité de ces adresses ne certifie pas la compatibilité de tous les anciens enregistrements de sessions.

Vérifications effectuées :

- 578 tests Component et 69 tests Core sélectionnés passent sur le runtime à emplacements.
- Diagnostics TypeScript identiques à la référence : 13 Core et 1 Component préexistants, aucun nouveau diagnostic.
- Scénarios différentiels navigateur : conversion de `false`/`null`, booléens ARIA et attributs, inputs indépendants, événement d’un composant non compilé, DI parent/skipSelf, `ElementRef`, identité, scopes CSS sous deux parents et conservation des nœuds.
- Destruction directe du propriétaire, y compris quand un callback lève une erreur : effets et cibles retirés, erreur conservée, nettoyage idempotent. La destruction de l’application ne déclenche pas une seconde destruction.
- Replis pour observateur de factory, observateur de lectures réactives et remplacement effectif du template par un traceur. Les événements de lecture restent visibles sur le chemin générique.
- 16 navigations de champs indépendants, 1 920 résolutions de cibles entre variantes réussies ; 80 navigations de listes, 8 contrats génériques et 8 contrats de plans/liste. Après destruction : zéro ligne et zéro rapport actif.
- Vérifications exécutables du compilateur : captures vivantes, alias des helpers, refus de helpers masqués et d’une branche DOM dépendant des inputs. L’émission de la fixture chronométrée reste identique après ces garde-fous de portée.

SSR, hydratation, composition, providers locaux, boundaries actives et autres formes hors périmètre reprennent le renderer générique. Le runtime et les exports expérimentaux utilisés par les plans sont installés uniquement dans les copies de benchmark. Ce prototype n’est pas encore un plugin de build distribué ou une intégration de production dans toutes les applications CraftTS.

## Utiliser et inspecter

Depuis le worktree :

```sh
npm --prefix apps/framework-benchmark run bench:creation-plan-prototype
npm --prefix apps/framework-benchmark run prototype:creation-plan
```

La première commande génère les plans, mesure les variantes, exécute les contrats et vérifie les bibliothèques dans des copies temporaires. `CREATION_PLAN_OUTPUT` choisit le dossier de sortie, `CREATION_PLAN_RUNS` le nombre de navigations par case. La seconde expose les pages interactives générique/manuelle/générée et affiche les URLs. Ctrl+C arrête ses serveurs et supprime les copies temporaires. Les compteurs de la démo ne participent pas aux timings.

Sources principales : [creation-plan.compiler.mjs](/Users/romaingeffrault/.codex/worktrees/performance-benchmark-e135eeec9/ng-craft/apps/framework-benchmark/creation-plan.compiler.mjs), [mount-creation-plan-prototypes.mjs](/Users/romaingeffrault/.codex/worktrees/performance-benchmark-e135eeec9/ng-craft/apps/framework-benchmark/mount-creation-plan-prototypes.mjs), [slot-planned-component.ts.txt](/Users/romaingeffrault/.codex/worktrees/performance-benchmark-e135eeec9/ng-craft/apps/framework-benchmark/prototype-runtime/slot-planned-component.ts.txt), [creation-plan.prototype.mjs](/Users/romaingeffrault/.codex/worktrees/performance-benchmark-e135eeec9/ng-craft/apps/framework-benchmark/creation-plan.prototype.mjs).

Résumé durable : [2026-11-06-creation-plan-summary.json](/Users/romaingeffrault/.codex/worktrees/performance-benchmark-e135eeec9/ng-craft/docs/benchmarks/2026-11-06-creation-plan-summary.json). Les sources générées, manifests, empreintes et résultats de cette campagne sont archivés sous `tmp/creation-plan-final/{counts,confirm}/`. Les essais `tmp/creation-plan/smoke` et la première cohorte sans le garde-fou de lectures réactives restent des essais intermédiaires ; les chiffres retenus ici proviennent de `tmp/creation-plan-final`.
