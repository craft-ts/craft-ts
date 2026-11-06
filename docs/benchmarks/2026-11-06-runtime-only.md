# Optimisations transparentes du runtime — campagne « runtime seul »

6 novembre 2026. Mise en œuvre du [plan](../plans/2026-11-06-runtime-performance-transparent.md) sur la branche `perf/runtime-transparent`, partie de `main` = `2360e7fe851bdfe95e13fe08d53ae4f84db8b51b`. Apple M3, Node v22.23.0, Chromium 153.0.8010.12.

**Sur la fixture générique inchangée, le lot complet réduit le montage de 19 % (100 lignes) à 44 % (5 000 lignes sans index), et le tas JS après GC de 20 à 46 %.** Les rapports d'effets, leurs tags (ordinaux compris), les cibles replay et la destruction sont identiques à la référence. Le JS de l'entrée grossit de 766 octets minifiés, 258 octets gzip.

Ces chiffres viennent de la seule cohorte de ce rapport. Ils ne s'additionnent pas avec ceux des campagnes de recherche, dont les bases étaient spécialisées.

## Méthode

- Runner [`runtime-only.mjs`](../../apps/framework-benchmark/runtime-only.mjs) : chaque variante est un ref git dont `libs/{core,component,style,test-type}` sont extraits dans un dossier temporaire. La fixture `src/craft/main.ts` est copiée une fois et **identique pour toutes les variantes** (empreinte `fixtureSha256` dans le résumé) : pas de marqueur de pureté, de ligne préparée, de vue inline ni de plan.
- Builds Vite de production minifiés, contexte Chromium neuf par navigation, ordre des variantes mélangé à chaque case (graine 611). Trois actions de chauffe puis huit mesurées par action et par navigation. Données, positions et identité DOM vérifiées après chaque action, chauffe comprise, hors fenêtre chronométrée.
- Montage : `begin()` → toutes les lignes dans le DOM, avant peinture. Actions : clic natif → `MutationObserver` voyant la révision. `moduleReady` : instant de `begin()` depuis l'origine de navigation.
- Tas : `Runtime.getHeapUsage` après GC forcé, à la fin de la même séquence d'actions. Ce n'est ni un pic ni la mémoire native du DOM.
- Contrats, sur une entrée séparée de la page chronométrée : nombre de rapports d'effets actifs, empreinte de leurs `source`/`from`, cible replay de la racine et de chaque ligne avec son statut de résolution, forme du DOM, après montage puis après la séquence complète, puis destruction (zéro ligne, zéro rapport). Une différence avec la référence arrête la campagne.
- Compteurs : copie instrumentée séparée de chaque runtime, jamais chronométrée.
- Chaque étape est figée sous `refs/perf-snapshots/<étape>` (commits locaux non poussés, créés par `git stash create`) ; les différences étape par étape sont aussi dans `tmp/runtime-only/patches/`. Rapports bruts : `tmp/runtime-only/{step1,step2,steps3-5,confirm-4d-5b,final}/report.json`. Agrégat : [résumé JSON](2026-11-06-runtime-only-summary.json).

Navigations chronométrées : 50 (étape 1), 75 (étape 2), 175 (étapes 3 → 5a), 120 (confirmation 4d/5b), 80 (campagne finale) — 500 au total.

## Résultat final : référence `main` → lot complet

Huit navigations par case. Médianes en ms, tas en Mio ; entre crochets, quartiles p25–p75.

| Lignes | Index | Montage | Une ligne | 10 % | Inversion | Filtrage | Rétablissement | Tas après GC |
|---:|:---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | non | 15,8 → **12,8** (−19 %) | 0,70 → 0,50 | 2,30 → 1,65 | 1,70 → 1,55 | 1,70 → 1,50 | 6,00 → 4,45 | 4,60 → **3,66** (−20 %) |
| 1 000 | non | 59,1 → **39,6** (−33 %) | 1,10 → 1,00 | 6,70 → 4,10 | 4,60 → 4,40 | 7,65 → 4,90 | 23,5 → 14,0 | 23,4 → **14,0** (−40 %) |
| 1 000 | oui | 74,0 → **48,7** (−34 %) | 0,90 → 0,95 | 6,45 → 4,75 | 9,40 → 8,60 | 12,0 → 9,25 | 30,5 → 20,2 | 31,8 → **18,1** (−43 %) |
| 5 000 | non | 235,5 → **131,4** (−44 %) | 1,30 → 1,20 | 16,3 → 9,75 | 14,6 → 14,5 | 42,6 → 18,3 | 102,3 → 62,7 | 105,9 → **60,7** (−43 %) |
| 5 000 | oui | 307,4 → **187,7** (−39 %) | 1,20 → 1,15 | 19,0 → 12,0 | 39,0 → 35,8 | 58,0 → 40,1 | 150,5 → 96,1 | 146,8 → **79,7** (−46 %) |

Quartiles du montage, référence → lot : 100 lignes [15,7–15,8] → [12,7–13,0] ; 1 000 sans index [56,1–60,0] → [38,8–40,9] ; 1 000 avec index [73,8–74,4] → [48,2–48,8] ; 5 000 sans index [234,0–237,1] → [130,8–133,8] ; 5 000 avec index [306,1–308,7] → [186,8–188,1]. Aucune distribution ne se recouvre.

Une ligne mise à jour reste autour de 1 ms ; l'écart à 1 000 lignes avec index (0,90 → 0,95) est dans la résolution de la mesure. L'inversion ne change pas sans index : elle déplace des nœuds sans en créer. `moduleReady` varie de −4 à +4 % selon les cases, sans tendance.

### Compteurs à 1 000 lignes, après montage

| Ressource | Sans index : référence → lot | Avec index : référence → lot |
|---|---:|---:|
| Injecteurs créés | 5 017 → **1 014** | 7 017 → **1 014** |
| Provider records | 36 142 → **8 121** | 50 142 → **8 121** |
| Signaux publics | 4 004 → 3 | 4 004 → 3 |
| Cellules privées du renderer | — → 4 001 | — → 4 001 |
| Effets créés | 4 004 → **4 004** | 6 004 → **6 004** |
| Passages du driver de générateurs | 7 009 → 2 005 | 11 009 → 4 005 |

Le nombre d'effets ne change pas, ni après la séquence d'actions (6 307 et 9 408 dans les deux variantes) : les calculs réactifs sont conservés, seuls les scopes, enveloppes et détours qui les entouraient disparaissent. Les 4 001 cellules privées remplacent un à un les signaux publics de l'index, des sources de props et des props d'hôte.

## Résultats par étape

Montage médian, même cohorte pour chaque ligne du tableau ; « → » compare à l'étape précédente de la campagne citée.

| Étape | Campagne | 1 000 sans index | 1 000 avec index | 5 000 sans index | 5 000 avec index | Tas 5 000 avec index |
|---|---|---:|---:|---:|---:|---:|
| 1. Effets simples sans scope | step2 (réf. → 1) | 59,8 → 50,8 | 74,2 → 60,1 | 237,8 → 173,0 | 319,7 → 256,4 | 148,0 → 81,9 |
| 2. Entrée directe des effets du renderer | step2 (1 → 2) | 50,8 → 43,2 | 60,1 → 53,8 | 173,0 → 152,6 | 256,4 → 219,0 | 81,9 → 82,9 |
| 3. Cellules privées | steps3-5 (2 → 3) | 44,0 → 44,2 | 52,7 → 50,6 | 151,6 → 139,1 | 215,4 → 207,1 | 81,5 → 80,0 |
| 4a. Déclarations standards partagées | steps3-5 (3 → 4a) | 44,2 → 43,3 | 50,6 → 50,3 | 139,1 → 137,3 | 207,1 → 207,8 | 80,0 → 79,3 |
| 4b. Déclarations HostName/HostTagList | steps3-5 (4a → 4b) | 43,3 → 42,8 | 50,3 → 51,0 | 137,3 → 138,5 | 207,8 → 206,6 | 79,3 → 78,7 |
| 4c. Résolveur `useValue` partagé | steps3-5 (4b → 4c) | 42,8 → 43,1 | 51,0 → 50,1 | 138,5 → 136,6 | 206,6 → 205,7 | 78,7 → 78,1 |
| 4d. Cache de défauts et enfants paresseux | steps3-5 (4c → 4d) | 43,1 → 43,9 | 50,1 → 50,5 | 136,6 → 139,2 | 205,7 → 206,1 | 78,1 → 77,3 |
| 5a. Chaîne de wrappers vide | steps3-5 (4d → 5a) | 43,9 → 42,6 | 50,5 → 50,4 | 139,2 → 136,1 | 206,1 → 197,1 | 77,3 → 77,2 |
| 5b. Réemploi des préfixes d'identité | confirm (5a → 5b) | 41,8 → 40,9 | 49,8 → 48,5 | 136,5 → 132,5 | 199,5 → 186,8 | 77,2 → 79,7 |

**Étape 1** — mesurée seule contre la référence dans sa propre campagne (step1, cinq navigations) : montage −26 % / −21 % à 1 000 lignes, −28 % / −22 % à 5 000 lignes, −12 % à 100 lignes ; tas −19 à −43 %. Le filtrage de 5 000 lignes sans index passe de 47,6 à 22,4 ms : moins de scopes à désinscrire.

**Étape 2** — −8 à −15 % de montage en plus de l'étape 1, au-delà des 6–7 % du prototype de recherche ; sans effet sur le tas.

**Étape 3** — −4 à −8 % de montage à 1 000 avec index et 5 000 lignes, −15 à −22 % sur le rétablissement à 1 000 lignes ; nul à 1 000 sans index dans cette campagne. Tas −2 à −3 %.

**Étapes 4a–4c** — pas de gain de temps séparable du bruit (±2 %) ; chacune retire 0,6 à 0,8 Mio à 5 000 lignes. Retenues pour la mémoire, sans régression.

**Étape 4d** — tas −1 % (steps3-5) puis −1 à −3,6 % (confirmation, 5b avec/sans 4d). Le montage à 5 000 lignes sans index est ~1,3–1,9 % plus lent avec 4d dans les deux campagnes (quartiles [131,3–133,5] contre [129,9–131,8] dans la confirmation) ; aucun écart ailleurs. Retenue : bénéfice mémoire confirmé, coût de temps au plus de l'ordre du bruit d'une cohorte à l'autre. C'est la sous-étape à retirer en premier si ce cas importe plus que la mémoire.

**Étape 5a** — le driver ne tourne plus pour une chaîne de wrappers vide ; pas de régression, −4 % sur le montage de 5 000 lignes avec index dans cette cohorte. Retenue.

**Étape 5b (conditionnelle)** — confirmation à huit navigations : montage −2 à −6 %, rétablissement −2 à −6 %, mais **tas +3 à +4 %** (+2,5 Mio à 5 000 lignes avec index). Retenue parce que le gain de temps est régulier sur toutes les cases et que le tas reste −46 % sous la référence ; c'est un compromis, pas un gain gratuit. Elle est isolée dans son propre patch.

Taille gzip de l'entrée, cumulée : 50 864 (référence) → 50 903 (1) → 50 928 (2) → 50 960 (3) → 51 064 (5a) → 51 122 octets (5b).

## Ce qui a changé dans les bibliothèques

1. [`craft-effect.ts`](../../libs/core/src/lib/craft-effect.ts) : un corps d'effet simple ne crée plus d'injecteur taggé. Ses tags sont fusionnés au même moment par `ɵmergeHostTags`, extrait de `ɵcreateHostTaggedInjector` dans [`craft-service.ts`](../../libs/core/src/lib/craft-service.ts) — une seule implémentation. Les factories génératrices gardent leur scope, leur résolution de dépendances et leur destruction.
2. `ɵcraftEffectRef` : même implémentation, retourne directement l'`EffectRef`. Le renderer ([`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts), quatre sites) ne passe plus par générateur nommé → `craftUse`. `craftEffect` public inchangé.
3. `ɵcraftPrivateCell` dans [`craft-signal.ts`](../../libs/core/src/lib/host/craft-signal.ts) : même noyau, `Object.is`, boxing, lecture non suivie dans `set`/`update`, batching ; ni marque, ni enveloppe, ni `asReadonly`. Utilisée seulement pour l'index des entrées `forNode` (lu via son `indexReader`), les sources de props et les props d'hôte d'un composant (lus via les input shells). Les descripteurs de nœuds, également internes, n'ont pas été convertis : hors de la liste du plan, non mesurés.
4. [`craft-compat.ts`](../../libs/core/src/lib/host/craft-compat.ts) : déclarations standards d'environnement partagées. [`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts) : déclarations HostName/HostTagList réutilisées par définition et nom (WeakMap, reconstruites si le nom change). [`craft-injector.ts`](../../libs/core/src/lib/host/craft-injector.ts) : méthode partagée pour les records `useValue` (receveur conservé en composition multi/collection), cache de défauts et ensemble d'enfants alloués au premier besoin.
5. [`craft-target-runtime.ts`](../../libs/core/src/lib/craft-target-runtime.ts) : sans wrapper, retour direct du même `EMPTY_RELEASE`, toujours inscrit au `DestroyRef` si `autoCleanup`. [`craft-render-identity.ts`](../../libs/core/src/lib/craft-render-identity.ts) : un enfant d'une identité construite par le runtime prolonge la clé du parent ; nouveaux segments encodés immédiatement ; parent structurel → chemin complet.

## Validation

- Core : 1 659 tests passent (1 636 sur `main`), 1 échec attendu et 3 todo inchangés ; Component : 565 (564 sur `main`). Nouveaux contrats : tags d'un effet simple identiques à ceux d'un scope (route comprise), plusieurs effets de même nom, contexte d'injection du corps, nettoyage malgré une erreur, `ɵcraftEffectRef` (rapport, cycle de vie, propriétaire), cellule privée (`Object.is`, NaN/−0, boxing, batch, lecture non suivie, absence de marque), records d'injecteurs (déclarations partagées sans valeurs partagées, `null`/`undefined`, multi/collection, ordre de destruction), ordinal distinct par instance d'un composant, chaîne de wrappers vide, clés d'identité octet pour octet (Unicode, `/`, segments vides, rejet immédiat d'UTF-16 invalide). Les specs d'injecteur et d'identité passent aussi sur `main`.
- Un test de `craft-replay-transports.spec.ts` a échoué deux fois sur trois suites complètes juste après une campagne, puis n'a plus échoué en dix exécutions ; il passe seul et ne touche aucun code modifié. Instabilité à surveiller, pas attribuée au lot.
- Types : aucun nouveau diagnostic (`tsconfig.spec.json` et `tsconfig.lib.json` de Core et Component, comparés à `main`). ESLint : 410 remarques sur les fichiers touchés avant et après, aucune nouvelle.
- Contrats navigateur : 123 rapports sans index, 183 avec, mêmes empreintes de tags, de cibles de ligne et de racine, `replay: resolved`, même forme DOM, zéro rapport après destruction — dans les cinq campagnes.

## Limites

- Une machine, un navigateur, une fixture de liste. Mesures avant peinture, pas d'INP.
- SSR et hydratation sont couverts par les suites Component, pas par cette fixture navigateur.
- La compatibilité avec des archives de sessions replay existantes n'a pas été vérifiée sur des sessions représentatives : seule l'égalité des adresses entre référence et lot l'est.
- `moduleReady` ne mesure que le chargement et l'initialisation des modules de cette entrée.
- Les pistes reportées du plan (compilateur, plans, watch spécialisé, `DestroyRef` indexé…) n'ont pas été rouvertes. Le filtrage de 5 000 lignes sans index (42,6 → 18,3 ms) suggère que la refonte de `DestroyRef` n'est plus prioritaire.
