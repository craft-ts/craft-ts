# Attestation DevTool — plan d’implémentation

## Objectif

Faire évoluer la revue visuelle actuelle en un DevTool d’attestation unifié qui
permet de :

- explorer les assets et scénarios visuels ;
- examiner les captures et leurs différences ;
- visualiser les obligations dérivées des templates ;
- comprendre ce qui a changé depuis la dernière décision humaine ;
- accepter, documenter, rejeter, bloquer ou retirer une proposition ;
- conserver toutes les décisions dans le registre d’attestation existant.

Le DevTool est une projection interactive du registre. Le registre, le store de
preuves et le serveur local restent les seules autorités pour les décisions et
les écritures.

## Principes structurants

1. **Une attestation n’est pas un test.** Une obligation de template confirme
   qu’une promesse est intentionnelle ; elle ne prouve pas que le comportement
   fonctionne à l’exécution.
2. **Le registre reste agnostique du sujet.** `@craft-ts/attest` ne dépend ni du
   DOM, ni des screenshots, ni de l’analyse TypeScript.
3. **Le navigateur ne modifie jamais directement le ledger.** Toute décision
   est validée et enregistrée par le serveur local.
4. **Le code partagé porte le workflow, pas la représentation de la preuve.**
   Navigation, commentaires et décisions sont communs ; screenshot, replay et
   obligation de template utilisent des présentateurs distincts.
5. **Les reports automatiques ne consomment pas d’attention humaine.** Les
   sujets `renewed` restent visibles dans l’historique, mais hors de la file de
   revue.
6. **Aucune réduction sans trace.** Une décision groupée doit conserver la
   liste exacte des sujets qu’elle couvre.

## Expérience cible

Ajouter une section **Attestations** composée de quatre vues.

### Visual assets

- screenshots stockés ;
- pages gelées ;
- digests disponibles ;
- métadonnées de capture ;
- relations entre un asset et les scénarios qui l’utilisent.

### Visual tests

- scénarios déclarés ;
- état de chaque attestation ;
- couverture ;
- preuve actuelle et preuve précédemment acceptée ;
- diff visuel et diff de layout.

### Template obligations

- promesses `render` et `command` ;
- composant propriétaire ;
- élément et nom interactif éventuels ;
- cible et type de cible ;
- tranche de code concernée ;
- diagnostics d’extraction non résolus.

### Review queue

- tous les sujets nécessitant une décision humaine ;
- regroupement des changements identiques ;
- précédent verdict et précédent commentaire ;
- décisions et commentaires ;
- retraits d’obligations disparues.

Les quatre vues partagent des filtres par composant, type de sujet, état,
direction `render`/`command` et texte libre.

## 1. Créer un noyau de revue générique

Extraire de la revue visuelle actuelle les responsabilités indépendantes de la
preuve :

- chargement et rafraîchissement de la file ;
- navigation entre les cartes ;
- raccourcis clavier ;
- saisie et validation des commentaires ;
- soumission des décisions ;
- gestion optimiste interdite : une carte ne disparaît qu’après confirmation ;
- erreurs réseau et conflits de révision ;
- thèmes clair/sombre ;
- français/anglais ;
- regroupement et traçabilité des sujets couverts.

Le contrat public devient une union discriminée :

```ts
type ReviewCard =
  | VisualReviewCard
  | TemplateReviewCard
  | RemovalReviewCard;
```

Chaque carte possède au minimum :

```ts
interface ReviewCardBase {
  readonly kind: 'visual' | 'template' | 'removal';
  readonly id: string;
  readonly revision: string;
  readonly subject: string;
  readonly reason: string;
  readonly cluster: readonly string[];
  readonly previousDecision?: PreviousDecision;
}
```

Le noyau devrait vivre dans une entrée dédiée de `@craft-ts/dev-tools`. Le
module actuel `@craft-ts/style-testing/review` peut temporairement réexporter
les API compatibles afin de préserver les consommateurs existants.

## 2. Conserver les présentateurs spécialisés

### Présentateur visuel

Il conserve les fonctionnalités existantes :

- screenshot ;
- replay de la page gelée ;
- contrôle de fidélité ;
- diff de layout ;
- sélection de chemins DOM ;
- références insérées dans le commentaire ;
- signalement d’une décision dégradée.

### Présentateur template

Il affiche une obligation sous forme lisible :

```text
UserCard · command

Promesse courante
button "Save" appelle profile.update

Changement
- button "Save" appelle user.save
+ button "Save" appelle profile.update

Code concerné
- method:user.save
+ property:profile.update
```

Il ne dépend d’aucun concept de screenshot ou de chemin DOM.

### Présentateur de retrait

Il affiche :

- l’ancienne obligation ;
- sa dernière décision ;
- la date et l’auteur de cette décision ;
- le fait que la promesse n’est plus produite ;
- le formulaire de retrait et son commentaire obligatoire.

## 3. Persister les preuves template lisibles

Le registre connaît actuellement le hash de la preuve template. Un véritable
avant/après exige aussi de conserver la valeur canonique correspondante dans le
store de preuves :

```ts
interface TemplateEvidence {
  readonly direction: 'render' | 'command';
  readonly element: string | null;
  readonly elementName: string | null;
  readonly target: string;
  readonly targetKind: string;
}
```

À chaque observation ou décision :

1. sérialiser cette structure de manière canonique ;
2. utiliser son hash comme adresse ;
3. enregistrer le JSON dans le CAS ;
4. conserver uniquement le hash dans le ledger ;
5. charger l’ancienne et la nouvelle preuve à la demande.

Les attestations historiques sans objet de preuve restent valides. Le DevTool
affiche alors que la preuve précédente est indisponible au lieu d’inventer un
diff.

## 4. Produire un diff template explicable

Le serveur construit pour chaque obligation :

- la preuve précédemment acceptée ;
- la preuve courante ;
- les champs sémantiques modifiés ;
- les feuilles de tranche de code ajoutées, supprimées ou modifiées ;
- la raison calculée par le registre ;
- le précédent commentaire lorsqu’il existe.

Le diff sémantique porte uniquement sur :

- `direction` ;
- `element` ;
- `elementName` ;
- `target` ;
- `targetKind`.

Le `statement` reste une phrase de présentation et n’entre pas dans la preuve.

## 5. Mapper les états du registre

| État | Présentation | Action humaine |
| --- | --- | --- |
| `current` | Inventaire normal | Aucune |
| `renewed` | Historique « report automatique » | Aucune |
| `missing` | File de revue | Décision requise |
| `review` | File avec raison et diff | Décision requise |
| Suppression non signée | Vue « Removed » | `Retire` requis |
| Diagnostic d’extraction | Vue diagnostics | Correction du code ou de l’extracteur |

Un diagnostic d’extraction ne peut pas être accepté ou rejeté comme une
obligation : aucune promesse fiable n’a encore été produite.

## 6. Réutiliser les verdicts existants

Pour un sujet présent :

- `Accept` ;
- `Accept with note` ;
- `Known issue` ;
- `Reject` avec commentaire obligatoire ;
- `Block`.

Comportements attendus :

- un verdict accepté devient la nouvelle référence ;
- un rejet reste dans la file et son commentaire réapparaît au prochain run ;
- un blocage ne formule aucun jugement et reste dans la file ;
- une décision groupée inscrit la grappe complète dans chaque attestation.

Pour une obligation disparue, utiliser une action distincte `Retire` avec :

- `superseded` ;
- `defect` ;
- `derivation` ;
- un commentaire obligatoire.

`Retire` ne doit pas être présenté comme une acceptation ordinaire.

## 7. Regrouper les changements identiques

Le regroupement visuel existant reste fondé sur la forme du diff de layout.

Pour les templates, calculer une signature à partir du diff sémantique :

```text
command:
button/Save:
method:user.save
→ property:profile.update
```

Règles :

- ne jamais regrouper des obligations nouvelles sans preuve antérieure ;
- regrouper uniquement des avant/après identiques ;
- montrer tous les composants couverts avant la décision ;
- enregistrer la grappe sur chaque attestation concernée ;
- permettre d’ouvrir un membre individuellement avant de décider.

## 8. Maintenir l’autorité côté serveur

Le serveur local :

- lit le ledger et le CAS ;
- dérive ou charge les observations ;
- calcule les états ;
- construit les cartes ;
- sert les preuves à la demande ;
- valide les verdicts et commentaires ;
- refuse une décision portant sur une révision obsolète ;
- écrit le ledger atomiquement ;
- recalcule puis renvoie la file après chaque décision.

Chaque carte porte une `revision` calculée à partir du sujet, de la preuve
courante et de l’état du registre. Si elle diffère au moment du POST, le serveur
répond avec un conflit et demande au client de recharger la carte.

## 9. Étendre la CLI

Conserver la commande existante et ajouter le choix du sujet :

```sh
craft-ts attest review --kind visual
craft-ts attest review --kind template
craft-ts attest review --kind all
```

Ajouter éventuellement une commande d’entrée orientée exploration :

```sh
craft-ts attest devtools
```

`review --kind all` pourra devenir le chemin recommandé une fois les deux
présentateurs stabilisés. Les commandes actuelles restent compatibles pendant
la migration.

## 10. Couvrir le comportement par des tests

### Tests unitaires

- génération d’une carte template ;
- sérialisation et persistance d’une preuve canonique ;
- diff de preuve ;
- diff des feuilles de code ;
- regroupement de changements identiques ;
- absence de regroupement des nouveaux sujets ;
- validation des verdicts et commentaires ;
- validation des motifs de retrait ;
- compatibilité avec une ancienne preuve indisponible ;
- calcul et validation d’une révision de carte.

### Tests d’intégration

- acceptation d’une obligation ;
- rejet conservé dans la file ;
- commentaire de rejet restitué au run suivant ;
- report automatique absent de la file ;
- retrait signé d’une obligation disparue ;
- obligation retirée puis réapparue ;
- refus d’une décision obsolète ;
- écriture cohérente du ledger et du CAS ;
- décision groupée appliquée à tous ses sujets.

### Tests E2E du DevTool

- navigation entre les vues visual et template ;
- affichage d’un avant/après template ;
- commentaire puis rejet ;
- acceptation d’une grappe ;
- retrait avec motif ;
- conservation du replay visuel ;
- erreurs serveur laissées visibles et rejouables ;
- navigation clavier ;
- français/anglais ;
- thèmes clair/sombre.

## 11. Livrer par tranches verticales

### Livraison 1 — lecture seule

- noyau de cartes discriminées ;
- persistance des preuves template ;
- inventaire des obligations ;
- états et diagnostics ;
- diff de preuve et de code ;
- aucune nouvelle écriture depuis l’interface.

**Critère d’acceptation :** depuis le DevTool, un développeur peut expliquer
pourquoi une obligation est `current`, `renewed`, `review` ou `missing`, et voir
le changement qui a provoqué cet état.

### Livraison 2 — décisions individuelles

- Accept/Accept with note/Known issue/Reject/Block ;
- commentaires ;
- retraits avec motif ;
- validation de révision ;
- écriture serveur dans le registre et le CAS.

**Critère d’acceptation :** une décision prise dans le DevTool produit le même
ledger que la commande CLI équivalente, et une erreur d’écriture ne retire pas
la carte de l’écran.

### Livraison 3 — industrialisation

- regroupement sémantique ;
- vue globale visual + template ;
- historique des reports automatiques ;
- filtres complets ;
- migration des anciennes API ;
- documentation utilisateur.

**Critère d’acceptation :** une modification identique touchant plusieurs
composants demande une seule décision traçable, sans masquer les sujets
couverts.

## 12. Ordre technique recommandé

1. Créer un worktree propre à partir de `feat/visual-attestation`.
2. Ajouter la persistance des preuves template et ses tests.
3. Définir les contrats génériques de cartes et décisions.
4. Adapter la revue visuelle existante sans modifier son comportement.
5. Ajouter les cartes template en lecture seule.
6. Brancher les décisions template sur le ledger.
7. Ajouter le retrait des obligations disparues.
8. Ajouter le regroupement sémantique.
9. Étendre la CLI et documenter les nouveaux parcours.
10. Exécuter les tests unitaires, intégration, E2E et le typecheck complet.

Le worktree séparé est nécessaire pour ne pas écraser les modifications locales
actuellement présentes dans les fichiers de la revue visuelle sur
`feat/visual-attestation`.

## Hors périmètre initial

- transformer `provideCraftDevTools()` en overlay embarqué dans l’application ;
- modifier automatiquement le TypeScript depuis la vue d’obligation ;
- accepter automatiquement un nouveau sujet ;
- traiter un diagnostic d’extraction comme une obligation validable ;
- mettre les sujets `renewed` dans la file humaine ;
- supprimer les anciennes commandes CLI avant stabilisation du DevTool.

