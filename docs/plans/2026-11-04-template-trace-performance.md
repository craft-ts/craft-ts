# Réduire le coût de résolution des traces de rendu

Statut : implémenté et vérifié le 4 novembre 2026.

## Problème et résultat attendu

En développement, chaque appel à `executeTemplateTrace` cherche les wrappers
de trace disponibles. Quand aucun provider ne fournit `TemplateTraces`, la
résolution lève une exception, interceptée par `ɵinjectTemplateTraces`, qui
retourne alors `[]`.

Ce cas normal d'absence de traces provoque des milliers de créations d'erreurs :
3 002 au démarrage de 1 000 composants dans le smoke, puis 2 000 supplémentaires
après une inversion de la liste.

Le correctif doit retourner une liste vide sans créer d'erreur d'absence, tout
en conservant la composition des wrappers, leur héritage, leur contexte
d'injection et les overrides de service.

Référence : [examens et mesures](../benchmarks/2026-11-04-performance-examination.md).

## Approche retenue

Introduire une résolution optionnelle interne des services et l'utiliser pour
les traces de rendu. Commencer par cette résolution, plutôt que par un cache :
elle traite la cause mesurée et évite une politique d'invalidation supplémentaire.

Chemin actuel :

```text
Rendu
  → résolution obligatoire de TemplateTraces
  → service absent : création et propagation d'une exception
  → interception et retour de []
  → exécution du rendu
```

Chemin attendu :

```text
Rendu
  → résolution optionnelle de TemplateTraces
  → service absent : retour d'un marqueur d'absence
  → conversion de cette absence en []
  → exécution du rendu
```

## 1. Ajouter les tests de régression

Compléter [template-trace.spec.ts](../../libs/core/src/lib/template-trace.spec.ts)
et les tests du mécanisme de résolution des services.

- [x] Aucun wrapper : le rendu fonctionne sans création d'erreur d'absence,
      même interceptée. Le test doit atteindre le chemin réel de résolution ;
      vérifier seulement le résultat `[]` ne distingue pas l'ancien comportement.
- [x] Plusieurs wrappers : ordre d'exécution et imbrication conservés.
- [x] Wrappers dans l'application et le composant : héritage conservé.
- [x] Chaque wrapper s'exécute dans le contexte d'injection du rendu.
- [x] Overrides : la résolution utilise la valeur remplacée.
- [x] Mode production : les wrappers ne sont pas exécutés.
- [x] Une vraie erreur dans un provider ou un wrapper reste identifiable et
      n'est pas transformée en absence de traces.

Observer l'échec du test portant sur les erreurs d'absence avant le correctif.
Les tests existants de composition, de remplacement des enfants, de propagation
des erreurs de rendu et de mode production restent nécessaires.

## 2. Introduire une résolution optionnelle interne

Adapter le chemin de résolution dans
[craft-service.ts](../../libs/core/src/lib/craft-service.ts), autour de
`resolveConcreteService`.

- [x] Conserver la prise en compte des overrides avant la résolution du token.
- [x] Conserver les scopes, les valeurs par défaut et la composition des
      collections de providers.
- [x] Autoriser un marqueur interne d'absence si le service demandé n'est pas
      fourni, distinct d'une valeur légitime telle que `null` ou `undefined`.
- [x] Réutiliser le mécanisme de valeur de secours de l'injecteur pour éviter
      la construction d'une erreur sur cette absence.
- [x] Ne pas intercepter les erreurs de construction d'un provider ou de ses
      dépendances pour les convertir en absence du service demandé.
- [x] Préserver le comportement de la résolution obligatoire existante.

La forme exacte du helper ou de l'option interne sera arrêtée après lecture des
types et des tests du resolver. Cette étape ne demande pas de nouvelle API
publique pour les applications.

## 3. Utiliser cette résolution pour les traces

Modifier [template-trace.ts](../../libs/core/src/lib/template-trace.ts).

- [x] Utiliser la résolution optionnelle dans `ɵinjectTemplateTraces`.
- [x] Retourner `[]` lorsque la résolution indique l'absence du service.
- [x] Retirer le recours à une exception d'absence et à son interception.
- [x] Conserver le court-circuit du mode production dans `executeTemplateTrace`.
- [x] Conserver l'ordre et le contexte d'exécution des wrappers.
- [x] Conserver le fonctionnement de `provideTemplateTrace`.

Le wrapper vide utilisé pendant les examens reste une sonde de diagnostic,
pas une configuration à imposer aux applications.

## 4. Vérifier le gain dans le navigateur

Adapter la sonde de
[examine.mjs](../../apps/performance-smoke/examine.mjs) pour compter les erreurs
d'absence réellement créées, plutôt que de dépendre de l'ancien bloc `catch`.

- [x] Mesurer le démarrage de 1 000 composants sans traces déclarées.
- [x] Mesurer les inversions répétées de la liste.
- [x] Refaire les contrôles avec des wrappers présents et vérifier leur exécution.
- [x] Comparer les modes développement et production sur les mêmes sources.
- [x] Utiliser une copie figée du runtime pour chaque comparaison.
- [x] Refaire le smoke fonctionnel après le correctif.

Commandes de référence :

```sh
CRAFT_PERF_EXAMS=diagnostics npm run perf:examine
npm run perf:smoke
```

Critère principal : **zéro création d'erreur d'absence pour `TemplateTraces`**
dans le scénario sans wrappers.

Les temps doivent se rapprocher des mesures obtenues avec le wrapper vide.
À titre de référence, sur le run documenté :

| Variante, 1 000 composants                     | Bootstrap | Inversion |
| ---------------------------------------------- | --------: | --------: |
| Runtime développement, original                |  143,0 ms |   73,1 ms |
| Wrapper racine qui appelle simplement `next()` |   65,1 ms |   33,5 ms |

Ces valeurs servent de comparaison et non de seuil fixe : elles dépendent de
la machine et de sa charge. Vérifier également que le mode production ne subit
pas de régression significative.

## 5. Actualiser le rapport

- [x] Consigner les mesures avant/après, l'environnement et l'état des sources.
- [x] Documenter les garanties couvertes par les tests.
- [x] Retirer les sondes temporaires du runtime et conserver le runner réutilisable.
- [x] Mettre à jour le rapport d'examen avec le correctif retenu.

Un cache supplémentaire ne sera étudié que si le nouveau profil montre encore
un coût significatif de résolution. Il faudra alors définir sa portée par
injecteur et son invalidation en présence d'overrides.

## Critères de fin

- [x] Les tests de résolution et de traces passent.
- [x] L'absence de traces ne provoque plus d'exception, même interceptée.
- [x] L'ordre, l'héritage, le contexte d'injection et les overrides sont conservés.
- [x] Les contrôles navigateur et le smoke passent.
- [x] Le gain de performance est mesuré et documenté.

## Livraison

La résolution optionnelle interne est implémentée sans nouvelle API publique
et sans cache. Les tests du resolver sont dans
[craft-service-optional.spec.ts](../../libs/core/src/lib/craft-service-optional.spec.ts).
Les deux régressions observées avant le correctif (construction d'erreur
sur l'absence et masquage d'une erreur réelle) sont couvertes.

Validation : 1 633 tests Core et 552 tests Component réussis ; contrôles
TypeScript Core/Component, examen Chromium et smoke complet réussis.
Le lint des traces et des nouveaux tests passe. Dans `craft-service.ts`, les
95 erreurs et 161 avertissements préexistants sont identiques à ceux de `HEAD`.

Résultats : zéro erreur d'absence pour `TemplateTraces` après 31 002 appels ;
bootstrap de 191,6 à 72,1 ms et inversion de 84,6 à 39,4 ms dans la comparaison
locale. Le contrôle dédié ne montre pas de régression stable en production.
Voir le [rapport actualisé](../benchmarks/2026-11-04-performance-examination.md#1-bis-correctif-appliqué--résolution-optionnelle-des-traces)
pour le protocole, les empreintes et les limites des mesures.
