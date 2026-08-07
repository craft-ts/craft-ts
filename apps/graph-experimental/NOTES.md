# Graph experimental

Prototype disposable pour tester `ng-diagram` avec le graphe statique de Craft NG.

## Question testée

Est-ce qu'un canvas Angular spécialisé rend le graphe plus lisible tout en conservant
la granularité de l'analyse ?

## Contrat de granularité

- un nœud `DependencyGraphNode` devient un nœud `ng-diagram` ;
- une entrée `DependencyGraphEdge` devient un lien `ng-diagram` ;
- les types de nœuds, types de liens, preuves AST/type et détails restent dans
  `data` pour l'inspection ;
- la vue par route filtre le graphe sans agréger ses nœuds ni ses liens.

Les composants et services qui possèdent des liens `contains` vers des
propriétés ou primitives sont rendus comme des groupes `ng-diagram`. Le groupe
est uniquement une enveloppe visuelle : les nœuds internes conservent leur ID,
leur type, leurs données et leurs liens individuels. Il n'y a donc pas de
regroupement sémantique ni de perte de granularité.

Chaque composant contient également un sous-groupe visuel `template`. Les liens
`renders` partent de ce sous-groupe, tandis que l'identifiant du lien continue
de référencer l'arête statique originale.

Les propriétés de sortie d'une primitive peuvent être placées dans son bloc
lorsque leur chemin correspond à la propriété portée par cette primitive
(par exemple `GranularMutation.users...` dans `query:users`). Une propriété
d'un autre service utilisée via `depends-on`, comme `ApiService.updateItem`,
reste dans son service ; le lien direct vers la propriété reste visible sans
modifier sa propriété sémantique.

Le survol d'un nœud active ses voisins directs et leurs liens ; les éléments
non reliés sont atténués temporairement pour faciliter la lecture du graphe.

## Essai de carte synthèse

La vue « Vue synthèse » conserve les routes individuellement, mais regroupe les
autres nœuds par fichier. Les liens `contains` et `uses-property` internes sont
retirés de cette carte ; les liens `loads`, `renders` et `depends-on` sont
agrégés avec leur nombre d'occurrences. La vue détaillée reste disponible pour
inspecter les propriétés, primitives et liens unitaires.

La vue « Vue constellation » conserve les composants, services, primitives et
propriétés actifs, mais abandonne les blocs de la vue détaillée. Une disposition
force-directed place les éléments comme une vraie constellation : une répulsion
générale écarte les nœuds, une collision impose une marge minimale, puis une
passe de séparation corrige les chevauchements résiduels. Chaque liaison ajoute
un point de poids aux deux extrémités, les composants/services grossissent selon
leur poids macro, et les primitives/propriétés grossissent selon leur poids local.
Les liens `contains` sont utilisés comme ressorts invisibles pour garder les
satellites proches de leur propriétaire, sans être dessinés.

Le fichier `craft-dependency-graph.json` est copié comme asset depuis la racine du
dépôt au build. Il doit donc être régénéré avec l'analyseur statique avant un test
sur une nouvelle version du projet démo.
