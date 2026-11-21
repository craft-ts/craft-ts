# Arrêter un binding qui échoue à son premier rendu

18 novembre 2026. Référence : `2ee9bb74a`. L'investigation des styles a révélé un problème également présent **sans compilateur** : un binding qui lit un signal puis lève une erreur avant la fin de son premier rendu reste abonné. Modifier ensuite ce signal réexécute le callback alors que le montage a échoué.

Deux contrats reproduisent le problème sur un attribut et sur une propriété de style. Ils vérifient l'identité de l'erreur d'origine puis modifient le signal : avant correction le callback est rappelé et lève encore ; après correction il n'est plus rappelé. Un troisième contrat vérifie que les erreurs après un premier rendu réussi continuent de se propager et que la destruction arrête le binding.

Le callback existant capture sa première erreur non gérée pendant la construction. Le noyau peut ainsi rendre son handle d'arrêt ; le constructeur l'arrête avant de propager l'erreur d'origine. Un cadre synchrone partagé est sauvegardé et restauré lors des créations imbriquées. Aucun champ ni callback persistant supplémentaire n'est ajouté à chaque binding. Les suspensions et exceptions gérées par les boundaries gardent leurs abonnements.

Les [données et sources](2026-11-18-initial-binding-error-summary.json) conservent les deux résultats rouges, les trois contrats actuels, le patch reproductible et la validation du runtime intégré : **120 tests Compiler**, **612 tests Component**, TypeScript de Compiler, de ses specs et de Component. Le lint ciblé n'ajoute aucune erreur ; ses trois erreurs historiques sont conservées, les nouveaux tests en ont zéro et le contrôle NX est ignoré sans graphe en cache.

Cette observation prouve le nettoyage par les appels après échec, sans quantifier une réduction de tas retenu. La variante `style-cleanup` de la campagne styles isole le coût de cette correction sur les chemins réussis, séparément des nouvelles optimisations de compilation. Cette campagne est encore en cours.

```sh
ATTRS_INTEGRATED=true ATTRS_VALIDATION_PREFIX=initial-guard node apps/compiler-benchmark/experiments/validate-attrs-watched.mjs
node apps/compiler-benchmark/experiments/archive-initial-guard.mjs
```

Le script d'archivage consomme également les résultats rouges du runtime de référence, conservés dans le rapport. Le Core et son API d'effets ne sont pas modifiés.
