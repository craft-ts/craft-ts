# Audit — sécurité des libs CraftTS

Audit du travail livré contre [`security-libs-craft-ts.md`](./security-libs-craft-ts.md),
puis journal des corrections apportées.

- **Audit initial : 2026-08-23.** 9 trous reproduits par des tests exécutés.
- **Corrections : 2026-08-23.** Tous les points critiques et élevés sont
  corrigés, avec 70 tests de non-régression (`npm run security:test`) et
  `craft security check --strict` vert sur le dépôt (`npm run security:check`),
  tous deux branchés dans la CI et dans `release:preflight`.

## État par phase du plan

| Phase du plan | Avant | Après |
| --- | --- | --- |
| 0 — modèle de politique | Fait | Fait (+ `dom.allowedResourceOrigins`, `allowedUrlSchemes`) |
| 1 — snapshot SSR | Allowlist inopérante | Fermé par défaut, 3 modes explicites |
| 2 — renderer DOM | Sanitizer contournable | Sanitizer à parsing + sortie SSR validée |
| 3 — cycle de vie SSR | Fait | Fait (+ limite de concurrence) |
| 4 — server functions | Aucune protection CSRF | Origine, content-type, corps en flux, erreurs cataloguées |
| 5 — CSP & Trusted Types | Nonce non branché | Nonce de bout en bout ; Trusted Types documenté, non implémenté |
| 6 — outillage | Inutilisable | 8 règles testées et actives par défaut, `security check` configurable, CI |
| 7 — exceptions | Fait | Fait (+ lint sur `unsafeHtml` sans exception) |
| 8 — validation | 2 specs | 70 tests dédiés |

## Ce qui reste ouvert

- **Trusted Types** n'est pas implémenté : la lib documente le point unique à
  couvrir (`innerHTML` dans le renderer) mais ne pose pas de politique.
- **Le timeout d'invocation n'interrompt pas un handler non coopératif** : il
  libère l'appelant et signale l'`AbortSignal`, rien de plus — c'est une
  limite de la plateforme, pas un oubli. `maxConcurrentRequests` borne les
  dégâts.
- **Adapter Lambda** : les réponses binaires restent décodées en UTF-8
  (`isBase64Encoded: false`).
- `demo:typecheck` et `demo:lint` échouent sur du code sans rapport avec la
  sécurité (état antérieur du dépôt).

---

## Journal des corrections

| # | Trou | Correction | Vérification |
| --- | --- | --- | --- |
| C1 | Noms d'attributs et de balises non validés à la sérialisation SSR | Validation dans `string-dom` à la pose **et** à la sérialisation, `'` échappé des deux côtés | `security-render.spec.ts` |
| C2 | `sanitizedHtml` contournable, pouvait fabriquer un `<script>` | Sanitizer réécrit : tokenisation puis reconstruction, allowlist d'éléments/attributs, décodage d'entités avant validation, `id`/`name` refusés, `rel` forcé sur `_blank` | 24 payloads |
| C3 | Aucune protection CSRF sur les server functions | `application/json` exigé (415), `Origin` et `Sec-Fetch-Site` vérifiés (403), en-tête `x-craft-protocol` posé par le client | `security-runtime.spec.ts` |
| C4 | `route.csrf` ne comparait pas l'origine | `isSameSiteMutation` partagé par la route, le middleware et le guard d'entrée ; refus par défaut des mutations étrangères | `security-http.spec.ts` |
| C5 | `Host` de confiance dans les adapters | `trustedHosts` sur `createHttpServer`, `createCraftLambdaFetch` et le serveur Node de la démo | `security-http.spec.ts` |
| H1 | Transfert SSR ouvert malgré `mode: 'deny'` | Plus de `transfer: true` implicite ; modes `deny` / `allowlist` / `legacy` ; démo migrée vers une allowlist réelle | `security-runtime.spec.ts` |
| H2 | `innerHTML` sérialisé en attribut | Nœud HTML approuvé dans le DOM string, émis verbatim | `security-render.spec.ts` |
| H3 | Corps entièrement bufferisé avant contrôle | Lecture du flux avec compteur, abandon à la première tranche en excès | test de corps chunké |
| H4 | Nonce CSP non branché | `createCspNonce`, `contentSecurityPolicy(nonce)`, `renderCraft({ cspNonce })`, CSP sans `unsafe-inline` + `form-action`, COOP/CORP | `csp-nonce.spec.ts`, `security-http.spec.ts` |
| H5 | Session résolue avant les gardes, hors du `try` | `createIdentityMiddleware` dans le pipeline, après les gardes d'entrée | 2 tests |
| H6 | Attributs d'URL incomplets, `safeResourceUrl` sans effet | `xlink:href`, `srcset`, `ping`, `data`, `manifest`… ; origines de ressources sur allowlist ; protocol-relative refusé ; `mailto:`/`tel:` acceptés | 3 tests |
| M1 | Aucune limite de charge | `maxConcurrentRequests` → 503 + `Retry-After` | test de délestage |
| M2 | Échec tagué sérialisé en entier | `publicErrors` strict : tag + payload déclaré + `fields` nommés, sinon 500 | démo migrée, 1 test |
| M3 | `requestId` client non validé | Validation du format dans `server.ts` | — |
| M4 | Rate limit à clé constante | `key` obligatoire | typage + démo |
| M5 | Réponses sans en-têtes de sécurité | `no-store`, `nosniff`, `Vary: Origin` | 1 test |
| M6 | Fonction inconnue distinguable | Réponse identique à une requête invalide | 1 test |
| M7 | CSS par denylist | `behavior`, `-moz-binding`, `@import` refusés ; chaque `url()` passe par `safeResourceUrl` | 1 test |
| M8 | Timeout silencieusement absent sans `AbortSignal.any` | Repli manuel `AbortController` + `setTimeout`, libéré en fin de requête | — |
| M9 | `Set-Cookie` fusionnés par l'adapter Lambda | Champ `cookies` séparé | 1 test |
| M10 | Percent-encoding invalide → 500 | 400 explicite | 1 test |
| M11 | `forceHttps` n'imposait rien | Redirection 308 + HSTS | — |
| O1 | Règles ESLint à faux positifs | 8 règles réécrites (reconnaissance des helpers, exemption de la frontière proxy, `unsafeHtml` sans exception, `eval`, `document.write`) | 17 tests |
| O1b | Préréglage sécurité en opt-in | Inclus dans `recommended` et `effect`, donc actif pour tout projet et pour `craft new` ; appliqué à tout `src/**` des apps et des libs (serveur compris) ; règles affinées pour rester sans faux positif | lint du dépôt inchangé |
| O2 | `security check` incomplet et hors CI | Nouveaux contrôles, `craft-security.json`, `craft-security-ignore`, sévérités, branché en CI et preflight | vert sur le dépôt |
| O3 | Validation symbolique | 70 tests de sécurité | `npm run security:test` |
| O4 | Demos non migrées | Politique par adresse, nonce, catalogue d'erreurs, CSRF, `trustedHosts` | suites des demos |

---

## Détail des trous d'origine

## 1. Critique — à corriger avant toute diffusion

### C1. Le sérialiseur SSR n'échappe ni les noms d'attributs ni les noms de balises (PoC 8)

[`string-dom.ts:420`](../../libs/component/src/lib/render/string-dom.ts) écrit
`` ` ${name}="${escapeAttribute(value)}"` `` avec le nom brut, et
`` `<${node.localName}…>` `` avec le tag brut.

```
setAttribute(el, 'x onload=alert(1) y', '1')
→ <span x onload=alert(1) y="1"></span>
```

La valeur est échappée, le **nom** ne l'est pas. Dès qu'un composant fait un
spread d'attributs dont les clés viennent de données (`{...attrs}`,
config CMS, réponse d'API), on sort de l'attribut et on injecte du HTML.
Toutes les protections de `applyAttribute` (blocage `on*`, `srcdoc`) sont
inutiles ici : elles filtrent la frontière d'**entrée**, alors que la frontière
de **sortie** ne valide rien. C'est le point d'étranglement réel du SSR.

**Correction** : valider `name` contre `/^[A-Za-z_:][-A-Za-z0-9_:.]*$/` et
`localName` contre `/^[a-zA-Z][a-zA-Z0-9-]*$/` **dans le sérialiseur** (jeter
une `CraftDomSecurityError`), pas seulement dans l'interpréteur. Ajouter au
passage `'` → `&#39;` dans `escapeAttribute`.

### C2. `sanitizedHtml` est contournable et peut fabriquer un `<script>` (PoC 5, 6)

[`security.ts:83`](../../libs/component/src/lib/security.ts) est un sanitizer à
base de regex. Trois échecs mesurés :

| Entrée | Sortie produite |
| --- | --- |
| `<svg/onload=alert(1)></svg>` | inchangée — le handler passe |
| `<scr<script>ipt>alert(1)</scr</script>ipt>` | `<script>alert(1)</script>` |
| `<img src="/logo.png">` | `<img href="/logo.png">` |

Le premier cas vient de `\s+on[a-z]+` : `/` est un séparateur d'attribut valide
en HTML, l'espace n'est pas requis. Le deuxième est le classique du filtrage par
suppression : retirer une balise **crée** la balise voisine. Le troisième est un
bug fonctionnel du callback de réécriture, qui renomme tous les attributs
d'URL en `href`. Ni le `style` (`url(javascript:)` conservé), ni `<form>`,
`<base>`, `<meta http-equiv>`, ni les entités HTML ne sont traités.

**Correction** — au choix, mais pas un troisième round de regex :
1. **Recommandé** : supprimer `sanitizedHtml` de l'API publique. N'exposer que
   `unsafeHtml` + `allowUnsafe(...)`, et documenter que le sanitizing est
   délégué au projet (DOMPurify au navigateur, `parse5` + allowlist au serveur).
   Une lib qui prétend sanitizer doit tenir la promesse ou ne pas la faire.
2. Sinon : implémenter un vrai sanitizer par **parsing** avec allowlist de
   balises/attributs/schémas, jamais par suppression de motifs, et le soumettre
   à un corpus de payloads (cheat sheet OWASP / jeu de tests DOMPurify).

### C3. Aucune protection CSRF sur les server functions (PoC 2)

[`server.ts:213`](../../libs/core/src/lib/server.ts) `handle()` ne regarde ni
`Origin`, ni `Sec-Fetch-Site`, ni `Content-Type`. Une page attaquante peut donc
poster une *simple request* (`content-type: text/plain`, aucun préflight) vers
`/__server-functions` avec les cookies de la victime :

```
POST /__server-functions   origin: https://evil.test   cookie: sid=…
{"id":"account.delete","input":null}     → 200, handler exécuté
```

Le plan annonçait « la lib doit fournir les hooks nécessaires à
l'authentification et au CSRF » ; il n'existe aucun hook sur ce chemin.

**Correction** (le client envoie déjà `content-type: application/json`, donc
le coût de migration est nul) :
- exiger `content-type: application/json` → sinon 415 ;
- exiger un header non simple (`x-craft-protocol: 1`) émis par
  `fetchServerFunctionRequest`, ce qui force le préflight CORS ;
- vérifier `Sec-Fetch-Site: same-origin` quand l'en-tête est présent, et
  `Origin` contre une `allowedOrigins` **obligatoire** dès qu'un cookie est
  présent sur la requête.

### C4. `route.csrf: true` ne compare pas l'origine (PoC 3)

[`http-server.ts` `createRouteHandler`](../../libs/core/src/lib/http-server.ts)
ne rejette que si l'`Origin` est **absente** :

```ts
if (cookie && MUTATION_METHODS.has(method) && !origin) → 403
```

Une requête cross-origin envoie une `Origin` — celle de l'attaquant — donc elle
passe. Le drapeau `csrf: true` protège aujourd'hui uniquement contre les clients
qui n'envoient pas d'`Origin`, c'est-à-dire quasiment personne. `createCsrfMiddleware`,
lui, fait la bonne comparaison : le handler de route doit simplement l'appeler
plutôt que réimplémenter une demi-vérification.

Corollaire : `createRequestGuardMiddleware` laisse passer **toute** origine
quand `allowedOrigins` est vide (`if (origin && allowedOrigins.size > 0)`), soit
la configuration par défaut. Le défaut doit être fermé pour les méthodes
mutantes.

### C5. Les adapters font confiance au header `Host` (PoC 4)

[`lambda-adapter.ts:62`](../../libs/core/src/lib/lambda-adapter.ts) construit
l'URL avec `headers.get('host') ?? 'lambda.local'`. Tout le socle CSRF/CORS
repose sur `new URL(request.url).origin` : un attaquant qui envoie
`Host: evil.test` + `Origin: https://evil.test` devient « same-origin » et
neutralise C3/C4 même une fois corrigés. Même problème pour toute redirection
absolue construite à partir de cette URL.

**Correction** : `trustedHosts: readonly string[]` obligatoire sur les adapters
(Lambda, Worker, Node) ; un host non listé → 400, sinon repli sur le premier
host configuré. Même traitement pour `x-forwarded-host`/`-proto`, avec une
option `trustProxy` explicite.

---

## 2. Élevé — invariants du plan non tenus

### H1. La politique de transfert par défaut ne dénie rien (PoC 1)

Invariant n°2 : « aucune donnée SSR n'est transférée sans politique explicite ».
Or [`craft-primitive-registry.ts:255`](../../libs/core/src/lib/craft-primitive-registry.ts)
pose `transfer: options.transfer ?? true` pour **toutes** les primitives créées
par le framework, et `isTransferable` en mode `deny` retourne `transfer === true`.
Résultat : avec la politique par défaut (`mode: 'deny'`), tout état applicatif
part quand même dans le `<script>` de transfert. Le mode `deny` ne bloque que
les entrées de registre ad hoc, qui n'existent pas en pratique.

La seule protection restante est la denylist de noms sensibles
(`SENSITIVE_NAME`), c'est-à-dire une heuristique — `state:iban`,
`state:internalNotes`, `state:adminFlags` passent tous. Elle ne couvre pas non
plus les instances de classes, retournées telles quelles par `redactSensitive`.

**Correction** : `transfer` non renseigné = non transférable. Le transfert
devient une décision de site d'appel (`craftState(…, { transfer: true })`) ou
une entrée d'allowlist. Prévoir un mode `legacy` pour la migration, et faire
échouer `craft security check --strict` dessus.

### H2. `innerHTML` n'existe pas côté SSR (PoC 9)

`applyAttribute` route le HTML sûr vers `renderer.setProperty(el, 'innerHTML', …)`.
Côté serveur, `setStringProperty` fait `setAttribute('innerHTML', …)` : le HTML
part comme **attribut échappé**, pas comme contenu.

```
<div innerHTML="&lt;b&gt;hello&lt;/b&gt;"></div>
```

Donc : contenu absent du HTML serveur, réapparition à l'hydratation (mismatch),
et duplication de la donnée dans un attribut. Le chemin « HTML sûr » n'est
fonctionnel que côté navigateur.

**Correction** : nœud « raw HTML » de première classe dans le `StringDom`
(nœud dont le sérialiseur émet la valeur telle quelle, alimenté uniquement par
un `CraftSafeHtml`/`CraftUnsafeHtml`), et interdiction de `innerHTML` en
`setProperty` générique.

### H3. La limite de body se prend après avoir tout chargé en mémoire

`server.ts` fait `await request.text()` **puis** compare la taille. Quand la
requête est chunkée (pas de `Content-Length`), le processus absorbe l'intégralité
du corps avant de refuser : DoS mémoire à un seul appel. Idem dans
`createRequestGuardMiddleware`, qui ne contrôle que l'en-tête déclaré.

**Correction** : lire le `ReadableStream` avec un compteur, abandonner à la
première tranche qui dépasse.

### H4. Le nonce CSP n'est branché nulle part

`provideCraftCspNonce` pose l'attribut `nonce` sur les `<style>`. Mais :
- `createSecurityMiddleware` émet une CSP figée contenant `style-src 'unsafe-inline'` ;
- aucun serveur, y compris `apps/demo-ssr/src/production-server.ts:402`, ne
  génère de nonce par requête ni ne l'injecte dans l'en-tête.

La phase 5 n'a donc aucun effet observable : la CSP livrée en exemple reste
permissive sur les styles. À ajouter aussi : `form-action 'self'`,
`upgrade-insecure-requests`, COOP/CORP.

**Correction** : `createSecurityMiddleware({ nonce })` ou génération interne
(`crypto.randomUUID`) exposée dans le `RequestContext`, avec un fragment de doc
montrant le passage jusqu'à `provideCraftCspNonce`. Trusted Types : soit une
implémentation (`window.trustedTypes.createPolicy`) derrière les APIs HTML/URL,
soit retirer la mention de la doc — aujourd'hui c'est une promesse non tenue.

### H5. Auth et services exécutés avant le guard, hors du `try`

Dans `createHttpServer.handle`, `options.user(request)` et `options.services(request)`
sont appelés **avant** la chaîne de middleware et **en dehors** du `try/catch` :
- une exception de résolution de session ne produit pas une réponse d'erreur
  propre, elle rejette la promesse de `handle()` (500 non formaté, voire crash
  selon l'adapter) ;
- la vérification de token (souvent une requête réseau ou une crypto) tourne
  avant le rate limiting et avant le contrôle de taille : amplification DoS.

### H6. Couverture des attributs d'URL incomplète, `safeResourceUrl` sans effet propre (PoC 7)

- Non couverts : `xlink:href` (SVG), `srcset`, `ping`, `data` (`<object>`),
  `background`, `<base href>`, `<meta http-equiv="refresh">`.
- `safeResourceUrl` est identique à `safeUrl` à un message près. Une *resource
  URL* (`<script src>`, `<iframe src>`, `<object data>`) devrait exiger une
  allowlist d'origines : aujourd'hui `https://evil.test/x.js` est accepté.
- `safeUrl('//evil.test/steal')` est accepté : les URLs protocol-relative
  héritent du schéma courant et pointent hors origine (redirection ouverte,
  fuite de referrer, chargement tiers).
- `mailto:` et `tel:` sont refusés — faux positif qui poussera les équipes à
  contourner l'API.

---

## 3. Moyen

| # | Point | Fichier |
| --- | --- | --- |
| M1 | Le timeout d'invocation gagne une course mais n'interrompt rien : le handler continue à consommer des ressources. Aucune limite de concurrence côté SSR ni server functions (annoncée « à documenter », jamais documentée). | `server.ts`, `server-render.ts` |
| M2 | Sans mapping `publicErrors`, la failure taguée est sérialisée **intégralement** (`Response.json({ error: failure })`), propriétés comprises. `publicErrors: {}` satisfait le lint et le `security check` tout en n'offrant rien — c'est exactement le cas de la demo. | `server.ts:305` |
| M3 | `requestId` lu depuis `x-request-id` sans validation dans `server.ts` (validé dans `http-server.ts` seulement) → corrélation de logs forgeable par le client. | `server.ts:236` |
| M4 | Rate limit : clé par défaut constante (`'anonymous'`) → un seul client épuise le quota de tous. Store mémoire non partagé entre instances, purge seulement au-delà de 1024 entrées. Rendre `key` obligatoire. | `http-server.ts:251` |
| M5 | Réponses server functions sans `cache-control: no-store`, `x-content-type-options: nosniff`, ni `Vary: Origin` (risque de cache poisoning sur les réponses CORS). | `server.ts`, `http-server.ts` |
| M6 | Fonction inconnue → 404 avec code dédié : permet d'énumérer le catalogue de fonctions. Le plan demandait une réponse générique. | `server.ts:283` |
| M7 | `assertSafeStyleValue` est une denylist regex (`expression(`, `url(javascript:`…), contournable par commentaires/échappements CSS ; et `applyStyles(next: string)` accepte une déclaration CSS entière, donc l'injection de propriétés arbitraires reste possible. Préférer une allowlist de propriétés + valeurs. | `interpreter.ts:1655` |
| M8 | `timeoutSignal` : si `AbortSignal.any`/`timeout` manquent, **aucun** timeout n'est appliqué, silencieusement. Faire échouer ou polyfiller. | `http-server.ts` |
| M9 | Adapter Lambda : `Object.fromEntries(response.headers)` écrase les `Set-Cookie` multiples ; le corps est décodé en UTF-8 avec `isBase64Encoded: false` → réponses binaires corrompues. | `lambda-adapter.ts` |
| M10 | `matchPath` fait `decodeURIComponent` sans garde (`/a/%zz` → 500 au lieu de 400) et `normalizePathname` ne neutralise pas `..` : à documenter pour tout handler de fichiers statiques. | `http-server.ts` |
| M11 | `forceHttps` ne force rien : il ajoute HSTS sans redirection. Nom trompeur. | `http-server.ts` |

---

## 4. Outillage — pas encore utilisable

### O1. Les règles ESLint sont trop naïves pour être activées

- `no-raw-user-url` signale **toute** propriété `href`/`src` dont la valeur est
  un appel — donc `href: safeUrl(x)` est signalé au même titre que `href: x`.
  La règle punit le code correct ; elle sera désactivée le premier jour.
- `no-trust-forwarded-headers` interdit la simple présence du littéral
  `'x-forwarded-for'`, sans option d'exemption pour la frontière proxy
  légitime — qui doit bien exister quelque part.
- `require-route-security-policy` est satisfaite par n'importe quelle propriété
  dont le nom contient `ssr`.
- Manquants : `unsafeHtml()` sans `allowUnsafe()` associé, `eval`/`new Function`,
  `postMessage(…, '*')`, `target="_blank"` sans `rel="noopener"`,
  `renderCraft()` sans `securityPolicy`.
- Aucun test pour ces 8 règles, alors que le reste du plugin en a.
- La config `security` n'est pas incluse dans `recommended` : une app créée par
  `craft new` ne l'active pas.

### O2. `craft security check` ne fait pas ce que le plan annonce

Exécuté sur `apps/`, il retourne un seul diagnostic (`POLICY_MISSING`) — au
passage avec un champ `file` vide. Il manque les contrôles annoncés :
transferts SSR non autorisés, configuration de production incompatible avec une
CSP stricte, APIs DOM dangereuses (`eval`, `document.write`,
`insertAdjacentHTML`), secrets en dur. Il n'a ni fichier de configuration, ni
suppression inline, ni baseline, ni niveaux de sévérité — donc aucun chemin
d'adoption sur une base de code existante. Enfin il **n'est branché ni dans la
CI (`.github/workflows/production-readiness.yml`) ni dans `release:preflight`**,
ce qui annule le critère « la CI échoue lorsqu'une exception est expirée ».

### O3. La validation (phase 8) est symbolique

Deux fichiers, cinq assertions, pour huit phases. Aucun des cas listés dans le
plan n'est couvert : fuzzing d'URLs/attributs/inputs, snapshot malformé à
l'hydratation, annulation en cours de query, timeout de source SSR, absence de
timers résiduels, compatibilité navigateur. Les neuf PoC ci-dessous sont un
point de départ : ils devraient être des tests rouges du dépôt.

### O4. Les demos ne sont pas migrées

`renderCraft` est appelé sans `securityPolicy` dans `apps/demo-ssr/src/server.ts:54`,
aucune app ne fournit `provideCraftSecurityPolicy`, `createDemoWebHandler`
n'installe pas `createCsrfMiddleware`, et `publicErrors: {}` est vide. Le
critère « les demos utilisent uniquement les APIs sécurisées » n'est pas atteint,
alors que ce sont elles qui servent de modèle aux applications générées.

---

## 5. Ce qui est solide et mérite d'être conservé tel quel

- Le modèle `CraftSecurityPolicy` : immuable, validé, défauts restrictifs,
  fourni par requête plutôt que par singleton mutable — exactement ce que
  demandait la phase 0.
- `validateCraftTransferSnapshot` : version, champs de tête inconnus, forme des
  entrées, statuts autorisés, profondeur, taille, refus des erreurs côté client,
  format d'adresse — c'est du bon travail défensif, et le cœur du risque
  d'hydratation est couvert.
- L'échappement anti-`</script>` du snapshot, conservé.
- Le passage des exceptions internes à un 500 générique.
- L'isolation par rendu, `coordinator.dispose()`, la propagation du signal
  d'annulation aux `craftResource`.
- Le concept `allowUnsafe` avec propriétaire, risque et expiration.

---

## 6. Ordre de correction suggéré

1. **C1** (sérialiseur SSR) et **C5** (host de confiance) — deux corrections
   courtes qui referment les deux frontières de sortie.
2. **C3 + C4** — protection cross-origin par défaut sur les deux serveurs, plus
   `allowedOrigins` obligatoire dès qu'un cookie est présent.
3. **C2** — décision sur `sanitizedHtml` : le retirer ou le refonder par
   parsing. Ne pas le laisser en l'état.
4. **H1** — `transfer` fermé par défaut + mode `legacy` de migration.
5. **H2, H3, H5** — raw HTML SSR, lecture de body en streaming, ordre du
   pipeline HTTP.
6. **H4** — nonce CSP de bout en bout, décision sur Trusted Types.
7. **O1/O2** — reprendre les règles pour éliminer les faux positifs, brancher
   `craft security check --strict` dans `release:preflight` et la CI.
8. **O3/O4** — convertir les PoC en suite de non-régression, migrer les demos.

## 7. Reproduction

Deux fichiers de PoC sont disponibles dans le scratchpad de la session :

```
core-audit-poc.spec.ts       → libs/core/security/
component-audit-poc.spec.ts  → libs/component/security/
```

```bash
npx vitest run --config libs/core/vitest.config.ts security/core-audit-poc.spec.ts
```

Les neuf tests échouent sur la branche courante ; chacun documente en commentaire
la sortie réellement observée.
