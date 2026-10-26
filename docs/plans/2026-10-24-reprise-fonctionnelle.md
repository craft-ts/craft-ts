# Reprise fonctionnelle d'une session enregistrée

> **Abandonné (2026-10-26).** L'approche déclarative est retirée ; voir
> `2026-10-26-reprise-guidee-ia.md`. Ce document reste comme historique.

Depuis le dashboard de replay, rouvrir l'application **en vrai** à un point
choisi d'une session, avec des états réels et valides : connexion refaite,
droits du bon rôle, références serveur (jeton, panier) réacquises, temps
recalé, et rien d'écrit sur un backend sans accord.

> **Statut corrigé (2026-10-25).** La revue a montré que plusieurs points
> ci-dessous n'étaient pas vrais ; ils sont corrigés par
> `2026-10-25-reprise-fonctionnelle-corrections.md`. En particulier : la
> persona était fixée dans la déclaration, les acquisitions partaient sans
> test de vivacité, `expect`/`onMismatch`/`cleanup` n'étaient pas exécutés,
> et les valeurs ne restaient **pas** hors archive (jetons en clair dans les
> réponses JSON encodées deux fois, ressources relayées par `postMessage`).
> Le masquage des secrets reste reporté.
>
> **Statut d'origine.** Mise en œuvre annoncée terminée dans le worktree `codex/reprise-fonctionnelle`.
> Les lots 0 à 10 sont raccordés à la démo. Le graphe statique de reprise
> est produit par `resume-check`, servi en développement sur loopback, et ses
> empreintes sont raccordées aux déclarations runtime quand la correspondance
> est unique. Les archives de la démo capturent aussi un baseline d’empreintes
> sans chemins source. Le lot 7 dispose d’un exécuteur séquentiel, d’une
> barrière réseau et d’un lancement guidé multi-onglets : le dashboard prépare
> un plan par participant, ouvre un onglet par participant archivé, puis lance
> le participant de tête avant les suivants. Les onglets suivants attendent
> leurs ressources partagées en mémoire, puis exécutent leur propre plan.
> Le dashboard affiche la progression et le
> rapport agrégé de fidélité. La
> barrière couvre `fetch`, XHR, WebSocket et workers à partir des appels
> explicitement autorisés, et l’instantané conserve maintenant les horloges
> monotone et civile pour le profil enregistré. Les tâches temporelles sont
> recalées par propriétaire et type quand le démarrage les recrée ; celles qui
> ne le sont pas apparaissent dans le rapport. Un appel réseau imprévu via
> `fetch` ou XHR asynchrone est maintenant
> retenu avec une décision dans le dashboard (autoriser une fois ou refuser),
> puis refusé automatiquement après deux minutes. XHR synchrone, WebSocket et
> workers non autorisés échouent encore directement.
> L’archive locale sait persister un profil versionné avec la politique
> d’horloge et des surcharges figées. Le dashboard permet d’éditer leurs
> cibles et valeurs JSON, les valide structurellement, et l’application les
> applique aux réponses HTTP par remplacement ou patch JSON, avec statut
> facultatif (par exemple 403) ; seules les
> surcharges effectivement utilisées affectent la classe de fidélité. Le
> dashboard contrôle la forme JSON contre la réponse archivée pour ce même
> appel ; les schémas OpenAPI/API restent à raccorder. Le dashboard publie
> maintenant le plan et les écarts au pont local de `log-mcp` : les outils
> `resume_*` peuvent proposer une surcharge ; l’approbation est humaine par
> défaut, avec une option automatique réservée au dashboard en loopback, et la
> persistance du profil reste une action distincte. Le journal propose
> aussi « Reprendre ici » sur chaque événement pour planifier au point choisi.
> Les attentes `recorded` sont projetées sans leurs valeurs dans le plan ; une
> réponse future archivée (par exemple le 403 de S1) est visible dans le plan
> et le manifeste sans exposer son corps.
> Le lot 10 ajoute `craft graph --check-resume`, raccordé aux cibles `serve`
> et `build` de la démo. Les acceptations S1, S2 et S3 passent dans Chromium :
> reconnexion avec le 403 métier attendu, nouveau panier sans commande, puis
> reprise de la recherche temporisée et du polling multi-onglets. Les specs
> unitaires ciblées, le lint et le contrôle du graphe passent également. Les
> points reportés ci-dessous restent ouverts.

## Promesse

Pas une téléportation exacte : une **reprise vérifiée, à fidélité mesurée**,
qui refuse de se lancer quand elle ne peut pas garantir l'état. Chaque reprise
se termine par un rapport qui la classe :

| Classe                    | Condition                                                             |
| ------------------------- | --------------------------------------------------------------------- |
| **réelle**                | toutes les étapes bloquantes conformes en vrai, aucune surcharge      |
| **assistée**              | au moins une étape surchargée (à la main ou par l'IA), aucune bloquée |
| **partiellement simulée** | au moins une étape servie depuis l'enregistrement                     |
| **refusée**               | une étape bloquante a échoué ou le pré-vol n'est pas passé            |

Une reprise n'est jamais présentée comme plus réelle qu'elle ne l'est.

## Ce qui existe déjà

| Brique                                                                                                                                        | Où                                                                                                   | Rôle dans la reprise                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Format d'archive v6, événements corrélés (`operationId`, `correlationId`), participants multi-onglets                                         | `libs/core/src/lib/send-context-to-ai.tokens.ts`                                                     | matière première                       |
| Capture fetch (méthode, URL, corps, réponse complète)                                                                                         | `libs/component/src/lib/ai/debug-session-fetch-capture.ts`                                           | à enrichir (en-têtes, XHR, empreintes) |
| Rejeu HTTP apparié par contexte d'appel                                                                                                       | `libs/core/src/lib/craft-http-trace.ts` (`ɵinstallCraftHttpReplay`, `ɵconsumeCraftHttpReplayResult`) | base de la barrière hybride            |
| Snapshot d'app avant un événement                                                                                                             | `libs/component/src/lib/ai/debug-session-app-snapshot.ts` (`buildDebugAppSnapshot`)                  | point de départ de la restauration     |
| Lancement d'un onglet restauré                                                                                                                | `debug-session-snapshot-launch.ts`, `debug-session-replay-bridge.ts`, dashboard `replay-debug.ts`    | protocole à étendre                    |
| Checkpoints du storage navigateur                                                                                                             | `debug-session-browser-storage.ts`                                                                   | partie globale du snapshot             |
| Restauration des primitives                                                                                                                   | `libs/core/src/lib/craft-primitive-registry.ts` (`restore`)                                          | substitution des références            |
| Racines d'invocation, plan de rejeu                                                                                                           | `debug-session-orchestrator.ts` (`rootInvocations`, `compileReplayPlan`)                             | chaîne dynamique                       |
| Rapport de dérive, tolérances                                                                                                                 | `debug-session-scenario.ts` (`createReplayDriftReport`, `compareReplayScenarioValue`)                | rapport de fidélité                    |
| Runtime temporel : `now`, `dateNow`, `schedule`, `pendingTasks` (`dueAt`, `owner`), runtime virtuel                                           | `libs/core/src/lib/temporal-runtime.ts`                                                              | horloge de reprise, tâches à réarmer   |
| Graphe : primitives, `triggers` (`insertReactOnMutation`), `http-endpoint`, opérations serveur, état persisté (`insertLocalStoragePersister`) | `libs/dev-tools/src/scripts/dependency-graph.ts`                                                     | chaîne statique                        |
| Classifications de données et frontières `external-output`                                                                                    | `libs/dev-tools/src/scripts/data-flow-graph.ts`                                                      | masquage du manifeste                  |
| Chat IA du dashboard, serveurs MCP                                                                                                            | `apps/debug-session-dashboard/src/replay-ai-bridge.service.ts`, `packages/log-mcp`                   | aide IA                                |

## Décisions

### Statuées

- **Backends quelconques.** Le front est toujours craft-ts, le backend peut ne
  pas l'être (autre langage, hors monorepo). La base est la frontière réseau
  générique. Les fonctions serveur craft ne sont qu'un adaptateur plus riche.
- **Modèle centré ressource.** Une connexion ou un panier est une ressource qui
  traverse plusieurs primitives : une mutation la fournit, un état la garde,
  une query la requiert et révèle l'identité. Motif recommandé : mutation +
  `insertReactOnMutation`.
- **Même nombre d'onglets** que dans l'archive.
- **Temps entièrement piloté par le runtime temporel**, imposé par la règle de
  lint (lot 0).
- **IA autorisée pendant la reprise**, mais uniquement par des surcharges sous
  forme de données, enregistrées et rejouables sans elle.
- **Manifeste des données attendues par le backend**, avec pré-vol.

### Par défaut (réversibles, à confirmer à l'usage)

| Point               | Défaut                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Environnements      | local + hôtes listés dans la config du projet ; jamais la prod                                |
| Horloge             | temps réel, échéances recalées ; temps enregistré en option explicite                         |
| Persona manquante   | refus, avec une option « reprise assistée » (admin + surcharges)                              |
| Secrets             | empreintes dans les archives ; identifiants des personas dans un fichier local ignoré par git |
| Dérive du code      | refus si une primitive de la chaîne a changé (`sourceHash`), avertissement sinon              |
| Mutation non prévue | retenue jusqu'à décision ; bloquée en mode sans surveillance                                  |
| Manifeste           | export manuel ; seed automatique en option par backend ; champs sensibles masqués             |

### Reportées

- **Forme de l'API de déclaration** (`craftResume`, insertions, autre). Le
  lot 4 l'isole dans un seul module pour qu'un changement de forme reste
  mécanique.
- **Aléatoire** (`Math.random`, `crypto.randomUUID`) : voir lot 0, à confirmer.

## Vocabulaire

- **Ressource** : une valeur délivrée par l'extérieur et réutilisée ensuite
  (jeton, id de panier, tenant). Typée, nommée.
- **Rôles** d'une primitive vis-à-vis d'une ressource : `provides` (la produit,
  sait la réacquérir), `holds` (la garde, sait la remplacer), `requires`
  (en a besoin), `revokes` (la rend invalide), `restores` (recrée son contenu
  net), `identity` (révèle qui est connecté).
- **Point ciblé** : un instant en temps global de l'archive
  (`globalElapsedMs`), commun à tous les onglets.
- **Plan de reprise** : la liste ordonnée des étapes, des prédictions et des
  problèmes, calculée avant toute exécution.
- **Manifeste** : ce que le backend doit contenir et répondre pour que le plan
  tienne.
- **Barrière** : le filtre de tous les appels sortants entre le début de la
  reprise et la prise en main.
- **Prise en main** : le premier geste de l'utilisateur (pointerdown, keydown)
  après la reprise. Avant, c'est le système ; après, l'app vit normalement.
- **Surcharge** : une donnée qui remplace une valeur de primitive ou une
  réponse d'appel. Seul canal par lequel une reprise s'écarte du réel.

## Chaîne d'exécution

```
archive ──► analyse ──► plan ──► pré-vol ──► exécution ──► barrière ──► prise en main
              │           │         │            │             │
   graphe statique   manifeste   lectures    acquisitions   live / patch /
   + provenance      + personas   seules     substitution   enregistré / retenu
                                             restauration
                                             relectures
                                             tâches réarmées
                                                          ──► rapport de fidélité
```

## Scénarios de référence

Les trois servent de tests d'acceptation de bout en bout, dans
`apps/demo-ecommerce`.

| Id     | Scénario                                                                                                                 | Ce qu'il prouve                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **S1** | Inès (product manager) se connecte, ouvre l'admin, modifie un produit et reçoit « Action réservée aux administrateurs. » | auth, identité, droits, issue métier attendue (403)               |
| **S2** | Léo remplit un panier **côté serveur**, le point ciblé est juste avant la commande                                       | référence serveur + contenu, `restores`, `checkout` jamais rejoué |
| **S3** | une recherche en debounce et un polling sont en attente au point ciblé                                                   | temps, tâches à réarmer, appels déclenchés au montage             |

Le refus d'édition du PM est **voulu** dans la démo : c'est le bug que S1 doit
reproduire. Il ne faut pas le « corriger ».

## Lots

Chaque lot se termine par des specs vertes et un critère de sortie vérifiable.
Les lots 1, 2 et 3 sont indépendants et peuvent avancer en parallèle.

### Lot 0 — Hygiène déterministe

1. ~~Renforcer `no-direct-temporal-globals`~~ (fait le 2026-10-24) : timers,
   rAF, idle, immediate, `Date.now`, `new Date()`, `Date()`, `performance.now`
   et `timeOrigin`, accès via `globalThis` / `window` / `self`, clés calculées,
   alias ; règle activée sur le client de demo-ecommerce.
2. **À confirmer** : un runtime d'aléatoire craft (`CraftRandomRuntime` :
   `next()`, `uuid()`), pilotable comme le runtime temporel (graine enregistrée
   au début de session, version déterministe pour le rejeu), et une règle
   `no-direct-random-globals` (`Math.random`, `crypto.randomUUID`,
   `crypto.getRandomValues`).

**Sortie :** aucune lecture de temps ou d'aléatoire hors runtime dans les apps
soumises à la config recommandée.

### Lot 1 — Capture enrichie et provenance

À l'enregistrement, sans rien changer au rejeu existant.

1. **En-têtes de requête** dans `debug-session-fetch-capture.ts` : noms
   toujours, valeurs remplacées par une empreinte pour `Authorization`,
   `Cookie`, `X-*-Token` et toute valeur à forte entropie.
2. **Capture XHR** : nouveau `debug-session-xhr-capture.ts`, même forme
   d'événement que fetch (`source: 'browser-xhr'`), branché comme
   `connectDebugSessionFetchCapture`.
3. **Extraction de références** : module pur `debug-session-references.ts`.
   `extractReferenceCandidates(value, path)` parcourt un JSON et retient les
   feuilles à forte entropie (UUID, jetons, ids de plus de N caractères, seuil
   d'entropie de Shannon), dans les corps, en-têtes, segments d'URL et
   paramètres.
4. **Empreintes** : hachage synchrone non cryptographique (FNV-1a 64 bits) salé
   par session. Stable dans une session, inutilisable hors d'elle.
5. **Secrets hors des archives** : les valeurs classées secrètes sont remplacées
   partout par le même jeton de substitution `craft-ref:<empreinte>`. Le rejeu
   déterministe reste cohérent, puisque chaque occurrence reçoit le même
   remplaçant.
6. **Champ `refs`** sur `SendContextEvent` :
   `{ path, fingerprint, direction: 'out' | 'in' }[]`.
   `DEBUG_SESSION_EXPORT_VERSION` passe à 7 ; les archives v6 sont déclarées
   incompatibles avec la reprise (le rejeu peut les garder).
7. **Gabarits d'URL** : `/carts/abc123` devient `/carts/:ref` quand le segment
   est une référence.
8. **Graphe de provenance** : module pur `debug-session-provenance.ts`.
   Il relie chaque référence à son producteur (réponse) et à ses
   consommateurs (requête suivante, état, storage).

**Specs :** extraction et faux positifs (dates, nombres courts, mots), XHR,
masquage des en-têtes, cohérence du remplacement, provenance sur une archive
de synthèse.
**Sortie :** sur une archive S1, la provenance relie le jeton de
`ecommerce.auth.login` à `atelier.session.v1` dans localStorage et à l'entrée
de `ecommerce.admin.overview`, sans aucun jeton en clair dans l'archive.

### Lot 2 — Graphe : relations manquantes et chaîne de reprise

Constat du 2026-10-24 sur demo-ecommerce : le graphe voit les lectures
(`isStaff` → `currentSession`), pas les écritures ni les appels externes
passés par un wrapper.

1. **`writes`** primitive → primitive : un loader ou une méthode qui appelle
   une méthode d'état (`yield* currentSession.open(...)`), y compris à travers
   un service.
2. **`calls`** primitive → fonction serveur ou endpoint HTTP **à travers les
   fonctions intermédiaires** : suivre les fonctions générateurs importées
   (`api.ts` → `createServerFunctionClient(craftUnique('ecommerce.auth.login'))`).
3. **`resumeChainOf(graph, primitiveId)`** : module pur dans dev-tools.
   Remonte `depends-on`, `writes`, `calls`, `triggers` jusqu'aux feuilles, et
   classe chaque feuille : client, lecture externe, acquisition, mutation
   externe.
4. **Artefact `resume-graph.json`** : extrait compact du graphe (primitives,
   relations de la chaîne, `sourceHash`), produit par `craft graph` et servi au
   dashboard.

**Specs :** fixtures ts-morph pour chaque relation, chaîne sur un service de
test.
**Sortie :** sur demo-ecommerce, `resumeChainOf(isStaff)` atteint
`ecommerce.auth.login` via `currentSession` et `signInProcess`.

### Lot 3 — demo-ecommerce en cas d'étude conforme

L'app porte du travail non commité : vérifier son état avant de commencer.

1. **Auth au motif recommandé** : mutation `signIn`, nouvelle fonction serveur
   `ecommerce.auth.me`, query `currentUser` qui réagit à `signIn` par
   `insertReactOnMutation` et se recharge au démarrage.
2. **Persistance** de la session et du panier par
   `insertLocalStoragePersister` au lieu de `readStored` / `store`, pour que le
   graphe la voie.
3. **Panier côté serveur** : `ecommerce.cart.create`, `ecommerce.cart.addLine`,
   `ecommerce.cart.get`, avec un id de panier délivré par le serveur.
4. **Temps** : une recherche de la vitrine en debounce et un polling de
   l'overview admin, tous deux via le runtime temporel.
5. **Archives de référence** S1, S2, S3 enregistrées et versionnées dans
   `apps/demo-ecommerce/e2e/fixtures/`, une fois le lot 1 en place (sinon les
   jetons seraient en clair).

**Sortie :** les trois scénarios se jouent à la main, `craft graph` montre les
chaînes complètes, le refus du PM est intact.

### Lot 4 — Déclarations de reprise (forme provisoire)

1. **Module unique** `libs/core/src/lib/craft-resume.ts` : ressources typées,
   rôles, et l'option `resume` sur `query`, `mutation` et `state`. Le
   descripteur est attaché à l'entrée du registre de primitives : un objet
   inerte et des fonctions courtes, rien d'autre au runtime de prod.
2. **Contenu d'une déclaration** : `params` (persona du rôle enregistré),
   `value`, `identity`, `read` / `write` pour `holds`, `expect`
   (`outcome: 'recorded'`, `match: [chemins]`), `onMismatch`
   (`abort` | `recorded` | `degraded`), `cleanup`.
3. **Défauts inférés** quand rien n'est déclaré : référence vivante au point
   ciblé ⇒ `acquire` implicite ; lecture ⇒ `refetch` ; mutation non déclarée ⇒
   non rejouée, avec avertissement.
4. **Personas** : fichier `.craft/resume.personas.local.json` ignoré par git,
   un compte par rôle. La démo peut le générer depuis `src/shared/accounts.ts`.
5. **Graphe** : la déclaration est lue par l'AST et ajoutée aux nœuds
   (`details.resume`).
6. **Tests de types** (`libs/test-type`) : une primitive renommée ou un champ
   supprimé ne compile plus ; le type de `value` est contraint par la
   ressource.

**Sortie :** demo-ecommerce déclare `AuthResume` et `CartResume` ; renommer
`currentSession` casse la compilation.

### Lot 5 — Planificateur (pur)

`libs/component/src/lib/ai/debug-session-resume-plan.ts`. Il tourne **dans
l'app cible**, qui possède les déclarations, et renvoie un plan sérialisable
au dashboard.

1. **Entrées** : archive, point ciblé, `resume-graph.json`, descripteurs de
   l'app, personas, politique d'horloge.
2. **Ressources vivantes** au point ciblé : un `holds` a une valeur, ou le
   dernier `requires` a réussi, et aucun `revokes` n'a suivi.
3. **Identité** : le dernier `identity` connu avant le point ciblé (réponse de
   `me`, réponse du login ou valeur gardée). Couvre une session commencée déjà
   connectée.
4. **Étapes ordonnées** : acquisitions, table de substitution, restauration
   (partie globale du storage une fois, partie par onglet ensuite),
   relectures, réarmement des tâches, liste des appels autorisés.
5. **Temps** : les checkpoints de rejeu enregistrent désormais
   `pendingTasks()` (`kind`, `owner`, `dueAt`). Chaque tâche en attente est
   réarmée par sa cause, avec son délai restant, ou déclarée perdue.
   Les échéances absolues gardées dans l'état sont recalées.
6. **Prédiction** des appels au montage de la route ciblée (graphe : route →
   composants → primitives auto-chargées → endpoints).
7. **Problèmes** : bloquants (persona absente, ressource sans fournisseur,
   primitive de la chaîne modifiée) et non bloquants.

**Specs :** plans attendus (fichiers de référence) pour S1, S2, S3, et une
variante S1 commencée déjà connectée.
**Sortie :** le plan de S1 contient une acquisition `signIn` avec la persona
PM, la substitution du jeton, la relecture de l'overview, et l'issue attendue
403 sur `ecommerce.product.save`.

### Lot 6 — Manifeste backend et pré-vol

1. **Dérivation** du manifeste depuis le plan, les lectures enregistrées et la
   provenance : personas, entités requises (avec les champs vus par le
   client), issues attendues, contraintes, temps. Niveaux `requis`, `attendu`,
   `informatif`.
2. **Masquage** par les classifications de `data-flow-graph.ts` ; un champ
   classé sensible n'apparaît jamais en clair.
3. **Export** depuis le dashboard : JSON + checklist Markdown, pour préparer un
   staging à la main.
4. **Pré-vol** : seules les lectures du plan sont exécutées, et le manifeste
   est comparé avant la moindre écriture.
5. **Adaptateur de seed** optionnel (`ResumeSeedAdapter`) ; pour la démo, une
   fonction serveur réservée au dev, refusée hors local.

**Sortie :** S1 sur un serveur neuf : pré-vol vert. Produit supprimé : reprise
refusée avec la raison, avant toute écriture.

### Lot 7 — Exécuteur, barrière et horloge

1. **Lancement** : `startResumeLaunch`, extension de `startDebugSnapshotLaunch`.
   Le dashboard ouvre un onglet par participant. L'onglet de tête exécute les
   acquisitions et diffuse la table de substitution aux autres par le
   dashboard (`window.opener`), puis chaque onglet restaure et relit.
2. **Barrière** sur fetch, XHR, fonctions serveur et transports
   WebSocket/worker. Décision par appel : `live`, `live+patch`, `recorded`,
   `held`. Elle s'appuie sur le rejeu HTTP existant, étendu à ce mode
   hybride. Une mutation non prévue est retenue : message `resume-hold` au
   dashboard, qui demande quoi faire.
3. **Horloge** : un runtime réel suspendable dans `temporal-runtime.ts`, gelé
   pendant les pauses (barrière, IA), et le décalage de `dateNow` pour la
   politique « temps enregistré ».
4. **Prise en main** : la logique existante de libération (premier
   pointerdown/keydown) ferme la fenêtre de barrière.
5. **Échecs** : classement technique / métier / données, retry borné pour le
   technique, `expect` + `onMismatch` pour le reste, propagation aux étapes
   dépendantes (bloquées sans être tentées), `cleanup` en cas d'abandon.

**Spec e2e S1** (ports `CRAFT_E2E_*` dédiés, chromium) : Inès est reconnectée
sur un serveur neuf, l'admin s'ouvre sur le produit, la sauvegarde renvoie le
403 enregistré, rapport « réelle ».

### Lot 8 — Dashboard : plan, progression, rapport

1. Bouton **« Reprendre ici »** à côté de « Déboguer ici », dans l'en-tête et
   par ligne du journal.
2. **Panneau de plan** avant le lancement : étapes, prédictions, manifeste,
   problèmes, avec lancement impossible tant qu'il reste un problème
   bloquant.
3. **Progression en direct** et cartes de décision (mutation retenue, écart
   d'issue).
4. **Rapport de fidélité** par onglet et par système, statuts ✓ conforme,
   ≈ dérive tolérée, ⚠ servi depuis l'enregistrement, ✗ bloqué, et la classe
   finale. Réutilise `createReplayDriftReport`.
5. **Profil de reprise** (surcharges acceptées) sauvegardé avec la session dans
   l'archive locale.

**Specs e2e S2 et S3.** S2 : panier recréé avec un nouvel id, `checkout`
jamais appelé. S3 : la recherche en debounce part une fois avec son délai
restant, le polling reprend.

### Lot 9 — Surcharges et IA

1. **Modèle de surcharge** unique, en données : cible primitive (adresse du
   registre) ou réponse (nom de fonction serveur ou `MÉTHODE /gabarit` +
   condition sur les params) ; effet valeur, patch JSON, remplacement, statut
   forcé ou « enregistré ».
2. **Validation** contre le schéma de réponse (sortie de fonction serveur,
   OpenAPI, ou à défaut « même forme que l'enregistrement »).
3. **Outils MCP** exposés par le dashboard via le pont local de `log-mcp` :
   `resume_plan`, `resume_mismatch`, `resume_propose_overrides`,
   `resume_apply`. Les outils lisent le contexte publié en mémoire et
   transportent les propositions ; le dashboard reste l'interface d'approbation.
4. **Deux moments** : à la préparation (combler les trous du plan) et pendant
   l'exécution (une pause sur écart, horloge gelée, patch proposé).
5. **Garde-fous** : l'IA ne déclenche aucun appel ; validation humaine par
   défaut, mode automatique en local seulement ; bouton « Figer » qui rend les
   surcharges permanentes dans le profil ; étapes étiquetées « assistée par
   IA ».

**Sortie :** S1 sans compte PM : l'IA propose connexion admin + rôle surchargé

- réponse 403 ; reprise « assistée » qui reproduit le refus ; la reprise
  suivante rejoue les surcharges figées sans appeler l'IA.

### Lot 10 — Verrous statiques

Dans `craft check` et la suite d'architecture, une fois les lots 2 et 4 en
place.

| Diagnostic                         | Déclencheur                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `resume-unresolved`                | primitive en amont d'un état persisté ou partagé qui appelle une mutation ou acquisition externe sans déclaration (ou `none` motivé) |
| `resume-held-without-substitution` | état qui garde une valeur issue d'un `provides` sans `holds`                                                                         |
| `resume-requires-without-provider` | ressource requise que rien ne fournit                                                                                                |
| `resume-dynamic-endpoint`          | URL dynamique dans une chaîne de reprise, sans contrat HTTP explicite                                                                |

**Sortie :** retirer une déclaration de demo-ecommerce fait échouer
`craft check` avec le bon diagnostic.

## Dépendances entre lots

```
lot 0 ─┐
lot 1 ─┼──► lot 5 ──► lot 6 ──► lot 7 ──► lot 8 ──► lot 9
lot 2 ─┤      ▲
lot 3 ─┴► lot 4
lot 2 + lot 4 ──► lot 10
```

## Risques et critères d'arrêt

| Risque                                                      | Signal                                                | Réponse                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| L'analyse statique ne suit pas les wrappers de façon fiable | lot 2 : chaînes incomplètes sur la démo               | déclarations explicites obligatoires sur les frontières, le graphe ne fait que vérifier |
| Trop de faux positifs dans la provenance                    | lot 1 : références parasites sur des sessions réelles | seuil d'entropie relevé, marquage typé des références dans les schémas                  |
| La barrière casse des apps                                  | lot 7 : appels légitimes retenus en nombre            | liste d'autorisation dérivée du plan, mode observation avant le mode blocage            |
| Tâches impossibles à réarmer par leur cause                 | lot 5 : `owner` insuffisant                           | enrichir `TemporalScheduleOptions` d'une adresse de primitive                           |
| Coût de déclaration trop élevé                              | plus de quelques déclarations par ressource           | revoir le modèle, pas l'app                                                             |

## Points restant ouverts

- Forme définitive de l'API de déclaration (après le lot 4).
- Runtime d'aléatoire (lot 0, point 2).
- Reprise d'un onglet dont le participant enregistré était caché ou flou
  (`state: 'hidden' | 'blurred'`).
- Backends réglementés : manifeste anonymisé ou réduit à la forme des données.
