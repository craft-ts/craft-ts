import type {
  ReplayDifference,
  ReplayTestResult,
} from './debug-session-replay';

export type ReplayScenarioTolerance =
  | Readonly<{ assertionId: string; path: string; kind: 'ignore' }>
  | Readonly<{ assertionId: string; path: string; kind: 'redacted' }>
  | Readonly<{
      assertionId: string;
      path: string;
      kind: 'number';
      absolute: number;
      relative: number;
    }>
  | Readonly<{ assertionId: string; path: string; kind: 'unordered' }>
  | Readonly<{
      assertionId: string;
      path: string;
      kind: 'url';
      ignoredParameters?: readonly string[];
    }>;

export type ReplayScenarioCheckpoint = Readonly<{
  id: string;
  path: string;
  expected: unknown;
}>;

export type ReplayScenarioEventAssertion = Readonly<{
  id: string;
  kind: 'invocation' | 'http' | 'transport';
  expected: unknown;
}>;

export type ReplayScenarioVisualAssertion = Readonly<{
  id: string;
  targetId: string;
  expected: Readonly<{
    present: boolean;
    tagName?: string;
    role?: string;
    accessibleName?: string;
  }>;
}>;

/** Sidecar test contract, versioned independently from the session archive. */
export type ReplayScenario = Readonly<{
  format: 'craft-replay-scenario';
  schemaVersion: 1;
  id: string;
  scenarioVersion: number;
  reason: string;
  checkpoints: readonly ReplayScenarioCheckpoint[];
  eventAssertions: readonly ReplayScenarioEventAssertion[];
  visualAssertions: readonly ReplayScenarioVisualAssertion[];
  tolerances: readonly ReplayScenarioTolerance[];
  recapture?: Readonly<{
    author: string;
    applicationVersion: string;
    adapters: readonly string[];
  }>;
}>;

export type ReplayScenarioRecaptureProposal = Readonly<{
  previous: ReplayScenario;
  proposed: ReplayScenario;
  changes: readonly Readonly<{
    assertionId: string;
    previous: unknown;
    proposed: unknown;
  }>[];
}>;

export type ReplayScenarioLifecycle =
  | 'active'
  | 'needs-review'
  | 'recapture-required'
  | 'incomplete-or-not-replayable';

/** Lifecycle transitions require review; a passing run alone cannot recapture. */
export function replayScenarioLifecycle(
  result: 'passed' | 'failed' | 'partial' | 'not-replayable',
  reviewedAs?: 'intentional-contract-change',
): ReplayScenarioLifecycle {
  if (result === 'passed') return 'active';
  if (result === 'partial' || result === 'not-replayable')
    return 'incomplete-or-not-replayable';
  return reviewedAs === 'intentional-contract-change'
    ? 'recapture-required'
    : 'needs-review';
}

export type ReplayDriftGroup = Readonly<{
  scenarioId: string;
  versions: readonly number[];
  lifecycle: ReplayScenarioLifecycle;
  businessDifferences: readonly ReplayDifference[];
  visualDifferences: readonly ReplayDifference[];
  toleratedDifferences: readonly ReplayTestResult['appliedTolerances'][number][];
  incompatibilities: readonly Readonly<{
    classification: ReplayTestResult['classification'];
    error: string;
  }>[];
}>;

/** Group CI runs by scenario without merging away business, visual, or tolerated drift. */
export function createReplayDriftReport(
  results: readonly ReplayTestResult[],
): readonly ReplayDriftGroup[] {
  const groups = new Map<string, ReplayTestResult[]>();
  for (const result of results) {
    const group = groups.get(result.scenarioId) ?? [];
    group.push(result);
    groups.set(result.scenarioId, group);
  }
  return [...groups].map(([scenarioId, group]) => {
    const businessDifferences: ReplayDifference[] = [];
    const visualDifferences: ReplayDifference[] = [];
    const toleratedDifferences: ReplayTestResult['appliedTolerances'][number][] =
      [];
    const incompatibilities: Array<{
      classification: ReplayTestResult['classification'];
      error: string;
    }> = [];
    for (const result of group) {
      toleratedDifferences.push(...result.appliedTolerances);
      if (result.firstDifference) {
        (result.classification === 'visual-only'
          ? visualDifferences
          : businessDifferences
        ).push(result.firstDifference);
      }
      if (
        result.status === 'not-replayable' ||
        result.classification === 'stale-or-incompatible' ||
        result.classification === 'environment-or-adapter-missing' ||
        result.classification === 'capture-incomplete'
      )
        incompatibilities.push({
          classification: result.classification,
          error: result.error ?? result.classification,
        });
    }
    const lifecycle: ReplayScenarioLifecycle = incompatibilities.length
      ? 'incomplete-or-not-replayable'
      : businessDifferences.length || visualDifferences.length
        ? 'needs-review'
        : 'active';
    return {
      scenarioId,
      versions: [
        ...new Set(group.map((result) => result.scenarioVersion)),
      ].sort((left, right) => left - right),
      lifecycle,
      businessDifferences,
      visualDifferences,
      toleratedDifferences,
      incompatibilities,
    };
  });
}

export type ReplayScenarioValidation =
  | Readonly<{ ok: true; scenario: ReplayScenario }>
  | Readonly<{ ok: false; error: string }>;

const forbiddenPathSegment =
  /(?:password|passwd|secret|token|authorization|cookie)/i;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export function readReplayScenarioPath(
  value: unknown,
  pointer: string,
): Readonly<{ found: boolean; value?: unknown }> {
  const path = parseExactPath(pointer);
  return path ? valueAtPath(value, path) : { found: false };
}

/** Validate a data-only scenario sidecar, independently from session event IDs. */
export function validateReplayScenario(json: string): ReplayScenarioValidation {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Scenario is not valid JSON.' };
  }
  if (!isRecord(value))
    return { ok: false, error: 'Scenario must be a JSON object.' };
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'format',
          'schemaVersion',
          'id',
          'scenarioVersion',
          'reason',
          'checkpoints',
          'eventAssertions',
          'visualAssertions',
          'tolerances',
          'recapture',
        ].includes(key),
    )
  )
    return {
      ok: false,
      error: 'Scenario contains unsupported top-level fields.',
    };
  if (
    value['format'] !== 'craft-replay-scenario' ||
    value['schemaVersion'] !== 1
  )
    return {
      ok: false,
      error: 'Scenario format or schema version is unsupported.',
    };
  if (
    !validIdentifier(value['id']) ||
    !Number.isSafeInteger(value['scenarioVersion']) ||
    (value['scenarioVersion'] as number) < 1 ||
    typeof value['reason'] !== 'string' ||
    !value['reason'].trim() ||
    value['reason'].length > 2_000 ||
    hasObviousSecretValue(value['reason'])
  )
    return {
      ok: false,
      error: 'Scenario identity, version, or reason is invalid.',
    };
  if (
    !Array.isArray(value['checkpoints']) ||
    !Array.isArray(value['eventAssertions']) ||
    !Array.isArray(value['visualAssertions']) ||
    !Array.isArray(value['tolerances'])
  )
    return {
      ok: false,
      error: 'Scenario checkpoints and tolerances must be arrays.',
    };
  if (
    value['checkpoints'].length +
      value['eventAssertions'].length +
      value['visualAssertions'].length ===
    0
  )
    return {
      ok: false,
      error: 'Scenario must declare at least one assertion.',
    };

  const checkpoints: ReplayScenarioCheckpoint[] = [];
  const assertionIds = new Set<string>();
  for (const item of value['checkpoints']) {
    const path = isRecord(item) ? parseExactPath(item['path']) : undefined;
    if (
      !isRecord(item) ||
      !validIdentifier(item['id']) ||
      !path ||
      path.some(
        (part) => forbiddenPathSegment.test(part) || forbiddenKeys.has(part),
      ) ||
      !('expected' in item) ||
      assertionIds.has(item['id'])
    )
      return {
        ok: false,
        error: 'Scenario contains an invalid checkpoint assertion.',
      };
    if (
      !isJsonValue(item['expected']) ||
      hasSensitiveKey(item['expected']) ||
      hasObviousSecretValue(item['expected'])
    )
      return {
        ok: false,
        error: `Checkpoint ${item['id']} contains non-JSON data.`,
      };
    assertionIds.add(item['id']);
    checkpoints.push({
      id: item['id'],
      path: item['path'] as string,
      expected: item['expected'],
    });
  }

  const eventAssertions: ReplayScenarioEventAssertion[] = [];
  for (const item of value['eventAssertions']) {
    if (
      !isRecord(item) ||
      !validIdentifier(item['id']) ||
      !['invocation', 'http', 'transport'].includes(String(item['kind'])) ||
      !('expected' in item) ||
      !isRecord(item['expected']) ||
      Object.keys(item['expected']).length === 0 ||
      assertionIds.has(item['id']) ||
      !isJsonValue(item['expected']) ||
      hasSensitiveKey(item['expected']) ||
      hasObviousSecretValue(item['expected'])
    )
      return {
        ok: false,
        error: 'Scenario contains an invalid event assertion.',
      };
    const expected = item['expected'] as Record<string, unknown>;
    if (item['kind'] === 'invocation') {
      if (
        Object.keys(expected).some(
          (key) => !['address', 'args'].includes(key),
        ) ||
        typeof expected['address'] !== 'string' ||
        !expected['address'].trim() ||
        (expected['args'] !== undefined && !Array.isArray(expected['args']))
      )
        return {
          ok: false,
          error: `Invocation assertion ${item['id']} needs an address and optional argument array.`,
        };
    } else if (item['kind'] === 'http') {
      const url =
        typeof expected['url'] === 'string'
          ? safeHttpUrl(expected['url'])
          : undefined;
      if (
        Object.keys(expected).some(
          (key) =>
            !['method', 'url', 'params', 'body', 'response'].includes(key),
        ) ||
        typeof expected['method'] !== 'string' ||
        !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(
          expected['method'],
        ) ||
        !url ||
        (expected['response'] !== undefined && !isRecord(expected['response']))
      )
        return {
          ok: false,
          error: `HTTP assertion ${item['id']} needs a method and absolute HTTP URL.`,
        };
    } else if (
      Object.keys(expected).some(
        (key) =>
          ![
            'transportId',
            'direction',
            'data',
            'messageType',
            'sequence',
          ].includes(key),
      ) ||
      typeof expected['transportId'] !== 'string' ||
      !expected['transportId'].trim() ||
      !['outgoing', 'incoming', 'lifecycle'].includes(
        String(expected['direction']),
      )
    )
      return {
        ok: false,
        error: `Transport assertion ${item['id']} needs an ID and direction.`,
      };
    assertionIds.add(item['id']);
    eventAssertions.push({
      id: item['id'],
      kind: item['kind'] as ReplayScenarioEventAssertion['kind'],
      expected: item['expected'],
    });
  }

  const visualAssertions: ReplayScenarioVisualAssertion[] = [];
  for (const item of value['visualAssertions']) {
    if (!isRecord(item) || !isRecord(item['expected']))
      return {
        ok: false,
        error: 'Scenario contains an invalid visual assertion.',
      };
    const expected = item['expected'];
    if (
      !validIdentifier(item['id']) ||
      !validIdentifier(item['targetId']) ||
      typeof expected['present'] !== 'boolean' ||
      Object.keys(expected).some(
        (key) =>
          !['present', 'tagName', 'role', 'accessibleName'].includes(key),
      ) ||
      Object.keys(expected).some(
        (key) => forbiddenPathSegment.test(key) || forbiddenKeys.has(key),
      ) ||
      hasObviousSecretValue(expected) ||
      ['tagName', 'role', 'accessibleName'].some(
        (key) =>
          expected[key] !== undefined &&
          (typeof expected[key] !== 'string' ||
            !(expected[key] as string).trim()),
      ) ||
      (expected['present'] === false &&
        Object.keys(expected).some((key) => key !== 'present')) ||
      assertionIds.has(item['id'])
    )
      return {
        ok: false,
        error: 'Scenario contains an invalid visual assertion.',
      };
    assertionIds.add(item['id']);
    visualAssertions.push({
      id: item['id'],
      targetId: item['targetId'],
      expected: {
        present: expected['present'],
        ...(typeof expected['tagName'] === 'string'
          ? { tagName: expected['tagName'] }
          : {}),
        ...(typeof expected['role'] === 'string'
          ? { role: expected['role'] }
          : {}),
        ...(typeof expected['accessibleName'] === 'string'
          ? { accessibleName: expected['accessibleName'] }
          : {}),
      },
    });
  }

  const tolerances: ReplayScenarioTolerance[] = [];
  const toleranceKeys = new Set<string>();
  for (const item of value['tolerances']) {
    if (
      !isRecord(item) ||
      typeof item['assertionId'] !== 'string' ||
      !assertionIds.has(item['assertionId'])
    )
      return {
        ok: false,
        error: 'A tolerance must refer to a declared scenario assertion.',
      };
    const path = parseExactPath(item['path']);
    if (
      !path ||
      path.some(
        (part) => forbiddenPathSegment.test(part) || forbiddenKeys.has(part),
      )
    )
      return {
        ok: false,
        error:
          'Tolerance paths must be exact JSON paths and cannot target secret fields.',
      };
    const assertion = [
      ...checkpoints,
      ...eventAssertions,
      ...visualAssertions,
    ].find((candidate) => candidate.id === item['assertionId'])!;
    const expectedAtPath = valueAtPath(assertion.expected, path);
    if (!expectedAtPath.found)
      return {
        ok: false,
        error: `Tolerance path ${item['path']} does not exist in its expected checkpoint.`,
      };
    const key = `${item['assertionId']}\0${item['path']}`;
    if (toleranceKeys.has(key))
      return {
        ok: false,
        error: `More than one tolerance targets ${item['path']}.`,
      };
    toleranceKeys.add(key);
    if (
      tolerances.some(
        (existing) =>
          existing.assertionId === item['assertionId'] &&
          (existing.path.startsWith(`${item['path']}/`) ||
            String(item['path']).startsWith(`${existing.path}/`)),
      )
    )
      return {
        ok: false,
        error: 'Overlapping tolerance paths are ambiguous and unsupported.',
      };
    if (
      item['kind'] === 'ignore' ||
      item['kind'] === 'redacted' ||
      item['kind'] === 'unordered'
    ) {
      if (
        Object.keys(item).some(
          (name) => !['assertionId', 'path', 'kind'].includes(name),
        )
      )
        return { ok: false, error: 'Tolerance contains unsupported fields.' };
      if (
        (item['kind'] === 'redacted' &&
          expectedAtPath.value !== '[REDACTED]') ||
        (item['kind'] === 'unordered' && !Array.isArray(expectedAtPath.value))
      )
        return {
          ok: false,
          error: `Tolerance ${item['kind']} does not match the expected value at ${item['path']}.`,
        };
      tolerances.push({
        assertionId: item['assertionId'],
        path: item['path'] as string,
        kind: item['kind'],
      });
    } else if (item['kind'] === 'number') {
      if (
        Object.keys(item).some(
          (name) =>
            !['assertionId', 'path', 'kind', 'absolute', 'relative'].includes(
              name,
            ),
        ) ||
        !boundedTolerance(item['absolute']) ||
        !boundedTolerance(item['relative']) ||
        typeof expectedAtPath.value !== 'number'
      )
        return {
          ok: false,
          error:
            'Numeric tolerances must be finite values between 0 and 1,000,000.',
        };
      tolerances.push({
        assertionId: item['assertionId'],
        path: item['path'] as string,
        kind: 'number',
        absolute: item['absolute'],
        relative: item['relative'],
      });
    } else if (item['kind'] === 'url') {
      const ignoredParameters = item['ignoredParameters'];
      if (
        Object.keys(item).some(
          (name) =>
            !['assertionId', 'path', 'kind', 'ignoredParameters'].includes(
              name,
            ),
        ) ||
        (ignoredParameters !== undefined &&
          (!Array.isArray(ignoredParameters) ||
            !ignoredParameters.length ||
            !ignoredParameters.every(
              (name) =>
                typeof name === 'string' &&
                name.length > 0 &&
                !name.includes('*') &&
                !forbiddenPathSegment.test(name),
            ))) ||
        typeof expectedAtPath.value !== 'string' ||
        normalizedUrl(expectedAtPath.value, []) === undefined
      )
        return {
          ok: false,
          error: 'URL tolerance must name exact volatile query parameters.',
        };
      if (
        ignoredParameters?.some((name) => {
          try {
            return !new URL(expectedAtPath.value as string).searchParams.has(
              name,
            );
          } catch {
            return true;
          }
        })
      )
        return {
          ok: false,
          error: 'Every ignored URL parameter must exist in the expected URL.',
        };
      tolerances.push({
        assertionId: item['assertionId'],
        path: item['path'] as string,
        kind: 'url',
        ...(ignoredParameters ? { ignoredParameters } : {}),
      });
    } else
      return {
        ok: false,
        error: 'Scenario contains an unsupported tolerance.',
      };
  }

  let recapture: ReplayScenario['recapture'];
  if (value['recapture'] !== undefined) {
    const metadata = value['recapture'];
    if (
      !isRecord(metadata) ||
      Object.keys(metadata).some(
        (key) => !['author', 'applicationVersion', 'adapters'].includes(key),
      ) ||
      typeof metadata['author'] !== 'string' ||
      !metadata['author'].trim() ||
      typeof metadata['applicationVersion'] !== 'string' ||
      !metadata['applicationVersion'].trim() ||
      !Array.isArray(metadata['adapters']) ||
      !metadata['adapters'].every(
        (adapter) => typeof adapter === 'string' && adapter.trim(),
      ) ||
      hasObviousSecretValue(metadata)
    )
      return { ok: false, error: 'Recapture metadata is invalid.' };
    recapture = {
      author: metadata['author'],
      applicationVersion: metadata['applicationVersion'],
      adapters: metadata['adapters'] as string[],
    };
  }

  return {
    ok: true,
    scenario: {
      format: 'craft-replay-scenario',
      schemaVersion: 1,
      id: value['id'],
      scenarioVersion: value['scenarioVersion'] as number,
      reason: value['reason'],
      checkpoints,
      eventAssertions,
      visualAssertions,
      tolerances,
      ...(recapture ? { recapture } : {}),
    },
  };
}

/** Prepare a reviewed update; this function never mutates or writes the old reference. */
export function proposeReplayScenarioRecapture(
  scenario: ReplayScenario,
  updates: Readonly<Record<string, unknown>>,
  reason: string,
  metadata: NonNullable<ReplayScenario['recapture']>,
): ReplayScenarioRecaptureProposal {
  if (
    !reason.trim() ||
    !metadata.author.trim() ||
    !metadata.applicationVersion.trim()
  )
    throw new Error(
      'A recapture proposal requires a reason, author, and application version.',
    );
  if (!Object.keys(updates).length)
    throw new Error(
      'A recapture proposal requires at least one changed assertion.',
    );
  const changes: Array<{
    assertionId: string;
    previous: unknown;
    proposed: unknown;
  }> = [];
  const updateAssertion = <T extends { id: string; expected: unknown }>(
    assertion: T,
  ): T => {
    if (!Object.hasOwn(updates, assertion.id)) return assertion;
    const proposed = updates[assertion.id];
    if (
      !isJsonValue(proposed) ||
      hasSensitiveKey(proposed) ||
      hasObviousSecretValue(proposed)
    )
      throw new Error(`Recaptured assertion ${assertion.id} is not safe JSON.`);
    if (stableJson(assertion.expected) !== stableJson(proposed))
      changes.push({
        assertionId: assertion.id,
        previous: assertion.expected,
        proposed,
      });
    return { ...assertion, expected: proposed };
  };
  const checkpoints = scenario.checkpoints.map(updateAssertion);
  const eventAssertions = scenario.eventAssertions.map(updateAssertion);
  const visualAssertions = scenario.visualAssertions.map(updateAssertion);
  const unknownIds = Object.keys(updates).filter(
    (id) =>
      !scenario.checkpoints.some((checkpoint) => checkpoint.id === id) &&
      !scenario.eventAssertions.some((assertion) => assertion.id === id) &&
      !scenario.visualAssertions.some((assertion) => assertion.id === id),
  );
  if (unknownIds.length)
    throw new Error(`Unknown scenario assertions: ${unknownIds.join(', ')}.`);
  if (!changes.length)
    throw new Error('Recapture proposal does not change any assertion.');
  const proposedScenario: ReplayScenario = {
    ...scenario,
    scenarioVersion: scenario.scenarioVersion + 1,
    reason,
    checkpoints,
    eventAssertions,
    visualAssertions,
    recapture: metadata,
  };
  const validation = validateReplayScenario(JSON.stringify(proposedScenario));
  if (!validation.ok)
    throw new Error(`Recapture proposal is invalid: ${validation.error}`);
  return {
    previous: scenario,
    proposed: validation.scenario,
    changes,
  };
}

export type ReplayComparison = Readonly<{
  matches: boolean;
  applied: readonly ReplayScenarioTolerance[];
}>;

/** Compare JSON values strictly unless one exact scenario path says otherwise. */
export function compareReplayScenarioValue(
  expected: unknown,
  actual: unknown,
  tolerances: readonly ReplayScenarioTolerance[],
): ReplayComparison {
  const applied: ReplayScenarioTolerance[] = [];
  const compare = (left: unknown, right: unknown, path: string): boolean => {
    const tolerance = tolerances.find((rule) => rule.path === path);
    if (tolerance) {
      applied.push(tolerance);
      if (tolerance.kind === 'ignore')
        return left !== undefined && right !== undefined;
      if (tolerance.kind === 'redacted')
        return left === '[REDACTED]' && right !== undefined;
      if (tolerance.kind === 'number') {
        if (
          typeof left !== 'number' ||
          typeof right !== 'number' ||
          !Number.isFinite(left) ||
          !Number.isFinite(right)
        )
          return false;
        return (
          Math.abs(left - right) <=
          Math.max(
            tolerance.absolute,
            Math.max(Math.abs(left), Math.abs(right)) * tolerance.relative,
          )
        );
      }
      if (tolerance.kind === 'unordered') {
        if (
          !Array.isArray(left) ||
          !Array.isArray(right) ||
          left.length !== right.length
        )
          return false;
        const leftValues = left.map(stableJson).sort();
        const rightValues = right.map(stableJson).sort();
        return leftValues.every((item, index) => item === rightValues[index]);
      }
      if (tolerance.kind === 'url') {
        if (typeof left !== 'string' || typeof right !== 'string') return false;
        return (
          normalizedUrl(left, tolerance.ignoredParameters ?? []) ===
          normalizedUrl(right, tolerance.ignoredParameters ?? [])
        );
      }
    }
    if (Array.isArray(left) || Array.isArray(right))
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, index) =>
          compare(item, right[index], `${path}/${index}`),
        )
      );
    if (isRecord(left) || isRecord(right)) {
      if (!isRecord(left) || !isRecord(right)) return false;
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      return (
        leftKeys.length === rightKeys.length &&
        leftKeys.every(
          (key, index) =>
            key === rightKeys[index] &&
            compare(left[key], right[key], `${path}/${escapePath(key)}`),
        )
      );
    }
    return Object.is(left, right);
  };
  return { matches: compare(expected, actual, ''), applied };
}

function normalizedUrl(
  value: string,
  ignored: readonly string[],
): string | undefined {
  try {
    const url = new URL(value);
    for (const name of ignored) url.searchParams.delete(name);
    url.searchParams.sort();
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

function safeHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((key) => forbiddenPathSegment.test(key))
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function parseExactPath(value: unknown): readonly string[] | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value === '/')
    return undefined;
  const encodedParts = value.slice(1).split('/');
  if (encodedParts.some((part) => /~(?![01])/.test(part))) return undefined;
  const parts = encodedParts.map((part) =>
    part.replace(/~1/g, '/').replace(/~0/g, '~'),
  );
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.includes('*') ||
        forbiddenKeys.has(part),
    )
  )
    return undefined;
  return parts;
}
function valueAtPath(
  root: unknown,
  path: readonly string[],
): { found: boolean; value?: unknown } {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
    } else if (isRecord(current) && Object.hasOwn(current, segment))
      current = current[segment];
    else return { found: false };
  }
  return { found: true, value: current };
}
function escapePath(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)
  );
}
function boundedTolerance(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000
  );
}
function hasSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      forbiddenKeys.has(key) ||
      forbiddenPathSegment.test(key) ||
      hasSensitiveKey(child),
  );
}

function hasObviousSecretValue(value: unknown): boolean {
  if (typeof value === 'string')
    return /\bBearer\s+\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/i.test(
      value,
    );
  if (Array.isArray(value)) return value.some(hasObviousSecretValue);
  return isRecord(value) && Object.values(value).some(hasObviousSecretValue);
}
