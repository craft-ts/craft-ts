# Nouvelles cibles : allocations et mises à jour du renderer

17 novembre 2026. Analyse sur `6ce469aeb`, après retrait du prototype impératif.
Les bibliothèques Core, Component et Compiler restent inchangées. Ce rapport
identifie des pistes ; il n'annonce pas de nouveaux gains temporels mesurés.

La priorité proposée est de rendre les index de liste paresseux, puis de réduire
les effets éphémères et les rebinds des composants lean. Ces changements gardent
les templates déclaratifs actuels. Une autre cible précise est d'étendre la
spécialisation des listes aux composants locaux dont la liaison est prouvée.

## Mesures diagnostiques

Build production avec `lean: true`, instrumentation distincte de tout timing.
Les compteurs sont placés dans les implémentations réelles ; les composants ne
sont pas remplacés par des proxies. L'adaptateur DOM est enveloppé pour compter
les opérations, sans modifier les nœuds retournés. Trois cas : lignes simples,
lignes avec index (1 000 éléments chacune) et page réaliste à l'échelle 2.

Les [données et méthodes](2026-11-17-next-performance-targets-summary.json)
conservent les compteurs, les sources des diagnostics sous forme de texte,
les empreintes des bibliothèques et le profil CPU séparé. Ces scripts archivés
ne sont ni une dépendance ni une commande du produit.

| Montage                                          | Lignes simples | Lignes avec index | Page réaliste |
| ------------------------------------------------ | -------------: | ----------------: | ------------: |
| Lecteurs d'index créés                           |          1 000 |             1 000 |           743 |
| Appels de ces lecteurs                           |              0 |             2 000 |             0 |
| Bindings lean installés                          |          2 000 |             4 000 |         4 208 |
| Effets immédiatement arrêtés faute de dépendance |          2 000 |             2 000 |         3 343 |

Les parcours suivants ne lisent toujours aucun index dans les lignes simples
ou la page : modification, inversion/tri, filtrage/restauration et thème selon
le cas. Ils restent correctement lus et réactifs dans le contrôle avec index.
Ce constat concerne ces fixtures, pas tous les usages de `forNode`.

## 1. Créer la cellule d'index à sa première lecture

Aujourd'hui, `ForRenderedNode.reconcile` alloue pour chaque nouvelle entrée une
cellule privée et son lecteur, même si le callback ne demande que l'item. Les
743 lecteurs jamais appelés de la page impliquent autant de cellules inutilisées.

Le renderer peut garder `entry.index` comme valeur courante et ne créer sa cellule
réactive qu'au premier appel du lecteur. Les réordonnancements mettraient à jour
une cellule seulement lorsqu'elle existe. Le lecteur serait toujours fourni au
callback : aucune hypothèse sur `Function.length`, le type TypeScript ou l'usage
futur de ce lecteur.

Cette piste est transparente et applicable au renderer générique comme au
compilé. Elle économiserait des allocations déterminées par le code ; son gain
de temps et de heap doit encore être mesuré. Il resterait un lecteur par entrée.

Contrats à vérifier : première lecture après plusieurs inversions, lecteur gardé
pour un appel ultérieur, lecture par un enfant, changement de template, index
réactif déjà observé, filtrage/restauration et scheduler différé. La fermeture du
lecteur doit retenir son entrée, sans retenir les anciennes Maps de la liste.

Cibles : `createForIndexReader`, `ForRenderedEntry`, `ForRenderedNode.reconcile`
dans `libs/component/src/lib/render/interpreter.ts`.

## 2. Éviter l'effet quand la compilation prouve une lecture déjà résolue

`ɵcraftBindingEffect` crée un effet Alien, exécute le binding, puis le détruit si
aucune dépendance réactive n'a été lue. Sur la page, cela concerne 3 343 effets
sur 4 208, soit environ 79 %. Le résultat lean a déjà une faible mémoire retenue,
mais il paie ces allocations temporaires au montage.

La piste serait un petit IR de bindings prouvés : lecteur déjà résolu produit
par Craft, accès à une propriété de donnée et valeur primitive, sans service ou
appel arbitraire. Un tel binding pourrait être appliqué directement. Les autres
garderaient le mécanisme actuel de suivi des dépendances.

**Le résultat d'une première exécution ne suffit pas à prouver la pureté.** Un
getter peut lire un signal ; un callback peut lancer une exception ou suspendre.
Il ne faut ni exécuter deux fois le callback pour sonder ses dépendances, ni
fusionner aveuglément tous les bindings d'une ligne, ni manipuler les structures
privées d'Alien pour transférer leurs abonnements. L'expérience indique une
cible d'allocations, pas que 79 % du temps de montage est supprimable.

Cibles : `libs/core/src/lib/host/craft-signal.ts`, `LeanComponentRenderedNode.bind`,
et la production des bindings dans `libs/compiler/src/compiler.ts`.

## 3. Mettre à jour seulement les bindings concernés par les nouveaux inputs

Le patch d'une instance lean arrête ses bindings, rappelle `plan.bind`, puis les
recrée. L'état `seen`/`previous` repart aussi de zéro. Cela explique une partie
du compromis du mode lean sur les petites mises à jour.

Pour une seule tâche modifiée sur la page, le diagnostic constate :

- 13 appels de bind, 19 installations d'effets, dont 15 arrêtés immédiatement ;
- 9 écritures d'attributs, dont 7 réécrivent la valeur déjà présente ;
- 13 écritures de texte, dont 11 réécrivent la valeur déjà présente.

Les 18 écritures identiques sur 22 ne mesurent pas leur coût. Elles justifient
de travailler sur la dépendance aux inputs et sur l'état de comparaison conservé
lors d'un rebind. Dans le cas avec index, modifier la donnée d'une ligne réinstalle
aussi les deux bindings de position, bien que leur lecteur n'ait pas changé.

Première étape limitée : produire une dépendance par input pour les bindings
analysables et conserver ceux dont les sources n'ont pas changé. Garder un rebind
complet pour les helpers opaques et captures non analysées. Les événements et
les trous doivent avoir leur propre contrat de patch et de nettoyage.

Il faut mesurer le supplément de mémoire et de coût au montage : rajouter un
record ou une cellule à chaque binding peut coûter plus que les mises à jour
économisées. Les émissions de MutationObserver et les hooks ne doivent pas être
traités comme équivalents sur la seule égalité du DOM final.

Cibles : `LeanComponentRenderedNode.patch`, `bind`, `stopBindings` et les
métadonnées de `CompiledTemplatePlan`.

## 4. Spécialiser aussi les listes de composants locaux prouvés

Le compilateur sait compiler un composant déclaré dans une fonction, mais son
passage de spécialisation des listes exige une constante de module. Un contrôle
minimal, avec le même composant et le même callback, donne :

| Emplacement de `const Row`              | Composant compilé | Listes spécialisées |
| --------------------------------------- | ----------------- | ------------------: |
| Au niveau du module                     | Oui               |                   1 |
| Dans la fonction qui construit la liste | Oui               |                   0 |

Le contrôle sur le source archivé du prototype retiré confirme **zéro liste
spécialisée**, malgré la compilation des composants. Cette limite a été ajoutée
au [rapport de cette expérience](2026-11-17-imperative-rendering.md) : son gain
ne représente pas une comparaison face à toutes les spécialisations possibles
du mode lean.

Le compilateur possède déjà un checker de symboles local. Une extension pourrait
identifier les définitions par leur symbole/déclaration plutôt que par leur nom,
et accepter les constantes locales dont la liaison du callback est identique.
Il faut conserver les refus de mutations, calculs arbitraires et masquages ;
tester notamment deux fonctions contenant chacune un `const Row`, un shadowing
interne et des instanciations répétées de la fonction englobante.

L'impact sur la page actuelle dépend de la présence de ces déclarations locales.
Le contrôle de compilation seul n'annonce aucun pourcentage de gain navigateur.
Cible : `compiledDefinitions` et le test `visible` de `compileItems` dans
`libs/compiler/src/compiler.ts`.

## 5. Réduire les objets et fermetures des requêtes de service

Un nouveau profil de la page lean fait encore ressortir `createYieldRequest`,
`propertyHelperFn`, `reactiveReader` et `createFacade`, en plus des opérations DOM,
du bind et du GC. Il utilise trois navigations, un build non minifié et un CPU
ralenti x4 ; les frames natives, anonymes et idle empêchent une attribution
précise du temps. Ce profil sert à choisir les expériences.

`createYieldRequest` construit des objets par spreads et des résolveurs capturant
la définition, les bindings et le chemin. Étudier des records à forme stable
et des méthodes partagées permettrait de réduire ces allocations sans mettre
en cache les valeurs retournées par un service. Il faut auditer le receiver
des méthodes, les scopes `function`, les overrides, les bindings, l'exposition
des membres et l'ordre des erreurs. Un cache global de résultats n'est pas
proposé.

Cibles : `createYieldRequest` dans `libs/core/src/lib/craft-service.ts` et son
consommateur dans `libs/core/src/lib/craft-generator-runtime.ts`.

## Coût navigateur à étudier séparément

Les grandes tables paient aussi le layout. Pour les blocs autonomes hors écran,
`content-visibility: auto` avec `contain-intrinsic-size` permet au navigateur de
différer une partie du rendu sans retirer les composants. Cela ne réduit ni les
allocations Craft ni les nœuds créés. [Documentation Chrome](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/defer-rendering-heavy-content).

Pour une table dont les largeurs de colonnes sont connues, `table-layout: fixed`
avec une largeur explicite mérite une comparaison au layout automatique. Cela
change les règles de largeur et de débordement ; ce n'est donc pas un réglage
à appliquer automatiquement à toutes les applications. [Documentation MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/table-layout).

Ces essais doivent mesurer montage **et layout/paint**, défilement, focus,
accessibilité et dimensions. Aucun gain CSS n'a été mesuré dans cette recherche.
