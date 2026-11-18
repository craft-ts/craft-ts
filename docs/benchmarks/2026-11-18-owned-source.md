# Lectures directes : repli quand les inputs demandent un propriétaire

18 novembre 2026. Référence : `0a078e8d0`, après la [campagne attrs/h](2026-11-18-attrs-properties.md). Les [données](2026-11-18-owned-source-summary.json) archivent deux tests rouges, leur correction, les validations intégrées et **104 navigations supplémentaires**. Les 232 navigations précédentes restent une série distincte.

Un plan léger qui lit directement `value()` possède un effet source. Toutefois, ses inputs peuvent imposer un composant ordinaire : objet brut, callback, ou autre forme refusée par `leanInputs`. Le runtime entrait alors dans le renderer compilé avec propriétaire, qui évaluait `plan.bind` sans suivre les dépendances du template. Les deux nouveaux contrats montrent un titre restant à `first` après le passage du signal à `after`.

La correction refuse ce renderer intermédiaire pour `plan.watchBind`. Si le chemin léger est indisponible, le template original et son effet générique prennent le relais. Les inputs, l'injecteur et les callbacks gardent leur comportement ordinaire. Les plans sans effet source conservent leur éligibilité précédente. Aucun API publique n'est ajouté.

## Coût du repli et contrôles

Builds de production minifiés, contextes navigateur neufs, huit navigations par variante et cinq boucles pour les listes de 5 000 lignes. Le contrôle avec objet supplémentaire compare explicitement **sans compilateur** à **compilateur léger avec repli générique**. Les deux rendent les mêmes valeurs après chaque modification et conservent leurs 202 commentaires de liste sur le contrat de 100 lignes.

| Cas / série initiale                   | Référence (ms) | Correction (ms) |
| -------------------------------------- | -------------: | --------------: |
| Repli objet, montage                   |          96,70 |           93,80 |
| Repli objet, modifier les 5 000 titres |          26,45 |           26,35 |
| Lignes ordinaires, montage             |          19,70 |           19,45 |
| Index ordinaires, montage              |          24,15 |           25,95 |
| Page complète, montage                 |          32,95 |           33,90 |
| Page complète, remontage               |          17,50 |           16,85 |

Le repli objet ne revendique aucun gain : il préserve le comportement générique. Son tas après parcours est 27,017 → 27,039 Mio. Le bundle de ce contrôle diffère aussi par l'activation du compilateur ; ce n'est pas une mesure du seul garde ajouté.

L'écart sur les index a motivé une confirmation dédiée de **20 navigations par variante**, équilibrées et appariées. Résultat : **18,90 → 18,90 ms**, différence appariée médiane −0,05 ms, 10 paires favorables sur 20. Les intervalles observés sont 18,50–24,40 et 18,40–23,90 ms. L'écart de la première série n'est pas reproduit ; les deux séries restent archivées. Leurs temps absolus ne sont pas fusionnés.

La page conserve ses **47 instantanés identiques**, 4 788 nœuds, 7,51 Mio après montage et 8,42 Mio après parcours dans les deux variantes. Cette série ne démontre aucun gain de montage de page. Le bundle ajoute 13 octets JS et 4 gzip ; sur les listes ordinaires, 13 JS et 5 gzip.

## Validation et reproduction

La bibliothèque intégrée passe **120 tests Compiler** et **609 tests Component**, ainsi que TypeScript pour Compiler, ses specs et Component. Le lint ciblé n'ajoute aucune erreur et les nouveaux tests en ont zéro ; les six erreurs runtime préexistantes et la limite du contrôle NX sans graphe restent explicitement conservées.

Les sources du compilateur et du contrat de plans sont identiques au candidat mesuré ; le renderer correspond après formatage. Le rapport contient les sources des runners, fixtures exactes, patches, empreintes, décisions de compilation et résultats bruts. Les résultats à 118 tests de `0a078e8d0` restent dans le rapport précédent ; ils ne sont pas remplacés par cette validation à 120 tests.

```sh
ATTRS_INTEGRATED=true ATTRS_VALIDATION_PREFIX=attrs-owned node apps/compiler-benchmark/experiments/validate-attrs-watched.mjs
node apps/compiler-benchmark/experiments/owned-source-fallback.mjs --measure
node apps/compiler-benchmark/experiments/owned-source-fallback.mjs --measure --confirm
ATTRS_LINT_OUTPUT=attrs-owned-lint node apps/compiler-benchmark/experiments/validate-attrs-lint.mjs
node apps/compiler-benchmark/experiments/archive-owned-source.mjs
```

L'archivage consomme aussi les deux résultats rouges avant correction, conservés dans les données publiées. Aucun test ou build indépendant n'a tourné pendant les mesures. Le tas JS après GC exclut la mémoire DOM native. La couverture des styles et les autres items en attente restent à investiguer ; la campagne demeure active.
