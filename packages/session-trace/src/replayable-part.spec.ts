import { describe, expect, it } from 'vitest';
import { replayablePart } from './replayable-part.js';

let sequence = 0;
const event = (kind: string, phase: string, extra: Record<string, unknown> = {}) => ({ id: `e${++sequence}`, sequence, kind, phase, ...extra });
const click = () => event('dom', 'emitted', { payload: { action: 'click' } });
const boot = () => event('participant', 'emitted', { participantId: 'tab', payload: { initial: true } });

describe('replayablePart', () => {
  it('gives a session that finished back as it is', () => {
    sequence = 0;
    const session = { events: [boot(), click(), event('http', 'started', { operationId: 'h' }), event('http', 'succeeded', { operationId: 'h' })] };
    expect(replayablePart(session)).toEqual({ session });
  });

  it('leaves out the action whose request never got its answer, and all that follows', () => {
    sequence = 0;
    const events = [boot(), click(), event('http', 'started', { operationId: 'h1' }), event('http', 'succeeded', { operationId: 'h1' }), click(), event('http', 'started', { operationId: 'h2' })];
    const { session, cut } = replayablePart({ events });
    expect(cut).toEqual({ reason: 'missing-result', atSequence: 5 });
    expect(session.events.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('keeps everything before the page was loaded again', () => {
    sequence = 0;
    const events = [boot(), click(), boot(), click()];
    expect(replayablePart({ events }).cut).toEqual({ reason: 'page-reload', atSequence: 3 });
  });

  it('leaves out the action that asked the app to reload', () => {
    sequence = 0;
    const events = [boot(), click(), click(), event('craft', 'started', { payload: { replayInvocation: { address: 'service:BrowserLocationService / method:reload' } } })];
    expect(replayablePart({ events }).cut).toEqual({ reason: 'reload-requested', atSequence: 3 });
  });

  it('moves the cut back so that no kept request loses its answer', () => {
    sequence = 0;
    // The order (3) is answered after the page loads again (5): cutting at 5
    // would keep the order without its answer.
    const events = [boot(), click(), click(), event('http', 'started', { operationId: 'order' }), boot(), event('http', 'succeeded', { operationId: 'order' })];
    const { session, cut } = replayablePart({ events });
    expect(cut).toEqual({ reason: 'page-reload', atSequence: 3 });
    expect(session.events.map((entry) => entry.sequence)).toEqual([1, 2]);
  });
});
