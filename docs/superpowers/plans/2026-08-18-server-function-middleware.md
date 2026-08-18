# Server functions — middleware onion typés

> Plan d’implémentation. Les étapes restent cochées au fur et à mesure de la réalisation.
> Prolonge [2026-08-18-server-functions-architecture.md](./2026-08-18-server-functions-architecture.md).

## Objectif

Remplacer les `pipe` déclaratifs actuels par de vrais middleware exécutables, sur le
modèle de TanStack Start, avec pour contrainte principale :

> ce qu’un middleware valide et produit doit être **typé** et **récupérable dans le handler**,
> sans cast et sans redéclaration manuelle.

## Décisions figées

| Sujet | Décision |
|---|---|
| Moteur d’exécution | **Onion `next()`** : le middleware appelle `yield* next({ context })` et peut post-traiter (mesure, audit, transaction, remplacement du résultat) |
| Portée V1 | **Serveur uniquement**. Pas de middleware client, pas de `sendContext`, pas de changement du format de transport |
| Nom de l’opérateur | **`.use(...)`**, pas `.pipe(...)` — `.pipe` est déjà l’opérateur des craft programs (`catchTag`, `retry`) et la collision de sens serait durable |
| Composition | Un middleware déclare ses dépendances avec `.use(...)` ; elles sont aplaties (profondeur d’abord) et **dédupliquées par id** |
| Erreurs aval | Le canal d’erreur de `next()` est un type **opaque** (`DownstreamError`) : un middleware peut observer un échec aval, pas l’inspecter ni le retyper |

## État de l’existant (constats)

- `.pipe(requireClientDI(...))` / `.pipe(requireServerPermission(...))` sont des **marqueurs inertes** :
  stockés dans `pipes` ([server-function.ts](../../../libs/core/src/lib/server-function.ts)), jamais exécutés.
  `requireServerPermission('users:read')` ne vérifie rien à l’exécution.
- Le seul point d’extension réel est `execute()` de `createServer` : global et non typé.
- Le canal d’erreur typé côté client est aujourd’hui une **fiction** : le serveur sérialise
  `{ error: message }` avec un 500 ([server.ts](../../../libs/core/src/lib/server.ts)), donc aucune
  erreur taguée n’est reconstituée côté client. Il faut le corriger dans la même vague, sinon
  les erreurs remontées par les middleware ne seront pas exploitables.

## API cible

```ts
// users/authenticated.mw-serveur.ts
export const authenticated = craftMiddleware('auth.authenticated')
  .input(Schema.Struct({ tenantId: Schema.String }))
  .server(({ input, next }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      if (user.role !== 'admin')
        return yield* new AdminRequired({ authenticatedUserId: user.id });

      return yield* next({ context: { user, tenantId: input.tenantId } });
    }),
  );

// users/audited.mw-serveur.ts — dépend du précédent, hook « après »
export const audited = craftMiddleware('audit.trail')
  .use(authenticated)
  .server(({ context, next }) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const exit = yield* Effect.exit(next({ context: { auditId: crypto.randomUUID() } }));
      const audit = yield* AuditLog;
      yield* audit.write({ actor: context.user.id, failed: Exit.isFailure(exit) });
      return yield* exit;
    }),
  );

// users/list.fn-serveur.ts
export const listUsers = serverFunction('users.list', ListUsersInput, { exposure: 'client' })
  .use(audited)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      context.user;      // AuthenticatedUser  (middleware transitif)
      context.auditId;   // string
      input.tenantId;    // string             (schéma du middleware, fusionné)
      input.filter;      // string             (schéma propre à la fn)
      const users = yield* UserRepository;
      return yield* users.list(input.filter, context.user.databaseId);
    }),
  );
```

## Mécanique de typage (prototypée et vérifiée)

Un prototype complet compile en TS 5.9 strict et tourne : `tmp/mw-proto/` (hors dépôt).
Il couvre l’inférence, les checks négatifs et l’exécution.

### Le point dur : inférer `ContextOut`

`next` est un **paramètre** du callback, donc TS ne peut rien inférer depuis son argument.
La solution — la même que TanStack — est de faire porter le contexte par le **type de retour** :
`next()` renvoie un résultat opaque brandé par le contexte ajouté.

```ts
declare const ResultBrand: unique symbol;
export interface MiddlewareResult<Context extends AnyRecord> {
  readonly [ResultBrand]: Context;
}

export type MiddlewareNext = <Context extends AnyRecord>(patch: {
  readonly context: Context;
}) => Effect.Effect<MiddlewareResult<Context>, DownstreamError, never>;
```

`.server(run)` infère alors `ContextOut`, `Error` et `Requirements` depuis le type de retour
du callback — pas besoin de générique à rang supérieur :

```ts
readonly server: <ContextOut extends AnyRecord, HandlerError, HandlerRequirements>(
  run: (args: {
    readonly input: MergeInputs<Inputs>;
    readonly context: ContextIn;
    readonly next: MiddlewareNext;
  }) => Effect.Effect<MiddlewareResult<ContextOut>, HandlerError, HandlerRequirements>,
) => CraftMiddleware<
  Id,
  Inputs,
  Overwrite<ContextIn, ContextOut>,
  Error | Exclude<HandlerError, DownstreamError>,
  Requirements | HandlerRequirements
>;
```

Le `Exclude<HandlerError, DownstreamError>` est ce qui empêche le marqueur opaque de fuiter
dans le canal d’erreur public.

### Les trois canaux accumulés

1. **Input** — chaque `.input(schema)` est empilé dans un tuple `Inputs`.
   `MergeInputs<Inputs>` = intersection des `SchemaOutput`.
2. **Contexte** — fold ordonné `Overwrite<Acc, ContextOf<M>>` : le dernier middleware gagne,
   comme TanStack. Les dépendances transitives sont déjà aplaties dans le `ContextOut` publié
   par chaque middleware, donc le fold reste à un niveau.
3. **Erreurs / Requirements** — unions simples sur `Ms[number]`, injectées dans l’Effect
   retourné par `.handler()`.

Vérifié sur le cas réel `authenticated` + `audited` + `listUsers` :

```ts
check<Expect<Success, readonly string[]>>(true);
check<Expect<Failure, AdminRequired | TenantSuspended>>(true);
check<Expect<Requirements, CurrentUser | AuditLog | UserRepository>>(true);
```

Assertions non vacantes : une mutation volontaire des types attendus produit bien 2 erreurs `tsc`.

## Runtime

### Composition

```ts
const step = (index: number, context: AnyRecord): unknown => {
  const middleware = chain[index];
  if (!middleware) return handler({ input, context });
  return middleware.run({
    input,
    context,
    next: (patch) => step(index + 1, { ...context, ...patch.context }),
  });
};
```

Le brand `MiddlewareResult` est purement type-level : à l’exécution, la valeur qui remonte
est déjà le résultat du handler. Un seul cast, dans le core.

Trace vérifiée par le prototype :

```txt
outer:before → inner:before (voit outerId) → handler → inner:after → outer:after failed=false
```

et en cas d’échec du handler, le hook « après » observe `failed=true` puis relaie l’échec.

### Validation de l’input fusionné

Standard Schema ne sait pas fusionner deux schémas. La validation reste donc **unique et en
amont de la chaîne**, dans `parseServerFunctionInput` : on valide l’input brut avec **chaque**
schéma collecté, puis on fusionne (shallow) les sorties.

Contrainte à documenter : un schéma de middleware doit **ignorer les clés en trop**
(comportement par défaut de `Schema.Struct` en Effect). Un schéma strict ferait échouer
la validation dès qu’une fn ajoute ses propres champs.

## Étapes d’implémentation

### Étape 1 — Le middleware dans le core

- [ ] Créer `libs/core/src/lib/server-function-middleware.ts` (types + builder + `flatten`).
- [ ] Porter la machinerie prototypée (`MiddlewareResult`, `DownstreamError`, `Overwrite`, `MergeInputs`).
- [ ] Implémenter `craftMiddleware(id).use(...).input(...).server(...)`.
- [ ] Aplatir et dédupliquer les dépendances par id, dépendance d’abord.
- [ ] Refuser deux middleware d’id identique avec des implémentations différentes.
- [ ] Exporter depuis `libs/core/src/index.ts`.

### Étape 2 — Brancher `serverFunction`

- [ ] Ajouter `.use(middleware)` au builder, avec accumulation du tuple `Middlewares`.
- [ ] Fusionner les schémas d’input dans le contrat effectif.
- [ ] Exposer `context` dans `ServerFunctionHandlerContext`, à côté de `input`.
- [ ] Injecter `MergedError` / `MergedRequirements` dans l’Effect retourné par `.handler()`.
- [ ] Composer la chaîne dans `invoke()`.
- [ ] Conserver `required()` et le tuple `pipes` : aucune rupture des appels existants.

### Étape 3 — Validation et registre

- [ ] Valider l’input brut avec chaque schéma collecté, puis fusionner les sorties.
- [ ] Vérifier qu’un schéma strict produit un diagnostic lisible, pas un échec obscur.
- [ ] Vérifier que `execute()` reçoit bien un Effect dont le canal R contient les services des middleware.
- [ ] Documenter que le `runtimeLayer` applicatif doit fournir ces services.

### Étape 4 — Erreurs taguées de bout en bout (trou existant)

- [ ] Sérialiser les échecs Effect tagués en `{ _tag, payload }` au lieu de `{ error: message }`.
- [ ] Choisir le code HTTP selon la nature de l’échec (échec métier vs défaut).
- [ ] Reconstituer l’erreur taguée côté client et la rejouer en `craftException`.
- [ ] Vérifier qu’un `catchTag('AdminRequired', ...)` client compile et attrape réellement.

### Étape 5 — Migrer les pipes existants

- [ ] Réimplémenter `requireServerPermission` comme un vrai middleware qui vérifie et court-circuite.
- [ ] Laisser `requireClientDI` en l’état, marqué explicitement comme non fonctionnel jusqu’à la V2.
- [ ] Ajouter un test qui prouve qu’une permission manquante rejette la requête.

### Étape 6 — Graphe et règles d’architecture

- [ ] Convention de nommage `*.mw-serveur.ts`.
- [ ] Détecter les `craftMiddleware(...)` et les arêtes `.use(...)` dans le graphe.
- [ ] Diagnostic `CRAFT_SERVER_FUNCTION_MIDDLEWARE_DUPLICATE_ID`.
- [ ] Diagnostic `CRAFT_SERVER_FUNCTION_MIDDLEWARE_CYCLE`.
- [ ] Vérifier qu’un `*.mw-serveur.ts` n’est jamais importé par un module client.

### Étape 7 — Démo et documentation

- [ ] Ajouter `authenticated` + `audited` dans `apps/demo-with-server-function`.
- [ ] Remplacer l’appel direct à `requireAdmin` de `authenticated-list.fn-serveur.ts` par le middleware.
- [ ] Documenter le modèle onion, l’ordre d’exécution et la fusion des schémas.
- [ ] Documenter la contrainte « schéma non strict » pour les middleware.

## Repoussé en V2 (frontière client)

- `craftMiddleware().client(...)` et le canal `sendContext` client → serveur.
- Format de transport `{ id, input, context }` versionné.
- Validation obligatoire par schéma du `sendContext` côté serveur (aucune confiance au client).
- `createServerFunctionClient(id, [middlewaresClient])` et la règle de graphe de correspondance.
- Réécriture de `requireClientDI` en sucre au-dessus d’un middleware client, avec les modes
  `snapshot` / `reactive` / `cancel-on-change`.
- Middleware globaux typés via `createServerFunctionFactory([...])`.

## Risques et points de vigilance

- Le brand `MiddlewareResult` doit rester **non exporté publiquement** en tant que valeur :
  s’il devient constructible ailleurs, un middleware pourra prétendre fournir un contexte
  qu’il ne fournit pas.
- La dédup par id est silencieuse : deux middleware d’id identique et de contexte différent
  donneraient un typage juste et un runtime faux. D’où le contrôle d’unicité en étape 1.
- Un middleware qui oublie d’appeler `next()` ne peut pas se voir reprocher par le typage
  (il doit alors renvoyer une erreur, ce qui est légitime pour un court-circuit).
  Le comportement « n’appelle pas `next` et réussit quand même » est impossible : le type
  de retour exige un `MiddlewareResult`, qui ne s’obtient que via `next()`.
- L’ordre d’exécution est celui des `.use(...)`, dépendances d’abord. Il doit rester stable
  et documenté : un middleware d’audit placé avant l’authentification ne verrait pas `user`.
