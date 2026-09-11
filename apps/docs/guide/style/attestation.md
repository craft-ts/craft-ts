# Attestation: a judgement that survives a refactor

A snapshot suite records _what the output was_. Renaming a local variable
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

That is also why the code fingerprint is allowed to be _cautious_. A slice that
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
const digest = await collectLayoutDigest(page, {
  root: '[data-testid=userCard]',
});

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
await assertDeterministic(
  async () => JSON.stringify(await digestOf(page)),
  100,
);
```

## Where it tips over

A content axis is continuous and a layout does not care about most of it. What
it has are **thresholds**. `findTransitions` samples a coarse grid — word
boundaries, digit-count changes — and bisects only inside the intervals where
the discrete signature actually moved.

Then the report that arrives _before_ the bug:

```
userCard/title: 1 → 2 lines at 34 characters.
Today's German string is 33. Margin: 1 (3%), below 15%.
```

Nothing is broken. That is the point: it fails in CI, with no human and no
pixel, on the translation nobody has written yet.

```ts
const search = await findTransitions(signatureAt, {
  axis: 'title',
  min: 1,
  max: 80,
});
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
_future_ case: 40% longer, `[[bracketed]]` so truncation is visible, every letter
accented so an un-externalised string stands out.

```ts
import {
  longestLocale,
  pseudoCatalog,
  findHardCodedText,
} from '@craft-ts/i18n/testing';

longestLocale([en, de, ja], usedKeys); // → { id: 'de-DE', longestKey: 'account.settings' }
findHardCodedText(visibleStrings); // → ['Submit']  ← never went through the catalogue
```

Two pressures, opposite failure modes, kept apart throughout: a rising
`min-content` (an unbreakable word, a URL, a long number) stops a column
shrinking; a rising `max-content` (a long but breakable sentence) steals width
from its siblings in an `auto` track. A long sentence with spaces in it usually
does not move `min-content` at all.

## The command line

Capture a real route into a portable report, then let the CLI derive every
fingerprint from the current dependency graph:

```sh
npm run attest:visual:capture

npm run attest:visual:status
```

The capture starts the demo server when needed and writes the report, PNG
screenshots, and frozen `.snapshot.html` documents to `.craft/runs/`. The
report contains repository-relative graph node ids, digests and screenshot
paths. It deliberately contains no code fingerprint: accepting a fingerprint
from an old browser run could keep a stale slice current forever. Reports,
screenshots and frozen documents are regenerable and ignored; the ledger is
not.

To choose another report path, set `CRAFT_VISUAL_REPORT` on both commands:

```sh
CRAFT_VISUAL_REPORT=.craft/runs/my-run.json npm run attest:visual:capture
CRAFT_VISUAL_REPORT=.craft/runs/my-run.json npm run attest:visual:status
```

```sh
npm run attest:visual:review

npx tsx libs/cli/src/bin/craft-ts.ts attest why 'visual:userCard#viewport=md'
npx tsx libs/cli/src/bin/craft-ts.ts attest renew \
  --subject 'visual:userCard#viewport=md' --verdict ok
npx tsx libs/cli/src/bin/craft-ts.ts attest review \
  --kind visual \
  --report .craft/runs/design-system.json \
  --tsconfig apps/demo/tsconfig.graph.json
npx tsx libs/cli/src/bin/craft-ts.ts attest unwatched
```

For the unified review surface, use the DevTool. It combines visual captures
and template obligations in one queue:

```sh
npm run attest:devtools
```

### The reviewer reviews itself

The review application can use the same mechanism on its own UI. It runs in two
successive sessions so the queue cannot change while it is being captured: the
first instance renders a deterministic fixture queue and freezes representative
states; the second instance reviews that visual report together with template
obligations derived from the review application's own CraftTS graph.

```sh
npm run attest:review-app:capture
npm run attest:review-app:status
npm run attest:review-app:review
```

The capture includes the review page's happy path at mobile and desktop sizes,
the review queue in dark French, the regeneration confirmation, the visual-test
inventory, and the template-obligation inventory. Every portable snapshot is
replayed immediately and must reproduce the live layout digest.
The first run reports missing decisions until a reviewer explicitly accepts or
rejects them. Later unchanged evidence is carried forward by the usual ledger.

The review sidebar also offers **Regenerate all evidence**. It opens a
confirmation describing the current scope and whether previous decisions
exist. Regeneration replaces the report, screenshots, and frozen documents,
then re-reads the graph and rebuilds the queue. It never clears the ledger:
unchanged evidence stays current and only new or changed evidence returns to a
reviewer. Any unsaved reason on the open card is discarded.

This control is shown only when the CLI session explicitly names an npm script:

```sh
craft-ts attest devtools \
  --report .craft/runs/project.json \
  --tsconfig apps/project/tsconfig.graph.json \
  --regenerate-script attest:project:capture
```

Only an npm script name is accepted, not an arbitrary shell command. The script
must recreate the report supplied to `--report`; a failed run preserves the
existing queue.

After rejecting views with comments, use **Prepare Codex iteration** in the
review sidebar. It generates, next to the report, a readable
`<report>.review-feedback.md`, a structured `<report>.review-feedback.json`,
and a copyable `<report>.codex-prompt.md`. The prompt contains the project root,
report, ledger, evidence store, graph `tsconfig`, capture script, source file
paths, scenarios, measured changes, comments and any digest nodes pointed to by
the reviewer. Only the latest `rejected` cards are included. Because these
paths come from the CLI session, `apps/demo` and the review application's
self-attestation resolve to different, correct project contexts.

### One happy path for every page

Application-level coverage is declared once and expanded into mobile and
desktop captures by default:

```ts
import {
  defineHappyPathHttpMocks,
  defineVisualAppConfig,
  visualAppHappyPaths,
} from '@craft-ts/style-testing';

export const homeHappyPath = defineHappyPathHttpMocks(
  'home-page.happy-path.ts',
  {
    'GET /api/users': { response: [{ id: '42', name: 'Ada' }] },
  },
);

export const visualTestConfig = defineVisualAppConfig({
  pages: [
    {
      id: 'home',
      route: '',
      url: '/',
      component: 'component:src/app/home-page.ts:HomePage',
      mocks: homeHappyPath,
    },
  ],
});

for (const scenario of visualAppHappyPaths(visualTestConfig)) {
  test(scenario.id, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto(scenario.page.url);
    // Install scenario.page.mocks, wait for the happy UI, then collectCapture.
  });
}
```

Without an explicit `viewports` value, CraftTS uses `mobile: 390x844` and
`desktop: 1440x1000`. Keep each response dataset in a sibling
`*.happy-path.ts` file. `matchHappyPathHttpRequest` turns that dataset into a
request match suitable for `page.route`; when a `craftRoutes` registry is
available, wrap its exhaustive, response-typed `mockHttpRequestForRoute` result
with `defineRouteHappyPathHttpMocks('page.happy-path.ts', routeMock)`.

Add `assertVisualHappyPathArchitecture(graph.graph, visualTestConfig)` to the
application architecture suite. It fails when a routed page, a required
viewport, or a Craft HTTP endpoint has no successful happy-path fixture. The
fixture feeds a deterministic test environment only; application code keeps
all remote work inside its `query`, `mutation`, or `asyncProcess` loader.

Set `CRAFT_REVIEW_APP_REPORT` to the same path on all three commands to relocate
the default `.craft/runs/review-app.json` report. The implementation notes and
the exact workflow live in `libs/review-attestation/attestation-app/README.md` in the
repository.

Template obligations do not need a Playwright report. They are derived from the
current graph and their canonical proof objects are written to
`.craft/evidence/`:

```sh
npm run attest:templates:status
npx tsx libs/cli/src/bin/craft-ts.ts attest review \
  --kind template \
  --tsconfig apps/demo/tsconfig.graph.json
```

Two of these carry the rest.

**`why`** names the graph nodes that moved inside the subject's slice, and when
a person last actually looked at it. A review that cannot answer "why am I being
asked this?" is a review that gets stamped.

**`unwatched`** lists the nodes that moved and belong to no attested subject —
_what changed while nobody was looking_. It falls out of the machinery for free.

`renew --all` is allowed and is **marked** as a bulk renewal in every
attestation it writes, and `status` counts them. A bulk renewal that left no
trace would turn the register into a rubber stamp, which is worse than having no
register.

## What a reviewer is shown

Two artefacts, and the reviewer switches between them.

**The frozen page** is the render itself: the DOM, the styles, and the form
state, serialised at the moment the digest was taken. It replays as a real
document — real boxes, real `:hover` — which is what lets someone click an
element and name it instead of clicking a pixel and hoping.

Freezing means more than serialising the DOM. Craft injects its styles through
`adoptedStyleSheets`, which `outerHTML` cannot see at all. And keeping the
stylesheets verbatim would leave every `@media` to be re-evaluated against the
_reviewer's_ window: on the demo's route the two conditions in play are
`(min-width: 48rem)` and `(prefers-color-scheme: dark)` — exactly the two axes of
the matrix — so four scenarios would collapse into whatever that laptop said.
Media and supports are therefore evaluated at capture time and their winning
branch inlined. Container queries are left alone, because they ask about the
page's own layout, which the replay reproduces.

The snapshot carries **no script**. Inertness is a property of the artefact, not
a guard that has to hold: nothing to block, nothing to leak, no `craftMethod`
firing on a stray click. The review application does its interactive work from
the parent frame, reaching into a same-origin iframe.

**The screenshot** is the fallback, and the check on the checker: the digest is
blind to anything that does not move a box or a listed style, so a swapped
background or a wrong icon passes every automated test and is obvious to an eye.

### The replay is checked, not trusted

Before anything is drawn on it, the replay is re-measured with the collector
that produced the evidence and compared against the attested digest. A missing
font, a media query left conditional, a stylesheet that could be neither read
nor fetched — each produces a document that looks plausible and measures
differently, and a reviewer would judge it without ever knowing.

When it does not match, the card **moves the reviewer to the screenshot by
itself** and says why in the same sentence, and the verdict is recorded as
`degraded`: judging a photograph and judging the document are different claims.
The choice is a fallback, not a lock — asking for the page brings it back, still
labelled for what it is.

The message names the cause, not its symptoms. A subject the frozen page does
not contain reported "36 attested node(s) are absent" followed by forty
addresses beginning `html/head/meta`: every consequence of one fact, and none of
them stating it. It now reads

> The frozen page has no `.design-system-host` in it, so what it shows is not
> this component. That happens when the stored snapshot is older than the report
> it is paired with, or when the component's root selector changed after it was
> captured.

which is the same finding with the reviewer's next move in it.

Two things the check caught while it was being built, which is what it is for:
a marker stylesheet that set `position: relative` on the attested root and moved
the tree it was supposed to annotate, and a 1px border on the frame, which is
subtracted from the viewport inside it and made every measurement 2px narrow.

## Knowing what is actually being judged

A capture shows the whole page — shell, navigation, neighbours — because a
component has to be judged in the frame it sits in. So the reviewer has to be
able to tell the subject from the decor, or a remark lands on a card that does
not cover it.

The digest answers this exactly: its paths **are** the attested set. Three tiers
follow, and all three come from data that already exists:

The screen is laid out in the order the work happens: the queue on the left,
the evidence in the middle, the verdict on the right, where it stays in place
while a long capture is scrolled.

The surface speaks English and French, and follows the system's light or dark
preference until the reviewer chooses otherwise — both controls sit in the
sidebar, and both are applied before the first paint rather than corrected a
frame later. The French dictionary is typed as the English one, so a message
added on one side and forgotten on the other does not compile.

Neither reaches the frozen page. It is a render that was captured, not an
interface: translating it, or repainting its ground, would make it something
other than what was measured. Enforcing that turned up a fidelity bug the tool
had been hiding by being permanently dark — a page paints its own colours, but
not the canvas underneath, and that comes from `color-scheme`, which was the
_reviewer's_ preference. A component captured on white came back on black for
anyone whose machine asks for dark. The replay now declares the scheme its
capture was taken in.

| tier     | source                         | shown as                                  |
| -------- | ------------------------------ | ----------------------------------------- |
| changed  | the paths in the readable diff | outlined, and the reason the card is here |
| attested | the digest's own paths         | selectable, highlighted on hover          |
| decor    | everything else                | dimmed, never removed                     |

The outlines carry a legend, drawn from the same object that paints them — a key
that keeps its own copy of a colour is a key that will one day name the wrong
one. Entries for tiers this card has none of are not shown, so the legend
describes the page in front of the reviewer rather than the system in general.

Selection is a set, not a node. Ctrl-click (cmd on a Mac) adds one, and dragging
a box takes everything it touches; the count is stated beside the reason field
that is about to name them. A remark covering a row of buttons was otherwise the
same sentence retyped once per button, which is also how a queue fills with
findings nobody can group afterwards. The band is drawn beside the frame and
never inside it: adding an element to the frozen document would break the only
claim it makes.

### One reason, several complaints

A rejection is rarely about one thing. Right-clicking a selection drops a
reference into the reason **where the reviewer is typing**:

> The title is cut at 34px in German. `[#1: 2 nodes]` And the row below
> overflows its box. `[#2: 5 nodes]`

The reason stays one piece of prose, and each reference carries the text written
since the one before it — so the second complaint is filed against the second
group and not, as a single note against every node would have it, against all
seven.

Selecting _is_ referencing: there is no second gesture. Pointing at part of the
page drops the reference straight into the reason, and refining the selection
edits that same reference rather than adding another — a click followed by a
ctrl-click leaves one saying "2 nodes", not a stale "1 node" beside it. Typing
ends the session: the reference belongs to a sentence now, and the next
selection starts its own. Emptying the selection takes the reference back out,
because a reference to nothing is worse than none.

The field is a `contenteditable`, not a `textarea`, so a reference is an element
rather than the literal characters `[#1: 2 nodes]`: hovering it lists the
addresses it stands for **and paints those nodes in the frozen page**, dashed
rather than solid so it cannot be mistaken for the selection. That is the whole reason for the swap. As text, the
answer to "which nodes is this one about" had to live in a list somewhere else
on the page, and a reviewer reading a sentence had to leave it to find out. The
plain text is still the model — everything downstream reads the serialised
string — so the chips are a rendering of the reason and never a second version
of it.

Two things that swap broke, both worth stating because neither is obvious. The
field is not scrollable: a clipping context cuts the tooltip off any reference
on the first line, and which nodes a reference covers must not depend on where
in the sentence it was written. And the keyboard shortcuts had to learn about
it — the guard knew `input`, `textarea` and `select`, so typing "And the row is
cut" pressed `a`, Accept, and filed a verdict the reviewer never reached.

Position settles that, not punctuation. The first rule tried was "the sentence
the token stands in", and it was wrong for the way people write: the complaint
is typed, ended, and _then_ the group is pointed at, so the caret is past the
full stop and the token opens the next sentence rather than closing its own.
Referencing first and explaining after reads the other way round, so a group
with nothing before it takes what follows.

The tokens are scaffolding. What is recorded is the prose with them removed,
plus the addresses each one pointed at — and the text remains the only state:
deleting a reference deletes it, with no second list left holding a claim the
reason no longer makes.

And the mistake is made unrecordable rather than merely discouraged. A rejection
carries the path of the node it is about, so the server can refuse one that
names something this subject does not attest:

> `demo-nav/toggle` is not attested by this subject. File the remark on the card
> that covers it.

### Attested is not the same as looked at

The capture also records the gap, because it is large. On the demo's route: **36
nodes attested, 21 off screen, 1 covered** by the page's own fixed button. An
attestation that stayed quiet about that would claim a coverage it does not
have, so the card states it and the screenshot draws the line where the viewport
ended.

The verdict buttons carry what they _do_. Three of the five are accepted by the
ledger and two are not, and nothing in the words says which — a reviewer
choosing between "Known issue" and "Block" is choosing between "stops asking"
and "asks every run", which is the only difference that matters and the one they
could not see.

"Fit to window" applies to the frozen page too, by `transform: scale()` and
never by a width: the frame has to stay exactly the viewport the page laid
itself out in, or the replay stops being the render that was measured. A
transform changes what is painted and nothing about what was measured.

"Fit to window" bounds both axes. Bounding the width alone — which is what it
did — fits a picture wider than the canvas and does nothing whatsoever to a
narrow one, and every capture on the demo route is 375 or 768 wide and 916 tall:
the control showed the whole render on one scenario and two thirds of it on the
next, for a reason that had nothing to do with what was being judged. It is not
offered while the frozen page is on screen, because scaling that page would
relayout it and it would stop being the render that was measured.

The one covered node is the case only the frozen page can resolve: **lift what
is covering it** and see what was underneath. In a screenshot those pixels have
already been replaced.

The control names what it will lift — `Hide button.clear-cache-btn` — and is
offered only when something is actually covering the component. It used to read
"Hide 1 overlay", which asked the reviewer what an overlay is and counted the
wrong thing: covered _nodes_, when one button sitting on five of them is one
thing to lift. Worse, it marked every fixed element on the page whether or not
it covered anything, and marked nothing that covered without being fixed — so on
most cards it lifted something irrelevant, and on the cards that mattered it
could do nothing while the coverage line insisted a node was covered.

What is lifted is now decided by probing the replay with the collector's own
rule, which is also where the clamping bug in that rule was found: a sample
point outside the viewport was pulled back to the edge, so a node straddling the
fold was reported as covered by whatever happened to sit on the fold line.
Samples outside the viewport are skipped in both places now.

## The review queue

Two mechanisms keep it from being abandoned, and neither is optional. The
carry-forward keeps everything whose output did not move out of the queue
entirely. And the queue **clusters by the shape of the diff**: one border-radius
change produces two hundred scenarios with an identical delta, and one decision
covers all of them — with the cluster written into every attestation it covered,
so "judged" and "judged alongside 199 others" stay distinguishable.

The review surface is itself a CraftTS application. A `query` owns the live
queue, a `mutation` records each decision, and local `state` owns navigation,
notes and evidence zoom. The Node server remains the authority for the ledger
and the content-addressed evidence store. A card disappears only after that
server confirms the write; failures remain visible and reviewable.
`attest review` attempts to open the local URL in the default browser and always
prints it so headless or remote environments can open it manually.

First-time captures are deliberately **not clustered**. With no approved digest
there is no delta proving that two new screenshots represent the same change.
The UI shows one decision per scenario, its exact viewport, captured element
size, colour scheme, browser version and target selector. Real identical deltas
may still be clustered, with every covered scenario listed before the decision.

The default shortcuts are `j`/`k` to move, `a` to accept, `n` to accept with a
non-empty note and `r` to reject. A rejection requires a non-empty reason. That
reason is stored in the ledger and shown prominently if the scenario returns to
the review queue, so it can guide the corrective code change. The same actions
are available as buttons.

## What this does not replace

`visualMatrix` stays. It is the cheap tier for out-of-flow things — modals,
popovers, tooltips — which have no neighbourhood, and for purely pictorial axes,
which have no layout consequence. Both are enumerable from the sheets alone,
with no page in sight.
