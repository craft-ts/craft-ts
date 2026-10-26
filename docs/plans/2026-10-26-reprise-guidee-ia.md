# Reprise guidée par l'IA

Remplace l'approche déclarative de `2026-10-24-reprise-fonctionnelle.md` et de
ses corrections. Une app ne décrit plus à l'avance ses ressources, ses
identités et ses nettoyages : une IA lit la session enregistrée, conduit l'app
vivante jusqu'à un état équivalent au point choisi, puis fige ce point pour
qu'il soit rechargé sans elle tant qu'il reste valide.

> **Statut.** G0 fait (2026-10-26) : l'approche déclarative est retirée.
> G1 fait (2026-10-26) : `packages/session-trace/src/resume-context.ts`
> (récit, cible, prérequis, appel enregistré), demandes de reprise du
> log-server (`POST /sessions/resume-requests`, `GET …/latest`, en mémoire,
> sous les règles d'origine des routes de sessions), outils log-mcp
> (`packages/log-mcp/src/resume-tools.ts`) et bouton **Reprendre ici** du
> dashboard (publie le point, copie l'invite).
> G2 fait (2026-10-26) : le pont MCP du noyau répond à `page act` (goto par
> le routeur ; un champ sensible ne montre jamais sa valeur et refuse `fill`)
> et à des méthodes ajoutées par d'autres libs (`ɵregisterCraftMcpBridgeMethod`) ;
> le broker relaie `app/*` avec leur propre délai ; `provideCraftGuidedResume`
> (libs/component) répond à `app/launch`, `app/diff`, `app/replay`,
> `app/writes`, lit l'archive au log-server et pose la barrière d'écriture
> (autre origine non loopback retenue, le reste journalisé, `fetch` seulement).
> G3 fait (2026-10-26) : `app.handoff` affiche le bandeau « À vous » (hors
> capture, `data-craft-ai-overlay`), met le champ en évidence et rend la main
> quand la condition tient dans l'état vivant (adresse sans ordinal + chemin,
> `equals`/`notEquals`/`exists`, ou préfixe de route), sur « C'est fait »,
> « Je ne peux pas » ou à l'expiration (5 min par défaut).
> G4 fait (2026-10-26) : points de reprise sur disque dans le log-server
> (`/sessions/checkpoints`, `<DEBUG_SESSION_DIR>/checkpoints`), outils
> `checkpoint.save/list/restore/validate/cleanup`. L'onglet capture son état
> (primitives, storage persistant, storage d'origine), rouvre un point seul
> (`?craft-resume-checkpoint=<id>`) et joue les sondes de son origine, avec
> `{{state <adresse> <chemin>}}` pour reprendre un jeton ou un id vivant. Une
> sonde rouge affiche un bandeau. **Reprendre ici** rouvre directement un point
> non expiré pris pour ce même événement sur l'app pilotée ; sinon il publie la
> demande pour l'IA. Limite : les cookies HttpOnly ne se capturent pas ; une
> valeur non JSON (Date, Map) perd sa forme dans le point.
> G5 reste à construire. Le code retiré reste lisible sur
> `claude/reprise-fonctionnelle-corrections` (`56e08a48c`) : G1 y reprend
> les heuristiques d'identité et de vivacité (`debug-session-resume-plan.ts`),
> G2 la barrière et la retenue des requêtes au démarrage
> (`debug-session-snapshot-launch.ts`), les helpers d'appels et de
> placeholders (`debug-session-resume-calls.ts`).

## Pourquoi changer

- Une reprise dépend de prérequis imprévisibles : un compte avec certains
  droits, un produit à créer avant d'ouvrir sa fiche, un workflow à faire
  avancer, un flag, une invitation. Les déclarer à l'avance coûte cher (environ
  75 lignes pour la seule démo) et reste incomplet.
- La reprise tourne souvent dans un autre environnement que l'enregistrement :
  les données de l'utilisateur n'y existent pas. Il ne s'agit pas de recharger
  un état mais de **trouver un chemin** vers un état équivalent, au cas par
  cas. C'est un travail de raisonnement, adapté à une IA.
- Ce qui reste déterministe (restaurer un état, retenir les écritures,
  recaler le temps, comparer deux états) sert d'outils à l'IA.

## Décisions prises

| Point | Décision |
|---|---|
| Qui conduit | L'IA, le plus possible : navigation, formulaires, gestes rejoués, création des données manquantes. |
| Intervention humaine | Seulement pour ce que l'IA ne peut pas avoir : identifiants, codes reçus (OTP, e-mail), informations que seule la personne connaît. L'IA rend la main sur ce champ précis, puis la reprend. |
| Durée de validité d'un point de reprise | Choisie par l'IA, avec sa justification (expiration du jeton lu dans la réponse ou le JWT, durée d'un créneau, données susceptibles de bouger). |
| Approche déclarative | Retirée (`craftResume` et tout ce qui en dépend), voir « Ce qui part ». |
| Environnements autorisés | Pas de politique imposée par le framework : chaque projet décide où il lance une reprise conduite. Les outils ne refusent aucune origine. |
| Données personnelles | Reporté. Les archives gardent ce qu'elles contiennent aujourd'hui (empreintes `craft-ref:` pour les champs sensibles). |
| Chat | À choisir : voir « Où vit le chat ». La première version suit la proposition A. |

## Le parcours vu par la personne

1. Dans le dashboard, sur un événement du replay : **Reprendre ici**.
2. S'il existe un **point de reprise valide** pour cette session et cet
   événement (sondes vertes), l'app s'ouvre directement à cet état. Fin.
3. Sinon, l'IA démarre dans le chat :
   > Point choisi : Inès (product manager) modifie le produit *Espresso* dans
   > l'administration, juste avant d'enregistrer.
   > Il faut : une session product manager, un produit simple.
   > J'ouvre l'app sur la page de connexion.
4. L'IA ouvre l'app, rejoue ce qu'elle peut, et rend la main quand il faut :
   > **À vous :** connectez-vous avec un compte *product manager*. Je reprends
   > dès que la session est ouverte.

   L'onglet de l'app affiche la même consigne dans un bandeau, avec le champ
   concerné mis en évidence. Dès que l'état attendu est atteint (session
   ouverte avec le bon rôle), l'IA reprend sans qu'on lui dise.
5. L'IA crée ce qui manque (« aucun produit *Espresso* ici : je le crée depuis
   la liste des produits »), navigue jusqu'à l'écran, remplit le brouillon avec
   les valeurs enregistrées.
6. L'IA compare l'app à l'enregistrement et dit ce qui diffère encore, puis
   fige le point :
   > Point de reprise enregistré, valide 7 h 50 (jeton expirant à 15 h 12).
   > Écarts assumés : connectée avec *ines@staging*, produit recréé (id
   > `p-9034` au lieu de `espresso`).
7. La personne reprend la main dans l'onglet ; les reprises suivantes du même
   point passent par l'étape 2.

## Architecture

```
dashboard ── « Reprendre ici » ──► log-server (demande de reprise)
                                        │
IA (hôte MCP) ◄── log-mcp : lire la session, la cible, l'état, les points
      │
      └── function-registry-mcp : conduire l'onglet (page, registry.*)
                                        │
                     onglet de l'app ◄──┘  barrière d'écriture, bandeau « À vous »
```

L'IA tourne dans l'hôte de l'utilisateur (Claude Code, Codex…) avec deux
serveurs MCP ; le dashboard ne contient pas de modèle. **Reprendre ici** publie
une demande de reprise au log-server et ouvre le chat de l'hôte (ou copie
l'invite) ; l'IA la lit avec `resume.request`.

## Outils

### Déjà là

| Outil | Serveur | Usage dans la reprise |
|---|---|---|
| `page` (lecture des contrôles nommés, `act` : goto, fill, click, press) | function-registry-mcp | conduire l'onglet |
| `registry.list`, `registry.get` | function-registry-mcp | lire l'état vivant |
| `registry.call` | function-registry-mcp | appeler une méthode (créer un produit sans passer par le formulaire) |
| `registry.restore`, `registry.*.update` | function-registry-mcp | poser une valeur restaurée |
| `registry.logs`, `logs.search` | function-registry-mcp, log-mcp | lire erreurs et requêtes |
| `sessions.compare` | log-mcp | comparer deux sessions |

### À ajouter dans log-mcp (lecture seule)

| Outil | Rôle |
|---|---|
| `resume.request` | la demande en cours : session, participant, événement, environnement cible |
| `session.story` | le récit au niveau des intentions jusqu'au point choisi : gestes (racines d'invocation), appels serveur et leurs statuts, navigations, erreurs ; pas les événements bruts |
| `session.target` | l'état au point choisi : route, primitives significatives, storage utile (le snapshot actuel, résumé) |
| `session.prerequisites` | ce dont le point dépend, déduit sans déclaration : identité active (lue dans les réponses et l'état), session encore ouverte ou non, entités affichées (ids lus dans les réponses, la route, l'état), tâches en attente |
| `session.recordedCall` | la réponse enregistrée d'un appel donné, pour recopier des valeurs |

`session.prerequisites` reprend les heuristiques déjà écrites
(`resolveRecordedIdentity`, la vivacité d'une ressource), sans les
déclarations : l'IA confirme ou corrige leur lecture.

### À ajouter dans function-registry-mcp (conduite)

| Outil | Rôle |
|---|---|
| `app.launch(sessionId, beforeSequence?)` | ouvre l'app sur le snapshot du point choisi (« Déboguer ici » sans le dashboard comme ouvreur : le snapshot est servi par le log-server en loopback) ; sans `beforeSequence`, ouvre l'app vierge |
| `app.replay(invocation, args?)` | rejoue un geste enregistré (registre des méthodes rejouables) avec des arguments adaptés |
| `app.diff(sessionId, beforeSequence)` | écarts entre l'état vivant et l'état enregistré : route, primitives, avec ce qui est équivalent et ce qui manque |
| `app.handoff(message, { field?, until })` | affiche le bandeau « À vous » dans l'onglet, met le champ en évidence, attend que la condition `until` soit vraie (prédicat sur l'état, par exemple « `currentSession.user.role == 'product-manager'` »), puis rend la main à l'IA ; expire avec un message |
| `app.writes()` | ce que la barrière a laissé passer ou retenu, et les entités créées pendant la reprise |
| `checkpoint.save(label, { ttlMs, reason, probes })` | fige le point : snapshot vivant, storage, cookies du domaine de l'app, entités créées, environnement, durée et sa justification, sondes de validité |
| `checkpoint.list`, `checkpoint.validate`, `checkpoint.restore` | retrouver, vérifier (sondes), rouvrir un point sans IA |
| `checkpoint.cleanup(id)` | supprimer ce que le point a créé, quand il expire ou sur demande |

## Point de reprise

```ts
interface ResumeCheckpoint {
  id: string;
  sessionId: string;
  beforeSequence: number;
  environment: { origin: string; backendVersion?: string; dataset?: string };
  createdAt: string;
  expiresAt: string;              // choisi par l'IA
  ttlReason: string;              // « jeton expirant à 15 h 12 »
  snapshot: DebugAppSnapshot;     // état vivant au moment du gel
  browser: { localStorage; sessionStorage; cookies };  // de l'origine de l'app seulement
  created: { kind: string; id: string; cleanup?: ProbeCall }[];
  probes: ProbeCall[];            // rejoués avant chaque restauration
  deviations: string[];           // « connectée avec ines@staging », « produit recréé »
}

type ProbeCall = { call: string; input?: unknown; expect: { status?: number; match?: string[] } };
```

- **Validité** : un point est utilisable si `expiresAt` n'est pas passé, que
  l'environnement est le même, et que toutes les sondes répondent comme
  attendu (le jeton est accepté, le produit existe encore). Sinon l'IA est
  rappelée avec le point comme base : elle répare au lieu de tout refaire.
- **Stockage** : dans le log-server, à côté de la session, hors git. Le point
  contient un jeton de session de test : il ne sort jamais de la machine.

## Garde-fous (indépendants de l'IA)

- **Environnement** : laissé au projet (voir « Décisions prises »).
- **Barrière d'écriture** : l'onglet repris garde la barrière actuelle, en mode
  « IA ». Les écritures vers l'app sous test passent et sont journalisées
  (`app.writes`). Les appels vers des tiers (paiement, e-mail, SMS) et les
  actions irréversibles déclarées par l'app sont retenus et demandent un
  accord humain explicite.
- **Identifiants** : l'IA ne lit ni ne tape jamais un mot de passe ou un code ;
  `page act fill` refuse un champ `password`, `one-time-code` ou marqué
  sensible. C'est `app.handoff` qui rend la main.
- **Nettoyage** : tout ce que la reprise a créé est listé dans le point et
  supprimable (`checkpoint.cleanup`).
- **Trace** : la conversation, les outils appelés et les écarts assumés sont
  rattachés au point de reprise.

## Ce qui part

- `craftResume`, `withResume`, `craftResumeResource`, les types associés, le
  champ `resume` des primitives et du registre (`libs/core`).
- Les déclarations de la démo (`shop-state.ts`, `store-pages.ts`,
  `admin-page.ts`).
- Le planificateur, la description, le manifeste, le pré-vol déclaratif,
  l'exécuteur et les classes de fidélité
  (`debug-session-resume-plan|protocol|manifest|preflight|executor|runtime|resources|calls|path`),
  et leur branchement dans le pont et le dashboard (panneau de plan,
  pré-vol, rapport, surcharges du profil).
- `resume-check`, l'extraction statique des déclarations et
  `checkResumeGraph` dans `libs/dev-tools`.
- Les outils `resume_*` de log-mcp et les routes `resume-assistant` du
  log-server, remplacés par les outils ci-dessus.
- Les e2e `resume.spec.ts` S1 à S6 sous leur forme actuelle.

## Ce qui reste (après G0)

- La restauration d'un snapshot d'app (« Déboguer ici ») et le registre des
  méthodes rejouables : ce sont les raccourcis de l'IA.
- Le runtime temporel du cœur (`restorePendingTasks`,
  `SuspendableCraftTemporalRuntime`) et le runtime aléatoire.
- Les empreintes `craft-ref:` dans l'archive (format v7), la provenance (C6)
  et le redacteur qui remplace un champ sensible par une empreinte de session.
- La capture XHR, les checkpoints du storage navigateur.
- Les corrections indépendantes de la reprise : synchronisation du panier
  serveur par mutation, déconnexion qui atteint le serveur, snapshot qui vide
  une primitive remise à `undefined`, faux liens `calls` du graphe, liens
  « écrit » vers les states, magasin isolé par `CRAFT_DEMO_ECOMMERCE_STORE`.
- Le garde-fou `library-boundaries` : aucune source de `libs/` ne connaît la
  démo.

Retirés en G0 bien qu'utiles plus tard, à reprendre depuis `56e08a48c` :
la barrière réseau et la retenue des requêtes au démarrage (G2, en mode IA),
le réarmement des tâches dans l'onglet lancé (G2, `app.launch`), les
heuristiques d'identité et de vivacité (G1, `session.prerequisites`). Le
bouton « Reprendre ici » du dashboard revient avec G1 (il publiera la demande
de reprise).

## Lots

| Lot | Contenu | Sortie |
|---|---|---|
| **G0** ✓ | Retirer l'approche déclarative (« Ce qui part »), garder « Ce qui reste » | build, specs et e2e d'historique verts ; `libs/` sans `craftResume` |
| **G1** ✓ | Lecture : `resume.request`, `session.story`, `session.target`, `session.prerequisites`, `session.recordedCall` | sur les archives S1-S6, le récit et les prérequis sont corrects (tests sur archives figées) |
| **G2** ✓ | Conduite : `app.launch` sans ouvreur, `app.replay`, `app.diff`, barrière en mode IA, refus des champs sensibles dans `page act fill` | un script de test (sans modèle) mène S1 jusqu'au point et `app.diff` est vide |
| **G3** ✓ | Passage de main : `app.handoff` (bandeau, champ, condition, expiration) | le script attend une connexion humaine simulée et reprend seul |
| **G4** ✓ | Points de reprise : `checkpoint.*`, sondes, validité, nettoyage ; **Reprendre ici** rouvre un point valide | un point S2 se rouvre sans IA ; une sonde rouge (produit supprimé) le déclare invalide |
| **G5** | Invite et méthode pour l'IA : prompt de reprise (lire, proposer, conduire, rendre la main, vérifier, figer, choisir la durée), skill pour l'hôte | une IA réelle mène S1 et S2 de bout en bout avec une seule intervention humaine (la connexion) |

G1 et G2 sont indépendants ; G3 et G4 s'appuient sur G2 ; G5 vient en dernier.

## Tester sans modèle

Les outils sont testés seuls (archives figées, onglet de démo). Le parcours
complet est testé par un **script d'IA simulée** : une suite fixe d'appels
d'outils, telle qu'une IA les ferait, qui doit atteindre un `app.diff` vide.
Une IA réelle n'intervient que dans un test manuel documenté (G5).

## Où vit le chat : propositions

| | A. L'hôte de l'IA | B. Un chat dans le dashboard | C. L'hôte, avec un fil dans le dashboard |
|---|---|---|---|
| Principe | Claude Code, Codex… avec log-mcp et function-registry-mcp. **Reprendre ici** publie la demande et copie l'invite. | Un panneau de chat dans le dashboard, branché à un modèle (le webhook « send context » ou une API). | Comme A, plus un outil `resume.say` : l'IA écrit ses étapes, le dashboard les affiche, à côté du bandeau « À vous » de l'onglet. |
| Pour | Rien à héberger ; l'IA a déjà tous les outils ; marche aujourd'hui. | Tout se passe au même endroit ; pas de copier-coller. | On suit la reprise depuis le replay sans quitter le dashboard. |
| Contre | On jongle entre deux fenêtres. | Il faut un modèle avec appel d'outils côté dashboard, des clés, une boucle d'agent à écrire. | Un aller-retour de plus par message. |
| Coût | faible | élevé | moyen |

Proposition : **A maintenant**, **C ensuite** si le va-et-vient gêne, **B** seulement si on veut une reprise sans hôte IA installé.

## Questions ouvertes

1. **Actions irréversibles** : faut-il une déclaration légère côté app
   (« ce bouton paie ») ou suffit-il de retenir les appels vers d'autres
   origines ? La première version retient les écritures vers une autre
   origine et journalise les autres.
