# @craft-ts/attest

A human judgement, recorded so it survives a refactor.

> **Experimental.** The ledger format, the subject identifiers and the CLI
> surface can still change between minor versions. The ledger is regenerable —
> re-attesting is the recovery — but pin the version in a pipeline.

A snapshot suite records *what the output was*. This package records something
else: **a person looked at this output and judged it correct, and that
judgement holds for as long as the code producing it has not moved.**

## The two caches

Two questions look alike and are not:

| question                       | keyed on                    | a wrong answer costs |
| ------------------------------ | --------------------------- | -------------------- |
| should this be re-run?         | fingerprint of a code slice | CPU                  |
| should a human be asked again? | hash of the evidence        | somebody's afternoon |

From which the central rule: **when the code changes and the evidence does not,
the attestation carries itself forward**, marked `renewed`. That is what makes
the mechanism survive a refactor — and what licenses a deliberately cautious
code fingerprint. A fingerprint that is too coarse only costs a re-run. Only one
that is too fine is dangerous.

## States

| state     | meaning                                        |
| --------- | ---------------------------------------------- |
| `current` | the fingerprint has not moved: nothing to do   |
| `renewed` | code moved, output did not: carried, no human  |
| `review`  | the output differs: a human has to look        |
| `missing` | never attested                                 |

## Subject-agnostic on purpose

This package knows nothing about browsers, the DOM or style sheets. A subject is
a string, a fingerprint and a piece of evidence — which is why the same register
serves a test suite and a rendered component. If it ever needs to import
something visual, the abstraction is wrong.

```ts
import { parseLedger, reportOn, observeTests } from '@craft-ts/attest';

const { ledger } = parseLedger(await readFile('.craft/attestations.jsonl', 'utf8'));
const report = reportOn(ledger, observeTests(run, fingerprintOf));

report.counts; // { current: 812, renewed: 14, review: 2, missing: 0 }
```

## Never a rubber stamp

A bulk renewal is allowed and is **marked** (`bulk: true`), and `attest status`
counts it. A `renew --all` that left no trace would turn the register into a
stamp, which is worse than having no register at all.

Every reduction that is not exactly true — a sampled axis, a declared seam, a
neighbourhood composition — is written into the attestation as an assumption.
An attestation never says "validated"; it says "validated, under this
assumption", and a changed assumption sends the subject back to review instead
of quietly becoming a lie.
