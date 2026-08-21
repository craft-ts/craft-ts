# SSR lab

Mini-application pédagogique qui montre six frontières de rendu :

- `/static` : HTML utile rendu entièrement par le serveur ;
- `/request?name=Ada` : personnalisation via URL, cookies et headers ;
- `/data` : données attendues côté serveur avant la réponse ;
- `/deferred` : shell SSR puis bloc chargé après hydratation ;
- `/client-only` : viewport et `localStorage`, disponibles seulement dans le navigateur ;
- toute route inconnue : réponse 404 rendue par le serveur.

Cette app est volontairement autonome. Le roadmap du dépôt indique que Craft n'a pas encore de renderer SSR produit ; cette demo isole donc le rôle de l'hôte SSR autour d'une app HTML/TypeScript.

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
