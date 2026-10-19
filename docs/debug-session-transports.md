# Adaptateurs de transport des sessions de debug

Le format d’export est v5. Il ajoute des événements `transport` par instance et
des identités de cible Craft opaques aux interactions montées. Les exports v1 à
v4 sont refusés au replay. La déclaration des adaptateurs reste
dans le code de l’application ; un export ne contient que leur identifiant,
les événements sérialisés et les métadonnées expurgées.

```ts
provideCraftReplayTransports(
  craftWebSocketReplay({
    id: 'notifications',
    match: (url) => new URL(url).pathname === '/api/notifications',
    serialize: serializeNotificationFrame,
    deserialize: deserializeNotificationFrame,
    redact: redactNotificationFrame,
  }),
  craftWorkerReplay({
    id: 'search-index',
    match: (url) =>
      new URL(url, location.href).pathname.endsWith('/search.worker.js'),
    serialize: serializeSearchMessage,
    deserialize: deserializeSearchMessage,
    redact: redactSearchMessage,
  }),
);
```

`match` ne reçoit pas d’URL expurgée : elle sert à choisir l’adaptateur au
runtime. L’URL enregistrée perd toujours sa query et son fragment. N’enregistrez
pas de secrets dans `id` ou les métadonnées. `serialize` retourne un codec JSON,
texte ou base64 ; `deserialize` reconstruit la valeur applicative injectée au
replay. `redact` peut remplacer le contenu ou retourner `undefined`, ce qui
marque l’événement non rejouable. Les callbacks restent dans l’application et
ne sont jamais exportés.

Sans codec, les chaînes sont capturées en texte, les buffers et vues binaires en
base64, et les valeurs JSON simples en JSON. Les `Blob`, objets non JSON et
valeurs cycliques exigent un sérialiseur d’application. Les messages dépassant
1 Mio sont marqués non rejouables. Les listes de transfert de Web Worker sont
capturées comme non rejouables, car le replay ne reproduit pas le détachement.

Pendant le replay, `WebSocket` et `Worker` natifs sont remplacés par des doubles.
Les appels sortants sont comparés avec l’enregistrement ; une divergence est
envoyée au panneau et bloque cette instance. Les entrées sont émises quand
l’horloge virtuelle atteint leur événement. Les créations tardives reçoivent
les événements déjà dus à leur première disponibilité. Aucune création non
déclarée ne retombe sur un transport natif.

Les adaptateurs couvrent la surface courante `readyState`, les gestionnaires
d’événements, `addEventListener`, `send`/`postMessage`, `close` et `terminate`.
Ils ne reproduisent pas les comportements navigateur non explicitement
enregistrés, la sémantique des transferts, ni le calcul serveur ou worker. Les
SDK opaques ont besoin d’un adaptateur fourni par l’application.
