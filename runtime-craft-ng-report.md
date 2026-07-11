# Rapport de tentative runtime Craft NG

Date: 2026-07-10

Contexte:
- Objectif: remplacer la liste affichée au runtime par les mêmes `id`, mais avec des `name` plus rigolos.
- Approche demandée: utiliser le skill `craft-ng-runtime-change-web-mcp` et modifier l'état exposé par le runtime Craft NG, sans éditer le code TypeScript.

## Ce qui a été fait

### 1. Découverte du client runtime

J'ai d'abord listé les clients connectés au registry runtime.

Résultat:
- `clientId`: `f0457adb-bd8b-419e-8874-0bd2f17a67ec`
- `pageUrl`: `http://localhost:4200/list-with-pagination`
- `pageTitle`: `demo`

### 2. Inventaire des entrées registry

J'ai listé les entrées actives pour ce `clientId`.

Entrées repérées:
- `queryParam <= route:list-with-pagination#2 > component:ListWithPagination#3`
- `method:nextPage <= route:list-with-pagination#2 > component:ListWithPagination#3 > queryParam`
- `method:previousPage <= route:list-with-pagination#2 > component:ListWithPagination#3 > queryParam`
- `method:updatePageSize <= route:list-with-pagination#2 > component:ListWithPagination#3 > queryParam`
- `query <= route:list-with-pagination#2 > component:ListWithPagination#3`

L'entrée intéressante était:
- `query <= route:list-with-pagination#2 > component:ListWithPagination#3`

### 3. Inspection de la primitive

J'ai lu l'entrée `query` pour confirmer sa nature.

Résultat:
- `primitive.kind`: `query`
- `primitive.grouped`: `true`
- `primitive.ids`: `["1-4"]`
- capacités exposées:
  - `query.get`
  - `query.set`
  - `query.update`
  - `query.patch`
  - `query.ids`
  - `query.select`

### 4. Tentative de patch runtime

J'ai tenté un `registry_query_patch` sur l'id groupé `1-4` avec le payload suivant:

```json
{
  "clientId": "f0457adb-bd8b-419e-8874-0bd2f17a67ec",
  "key": "query <= route:list-with-pagination#2 > component:ListWithPagination#3",
  "id": "1-4",
  "source": "(current) => {\n  if (Array.isArray(current)) {\n    return current.map((item) => ({\n      ...item,\n      name: `Simon ${item.id}`,\n    }));\n  }\n\n  if (current && Array.isArray(current.items)) {\n    return {\n      ...current,\n      items: current.items.map((item) => ({\n        ...item,\n        name: `Simon ${item.id}`,\n      })),\n    };\n  }\n\n  return current;\n}"
}
```

Intention du patch:
- garder les mêmes `id`
- remplacer uniquement `name`
- supporter les deux formes de données possibles:
  - tableau direct
  - objet avec propriété `items`

### 5. Résultat du patch

Le call a échoué côté MCP avec une erreur de validation du résultat du tool.

Symptôme principal:
- `Invalid tools/call result`
- le retour contenu par le tool ne respectait pas le schéma attendu

En pratique, le bridge a renvoyé un payload qui ne correspondait pas au format attendu par le transport MCP, avec notamment un résultat considéré comme invalide au niveau de `content[0]`.

### 6. Vérification via logs

J'ai ensuite relu les logs runtime.

Événements importants:
- `primitive-mutated` enregistré pour:
  - `query <= route:list-with-pagination#2 > component:ListWithPagination#3#1-4`
- message:
  - `Primitive value patch succeeded for query <= route:list-with-pagination#2 > component:ListWithPagination#3#1-4`

Interprétation:
- le runtime a bien enregistré la mutation comme réussie dans ses logs
- malgré ça, la couche MCP a renvoyé une erreur de validation au moment de remonter le résultat

## Hypothèse de diagnostic

Il y a probablement une divergence entre:
- le succès côté runtime/registry
- et le format de réponse attendu par le wrapper MCP `registry.query.patch`

Points à vérifier:
1. si le patch doit retourner une valeur très précise au lieu d'un updater plus générique
2. si l'entrée groupée `1-4` nécessite une forme de payload différente
3. si le bug vient du bridge MCP qui sérialise mal le résultat de succès
4. si la valeur réellement mutée est bien visible dans l'UI malgré l'erreur de transport

## État final

- tentative de mutation runtime effectuée
- échec apparent côté MCP transport
- logs runtime indiquent un succès de mutation
- une vérification visuelle complète n'a pas pu être faite ici, car Playwright Chromium n'était pas installé dans l'environnement

