# Fine-grained reactivity

Craft templates are reactive at the **binding** level. When a signal changes,
Craft updates the text node, DOM property, class, style, or host binding that
read it. It does not need to execute the surrounding component template again.

```ts
({ counter }) =>
  div([
    h2('Counter'),
    p({ class: 'value' }, counter),
    button({ click: counter.increment }, '+'),
  ]);
```

Here, `counter` is passed to `p` as a yieldable reader. The renderer drives the
read for that text binding. Incrementing the counter evaluates that binding and
patches its text node; the `div`, heading, button, and component template remain
untouched.

## The binding is the reactive boundary

A function in a rendered position declares a binding. The callback only reads
values already derived by the primitive layer; comparisons, formatting, and UI
decisions stay out of the template:

```ts
p(items.totalLabel);

button(
  {
    disabled: items.isEmpty,
    title: items.clearTitle,
  },
  'Clear',
);

div({
  class: items.emptyClass,
  style: items.emptyStyle,
});
```

`totalLabel`, `isEmpty`, `clearTitle`, `emptyClass`, and `emptyStyle` are named
derived values exposed by the state, query, insertion, or component context.
Pass the reader. If only an item-related dependency changes, Craft evaluates
only the affected bindings. A sibling binding depending on another reader does
not run.

Static values do not need callbacks:

```ts
h2('Shopping cart');
button({ type: 'button' }, 'Clear');
```

## Do not read reactive values while building the template

A direct read happens while the component constructs its VNodes. It cannot be
assigned to one precise DOM binding and becomes a structural template
dependency instead:

```ts
// Avoid: these reads happen in the component template.
p(items.totalLabel());
button({ disabled: items.isEmpty() }, 'Clear');
div({ class: items.emptyClass() });
```

Move each read into the binding that consumes it:

```ts
p(items.totalLabel);
button({ disabled: items.isEmpty }, 'Clear');
div({ class: items.emptyClass });
```

This is also the rule for component inputs. Pass a yieldable reader directly
when the child must observe a changing value. When the child needs fields of
an object, explicitly adapt the input with `deepYieldable`:

```ts
UserCard({ user: selectedUser });
```

The reader is lazy: constructing the parent template does not read
`selectedUser`. Craft installs it as the source of the child's `user` input.
The child then decides which granular binding observes it:

```ts
const UserCard = craftComponent(
  (user: Input<User>) => ({ user: deepYieldable(user) }),
  ({ user }) => h2(user.displayName),
);
```

When the `h2` binding first evaluates, `yield* user()` invokes the reader,
which reads `selectedUser`. That text binding becomes the signal consumer.
When the selected user changes, only the binding evaluates again and patches
the existing `h2`; neither the parent template nor the child component template
runs again.

Reading the input eagerly in the child would move the dependency back to the
component boundary and is rejected by `require-reactive-template-bindings`:

```ts
// Avoid: resolving the input while the child template is built.
h2(craftUse(user()).displayName);
```

## Structure has its own reactive scopes

Bindings update an existing node. Blocks own changes to the shape of the tree:

```ts
ifBlock(
  hasItems,
  () => CartItems({ items: () => items() }),
  () => p('Your cart is empty.'),
);

each(items, { track: (item) => item.id }, (item) => p(item.name));
```

`ifBlock`, `each`, `matchBlock.exhaustive`, and `defer` isolate their own
structural work. A branch or list can change without making the parent
component rebuild unrelated siblings. Use these helpers for structure and
binding callbacks for values on existing nodes.

## Keep bindings pure and free of logic

A binding reads a value already derived by the primitive layer. It does not
format data, make business decisions, or write state:

```ts
// Correct: the primitive exposes the render-ready reader.
p(cart.formattedTotal);

// Incorrect: rendering changes application state.
p(function* () {
  yield* counter.update((value) => value + 1);
  return yield* counter();
});
```

Perform writes from DOM events, outputs, mutations, or explicit business
effects. Purity makes a binding safe to evaluate whenever one of its
dependencies changes.

## Enforce the model with ESLint

Enable both renderer rules with type-aware ESLint configuration:

```js
export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      'craft-ng/require-reactive-template-bindings': 'error',
      'craft-ng/no-render-writes': 'error',
    },
  },
];
```

- `require-reactive-template-bindings` rejects direct reads of Angular Signals,
  Craft values, and component inputs during VNode construction.
- `no-render-writes` rejects detectable `set`, `update`, and `mutate` calls from
  templates and binding callbacks while allowing event and output handlers.

See the [ESLint rules reference](/guide/routing/eslint-rules) for the complete
configuration.

## What you should observe

After a binding dependency changes:

- the affected DOM value changes;
- the node keeps its identity;
- unrelated bindings do not evaluate;
- the component template does not emit a new `component / update` trace.

The current template trace reports component and structural renders, not each
individual text or property effect. The absence of a component update therefore
confirms that the change stayed below the component boundary; a DOM assertion
confirms that the expected binding was patched.

Effects are owned by their rendered nodes. Removing a branch, list item, or
component destroys its binding effects, so their dependencies are released with
the DOM they served.

## Migration checklist

1. Move comparisons, formatting, and display decisions into named derived
   primitive values such as `items.isEmpty`.
2. Pass yieldable readers to text bindings (`p(counter)`), or use a generator
   when the binding must format: `p(function* () { return \`Count: ${yield* counter()}\`; })`.
3. Pass yieldable readers to DOM properties such as `value`, `disabled`, and
   `title`.
4. Return complete reactive class and style readers from the primitive.
5. Pass changing component inputs as yieldable readers.
6. Express structural changes with `ifBlock`, `each`,
   `matchBlock.exhaustive`, or `defer`.
7. Enable the two ESLint rules and remove every direct reactive template read.

Continue with [Components](/guide/components/) for the complete
`craftComponent` model or [Observability](/guide/advanced/observability) to
inspect rendering and correlated interactions.
