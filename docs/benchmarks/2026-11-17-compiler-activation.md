# Éliminer le support compilé des applications sans plans

17 novembre 2026. **Prototype mesuré, sans changement du runtime de production.**
La fondation est `b6cc4a594`, avec le compilateur des listes locales/importées.

Le renderer importe directement les classes de composants compilés, même sans
plugin. Le prototype les rend accessibles par une activation appelée au premier
enregistrement d’un plan. Le bundler peut alors les éliminer d’une application
qui n’enregistre aucun plan. Les contrats passent et le gain de taille est
mesurable. Les temps restent dispersés et le prototype introduit un cycle ESM :
il reste isolé dans les expériences.

## Deux versions testées

La première version déplace les décisions de montage et de spécialisation des
listes derrière trois callbacks internes. Elle retire seulement 3 807 octets
minifiés et 887 octets gzip du microbenchmark : deux `instanceof` dans les listes
retiennent encore toute la classe légère.

La seconde version déplace aussi la reconnaissance de la racine légère. Les
contrats de bundle vérifient que `CompiledComponentRenderedNode`,
`LeanComponentRenderedNode`, `compiledTemplateFor`, `createCompiledNodes` et
`leanReadScope` disparaissent sans plans et restent présents avec le plugin.
Les branchements de listes et `LeanEntryView` restent présents : cette version
n’élimine pas tout le code lié aux listes compilées.

L’activation est unique et n’effectue aucune opération au chargement du module.
Elle ajoute cependant un cycle entre l’attachement des plans et l’interpréteur.
Les tests couvrent le chargement, l’activation après un montage générique et
l’invalidation d’un template, sans certifier tous les bundlers possibles.

## Taille des bundles

Production minifiée avec Vite/OXC, octets JS et gzip. Même application par paire.

| Application et mode        | JS référence → prototype | Gzip référence → prototype |
| -------------------------- | -----------------------: | -------------------------: |
| Microbenchmark sans plugin |        190 759 → 182 978 |            55 420 → 53 210 |
| Page sans plugin           |        233 156 → 225 368 |            68 816 → 66 581 |
| Microbenchmark `lean`      |        214 914 → 215 062 |            59 335 → 59 466 |
| Page `lean`                |        262 414 → 262 558 |            71 800 → 71 868 |
| Microbenchmark standard    |        213 540 → 213 692 |            59 158 → 59 298 |

Le retrait représente environ 7,8 Ko minifiés et 2,2 Ko gzip sans plugin. Avec
plans, l’activation ajoute environ 150 octets minifiés. Cela exige un bundler
qui élimine les exports inutilisés. Un import dynamique atteignable de plans
peut conserver le support dans un chunk partagé : le résultat ne garantit pas
qu’il quitte le bundle initial d’une application partiellement compilée.

Le parseur TypeScript et le compilateur de build sont absents du navigateur dans
les deux variantes ; ce constat ne vient pas de cette optimisation.

## Temps et mémoire

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Contextes neufs, production
minifiée, contrats avant les temps, cinq boucles d’actions après deux boucles
d’échauffement. La confirmation micro utilise des blocs de deux variantes
adjacentes, mélangés avec une graine fixe, dont l’ordre alterne par répétition.
Huit navigations par cas/variante sans plugin et avec `lean`, six en standard.
La page utilise huit navigations par variante et trois boucles d’actions.

Temps de montage JavaScript médians en ms ; les valeurs entre cohortes ne sont
pas comparables pour attribuer un gain. La dernière colonne est la médiane des
différences prototype moins référence dans les paires de même répétition.

| Cas                               | Référence | Prototype | Différence appariée |
| --------------------------------- | --------: | --------: | ------------------: |
| 5 000 lignes sans plugin          |     53,20 |     50,90 |               −2,05 |
| 5 000 lignes indexées sans plugin |     67,55 |     66,90 |               −0,85 |
| 5 000 lignes `lean`               |     17,95 |     17,70 |               −0,15 |
| 5 000 lignes indexées `lean`      |     27,85 |     29,95 |               +0,30 |
| 5 000 éléments imbriqués `lean`   |     38,00 |     36,65 |               −1,35 |
| 5 000 lignes standard             |     46,60 |     46,15 |               +0,10 |
| 5 000 lignes indexées standard    |     75,30 |     64,40 |               −1,80 |
| 5 000 éléments imbriqués standard |    121,00 |    125,55 |               −8,05 |
| Page sans plugin, échelle 2       |     61,60 |     61,65 |                   — |
| Page `lean`, échelle 2            |     38,05 |     37,55 |                   — |

Les médianes simples et appariées ne racontent pas toujours la même chose. En
standard, une paire de lignes diffère de +34,6 ms et une autre de −23,2 ms ; les
paires imbriquées vont de −57,9 à +40,2 ms. Il serait trompeur de présenter la
différence des médianes indexées comme une accélération démontrée. Aucun test ou
build du laboratoire ne tourne pendant les cohortes, mais ce poste de travail
reste partagé avec les autres applications de bureau.

Le heap des lignes `lean` reste proche de 4,94 MiB. En standard imbriqué, les
médianes passent de 60,49 à 61,11 MiB ; les différences appariées vont de
0,005 à 1,13 MiB. La cause n’est pas établie et n’est pas écartée comme du bruit.
Sur la page, le heap après montage reste proche de 16,54 MiB sans plugin et
7,76 MiB avec `lean`. Les actions, heap après parcours, temps de disponibilité
et observations après deux frames sont tous archivés.

Le montage commence après le parsing, l’évaluation des modules et la préparation
des données. Ces chiffres ne mesurent pas un gain de parsing, LCP ou INP. Les
temps de build sont des observations séquentielles sensibles au cache.

## Validation et décision

La campagne de cette piste comporte 304 navigations chronométrées : 112 pour la
première version et 192 pour la confirmation complète, auxquelles s’ajoutent les
contrats hors chronométrage. Les comparaisons couvrent le DOM, l’identité des
lignes, les index, 128 champs indépendants, la destruction et les 47 états
d’interaction de la page. TypeScript, 78 tests de compilateur et 609 tests de
composants passent pour la seconde version. La vérification TypeScript désactive
`composite` dans l’arbre isolé, dont la préparation a retiré les références de
projets ; les autres options sont conservées.

**Décision : conserver le prototype et ses observations, sans l’activer.** Il
prouve un gain de taille, avec une petite surcharge pour les applications
compilées, mais pas un gain de montage suffisamment établi. Le cycle ESM et le
surplus de heap observé en standard restent des points à résoudre avant une
intégration. Les sources de production gardent le renderer précédent.

## Reproduire

```sh
node apps/compiler-benchmark/experiments/compiler-activation.mjs
npx tsc -p tmp/performance-campaign/roots/compiler-activation-complete/libs/compiler/tsconfig.lib.json
node apps/compiler-benchmark/experiments/validate-activation.mjs
CAMPAIGN_MODE=lean CAMPAIGN_BLOCKED=true COMPILER_RUNS=8 COMPILER_CASES=rows,indexed,nested,fields COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=activation-complete-lean node apps/compiler-benchmark/experiments/run-micro.mjs compiler-activation-reference compiler-activation-complete
CAMPAIGN_MODE=runtime CAMPAIGN_BLOCKED=true COMPILER_RUNS=8 COMPILER_CASES=rows,indexed,fields COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=activation-complete-runtime node apps/compiler-benchmark/experiments/run-micro.mjs compiler-activation-reference compiler-activation-complete
CAMPAIGN_MODE=compiled CAMPAIGN_BLOCKED=true COMPILER_RUNS=6 COMPILER_CASES=rows,indexed,nested,fields COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=activation-complete-standard node apps/compiler-benchmark/experiments/run-micro.mjs compiler-activation-reference compiler-activation-complete
CAMPAIGN_MODE=runtime PAGE_RUNS=8 CAMPAIGN_OUTPUT=activation-complete-runtime-page node apps/compiler-benchmark/experiments/run-page.mjs compiler-activation-reference compiler-activation-complete
PAGE_RUNS=8 CAMPAIGN_OUTPUT=activation-complete-lean-page node apps/compiler-benchmark/experiments/run-page.mjs compiler-activation-reference compiler-activation-complete
```

[Données, patches et contrats](2026-11-17-compiler-activation-summary.json).
La [campagne des autres pistes](2026-11-17-performance-campaign.json) reste ouverte.
