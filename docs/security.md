# CraftTS security runtime

Les libs fournissent des garde-fous techniques ; l'application reste
responsable de l'identité, des permissions, des cookies, des origines CORS,
des domaines sortants, du reverse proxy et des secrets.

Trois principes guident ce qui suit :

1. **Le défaut est fermé.** Rien ne se transfère, aucune origine étrangère
   n'écrit, aucune URL de ressource externe ne se charge tant que
   l'application ne l'a pas déclaré.
2. **La frontière de sortie décide.** Les noms de balises et d'attributs sont
   validés au moment de la sérialisation, pas seulement à l'entrée.
3. **Une exception se déclare.** Toute désactivation porte un propriétaire,
   une raison, un risque et une date d'expiration.

## Politique

Une politique est immuable et fournie par requête :

```ts
import {
  provideCraftSecurityPolicy,
  provideCraftCspNonce,
} from '@craft-ts/core';

const providers = [
  provideCraftSecurityPolicy({
    transfer: {
      mode: 'allowlist',
      allow: ['component:App#1 / state:publicMessage#1'],
    },
    dom: {
      allowedResourceOrigins: ['https://cdn.example.com'],
    },
  }),
  provideCraftCspNonce(nonce),
];
```

## Transfert SSR

`transfer.mode` vaut :

| mode | effet |
| --- | --- |
| `deny` (défaut) | aucune primitive ne voyage |
| `allowlist` | seules les adresses listées voyagent |
| `legacy` | tout ce qui est sérialisable voyage — migration uniquement |

Pour connaître les adresses à autoriser, rendre une fois en `legacy` et lire
`snapshot.values` / `snapshot.queries` ; `apps/demo-ssr/src/app/security-policy.ts`
montre le résultat. Une primitive peut aussi refuser le transfert à la source
avec `transfer: false`.

Le snapshot est validé strictement côté client : version, champs de tête,
forme des entrées, statuts, adresses, profondeur et taille. Les erreurs de
query ne sont jamais transférées, les clés au nom sensible sont omises, et
l'échappement anti-`</script>` est conservé.

## DOM et HTML

- `safeUrl(value, options?)` — relatif, `http(s)`, `mailto:`, `tel:`.
  Refuse `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` et les URLs
  protocol-relative (`//host`).
- `safeResourceUrl(value, options?)` — pour `src`, `poster`, `data`,
  `manifest` : relatif par défaut, cross-origin seulement contre
  `dom.allowedResourceOrigins`.
- `safeUrlList(value, resource, options?)` — `srcset`, `ping`.
- `sanitizedHtml(value, options?)` — fragment de présentation, allowlist fixe
  de balises et d'attributs. Le HTML est **tokenisé puis reconstruit** : rien
  n'est retiré d'une chaîne existante, parce que supprimer un motif peut
  assembler une balise à partir de ses voisins. `id` et `name` sont refusés
  (DOM clobbering), un `target="_blank"` reçoit `rel="noopener noreferrer"`.
  Pour du contenu riche, préférer un sanitizer approuvé par le projet
  (DOMPurify au navigateur, pipeline à parseur au serveur) derrière une
  exception `unsafeHtml` auditée.

Le renderer refuse les attributs `on*`, `srcdoc`, les CSS exécutables, et les
noms de balises ou d'attributs invalides — côté navigateur comme dans le HTML
sérialisé par le SSR.

## SSR et server functions

Chaque appel à `renderCraft` crée son injecteur, son registre de primitives et
son signal d'annulation, propagé aux ressources ; l'annulation nettoie les
timers du coordinateur. Le HTML, le body, l'output et la durée sont bornés par
la politique effective.

Le protocole HTTP des server functions refuse par défaut :

- un corps qui n'est pas `application/json` (415) — ce qui écarte les
  « simple requests » d'un formulaire tiers ;
- une origine étrangère ou un `Sec-Fetch-Site` cross-site (403) ;
- un corps plus grand que la limite, mesuré **au fil du flux** (413).

Une fonction inconnue répond comme une requête invalide, pour que le catalogue
ne s'énumère pas. Les erreurs ordinaires renvoient un 500 générique.

```ts
createServer({
  functions,
  runtimeOptions: { timeoutMs: 15_000, maxBodyBytes: 1_048_576 },
  security: { allowedOrigins: ['https://app.example.com'] },
});
```

Chaque server function doit déclarer explicitement sa politique d’erreurs HTTP
après son handler. Même une fonction qui ne publie aucune erreur doit appeler
`.exposeErrors({})` :

```ts
const listUsers = serverFunction(/* ... */)
  .handler(/* ... */)
  .exposeErrors({
    UsersNotFound: (errorPayload) => ({
      code: 'USERS_NOT_FOUND',
      status: 404,
      payload: { filter: errorPayload.filter },
    }),
  });
```

Le callback contrôle explicitement les propriétés qui franchissent la frontière
HTTP ; une erreur taguée absente de cette projection reste interne. La
résolution directe et le SSR conservent l'erreur métier originale.

## Serveur HTTP et adapters

```ts
createHttpServer({
  trustedHosts: ['app.example.com'],
  allowedOrigins: ['https://app.example.com'],
  maxConcurrentRequests: 64,
  middleware: [
    createRateLimitMiddleware({ limit: 60, windowMs: 60_000, key: ipOf }),
    createCsrfMiddleware(),
    createSecurityMiddleware({ forceHttps: true }),
  ],
});
```

- `trustedHosts` est le réglage qui rend les contrôles CSRF fiables :
  l'origine d'une requête est déduite de son en-tête `Host`, que le client
  écrit. Même exigence sur `createCraftLambdaFetch(app, { trustedHosts })`.
- Les gardes d'entrée passent **avant** la résolution de session, et une
  session illisible produit une réponse d'erreur propre.
- `createRateLimitMiddleware` exige une `key` explicite.
- `createSecurityMiddleware` émet une CSP avec le nonce de la requête
  (`context.cspNonce`), `form-action`, COOP/CORP, et redirige le trafic clair
  quand `forceHttps` est actif.

## CSP et Trusted Types

Le nonce circule de bout en bout :

```ts
const nonce = createCspNonce();            // ou context.cspNonce
renderCraft({ config, url, cspNonce: nonce });
response.setHeader('content-security-policy', contentSecurityPolicy(nonce));
```

Les styles SSR et les feuilles injectées par le renderer le portent, la CSP
n'a donc pas besoin de `'unsafe-inline'`. `apps/demo-ssr/src/production-server.ts`
montre le câblage complet.

Trusted Types n'est pas implémenté par la lib. Les seules affectations de HTML
brut passent par `innerHTML` dans le renderer : c'est le point unique à
couvrir par une politique Trusted Types côté application.

## Vérification

```bash
npm run security:check
npm run security:test
```

`craft security check --strict` signale l'absence de politique, les limites
manquantes, les catalogues d'erreurs vides ou absents, le stockage de tokens,
le HTML brut, l'évaluation dynamique, les forwarded headers, `unsafe-inline`,
le mode de transfert `legacy` et les exceptions expirées. Un `craft-security.json`
à la racine permet d'exclure des chemins et de rétrograder un code en
avertissement ; une occurrence isolée s'exempte avec
`// craft-security-ignore <CODE>` sur la ligne concernée ou juste au-dessus.

Les deux commandes tournent dans `production-readiness.yml` et dans
`npm run release:preflight`.

## Règles ESLint

Le préréglage sécurité est **inclus dans `recommended` et dans `effect`** : il
s'applique donc à tout projet CraftTS, y compris ceux créés par `craft new`,
sans réglage supplémentaire. `craftRules.configs.security` permet de l'appliquer
seul, sur une lib ou un dossier d'outillage qui ne prend pas `recommended`.

| Règle | Ce qu'elle attrape |
| --- | --- |
| `no-raw-user-url` | URL dynamique posée dans `href`/`src`/`srcset`… d'un template, sans `safeUrl` |
| `no-unsafe-html` | `innerHTML`/`outerHTML`/`srcdoc`, `insertAdjacentHTML`, `eval`, `document.write`, `unsafeHtml` sans exception |
| `no-unsafe-transfer-state` | `renderCraft` ou `captureCraftTransferSnapshot` sans politique |
| `require-server-function-timeout` | registre de server functions sans `timeoutMs`/`maxBodyBytes` |
| `require-route-security-policy` | route sans politique `ssr` **dans un fichier qui en déclare déjà** (option `mode: 'required' \| 'auto' \| 'off'`) |
| `no-trust-forwarded-headers` | `x-forwarded-*` lu hors du module de frontière proxy (option `allowIn`) |
| `no-auth-token-in-local-storage` | jeton d'authentification persisté dans le navigateur |

Deux choix limitent volontairement le bruit : la règle d'URL ne regarde que
les objets d'attributs passés à un helper d'élément (pas un champ métier
nommé `href`), et la règle de route reste silencieuse tant que l'application
ne rend rien côté serveur. Chaque règle a ses tests dans
`libs/dev-tools/src/eslint-rules/security.spec.ts`.

## Exceptions

```ts
allowUnsafe('raw-html', {
  owner: 'frontend-team',
  reason: 'Contenu sanitizé par le backend',
  risk: 'XSS stockée si le backend régresse',
  expires: '2026-12-31',
});
```

`unsafeHtml()` sans exception dans le fichier est une erreur de lint, et une
exception expirée fait échouer `craft security check`.
