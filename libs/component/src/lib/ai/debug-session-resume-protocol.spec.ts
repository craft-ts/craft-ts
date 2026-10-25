import { describe, expect, it } from 'vitest';
import type { CraftPrimitiveEntry } from '@craft-ts/core';
import {
  describeCraftSessionResume,
  planningDeclarationsOf,
  resumeSourceHashRecordsOf,
  sourceHashesForCraftSessionResume,
} from './debug-session-resume-protocol';

describe('debug session resume description protocol', () => {
  it('projects resource links and adapter presence without exporting credentials or closures', () => {
    const entries = [
      {
        address: 'Session / mutation:signIn#1',
        kind: 'mutation',
        name: 'signIn',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: {
          resource: 'session',
          role: 'provides',
          persona: 'manager',
          value: { password: 'never-export' },
          acquire: (persona) => ({ password: persona.params['password'] }),
        },
      },
      {
        address: 'Session / state:current#1',
        kind: 'state',
        name: 'current',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: {
          resource: 'session',
          role: 'holds',
          path: '$.token',
          read: () => 'secret-token',
          write: () => undefined,
        },
      },
      {
        address: 'Session / query:identity#1',
        kind: 'query',
        name: 'identity',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: { resource: 'session', role: 'requires', identity: true },
      },
    ] as unknown as readonly CraftPrimitiveEntry[];
    const description = describeCraftSessionResume(entries, [
      { role: 'manager', id: 'pm' },
    ]);

    expect(description.graph.nodes).toHaveLength(3);
    expect(description.graph.edges).toContainEqual({
      from: 'Session / state:current#1',
      to: 'Session / query:identity#1',
      kind: 'resume-resource',
    });
    expect(description.declarations['Session / state:current#1']).toMatchObject(
      {
        path: '$.token',
        hasReadAdapter: true,
        hasWriteAdapter: true,
      },
    );
    expect(JSON.stringify(description)).not.toContain('secret-token');
    expect(JSON.stringify(description)).not.toContain('never-export');
    expect(JSON.stringify(description)).not.toContain('password');
    expect(
      description.declarations['Session / mutation:signIn#1']
        ?.hasAcquireAdapter,
    ).toBe(true);
    expect(description.personas).toEqual([
      { role: 'manager', id: 'pm', params: {} },
    ]);
  });

  it('projects only safe resume outcome metadata', () => {
    const description = describeCraftSessionResume([
      {
        address: 'Admin / query:action#1',
        kind: 'query',
        name: 'action',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: {
          resource: 'session',
          role: 'requires',
          calls: ['ecommerce.product.save'],
          expect: {
            outcome: 'recorded',
            match: [['code']],
            value: { token: 'must-not-leave-the-app' },
          },
        },
      } as unknown as CraftPrimitiveEntry,
    ]);

    expect(description.declarations['Admin / query:action#1']?.expect).toEqual({
      outcome: 'recorded',
      match: [['code']],
    });
    expect(
      planningDeclarationsOf(description.declarations)[
        'Admin / query:action#1'
      ]?.expect,
    ).toEqual({ outcome: 'recorded', match: [['code']] });
    expect(JSON.stringify(description)).not.toContain('must-not-leave-the-app');
  });

  it('restores adapter-presence markers as no-op planner adapters', () => {
    const description = describeCraftSessionResume([
      {
        address: 'Cart / state:id#1',
        kind: 'state',
        name: 'id',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: {
          resource: 'cart',
          role: 'holds',
          read: () => 'id',
          write: () => undefined,
        },
      } as unknown as CraftPrimitiveEntry,
    ]);
    const declaration = planningDeclarationsOf(description.declarations)[
      'Cart / state:id#1'
    ];
    expect(declaration?.read).toBeTypeOf('function');
    expect(declaration?.write).toBeTypeOf('function');
  });

  it('never restores an executable acquisition callback from dashboard data', () => {
    const description = describeCraftSessionResume([
      {
        address: 'Session / mutation:signIn#1',
        kind: 'mutation',
        name: 'signIn',
        hostTags: [],
        read: () => undefined,
        write: () => undefined,
        resume: {
          resource: 'session',
          role: 'provides',
          persona: 'manager',
          acquire: () => 'secret',
        },
      } as unknown as CraftPrimitiveEntry,
    ]);
    const declaration = planningDeclarationsOf(description.declarations)[
      'Session / mutation:signIn#1'
    ];

    expect(declaration?.acquire).toBeTypeOf('function');
    expect(
      declaration?.acquire?.({ role: 'manager', params: {} }),
    ).toBeUndefined();
  });

  it('maps static source hashes only when the declaration match is unique', () => {
    const entry = {
      address: 'Session / state:current#1',
      kind: 'state',
      name: 'current',
      hostTags: [],
      read: () => undefined,
      write: () => undefined,
      resume: {
        resource: 'session',
        role: 'holds',
        path: '$.token',
        write: () => undefined,
      },
    } as unknown as CraftPrimitiveEntry;
    const artifact = {
      format: 'craft-resume-graph',
      version: 1,
      sourceHashes: { 'static:current': 'source-hash' },
      nodes: [
        {
          id: 'static:current',
          kind: 'primitive',
          label: 'state:current',
          details: {
            resume: { resource: 'session', role: 'holds', path: '$.token' },
          },
        },
      ],
      edges: [],
    };

    expect(sourceHashesForCraftSessionResume([entry], artifact)).toEqual({
      'Session / state:current#1': 'source-hash',
    });
    expect(
      sourceHashesForCraftSessionResume([entry], {
        ...artifact,
        nodes: [
          ...artifact.nodes,
          { ...artifact.nodes[0]!, id: 'static:duplicate' },
        ],
      }),
    ).toEqual({});
  });

  it('stores source baselines without absolute source paths', () => {
    const records = resumeSourceHashRecordsOf({
      format: 'craft-resume-graph',
      version: 1,
      sourceHashes: {
        'primitive:/private/worktree/shop-state.ts#session': 'hash-1',
      },
      nodes: [
        {
          id: 'primitive:/private/worktree/shop-state.ts#session',
          kind: 'primitive',
          label: 'state:currentSession',
          details: {
            resume: { resource: 'session', role: 'holds', path: '$.token' },
          },
        },
      ],
      edges: [],
    });

    expect(records).toEqual([
      {
        label: 'state:currentSession',
        resource: 'session',
        role: 'holds',
        path: '$.token',
        hash: 'hash-1',
      },
    ]);
    expect(JSON.stringify(records)).not.toContain('/private/worktree');
  });
});
