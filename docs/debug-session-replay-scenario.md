# Contrat d’un scénario de replay

Un scénario est un fichier JSON sidecar, par exemple
`users-list.replay-scenario.json`. Son schéma évolue séparément de l’archive
`craft-debug-session`. Il ne contient ni code exécutable ni identifiant interne
d’événement d’archive : ses assertions décrivent le contrat métier, les
opérations observables et les cibles visuelles stables.

```json
{
  "format": "craft-replay-scenario",
  "schemaVersion": 1,
  "id": "users-list",
  "scenarioVersion": 1,
  "reason": "The list count is part of the user contract.",
  "checkpoints": [
    { "id": "loaded-count", "path": "/users/count", "expected": 2 }
  ],
  "eventAssertions": [
    {
      "id": "load-page-one",
      "kind": "invocation",
      "expected": {
        "address": "component:Users / method:loadUsers",
        "args": [{ "page": 1 }]
      }
    }
  ],
  "visualAssertions": [
    {
      "id": "save-control",
      "targetId": "save-user",
      "expected": {
        "present": true,
        "role": "button",
        "accessibleName": "Save"
      }
    }
  ],
  "tolerances": []
}
```

`checkpoints` lisent un chemin JSON Pointer exact dans l’état Craft final.
`eventAssertions` vérifient les invocations, les requêtes/réponses HTTP ou les
messages de transport réellement observés pendant le replay. Les assertions
HTTP décrivent méthode, URL et champs de requête/réponse utiles. Les champs
omis sont informatifs ; les champs déclarés sont stricts par défaut. Une
assertion visuelle cible un `data-replay-id` unique et peut vérifier présence,
élément, rôle et nom accessible. Les événements DOM de l’archive restent des
repères de présentation et ne lient pas le contrat du scénario à leurs IDs.

Les tolérances disponibles sont `ignore` (la valeur varie, le champ doit
exister), `redacted` (l’attendu doit être `[REDACTED]`), `number` (marges
absolue et relative bornées), `unordered` (tableau déclaré comme ensemble) et
`url` (tri des paramètres et suppression facultative de clés volatiles
nommées). Chaque tolérance cible un chemin JSON Pointer exact et une seule
assertion. Pour un checkpoint, ce chemin est relatif à sa valeur `expected`,
pas au chemin d’état sélectionné. Les jokers, chemins secrets, chevauchements et tolérances
numériques non bornées sont refusés. Aucune tolérance globale n’existe.

Valider avec `validateReplayScenario(json)`, puis lancer
`runReplayTest(session, json, options)`. Le résultat structuré distingue un
succès, un échec, une session partielle/non rejouable et une capture
incompatible ; il inclut le premier écart, les assertions évaluées et les
tolérances utilisées. `runReplayTestOrThrow` lève
`ReplayScenarioTestError` si le verdict n’est pas réussi. Le runner valide
l’archive, utilise le replay par invocation, n’expose aucune commande de
récupération manuelle et garde le réseau réel bloqué.

`proposeReplayScenarioRecapture` prépare une proposition versionnée à partir
de valeurs revues, d’une raison, d’un auteur, de la version de l’application
et des adaptateurs. Il retourne l’ancienne référence, la nouvelle proposition
et le diff sans écrire de fichier. Un passage réussi ne met jamais à jour les
attendus automatiquement. `replayScenarioLifecycle` classe les états du
scénario ; `createReplayDriftReport(results)` regroupe les écarts métier,
visuels, tolérés et les incompatibilités sans fusionner leurs significations.
