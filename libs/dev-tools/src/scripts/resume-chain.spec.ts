import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from './dependency-graph';
import { checkResumeGraph, resumeChainOf, resumeGraphArtifactOf } from './resume-chain';

describe('resumeChainOf', () => {
  it('connects state reads to writers and server boundaries', () => {
    const graph: DependencyGraph = {
      version: 1,
      rootDir: '/project',
      tsConfigFilePath: '/project/tsconfig.json',
      nodes: [
        { id: 'isStaff', kind: 'primitive', label: 'craftComputed:isStaff' },
        { id: 'session', kind: 'primitive', label: 'state:currentSession' },
        { id: 'signIn', kind: 'primitive', label: 'query:signInProcess' },
        { id: 'login', kind: 'server-function-family', label: 'auth.login' },
        {
          id: 'products',
          kind: 'http-endpoint',
          label: 'POST /auth/login',
          details: { method: 'POST', url: '/auth/login' },
        },
      ],
      edges: [
        { from: 'isStaff', to: 'session', kind: 'depends-on', evidence: 'ast' },
        {
          from: 'signIn',
          to: 'session',
          kind: 'writes',
          evidence: 'ast',
          details: { operation: 'open', via: 'state-method' },
        },
        { from: 'signIn', to: 'login', kind: 'calls', evidence: 'type' },
        { from: 'login', to: 'products', kind: 'calls', evidence: 'ast' },
      ],
    };

    const chain = resumeChainOf(graph, 'isStaff');

    expect(chain.paths).toEqual([
      {
        leafId: 'products',
        nodeIds: ['isStaff', 'session', 'signIn', 'login', 'products'],
        edgeKeys: [
          'isStaff:depends-on:session',
          'signIn:writes:session',
          'signIn:calls:login',
          'login:calls:products',
        ],
        classification: 'external-mutation',
      },
    ]);
    expect(chain.nodes.map(({ id }) => id)).toEqual([
      'isStaff',
      'session',
      'signIn',
      'login',
      'products',
    ]);
  });

  it('classifies GET endpoints as external reads', () => {
    const graph: DependencyGraph = {
      version: 1,
      rootDir: '/project',
      tsConfigFilePath: '/project/tsconfig.json',
      nodes: [
        { id: 'query', kind: 'primitive', label: 'query:catalog' },
        {
          id: 'catalog',
          kind: 'http-endpoint',
          label: 'GET /catalog',
          details: { method: 'GET' },
        },
      ],
      edges: [
        { from: 'query', to: 'catalog', kind: 'calls', evidence: 'ast' },
      ],
    };

    expect(resumeChainOf(graph, 'query').paths[0]?.classification).toBe(
      'external-read',
    );
  });

  it('writes a compact graph with source fingerprints and resume relations', () => {
    const graph: DependencyGraph = {
      version: 1,
      rootDir: '/project',
      tsConfigFilePath: '/project/tsconfig.json',
      nodes: [
        {
          id: 'state',
          kind: 'primitive',
          label: 'state:session',
          sourceHash: 'abc123',
          details: { primitive: 'state', name: 'session', unused: 'skip' },
        },
        { id: 'writer', kind: 'primitive', label: 'mutation:signIn' },
        { id: 'component', kind: 'component', label: 'SessionPanel' },
      ],
      edges: [
        { from: 'writer', to: 'state', kind: 'writes', evidence: 'ast' },
        { from: 'component', to: 'state', kind: 'depends-on', evidence: 'type' },
      ],
    };

    expect(resumeGraphArtifactOf(graph)).toEqual({
      format: 'craft-resume-graph',
      version: 1,
      sourceHashes: { state: 'abc123' },
      nodes: [
        {
          id: 'state',
          kind: 'primitive',
          label: 'state:session',
          sourceHash: 'abc123',
          details: { primitive: 'state', name: 'session' },
        },
        { id: 'writer', kind: 'primitive', label: 'mutation:signIn' },
      ],
      edges: [
        { from: 'writer', to: 'state', kind: 'writes', evidence: 'ast' },
      ],
    });
  });
});

describe('checkResumeGraph', () => {
  it('finds missing resource providers and substitutions', () => {
    const graph: DependencyGraph = {
      version: 1,
      rootDir: '/project',
      tsConfigFilePath: '/project/tsconfig.json',
      nodes: [
        { id: 'consumer', kind: 'primitive', label: 'query:currentUser', details: { resume: { resource: 'session', role: 'requires' } } },
        { id: 'holder', kind: 'primitive', label: 'state:session', details: { resume: { resource: 'token', role: 'holds' } } },
      ],
      edges: [],
    };

    expect(checkResumeGraph(graph).map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'resume-requires-without-provider',
        'resume-held-without-substitution',
      ]),
    );
  });
});

describe('checkResumeGraph derived values', () => {
  it('reports a craftComputed that calls a server function', () => {
    const graph: DependencyGraph = {
      version: 1,
      rootDir: '/project',
      tsConfigFilePath: '/project/tsconfig.json',
      nodes: [
        { id: 'cartCount', kind: 'primitive', label: 'craftComputed:cartCount' },
        { id: 'cartLines', kind: 'primitive', label: 'state:cartLines' },
        { id: 'addLine', kind: 'server-function-family', label: 'cart.addLine' },
      ],
      edges: [
        { from: 'cartCount', to: 'cartLines', kind: 'depends-on', evidence: 'ast' },
        { from: 'cartCount', to: 'addLine', kind: 'calls', evidence: 'type' },
        { from: 'cartLines', to: 'addLine', kind: 'calls', evidence: 'type' },
      ],
    };
    expect(checkResumeGraph(graph)).toEqual([
      expect.objectContaining({
        code: 'resume-computed-calls-boundary',
        nodeId: 'cartCount',
      }),
    ]);
  });
});
