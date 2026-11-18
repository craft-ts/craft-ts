# Attributs et helpers `h` : couverture retenue avec suivi des lectures

18 novembre 2026. Référence : `8e5543797`. L'extension couvre les objets `attrs` explicites et les tags littéraux de `h`. Le runtime suit les lectures réactives effectuées pendant la construction d'un template léger et conserve son DOM lors des changements. Le compilateur reste optionnel.

Les [données complètes](2026-11-18-attrs-properties-summary.json) contiennent **232 navigations finales**, résultats bruts, différences appariées, sources, patches, empreintes, tailles et contrats. Deux premiers essais, de 80 et 88 navigations, sont conservés comme prototypes invalidés. Leurs chiffres ne sont pas mélangés avec ceux du candidat corrigé.

## Syntaxe et comportement

Un objet `attrs` doit avoir des clés explicites : `id`, `title`, `role`, `type`, `data-*`, `aria-*`. Objets inconnus, getters de propriétés, spreads, clés calculées, collisions, doublons et noms réservés `data-craft-*` restent génériques. Les validations des URLs et des styles ne sont pas contournées.

`h('div', props, children)` doit être un import direct de Craft, éventuellement renommé, avec un tag de l'ensemble HTML déjà couvert. Les symboles masqués, tags dynamiques et surcharges ambiguës restent génériques. Le compilateur refuse désormais les surcharges à props `null` : il rendait leur enfant alors que le helper générique l'ignore. Deux tests rouges avant correction sont archivés ; le comportement du helper reste inchangé.

Le premier prototype compilait `title: value()` mais ne suivait pas cette lecture. Cinq tests reproduisent des valeurs figées : appels, getters et enfants évalués directement. Le candidat retenu distingue deux phases :

- Le template capture ses valeurs et ses fabriques de lecteurs dans un effet source. Sans dépendance réactive, cet effet est immédiatement libéré.
- Les callbacks différés gardent leurs effets de binding. Leur mise à jour ne rappelle pas une fabrique pure déjà évaluée.
- Une dépendance du template change : les bindings sont réattachés au DOM existant et les enfants génériques sont patchés par position. Un champ de saisie existant conserve sa valeur quand le nombre d'enfants augmente.

Les expressions évaluées directement gardent leur ordre entre attributs, événements et enfants. Des variables de capture supplémentaires ne sont émises que si le regroupement interne des lecteurs inverserait cet ordre. Dépendances conditionnelles, getters ambiants, rebinds de liste, contextes d'injection, destruction et erreurs initiales ont des contrats dédiés.

Les plans nécessitant ce suivi utilisent l'ABI interne **version 2**. Un ancien runtime les ignore et rend le template original. Le contrôle navigateur « nouveau compilateur / ancien runtime » confirme les mêmes mises à jour et 202 commentaires de liste pour 100 lignes, contre 2 avec la spécialisation.

## Listes de 5 000 lignes

Huit navigations par variante et cinq boucles, build de production minifié. La fixture `attrs` ajoute neuf attributs littéraux imbriqués à la ligne ordinaire. La fixture `h` remplace seulement son helper racine. Médianes :

| Fixture / variante                               | Montage (ms) | Restauration (ms) | Une ligne (ms) | Tas après parcours (Mio) |
| ------------------------------------------------ | -----------: | ----------------: | -------------: | -----------------------: |
| `attrs`, référence                               |        55,80 |             18,10 |           0,90 |                   25,989 |
| `attrs`, couverture sans spécialisation de liste |        23,00 |              7,50 |           0,80 |                    8,774 |
| `attrs`, couverture et listes spécialisées       |        17,00 |              5,25 |           0,90 |                    4,949 |
| `h`, référence                                   |        43,95 |             15,55 |           0,80 |                   25,697 |
| `h`, couverture sans spécialisation de liste     |        19,75 |              5,75 |           0,80 |                    8,768 |
| `h`, couverture et listes spécialisées           |        14,10 |              3,60 |           0,80 |                    4,943 |

Le gain complet de montage atteint environ 70 % sur ces fixtures. Il inclut la couverture `lean` et la spécialisation existante des listes. Le contrôle `lists: false` mesure séparément l'accès aux templates légers. Ces gains ne s'attribuent pas au seul aplatissement d'un objet d'attributs.

Sur `attrs`, modifier 500 lignes passe de 2,50 à 1,40 ms et l'inversion de 4,95 à 3,35 ms. En mode standard, avec propriétaires conservés, montage 56,35 → 40,65 ms, restauration 18,55 → 12,10 ms et tas 25,970 → 23,414 Mio. Les pourcentages des cohortes ne s'additionnent pas.

Une fixture distincte lit directement un même signal dans les **5 000** templates. Son action nommée `update-tenth` est remplacée par une modification de ce signal : elle met donc à jour toutes les lignes. Montage 47,00 → 16,30 ms ; mise à jour globale **13,40 → 3,80 ms** ; tas 26,206 → 6,344 Mio. Le contrôle avec ancien runtime reste correct, 47,30 ms au montage et 13,60 ms pour cette mise à jour.

## Page complète, cas ordinaires et coût du runtime

La page gagne une seule définition compilée, `ProgressBar`. L'inventaire conserve ses douze modules et le microbanc ordinaire. Échelle 2, huit navigations, trois boucles et **47 instantanés d'interactions identiques** :

| Mesure             |               Référence |                Candidat |
| ------------------ | ----------------------: | ----------------------: |
| Montage            |                30,55 ms |                30,45 ms |
| Remontage          |                17,95 ms |                18,05 ms |
| Thème              |                 1,50 ms |                 1,50 ms |
| Tas après montage  |                7,71 Mio |                7,51 Mio |
| Tas après parcours |                8,82 Mio |                8,42 Mio |
| JS / gzip          | 262 458 / 71 829 octets | 265 230 / 72 215 octets |

Cette cohorte ne démontre pas une accélération du montage de la page. Elle montre une baisse du tas retenu et un coût de bundle de 2 772 octets JS, 386 gzip.

Les contrôles ordinaires utilisent les mêmes variantes et interactions, sans la nouvelle syntaxe. Médianes de montage en ms :

| Mode / cas                      | Référence | Candidat |
| ------------------------------- | --------: | -------: |
| `lean`, lignes                  |     13,90 |    13,85 |
| `lean`, index                   |     18,80 |    18,70 |
| `lean`, composants imbriqués    |     27,60 |    27,55 |
| `lean`, 128 champs indépendants |      2,95 |     3,00 |
| Standard, lignes                |     37,00 |    36,90 |
| Standard, index                 |     50,00 |    50,10 |
| Sans plugin, lignes             |     44,05 |    44,05 |
| Sans plugin, index              |     57,85 |    58,35 |

Aucune amélioration ou régression nette de montage n'est établie sur ces contrôles. Le support runtime est partagé et **augmente aussi le bundle sans plugin** : 190 934 → 192 688 octets JS, 55 464 → 55 806 gzip, soit +1 754 / +342 octets. Les contrôles standard et léger ajoutent respectivement 1 771 / 370 et 1 784 / 371 octets. Aucun compilateur ni parseur TypeScript n'est livré au navigateur. Le premier prototype avait des artefacts ordinaires identiques ; cette observation ne s'applique pas au runtime corrigé.

## Essais invalidés et vérification

Le prototype limité au compilateur passait 103 tests et gagnait sur les listes, mais échouait aux cinq nouveaux cas de lecture directe. Le premier runtime de suivi passait 115 tests ; la page complète a ensuite exposé un nom d'utilisateur rendu comme `[object Object]`. Les enfants callback étaient normalisés deux fois. Un autre contrat a montré l'inversion d'expressions évaluées directement. Les deux échecs et leurs corrections sont archivés. Ces prototypes n'ont pas été publiés.

Le candidat intégré passe **118 tests Compiler** et **609 tests Component**. TypeScript réussit pour la bibliothèque Compiler, ses specs et Component. Les **80 comparaisons** couvrent treize sources originales et sept fixtures rejouées depuis les runners mesurés, dans quatre configurations. Le code généré et les décisions correspondent octet par octet ; les sources runtime correspondent après formatage.

Le lint ciblé n'ajoute aucune erreur : zéro dans le compilateur et les nouveaux tests ; trois erreurs existantes dans chacun des deux fichiers runtime sont conservées. La règle NX des frontières est ignorée sans graphe en cache. Aucune validation globale du lint n'est revendiquée.

Reproduction depuis la racine du dépôt :

```sh
node apps/compiler-benchmark/experiments/attrs-properties.mjs
node apps/compiler-benchmark/experiments/validate-attrs-watched.mjs
node apps/compiler-benchmark/experiments/run-attrs-watched.mjs
ATTRS_INTEGRATED=true node apps/compiler-benchmark/experiments/validate-attrs-watched.mjs
npx tsc -p libs/compiler/tsconfig.lib.json
node apps/compiler-benchmark/experiments/validate-attrs-integration.mjs
node apps/compiler-benchmark/experiments/validate-attrs-artifacts.mjs
node apps/compiler-benchmark/experiments/validate-attrs-lint.mjs
node apps/compiler-benchmark/experiments/archive-attrs-properties.mjs
```

Les blocs microbenchmarks sont adjacents et équilibrés, leur ordre est mélangé avec une graine fixe. Les contextes navigateur sont neufs. Aucun test ou build indépendant n'a tourné pendant les mesures. Les durées JS/DOM ne sont pas des mesures LCP/INP ; le tas après GC exclut la mémoire DOM native. Les variations entre séries empêchent de comparer leurs temps absolus.

Les compromis de `lean` et la limite déjà reproduite d'observation du DOM connecté au premier montage restent documentés dans le README. Les styles, leurs validations CSS et leur ordre d'application restent à mesurer : cette livraison laisse cet item **partiel** et la campagne active.
