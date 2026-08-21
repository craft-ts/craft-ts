# SSR lab

Mini-application pédagogique qui montre plusieurs frontières de rendu :

- `/static` : HTML utile rendu entièrement par le serveur ;
- `/request?name=Ada` : personnalisation via URL ;
- `/data` : données attendues côté serveur avant la réponse ;
- `/fallback` : shell SSR puis bloc différé dans un `pendingBlock` ;
- `/client-only` : viewport et `localStorage`, disponibles seulement dans le navigateur ;
- toute route inconnue : réponse 404 rendue par le serveur.

Cette app est une vraie application CraftTS. Elle utilise `renderCraft` pour
produire le document initial, le snapshot de transfert et les styles SSR, puis
`hydrateCraft` reprend ce même arbre côté navigateur. Les liens passent alors
par le routeur CraftTS et deviennent des navigations SPA.

Les routes montrent trois décisions distinctes :

- `data` : `ssr: { mode: 'block' }`, la query est résolue avant la réponse ;
- `fallback` : `ssr: { mode: 'fallback' }`, le shell et le `pendingBlock` partent immédiatement ;
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
