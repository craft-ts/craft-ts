# CraftTS performance smoke

```sh
npm run perf:smoke
npm run perf:serve
npm run perf:examine
```

Le smoke utilise Chromium via Playwright, déjà installé dans ce workspace. Si le
binaire manque : `npx playwright install chromium`.

L'interface est disponible sur http://127.0.0.1:4299 pendant `perf:serve`.
Paramètres : `?rows=1000`, `&components=false` (éléments simples au lieu de
composants enfants), `&runtime=development` (diagnostics du runtime, y compris
sur le bundle de production).

## Ce qui est mesuré

- Serveur Vite : lancement du processus → ouverture du port, sans requête de
  préchauffage. Ne comprend pas Nx, npm, le typecheck ou un backend.
- Démarrage navigateur : navigation → deux `requestAnimationFrame` après le
  bootstrap. Le temps de bootstrap synchrone est aussi conservé séparément.
- Interactions : clic DOM → notification de mutation du DOM, puis deux frames.
  Le contrôle des données finales et de l'identité des éléments DOM a lieu
  après le chronométrage. Les trois premières interactions sont écartées.
- Changement de code : écriture d'un module TypeScript ou d'un `*.style.ts` →
  nouvelle valeur rendue et deux frames après bootstrap. Le nombre de
  navigations distingue le rechargement complet d'une mise à jour à chaud.
- Comparaisons : développement / production, CPU ralenti ×4, même liste sans
  composants enfants, même bundle avec le runtime en mode développement.

Chaque navigation utilise un nouveau contexte navigateur, donc un cache HTTP
vide. Seule la première navigation de développement a aussi un cache Vite vide ;
les suivantes réutilisent le serveur et ses transformations. Les ressources
décompressées incluent les sources maps inline en développement : ce n'est pas
le poids transféré sur un réseau réel.

Le runner copie l'app et `core`, `component`, `style` dans un répertoire temporaire
pour figer le runtime. Les modifications de mesure portent uniquement sur cette
copie. Les sources existantes, y compris leurs modifications non commitées, ne
sont pas écrites. Un SHA-256 identifie la copie des bibliothèques mesurées.
Les processus et fichiers temporaires sont supprimés à la fin.

## Résultat et reproductibilité

Le rapport brut est écrit dans `tmp/performance-smoke.json`. Le runner échoue en
cas d'erreur navigateur, d'absence de mise à jour, de données incorrectes ou de
perte d'identité DOM lors d'une modification ou d'une inversion. Les temps sont
des observations ; aucun seuil de performance arbitraire n'est imposé.

```sh
CRAFT_PERF_RUNS=7 CRAFT_PERF_ITERATIONS=30 npm run perf:smoke
CRAFT_PERF_REPORT=tmp/my-performance-report.json npm run perf:smoke
```

Par défaut : 5 navigations par scénario et 20 interactions par action après
préchauffage. Le runner teste 0, 100, 1 000 et 5 000 lignes et imprime les
médianes ainsi que les p95 des interactions.

Ce sont des mesures locales sur une petite app sans réseau métier, routeur,
formulaire, capture de session ou pont MCP. Les deux frames donnent une
opportunité d'affichage ; elles ne mesurent ni l'INP ni le LCP. Le CPU ×4 n'est
pas un téléphone réel. La liste est volontairement entièrement montée, sans
virtualisation. Ce smoke ne remplace pas un profil de l'application cible.

## Examens approfondis

`npm run perf:examine` effectue des expériences sur une copie figée du runtime :
profil CPU Chromium, recherches de traces optionnelles avec/sans cache, dépendance à l'index
des listes, prébundling et reprise des changements de bibliothèque, essais de
HMR CSS et TypeScript, puis contrôles de mémoire après remontages.

Les variantes qui désactivent une vérification d'index ou autorisent le
remplacement de noms de composants sont des sondes de diagnostic. Elles ne
constituent pas des correctifs : les contrôles négatifs montrent notamment
qu'ignorer l'index casse les templates qui l'affichent et qu'actualiser seulement
la feuille CSS laisse les anciennes classes dans le DOM.

Les données et le profil `.cpuprofile` sont écrits dans
`tmp/performance-examination/`. Les mesures utilisent le serveur de développement
avec un mode runtime choisi indépendamment du bundling. Elles ne sont donc pas
directement interchangeables avec les mesures de bundle production du smoke.
Le lancement du serveur utilise ici l'API Vite dans un processus déjà démarré,
contrairement au smoke qui mesure aussi le lancement du processus Vite.

```sh
CRAFT_PERF_EXAMS=diagnostics npm run perf:examine
CRAFT_PERF_EXAMS=lists,modules,css,typescript npm run perf:examine
CRAFT_PERF_EXAMS=memory CRAFT_PERF_EXAM_REPORT=tmp/perf-memory npm run perf:examine
```

Par défaut, chaque comparaison utilise 5 navigations et 10 inversions après
2 interactions de préchauffage. La section TypeScript effectue 10 éditions et
le contrôle mémoire 100 remontages du même module. Les snapshots sont supprimés
en fin de run ; les rapports et profils restent disponibles. Les erreurs
attendues des sondes négatives sont enregistrées dans le rapport.

### Régression des traces absentes

L'examen `diagnostics` mesure le runtime sans traces, puis avec un wrapper
racine qui appelle `next()`. Deux variantes instrumentées comptent les appels
à `executeTemplateTrace`, les exécutions de wrappers et les créations d'erreurs
pour `TemplateTracesServiceToken` directement dans `missingProviderError`.
La sonde ne dépend pas d'un bloc `catch` dans le code de traces.

Le runner exige zéro erreur d'absence au démarrage de 1 000 composants, après
une inversion et après des inversions répétées. Avec un wrapper, il exige autant
d'exécutions que d'appels de trace en développement, puis aucune en production.
Les mesures de temps et le profil CPU utilisent des variantes sans ces compteurs.
Toutes les sondes et les caches expérimentaux restent dans la copie temporaire ;
le runtime applicatif ne contient ni sonde ni cache de traces.


## Index réactifs : campagne dédiée

```sh
npm run perf:reactive-index
```

Le smoke accepte aussi `&indexes=true` pour afficher les positions et
`&scheduled=true` pour activer `scheduleFor`. Il compte séparément les callbacks
de ligne (`rowTemplates`), templates enfants (`renders`), bindings d'item
(`itemBindings`) et bindings d'attribut d'index (`indexBindings`). L'affichage
texte de la position est un second binding ; le compteur d'index mesure
uniquement l'attribut, pour compter une fois chaque ligne déplacée.

`reactive-index.mjs` fige les sources, puis mesure 1 000 et 5 000 lignes dans un
serveur de développement et dans un bundle de production, avec et sans index.
Chaque taille inclut un rendu synchrone, un rendu planifié et un rendu planifié
avec CPU ralenti ×4. Les opérations sont la modification d'un item, l'inversion
et le filtrage/rétablissement. Le runner vérifie les textes, les positions,
l'identité DOM et l'absence de travail de template/item lors des inversions
avec le nouveau runtime. Deux interactions servent de préchauffage par action.

Par défaut : trois navigations et six interactions mesurées par action pour
les profils synchrones ; une navigation et deux interactions pour les profils
planifiés, plus coûteux. Les échantillons restent dans le rapport. Le bootstrap
synchrone et la fin du montage progressif sont distincts. Les temps des actions
planifiées incluent les frames nécessaires au dernier état correct ; ne pas
les comparer directement à un simple temps de dispatch synchrone.

Les compteurs sont présents pendant le chronométrage dans les deux variantes.
Les mesures de tas et de DOM utilisent une collecte forcée via CDP. Un contrôle
à 5 000 lignes avec index effectue cinq puis vingt cycles supplémentaires de
filtrage/rétablissement ; il ne constitue pas une preuve générale d'absence de
fuite. Le runtime ne contient aucune instrumentation de benchmark.

Pour comparer à un renderer numérique sauvegardé **avant** la migration :

```sh
CRAFT_PERF_BASELINE_RENDERER=/absolute/path/to/saved-interpreter.ts npm run perf:reactive-index
```

Cette référence ne vient pas de `HEAD` : elle doit conserver les éventuelles
modifications locales antérieures. Dans la copie de benchmark seulement, son
nombre capturé est emballé dans un générateur pour exécuter la même app de
mesure. L'API applicative ne dispose d'aucune compatibilité numérique. Les autres
fichiers du runtime sont communs aux variantes, notamment le correctif du pont
d'effets nécessaire aux batches de milliers d'index ; la comparaison isole donc
le renderer numérique et le renderer à index réactif.

Rapport : `tmp/reactive-for-index/report.json`. Options :
`CRAFT_PERF_INDEX_REPORT`, `CRAFT_PERF_INDEX_RUNS` et
`CRAFT_PERF_INDEX_ITERATIONS`. Les empreintes des snapshots sont enregistrées.
L'examen `lists` conserve un contrôle négatif : bloquer la publication des
signaux laisse dix positions erronées après inversion de dix lignes.
