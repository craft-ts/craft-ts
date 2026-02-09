# craftInputs

Creates input definitions for use within a craft store, enabling dynamic parameter injection from components.

## Import

```typescript
import { craftInputs } from '@ng-angular-stack/craft';
```

## Introduction

`craftInputs` enables external data to be passed into a craft store by:

- Defining a schema of expected input parameters with their types
- Converting input values to signals automatically
- Making inputs accessible to all craft entries (queries, mutations, states)
- Providing type-safe parameter passing from components to store
- Enabling reactive updates when input values change

## Use Cases

- **Dynamic parameters**: Pass component-specific data to queries (route params, user selections)
- **External signals**: Inject signals from parent components or services
- **Conditional loading**: Control when queries execute based on input availability
- **Multi-instance stores**: Create store instances with different input configurations
- **Component coordination**: Share component state with store logic

## Input Definition

- Define inputs as a record of keys with their types
- Inputs are automatically converted to signals in the context

## Context Access

- Inputs are accessible in all craft entries via the context parameter
- Access as: `context.inputName` in query/mutation/state factories
- Inputs are available as signals: `context.inputName()` returns the value

## Store Injection

- When injecting the store, pass actual signal values: `injectCraft({ inputs: { inputName: signal(value) } })`
- TypeScript enforces providing all required inputs
- Optional inputs can be omitted

## Examples

### Basic inputs for dynamic query parameters

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInputs({
    userId: undefined as string | undefined,
  }),
  craftQuery('user', ({ userId }) =>
    query({
      params: userId,
      loader: async ({ params }) => {
        if (!params) return undefined;
        const response = await fetch(`/api/users/${params}`);
        return response.json();
      },
    }),
  ),
);

@Component()
class MyComponent {
  readonly userId = input.required<string>();
  readonly store = injectCraft({
    inputs: {
      userId: this.userId,
    },
  });
}
```

## Craft Utilities

Links to all craft utilities implemented in `libs/core/src/lib`:

- [craft](./craft.md)
- [craftState](./craft-state.md)
- [craftSources](./craft-sources.md)
- [craftInputs](./craft-inputs.md)
- [craftComputedStates](./craft-computed.md)
- [craftAsyncProcesses](./craft-async-processed.md)
- [craftQuery](./craft-query.md)
- [craftQueryParam](./craft-query-param.md)
- [craftQueryParams](./craft-query-params.md)
- [craftMutations](./craft-mutation.md)
- [craftSetAllQueriesParamsStandalone](./craft-set-all-queries-params-standalone.md)
- [craftInject](./craft-inject.md)
