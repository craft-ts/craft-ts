# Reprise fonctionnelle : corrections après revue

Suite de `2026-10-24-reprise-fonctionnelle.md`. La revue du 2026-10-25 du
commit `e109372d8` (branche `codex/reprise-fonctionnelle`) a trouvé des écarts
entre ce que la reprise annonce et ce qu'elle fait. Ce plan les corrige, sur
la même branche.

> **Statut.** Plan. Rien n'est corrigé.

## Constats à corriger

Vérifiés en exécutant les e2e S1, S2, S3 dans une copie de la branche, avec
une instrumentation jetable des connexions des onglets repris.

| # | Constat | Gravité |
|---|---|---|
| 1 | La persona est fixée dans la déclaration (`persona: 'product-manager'`) : S2 (Léo) et S3 (Camille) se reconnectent en Inès ; en S3 l'interface affiche Camille, le serveur voit Inès, le rapport dit « real » | bloquant |
| 2 | Le planificateur crée une acquisition pour chaque `provides`, que la ressource soit vivante ou non au point ciblé ; en S3, quatre `auth.me` partent avec le jeton de substitution `craft-ref:…` et reçoivent 401 | bloquant |
| 3 | `expect`, `onMismatch` et `cleanup` ne sont jamais exécutés ; un échec non bloquant donne la classe « assisted » ; le premier échec bloque toutes les étapes suivantes | bloquant |
| 4 | Les e2e ne prouvent ni la reconnexion (ancien jeton toujours valide), ni l'identité côté serveur ; ils écrivent dans `data/store.json`, commité avec 12 commandes de test | bloquant |
| 5 | `debug-session-resume-manifest.ts` code en dur des ids de la démo ; la barrière ne reconnaît que les fonctions serveur craft | majeur |
| 6 | L'API de déclaration n'est pas typée et oblige la démo à des `let` réassignés, `ɵRAW_REACTIVE_VALUE`, `as unknown as`, une variable partagée `reacquiredSession`, un `calls` taillé pour S1 | majeur |
| 7 | Le graphe crée des faux liens `calls` (`cartCount` → `ecommerce.cart.addLine`) : lire un état est traité comme appeler ses méthodes | majeur |
| 8 | La provenance ne descend pas dans le JSON encodé deux fois (login : `refs: 0`), ignore les ids numériques, et prend des descriptions ou des slugs pour des références | majeur |
| 9 | Code mort, libellés, couverture de tests, statut du plan surévalué | mineur |

**Reporté volontairement** : masquage des secrets (jetons en clair dans les
archives, `captureSensitiveInputValues` dans la démo, ressource acquise relayée
par `postMessage`). Tout reste local pour l'instant. Le lot C8 corrige la
provenance sans chercher à masquer.

## Principe d'ordre

On écrit d'abord les e2e qui échouent pour les bonnes raisons (C1), puis on
les fait passer. Aucun lot ne se termine sans que le rapport de fidélité et
l'état réel de l'app soient d'accord.

## C1 — Des e2e qui prouvent la reprise

À faire en premier : ils doivent devenir rouges sur les constats 1 à 3.

1. **Store isolé.**
   - `createStoreLayer` lit le chemin dans `ECOMMERCE_STORE_PATH` quand il est
     défini (`apps/demo-ecommerce/src/server/database.ts`).
   - `playwright.resume.config.ts` le pointe vers une copie temporaire par
     run.
   - `data/store.json` sort du suivi git (ajouté à `.gitignore`) et se crée
     depuis `initialStore` au premier démarrage. Les 12 commandes de test
     disparaissent du dépôt.
2. **Sessions révoquées entre enregistrement et reprise.** Route de dev
   `POST /__dev/auth/revoke-all` dans le middleware Vite, active seulement si
   `CRAFT_E2E=1`, qui vide la table des sessions de `auth.ts`. Chaque scénario
   l'appelle juste avant « Reprendre ici ».
3. **Identité vérifiée côté serveur.** Chaque scénario capture la réponse de
   `ecommerce.auth.me` dans l'onglet repris (en-tête `x-craft-function-id`) et
   vérifie que le rôle et l'id sont ceux de l'enregistrement.
4. **Aucune requête avec un jeton de substitution.** Chaque scénario échoue si
   une requête de l'onglet repris contient `craft-ref:` dans son corps ou ses
   en-têtes.
5. **Classe de fidélité lue sur un attribut**, `data-fidelity="real"`, plus sur
   un libellé.
6. **Deux scénarios de plus :**
   - **S4** : Léo est déjà connecté au début de l'enregistrement (identité
     tirée du snapshot, aucun login dans l'archive) ; la reprise doit le
     reconnecter en Léo.
   - **S5** : Léo se déconnecte avant le point ciblé ; la reprise ne doit
     faire aucune acquisition de session.

**Sortie :** S1 vert, S2, S3 et S4 rouges sur l'identité, S3 rouge sur
`craft-ref:`, S5 rouge sur l'acquisition inutile.

## C2 — Identité de reprise

Le plan est construit dans le dashboard (`replay-debug.ts`, à partir des
déclarations sérialisées) : l'identité doit donc s'exprimer en données, pas en
fonction.

1. **Déclaration.** Nouveau champ `identity: { role: '<chemin>', id?: '<chemin>' }`
   sur une déclaration `holds` ou `requires`. Exemples dans la démo :
   `currentSession` → `{ role: '$.user.role', id: '$.user.id' }`,
   `currentUser` → `{ role: '$.role', id: '$.id' }`. Le booléen `identity: true`
   disparaît.
2. **Planificateur** (`debug-session-resume-plan.ts`) : nouvelle fonction pure
   `resolveRecordedIdentity(archive, targetElapsedMs, declarations)`. Elle
   prend, par ordre de priorité, la dernière valeur connue avant le point
   ciblé :
   1. la réponse enregistrée d'une primitive `requires` avec `identity` ;
   2. la valeur de la primitive `holds` avec `identity` dans le dernier
      checkpoint ;
   3. le storage restauré, si la primitive `holds` est persistée.
3. **Choix de la persona** : celle dont `role` (et `id` s'il est connu)
   correspond. `persona` dans une déclaration `provides` devient une valeur par
   défaut, utilisée seulement pour une ressource sans identité (le panier
   invité).
4. **Problèmes bloquants** : `identity-unknown` (aucune source d'identité),
   `persona-missing` (aucune persona pour ce rôle). La « reprise assistée »
   (connexion avec un autre rôle + surcharges) reste une option explicite du
   dashboard, jamais un repli silencieux.
5. **Vérification à l'exécution.** Après une acquisition, l'exécuteur relit la
   source d'identité en vrai et compare rôle et id à l'enregistrement. Un
   écart donne une étape `blocked` avec le code `identity-mismatch`.
6. **Dashboard** : le plan affiche « Connexion en tant que Camille (admin) —
   identité enregistrée : admin, depuis `currentUser` ».
7. **Démo** : retirer `persona: 'product-manager'` de `signInProcess`.

**Specs :** identité depuis `auth.me`, depuis le snapshot seul (S4), depuis
le storage ; rôle sans persona ; deux identités successives dans la session
(la dernière avant le point ciblé gagne).
**Sortie :** S2 se reconnecte en Léo, S3 en Camille, S4 en Léo, vérifié par
`auth.me`.

## C3 — Ressources vivantes et jetons de substitution

1. **Vivacité** au point ciblé, dans le planificateur :
   - vivante si une primitive `holds` a une valeur non vide dans le dernier
     checkpoint, ou si la dernière réponse d'une primitive `requires` a
     réussi ;
   - morte si une primitive `revokes` a été appelée après.
   - Ressource morte : ni acquisition, ni substitution, ni relecture ; la
     ligne apparaît dans le plan comme « non nécessaire ».
2. **Pas de requête avant substitution.** Tant que la table de substitution
   n'est pas complète, la barrière met en attente (sans demander à
   l'utilisateur) toute requête qui contient `craft-ref:`. Une fois la
   substitution faite, elle remplace chaque `craft-ref:<empreinte>` par la
   nouvelle valeur de la ressource correspondante, puis envoie la requête.
   Sans correspondance, la requête est refusée et l'étape signalée.
3. **Démo** : supprimer le contournement `reacquiredSession` dans le loader de
   `currentUser`, devenu inutile.

**Specs :** vivacité (valeur gardée, `revokes` après, `requires` en échec) ;
réécriture d'une requête en attente ; refus d'une requête sans
correspondance.
**Sortie :** S5 sans acquisition ; S3 sans aucune requête `craft-ref:` ni
401.

## C4 — Évaluation des écarts

1. **Observation des résultats.** Pendant les étapes et jusqu'à
   `RESUME_OBSERVATION_MS` (5 minutes) après la prise en main, la barrière
   relève le statut et le corps décodé de chaque appel listé dans
   `expectedOutcomes`, et envoie `resume-outcome` au dashboard. C'est ce qui
   permet de constater le 403 de S1, qui arrive après le geste de
   l'utilisateur.
2. **Comparaison** : statut, plus les chemins `match` de la réponse,
   avec le résultat enregistré.
3. **`onMismatch`** :
   - `abort` : étape `blocked`, puis nettoyage ;
   - `recorded` : la réponse enregistrée est servie (seulement pendant la
     fenêtre de barrière), étape `recorded` ;
   - `degraded` : étape `drifted`, avec le détail.
4. **Statuts et classes revus** dans `debug-session-resume-executor.ts` :

   | Statut d'étape | Effet sur la classe |
   |---|---|
   | `conformant` | aucun |
   | `drifted` (dérive tolérée) | aucun, listé dans les avertissements |
   | `skipped` (non bloquante en échec) | aucun, listé dans les avertissements |
   | `overridden` (surcharge, décision humaine sur un appel retenu) | **assistée** |
   | `recorded` | **partiellement simulée** |
   | `blocked` | **refusée** |

   Le rapport gagne une liste `warnings`.
5. **Dépendances.** Chaque étape porte `dependsOn` (les étapes de la même
   ressource dépendent de son acquisition, les relectures de leurs
   substitutions). Un échec ne bloque que ses dépendantes ; le reste continue.
6. **Retry** pour les échecs techniques (réseau, 5xx) : deux nouvelles
   tentatives, délai 250 ms puis 1 s, via le runtime temporel.
7. **Nettoyage** : en cas d'abandon, les `cleanup` des acquisitions réussies
   sont appelés dans l'ordre inverse ; `adapter.cleanup` est branché dans
   `debug-session-resume-runtime.ts`. Démo : `cleanup` de la session
   (déconnexion) et du panier (suppression).

**Specs :** les trois politiques, propagation par dépendances, retry,
nettoyage, table des classes.
**Sortie :** S1 rapporte « 403 attendu, 403 obtenu » ; un produit supprimé
après le pré-vol donne `blocked` et déclenche le nettoyage.

## C5 — Graphe : supprimer les faux liens

1. Dans `dependency-graph.ts`, une lecture (`yield* cartLines()`) ne produit
   que `depends-on`. Une relation `calls` ou `writes` n'est créée que pour un
   membre réellement invoqué (`cartLines.add(...)`, `currentSession.open(...)`).
2. Fixture ts-morph qui reproduit `cartCount`, et assertion d'architecture sur
   la démo : aucun `craftComputed` n'a de relation `calls` vers une fonction
   serveur.

**Sortie :** `resumeChainOf(cartCount)` ne contient plus `ecommerce.cart.addLine`.

## C6 — Provenance correcte (sans masquage)

Dans `debug-session-references.ts` :

1. **JSON imbriqué** : une chaîne qui se décode en objet ou tableau JSON est
   parcourue récursivement (profondeur maximale 3). La réponse de login
   produit alors ses `refs`.
2. **Chemins déclarés toujours suivis**, quel que soit le type : un `path` de
   déclaration rend la valeur traçable même numérique (`cartId: 4242`).
3. **Moins de faux positifs** : un texte avec des espaces n'est jamais une
   référence ; une valeur faite uniquement de mots séparés par des tirets
   (slug) ne l'est que si son champ est un identifiant (`id`, `*Id`, `*_id`)
   ou un chemin déclaré.
4. **Noms de champs** : reconnaître `*Token`, `*_token`, `*Secret`, `*_secret`
   en camelCase et snake_case, pour la provenance.

**Specs :** les cas de la revue (JWT dans `access_token` et `accessToken`,
id numérique déclaré, description, slug, JSON encodé deux fois).
**Sortie :** sur S1, la provenance relie le jeton de la réponse
`ecommerce.auth.login` à `atelier.session.v1` ; aucune description de produit
n'est remplacée dans l'archive.

## C7 — Sortir la démo de la lib

1. **Manifeste générique.** Nouveau champ de déclaration (données)
   `entities: [{ kind: 'product', path: '$.products[*].id' }]` sur les queries
   et mutations. `buildDebugSessionResumeManifest` ne lit plus que les
   déclarations : plus aucun id de fonction en dur.
2. **Entités requises** = celles présentes dans les valeurs restaurées au
   point ciblé ; les autres entités vues deviennent « attendues ». Un produit
   du catalogue sans rapport avec l'état ne bloque plus la reprise.
3. **Identité d'appel générique** dans la barrière et dans `calls` :
   l'id de fonction serveur pour le protocole craft, sinon
   `MÉTHODE /gabarit` (gabarits du lot 1, `/carts/:ref`).
4. **Lectures autorisées par défaut** : `GET` et `HEAD` vers l'origine de l'app
   ou une origine déclarée passent en direct ; les autres méthodes non prévues
   sont retenues.
5. **Pré-vol** : vérification locale qu'une persona existe pour chaque rôle
   requis, en plus de l'adaptateur backend.
6. **Garde-fou** : un test d'architecture échoue si une source de `libs/`
   contient un identifiant de la démo (`ecommerce.`, `atelier`).

**Sortie :** `libs/component` ne contient plus aucun identifiant de la démo ;
S1 à S5 toujours verts.

## C8 — Déclarations sans contournements

La forme finale de l'API reste à décider. Ce lot ne retire que ce qui force
des contournements.

1. **Accès à la primitive.** `craftResume` accepte une fabrique qui reçoit la
   primitive à laquelle la déclaration est attachée :
   `craftResume((self) => ({ role: 'holds', read: () => self(), write: (v) => self.set(v) }))`.
   Sans `read` / `write`, `holds` et `restores` utilisent la valeur de la
   primitive elle-même et `path` pour la substitution : le cas courant ne
   demande aucun code.
2. **Ressource typée.** `resource` accepte un `craftResumeResource<Name, Value>` ;
   `acquire`, `read`, `write` sont typés par `Value`. La chaîne reste acceptée
   le temps de la migration.
3. **Options de `state` sans détection de forme.** Un marqueur
   `withResume(declaration)`, accepté en dernière position quel que soit le
   nombre d'insertions, remplace la détection « dernier objet avec une clé
   `resume` ».
4. **Démo nettoyée** : plus de `let` réassignés, plus de `ɵRAW_REACTIVE_VALUE`,
   plus de `as unknown as` dans les déclarations, plus de
   `calls: ['ecommerce.product.save']` sur `currentSession`.
5. **Tests de types** (`libs/test-type`) : `write` refuse une valeur du mauvais
   type ; un `path` inexistant ne compile pas.

**Sortie :** le code de reprise de `shop-state.ts` tient en déclarations
courtes (cible : moins de 40 lignes ajoutées par rapport à la version sans
reprise).

## C9 — Mineurs

- `decideResumeCall` : utilisé par la barrière (une seule source de décision)
  ou supprimé ; l'option `unattended` branchée (blocage au lieu de retenue).
- Expiration des appels retenus via le runtime temporel, pour qu'elle gèle
  avec l'horloge pendant les pauses.
- Libellés en français (« réelle », « assistée »…).
- Limite documentée : l'approbation « humaine » repose sur l'en-tête `Origin`,
  qu'un processus local peut forger.
- Tests ajoutés sur les modules peu couverts : provenance, exécution réelle,
  manifeste, capture XHR.
- Statut du plan initial corrigé : retirer « les valeurs restent hors
  archive » et ce qui n'est pas vrai.
- Un commit par lot.

## Ordre et dépendances

```
C1 ──► C2 ──► C3 ──► C4
              │
C5 ───────────┤
C6 ───────────┤
              ▼
             C7 ──► C8 ──► C9
```

C5 et C6 sont indépendants de C2 à C4. C7 s'appuie sur les gabarits et
chemins de C6. C8 touche les mêmes fichiers de démo que C2 et C3 : il passe
après eux.

## Critère de fin

- S1 à S5 verts, avec identité vérifiée côté serveur, sessions révoquées avant
  la reprise, aucune requête `craft-ref:`, store isolé.
- Le rapport de fidélité d'une reprise volontairement faussée (persona d'un
  autre rôle, produit supprimé, surcharge) n'est jamais « réelle ».
- `libs/` ne contient aucun identifiant de la démo.
