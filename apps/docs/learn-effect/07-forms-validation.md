# 7. Build forms and validate boundaries

**Goal:** use Craft forms for interaction and Effect Schema for data that crosses
a boundary.

## Forms remain Craft state

A form derives from the state it edits. Use `insertForm`, validators and
`insertFormSubmit` exactly as in the regular Craft path:

```typescript
import { Schema } from 'effect';

const CreateTaskInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    title: Schema.String,
    description: Schema.String,
  }),
);

const createTask = yield* mutationEffect('createTask', {
  methodSchema: CreateTaskInput,
  method: (input) => input,
  loader: ({ params }) => createTaskEffect(params),
});

const draft = yield* state(
  'draft',
  { title: '', description: '' },
  insertForm(
    insertFormSchema(CreateTaskInput),
    insertFormSubmit(createTask),
  ),
);

const form = draft.form();
```

The exact field insertions depend on the shape of your component, but the
ownership rule does not change: form values and validity are Craft state; the
submit operation is an Effect-backed mutation.

## For more advanced form validation

This Effect example is enough when the main concern is validating the payload
at the boundary. For richer form behaviour — field-level rules, conditional
validators, cross-field validation, nested forms or custom typed exceptions —
use Craft's dedicated form API with `insertFormAttributes`, `cValidate` and
`insertSelectFormTree`. See the [Forms guide](/guide/forms/) for this
alternative. Effect Schema can still be kept on `methodSchema` to validate the
final payload before the Effect runs.

## Effect Schema at the boundary

Effect Schema is not passed directly to Craft. Convert it to Standard Schema:

```typescript
import { Schema } from 'effect';

const CreateTaskInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    title: Schema.String,
    description: Schema.String,
  }),
);
```

Use it for `methodSchema`, `paramsSchema` or `loaderSchema`. The decoded output
is what the rest of the application sees. A synchronous schema is safe for
method arguments and local writes; asynchronous decoding belongs in
`loaderSchema` or in the Effect loader itself.

## Submit failures

Validation failures are parse exceptions. Domain failures stay in Effect's
typed error channel and become `exceptions().loader` on the mutation. The form
can therefore distinguish:

- invalid input, before the Effect runs;
- a business rejection returned by the server/domain;
- an unexpected defect that should reach the technical error boundary.

Do not put navigation, toasts or state writes inside a computed exception list.
Drive those actions after `submit()` or from an explicit process.

## What you gained

Craft owns the interaction model and Effect owns the domain validation or write;
their error channels remain distinct and typed.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 6. Provide Layers and route the app](/learn-effect/06-layers-routing)

[8. Test the graph →](/learn-effect/08-testing)

</div>
