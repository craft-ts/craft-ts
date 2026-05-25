import { describe, expect, it } from 'vitest';
import type { CallStartEvent } from '../event-types';
import { DevToolsRingBuffer } from './ring-buffer';

function makeEvent(id: string): CallStartEvent {
  return {
    kind: 'call:start',
    id,
    hostTag: ['method:foo'],
    primitiveKind: 'method',
    name: 'foo',
    args: [],
    correlation: null,
    startedAt: 0,
  };
}

describe('DevToolsRingBuffer', () => {
  it('appends events and exposes them via signal', () => {
    const buffer = new DevToolsRingBuffer();
    buffer.push(makeEvent('a'));
    buffer.push(makeEvent('b'));
    expect(buffer.events().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('evicts oldest when capacity is reached', () => {
    const buffer = new DevToolsRingBuffer();
    buffer.setCapacity(2);
    buffer.push(makeEvent('a'));
    buffer.push(makeEvent('b'));
    buffer.push(makeEvent('c'));
    expect(buffer.events().map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('clears events', () => {
    const buffer = new DevToolsRingBuffer();
    buffer.push(makeEvent('a'));
    buffer.clear();
    expect(buffer.events()).toEqual([]);
  });

  it('reducing capacity trims existing events', () => {
    const buffer = new DevToolsRingBuffer();
    buffer.push(makeEvent('a'));
    buffer.push(makeEvent('b'));
    buffer.push(makeEvent('c'));
    buffer.setCapacity(2);
    expect(buffer.events().map((e) => e.id)).toEqual(['b', 'c']);
  });
});
