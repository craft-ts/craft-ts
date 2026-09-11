import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LayoutDigest } from '../digest.ts';
import { buildReviewQueue } from './queue.ts';
import {
  writeReviewIterationHandoff,
  type ReviewIterationOptions,
} from './handoff.ts';
import { startReviewServer } from './server.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const digest = (): LayoutDigest => ({
  digestVersion: 1,
  nodes: [],
  signature: {
    columns: {},
    lines: {},
    wrapped: [],
    clipped: [],
    scrollbars: [],
    overlaps: [],
  },
});

describe('review iteration handoff', () => {
  it('writes project-specific feedback and a Codex prompt for rejected cards', async () => {
    const root = await mkdtemp('/tmp/craft-review-handoff-');
    roots.push(root);
    const reportPath = join(root, '.craft', 'runs', 'design-system.json');
    const options: ReviewIterationOptions = {
      rootDir: root,
      reportPath,
      ledgerPath: join(root, '.craft', 'attestations.jsonl'),
      evidenceDirectory: join(root, '.craft', 'evidence'),
      tsconfigPath: join(root, 'apps', 'demo', 'tsconfig.graph.json'),
      regenerationScript: 'attest:visual:capture',
      now: () => '2026-09-08T10:00:00.000Z',
    };
    const queue = buildReviewQueue([
      {
        subject: 'visual:component:apps/demo/src/card.ts:Card#base',
        reason: 'the output changed',
        digest: digest(),
        approved: digest(),
        evidence: '0123456789abcdef0123456789abcdef',
        image: 'abcdef0123456789abcdef0123456789',
        snapshot: 'fedcba9876543210fedcba9876543210',
        previousDecision: {
          verdict: 'rejected',
          by: 'romain',
          at: '2026-09-08T09:00:00.000Z',
          note: 'The title is unreadable on the dark variant.',
          findings: [{ path: 'card/title', note: 'Contrast is too low.' }],
        },
      },
      {
        subject: 'visual:component:apps/demo/src/other.ts:Other#base',
        reason: 'the output changed',
        digest: digest(),
        approved: digest(),
        previousDecision: {
          verdict: 'ok',
          by: 'romain',
          at: '2026-09-08T09:00:00.000Z',
        },
      },
    ]);

    const result = await writeReviewIterationHandoff(queue.cards, options);
    const markdown = await readFile(result.feedbackPath, 'utf8');
    const json = JSON.parse(
      await readFile(result.feedbackJsonPath, 'utf8'),
    ) as {
      project: { report: string; tsconfig: string; regenerationScript: string };
      rejectedCards: { sourcePaths: string[]; findings: { path: string }[] }[];
    };
    const prompt = await readFile(result.promptPath, 'utf8');

    expect(result.rejectedCards).toBe(1);
    expect(markdown).toContain('apps/demo/src/card.ts');
    expect(markdown).toContain('The title is unreadable on the dark variant.');
    expect(markdown).toContain('card/title');
    expect(json.project).toMatchObject({
      report: '.craft/runs/design-system.json',
      tsconfig: 'apps/demo/tsconfig.graph.json',
      regenerationScript: 'attest:visual:capture',
    });
    expect(json.rejectedCards[0]).toMatchObject({
      sourcePaths: ['apps/demo/src/card.ts'],
      findings: [{ path: 'card/title' }],
    });
    expect(prompt).toContain('.craft/runs/design-system.review-feedback.md');
    expect(prompt).toContain('npm run attest:visual:capture');
  });

  it('exposes an in-progress handoff while rejected cards remain in the queue', async () => {
    const root = await mkdtemp('/tmp/craft-review-handoff-server-');
    roots.push(root);
    const options: ReviewIterationOptions = {
      rootDir: root,
      reportPath: join(root, '.craft', 'runs', 'review.json'),
      ledgerPath: join(root, '.craft', 'attestations.jsonl'),
      evidenceDirectory: join(root, '.craft', 'evidence'),
      now: () => '2026-09-08T10:00:00.000Z',
    };
    const queue = buildReviewQueue([
      {
        subject: 'visual:component:apps/demo/src/card.ts:Card#base',
        reason: 'the output changed',
        digest: digest(),
        approved: digest(),
        previousDecision: {
          verdict: 'rejected',
          by: 'romain',
          at: '2026-09-08T09:00:00.000Z',
          note: 'The title is unreadable.',
        },
      },
    ]);
    const running = await startReviewServer({
      port: 0,
      cards: queue.cards,
      model: {
        visualAssets: [],
        visualTests: [],
        templateObligations: [],
        diagnostics: [],
      },
      iteration: options,
    });

    try {
      const review = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as { iteration?: unknown; cards: readonly unknown[] };
      expect(review.iteration).toBeDefined();
      expect(review.cards).toHaveLength(1);

      const handoff = (await fetch(`${running.url}/api/iteration-handoff`, {
        method: 'POST',
      }).then((response) => response.json())) as { rejectedCards: number };
      expect(handoff.rejectedCards).toBe(1);
    } finally {
      await running.close();
    }
  });

  it('prints the handoff through the close callback and stops the server', async () => {
    const root = await mkdtemp('/tmp/craft-review-close-server-');
    roots.push(root);
    const options: ReviewIterationOptions = {
      rootDir: root,
      reportPath: join(root, '.craft', 'runs', 'review.json'),
      ledgerPath: join(root, '.craft', 'attestations.jsonl'),
      evidenceDirectory: join(root, '.craft', 'evidence'),
      now: () => '2026-09-08T10:00:00.000Z',
    };
    const queue = buildReviewQueue([
      {
        subject: 'visual:component:apps/demo/src/card.ts:Card#base',
        reason: 'the output changed',
        digest: digest(),
        approved: digest(),
        previousDecision: {
          verdict: 'rejected',
          by: 'romain',
          at: '2026-09-08T09:00:00.000Z',
          note: 'Fix the title contrast.',
        },
      },
    ]);
    let resolveClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    let prompt = '';
    const running = await startReviewServer({
      port: 0,
      cards: queue.cards,
      model: {
        visualAssets: [],
        visualTests: [],
        templateObligations: [],
        diagnostics: [],
      },
      iteration: options,
      onClose: (handoff) => {
        prompt = handoff?.prompt ?? '';
        resolveClosed();
      },
    });

    const response = await fetch(`${running.url}/api/close-review`, {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      closed: true,
      rejectedCards: 1,
    });
    await closed;
    expect(prompt).toContain('# Codex iteration prompt');
    const deadline = Date.now() + 1_000;
    while (running.server.listening && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(running.server.listening).toBe(false);
    await running.close();
  });
});
