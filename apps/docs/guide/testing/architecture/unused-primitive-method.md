# Unused primitive methods

`assertNoUnusedPrimitiveMethods` requires every method exposed by a primitive
insertion to have at least one call site in the project. An unused method is
dead interface and should be removed from the primitive.

<<< @/tests/snippets/guide/testing/architecture/unused-primitive-method.spec.ts#example

The check is graph-wide, so it can find a method declared in one module that
is never called by any component, service or feature module. This also applies
to CraftTS libraries included in the analyzed project: public methods must be
kept intentionally, or the project should exclude that library from the graph.

The error includes the primitive, method and declaration location:

```text
Primitive method state:counter.decrement is never used in this project (counter.ts:12). Remove it.
```

Methods bound internally with `on$` are not exposed and are not checked.

## See also

- [`assertPrimitiveMethodsUsedOnce`](/guide/testing/architecture/primitive-method-usage)
- [The architecture graph](/guide/testing/architecture)
