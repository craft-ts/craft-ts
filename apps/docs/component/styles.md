# Styles encapsulés

Les styles déclarés dans `craftComponent(name, meta, factory, template)` sont
partagés entre toutes les instances du composant et encapsulés avec `@scope`.
Le registre garde une seule feuille par composant et la retire lorsque la
dernière instance est détruite.

```ts
const Card = craftComponent(
  'Card',
  { styles: ':scope { padding: 1rem } .title { font-weight: 700 }' },
  () => ({}),
  () => div([h2({ class: 'title' }, 'Title')]),
);
```

La racine du template s’écrit `:scope`. Il n’y a pas d’élément hôte ni de
wrapper ajouté par Craft. Les racines portent l’attribut interne
`data-craft-root`; il ne faut pas le définir soi-même.

Les templates multi-racines sont autorisés, mais les relations entre racines
sœurs (par exemple `header + main`) ne sont pas exprimables par cette
encapsulation. Une racine qui est elle-même un composant Craft porte plusieurs
tokens ; le composant englobant peut donc atteindre l’intérieur de ce composant
dans ce cas limite connu du POC.

Les styles d’une directive sont composables :

```ts
const Highlight = craftDirective(
  'Highlight',
  { styles: '.highlight { background: yellow }' },
  (baseLogic) => baseLogic,
  (baseTemplate) => (context) => baseTemplate(context, { class: 'highlight' }),
);
```

Les noms de composants et de directives doivent être uniques. Les règles
`craft-component-name-match` et `craft-directive-name-match` vérifient aussi
qu’ils correspondent au nom de la déclaration.

`@scope` n’ajoute pas de spécificité. Les feuilles adoptées sont ordonnées après
les feuilles du document ; le fallback `<style>` est inséré dans le `head`.
La proximité des scopes imbriqués peut donc modifier la cascade par rapport à
l’ancien modèle global.
