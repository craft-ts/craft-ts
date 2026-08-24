# Plan : gestion exhaustive des exceptions de champs

## Objectif

Relier les exceptions typées produites par les validateurs d'un `CraftField` au
contrat de rendu du tag et du composant qui utilisent
`CraftFieldDirective`.

La compilation doit garantir que chaque exception de validation atteignable
est gérée exactement une fois par une boundary locale ou par le composant. Une
exception oubliée et un handler impossible doivent tous les deux produire une
erreur TypeScript.

Le mécanisme public retenu est `fieldErrorNode`. Il reprend le modèle
d'exhaustivité de `catchNode`, mais conserve un canal runtime distinct : une
validation invalide est un état réactif attendu, pas une interruption du rendu.

## Décisions

- Conserver le nom public `fieldErrorNode`.
- Ne pas transformer une exception de validation en exception levée.
- Conserver le champ et son composant visibles lorsqu'une validation échoue.
- Transporter les obligations de validation séparément des exceptions
  d'initialisation des composants.
- Vérifier l'exhaustivité dans les deux directions : handlers manquants et
  handlers inatteignables.
- Identifier un cas par le chemin du champ et le code d'exception, pas seulement
  par le code.
- Ne pas ajouter les exceptions de champs aux unions `handleExceptions` des
  routes.
- Utiliser directement les exceptions visibles du formulaire par défaut.
- Garantir qu'un `fieldErrorNode` sans option observe exactement
  `visibleExceptions`, sans recalculer une règle de visibilité parallèle.
- Rendre la politique de visibilité configurable et partageable avec
  `insertFormAttributes`.

## État actuel

`ValidatorOutput` conserve déjà le type d'exception de chaque validateur dans
son contrat générique. `insertFormAttributes` reconstruit cette union et expose
notamment :

- `exceptions` ;
- `visibleExceptions` ;
- `firstLeftFailedValidation` ;
- `lastRightFailedValidation` ;
- leurs variantes visibles.

La visibilité actuelle est codée comme suit :

```ts
field.dirty() || hasAttemptedSubmit();
```

L'état `touched` est disponible sur `CraftField`, mais n'est pas utilisé par la
politique actuelle.

`CraftFieldDirective` reçoit ensuite le champ sous la forme `CraftField<T>`.
Son type de retour ne transporte ni l'union exacte des exceptions ni le chemin
du champ vers le VNode. Les carriers d'exceptions actuels du renderer concernent
uniquement les exceptions qui peuvent interrompre l'initialisation ou le rendu
d'un composant.

## Sémantique de « gérer »

Gérer une exception de champ signifie reconnaître son cas dans le contrat UI et
rendre le contenu associé. Cela ne signifie pas récupérer l'exception ou rendre
le champ valide.

Lorsqu'un handler est actif :

- `field.invalid()` reste vrai ;
- l'exception reste présente dans `field.errors()` et `exceptions()` ;
- le champ source reste monté ;
- le handler est évalué comme une fonction de rendu réactive ;
- aucun effet de bord ne doit être déclenché depuis le handler ;
- la visibilité décide uniquement si le rendu du handler est présent.

## API cible

### Gestion locale au niveau du tag

```ts
input({
  id: 'email',
  type: 'email',
})
  .pipe(CraftFieldDirective(loginForm.form.selectEmail()))
  .pipe(
    fieldErrorNode.exhaustive(
      {
        required: () => p('Email is required.'),
        email: () => p('Enter a valid email.'),
      },
      {
        mode: 'first',
        position: 'after',
      },
    ),
  );
```

À cette frontière, la source ne contient qu'un champ. La table de handlers est
donc indexée directement par code.

### Gestion au niveau du composant

```ts
const LoginFormComponent = BaseLoginFormComponent.pipe(
  fieldErrorNode.exhaustive(
    {
      email: {
        required: () => p('Email is required.'),
        email: () => p('Enter a valid email.'),
      },
      password: {
        required: () => p('Password is required.'),
        minLength: ({ exception }) =>
          p(`Use at least ${exception.payload} characters.`),
      },
    },
    {
      mode: 'all',
      position: 'after',
    },
  ),
);
```

À cette frontière, les handlers sont regroupés par chemin de champ afin que
`email.required` et `password.required` restent deux obligations distinctes.

### Contexte d'un handler

```ts
type FieldExceptionHandlerContext<Field, Path extends string, Exception> = {
  readonly field: Field;
  readonly path: Path;
  readonly runtimePath: ReadonlyArray<string | number>;
  readonly validatorName: string;
  readonly exception: Exception;
};
```

Le type de `exception` doit être réduit au code du handler. Un handler
`minLength` doit par exemple voir un payload `number` sans cast.

## Politique de visibilité

### Contrat partagé

```ts
type FieldExceptionVisibilityState = 'dirty' | 'touched' | 'submitted';

type FieldExceptionVisibility =
  | 'visibleExceptions'
  | 'always'
  | {
      readonly anyOf: readonly FieldExceptionVisibilityState[];
    }
  | ((context: {
      readonly field: CraftField<unknown>;
      readonly hasAttemptedSubmit: Signal<boolean>;
    }) => boolean);
```

L'absence de l'option `visibility` équivaut à `visibleExceptions`. Le block
consomme alors directement l'état visible exposé par le champ :

- en mode `all`, il observe `visibleExceptions` ;
- en mode `first`, il observe la variante visible `visibleFirst...` retenue ;
- il ne reconstruit pas la condition à partir de `dirty`, `touched` ou
  `submitted`.

Cette règle garantit qu'un message rendu par `fieldErrorNode` apparaît et
disparaît au même moment que la même exception lue via les helpers
`visibleExceptions` du formulaire.

La valeur par défaut attend le blur du champ ou une tentative de soumission :

```ts
{
  anyOf: ['touched', 'submitted'];
}
```

Une application qui veut attendre le blur ou la soumission peut déclarer :

```ts
{
  anyOf: ['touched', 'submitted'];
}
```

Les trois états peuvent être combinés :

```ts
{
  anyOf: ['dirty', 'touched', 'submitted'];
}
```

### Configuration dans le formulaire

La politique principale doit être définissable avec les validateurs :

```ts
insertFormAttributes(() => ({
  validators: [cRequired(), cEmail()],
  exceptionVisibility: {
    anyOf: ['touched', 'submitted'],
  },
}));
```

`visibleExceptions` et les variantes `visibleFirst...` / `visibleLast...`
restent donc la source de vérité. Par défaut, `fieldErrorNode` les consomme
au lieu de réimplémenter leur politique.

La boundary peut surcharger localement la politique héritée. Cette surcharge
ne modifie jamais `valid()`, `invalid()`, `errors()` ou `exceptions()`.

## Modèle de types

### Cas de validation

```ts
type FieldValidationCase<
  Path extends string,
  ValidatorName extends string,
  Exception extends AnyCraftException,
> = {
  readonly path: Path;
  readonly validatorName: ValidatorName;
  readonly exception: Exception;
};
```

Le chemin fait partie du cas pour empêcher un handler `email.required`
d'absorber implicitement `password.required`.

Le nom du validateur est conservé dans le descripteur et dans le contexte
runtime. L'exhaustivité publique de la première version reste fondée sur le
couple `(path, exception.code)`. Une exhaustivité supplémentaire par instance
de validateur pourra être ajoutée plus tard si plusieurs validateurs d'un même
champ produisant le même code doivent être distingués.

### Carrier de champ

`insertFormAttributes` doit exposer un protocole stable permettant d'extraire :

- l'union complète des exceptions ;
- le nom littéral du validateur ;
- le chemin statique du champ ;
- la source runtime des exceptions visibles ;
- le signal `hasAttemptedSubmit`.

Ce protocole ne doit pas dépendre de l'inspection structurelle de
`visibleExceptions`. Il doit utiliser un symbole interne ou public dédié afin
d'éviter qu'un renommage d'helper casse l'inférence de la directive.

### Chemins statiques

`insertSelectFormTree` doit conserver un brand de chemin dans le type du
sous-formulaire sélectionné :

```ts
loginForm.form.selectEmail(); // path: "email"
```

Pour les objets imbriqués :

```ts
profileForm.form.selectAddress().selectStreet(); // path: "address.street"
```

Pour les tableaux, le chemin de type doit être stable et indépendant de
l'index runtime, par exemple `addresses[].street`. Le contexte du handler
continue d'exposer le chemin runtime avec l'index ou l'identifiant réel.

### Carrier de VNode

Le renderer doit introduire un carrier distinct des exceptions de composant :

```ts
type CraftNodeFieldExceptionsCarrier<Cases> = {
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]?: Cases;
};
```

Les cas doivent être propagés par :

- les tags hyperscript ;
- les tableaux d'enfants ;
- `ifNode` ;
- `forNode` ;
- les templates et projections ;
- les composants imbriqués ;
- les directives et blocks structurels.

`fieldErrorNode.exhaustive` soustrait les cas gérés et conserve les cas
résiduels. Les exceptions éventuelles produites par le contenu des handlers
doivent continuer à suivre leurs carriers habituels.

### Contrat de composant

Ajouter un extracteur public ou interne :

```ts
type ComponentFieldExceptionsOf<Component> = /* cas résiduels */;
```

Un composant brut peut conserver des cas résiduels afin de permettre :

```ts
const SafeComponent = UnsafeComponent.pipe(
  fieldErrorNode.exhaustive(/* handlers */),
);
```

Une frontière d'utilisation doit néanmoins refuser un composant qui conserve
des cas non gérés :

```ts
// Erreur TypeScript : email.required et email.email ne sont pas gérés.
section([UnsafeComponent({})]);
```

Les frontières root, route et montage direct doivent appliquer la même
contrainte. Ces cas ne doivent pas rejoindre `RouteExceptionUnion`.

## Exhaustivité

L'algorithme doit vérifier :

```text
cas atteignables - handlers fournis = jamais
handlers fournis - cas atteignables = jamais
```

Il est possible d'extraire un utilitaire générique depuis
`CatchTagExhaustiveCodesCheck`, avec des messages propres à chaque appelant.

Messages attendus :

```text
fieldErrorNode.exhaustive is missing handlers for field exceptions
fieldErrorNode.exhaustive has handlers for unreachable field exceptions
```

La visibilité n'intervient jamais dans ce calcul. Une exception invisible à
l'instant courant doit quand même posséder un handler à la compilation.

## Runtime

### Enregistrement des sources

Lors du montage, `CraftFieldDirective` enregistre sa source de validation auprès
de la boundary de champ la plus proche. La source contient :

- le champ ;
- le chemin statique et le chemin runtime ;
- les exceptions visibles ;
- l'ordre des validateurs ;
- les noms des validateurs ;
- le signal de soumission.

La destruction du nœud désenregistre la source et détruit tous les effets liés.

### Rendu

La boundary observe ses sources et rend les handlers de façon réactive.

Options initiales :

```ts
type FieldExceptionBlockOptions = {
  readonly visibility?: FieldExceptionVisibility;
  readonly mode?: 'first' | 'all';
  readonly position?: 'before' | 'after';
};
```

- `first` utilise l'ordre gauche-vers-droite des validateurs.
- `all` rend toutes les exceptions visibles actives.
- `before` et `after` placent les fallbacks autour de la source sans la retirer.
- L'ordre entre plusieurs champs suit l'ordre DOM.

### Accessibilité

La boundary locale doit pouvoir relier les messages au contrôle :

- `aria-invalid` reflète l'invalidité visible ;
- un identifiant stable est associé au contenu rendu ;
- `aria-describedby` référence les messages actifs ;
- les attributs existants de l'utilisateur sont préservés et fusionnés.

## Plan d'implémentation

### Phase 1 — Prototype de typage

1. Ajouter `FieldValidationCase` et le carrier de formulaire.
2. Préserver les noms de validateurs et leurs unions d'exceptions.
3. Brander les chemins issus de `insertSelectFormTree`.
4. Faire conserver le type concret du champ par `CraftFieldDirective`.
5. Écrire les tests de typage avant toute implémentation runtime.
6. Mesurer la profondeur d'instanciation TypeScript sur les formulaires
   imbriqués et parallèles.

### Phase 2 — Propagation dans les VNodes

1. Ajouter le carrier dédié aux exceptions de champs.
2. Spécialiser le retour de `.pipe(CraftFieldDirective(...))` sans élargir le
   nœud en `CraftNode` générique.
3. Propager les cas dans les enfants et les blocks structurels.
4. Ajouter les cas résiduels au contrat générique de `CraftComponent`.
5. Interdire les résidus aux frontières de rendu sans modifier les unions de
   routes.

### Phase 3 — `fieldErrorNode.exhaustive`

1. Définir le contrat exact des handlers locaux.
2. Définir le contrat groupé par chemin pour les composants.
3. Rejeter les handlers manquants.
4. Rejeter les handlers supplémentaires.
5. Réduire le type de l'exception dans chaque handler.
6. Soustraire les cas gérés du type du nœud ou du composant.

### Phase 4 — Politique de visibilité

1. Extraire le calcul actuel de visibilité depuis `insertFormAttributes`.
2. Ajouter `exceptionVisibility` avec la valeur par défaut
   `touched || submitted`.
3. Faire utiliser la policy par tous les helpers `visible*`.
4. Faire de `visibleExceptions` la source runtime de la boundary lorsque
   `visibility` est omis ou vaut `'visibleExceptions'`.
5. Ajouter les surcharges `always`, `anyOf` et prédicat personnalisé.
6. Vérifier que reset remet `dirty`, `touched` et `submitted` à leur état
   initial.

### Phase 5 — Runtime et lifecycle

1. Ajouter un contexte de boundary dédié dans l'interpréteur.
2. Enregistrer et désenregistrer les sources de champs.
3. Rendre les handlers en modes `first` et `all`.
4. Gérer le positionnement avant/après.
5. Préserver la granularité des mises à jour DOM.
6. Ajouter les attributs d'accessibilité.
7. Vérifier le cleanup des effets, messages et attributs.

### Phase 6 — Adoption et documentation

1. Migrer l'exemple `login-form` vers `fieldErrorNode`.
2. Documenter la gestion locale et la gestion composant.
3. Documenter les politiques dirty, touched et submitted.
4. Ajouter un exemple de validateur personnalisé et async.
5. Expliquer la séparation entre exceptions de contrôle et exceptions de
   validation.
6. Ajouter une entrée dans la référence publique.

## Tests de typage

Les tests utilisent `expectTypeOf` pour les contrats positifs et
`@ts-expect-error` pour les contrats négatifs.

### Cas positifs

- tous les handlers locaux sont présents ;
- tous les champs et codes sont couverts au niveau composant ;
- le type résiduel devient `never` après `fieldErrorNode.exhaustive` ;
- le payload du handler est correctement réduit ;
- un champ sans validateur ne crée aucune obligation ;
- une exception gérée localement n'est plus exigée par le composant ;
- les exceptions produites par les fallbacks restent propagées ;
- les exceptions classiques et les exceptions de champs coexistent sans se
  mélanger.

### Cas négatifs

```ts
// @ts-expect-error — missing handler: email
input(...)
  .pipe(CraftFieldDirective(emailField))
  .pipe(
    fieldErrorNode.exhaustive({
      required: () => p('Required'),
    }),
  );
```

```ts
// @ts-expect-error — unreachable handler: minLength
fieldErrorNode.exhaustive({
  required: () => p('Required'),
  email: () => p('Invalid'),
  minLength: () => p('Impossible'),
});
```

```ts
const UnsafeLoginForm = craftComponent(/* champs non gérés */);

// @ts-expect-error — residual field exceptions
section([UnsafeLoginForm({})]);
```

La matrice négative doit aussi couvrir :

- un champ manquant dans la table du composant ;
- un champ supplémentaire ;
- deux champs produisant `required` ;
- un validateur personnalisé avec plusieurs codes ;
- un validateur async avec plusieurs codes ;
- un chemin imbriqué ;
- un champ dans un tableau ;
- une gestion partielle locale suivie d'une gestion partielle composant ;
- une exception masquée par la policy de visibilité mais sans handler.

## Tests runtime

- aucun message sur un champ pristine avec la policy par défaut ;
- aucune apparition au changement de valeur tant que le champ n'a pas reçu de blur ;
- affichage après blur uniquement pour le champ touché ;
- affichage après blur avec une policy `touched` ;
- affichage après tentative de soumission ;
- égalité de comportement entre un block sans option et `visibleExceptions` ;
- absence de recalcul local de la policy dans le comportement par défaut ;
- combinaison `touched || submitted` ;
- combinaison `dirty || touched || submitted` ;
- surcharge locale de la policy héritée ;
- `reset()` masque de nouveau les messages ;
- rendu du premier validateur en échec ;
- rendu de toutes les exceptions actives ;
- ordre stable entre validateurs et entre champs ;
- mise à jour d'un message sans remontage du contrôle ;
- nettoyage après suppression conditionnelle du champ ;
- support des champs imbriqués et parallèles ;
- support des validateurs async ;
- conservation des classes et contraintes natives de `CraftFieldDirective` ;
- absence de propagation dans le gestionnaire d'exceptions de route.

## Risques

| Risque                             | Réponse                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Profondeur excessive des types     | Transporter une union plate de cas et construire les maps uniquement à la boundary.               |
| Collision de codes entre champs    | Inclure le chemin dans l'identité du cas.                                                         |
| Confusion avec `catchNode`        | Maintenir des carriers et un runtime distincts.                                                   |
| Divergence de visibilité           | Consommer directement `visibleExceptions` par défaut et centraliser sa policy dans le formulaire. |
| Effets de bord depuis les handlers | Documenter et tester un contrat de rendu pur.                                                     |
| Fuite de sources ou de messages    | Lier l'enregistrement au lifecycle du nœud et tester le cleanup.                                  |
| Pollution des routes               | Exclure explicitement les carriers de champs de `RouteExceptionUnion`.                            |
| Handlers trop génériques           | Réduire exception, payload, chemin et champ pour chaque entrée.                                   |

## Critères de réussite

Le chantier est terminé lorsque :

- `CraftFieldDirective` transporte l'union exacte des exceptions de ses
  validateurs ;
- un handler manquant ou supplémentaire produit une erreur TypeScript ;
- un composant avec des exceptions de champs résiduelles est refusé à sa
  frontière d'utilisation ;
- `fieldErrorNode.exhaustive` fonctionne sur un tag et un composant ;
- deux champs partageant le même code restent exhaustifs séparément ;
- sans option, le rendu reflète exactement `visibleExceptions` ;
- la policy dirty/touched/submitted est unique, héritée et surchargeable ;
- la visibilité ne modifie jamais la validité ni l'exhaustivité ;
- les messages suivent les mises à jour réactives sans remonter les contrôles ;
- les tests de type, runtime, lifecycle, accessibilité, build et documentation
  passent ;
- aucune exception de champ ne rejoint les unions de routes.
