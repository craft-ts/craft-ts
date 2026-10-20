# Inventaire des comparaisons du replay

Cet inventaire décrit le comportement du replay v5 avant la définition d’un
contrat de scénario. Les tolérances listées ici sont le comportement actuel du
code, pas des garanties métier à reprendre automatiquement dans le futur
schéma.

## Comparaisons actuelles

| Donnée                                     | Comparaison actuelle                                                                                                                                                                                                          | Conséquence à surveiller                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint Craft à la racine               | Seules les clés présentes dans l’attendu **et** l’observé sont comparées. Une clé ajoutée ou supprimée à la racine ne diverge pas.                                                                                            | Une suppression d’état attendu ou un nouvel état observé peut passer inaperçu. Ce comportement vise les changements de cycle de vie du registre lors d’une transition de route.                 |
| Valeur imbriquée d’un checkpoint           | Les objets sont comparés comme des sous-ensembles de l’attendu : les clés attendues doivent exister et correspondre, les clés observées supplémentaires sont ignorées.                                                        | L’ajout d’un champ imbriqué n’échoue pas. Les tableaux, eux, gardent longueur et ordre stricts.                                                                                                 |
| Marqueurs de sérialisation d’un checkpoint | `[Circular]` et `[Depth limit]` correspondent à toute valeur runtime.                                                                                                                                                         | Une branche difficile à sérialiser ne peut pas servir d’assertion fiable.                                                                                                                       |
| Payload de requête `fetch`                 | Méthode et chemin sont comparés. Les paramètres d’URL sont triés par clé; `[REDACTED]` accepte n’importe quelle valeur pour ce paramètre.                                                                                     | Le tri autorise les permutations d’URL; le marqueur expurgé ne vérifie pas la valeur. Les paramètres répétés conservent leur ordre relatif pour une même clé.                                   |
| Corps de requête `fetch`                   | JSON comparé récursivement selon les clés de l’attendu; `[REDACTED]` accepte toute valeur à cet emplacement. Pour les corps non JSON, la comparaison utilise une recherche de sous-chaîne.                                    | Les clés observées supplémentaires passent; les corps texte et les corps JSON mal formés peuvent correspondre par inclusion partielle.                                                          |
| Fixture de réponse `fetch`                 | La réponse enregistrée (succès ou échec) est fournie par le résolveur; une requête sans fixture correspondante ne reçoit aucune réponse de ce résolveur.                                                                      | La frontière réseau ne dispose pas de fallback live dans la garde de replay.                                                                                                                    |
| Appels Craft observés                      | L’ordre des invocations est vérifié par séquence causale; les appels portant le même nom sont groupés et leur nombre par phase est comparé.                                                                                   | Les arguments et sorties d’appel ne sont pas une égalité générique de payload dans ce comparateur; les invocations rejouées et checkpoints portent les vérifications de comportement associées. |
| Cibles DOM                                 | L’identité Craft résout la cible; les informations DOM locales et visuelles servent au diagnostic et aux repères. Une cible nécessaire absente ou ambiguë diverge; certaines interactions purement visuelles peuvent avertir. | Ne pas transformer les coordonnées ou sélecteurs de diagnostic en assertions métier implicites.                                                                                                 |
| Timeline                                   | L’ordre d’événements et les temps écoulés orientent l’exécution; le replay attend le temps causal et les opérations attendues.                                                                                                | L’ordre des méthodes `method:*`, `query:*` ou `mutation:*` ne doit pas devenir un oracle indépendant du contrat causal.                                                                         |

## Cas caractérisés

Les tests de `debug-session-replay.spec.ts` couvrent déjà :

- un checkpoint différent qui diverge avec l’événement, l’attendu et l’observé ;
- un checkpoint qui tolère les primitives absentes après transition de route ;
- le rejeu d’une réponse `fetch` enregistrée et l’absence de réponse pour une URL
  sans fixture ;
- les requêtes concurrentes Craft HTTP identiques, refusées sans clés de replay
  distinctes ;
- une cible sémantique absente ou ambiguë et le fait que le replay ne redistribue
  pas les événements natifs.

Les cas du présent inventaire caractérisent également l’asymétrie des
checkpoints : une clé uniquement observée est tolérée au niveau racine, tandis
qu’une clé attendue mais absente dans un objet partagé diverge. Ces assertions
servent à borner le comportement existant et devront être remplacées ou
reclassées quand les règles de scénario seront définies.

## Prochaines décisions

Avant d’étendre les comparaisons, le contrat de scénario doit préciser :

- quels chemins de snapshot sont contractuels malgré les changements de route ;
- si un champ expurgé vérifie seulement la présence et la structure, ou aussi le
  type de la valeur runtime ;
- si les corps texte peuvent déclarer une normalisation, avec égalité stricte
  comme défaut ;
- où résident les scénarios versionnés et comment une tolérance est validée et
  affichée dans un rapport.

Le comportement courant reste inchangé par cette phase d’inventaire.

## Contrat du mode scénario

Le mode `runReplayTest` ajoute une voie distincte du replay de diagnostic :

- Les checkpoints du scénario lisent un chemin JSON Pointer exact dans l’état
  Craft final. Les clés présentes/absentes sont comparées strictement par
  défaut. Le chemin de tolérance est relatif à la valeur `expected` de
  l’assertion.
- Les assertions d’invocation, HTTP et transport utilisent des clés métier
  sémantiques, sans dépendre des IDs d’événement de l’archive. Les champs
  déclarés sont comparés strictement ; les champs omis ne font pas partie du
  contrat.
- Les fixtures réseau du mode scénario exigent méthode, origine, chemin,
  paramètres et corps exacts. Un corps expurgé n’est admis que si une assertion
  HTTP et une tolérance `redacted` ciblée autorisent précisément ce champ. Les
  appels sans fixture restent bloqués par la garde réseau.
- Les cibles DOM archivées sont informatives pendant l’exécution métier. Une
  assertion visuelle explicite cible un `data-replay-id` unique et produit une
  divergence classée `visual-only`.
- Le runner ne propose pas les commandes de reprise/saut du dashboard ; il
  termine en échec ou en non rejouable dès qu’il ne peut pas poursuivre. Les
  résultats incluent l’assertion divergente et les tolérances effectivement
  utilisées.

Le replay de diagnostic conserve son comportement historique, y compris les
comparaisons de snapshots partielles décrites ci-dessus. Les scénarios de test
ne s’appuient pas sur cette comparaison implicite : ils déclarent leurs
invariants explicitement.
