# Server functions — V2, frontière client

> Plan d'implémentation, tenu à jour au fil de la réalisation.
> Prolonge [2026-08-18-server-function-middleware.md](./2026-08-18-server-function-middleware.md).

## Contexte

Le V1 a livré le middleware onion **serveur uniquement**, les erreurs taguées
bout-en-bout, la permission fail-closed et le graphe d'architecture. Il
repoussait explicitement à une V2 tout ce qui touche à la frontière client :
middleware client, canal de contexte, transport versionné, et la réécriture de
`requireClientDI` (jusqu'ici un marqueur purement déclaratif qui ne transportait
aucune valeur du navigateur vers le serveur).

Le besoin concret existait déjà dans la démo : le composant lisait `CurrentUser`
côté client puis recopiait **à la main** `userId: authenticatedUser.id` dans
l'input de la server function, avant que le middleware serveur `matchingUser` ne
revérifie cette valeur contre la vraie session. Cette V2 formalise ce pattern.

Deux explorations préalables ont contraint le design :

1. le core (`@craft-ts/core`) n'a **aucune** dépendance runtime sur `effect`
   (peer dependency type-only) — contrainte du V1, reconduite ;
2. dans `craft-resource.ts`, **seul `params()` est une dépendance réactive
   suivie** (le loader tourne dans un `untracked`). Ça écarte tout tracking
   caché pour `requireClientDI`.

## Décisions figées

| Sujet | Décision |
|---|---|
| Modèle d'exécution du middleware client | **Générateur craft nu** (`.client(run)` où `run` est `function* ({ input, context, next })`), drivé par la **pompe asynchrone** de craft (`executeGeneratorCompatibleFactoryAsync`) — même famille que les guards. Un `yield*` d'Effect reste possible si le pont est installé ; le core reste Effect-free au runtime. |
| Où vit `.client(...)` | **Même builder** `craftMiddleware(id)`, second terminal à côté de `.server(run)`, kind `'client-function-middleware'`. `.use(...)` refuse de mélanger les deux familles, au terminal. |
| Convention de nommage | **`*.mw-client.ts`**, symétrique à `*.mw-serveur.ts`. Hors convention → diagnostic misnamed. |
| Portée de `requireClientDI` | **Seul `mode: 'snapshot'`.** `reactive`/`cancel-on-change` restent dans `ClientDIRequirementMode` pour la doc, mais la signature ne les accepte pas — les simuler demanderait un tracking caché dans le loader. |
| Deux mécanismes complémentaires | `requireClientDI(token, { key, schema })` pour le cas simple (un token, zéro fichier), `craftMiddleware(id).client(...)` pour la composition. Les deux s'attachent par `clientContext([...])` sur la façade. |
| Comment le serveur déclare ce qu'il attend | `.clientContext(schema)` sur un middleware **serveur**, et/ou `{ clientContext: schema }` sur `serverFunction(...)`. Fusion identique à celle des schémas d'input. Le serveur n'importe **jamais** un `*.mw-client.ts`. |
| Transport | `context?: unknown` et `protocolVersion?: 1` sur `ServerFunctionRequest`. Absence des deux = format historique `{ id, input }`, inchangé. |
| Confiance | `context` validé par schéma côté serveur, jamais fusionné dans le `context` de confiance : il atterrit dans un champ distinct, `clientContext`, sur `ServerFunctionHandlerContext` **et** sur le contexte d'exécution des middleware serveur. |
| Middleware globaux | `createServerFunctionFactory(defaultServerMiddlewares)`, sucre serveur uniquement. |
| Où vit un middleware client | `*.mw-client.ts` pour ce qui est réutilisable, **et à même le `*.fn-client.ts`** pour un usage unique : une façade est déjà un module navigateur, déjà tenue à l'écart du bundle serveur, et c'est là que le contexte d'injection est disponible sans cérémonie. |
| Correspondance des deux côtés | **`craftHandshake(name, schema?)`** : un nom déclaré une fois dans un module partagé, référencé par les deux côtés, vérifié par `assertCraftHandshake`. |

## API livrée

```ts
// users/request-audit.mw-serveur.ts — le serveur déclare la FORME attendue
export const auditedRequest = craftMiddleware('demo.request-audit')
  .clientContext(
    Schema.toStandardSchemaV1(
      Schema.Struct({ requestedBy: Schema.String, locale: Schema.String }),
    ),
  )
  .server(({ clientContext, next }) =>
    Effect.gen(function* () {
      yield* Effect.log(`requestedBy=${clientContext.requestedBy}`);
      return yield* next({ context: { requestLocale: clientContext.locale } });
    }),
  );

// client/request-context.mw-client.ts — le navigateur la remplit
export const requestedByContext = craftMiddleware('demo.requested-by')
  .provides(requestedBySchema)
  .client(function* ({ next }) {
    const session = yield* ClientSession();
    return yield* next({ context: { requestedBy: session.userId } });
  });

export const requestContext = craftMiddleware('demo.request-context')
  .use(requestedByContext)
  .provides(localeSchema)
  .client(function* ({ next }) {
    const session = yield* ClientSession();
    return yield* next({ context: { locale: session.locale } });
  });

// shared/claimed-user-id.ts — le cas simple, déclaré une seule fois
export const ClaimedUserId = new InjectionToken<string>('demo/ClaimedUserId');
export const claimedUserId = requireClientDI(ClaimedUserId, {
  mode: 'snapshot',
  key: 'userId',
  schema: Schema.toStandardSchemaV1(Schema.String),
});

// users/authenticated-list.fn-serveur.ts
export const getAuthenticatedUsers = serverFunction(/* … */)
  .pipe(claimedUserId)
  .use(matchingUser)     // revérifie clientContext.userId contre la session
  .use(auditedRequest)
  .handler(({ input, context, required }) => /* required(ClaimedUserId) */);

// users/authenticated-list.fn-client.ts
export const getAuthenticatedUsers =
  createServerFunctionClient<typeof ServerGetAuthenticatedUsers>(
    craftUnique('demo.users.authenticated-list'),
    clientContext([claimedUserId, requestContext]),
  );
```

Côté fil :

```ts
type ServerFunctionRequest = {
  readonly id: string;
  readonly input: unknown;
  readonly context?: unknown;   // sorties des middleware/pipes client, fusionnées
  readonly protocolVersion?: 1; // absent = legacy, toujours accepté
};
```

## Étapes d'implémentation

### Étape 1 — Middleware client dans le core

- [x] `.client(run)` sur `CraftMiddlewareBuilder`, kind `'client-function-middleware'`.
- [x] `MergeSchemaOutputs`/`MergeSchemaInputs`/`OverwriteContext` et les brands
      `MiddlewareResult`/`MiddlewareDownstreamError` extraits dans
      `middleware-schema-shared.ts`, avec `flattenMiddlewareGraph` générique.
- [x] `runClientMiddlewareChain` (oignon, générateur) et
      `runClientMiddlewareChainAsync` (pompe async) dans
      `client-function-middleware.ts` — aucune dépendance ajoutée au bundle client.
- [x] Un terminal refuse une dépendance de l'autre famille.

### Étape 2 — `requireClientDI` fonctionnel (mode snapshot)

- [x] Signature restreinte à `mode: 'snapshot'` ; les deux autres modes
      documentés comme repoussés, avec le pourquoi, dans le docstring.
- [x] `createServerFunctionClient(id, clientContext([...]))` lit les tokens dans
      le DI navigateur **avant toute suspension** et construit le contexte.
- [x] `required(token)` d'un pipe client résout depuis le contexte client
      validé, plus depuis `runtime.resolve`.

### Étape 3 — Transport et validation

- [x] `ServerFunctionRequest` gagne `context?`/`protocolVersion?`.
- [x] Le transport envoie `context` uniquement quand la fonction en attend un.
- [x] Canal `clientContext` sur le contrat et sur les middleware serveur,
      fusionné comme `collectMiddlewareSchemas` le fait pour l'input.
- [x] `createServer().invoke` valide le contexte reçu, code
      `CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID` (HTTP 400), distinct de
      l'input invalide.
- [x] Rétrocompatibilité : une requête sans `context` fonctionne pour toute
      fonction sans pipe/middleware client. Une version de protocole inconnue
      est refusée (`CRAFT_SERVER_FUNCTION_PROTOCOL_UNSUPPORTED`).

### Étape 4 — `createServerFunctionFactory`

- [x] `createServerFunctionFactory(defaultServerMiddlewares)` renvoie un
      `serverFunction` pré-équipé, appliquant `.use(...)` dans l'ordre.

### Étape 5 — Graphe et règles d'architecture

- [x] Node kinds `client-function-middleware` /
      `client-function-middleware-misnamed`, `collectClientFunctionMiddlewares`,
      arêtes `client-middleware-uses` et `client-middleware-attached`.
- [x] `..._CLIENT_MIDDLEWARE_NAMING_CONVENTION_MISSING`,
      `..._CLIENT_MIDDLEWARE_DUPLICATE_ID`, `..._CLIENT_MIDDLEWARE_CYCLE`,
      `..._CLIENT_MIDDLEWARE_IMPORTED_BY_SERVER` (l'inverse du garde-fou V1).
- [x] Diagnostic best-effort `..._CLIENT_CONTEXT_UNUSED`, documenté comme
      heuristique dans son propre message.
- [x] `architecture-graph.spec.ts` : cas heureux + chaque diagnostic.

### Étape 7 — `craftHandshake`

> Ajoutée après coup, en réponse à deux constats : `craftUnique` était détourné
> côté façade, et la correspondance client/serveur des schémas reposait sur une
> heuristique.

- [x] `craftHandshake(name)` / `craftHandshake(name, schema)` dans le core,
      avec le brand type-only et le nom lisible au runtime quand il porte un
      schéma (les messages d'erreur de contexte client le nomment).
- [x] `createServerFunctionClient` accepte un handshake comme identité — les
      deux côtés passent alors la **même valeur**, donc l'égalité des ids est
      tenue par TypeScript, pas rattrapée par le graphe.
- [x] Nœud de graphe `handshake`, avec les fichiers qui le référencent classés
      par côté d'après leur suffixe.
- [x] `assertCraftHandshake` : `CRAFT_HANDSHAKE_MISSING_COUNTERPART`,
      `CRAFT_HANDSHAKE_NOT_STATIC`, `CRAFT_HANDSHAKE_DUPLICATE_NAME`.
- [x] `findServerFunction` / `findClientIdentity` lisent l'id à travers un
      handshake ; la règle ESLint `server-function-client-match` aussi, en
      suivant l'import.
- [x] Démo : la famille `authenticated-list` passe aux handshakes (identité +
      les deux fragments de contexte client) ; `list` reste sur `craftUnique`,
      pour que les deux orthographes restent exercées.

### Étape 6 — Démo et documentation

- [x] `server-function-demo.ts` : le spread manuel `userId` a disparu ;
      l'identité annoncée passe par `requireClientDI` et `matchingUser` la
      confronte à la session via `clientContext.userId`.
- [x] Exemple `*.mw-client.ts` composé : deux middleware, une dépendance
      `.use(...)`, deux champs publiés.
- [x] README de la démo : section « Client context », `.clientContext(...)` sur
      le middleware serveur, et le pourquoi de `snapshot` seul.
- [x] Ce plan tenu à jour.

## Ce que `craftHandshake` a corrigé

`craftUnique` veut dire « ce nom apparaît exactement une fois ». Ce n'est pas le
bon prédicat à une frontière : un id de server function, ou la forme d'un
contexte client, **doit** apparaître des deux côtés, puisque les deux fichiers ne
peuvent pas s'importer. L'utiliser côté façade, c'était détourner le prédicat
pour dire « identité statique et repérable ».

`craftHandshake` dit l'inverse — « ce nom a un pendant en face » — et apporte
trois choses que le V2 initial n'avait pas :

1. **L'id n'existe plus qu'une fois** dans le dépôt. Les deux côtés passent la
   même valeur : `CLIENT_ID_MISMATCH` devient structurellement impossible dans
   un même programme tsc, et le graphe ne sert plus que pour le cas
   cross-programme.
2. **Un seul schéma pour les deux côtés.** Avant, le serveur déclarait un schéma
   et le client un autre ; seule la *forme* était comparée au site d'attache, et
   rien n'empêchait les deux d'être écrits différemment. Un handshake porteur de
   schéma supprime la question.
3. **Un diagnostic exact à la place d'une heuristique.**
   `CLIENT_CONTEXT_UNUSED` compare des noms de clés devinés dans l'AST ;
   `CRAFT_HANDSHAKE_MISSING_COUNTERPART` compare des identifiants.

Le premier passage de la règle sur la démo a d'ailleurs trouvé une vraie
question de conception : habiller le pipe `requireClientDI` d'un handshake le
faisait passer pour non tenu, puisque c'est le DI navigateur qui le remplit, pas
un middleware client. Les deux mécanismes restent donc séparés, et
`claimed-user-id.ts` le dit explicitement. Les relier — un `requireClientDI` qui
dériverait sa clé et son schéma d'un handshake — reste un suivi ouvert.

## Écarts assumés

1. **`clientContext([...])` plutôt qu'un tableau nu.** `createServerFunctionClient`
   reçoit son type de définition explicitement (`<typeof serverFn>`), et
   TypeScript n'infère plus aucun paramètre de type dès qu'un seul est fourni à
   la main : un tableau passé directement ne serait jamais inféré, donc jamais
   vérifié. Le helper a tous ses paramètres inférables ; la vérification devient
   une assignabilité entre ce qu'il publie et ce que le contrat exige.
2. **Pas d'auto-câblage de `requireClientDI` depuis `definition.pipes`.** Le plan
   l'envisageait ; c'est impossible au runtime, parce que la façade client
   n'importe **que le type** de la définition — l'importer comme valeur ferait
   entrer le module serveur dans le bundle, exactement ce que le graphe
   interdit. Le pipe est donc déclaré une fois dans un module partagé et rejoué
   des deux côtés, avec le contrôle de couverture assuré par TypeScript.
3. **Le serveur déclare la forme, pas l'implémentation.** Le plan parlait de
   fusionner les schémas `.provides(...)` des middleware client dans le contrat.
   Impossible sans que le serveur importe le `*.mw-client.ts`. La forme attendue
   est donc déclarée côté serveur (`.clientContext(schema)` /
   `{ clientContext: schema }`) et la correspondance est vérifiée au site
   d'attache par TypeScript, puis entre fichiers par le graphe.
4. **`required(token)` change de source.** Le seul appelant qui dépendait de
   l'ancien comportement inerte était un test du core, mis à jour : il prouve
   désormais que la valeur vient du navigateur et **pas** du `runtime.resolve`
   serveur, même quand celui-ci est configuré.
5. **Clé de transport.** Elle vaut le `debugName` du token par défaut ; une clé
   littérale explicite (`{ key: 'userId' }`) est ce qui rend la couverture
   vérifiable au type. Sans elle, la vérification retombe sur la couverture par
   type de valeur et sur le runtime fail-closed.
6. **`CROSSES_FAMILIES` abandonné.** Je l'avais proposé pour les handshakes,
   mais un handshake porté par un middleware partagé traverse légitimement
   plusieurs familles : la règle n'aurait produit que du faux positif.
7. **Garde-fou de graphe.** `declaresApi(...)` ignore désormais le fichier qui
   *définit* `serverFunction`/`craftMiddleware` : depuis que
   `createServerFunctionFactory` appelle `serverFunction(...)`, une analyse dont
   le programme inclut les sources du core signalait la définition elle-même
   comme une server function mal nommée.

## Vérification

- `tsc` sur `libs/core/tsconfig.lib.json` et `libs/dev-tools/tsconfig.lib.json` : vert.
- Suite `libs/core` : 125 fichiers, **1286 tests** verts (1275 avant la V2),
  dont `client-function-middleware.spec.ts` (9 tests : oignon, dédup, familles
  mélangées, transport, rétrocompatibilité, collision de clé, contexte non
  honoré, schéma de contexte client d'un middleware serveur) et les extensions de
  `server-function.spec.ts` / `server-function-middleware.spec.ts`.
- Suite `libs/dev-tools` : 496 verts, 1 échec **pré-existant**
  (`verify-routes`, présent aussi sans ces changements) ;
  `architecture-graph.spec.ts` passe à 77 tests, `server-function-client-match`
  à 8.
- Démo `demo-with-server-function` : 5 tests E2E sur HTTP réel, dont le
  transport du contexte validé et le refus d'une requête forgée sans contexte.
- Suite d'architecture de la démo : 16 verts, 3 échecs **pré-existants**
  (preuve DI de route, boundary Effect d'un loader, noms d'éléments interactifs
  dupliqués entre les deux pages de démo) — identiques sur l'arbre propre.
- `nx lint` : démo et core au même niveau qu'avant la V2.

## Risques et points de vigilance

- `..._CLIENT_CONTEXT_UNUSED` est heuristique : il lit les accès
  `clientContext.<clé>` dans les fichiers serveur. Une lecture derrière un alias
  lui échappe, et son message le dit.
- La collision de clé entre un middleware client et un `requireClientDI` est une
  **erreur explicite à la construction du contexte**, jamais un écrasement. En
  revanche, une clé déjà validée par un schéma n'est pas un conflit : le pipe
  n'est alors qu'un accesseur typé sur la même valeur.
- `reactive`/`cancel-on-change` restent absents. Si le besoin apparaît, la voie
  reste de composer explicitement la lecture dans le `params()` de l'appelant,
  pas de réintroduire du tracking caché dans le loader.
