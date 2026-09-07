# Template obligations

Tests and visual captures describe things that were observed. A component
template describes something earlier: what the component promises to display
and what actions it exposes. CraftTS can derive those promises directly from
the dependency graph and record a human judgement about each one.

```sh
craft-ts attest status \
  --kind template \
  --tsconfig apps/demo/tsconfig.graph.json
```

No test or browser report is required. The command reads each
`craftComponent` template and derives two kinds of obligation.

## Render and command

A **render** obligation starts at a reactive binding in the template and follows
the graph to the state, computed value, query, or property that produces it.

```ts
({ total, user }) => div([ifNode(user.isAdmin, () => strong(total))]);
```

This template promises to render `user.isAdmin` and `total`. Two occurrences of
the same target are one promise, not two.

A **command** obligation starts at a handler on an interactive element and
follows the call chain it triggers.

```ts
({ users }) => button('remove', { click: () => users.remove(id) }, 'Remove');
```

This template promises that the named button invokes `users.remove`. The
element tag and its literal name are part of the promise, so moving the action
to a different control asks for a new judgement.

Computed or dynamic accesses that cannot be addressed are printed as
`template-obligation-unresolved` diagnostics. They are known extraction gaps;
they are never silently treated as if the template made no promise.

## What `renewed` means

Every obligation has two independent keys:

| key              | meaning                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| code fingerprint | the transitive code slice behind the bound or invoked target                          |
| evidence         | the canonical shape of the promise: direction, element, name, target, and target kind |

When implementation code changes but the template still promises the same
thing, the state is `renewed`. The previous judgement carries forward without
asking a person to review it again. When the template binds or invokes a
different target, the evidence changes and the state is `review`.

An attested obligation is **not a passing test**. It says that a person confirmed
the promise was intentional. It does not prove that the implementation fulfils
that promise at runtime.

## Removing a promise is a decision

If an attested template obligation disappears, `status --kind template` exits
with a failure until the removal is signed. The ledger line is retained and
marked with why the promise went away:

```sh
craft-ts attest retire \
  --kind template \
  --subject 'template:component:src/card.ts:Card#command:property:src/card.ts:save' \
  --reason superseded \
  --note 'Saving is automatic now.'
```

The reasons are:

- `superseded`: the product now fulfils the need another way;
- `defect`: the former promise was wrong;
- `derivation`: the extractor produced an obligation it should not have. Track
  this count as a quality signal for the extractor.

The note is mandatory because absence is otherwise indistinguishable from an
accidental deletion. If a retired obligation later reappears, it returns to the
review queue; the next human verdict clears the retirement.

## Measured rename noise

The target identity remains part of the evidence because the implementation
measurement stayed inside its review budget. Replaying the latest 20 commits
that touched `apps/demo` produced a median of **0 actionable obligation changes
per commit** (one commit removed four obligations, one added three, and the
other eighteen changed none), with **0 changes attributable to a pure target
rename**. This is below the threshold of three, so mass renames can continue to
be handled by review clustering without weakening the promise recorded in the
evidence.
