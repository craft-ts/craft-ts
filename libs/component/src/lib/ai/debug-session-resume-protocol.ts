import type {
  CraftPrimitiveEntry,
  CraftResumeDeclaration,
  CraftResumePersona,
} from '@craft-ts/core';
import type { ResumeGraphArtifact } from './debug-session-resume-plan';

/** The safe, data-only portion of a running app's resume declarations. */
export interface DebugSessionResumeDeclarationInfo {
  readonly resource: string;
  readonly role: CraftResumeDeclaration['role'];
  readonly path?: string;
  readonly persona?: string;
  readonly calls?: readonly string[];
  /** Safe expectation metadata; declaration values and match data never leave the app. */
  readonly expect?: Readonly<{
    outcome: NonNullable<CraftResumeDeclaration['expect']>['outcome'];
    match?: NonNullable<CraftResumeDeclaration['expect']>['match'];
  }>;
  readonly identity?: Readonly<{ role: string; id?: string; storageKey?: string }>;
  readonly onMismatch?: CraftResumeDeclaration['onMismatch'];
  readonly refetch?: false;
  readonly entities?: readonly Readonly<{ kind: string; path: string }>[];
  readonly hasAcquireAdapter: boolean;
  readonly hasReadAdapter: boolean;
  readonly hasWriteAdapter: boolean;
}

export interface DebugSessionResumeExpectationInfo {
  readonly label: string;
  readonly resource: string;
  readonly calls: readonly string[];
  readonly expect: NonNullable<DebugSessionResumeDeclarationInfo['expect']>;
  readonly onMismatch?: CraftResumeDeclaration['onMismatch'];
}

export interface DebugSessionResumeDescription {
  readonly format: 'craft-debug-session-resume-description';
  readonly version: 1;
  readonly graph: ResumeGraphArtifact;
  readonly declarations: Readonly<
    Record<string, DebugSessionResumeDeclarationInfo>
  >;
  /**
   * Expected outcomes declared in code by primitives that are not mounted at
   * the target (an admin action): data from the static graph, no adapters.
   */
  readonly expectations?: readonly DebugSessionResumeExpectationInfo[];
  /** Persona identifiers only; credentials stay in the target application. */
  readonly personas: readonly Readonly<{
    role: string;
    id?: string;
    params: Readonly<Record<string, never>>;
  }>[];
}

/** Source baseline captured without storing project paths or source text. */
export interface DebugSessionResumeSourceHashRecord {
  readonly label: string;
  readonly resource: string;
  readonly role: CraftResumeDeclaration['role'];
  readonly path?: string;
  readonly persona?: string;
  readonly hash: string;
}

export function resumeSourceHashRecordsOf(
  artifact: ResumeGraphArtifact,
): readonly DebugSessionResumeSourceHashRecord[] {
  return artifact.nodes.flatMap((node) => {
    const resume = node.details?.['resume'];
    const hash = node.sourceHash ?? artifact.sourceHashes[node.id];
    if (
      !isRecord(resume) ||
      typeof resume['resource'] !== 'string' ||
      typeof resume['role'] !== 'string' ||
      !hash
    )
      return [];
    return [
      {
        label: node.label,
        resource: resume['resource'],
        role: resume['role'] as CraftResumeDeclaration['role'],
        ...(typeof resume['path'] === 'string' ? { path: resume['path'] } : {}),
        ...(typeof resume['persona'] === 'string'
          ? { persona: resume['persona'] }
          : {}),
        hash,
      },
    ];
  });
}

/** Maps static AST hashes onto live addresses when the declaration is unique. */
export function sourceHashesForCraftSessionResume(
  entries: readonly CraftPrimitiveEntry[],
  artifact: ResumeGraphArtifact,
): Readonly<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const entry of entries) {
    const declaration = entry.resume;
    if (!declaration) continue;
    const matches = artifact.nodes.filter((node) => {
      if (node.label !== `${entry.kind}:${entry.name}`) return false;
      const resume = node.details?.['resume'];
      return (
        isRecord(resume) &&
        resume['resource'] === declaration.resource &&
        resume['role'] === declaration.role &&
        resume['path'] === declaration.path &&
        resume['persona'] === declaration.persona
      );
    });
    if (matches.length !== 1) continue;
    const node = matches[0];
    const hash = node?.sourceHash ?? artifact.sourceHashes[node?.id ?? ''];
    if (node && hash) hashes[entry.address] = hash;
  }
  return hashes;
}

/** Projects live primitive registrations to a safe description for the dashboard. */
export function describeCraftSessionResume(
  entries: readonly CraftPrimitiveEntry[],
  personas: readonly Pick<CraftResumePersona, 'role' | 'id'>[] = [],
  sourceHashes: Readonly<Record<string, string>> = {},
  staticGraph?: ResumeGraphArtifact,
): DebugSessionResumeDescription {
  const resumable = entries.filter((entry) => entry.resume !== undefined);
  const declarations: Record<string, DebugSessionResumeDeclarationInfo> = {};
  for (const entry of resumable) {
    const declaration = entry.resume;
    if (!declaration) continue;
    declarations[entry.address] = {
      resource: declaration.resource,
      role: declaration.role,
      ...(declaration.path === undefined ? {} : { path: declaration.path }),
      ...(declaration.persona === undefined
        ? {}
        : { persona: declaration.persona }),
      ...(declaration.calls === undefined
        ? {}
        : { calls: [...declaration.calls] }),
      ...(declaration.expect === undefined
        ? {}
        : {
            expect: {
              outcome: declaration.expect.outcome,
              ...(declaration.expect.match === undefined
                ? {}
                : { match: declaration.expect.match.map((path) => [...path]) }),
            },
          }),
      ...(declaration.identity === undefined
        ? {}
        : { identity: identityInfoOf(declaration.identity) }),
      ...(declaration.onMismatch === undefined
        ? {}
        : { onMismatch: declaration.onMismatch }),
      ...(declaration.refetch === false ? { refetch: false as const } : {}),
      ...(declaration.entities === undefined
        ? {}
        : {
            entities: declaration.entities.map(({ kind, path }) => ({
              kind,
              path,
            })),
          }),
      hasAcquireAdapter: typeof declaration.acquire === 'function',
      hasReadAdapter: typeof declaration.read === 'function',
      // A holder or a restored state is written through the primitive itself
      // when it declares no writer.
      hasWriteAdapter:
        typeof declaration.write === 'function' ||
        declaration.role === 'holds' ||
        declaration.role === 'restores',
    };
  }
  const edges: ResumeGraphArtifact['edges'][number][] = [];
  const byResource = new Map<string, typeof resumable>();
  for (const entry of resumable) {
    const resource = entry.resume?.resource;
    if (!resource) continue;
    byResource.set(resource, [...(byResource.get(resource) ?? []), entry]);
  }
  for (const group of byResource.values()) {
    const sources = group.filter((entry) =>
      ['provides', 'holds'].includes(entry.resume?.role ?? ''),
    );
    const targets = group.filter((entry) =>
      ['requires', 'restores'].includes(entry.resume?.role ?? ''),
    );
    for (const source of sources)
      for (const target of targets) {
        if (source.address !== target.address)
          edges.push({
            from: source.address,
            to: target.address,
            kind: 'resume-resource',
          });
      }
  }
  return {
    format: 'craft-debug-session-resume-description',
    version: 1,
    graph: {
      format: 'craft-resume-graph',
      version: 1,
      sourceHashes,
      nodes: resumable.map((entry) => ({
        id: entry.address,
        kind: 'primitive',
        label: `${entry.kind}:${entry.name}`,
        details: {
          resume: {
            resource: entry.resume?.resource,
            role: entry.resume?.role,
            ...(entry.resume?.path === undefined
              ? {}
              : { path: entry.resume.path }),
            ...(entry.resume?.persona === undefined
              ? {}
              : { persona: entry.resume.persona }),
            ...(entry.resume?.calls === undefined
              ? {}
              : { calls: [...entry.resume.calls] }),
            ...(entry.resume?.expect === undefined
              ? {}
              : {
                  expect: {
                    outcome: entry.resume.expect.outcome,
                    ...(entry.resume.expect.match === undefined
                      ? {}
                      : {
                          match: entry.resume.expect.match.map((path) => [
                            ...path,
                          ]),
                        }),
                  },
                }),
          },
        },
        ...(sourceHashes[entry.address]
          ? { sourceHash: sourceHashes[entry.address] }
          : {}),
      })),
      edges,
    },
    declarations,
    ...(staticGraph
      ? {
          expectations: staticExpectationsOf(
            staticGraph,
            new Set(resumable.map((entry) => `${entry.kind}:${entry.name}`)),
          ),
        }
      : {}),
    personas: personas.map(({ role, id }) => ({
      role,
      ...(id === undefined ? {} : { id }),
      params: {},
    })),
  };
}

/** Static declarations with an expectation whose primitive is not live. */
function staticExpectationsOf(
  graph: ResumeGraphArtifact,
  liveLabels: ReadonlySet<string>,
): readonly DebugSessionResumeExpectationInfo[] {
  return graph.nodes.flatMap((node) => {
    const resume = node.details?.['resume'];
    if (!isRecord(resume) || liveLabels.has(node.label)) return [];
    const expect = resume['expect'];
    const calls = resume['calls'];
    if (
      !isRecord(expect) ||
      expect['outcome'] !== 'recorded' ||
      typeof resume['resource'] !== 'string' ||
      !Array.isArray(calls) ||
      !calls.every((call) => typeof call === 'string')
    )
      return [];
    const match = Array.isArray(expect['match'])
      ? (expect['match'] as unknown[]).filter(
          (path): path is (string | number)[] =>
            Array.isArray(path) &&
            path.every(
              (key) => typeof key === 'string' || typeof key === 'number',
            ),
        )
      : undefined;
    const onMismatch = resume['onMismatch'];
    return [
      {
        label: node.label,
        resource: resume['resource'],
        calls,
        expect: { outcome: 'recorded', ...(match ? { match } : {}) },
        ...(onMismatch === 'abort' ||
        onMismatch === 'recorded' ||
        onMismatch === 'degraded'
          ? { onMismatch }
          : {}),
      },
    ];
  });
}

/** Rehydrates adapter-presence flags for the pure planning function only. */
export function planningDeclarationsOf(
  info: DebugSessionResumeDescription['declarations'],
): Readonly<Record<string, CraftResumeDeclaration>> {
  return Object.fromEntries(
    Object.entries(info).map(([address, declaration]) => [
      address,
      {
        resource: declaration.resource,
        role: declaration.role,
        ...(declaration.path === undefined ? {} : { path: declaration.path }),
        ...(declaration.persona === undefined
          ? {}
          : { persona: declaration.persona }),
        ...(declaration.calls === undefined
          ? {}
          : { calls: declaration.calls }),
        ...(declaration.expect === undefined
          ? {}
          : {
              expect: {
                outcome: declaration.expect.outcome,
                ...(declaration.expect.match === undefined
                  ? {}
                  : { match: declaration.expect.match }),
              },
            }),
        ...(declaration.identity === undefined
          ? {}
          : { identity: identityInfoOf(declaration.identity) }),
        ...(declaration.onMismatch === undefined
          ? {}
          : { onMismatch: declaration.onMismatch }),
        ...(declaration.refetch === false ? { refetch: false as const } : {}),
        ...(declaration.entities === undefined
          ? {}
          : { entities: declaration.entities }),
        ...(declaration.hasAcquireAdapter ? { acquire: () => undefined } : {}),
        ...(declaration.hasReadAdapter ? { read: () => undefined } : {}),
        ...(declaration.hasWriteAdapter ? { write: () => undefined } : {}),
      },
    ]),
  );
}

/** Identity paths are data; anything else a declaration carries stays local. */
function identityInfoOf(
  identity: NonNullable<CraftResumeDeclaration['identity']>,
): NonNullable<DebugSessionResumeDeclarationInfo['identity']> {
  return {
    role: identity.role,
    ...(identity.id === undefined ? {} : { id: identity.id }),
    ...(identity.storageKey === undefined
      ? {}
      : { storageKey: identity.storageKey }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
