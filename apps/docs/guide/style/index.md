# Typed styles

`@craft-ts/style` makes a component's visual surface **derivable** instead of
guessed. For any component you can ask what the exhaustive set of visual states
is, which of them are impossible, and whether the context it needs exists — and
the answers come from the same values the CSS is emitted from, not from a second
description that can drift.

It buys that in three levels, and they do not adopt the same way.

| level                          | what it gives you                                                      | granularity of adoption     |
| ------------------------------ | ---------------------------------------------------------------------- | --------------------------- |
| 1 — tokens and typed variables | no value is a string; no class is built at runtime                     | **one component at a time** |
| 2 — axes and the matrix        | the exhaustive list of visual states, with the drivers that reach them | **per component**           |
| 3 — context obligations        | a missing scroll port, container or clipping ancestor fails the build  | **per whole route**         |

Read that last column carefully, because it is the part that is easy to get
wrong. Level 3 is not a per-component guarantee: one unmigrated link in a route
and the requirement travels past it unanswered, so the compiler has nothing to
check. A partial level-3 adoption gives **zero** of the guarantee, not most of
it — and the graph reports it rather than hiding it.

## The rule the whole thing turns on

**Static goes to a class at build time; dynamic goes through a typed custom
property.** No class is ever assembled in the browser.

```ts
// tone is an axis: five rules the emitter already wrote.
when(tone.danger, [set(v.bg, palette.accent.danger)]);
```

```ts
// a width that depends on a signal cannot be a class — there is no finite set
// of widths to emit — so it goes through a registered <percentage>.
style: function* () {
  return assign(meterVars.value, unit.pct(yield* value()));
}
```

That split is what keeps the set of visual states finite, and therefore
enumerable. A class built from a signal is a state nothing recorded.

## Where to go next

- [Tokens and typed variables](./tokens.md) — level 1.
- [Axes and the visual matrix](./variants.md) — level 2.
- [Context obligations](./obligations.md) — level 3.
- [Testing what you built](./testing.md) — drivers, baselines, exhaustiveness.

A working example lives in the demo, at
`apps/demo/src/app/examples/design-system/`, with a README that walks through
the same three levels in code.
