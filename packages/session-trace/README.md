# @craft-ts/session-trace

Normalizes a portable CraftTS debug session (format v7) into a deterministic
trace, and compares a trace with green references. Pure TypeScript with no
dependency and no browser or Node global: the Playwright fixture, the session
dashboard, the log server and the logs MCP all use this one module, so they
show the same findings.

```ts
import { compareSessionTraces, normalizeSessionTrace, renderSessionTraceComparison } from '@craft-ts/session-trace';

const observed = normalizeSessionTrace(session, { markers });
const result = compareSessionTraces(observed, baselines.map((baseline) => normalizeSessionTrace(baseline)));
console.log(renderSessionTraceComparison(result, { testId: 'shop.checkout', project: 'chromium' }));
```

## The trace

An operation (`http`, `craft`, `navigation` events sharing an `operationId`)
is one step at its start, carrying its outcome and its duration. Each kind
maps to one step kind:

| Event | Step key |
| --- | --- |
| HTTP request | `http:<METHOD>:<path>`, or `server-fn:<id>` on a server function path |
| Craft call | `invocation:<address>` |
| Router navigation | `route:<path>` (other router events suffixed) |
| Route activation | `route-activation:<routePath>` |
| Primitive state | `checkpoint:<address>`, only when the value changes |
| DOM interaction | `interaction:<interactionName>` |
| `test-marker`, fixture markers | `marker:<label>` |

Other kinds are ignored and counted in `trace.ignored`, so a coverage gap shows.
Instance counters, UUIDs, long numbers and dates never enter a key. A
checkpoint compares a fingerprint of its value in which strings holding a digit
and timestamp-sized numbers are masked. `hash` covers keys and details only.

## The comparison

The invariants are the reference steps that every green run shares. The
observed run is aligned with them (a linear-space Myers diff), and findings are
listed in the order of the observed run: an invariant absent from the run, an
invariant whose stable fields changed, a new step, a known step occurring more
often than in any green run, an operation or a gap between steps that is much
slower than in every green run. Fields that vary among green runs, and steps
missing from some of them (the noise), are not compared. Markers locate
findings but are never findings.

`parseSessionTraceComparison` reads a comparison back from JSON;
`isSessionHistory` validates a versioned `history.json`.

## Coverage units and the golden set

`sessionCoverageUnits(trace)` reads what a session covers as units that survive
a refactor: `route:/produits/:id`, `route-activation:<route>`, `flow:<a> -> <b>`,
`invocation:cart.add` (`:failed` when it threw), `exception:<tag>`,
`server-fn:<id>:ok|error:<4xx|5xx|network>`, `http:<METHOD>:<path>:…`,
`checkpoint:<address>`, `interaction:<name>`. Identifiers in a path become
`:id`; values never enter a unit.

`selectGoldenSet(candidates, { app, maxSessions?, weight?, priorityUnits?, previous? })`
keeps the fewest sessions that show every unit (weighted greedy cover, failures
weigh more), one per trace hash, none redundant. Each kept session lists the
units only it shows. With `previous`, the sessions in force win ties, and the
units a dropped session alone showed are listed in `toRecapture` until a new
recording shows them. Pure and deterministic: the same candidates in any order
give the same manifest.
