# Demo with server function

Cette démo montre le chemin complet :

```txt
client facade
  -> HTTP POST /__server-functions
  -> registre createServer
  -> handler server function
  -> Effect.gen
  -> UserRepository fourni par une Layer Effect
  -> SQLite locale node:sqlite
```

La base SQLite est créée en mémoire avec `node:sqlite`, donc aucun serveur de
base de données ni package natif n’est nécessaire. Le handler serveur retourne
un `Effect` avec une erreur métier typée et une dépendance `UserRepository`.
Il faut Node `22.5+` ; le dépôt de démonstration utilise Node `25.2.1`.

Depuis la racine du dépôt :

```bash
npx nx test demo-with-server-function
```

Ou directement :

```bash
npx vitest run --config apps/demo-with-server-function/vitest.config.ts
```

La sortie affiche la requête client et les lignes lues depuis SQLite.
