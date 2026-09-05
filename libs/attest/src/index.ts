/**
 * `@craft-ts/attest` — a human judgement, recorded so it survives a refactor.
 *
 * The register answers two questions that are never the same question:
 *
 * | question                          | key                        | a wrong answer costs |
 * | --------------------------------- | -------------------------- | -------------------- |
 * | should this be re-run?            | fingerprint of a code slice | CPU                  |
 * | should a human be asked again?    | hash of the evidence        | somebody's afternoon |
 *
 * When the code moves and the evidence does not, the judgement carries forward
 * on its own. That single rule is what lets an attestation outlive the code it
 * was made about, and what licenses a deliberately cautious code fingerprint.
 *
 * Nothing here knows about browsers, DOM or style sheets. A subject is a
 * string, a fingerprint and a piece of evidence.
 */
export * from './lib/attestation.js';
export * from './lib/ledger.js';
export * from './lib/state.js';
export * from './lib/evidence-store.js';
export * from './lib/subjects/test.js';
export * from './lib/subjects/visual.js';
