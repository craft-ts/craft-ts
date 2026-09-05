# Attestation: a judgement that survives a refactor

A snapshot suite records *what the output was*. Renaming a local variable
changes no pixel, and yet the whole suite asks to be looked at again — so people
run `--update-snapshots`, and the file that was supposed to record a human
decision records nothing at all.

This records something else:

> **A person looked at this output and judged it correct, and that judgement
> holds for as long as the code producing it has not moved.**

## Two caches, never one

Two questions look alike and are not:

| question                       | keyed on                    | a wrong answer costs |
| ------------------------------ | --------------------------- | -------------------- |
| should this be re-run?         | fingerprint of a code slice | CPU                  |
| should a human be asked again? | hash of the evidence        | somebody's afternoon |

From which the rule the whole design rests on: **when the code changes and the
evidence does not, the attestation carries itself forward**, marked `renewed`,
with a note saying "code changed, output unchanged".

That is also why the code fingerprint is allowed to be *cautious*. A slice that
is too wide only costs a re-run. Only a slice that is too narrow is dangerous —
it misses a regression in silence, and nobody is ever asked about it again.

| state     | meaning                                       |
| --------- | --------------------------------------------- |
| `current` | the fingerprint has not moved: nothing to do  |
| `renewed` | code moved, output did not: carried, no human |
| `review`  | the output differs: a human has to look       |
| `missing` | never attested                                |

## The evidence is a digest, not a picture

What a person judges is the **layout digest**: boxes rounded to the half pixel,
intrinsic sizes, a closed list of computed styles, and a set of discrete facts —
line counts, column counts, what wraps, what clips, what scrolls, what overlaps.

Three things follow, and each is why the digest exists rather than a screenshot:

- it is **diffable**. `.card padding 8→12` is a sentence a reviewer reads in a
  second; two images are not, and a reviewer who cannot see what changed
  approves everything.
- it is **assertable**. Overflow, truncation, overlap and contrast are
  comparisons of numbers, so they are **failures**, not queue items — nobody is
  asked, and the message names the node and the pixel count.
- it is **stable**. Anti-aliasing and font hinting move pixels without moving
  layout; under an image comparison every one of those is a review item.

The PNG is still kept, in the content-addressed store, for the human. It is a
review aid, never the reference.

```ts
import {
  assertNoLayoutViolations,
  collectLayoutDigest,
  makeDeterministic,
} from '@craft-ts/style-testing';

await makeDeterministic(page);
await page.goto('/users');
const digest = await collectLayoutDigest(page, { root: '[data-testid=userCard]' });

assertNoLayoutViolations(digest, { scenario: 'locale=de-DE' });
// → userCard/title hides 34px of "Benutzerkontoeinstellungen".
```

## Determinism is a feature, not hygiene

It carries two independent mechanisms. The **carry-forward** reads "the code
moved, the output did not"; a wobbling render never produces the same output
twice, the queue fills with changes nobody made, and people start stamping. The
**bisection** reads a discrete signature as a function of one parameter; a wobble
manufactures thresholds that do not exist.

`makeDeterministic` freezes the clock, seeds `Math.random`, kills animations,
transitions and the caret, and refuses every network request by default. A
hundred consecutive renders of one scenario must produce a hundred identical
digests before anything else is worth building:

```ts
await assertDeterministic(async () => JSON.stringify(await digestOf(page)), 100);
```

## Where it tips over

A content axis is continuous and a layout does not care about most of it. What
it has are **thresholds**. `findTransitions` samples a coarse grid — word
boundaries, digit-count changes — and bisects only inside the intervals where
the discrete signature actually moved.

Then the report that arrives *before* the bug:

```
userCard/title: 1 → 2 lines at 34 characters.
Today's German string is 33. Margin: 1 (3%), below 15%.
```

Nothing is broken. That is the point: it fails in CI, with no human and no
pixel, on the translation nobody has written yet.

```ts
const search = await findTransitions(signatureAt, { axis: 'title', min: 1, max: 80 });
assertMargins([marginOf(search, longest.longestLength)]);
```

A bisection is not exactly true — it finds the thresholds that exist between the
points it looked at. So the sample count goes into the attestation as an
**assumption**, and an attestation never says "validated"; it says "validated,
under this assumption". A changed assumption sends the subject back to review
rather than quietly becoming a lie.

## Translation as a source of axes

The catalogue is a TypeScript value, which makes two of these exact:

- **the longest locale** for a screen is a computation over the keys that screen
  uses. One axis point, and the right one — where "test it in German" is only an
  approximation.
- **the plural categories** are already declared and already checked exhaustive
  per locale. They are axis points by construction.

The **pseudo-locale** is the approximation, and it is the one that finds the
*future* case: 40% longer, `[[bracketed]]` so truncation is visible, every letter
accented so an un-externalised string stands out.

```ts
import { longestLocale, pseudoCatalog, findHardCodedText } from '@craft-ts/i18n/testing';

longestLocale([en, de, ja], usedKeys); // → { id: 'de-DE', longestKey: 'account.settings' }
findHardCodedText(visibleStrings);      // → ['Submit']  ← never went through the catalogue
```

Two pressures, opposite failure modes, kept apart throughout: a rising
`min-content` (an unbreakable word, a URL, a long number) stops a column
shrinking; a rising `max-content` (a long but breakable sentence) steals width
from its siblings in an `auto` track. A long sentence with spaces in it usually
does not move `min-content` at all.

## The command line

```sh
craft-ts attest status --report vitest-report.json
craft-ts attest why 'visual:userCard#viewport=md'
craft-ts attest renew --subject 'visual:userCard#viewport=md' --verdict ok
craft-ts attest review
craft-ts attest unwatched
```

Two of these carry the rest.

**`why`** names the graph nodes that moved inside the subject's slice, and when
a person last actually looked at it. A review that cannot answer "why am I being
asked this?" is a review that gets stamped.

**`unwatched`** lists the nodes that moved and belong to no attested subject —
*what changed while nobody was looking*. It falls out of the machinery for free.

`renew --all` is allowed and is **marked** as a bulk renewal in every
attestation it writes, and `status` counts them. A bulk renewal that left no
trace would turn the register into a rubber stamp, which is worse than having no
register.

## The review queue

Two mechanisms keep it from being abandoned, and neither is optional. The
carry-forward keeps everything whose output did not move out of the queue
entirely. And the queue **clusters by the shape of the diff**: one border-radius
change produces two hundred scenarios with an identical delta, and one decision
covers all of them — with the cluster written into every attestation it covered,
so "judged" and "judged alongside 199 others" stay distinguishable.

## What this does not replace

`visualMatrix` stays. It is the cheap tier for out-of-flow things — modals,
popovers, tooltips — which have no neighbourhood, and for purely pictorial axes,
which have no layout consequence. Both are enumerable from the sheets alone,
with no page in sight.
