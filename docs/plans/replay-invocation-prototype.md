# Replay des sessions par invocation

**État : implémentation expérimentale du format v5.** Le replay du dashboard
utilise les invocations Craft comme commandes ; les événements DOM restent des
repères visuels.

## Contrat actif

- Les interactions DOM, hover, scroll et viewport restent dans la timeline,
  mais le replay d’invocation n’émet aucun `click`, `pointer*`, `mouse*`,
  `key*`, `input`, `change` ni événement applicatif `scroll`. Les valeurs de
  formulaire et les positions de scroll peuvent être appliquées pour
  présentation.
- `deferNode` enregistre son activation sémantique, son déclencheur (`immediate`,
  `idle`, `viewport` ou `interaction`) et son issue. Le replay résout le nœud par
  l’identité de rendu du premier élément disponible, ou par le chemin du
  composant lorsqu’il n’y en a pas, puis appelle son loader directement ; il ne
  redistribue pas le clic ou la touche. Le déclencheur `interaction` conserve
  son `correlationId` lorsqu’il est disponible ; les activations automatiques
  ne reprennent pas un identifiant d’interaction précédent. Un identifiant
  instable, absent ou ambigu arrête cette étape avec un diagnostic explicite.
- Les méthodes `craftMethod` et celles exposées par `state`, `queryParams`,
  `query`, `mutation` et `asyncProcess` enregistrent leur adresse, leurs
  arguments sérialisés, leur opération et leur parent causal. Le graphe rejoue
  ses racines ; les descendants sont exécutés par leur parent. Des racines
  distinctes de la même interaction restent distinctes.
- Les arguments de replay ne sont capturés que si l’option est activée et le
  serveur d’archive est loopback. Un appel sans métadonnées complètes est refusé
  avant le démarrage. Les adresses peuvent être normalisées en retirant les
  ordinaux d’instance uniquement si une seule méthode correspond ; une adresse
  absente ou ambiguë produit une erreur.
- Le dashboard sélectionne explicitement le mode `invocation`. Le mode
  `legacy-dom` existe comme compatibilité isolée dans le contrôleur et n’est
  jamais le fallback du dashboard.
- Le format d’archive est v5. Le validateur rejette v1–v4 sans migration
  silencieuse ; une archive tronquée peut être inspectée mais pas rejouée.

Les activations `deferNode` utilisent le type d’événement extensible du format
v5 et ne changent pas sa structure requise ; aucune migration n’est nécessaire.
Les déclencheurs natifs ne sont pas installés pendant le replay. Les effets
uniquement liés à d’autres listeners natifs (appui long, scroll, saisie ou
hover) restent hors de ce premier chemin sémantique.

## Inventaire des déclencheurs natifs

| Famille                                                      | Capture actuelle                                                                                                                                                                                                                         | Replay v5                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deferNode` (`immediate`, `idle`, `viewport`, `interaction`) | Activation, déclencheur et issue enregistrés comme événements `defer`.                                                                                                                                                                   | Loader activé par identité et à l’instant capturé.                                                                                                                                                                        |
| `longPress` (`pointerdown` puis timer)                       | Le listener direct de la directive n’est pas capturé comme étape DOM et aucun événement `longPress` ne relie le timer à son handler. L’appel Craft du handler peut apparaître dans la trace si son contexte d’invocation est capturable. | Le geste et son délai ne sont pas simulés. Sans étape de replay causale, la présence d’un appel dans la trace ne garantit pas qu’il sera rejoué. Il faut un événement sémantique dédié avant de prendre ce cas en charge. |
| Scroll                                                       | Position d’écran ou de conteneur échantillonnée dans la timeline.                                                                                                                                                                        | Position restaurée pour présentation ; aucun événement `scroll` n’est distribué et les handlers de chargement ne s’exécutent pas.                                                                                         |
| Hover                                                        | Entrée et sortie sémantiques capturées comme étapes `hover`.                                                                                                                                                                             | Repère visuel uniquement ; pas de `pointerover`/`pointerout` applicatif.                                                                                                                                                  |
| Saisie native                                                | `input`/`change` capturés comme étapes DOM. La valeur n’est stockée qu’avec l’option de capture correspondante et selon les règles de données sensibles.                                                                                 | La valeur peut être restaurée pour présentation ; les événements `input`/`change` ne sont pas distribués, donc un listener natif qui produit seul l’effet métier ne le reproduit pas.                                     |
| Routes différées (`loadCraftComponent`, `loadChildren`)      | La navigation et les appels Craft du chargement peuvent être observés ; l’issue de l’`import()` dynamique n’a pas d’événement dédié.                                                                                                     | La navigation est rejouée par le routeur, mais la résolution ou l’échec de l’`import()` dépend du chargeur et du cache du navigateur. Le replay n’en valide pas l’issue séparément.                                       |

Pour une stratégie de prise en charge de `longPress` sans redistribuer ses
événements natifs ni exécuter son handler deux fois, voir le
[plan de replay sémantique des appuis longs](./replay-long-press-semantique.md).

## Résultats de l’audit des scénarios existants

- `longPress` est une directive de démonstration, pas un événement du contrat de
  replay. Son test unitaire vérifie bien le timer et `grid.paintColumn` en
  exécution normale ; aucun scénario ne relie actuellement cet appui à une
  étape sémantique de replay. Le scénario du contrôleur confirme que
  `pointerdown` reste visuel et n’exécute pas le listener de l’application. Ne
  pas traiter la seule trace éventuelle de la méthode comme preuve que l’appui
  long est rejoué.
- Les scénarios du moteur enregistrent puis activent explicitement les modes
  `immediate`, `idle` et `viewport`. Ils confirment que le replay n’installe
  pas leurs déclencheurs navigateur et n’appelle le loader qu’une fois à
  l’activation sémantique. Le scénario d’interaction couvre click, et le
  contrôleur vérifie séparément une issue `error` ainsi qu’un loader qui
  récupère avec `withRetry`.
- Le replay a des tests dédiés qui vérifient qu’un clic et un hover restent
  visuels, que les valeurs de formulaire et positions de scroll sont restaurées,
  et que les handlers d’application de scroll ne sont pas exécutés. Ces tests
  couvrent le contrat de non-redistribution, pas les effets natifs dépendant de
  ces événements.
- Les tests du routeur couvrent le chargement différé et les erreurs de
  `loadChildren` en fonctionnement normal. Le scénario de replay fait attendre
  la navigation sur un `loadChildren` différé pendant que la timeline avance ;
  il ne capture pas l’issue d’un véritable `import()` de route. Ce dernier cas
  reste à instrumenter séparément.

## État initial et lancement

Le format transporte un snapshot Craft (`initialSnapshot`), les événements de
snapshot des persisters et, si la capture locale est activée, un événement
`browser-storage-initial` avec le stockage sérialisé. Le dashboard peut démarrer
à l’URL enregistrée ou à une URL choisie, mais les deux modes restaurent les
snapshots disponibles. Le démarrage par snapshot exige un snapshot Craft.

Pour un lancement marqué, l’initialiseur de l’application attend le message
`start` du dashboard avant de libérer le bootstrap. S’il faut restaurer le
stockage navigateur, il le restaure puis recharge la page. Au lancement suivant,
il restaure les registres Craft et persister et installe les résultats HTTP et
les doubles WebSocket/Worker avant que les composants racines ne créent leurs
loaders. Le contrôleur installe également la garde `fetch`; aucun transport
inconnu ne retombe sur le réseau natif. Une erreur de préparation reste visible
et ne libère pas silencieusement le bootstrap.

La capture navigateur est opt-in et réservée aux captures locales :
`localStorage`, `sessionStorage`, cookies accessibles et bases IndexedDB
énumérables sont copiés sans le redacteur des champs. Ces données peuvent
contenir des secrets. Si local/session storage ou les cookies lisibles ne
peuvent pas être capturés, si IndexedDB ne peut pas être énumérée ou si une
base ne peut pas être lue, la préparation du replay échoue avant le bootstrap
applicatif. Un échec du Cookie Store API peut utiliser `document.cookie` comme
repli. Les cookies `HttpOnly`, une IndexedDB non énumérable et les stockages
interdits par le navigateur ne peuvent pas être garantis. Les archives doivent
être traitées comme sensibles.

## Résultats asynchrones et limites

- `CraftHttpClient` rejoue succès, erreurs et temps d’achèvement enregistrés.
  Les appels directs à `fetch` sont capturés et rejoués, y compris les corps
  binaires. Une réponse absente provoque un échec sans requête live.
- Les appels `CraftHttpClient` exposent `replayKey` pour identifier une requête
  concurrente dont la méthode, l’URL, les paramètres et le corps sont identiques
  à un autre appel. Les clés sont exportées : elles doivent être stables et ne
  pas contenir de secret. Le validateur laisse la session inspectable, mais
  refuse le replay si deux requêtes identiques se chevauchent sans clés
  distinctes.
- WebSocket et Worker déclarés utilisent des doubles, comparent les sorties et
  émettent les entrées à leur temps virtuel. Les transferts détachables ne sont
  pas reproduits et sont marqués non rejouables.
- XHR direct, SDK opaques et APIs navigateur non instrumentées ne sont pas
  interceptés. Le calcul côté serveur/worker et les effets externes au runtime
  ne sont pas rejoués.
- Les différences incluent l’événement ou la méthode concernée et l’état
  attendu/observé. Stop libère les gardes et doubles ; pause conserve les
  registres nécessaires à une reprise contrôlée.

## Vérification en place

Les tests unitaires couvrent le validateur, l’ordre des racines, la capture des
arguments, les snapshots primitifs, les réponses `fetch`, les requêtes HTTP
identiques avec `replayKey`, les limites des snapshots navigateur et les
doubles de transport. Les E2E Chromium couvrent la restauration de local/session
storage, cookies et IndexedDB avant le bootstrap, les échanges de transport et
le flux de replay dashboard. Les navigateurs Firefox/WebKit ne font pas partie
de cette vérification E2E.
