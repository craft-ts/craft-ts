# Listes de composants importés — 17 novembre 2026

L’option `craftCompiler({ imports: true })`, désactivée par défaut, étend la
spécialisation des listes aux composants constants importés directement. Elle
réduit le montage et la mémoire des grandes listes testées avec `lean`. La page
réaliste ne progresse pas. Le compilateur reste facultatif.

## Preuve et limites

Le plugin utilise le résolveur Vite et les sources réellement chargées. Il exige
un export direct `const` déjà compilé et un graphe statique d’application sans
cycle. Les alias d’import sont acceptés. Les exports mutables, barrels, imports
par défaut ou namespace, dépendances externes inconnues, imports dynamiques,
`require` et attributs d’import conservent le chemin ordinaire. Les imports vides
et les spécificateurs `type` en ligne restent des arêtes du graphe ; seul
`import type` est ignoré.

Les callbacks doivent simplement transmettre leurs paramètres au composant,
avec la même preuve de portée lexicale que pour les composants locaux. Le
runtime vérifie l’appartenance à sa WeakMap sans consulter les propriétés d’une
fonction inconnue ou d’un Proxy. `lists: false`, le développement et le SSR
gardent leur comportement précédent. Le mode standard conserve ses propriétaires
de composants ; `lean` conserve ses compromis documentés.

## Mesures

Production minifiée, Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Les deux
variantes utilisent exactement la même application, avec les définitions des
lignes extraites dans un module physique. Référence : spécialisation locale
retenue au commit `cd3d220e9`. Candidat : même fondation, preuve des imports
activée. Contrats avant chronométrage, contextes neufs, ordre entrelacé avec
graine fixe. Sept navigations par variante et cas avec `lean`, cinq sans `lean`.
Les temps ci-dessous sont des médianes de montage JavaScript, en ms.

| Cas                              | Référence | Imports prouvés | Heap retenu, MiB |
| -------------------------------- | --------: | --------------: | ---------------: |
| 5 000 lignes, `lean`             |      19,8 |            14,0 |      8,77 → 4,94 |
| 5 000 lignes indexées, `lean`    |      25,4 |            19,0 |     12,17 → 8,72 |
| 128 champs indépendants, `lean`  |       3,0 |             2,9 |      1,88 → 1,88 |
| 5 000 lignes, standard           |      74,2 |            70,5 |    24,37 → 23,40 |
| 5 000 lignes indexées, standard  |     106,7 |           103,8 |    30,86 → 29,90 |
| Page réaliste, échelle 2, `lean` |      33,6 |            33,7 |      7,76 → 7,76 |

Le gain est de 29 % au montage et 44 % sur le heap pour les lignes simples en
`lean`. Les dispersions du mode standard sont plus grandes, avec une première
navigation lente : son petit gain médian ne suffit pas à promettre une
accélération générale. Les cohortes standard et `lean` sont distinctes ; ne pas
attribuer leur différence absolue à cette option.

Les mises à jour ne progressent pas toutes. En `lean`, modifier une ligne passe
de 0,8 à 0,9 ms, et de 0,8 à 1,0 ms avec index. Inverser la liste simple passe
de 5,15 à 2,95 ms, filtrer de 2,4 à 1,4 ms et restaurer de 5,8 à 3,6 ms.
Avec index, l’inversion passe de 11,85 à 9,20 ms. En mode standard, l’inversion
indexée passe de 38,45 à 40,35 ms. Toutes les actions et les échantillons sont
archivés ; ces résultats ne constituent pas une mesure d’INP.

Le bundle du microbenchmark `lean` prend 42 octets JS et 4 octets gzip de plus.
Le build standard prend 25 octets JS et 8 octets gzip de plus. Les temps de build
séquentiels sont sensibles au cache et ne démontrent aucun gain de compilation.
La page réaliste a déjà des listes locales couvertes : ses 47 états DOM restent
identiques, son montage et sa mémoire restent au même niveau.

## Vérification et reproduction

77 tests du compilateur et 609 tests de composants passent. Les nouveaux contrats
couvrent notamment les cycles, les ombrages lexicaux, les formes refusées et
l’absence de lecture d’un Proxy inconnu. Un vrai build Vite en watch vérifie les
transitions `const → let → const`, puis un changement de l’importeur avec une
dépendance inchangée en cache. Les bibliothèques et les specs passent la
vérification TypeScript. Le lint du compilateur n’a pas d’erreur ; les trois
erreurs et trois avertissements du helper de composants existaient déjà et
sont identiques avant/après.

Après les chronométrages principaux, le graphe a reçu un refus des attributs
d’import et une correction de lint sans effet sur les fixtures. Une comparaison
sur 14 sources vérifie que l’intégration produit exactement le code du candidat
mesuré. L’implémentation est retenue au commit `b6cc4a594`.

```sh
node apps/compiler-benchmark/experiments/imported-lists.mjs
CAMPAIGN_IMPORTED_FIXTURE=true CAMPAIGN_COMPILER_OPTIONS='{"imported-lists":{"imports":true}}' COMPILER_RUNS=7 COMPILER_CASES=rows,indexed,fields COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=imported-micro-final node apps/compiler-benchmark/experiments/run-micro.mjs local-lists imported-lists
PAGE_COMPILER_OPTIONS='{"imported-lists":{"imports":true}}' PAGE_RUNS=7 CAMPAIGN_OUTPUT=imported-page node apps/compiler-benchmark/experiments/run-page.mjs local-lists imported-lists
CAMPAIGN_MODE=compiled CAMPAIGN_IMPORTED_FIXTURE=true CAMPAIGN_COMPILER_OPTIONS='{"imported-lists":{"imports":true}}' COMPILER_RUNS=5 COMPILER_CASES=rows,indexed COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=imported-default-mode node apps/compiler-benchmark/experiments/run-micro.mjs local-lists imported-lists
```

La préparation de la référence `local-lists` et les dépendances sont décrites
dans [la première campagne](2026-11-17-performance-campaign.md).
[Les données brutes, sources, patches et contrats](2026-11-17-imported-lists-summary.json)
permettent l’audit. La [campagne complète](2026-11-17-performance-campaign.json)
reste ouverte sur les autres pistes.
