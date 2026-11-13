# Plan : optimisations transparentes du runtime, sans compilateur ni plans manuels

Statut : proposé puis mis en œuvre le 6 novembre 2026 sur la branche `perf/runtime-transparent` (étapes 1 à 5, sous-étapes conditionnelles 5a et 5b retenues). Résultats, compromis et limites : [rapport runtime seul](../benchmarks/2026-11-06-runtime-only.md). Mesures historiques sur `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`, Apple M3, Chromium 153.0.8010.12.

## Objectif et périmètre

Réduire le coût du renderer et des effets en conservant l’écriture actuelle des applications : mêmes composants, templates, inputs, génératrices et primitives publiques, même granularité fine. Aucune nouvelle commande de compilation, annotation applicative ou description manuelle du DOM.

Le lot retenu porte sur les effets simples, les cellules strictement internes, les intermédiaires d’appel inutiles et les déclarations invariantes. Il n’inclut pas de spécialisation de composant exigeant un plan de création.

Les 37–48 % de gain de la campagne de génération des plans DOM ne sont **pas** un objectif chiffré de ce lot : ces résultats incluent des plans préparés désormais hors périmètre. Les gains du lot complet sur le renderer générique restent à mesurer après assemblage.

Le correctif de résolution optionnelle des traces du 4 novembre est déjà documenté comme implémenté. Ne pas le refaire ni compter son gain une seconde fois.

## 0. Conserver les analyses et figer une référence

- [x] Conserver les rapports et résumés JSON de `docs/benchmarks/`, les sources/scripts de `apps/framework-benchmark/` et les résultats/profils archivés sous `tmp/`.
- [x] Conserver aussi les expériences de compilateur, de plans manuels, de granularité composant et de gestionnaire commun. Elles restent consultables, mais ne sont pas intégrées par ce plan au runtime de production.
- [x] Ne pas déplacer, renommer ou remplacer les analyses historiques pour réinterpréter leurs résultats. Créer un nouveau rapport pour la combinaison « runtime seul ».
- [x] Avant l’implémentation, relever le commit de la branche cible et vérifier les optimisations déjà présentes. Utiliser une branche/worktree isolé pour l’intégration.
- [x] Figer une fixture **générique inchangée entre référence et candidat** : mêmes templates, mêmes fonctions de lecture, mêmes options et dépendances. Interdire les marqueurs expérimentaux de pureté/préparation, les lignes réécrites en mode composant et les vues inline de contrôle.

Les bibliothèques doivent rester indépendantes des imports et scripts de recherche. Le maintien de ces fichiers dans le dépôt de recherche n’en fait pas des dépendances du bundle applicatif.

## 1. Priorité : éviter le scope supplémentaire des effets simples

Fichiers concernés : `libs/core/src/lib/craft-effect.ts`, helper de tags dans `craft-service.ts`, tests associés.

- [x] Pour un corps d’effet simple déjà exécuté dans l’injecteur propriétaire, éviter la création de l’injecteur taggé qui sert essentiellement aux rapports.
- [x] Extraire le calcul des tags dans une implémentation commune avec la création des scopes taggés. Conserver ordre, multiplicité, tags de route et tags propres à l’effet.
- [x] Conserver le vrai scope des factories génératrices, leur résolution de dépendances, les signatures avec host/`this` et leur destruction.
- [x] Conserver l’ownership, `manualCleanup`, les cleanups par exécution, la destruction idempotente et le nettoyage de tous les éléments malgré une erreur.
- [x] Garder les mêmes rapports actifs, sources et tags observables. Ne pas désactiver le diagnostic ou le replay pour obtenir le gain.

**Preuve la plus directe dans le périmètre retenu :** sur le montage générique, cette modification seule a réduit le temps de 17 à 24 %, sans changer le code de l’application. À 1 000 lignes sans index : 5 017 → 1 014 injecteurs, 36 142 → 8 121 provider records. Ces diminutions physiques ne signifient pas une suppression des calculs réactifs.

Intégrer et remesurer ce lot avant de modifier les autres mécanismes.

## 2. Entrée interne directe pour les effets du renderer

Fichiers concernés : `craft-effect.ts`, `libs/component/src/lib/render/interpreter.ts`, exports internes nécessaires.

- [x] Extraire l’implémentation commune dans une entrée interne retournant directement `EffectRef`.
- [x] Faire continuer l’API publique `craftEffect` à produire son générateur nommé, avec ses types, métadonnées de dépendances et comportements d’exposition.
- [x] Faire utiliser l’entrée interne par le renderer pour éviter le détour création du générateur nommé → `craftUse` → récupération du ref.
- [x] Réutiliser les mêmes règles d’ownership, tags, rapports et nettoyage que l’étape 1 ; ne pas maintenir une seconde version divergente de l’effet.
- [x] Vérifier les cas publics, les factories génératrices, les signatures avec host et les contextes de route.

**Mesure indicative :** 102,8 → 96,6 ms sans index et 120,1 → 111,3 ms avec index à 5 000 lignes, soit environ 6–7 %. Cette expérience partait d’un prototype déjà spécialisé : revalider le gain sur la fixture générique de ce plan.

## 3. Cellules privées pour les données strictement internes du renderer

Fichiers concernés : `interpreter.ts`, éventuellement un petit module privé partagé avec les helpers du renderer ; tests des signaux et du rendu.

- [x] Introduire un type interne limité à `read`, `set`, `update` pour les cellules qui ne sortent jamais du renderer : index interne, sources de props et données d’hôte lorsqu’elles sont bien privées.
- [x] Conserver le même moteur réactif, `Object.is`, le boxing des écritures acceptées, les lectures non suivies pendant les écritures et le batching synchrone.
- [x] Éviter le branding public, l’enveloppe de lecture et la fabrication d’un `asReadonly` inutilisés pour ces seules cellules.
- [x] Auditer les points d’exposition : ne pas substituer une cellule privée à un signal public, à une primitive enregistrée ou à une valeur dont l’application attend les marqueurs/options d’égalité publics.
- [x] Conserver l’index réactif des listes, y compris après inversion et restauration. Ne pas supprimer une cellule sur la seule absence de lecture dans la fixture.

**Mesure indicative :** 102,8 → 91,7 ms sans index et 120,1 → 111,2 ms avec index à 5 000 lignes, environ 7–11 %. Comme pour l’étape 2, la base de cette campagne comporte des spécialisations exclues de ce plan : les mécanismes sont transférables, le pourcentage n’est pas une promesse pour le renderer générique.

## 4. Réduire les allocations de configuration et de providers

Fichiers concernés : `libs/core/src/lib/host/craft-compat.ts`, `craft-injector.ts`, `craft-service.ts`, initialisation des composants du renderer.

Effectuer les sous-étapes séparément pour attribuer les effets et pouvoir retirer un changement qui n’aide pas.

- [x] Réutiliser uniquement les déclarations standards dont la factory reçoit l’injecteur courant et peut créer correctement les valeurs locales.
- [x] Réutiliser les déclarations HostName/HostTagList pour une même définition et un même nom ; invalider la recette si le nom change. Lire le parent et attribuer les ordinaux au moment de la résolution.
- [x] Garder locaux `DestroyRef`, `ElementRef`, identités, provider records, résultats et caches des factories, enfants et callbacks de chaque propriétaire.
- [x] Partager la méthode de résolution des providers `useValue` plutôt qu’une fermeture par record. Continuer à lire le provider courant ; conserver le receiver lors des compositions multi/collection.
- [x] Évaluer séparément l’allocation au premier besoin du cache de valeurs par défaut et de la collection d’enfants d’un injecteur. La retenir pour un bénéfice mémoire confirmé sans régression temporelle significative.

**Mesures indicatives :** déclarations partagées, environ 34,36 → 33,02 Mio après GC à 5 000 lignes sans index, sans gain de montage stable. Résolveur `useValue` partagé : 72,3 → 70,7 ms et 35,2 → 34,6 Mio dans un tri initial sur base préparée. Ces chiffres motivent une réduction d’allocations, pas une annonce de gain global cumulé.

## 5. Raccourcis internes conditionnels, après les premières mesures

### Absence de wrapper de registration

- [x] Quand la collection de wrappers de cibles est vide, retourner le même `EMPTY_RELEASE` sans construire/conduire une génératrice vide.
- [x] Conserver la registration de la cible, le même release et son inscription à `DestroyRef` quand `autoCleanup` est demandé.
- [x] Quand un wrapper existe, conserver le chemin complet : contexte, dépendances, overrides de `hostName`, ordre et release.

**Résultat mesuré :** 1 006 → 5 passages dans le driver à 1 000 lignes dans la fixture préparée. Cela n’a pas produit de gain de montage général : à 5 000 lignes, 82,2 → 80,3 ms sans index, mais 101,0 → 103,7 ms avec index dans cette cohorte. Le retenir comme simplification du cas vide seulement si le renderer générique ne régresse pas.

### Identités et caches

- [x] Examiner séparément le réemploi des préfixes d’identités construits par le runtime, en gardant le chemin complet pour les parents structurels fournis par l’appelant.
- [x] Conserver octet pour octet clés/empreintes sérialisées, ordre des conversions, Unicode, segments vides et rejet immédiat des chaînes invalides pour l’encodage URI.
- [x] Ne pas rendre les validations paresseuses. Ne pas raccourcir les identifiants de replay.
- [x] N’ajouter un cache de segments ou de hashes que si le gain de la combinaison dépasse son coût mémoire. Garder les caches forts bornés et les caches de parents faibles.

**Résultats historiques :** selon la variante/cohorte, gain faible ou variable, avec parfois davantage de heap. Cette étape est conditionnelle, pas nécessaire pour annoncer le gain principal de l’étape 1.

## Pistes reportées et exclusions

- Compilateurs, réécriture de génératrices et génération de plans : conservés comme analyses, sans intégration maintenant.
- Plans manuels, composants préparés, fabriques DOM spécialisées, disposition fixe d’instances dérivée de ces plans : hors périmètre.
- Marqueurs explicites de pureté, suppression de l’effet `for-item`, plages de liste empruntées et lectures directes d’inputs réservées aux lignes préparées : exclus. Leur généralisation transparente n’est pas démontrée par les mesures existantes.
- Cache de racine destiné à corriger le surcoût des plages empruntées : à garder avec cette expérience, pas à compter comme gain indépendant du lot générique actuel.
- Watch spécialisé sans bookkeeping `onCleanup` : piste séparée, sans fork du moteur. Son contrôle a donné 84,5 → 78,9 ms sans index, mais 94,4 → 95,2 ms avec index, sur une base préparée. Reconsidérer après l’intégration des étapes 1–3, sans le présenter comme gain acquis de ce lot.
- Gestionnaire global, records nécessitant un patch des internes d’Alien, tables de tokens compactes et contextes de rendu normalisés : non retenus, faute de bénéfice global convaincant ou à cause de leurs compromis.
- Refondre systématiquement `DestroyRef` en collection indexée : non prioritaire. Le gain de filtrage observé sur les lignes inline ne justifie pas son coût de montage/mémoire sur le renderer générique ; mesurer le besoin après réduction des scopes.
- Granularité composant, suppression des rapports ou du replay, déplacement des composants dans l’application et ID d’application figés : exclus.

## Validation et mesure du lot final

- [x] Pour chaque étape : référence et candidat avec **la même écriture applicative**, aucune classe spéciale de ligne de benchmark ni marqueur expérimental ajouté au template.
- [x] Exercices sémantiques : signaux publics et privés, égalité/boxing/batching, signatures des effets, DI parent/skipSelf/scopes, tags de routes, overrides, providers multi/collection, valeurs `null`/`undefined`, erreurs et nettoyage complet/idempotent.
- [x] Même granularité : modifier un champ indépendant ne provoque pas la lecture de tous les champs.
- [x] Diagnostic : mêmes rapports et tags dans le périmètre concerné ; observers et wrappers exécutés ; remplacement de template conservé. Comparer les événements enregistrés et leurs adresses, pas seulement le DOM final.
- [~] Replay : captures et résolutions entre référence et candidat, déplacement, suppression/restauration, disparition des cibles après destruction. Vérifier également des sessions représentatives avant d’affirmer une compatibilité avec les archives existantes. *(Adresses identiques vérifiées ; archives existantes non rejouées : aucune compatibilité affirmée.)*
- [x] SSR/hydratation et les parcours génériques existants restent couverts par leurs suites ; ne pas extrapoler les fixtures navigateur à ces modes.
- [x] Mesurer 1 000/5 000 lignes, avec/sans index, ainsi qu’un petit cas courant. Chronométrer séparément montage, mise à jour d’une ligne, d’un dixième, inversion, filtrage et restauration.
- [x] Utiliser des builds de production non instrumentés pour les timings, des contextes frais et un ordre mélangé ; séparer les compteurs. Au moins cinq navigations par case, distributions et pas seulement meilleur cas.
- [x] Mesurer le heap après les mêmes actions et GC. Mesurer aussi le chargement/initialisation des modules si l’objectif est le temps complet de page ; le montage historique s’arrête avant peinture.
- [x] Comparer le JS minifié et gzip d’une même entrée applicative générique, sans embarquer les autres expériences. Les tailles des ensembles de pages avec plans ne chiffrent pas ce lot.
- [x] Publier un nouveau rapport `runtime-only` : commit, environnement, sources, résultats par étape et combinaison finale, limites et régressions éventuelles. N’intégrer une sous-étape conditionnelle que si le compromis mesuré est acceptable.

## Gains mesurés à retenir

### Effets simples, même campagne, code applicatif inchangé

| Cas | Référence | Sans scope d’effet superflu | Réduction du montage |
|---|---:|---:|---:|
| 1 000 lignes sans index | 57,6 ms | 48,0 ms | 16,7 % |
| 5 000 lignes sans index | 236,8 ms | 185,1 ms | 21,8 % |
| 5 000 lignes avec index | 359,2 ms | 272,1 ms | 24,2 % |

Dans cette campagne, le heap après GC baisse aussi d’environ 38–44 %. Les timings sont des mesures navigateur avant peinture sur la machine de référence, pas des seuils garantis.

Les cellules privées et les effets internes directs ont respectivement montré environ 7–11 % et 6–7 % dans leurs essais isolés sur des bases de recherche déjà spécialisées. Les modifications d’allocations apportent surtout des économies mémoire. **Ne pas additionner ces pourcentages, ni les multiplier pour fabriquer un résultat non mesuré.** Le chiffre publiable pour l’ensemble de ce plan sera celui de sa propre cohorte générique après intégration.

## Analyses de référence conservées

- [Diagnostic : scopes, destruction et identités](../benchmarks/2026-11-05-mount-cost-diagnosis.md).
- [Cellules privées et entrée d’effets directs](../benchmarks/2026-11-05-mount-next-prototypes.md).
- [Résolveurs et collections internes](../benchmarks/2026-11-05-mount-more-prototypes.md).
- [Déclarations de providers, racines et compromis](../benchmarks/2026-11-06-mount-shape-prototypes.md).
- [Watch simplifié et gestionnaire commun](../benchmarks/2026-11-06-binding-manager-prototype.md).
- [Driver et registration sans wrapper](../benchmarks/2026-11-06-sync-lowering-prototype.md).
- [Plans fins manuels, reportés](../benchmarks/2026-11-06-fine-plan-prototype.md).
- [Compilateur de plans, reporté](../benchmarks/2026-11-06-creation-plan-prototype.md).

Chaque rapport conserve ses résumés JSON et les références aux campagnes brutes et aux scripts qui l’ont produit. Le présent plan les relie sans les modifier.
