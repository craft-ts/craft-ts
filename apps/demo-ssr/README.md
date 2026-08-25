# SSR lab

Mini-application pédagogique qui montre plusieurs frontières de rendu :

- `/static` : HTML utile rendu entièrement par le serveur ;
- `/request?name=Ada` : personnalisation via URL ;
- `/data` : données attendues côté serveur avant la réponse ;
- `/fallback` : shell SSR puis bloc différé dans un `pendingNode` ;
- `/client-only` : viewport et `localStorage`, disponibles seulement dans le navigateur ;
- toute route inconnue : réponse 404 rendue par le serveur.

Cette app est une vraie application CraftTS. Elle utilise `renderCraft` pour
produire le document initial, le snapshot de transfert et les styles SSR, puis
`hydrateCraft` reprend ce même arbre côté navigateur. Les liens passent alors
par le routeur CraftTS et deviennent des navigations SPA.

Les routes montrent trois décisions distinctes :

- `data` : `ssr: { mode: 'block' }`, la query est résolue avant la réponse ;
- `fallback` : `ssr: { mode: 'fallback' }`, le shell et le `pendingNode` partent immédiatement ;
- `client-only` : `ssr: { mode: 'client' }`, la query ne démarre qu'après hydratation.

## Lancer

```bash
npx nx serve demo-ssr
```

Puis ouvrir <http://localhost:4300>.

La requête initiale est rendue par SSR. Une fois le JavaScript hydraté, les
liens internes, les formulaires GET et le bouton retour utilisent une
navigation SPA avec `history.pushState` : le renderer universel s’exécute dans
le navigateur et seul le contenu de la route est remplacé, sans requête de
document ni rechargement complet.

Pour vérifier les scénarios sans navigateur :

```bash
npx nx test demo-ssr
npx nx typecheck demo-ssr
```

## Production

Le bundle SSR de production est autonome et se lance sans serveur Vite :

```bash
npm run demo:ssr:production
```

L'entrée accepte `HOST` (défaut `0.0.0.0`), `PORT` (défaut `4300`),
`GRACEFUL_SHUTDOWN_TIMEOUT_MS` (défaut `10000`), `PUBLIC_ORIGIN` et
`FORCE_HTTPS=true` lorsque TLS est terminé par un proxy de confiance.
`CORS_ORIGINS` accepte une liste d'origines séparées par des virgules. Les
probes sont disponibles sur `/health` (processus vivant) et `/ready` (processus
prêt à accepter du trafic). `RATE_LIMIT_MAX` (défaut `120`) et
`RATE_LIMIT_WINDOW_MS` (défaut `60000`) limitent les routes API par adresse
transmise par le proxy (`x-forwarded-for`, puis `x-real-ip`) ; `RATE_LIMIT_MAX=0`
désactive ce contrôle local.

Les routes `/health`, `/ready` et `/api/*` passent par le registre HTTP
portable de `@craft-ts/core`. Il applique les limites de body, timeout, CORS,
CSRF pour les mutations avec cookie, rate limiting, métriques en mémoire,
request ID et logs JSON structurés. Le rate limiting mémoire doit être remplacé
par un store partagé avant un déploiement multi-instance.

Le chemin Docker reproductible est :

```bash
docker compose -f docker-compose.production.yml up --build
```

Le smoke test utilisé par le contrôle de production démarre directement
`dist/apps/demo-ssr/server/server.js`, vérifie les probes, le SSR, le 404 et
les headers de sécurité, puis arrête le processus avec `SIGTERM`.
