import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DebugSessionStore,
  type PortableDebugSession,
} from './debug-session-store.js';

describe('DebugSessionStore', () => {
  let directory: string;
  let store: DebugSessionStore;
  const id = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
  const createdAt = '2026-10-15T08:00:00.000Z';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'debug-sessions-'));
    store = new DebugSessionStore(directory);
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function fixture(): PortableDebugSession {
    return {
      format: 'craft-debug-session',
      version: 6,
      startUrl: 'http://localhost:4200/',
      viewport: { width: 390, height: 844 },
      exportedAt: Date.parse(createdAt),
      truncated: false,
      initialSnapshot: { 'state:counter': 0 },
      clips: [
        {
          id: 'clip-1',
          label: 'Application session',
          startedAt: Date.parse(createdAt),
          eventIds: ['event-1'],
        },
      ],
      events: [
        {
          id: 'event-1',
          sequence: 2,
          timestamp: Date.parse(createdAt),
          elapsedMs: 12,
          kind: 'dom',
          phase: 'emitted',
          payload: { action: 'click', selector: '#increment' },
        },
      ],
    };
  }

  it('indexes and reconstructs incrementally captured v2 sessions', () => {
    store.begin(id, fixture(), createdAt);
    store.append(
      id,
      {
        id: 'event-2',
        sequence: 3,
        timestamp: Date.parse(createdAt) + 10,
        elapsedMs: 22,
        kind: 'craft',
        phase: 'started',
        name: 'increment',
      },
      [
        {
          id: 'clip-1',
          label: 'Application session',
          startedAt: Date.parse(createdAt),
          eventIds: ['event-1', 'event-2'],
        },
      ],
      false,
    );

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({
      id,
      status: 'recording',
      eventCount: 2,
      startUrl: 'http://localhost:4200/',
    });
    expect(store.get(id)).toMatchObject({
      version: 6,
      viewport: { width: 390, height: 844 },
      initialSnapshot: { 'state:counter': 0 },
      events: [
        { id: 'event-1', kind: 'dom' },
        { id: 'event-2', kind: 'craft' },
      ],
      clips: [{ eventIds: ['event-1', 'event-2'] }],
    });

    store.finish(id, 'completed');
    expect(store.list()[0]?.status).toBe('completed');
    expect(readFileSync(join(directory, 'index.json'), 'utf8')).toContain(id);
  });

  it('marks current v7 exports as carrying reference provenance', () => {
    const recording = {
      ...fixture(),
      version: 7,
      referenceCaptureVersion: 1,
    } satisfies PortableDebugSession;
    store.begin(id, recording, createdAt, 'tab-a');

    expect(store.get(id)).toMatchObject({
      version: 7,
      referenceCaptureVersion: 1,
    });
  });

  it('keeps MCP resume proposals pending until the dashboard decides', () => {
    store.begin(id, fixture(), createdAt);
    const context = {
      phase: 'prepare' as const,
      plan: { status: 'ready', steps: [] },
      mismatches: [{ kind: 'missing-persona', name: 'admin' }],
      updatedAt: createdAt,
    };
    expect(store.publishResumeAssistantContext(id, context)).toBe(true);
    expect(store.activeResumeAssistantContext()).toEqual({
      sessionId: id,
      context,
    });

    const proposal = store.proposeResumeOverrides(id, {
      rationale: 'Reproduce the recorded refusal.',
      overrides: [
        {
          call: 'PATCH /products/:id',
          response: { error: 'Forbidden' },
          status: 403,
          frozen: true,
          assistedBy: 'ai',
        },
      ],
    });
    expect(proposal).toMatchObject({ status: 'proposed', sessionId: id });
    expect(store.requestResumeAssistantApply(id, proposal!.id)?.status).toBe(
      'apply-requested',
    );
    expect(store.resumeAssistantProposalsFor(id)[0]?.status).toBe(
      'apply-requested',
    );
    expect(
      store.decideResumeAssistantProposal(id, proposal!.id, 'accepted')?.status,
    ).toBe('accepted');
  });

  it('marks sessions interrupted after a server restart', () => {
    store.begin(id, fixture(), createdAt, 'tab-a');

    store.close();
    store = new DebugSessionStore(directory);

    expect(store.list()[0]?.status).toBe('interrupted');
    expect(store.get(id)?.participants).toMatchObject([
      { id: 'tab-a', status: 'interrupted' },
    ]);
  });

  it('starts a fresh shared id after completion without overwriting history', () => {
    store.begin(id, fixture(), createdAt, 'tab-a');
    store.finish(id, 'completed');

    const nextId = store.begin(
      id,
      fixture(),
      new Date(Date.parse(createdAt) + 60_000).toISOString(),
      'tab-b',
    );

    expect(nextId).not.toBe(id);
    expect(store.get(id)?.events).toHaveLength(1);
    expect(store.get(nextId)?.events).toMatchObject([
      { id: 'event-1', participantId: 'tab-b', participantSequence: 2 },
    ]);
    expect(store.begin(id, fixture(), createdAt, 'tab-c')).toBe(nextId);
    expect(store.get(nextId)?.participants.map((item) => item.id)).toEqual([
      'tab-b',
      'tab-c',
    ]);
  });

  it('updates a participant visibility state without adding timeline events', () => {
    store.begin(id, fixture(), createdAt, 'tab-a');

    store.updateParticipantState(id, 'tab-a', 'hidden');

    expect(store.get(id)?.participants).toMatchObject([
      { id: 'tab-a', state: 'hidden', status: 'recording' },
    ]);
    expect(store.get(id)?.events).toHaveLength(1);
  });

  it('reconciles the event count when a batched index write was interrupted', () => {
    writeFileSync(
      join(directory, 'index.json'),
      JSON.stringify([
        {
          id,
          startUrl: 'http://localhost:4200/',
          createdAt,
          updatedAt: createdAt,
          status: 'completed',
          version: 2,
          eventCount: 0,
          truncated: false,
          clips: [],
        },
      ]),
    );
    writeFileSync(
      join(directory, `${id}.events.jsonl`),
      `${JSON.stringify({
        id: 'event-1',
        sequence: 1,
        timestamp: 1,
        kind: 'craft',
        phase: 'started',
      })}\n`,
    );

    store = new DebugSessionStore(directory);

    expect(store.list()[0]?.eventCount).toBe(1);
  });

  it('deletes a session and its event file from the local archive', () => {
    store.begin(id, fixture(), createdAt);

    expect(store.delete(id)).toBe(true);
    expect(store.delete(id)).toBe(false);
    expect(store.get(id)).toBeUndefined();
    expect(store.list()).toHaveLength(0);
    expect(readFileSync(join(directory, 'index.json'), 'utf8')).not.toContain(
      id,
    );
  });

  it('expires old sessions and keeps the archive under its session limit', () => {
    store.close();
    store = new DebugSessionStore(directory, { maxAgeMs: 1_000 });
    store.begin(id, fixture(), '2020-01-01T00:00:00.000Z');
    expect(store.list()).toHaveLength(0);

    store.close();
    store = new DebugSessionStore(directory, { maxSessions: 1 });
    const firstId = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5678';
    const secondId = '23e5a8e0-3f2c-4b09-a9fa-6b78ed0c5679';
    const now = Date.now();
    store.begin(firstId, fixture(), new Date(now).toISOString());
    store.begin(secondId, fixture(), new Date(now + 1_000).toISOString());

    expect(store.list().map((session) => session.id)).toEqual([secondId]);
    expect(store.get(firstId)).toBeUndefined();
  });

  it('keeps every event beyond the former retention limit without truncating', () => {
    store.begin(id, fixture(), createdAt);
    for (let sequence = 3; sequence <= 503; sequence += 1) {
      store.append(
        id,
        {
          id: `event-${sequence}`,
          sequence,
          timestamp: sequence,
          kind: 'craft',
          phase: 'started',
        },
        [],
        false,
      );
    }

    expect(store.list()[0]).toMatchObject({
      eventCount: 502,
      truncated: false,
    });
    expect(store.get(id)?.events).toHaveLength(502);
  });

  it('appends a history batch once, preserving every participant sequence', () => {
    store.begin(id, { ...fixture(), events: [] }, createdAt, 'tab-a');
    const events = Array.from({ length: 250 }, (_, index) => ({
      id: `batch-${index + 1}`,
      sequence: index + 1,
      timestamp: Date.parse(createdAt) + index,
      kind: 'craft',
      phase: 'started',
    }));

    store.appendBatch(
      id,
      events.slice(0, 125),
      [
        {
          id: 'long-clip',
          label: 'Long recording',
          startedAt: Date.parse(createdAt),
          eventIds: events.slice(0, 125).map((event) => event.id),
        },
      ],
      false,
      'tab-a',
    );
    store.appendBatch(
      id,
      events.slice(125),
      [
        {
          id: 'long-clip',
          label: 'Long recording',
          startedAt: Date.parse(createdAt),
          eventIds: events.slice(125).map((event) => event.id),
        },
      ],
      false,
      'tab-a',
    );
    store.appendBatch(id, events, [], false, 'tab-a');

    expect(store.list()[0]).toMatchObject({
      eventCount: 250,
      truncated: false,
    });
    expect(store.get(id)?.events).toHaveLength(250);
    expect(store.get(id)?.events[249]).toMatchObject({
      id: 'batch-250',
      sequence: 250,
      participantSequence: 250,
    });
    expect(
      store
        .get(id)
        ?.clips.find(
          (clip) =>
            typeof clip === 'object' &&
            clip !== null &&
            'id' in clip &&
            clip.id === 'long-clip',
        ),
    ).toMatchObject({
      eventIds: events.map((event) => event.id),
    });
  });
});
