# Attestation application

The attestation application is the unified review surface for visual captures
and template obligations. It follows the same CraftTS constraints as the
applications it reviews: the recommended ESLint rules, a dedicated graph
configuration, and executable architecture checks.

It also reviews itself. This requires two successive sessions rather than one
self-referential live session:

1. the capture session starts the review application with a deterministic
   fixture queue and freezes its representative states;
2. the review session starts a new instance with that visual report and the
   template obligations derived from the review application's own graph.

The separation is intentional. A server cannot reliably review a queue that it
is still changing while capturing itself. The frozen, script-free artefacts
make the second session reproducible and avoid an infinite recursion.

## Run the self-attestation

From the repository root:

```sh
npm run attest:review-app:capture
npm run attest:review-app:status
npm run attest:review-app:review
```

The capture replays three steps on all four default viewports: the review
queue, the regeneration dialog opened automatically, and the application
overview. It records full-page PNG evidence in isolated browser contexts.
Capture and human review remain separate sessions.

## Application scenarios and API fixtures

[`src/review-app.happy-path.ts`](./src/review-app.happy-path.ts) imports and
exports the fixture data, page and explicit scenario recipe. The four defaults
are mobile (390×844), tablet (834×1112), desktop (1440×1000) and wide (2560×1440).
A custom viewport record replaces all defaults. API mocks execute before
navigation and unexpected application requests fail the generation.

See [Application capture contract](../APPLICATION-CAPTURES.md) for actions,
modal coverage, exceptions, typed mock composition, provenance and comparison.
The last human-accepted PNG is the fixed reference; tolerance never replaces
that reference automatically. Component matrices and template attestations
retain their historical behavior.

By default it writes the report and its PNG and `.snapshot.html` artefacts under
`.craft/runs/`, starting with `.craft/runs/review-app.json`. Use the same custom
path for every command when another location is needed:

```sh
CRAFT_REVIEW_APP_REPORT=.craft/runs/my-review-app.json \
  npm run attest:review-app:capture
CRAFT_REVIEW_APP_REPORT=.craft/runs/my-review-app.json \
  npm run attest:review-app:status
CRAFT_REVIEW_APP_REPORT=.craft/runs/my-review-app.json \
  npm run attest:review-app:review
```

The first status is expected to contain `missing` decisions and to exit non-zero:
no person has approved that evidence yet. Inspect and accept or reject those
decisions in the DevTool. Decisions are recorded in the normal
`.craft/attestations.jsonl` ledger, with canonical evidence in
`.craft/evidence/`. On later runs, unchanged evidence remains current, code-only
changes are renewed, and changed output returns to review.

The review server uses port `4320` by default. If another review session already
owns it, choose a free port:

```sh
npm run attest:review-app:review -- --port 4321
```

### Hand off rejected views to Codex

When a review is opened by the CLI, the sidebar exposes **Prepare Codex
iteration**. It writes three files next to the report:

- `<report>.review-feedback.md`, the readable source of truth for rejected
  cards, comments, pointed digest nodes, source files, scenarios and evidence;
- `<report>.review-feedback.json`, the equivalent machine-readable data;
- `<report>.codex-prompt.md`, a prompt that points Codex at the feedback and
  includes the project-specific root, report, ledger, evidence store,
  `tsconfig`, and capture script.

The generated prompt is also displayed in the review UI and can be copied. The
paths are derived from the current CLI invocation, so a demo review and the
self-review use their own report directory and graph configuration. Only cards
whose latest decision is `rejected` are exported; accepted, blocked and known
issue decisions are not silently turned into implementation work.

## Regenerate from the review application

The `review` script configures the DevTool with
`--regenerate-script attest:review-app:capture`, so the sidebar exposes a
**Regenerate all evidence** button. Confirmation is required because the
operation launches the complete Playwright capture and can take time.

The confirmation explains the exact boundary:

- `.craft/runs/review-app.json`, PNG files, and frozen documents are regenerated;
- `.craft/attestations.jsonl` and all recorded human decisions are preserved;
- unchanged evidence remains current;
- new or changed evidence returns to the queue;
- an unsaved reason on the current card is discarded.

The dialog says whether this is the first generation or how many existing
decisions will be preserved. While regeneration runs, the button is disabled.
If the command fails, the former queue stays usable and an error is shown.

For another project, the button is opt-in. Pass the name of a safe npm script —
not an arbitrary shell command — when opening the reviewer:

```sh
npx craft-ts attest devtools \
  --report .craft/runs/project.json \
  --tsconfig apps/project/tsconfig.graph.json \
  --regenerate-script attest:project:capture
```

The script must rebuild the report passed to `--report`. After it completes,
the DevTool re-reads that report, rebuilds the CraftTS graph and template
obligations, persists the new evidence, and refreshes the complete queue.

After changing the review application's TypeScript, template, styles, messages,
API dataset, or fixture scenarios, run the three commands again. Change the fixture version
stored in the capture assumptions only when the scenario contract itself
changes; ordinary UI changes must be detected through their evidence digest.
