# Plan — Sécurité à implémenter dans les libs CraftTS

## Objectif

Fournir des garde-fous génériques et réutilisables pour tous les projets
CraftTS utilisant le SSR, l’hydratation ou les server functions.

La lib doit sécuriser les mécanismes techniques communs. Elle ne doit pas
embarquer de logique métier d’authentification, de rôles ou de déploiement.

## Hors périmètre

Les éléments suivants restent de la responsabilité de chaque projet :

- fournisseur d’identité et résolution de session ;
- rôles, permissions, tenants et propriété des données ;
- configuration des cookies ;
- origines CORS autorisées ;
- domaines réseau autorisés pour les appels sortants ;
- rate limiting métier et quotas ;
- politique de cache propre aux routes ;
- configuration du reverse proxy, du WAF et du TLS ;
- secrets et intégrations externes.

## Invariants de sécurité

Les libs doivent garantir ou imposer les règles suivantes :

1. Chaque rendu SSR possède un runtime isolé.
2. Aucune donnée SSR n’est transférée sans politique explicite.
3. Le `clientContext` est toujours considéré comme non fiable.
4. Les valeurs DOM, HTML, URLs et styles sont non fiables par défaut.
5. Les erreurs internes ne sont jamais sérialisées automatiquement.
6. Toute opération SSR ou server function possède une limite de temps.
7. Toute requête server function possède une limite de taille.
8. Toute ressource créée pendant le SSR est libérée en cas d’annulation.

## Phase 0 — Modèle de politique de sécurité

### Objectif

Définir les types et les points d’extension communs avant d’ajouter les
protections runtime.

### Travail

- créer un type `CraftSecurityPolicy` ;
- distinguer les politiques SSR, DOM, transport et transfert de données ;
- définir les valeurs par défaut sécurisées ;
- documenter les exceptions et les opt-outs ;
- éviter qu’une politique applicative soit stockée dans un singleton mutable.

### Résultat attendu

Une application peut fournir une politique explicite, mais une configuration
incomplète conserve des valeurs sécurisées par défaut.

## Phase 1 — Sécuriser le snapshot SSR

### Fichier principal

[`libs/core/src/lib/craft-transfer-snapshot.ts`](../../libs/core/src/lib/craft-transfer-snapshot.ts)

### API cible

```ts
type CraftTransferPolicy = {
  mode: 'allowlist' | 'deny';
  allow?: readonly string[];
  redact?: (address: string, value: unknown) => unknown;
  maxBytes?: number;
  maxDepth?: number;
};
```

### Travail

- refuser par défaut le transfert des primitives non déclarées ;
- ajouter une option `transfer: false` par primitive ;
- permettre une redaction par adresse de primitive ;
- détecter les noms de clés sensibles ;
- limiter la taille totale et la profondeur du snapshot ;
- valider strictement le snapshot côté client ;
- refuser les versions, adresses et structures inconnues ;
- conserver l’échappement anti-`</script>` existant.

### Tests

- secret dans un état transférable ;
- historique privé dans une query ;
- snapshot trop volumineux ;
- objet trop profond ;
- snapshot malformé côté hydratation ;
- caractères HTML dangereux dans les valeurs.

## Phase 2 — Sécuriser le renderer DOM

### Fichier principal

[`libs/component/src/lib/render/interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts)

### Travail

Introduire une séparation explicite entre :

- attributs ordinaires ;
- URLs de navigation ;
- Resource URLs ;
- HTML brut ;
- styles et variables CSS.

Ajouter des helpers spécialisés :

```ts
safeUrl(value)
safeResourceUrl(value)
sanitizedHtml(value)
```

Règles minimales :

- refuser `javascript:` ;
- refuser `srcdoc` ;
- refuser les attributs `on*` ;
- contrôler `href`, `src`, `action`, `formaction` et `poster` ;
- limiter les schémas autorisés à `http:`, `https:` et aux URLs relatives ;
- éviter les styles provenant directement de données utilisateur ;
- rendre l’API HTML brut explicitement dangereuse.

### Tests

- `href="javascript:..."` ;
- `img src` dangereux ;
- `onerror` injecté via `attrs` ;
- `iframe srcdoc` ;
- URL utilisateur dans une redirection ;
- injection via style ou variable CSS.

## Phase 3 — Renforcer le cycle de vie SSR

### Fichiers concernés

- [`libs/component/src/lib/server-render.ts`](../../libs/component/src/lib/server-render.ts)
- [`libs/component/src/lib/render/ssr-coordinator.ts`](../../libs/component/src/lib/render/ssr-coordinator.ts)

### Travail

- propager `AbortSignal` à toutes les queries et resources ;
- annuler le rendu lors de la déconnexion du client ;
- appliquer un timeout global et des timeouts par source ;
- nettoyer tous les timers et listeners après annulation ;
- ajouter une limite optionnelle de taille du HTML généré ;
- exposer les sources SSR en attente pour l’observabilité ;
- documenter la limite de concurrence au niveau de l’adapter HTTP.

### Tests

- annulation pendant une query bloquante ;
- timeout d’une source SSR ;
- déconnexion avant la fin du rendu ;
- vérification de l’absence de timers ou références résiduels.

## Phase 4 — Durcir les server functions

### Fichier principal

[`libs/core/src/lib/server.ts`](../../libs/core/src/lib/server.ts)

### API cible

```ts
type ServerFunctionRuntimeOptions = {
  maxBodyBytes?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
  requestId?: string;
  signal?: AbortSignal;
  onInvoke?: (context: ServerFunctionRequestContext) => void;
};
```

### Travail

- limiter la taille du body avant parsing ;
- appliquer un timeout par invocation ;
- transmettre le signal d’annulation au handler ;
- valider strictement l’enveloppe HTTP ;
- renvoyer une réponse générique pour les fonctions inconnues ;
- limiter la taille des outputs ;
- définir un catalogue d’erreurs publiques ;
- ne jamais sérialiser automatiquement toutes les propriétés d’une exception ;
- exposer un hook de journalisation sans données sensibles.

La lib doit fournir les hooks nécessaires à l’authentification et au CSRF,
mais ne doit pas imposer un fournisseur d’identité ou un format de cookie.

## Phase 5 — CSP et Trusted Types

### Travail

- ajouter un token ou provider `CraftCspNonce` ;
- appliquer le nonce aux styles SSR ;
- appliquer le nonce aux styles injectés côté navigateur ;
- documenter l’utilisation d’une CSP sans `unsafe-inline` ;
- documenter la compatibilité Trusted Types ;
- identifier explicitement les APIs nécessitant une politique Trusted Types.

La lib ne doit pas définir les domaines autorisés par CSP : cette décision
appartient au projet consommateur.

## Phase 6 — Outillage développeur

Ajouter dans `libs/dev-tools` des règles ESLint et d’architecture :

- `require-route-security-policy` ;
- `require-server-function-timeout` ;
- `no-auth-token-in-local-storage` ;
- `no-raw-user-url` ;
- `no-unsafe-transfer-state` ;
- `no-unsafe-html` ;
- `no-trust-forwarded-headers` ;

Ajouter une commande :

```bash
craft security check --strict
```

Cette commande doit contrôler :

- la présence d’une politique de sécurité ;
- les transferts SSR non autorisés ;
- les server functions sans timeout ou limite de body ;
- les APIs DOM dangereuses ;
- les exceptions expirées ;
- les configurations de production incompatibles avec une CSP stricte.

## Phase 7 — Exceptions contrôlées

Toute désactivation de protection doit être explicite :

```ts
allowUnsafe('raw-html', {
  owner: 'frontend-team',
  reason: 'Contenu sanitizé par le backend',
  expires: '2026-12-31',
});
```

Une exception doit posséder :

- un propriétaire ;
- une justification ;
- une date d’expiration ;
- le risque accepté ;
- éventuellement un ticket de suivi.

La CI doit échouer lorsqu’une exception est expirée.

## Phase 8 — Validation et non-régression

Créer des suites dédiées :

```text
libs/core/security/
libs/component/security/
```

Inclure :

- tests unitaires ;
- tests SSR et hydratation ;
- tests HTTP des server functions ;
- tests XSS ;
- tests de snapshots malformés ;
- tests de timeout et annulation ;
- tests de fuzzing sur inputs, URLs et attributs ;
- tests de compatibilité navigateur.

## Ordre d’implémentation recommandé

1. Politique et allowlist du snapshot SSR.
2. Sanitization des URLs et attributs DOM.
3. Timeout, annulation et nettoyage SSR.
4. Limites et erreurs des server functions.
5. Support CSP nonce.
6. Compatibilité Trusted Types.
7. Règles ESLint et commande `craft security`.
8. Documentation et migration des demos.

## Critères de fin

La sécurité des libs sera considérée comme suffisamment durcie lorsque :

- aucune donnée SSR n’est transférée sans politique explicite ;
- les URLs dangereuses sont refusées par défaut ;
- un rendu SSR abandonné libère toutes ses ressources ;
- les server functions ont des limites de taille et de temps ;
- les erreurs internes restent côté serveur ;
- les styles SSR fonctionnent avec une CSP à nonce ;
- les projets peuvent vérifier automatiquement leur conformité via
  `craft security check --strict` ;
- les demos utilisent uniquement les APIs sécurisées de la lib.
