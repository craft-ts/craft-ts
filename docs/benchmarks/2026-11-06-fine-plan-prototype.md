# Prototype : plan de création spécialisé et bindings fins

6 novembre 2026. Commit : `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`. Prototype JavaScript/TypeScript manuel, sans Rust, WebAssembly ni nouveau compilateur. Les patches runtime s’appliquent uniquement à des copies temporaires.

**Le compromis est validé sur ces fixtures : conserver les mises à jour fines tout en réduisant fortement leur coût de montage.** À 5 000 lignes, le plan fin retenu monte en 77,6 ms sans index et 92,5 ms avec index, contre 125,1 et 188,0 ms pour le rendu fin générique déjà allégé. Il reste environ 12–14 % plus lent au montage que notre meilleur mode composant, mais conserve la lecture d’un seul champ quand un des 128 signaux indépendants change.

## Ce qui est réellement prototypé

Le plan sépare trois éléments : une fabrique statique `create(renderer)` qui construit le DOM une fois et retourne ses références ; une table des éléments et de leurs chemins logiques pour le replay ; des bindings indépendants `read(input)` / `write(value, nodes, renderer)`. La définition du plan est partagée par toutes les instances du composant. Il n’y a pas de parcours de descriptions de nœuds à chaque changement.

La classe de montage garde un injecteur natif par instance, les providers de nom/identité/ElementRef, le scope CSS racine, l’enregistrement de la cible runtime et les traces de création/rendu initial/destruction. L’initialisation du composant ne devient pas un effet permanent : seuls les bindings sont suivis. Chaque input possède une cellule interne séparée ; remplacer un input ne réveille pas un binding dépendant uniquement d’un autre input inchangé.

Les bindings utilisent toujours le moteur réactif et le wrapper `createRenderEffect` de CraftTS, avec le contexte d’injection et de rendu de leur propriétaire. La variante partagée prépare une fois le contexte des rapports/tags de ces effets pour éviter de le rechercher pour chaque binding. Elle ne mutualise ni leurs abonnements, ni leurs valeurs, ni leurs handles de destruction.

Deux formes ont été réalisées avec la même interface : la ligne avec ID/libellé/index, et le panneau à 32 ou 128 champs indépendants. La fabrique est explicite et écrite à la main ; ce travail ne prouve pas qu’un template JavaScript arbitraire peut être analysé automatiquement.

## Variantes comparées

| Variante | Stratégie | Effets par ligne sans/avec index |
|---|---|---:|
| shape-lean | Meilleur plan précédent, suivi de tout le composant | 1 / 1 |
| fine-reference | Renderer fin générique, sur le runtime déjà allégé | 3 / 5 |
| fine-direct | Fabrique préparée, un effet par binding DOM, création ordinaire des effets | 2 / 4 |
| fine-shared | Même granularité DOM, contexte de création des effets préparé une fois | 2 / 4 |
| fine-grouped | Contexte partagé ; attribut et texte de position dans le même binding de champ | 2 / 3 |

Le regroupement de position ne regroupe pas le composant : les deux sorties dépendent du même index, tandis que le libellé et l’ID restent des bindings distincts. Remplacer l’objet `row` réveille encore les lecteurs d’ID et de libellé ; l’égalité de leur résultat évite une écriture DOM inutile. La preuve d’indépendance complète utilise donc des signaux scalaires distincts dans la seconde fixture.

La référence générique bénéficie déjà des effets simples allégés, des cellules privées, des effets internes directs et des optimisations d’identités. Son callback de liste est déclaré pur. Les plans fins ajoutent les fabriques spécialisées, les lectures internes directes, le montage sans effet de composant et les plages de liste empruntées. Les gains sont ceux de cette combinaison : ils ne sont pas attribuables à la seule création DOM.

## Montage confirmé

Médianes de cinq navigations indépendantes, production minifiée et ordre mélangé :

| Lignes | Index | Fin générique allégé | Plan fin retenu | Mode composant préparé |
|---:|:---:|---:|---:|---:|
| 1000 | non | 39,0 ms | 25,5 ms | 23,6 ms |
| 1000 | oui | 47,9 ms | 27,6 ms | 25,0 ms |
| 5000 | non | 125,1 ms | 77,6 ms | 69,2 ms |
| 5000 | oui | 188,0 ms | 92,5 ms | 81,1 ms |

Le plan fin retenu réduit le montage d’environ **35–51 % face au fin générique** selon la case. Il est environ 8–14 % au-dessus du mode composant dans cette série. Avec index à 5 000 lignes : effets fins ordinaires préparés 108,7 ms, contexte partagé 101,8 ms, puis regroupement des deux sorties de position 92,5 ms. À 1 000 lignes sans index, le contexte partagé seul est un peu plus lent ; ce n’est pas un gain universel.

Les mesures s’arrêtent à la notification DOM, avant peinture ; ni chargement complet ni score INP. Les modules et le modèle initial sont hors fenêtre. Le tri initial compte 60 navigations, la confirmation 100 et les compteurs 15 navigations séparées. Les 32 navigations de champs indépendants comprennent 24 navigations chronométrées et 8 navigations avec compteurs, jamais mélangées aux timings. Aucun autre framework n’a été relancé.

## Champs indépendants : la granularité est conservée

| 128 champs, un seul modifié | Lectures | Réexécutions du template | Montage | Mise à jour | Effets |
|---|---:|---:|---:|---:|---:|
| Mode composant | 128 | 1 | 4,2 ms | 0,7 ms | 2 |
| Bindings fins génériques | 1 | 0 | 5,1 ms | 0,2 ms | 130 |
| Plan fin, effets ordinaires | 1 | 0 | 4,0 ms | 0,2 ms | 129 |
| Plan fin, contexte partagé | 1 | 0 | 3,3 ms | 0,2 ms | 129 |

Les compteurs vérifient l’index exact relu pour le premier et le dernier champ. Pour les plans fins : **une lecture, zéro réexécution du template**, DOM et nœuds texte conservés. La fabrique du plan est exécutée une seule fois par montage. Les valeurs sous la milliseconde sont sensibles à la résolution du timer ; le comptage des lectures est ici la preuve la plus nette. Le wrapper racine commun explique l’effet supplémentaire dans ces totaux.

## Actions et mémoire sur les listes

| Index | Action, 5 000 lignes | Fin générique | Plan fin retenu | Mode composant |
|:---:|---|---:|---:|---:|
| non | Une ligne | 1,2 ms | 1,1 ms | 1,1 ms |
| non | 10 % des lignes | 10,1 ms | 4,0 ms | 4,1 ms |
| non | Inversion | 10,3 ms | 5,6 ms | 6,1 ms |
| non | Filtrage | 19,1 ms | 11,1 ms | 8,9 ms |
| non | Restauration | 61,9 ms | 37,5 ms | 33,7 ms |
| oui | Une ligne | 1,1 ms | 1,0 ms | 1,0 ms |
| oui | 10 % des lignes | 11,4 ms | 4,2 ms | 4,2 ms |
| oui | Inversion | 29,9 ms | 16,9 ms | 19,5 ms |
| oui | Filtrage | 43,2 ms | 16,1 ms | 14,6 ms |
| oui | Restauration | 99,1 ms | 48,1 ms | 41,5 ms |

Le plan fin avec index ne relit pas les libellés lorsque seuls les index changent. Cela aide l’inversion : 16,95 ms contre 19,45 ms pour le mode composant dans cette série. Les suppressions/restaurations restent un peu plus coûteuses que dans le mode composant, car il faut entretenir et détruire davantage d’effets.

| Heap JS après actions et GC, 5 000 lignes | Fin générique | Plan fin retenu | Mode composant |
|---|---:|---:|---:|
| Sans index | 59,3 Mio | 39,6 Mio | 33,1 Mio |
| Avec index | 79,8 Mio | 45,9 Mio | 34,9 Mio |

Le plan fin économise beaucoup face au renderer générique mais conserve davantage d’observateurs que le mode composant. Ce heap ne représente pas la mémoire native totale du DOM ni le pic de montage.

## Scopes, identités et destruction

- À 1 000 lignes : toujours **1 014 injecteurs et 8 121 provider records**. Le plan ne supprime pas les scopes des composants. Avec index, la variante retenue a 3 003 effets actifs contre 5 003 pour le fin générique et 1 003 pour le mode composant.
- La fabrique partagée est activée exactement une fois par ligne. Les tags complets des variantes fine-direct/fine-shared sont identiques ; leurs abonnements sont bien séparés et indépendamment destructibles.
- Les chemins logiques des éléments sont déclarés dans le plan et réenregistrés à chaque montage. Les mêmes cibles sont comparées entre stratégies ; **2 400 résolutions croisées** réussissent sur les champs indépendants, en plus des contrats de lignes.
- DI parent, skipSelf, ElementRef pointant sur le véritable parent et CraftRenderIdentity sont testés à travers les vrais lecteurs de binding. Une destruction directe du scope arrête les lectures, retire les effets et les cibles de replay. Une erreur dans un callback de destruction ne bloque pas le nettoyage des autres propriétaires.
- **578 tests Component et 69 tests Core ciblés passent.** Diagnostics TypeScript identiques à la référence : 13 côté Core et 1 côté Component, préexistants. La preview interactive a aussi été vérifiée au navigateur sur le premier/dernier champ et les compteurs des deux stratégies.

## Limites importantes

Les plans sont limités ici à une racine DOM stable, du texte et des attributs de données. Le chemin fin est refusé en SSR/hydratation, en présence de providers locaux, de composition/transforms, de host props inconnues, de plusieurs scope owners ou de boundaries pending/exception actives. Ces cas gardent le renderer générique. Le prototype ne constitue pas une prise en charge générale des événements, styles dynamiques, slots, propriétés sensibles ou overrides de template.

Les rapports d’effets et les traces ne sont pas identiques à ceux de l’ancien renderer : la vue est initialisée une fois sans effet component-render permanent, puis les sources `fine:*` décrivent les bindings. Les adresses de replay et leurs résolutions sont contrôlées, mais le rejeu de toutes les archives existantes n’est pas certifié. Une intégration demanderait aussi de définir cette représentation dans les outils de diagnostic.

Le plan et ses chemins sont déclarés manuellement. La preuve porte sur deux formes et sur le mécanisme de rendu ; elle ne montre ni une génération automatique depuis tout TypeScript, ni une parité avec toutes les fonctionnalités CraftTS. La création du plan de champs se fait avant la fenêtre de montage, comme les déclarations de composants ; son coût n’est pas inclus dans ce temps.

## Jouer avec le prototype

```sh
npm --prefix apps/framework-benchmark run prototype:fine-plan
```

La commande affiche les URLs pour comparer le mode composant, les bindings génériques et le plan fin. Le panneau à 128 champs montre les lectures, réexécutions et effets actifs après chaque clic. Les styles et compteurs de preview sont ajoutés uniquement aux bundles de démonstration, jamais aux builds chronométrés. Ctrl+C arrête les serveurs et libère les copies temporaires.

Pour refaire les mesures et les vérifications :

```sh
npm --prefix apps/framework-benchmark run bench:fine-plan-prototype
```

Variables : FINE_PLAN_OUTPUT, FINE_PLAN_SCREEN_RUNS, FINE_PLAN_RUNS, FINE_PLAN_FANOUT_RUNS. FINE_PLAN_SUMMARIZE_ONLY=true reconstruit l’agrégation existante. Le vérificateur peut être relancé seul avec `node apps/framework-benchmark/verify-fine-plan.mjs`.

- [Interface et deux plans explicites](../../apps/framework-benchmark/src/craft/fine-plan.prototype.ts).
- [Montage du composant fin](../../apps/framework-benchmark/prototype-runtime/fine-planned-component.ts.txt), [fabrique d’effets partagée](../../apps/framework-benchmark/prototype-runtime/fine-binding-factory.ts.txt).
- [Transformations des copies](../../apps/framework-benchmark/mount-fine-plan-prototypes.mjs), [orchestrateur](../../apps/framework-benchmark/fine-plan.prototype.mjs), [vérification](../../apps/framework-benchmark/verify-fine-plan.mjs).
- [Données agrégées](2026-11-06-fine-plan-summary.json). Bruts et sources gelées : tmp/fine-plan/{screen,confirm,counts}. La définition du plan est copiée dans les sources archivées avec son empreinte SHA-256. Capture de démonstration : tmp/fine-plan/preview.png.

Le runtime des bibliothèques du checkout reste inchangé. Aucun commit ni push effectué.
