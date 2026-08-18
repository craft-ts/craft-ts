# Demo with server function

Cette démo montre deux formes de server function :

```txt
cas simple appelé depuis CraftTS
  -> users/list.fn-client.ts
  -> users/list.fn-serveur.ts
  -> aucun accès à la DI client

cas appelé depuis CraftTS avec une identité authentifiée
  -> users/authenticated-list.fn-client.ts
  -> users/authenticated-list.fn-serveur.ts
  -> service CurrentUser Effect côté serveur + UserRepository
```

La page CraftTS utilise le premier cas et montre le chemin complet :

```txt
client facade
  -> HTTP POST /__server-functions
  -> registre createServer
  -> handler server function
  -> Effect.gen
  -> UserRepository fourni par une Layer Effect
  -> fichier local data/users.json
```

Elle contient une vraie page front-end CraftTS. Le fichier serveur possède son
schéma d'entrée Effect et le fichier client importe uniquement le type de la
server function avec `import type`. Le composant utilise les
helpers `craftComponent`, `state`, `query`, `craftComputed`, `each` et `ifBlock`.
Son formulaire appelle la façade client dans le navigateur ; le plugin du
serveur Vite branche ensuite `/__server-functions` sur le registre de fonctions
serveur.

Le pont HTTP Node n'est pas une implémentation maison : la démo utilise
`@effect/platform-node/NodeHttpServer.makeHandler` pour adapter l'application
Web du registre Craft aux requêtes/réponses Node. Le registre Craft reste chargé
de résoudre la server function et son protocole JSON, tandis qu'Effect prend en
charge l'exécution HTTP et le cycle de vie des requêtes.

Le cas `users/list.fn-serveur.ts` est le chemin simple utilisé par la page
CraftTS. Il est exposé au client, mais ne déclare aucun `requireClientDI` : le
serveur conserve le schéma et l'identifiant RPC, tandis que la façade client
fait `createServerFunctionClient<typeof ServerListUsers>('demo.users.list')`.

Le cas `authenticated-list` est volontairement plus complet. Le front peut
envoyer un `userId`, mais cette valeur est considérée comme non fiable. Le
serveur résout le service Effect `CurrentUser` depuis sa `Layer` (ici une
session fictive), vérifie que les deux identifiants correspondent et applique
aussi la permission `users:read`. En production, la `Layer` remplacerait cette
session de démo par la vraie identité issue de la requête ou du provider
d'authentification.

La base locale est le fichier `data/users.json`, lu par un repository Effect ;
aucun serveur de base de données ni package natif n’est nécessaire. Le handler
serveur retourne un `Effect` avec une erreur métier typée et une dépendance
`UserRepository`.

Depuis la racine du dépôt, lancer l'application :

```bash
npm start
```

Cette commande est un alias de :

```bash
npx nx serve demo-with-server-function
```

Puis ouvrir [http://localhost:4202](http://localhost:4202).

Vite sert le front-end et expose également le backend sur
`POST /__server-functions` grâce au plugin de démo. Il n'y a donc pas deux
processus ni de configuration CORS à lancer pour cette démo : le front appelle
la server function sur la même origine, et celle-ci exécute Effect côté serveur.

Le filtre est envoyé au serveur et les résultats viennent de `data/users.json`.
La server function attend volontairement 600 ms avant de lire la base afin de
rendre visible l'état de chargement dans l'interface.
Pour lancer uniquement le test d'intégration :

```bash
npx nx test demo-with-server-function
```

Ou directement :

```bash
npx vitest run --config apps/demo-with-server-function/vitest.config.ts
```

La sortie du test affiche également la requête client et les lignes lues depuis
la base locale.
