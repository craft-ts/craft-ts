import { describe, expect, it } from 'vitest';
import {
  compareReplayScenarioValue,
  createReplayDriftReport,
  proposeReplayScenarioRecapture,
  replayScenarioLifecycle,
  validateReplayScenario,
} from './debug-session-scenario';

const baseScenario = {
  format: 'craft-replay-scenario',
  schemaVersion: 1,
  id: 'users-list',
  scenarioVersion: 1,
  reason: 'Initial behavior contract',
  checkpoints: [{ id: 'loaded-count', path: '/count', expected: 2 }],
  eventAssertions: [],
  visualAssertions: [],
  tolerances: [],
};

describe('replay scenario contract', () => {
  it('validates a sidecar independently from the session archive version', () => {
    expect(validateReplayScenario(JSON.stringify(baseScenario))).toMatchObject({
      ok: true,
      scenario: {
        format: 'craft-replay-scenario',
        schemaVersion: 1,
        scenarioVersion: 1,
      },
    });
  });

  it.each([
    { kind: 'ignore', expected: 'request-1', actual: 'request-2' },
    { kind: 'redacted', expected: '[REDACTED]', actual: 'runtime-value' },
  ])(
    'applies the targeted $kind rule only at its exact path',
    ({ kind, expected, actual }) => {
      const compared = compareReplayScenarioValue(
        { requestId: expected, nested: { value: 1 } },
        { requestId: actual, nested: { value: 1 } },
        [{ assertionId: 'loaded-count', path: '/requestId', kind } as never],
      );
      expect(compared).toMatchObject({
        matches: true,
        applied: [{ path: '/requestId', kind }],
      });
      expect(
        compareReplayScenarioValue(
          { requestId: expected, nested: { value: 1 } },
          { requestId: actual, nested: { value: 2 } },
          [{ assertionId: 'loaded-count', path: '/requestId', kind } as never],
        ).matches,
      ).toBe(false);
    },
  );

  it('supports bounded numeric, set, and named URL normalization rules', () => {
    expect(
      compareReplayScenarioValue({ value: 10 }, { value: 10.2 }, [
        {
          assertionId: 'loaded-count',
          path: '/value',
          kind: 'number',
          absolute: 0.25,
          relative: 0,
        },
      ]).matches,
    ).toBe(true);
    expect(
      compareReplayScenarioValue({ items: ['a', 'b'] }, { items: ['b', 'a'] }, [
        { assertionId: 'loaded-count', path: '/items', kind: 'unordered' },
      ]).matches,
    ).toBe(true);
    expect(
      compareReplayScenarioValue(
        { url: 'https://example.test/?q=x&trace=1' },
        { url: 'https://example.test/?trace=2&q=x' },
        [
          {
            assertionId: 'loaded-count',
            path: '/url',
            kind: 'url',
            ignoredParameters: ['trace'],
          },
        ],
      ).matches,
    ).toBe(true);
    expect(
      compareReplayScenarioValue(
        { url: 'https://example.test/?q=x' },
        { url: 'https://example.test/?q=y' },
        [{ assertionId: 'loaded-count', path: '/url', kind: 'url' }],
      ).matches,
    ).toBe(false);
  });

  it('rejects broad, secret, ambiguous, and out-of-bounds rules', () => {
    const invalid = [
      { assertionId: 'loaded-count', path: '/*', kind: 'ignore' },
      { assertionId: 'loaded-count', path: '/user/token', kind: 'ignore' },
      {
        assertionId: 'loaded-count',
        path: '/count',
        kind: 'number',
        absolute: 1_000_001,
        relative: 0,
      },
      { assertionId: 'missing', path: '/count', kind: 'ignore' },
    ];
    for (const tolerance of invalid)
      expect(
        validateReplayScenario(
          JSON.stringify({ ...baseScenario, tolerances: [tolerance] }),
        ).ok,
      ).toBe(false);
  });

  it('rejects obvious secrets in assertion values and recapture metadata', () => {
    const secretCheckpoints = {
      ...baseScenario,
      checkpoints: [
        { id: 'loaded-count', path: '/count', expected: 'Bearer abc123' },
      ],
    };
    expect(validateReplayScenario(JSON.stringify(secretCheckpoints)).ok).toBe(
      false,
    );

    const secretVisualName = {
      ...baseScenario,
      visualAssertions: [
        {
          id: 'account-control',
          targetId: 'account',
          expected: { present: true, accessibleName: 'user@example.test' },
        },
      ],
    };
    expect(validateReplayScenario(JSON.stringify(secretVisualName)).ok).toBe(
      false,
    );

    const secretMetadata = {
      ...baseScenario,
      recapture: {
        author: 'developer',
        applicationVersion: '2.4.0',
        adapters: ['Bearer abc123'],
      },
    };
    expect(validateReplayScenario(JSON.stringify(secretMetadata)).ok).toBe(
      false,
    );
  });

  it('prepares a versioned recapture proposal without replacing its reference', () => {
    const validation = validateReplayScenario(JSON.stringify(baseScenario));
    if (!validation.ok) throw new Error(validation.error);
    const proposal = proposeReplayScenarioRecapture(
      validation.scenario,
      { 'loaded-count': 3 },
      'The list now includes a seeded row.',
      {
        author: 'developer',
        applicationVersion: '2.4.0',
        adapters: ['fetch-fixture-v1'],
      },
    );

    expect(validation.scenario.scenarioVersion).toBe(1);
    expect(proposal.proposed.scenarioVersion).toBe(2);
    expect(proposal.proposed.reason).toBe(
      'The list now includes a seeded row.',
    );
    expect(proposal.proposed.recapture).toEqual({
      author: 'developer',
      applicationVersion: '2.4.0',
      adapters: ['fetch-fixture-v1'],
    });
    expect(proposal.changes).toEqual([
      { assertionId: 'loaded-count', previous: 2, proposed: 3 },
    ]);
    expect(validateReplayScenario(JSON.stringify(proposal.proposed)).ok).toBe(
      true,
    );
  });

  it('keeps failure triage and lifecycle transitions explicit', () => {
    expect(replayScenarioLifecycle('passed')).toBe('active');
    expect(replayScenarioLifecycle('failed')).toBe('needs-review');
    expect(
      replayScenarioLifecycle('failed', 'intentional-contract-change'),
    ).toBe('recapture-required');
    expect(replayScenarioLifecycle('not-replayable')).toBe(
      'incomplete-or-not-replayable',
    );
  });

  it('groups drift, tolerated rules, and incompatibilities per scenario', () => {
    const report = createReplayDriftReport([
      {
        status: 'failed',
        classification: 'regression-or-contract-change',
        scenarioId: 'users-list',
        scenarioVersion: 1,
        firstDifference: {
          eventId: 'checkpoint',
          expected: { count: 2 },
          actual: { count: 3 },
        },
        comparedAssertions: ['loaded'],
        appliedTolerances: [],
      },
      {
        status: 'not-replayable',
        classification: 'capture-incomplete',
        scenarioId: 'users-list',
        scenarioVersion: 2,
        error: 'Session truncated.',
        comparedAssertions: [],
        appliedTolerances: [],
      },
    ]);

    expect(report).toEqual([
      expect.objectContaining({
        scenarioId: 'users-list',
        versions: [1, 2],
        lifecycle: 'incomplete-or-not-replayable',
        businessDifferences: [
          {
            eventId: 'checkpoint',
            expected: { count: 2 },
            actual: { count: 3 },
          },
        ],
        incompatibilities: [
          { classification: 'capture-incomplete', error: 'Session truncated.' },
        ],
      }),
    ]);
  });
});
