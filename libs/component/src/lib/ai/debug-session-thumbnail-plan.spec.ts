import { describe, expect, it } from 'vitest';
import type { SendContextEvent } from '@craft-ts/core';
import { planThumbnailCapturePoints } from './debug-session-thumbnail-plan';

let sequence = 0;
function event(
  overrides: Partial<SendContextEvent> & Pick<SendContextEvent, 'kind' | 'phase'>,
  atMs: number,
): SendContextEvent {
  sequence += 1;
  return {
    id: `e${sequence}`,
    sequence,
    timestamp: 1_000_000 + atMs,
    elapsedMs: atMs,
    ...overrides,
  };
}

const click = (atMs: number, participantId?: string) =>
  event(
    {
      kind: 'dom',
      phase: 'emitted',
      name: 'click',
      payload: { action: 'click', selector: 'button' },
      ...(participantId ? { participantId } : {}),
    },
    atMs,
  );
const hover = (atMs: number) =>
  event({ kind: 'hover', phase: 'emitted', name: 'hover' }, atMs);
const navigationEnd = (atMs: number, participantId?: string) =>
  event(
    {
      kind: 'navigation',
      phase: 'succeeded',
      name: 'NavigationEnd',
      ...(participantId ? { participantId } : {}),
    },
    atMs,
  );
const craftCall = (atMs: number) =>
  event({ kind: 'craft', phase: 'succeeded', name: 'method:save' }, atMs);

describe('planThumbnailCapturePoints', () => {
  it('has nothing to show for a recording without actions', () => {
    expect(planThumbnailCapturePoints([])).toEqual([]);
    expect(
      planThumbnailCapturePoints([navigationEnd(0), craftCall(10)]),
    ).toEqual([]);
  });

  it('opens with the start and closes with the end', () => {
    const points = planThumbnailCapturePoints([click(0), click(5_000)]);
    expect(points.map((point) => point.replayIndex)).toEqual([0, 2]);
    expect(points[0]?.reasons).toEqual(['start']);
    expect(points[1]?.reasons).toContain('end');
  });

  it('keeps the actions followed by a navigation or a Craft call', () => {
    const points = planThumbnailCapturePoints([
      click(0),
      navigationEnd(50),
      hover(4_000),
      hover(6_000),
      click(9_000),
      craftCall(9_100),
      hover(14_000),
    ]);
    expect(points.map((point) => point.replayIndex)).toEqual([0, 1, 4, 5]);
    expect(points[1]?.reasons).toEqual(['navigation', 'interaction']);
    expect(points[2]?.reasons).toEqual(['craft', 'interaction']);
    expect(points[2]?.eventId).toBeDefined();
  });

  it('ignores signals from another tab than the one that acted', () => {
    const points = planThumbnailCapturePoints([
      click(0, 'a'),
      navigationEnd(50, 'b'),
      click(10_000, 'a'),
    ]);
    expect(points.map((point) => point.replayIndex)).toEqual([0, 2]);
  });

  it('merges moments closer than the gap into the later one', () => {
    const points = planThumbnailCapturePoints([
      click(0),
      navigationEnd(10),
      click(300),
      craftCall(310),
      click(8_000),
    ]);
    expect(points.map((point) => point.replayIndex)).toEqual([0, 2, 3]);
    expect(points[1]?.reasons).toEqual(
      expect.arrayContaining(['navigation', 'craft']),
    );
  });

  it('drops the least telling moments first beyond the limit', () => {
    const events: SendContextEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(click(i * 5_000));
      events.push(i % 3 === 0 ? navigationEnd(i * 5_000 + 10) : craftCall(i * 5_000 + 10));
    }
    const points = planThumbnailCapturePoints(events, { maxPoints: 6 });
    expect(points).toHaveLength(6);
    expect(points[0]?.replayIndex).toBe(0);
    expect(points.at(-1)?.replayIndex).toBe(10);
    const navigations = points.filter((point) =>
      point.reasons.includes('navigation'),
    );
    expect(navigations.length).toBeGreaterThanOrEqual(3);
  });

  it('measures time from the first action', () => {
    const points = planThumbnailCapturePoints([click(2_000), click(7_500)]);
    expect(points.map((point) => point.offsetMs)).toEqual([0, 5_500]);
  });
});
