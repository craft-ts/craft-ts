# Template migrator

Collez un extrait HTML ou un composant Web trouvé dans la documentation d’une
bibliothèque UI. Le convertisseur génère le template fonctionnel Craft et les
imports nécessaires depuis `@craft-ng/component`.

<CraftTemplateMigrator />

Le résultat par défaut est un callback à coller comme quatrième argument de
`craftComponent(...)`. Renseignez un nom pour générer directement un composant
complet. Les balises HTML natives deviennent les helpers (`div`, `button`,
`section`, etc.) ; les balises personnalisées deviennent
`customElement('my-element', ...)`.

Les interpolations et bindings Angular sont conservés sous forme d’expressions
à adapter à votre contexte Craft. Les structures `*ngIf`, `*ngFor` et les
blocs Angular nécessitent une conversion manuelle vers `ifBlock` ou `each`.
