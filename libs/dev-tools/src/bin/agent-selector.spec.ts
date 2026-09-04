import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  type AgentSelectorInput,
  CREATE_AGENT_OPTIONS,
  selectOptionInteractively,
  selectOptionsInteractively,
  selectAgentsInteractively,
} from './agent-selector';

class FakeInput extends EventEmitter {
  isRaw = false;
  isTTY = true;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  setEncoding(): this {
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }
}

class FakeOutput {
  readonly chunks: string[] = [];

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

describe('selectAgentsInteractively', () => {
  it('moves, toggles multiple agents, and confirms in display order', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const resultPromise = selectAgentsInteractively(
      input as AgentSelectorInput,
      output,
    );

    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toEqual([
      'codex',
      'cursor',
      'claude-code',
    ]);
    expect(input.isRaw).toBe(false);
    expect(output.chunks.join('')).toContain('Space toggle');
  });

  it('selects one option with the arrow keys and Enter', async () => {
    const input = new FakeInput();
    const resultPromise = selectOptionInteractively(
      [
        { value: 'plain', label: 'Plain' },
        { value: 'effect', label: 'Effect' },
      ],
      'Frontend runtime:',
      'plain',
      input as AgentSelectorInput,
      new FakeOutput(),
    );

    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', '', { name: 'enter' });

    await expect(resultPromise).resolves.toBe('effect');
  });

  it('keeps at least one item selected when a minimum is configured', async () => {
    const input = new FakeInput();
    const resultPromise = selectOptionsInteractively(
      [
        { value: 'en-US', label: 'English' },
        { value: 'fr-FR', label: 'French' },
      ],
      'Locales:',
      ['en-US'],
      input as AgentSelectorInput,
      new FakeOutput(),
      1,
    );

    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'enter' });

    await expect(resultPromise).resolves.toEqual(['en-US']);
  });

  it('keeps Codex selected by default and allows an empty selection', async () => {
    const input = new FakeInput();
    const resultPromise = selectAgentsInteractively(
      input as AgentSelectorInput,
      new FakeOutput(),
    );

    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'enter' });

    await expect(resultPromise).resolves.toEqual([]);
  });

  it('offers every supported agent integration', () => {
    expect(CREATE_AGENT_OPTIONS.map((option) => option.value)).toEqual([
      'codex',
      'cursor',
      'claude-code',
    ]);
    expect(CREATE_AGENT_OPTIONS.map((option) => option.label)).toEqual([
      'Codex',
      'Cursor',
      'Claude Code',
    ]);
  });
});
