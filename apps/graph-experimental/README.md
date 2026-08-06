# Graph experimental

Prototype Angular/Nx pour tester `ng-diagram` avec le graphe statique Craft NG.

## Lancer

Depuis la racine du dépôt :

```bash
npx nx serve graph-experimental
```

URL : `http://localhost:4300/`

La page s'ouvre sur la route `demo:craft/granular-mutation`. Le sélecteur permet
de changer de route et le bouton « Afficher tout le graphe » permet de tester le
canvas avec les 261 nœuds actuels.

## Régénérer la source typée

Le visualiseur ne fait aucune analyse runtime. Il consomme le fichier JSON généré
par l'analyseur TypeScript :

```bash
npx craft graph --project apps/demo/tsconfig.app.json --root . --out craft-dependency-graph --format json
```

Puis relancer `npx nx serve graph-experimental` pour recharger l'asset.
