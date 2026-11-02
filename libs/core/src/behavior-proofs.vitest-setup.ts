/**
 * Vitest setup file: records what each test exercised and hands it to the
 * behaviour-proof reporter of `@craft-ts/dev-tools/behavior-catalog` through
 * the test's `meta`. Left out of the published build: it imports vitest.
 *
 *   setupFiles: ['@craft-ts/core/behavior-proofs-setup'],
 *   reporters: ['default', behaviorProofReporter({ rootDir })],
 */
import { afterEach, beforeEach, expect } from 'vitest';
import {
  ɵprovideBehaviorProofRecording,
  ɵstartBehaviorProofRecording,
  ɵstopBehaviorProofRecording,
  type ɵBehaviorProofRecording,
} from './lib/behavior-proof-recorder';
import { ɵregisterCraftTestProviders } from './lib/craft-test-providers';

declare module 'vitest' {
  interface TaskMeta {
    craftBehaviorProof?: ɵBehaviorProofRecording;
  }
}

ɵregisterCraftTestProviders([ɵprovideBehaviorProofRecording()]);

beforeEach(() => {
  // An invocation no assertion came after was exercised, not observed.
  ɵstartBehaviorProofRecording({
    assertions: () => expect.getState().assertionCalls,
  });
});

afterEach(({ task }) => {
  task.meta.craftBehaviorProof = ɵstopBehaviorProofRecording();
});
